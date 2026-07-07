/**
 * Server-authoritative match runner (BUILD_PLAN D3·D4·D7·D8).
 *  · Match = 9 rounds; one slot-reel game per round (round r = slotGames[r-1]) + random roles each round.
 *  · Per-round pre-play window ("ROUND n" → guide → countdown) → server fixed-tick loop (create/step) → game:state broadcast.
 *  · Even if disconnected, the server computes to the end (only input stops). On match end, INSERT game_match+game_round → match:end.
 */
import { randomInt } from 'node:crypto'
import type { Server } from 'socket.io'
import {
  ALL_GAME_IDS,
  EV,
  GAME_CORES,
  toSlotResult,
  type GameId,
  type GameInputEvent,
  type GameResult,
  type PlayerColor,
  type Role,
  type SlotResult,
} from '@madcade/shared'
import { createState, projectState, rewriteCodeForRole, stepState } from './game-adapter'
import { persistMatch, settleCoins, type RoundRecord } from './db'
import type { Room } from './rooms'
import type { MatchRuntime } from './match-types'

// Separate simulation (compute) from broadcast (transmit).
//  · SIM_HZ       = game-step compute rate (physics/judgement precision). Higher = more accurate.
//  · BROADCAST_HZ = state transmit rate (network/client render load). Lower = lighter (less lag).
// Transmit happens once every BROADCAST_EVERY ticks, not every tick. (Remaining gap/jitter is covered by client interpolation/extrapolation.)
// With only 2 players there's no bandwidth pressure, so we bumped transmit to 60Hz — snapshot interval 33ms→16ms tightens stutter.
const SIM_HZ = 60
const BROADCAST_HZ = 60
const TICK_MS = Math.round(1000 / SIM_HZ) // ≈16ms — compute tick interval
const DT = TICK_MS / 1000
const BROADCAST_EVERY = Math.max(1, Math.round(SIM_HZ / BROADCAST_HZ)) // 1 → transmit every tick = 60Hz
const GAME_DURATION = 10
// The timing constants below are shortened via env only in E2E tests (production defaults unchanged).
// Per-round pre-play window the client fills with "ROUND n" banner → (guide) → "2·1·START" countdown.
// countdownMs sent on round:start = BANNER + (showGuide ? GUIDE : 0) + COUNTDOWN; the server starts the sim after it.
const PRE_BANNER_MS = Number(process.env.MATCH_BANNER_MS ?? 1000) // "ROUND n" banner
const PRE_GUIDE_MS = Number(process.env.MATCH_GUIDE_MS ?? 3000) // how-to-play guide (only on a game's first appearance in the match)
const PRE_COUNTDOWN_MS = Number(process.env.MATCH_COUNTDOWN_MS ?? 2000) // "2·1·START" numeric countdown
// Round-result overlay (winner + score) shows for this long, then auto-advances to the next round.
const ROUND_GAP_MS = Number(process.env.MATCH_ROUND_GAP_MS ?? 3000)
/** Online matches are always 9 rounds — one slot reel per round (round r = slotGames[r-1]). */
const TOTAL_ROUNDS = 9
/** A single game may fill at most this many of the 9 rounds. */
const MAX_PER_GAME = 3
/** Of rounds 5~9 (0-based indices 4~8), this many are concealed as a "?" reel on the slot screen. */
const HIDDEN_ROUND_COUNT = 3
/**
 * Wait from match:start until round 1's round:start.
 * Client sequence: VS matchup ~2s → slot spin → 9 reels stop by ≈4.6s (all slots locked) → confirmed board held 3s.
 * = the 9 slots lock in at ≈4.6s, then Round 1 starts exactly 3.0s later (4.6s + 3.0s = 7.6s). Keep in sync with MatchIntro.tsx.
 */
const INTRO_MS = Number(process.env.MATCH_INTRO_MS ?? 7600)

/**
 * Draw the 9 slot-reel games (one per round) from a candidate pool.
 * Each game appears in at most MAX_PER_GAME (3) of the 9 rounds. If the pool is too small to honor that
 * (e.g. a code room with only 1~2 games checked), the cap is relaxed so all 9 rounds still fill.
 */
function drawSlotGames(rawPool: GameId[]): GameId[] {
  const pool = [...new Set(rawPool.filter((g) => ALL_GAME_IDS.includes(g)))]
  const from = pool.length ? pool : [...ALL_GAME_IDS]
  const cap = new Map<GameId, number>(from.map((g) => [g, MAX_PER_GAME]))
  const out: GameId[] = []
  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    let cands = from.filter((g) => (cap.get(g) ?? 0) > 0)
    if (cands.length === 0) {
      // pool too small to keep ≤3 each — relax the cap and allow more repeats
      from.forEach((g) => cap.set(g, MAX_PER_GAME))
      cands = from
    }
    const g = cands[randomInt(0, cands.length)]
    out.push(g)
    cap.set(g, (cap.get(g) ?? 0) - 1)
  }
  return out
}

interface Participant {
  userId: string
  dbId: bigint
  socketId: string
  nickname: string
  imageUrl: string | null
  /** Coins staked on this match (verified at join time) */
  bet: number
  /** true if the bet = entire balance at join time (ALL-IN badge on the VS screen) */
  allIn: boolean
}

export class MatchRunner implements MatchRuntime {
  readonly matchId: string
  private io: Server
  private room: Room
  private a: Participant
  private b: Participant
  private roundResults: RoundRecord[] = []
  private currentRound = 0
  private totalRounds = TOTAL_ROUNDS // always 9 (independent of settings)
  /** Slot machine — one game per round (length 9). Round r game = slotGames[r-1]. */
  private slotGames: GameId[]
  /** 0-based round indices (from 4~8 = rounds 5~9) shown as a hidden "?" reel on the slot screen. */
  private hiddenRounds: Set<number> = new Set()
  /** Cumulative round wins by player color (for round:end display + HUD lamps). */
  private colorWins: { blue: number; red: number } = { blue: 0, red: 0 }
  // Color (bound to the player, fixed per match) — independent of role (roleOfA). Rendering paints with this color.
  private colorOfA: PlayerColor = 'blue'
  private colorOfB: PlayerColor = 'red'
  // Current round runtime
  private gameId: GameId = 1
  private roleOfA: Role = 'P1'
  private state: ReturnType<typeof createState> | null = null
  private inputQueue: GameInputEvent[] = []
  private seq = 0
  private tickCount = 0 // number of sim ticks this round (BROADCAST_EVERY decides the transmit rate)
  private timer: NodeJS.Timeout | null = null
  private introTimer: NodeJS.Timeout | null = null
  private elapsed = 0
  private stopped = false

  constructor(io: Server, room: Room, a: Participant, b: Participant) {
    this.io = io
    this.room = room
    this.a = a
    this.b = b
    this.matchId = `m_${randomInt(0x100000, 0xffffff).toString(16)}`
    // Roles (attack/defense and other game functions) are randomly reassigned each round (beginRound). Here it's only the initial value.
    this.roleOfA = randomInt(0, 2) === 0 ? 'P1' : 'P2'
    // Color is bound to the 'player' (independent of role). Which slot is blue is random per match → regardless of roleOfA,
    // the attacker can end up blue or red (color ≠ role).
    if (randomInt(0, 2) === 0) {
      this.colorOfA = 'blue'
      this.colorOfB = 'red'
    } else {
      this.colorOfA = 'red'
      this.colorOfB = 'blue'
    }
    // Slot machine draw — one game per round (9 total). Candidate pool = room settings checkboxes (quick start = all games).
    this.slotGames = drawSlotGames(room.games ?? [])
    // Conceal 3 of rounds 5~9 (0-based 4~8) as a "?" reel — the game is revealed only when that round starts.
    const hidCandidates = [4, 5, 6, 7, 8]
    for (let i = hidCandidates.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1)
      ;[hidCandidates[i], hidCandidates[j]] = [hidCandidates[j], hidCandidates[i]]
    }
    this.hiddenRounds = new Set(hidCandidates.slice(0, HIDDEN_ROUND_COUNT))
  }

  start(): void {
    // Hidden rounds are masked to null so the slot screen shows "?" (revealed later by round:start).
    const visibleSlots = this.slotGames.map((g, i) => (this.hiddenRounds.has(i) ? null : g))
    // Individual match:start to each player (opponent info + slot results + bet reveal)
    this.io.to(this.a.socketId).emit(EV.matchStart, {
      matchId: this.matchId,
      you: 'A',
      totalRounds: this.totalRounds,
      opponent: { nickname: this.b.nickname, imageUrl: this.b.imageUrl },
      yourColor: this.colorOfA,
      oppColor: this.colorOfB,
      slotGames: visibleSlots,
      yourBet: this.a.bet,
      oppBet: this.b.bet,
      yourAllIn: this.a.allIn,
      oppAllIn: this.b.allIn,
    })
    this.io.to(this.b.socketId).emit(EV.matchStart, {
      matchId: this.matchId,
      you: 'B',
      totalRounds: this.totalRounds,
      opponent: { nickname: this.a.nickname, imageUrl: this.a.imageUrl },
      yourColor: this.colorOfB,
      oppColor: this.colorOfA,
      slotGames: visibleSlots,
      yourBet: this.b.bet,
      oppBet: this.a.bet,
      yourAllIn: this.b.allIn,
      oppAllIn: this.a.allIn,
    })
    // Start round 1 around when the client intro (slot animation → VS bet reveal for 2s) finishes
    this.introTimer = setTimeout(() => this.beginRound(), INTRO_MS)
  }

  private beginRound(): void {
    if (this.stopped) return
    this.gameId = this.slotGames[this.currentRound]
    // Roles (attack/defense) are randomly reassigned each round — in asymmetric games (rocket, dino, etc.) attack/defense
    // swaps every round. Independent of color (which is bound to the player), so you can't tell the role from the color.
    this.roleOfA = randomInt(0, 2) === 0 ? 'P1' : 'P2'
    const roleOfB: Role = this.roleOfA === 'P1' ? 'P2' : 'P1'
    const round = this.currentRound + 1
    // Guide only on a game's first appearance in the match (repeat games skip straight to the countdown).
    const showGuide = this.slotGames.slice(0, this.currentRound).indexOf(this.gameId) === -1
    const countdownMs = PRE_BANNER_MS + (showGuide ? PRE_GUIDE_MS : 0) + PRE_COUNTDOWN_MS

    this.io.to(this.a.socketId).emit(EV.roundStart, {
      matchId: this.matchId,
      round,
      gameId: this.gameId,
      role: this.roleOfA,
      countdownMs,
      showGuide,
    })
    this.io.to(this.b.socketId).emit(EV.roundStart, {
      matchId: this.matchId,
      round,
      gameId: this.gameId,
      role: roleOfB,
      countdownMs,
      showGuide,
    })

    // Start the sim after the full pre-play window (banner + guide + countdown)
    setTimeout(() => this.runRound(), countdownMs)
  }

  private runRound(): void {
    if (this.stopped) return
    const rand = () => randomInt(0, 0x100000000) / 0x100000000
    this.state = createState(this.gameId, rand)
    this.inputQueue = []
    this.elapsed = 0
    this.tickCount = 0
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  private tick(): void {
    if (this.stopped || !this.state) return
    const events = this.inputQueue
    this.inputQueue = []
    this.state = stepState(this.gameId, this.state, events, DT)
    this.elapsed += DT
    this.tickCount++

    const done = this.state.result !== null || this.elapsed >= GAME_DURATION + 0.5

    // Transmit at a lower rate than the sim (every BROADCAST_EVERY ticks). But always send the final frame.
    if (this.tickCount % BROADCAST_EVERY === 0 || done) {
      const msg = {
        matchId: this.matchId,
        round: this.currentRound + 1,
        seq: this.seq++, // transmit order (monotonically increasing) — lets the client ignore out-of-order arrivals
        state: projectState(this.state),
      }
      this.io.to(this.a.socketId).emit(EV.gameState, msg)
      this.io.to(this.b.socketId).emit(EV.gameState, msg)
    }

    if (done) this.endRound()
  }

  private endRound(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const roleResult: GameResult = this.state?.result ?? 'DRAW'
    const slot: SlotResult = toSlotResult(roleResult, this.roleOfA)
    this.roundResults.push({
      roundIndex: this.currentRound,
      gameType: this.gameId,
      result: slot,
    })

    // Winner in match-fixed identity (player color) → increment the color scoreboard for the round overlay + HUD.
    const winnerColor: PlayerColor | null =
      slot === 'A_WIN' ? this.colorOfA : slot === 'B_WIN' ? this.colorOfB : null
    if (winnerColor) this.colorWins[winnerColor] += 1
    const roundEndMsg = {
      matchId: this.matchId,
      round: this.currentRound + 1,
      result: roleResult,
      winnerColor,
      wins: { ...this.colorWins },
    }
    this.io.to(this.a.socketId).emit(EV.roundEnd, roundEndMsg)
    this.io.to(this.b.socketId).emit(EV.roundEnd, roundEndMsg)

    this.currentRound += 1
    if (this.currentRound >= this.totalRounds) {
      setTimeout(() => this.finishMatch(), ROUND_GAP_MS)
    } else {
      setTimeout(() => this.beginRound(), ROUND_GAP_MS)
    }
  }

  private async finishMatch(): Promise<void> {
    if (this.stopped) return
    const aWins = this.roundResults.filter((r) => r.result === 'A_WIN').length
    const bWins = this.roundResults.filter((r) => r.result === 'B_WIN').length
    const result: SlotResult = aWins > bWins ? 'A_WIN' : bWins > aWins ? 'B_WIN' : 'DRAW'

    let recordedMatchId = ''
    let playedAt = new Date().toISOString()
    try {
      recordedMatchId = await persistMatch(this.a.dbId, this.b.dbId, result, this.roundResults)
    } catch (err) {
      console.error('[match] persist failed', err)
    }

    // Coin settlement (shared/src/coins.ts rules):
    //  quick start (quick): winner +own bet / loser -own bet
    //  code room (code):    winner +loser's bet / loser -own bet
    //  Draw: no change
    let deltaA = 0
    let deltaB = 0
    // Settle the code-room zero-sum via transfer so the winner's payout never exceeds what's actually deducted from the loser (review #4).
    let transfer: { amount: number; winnerIsA: boolean } | undefined
    if (result === 'A_WIN') {
      deltaA = this.room.kind === 'quick' ? this.a.bet : this.b.bet
      deltaB = -this.b.bet
      if (this.room.kind === 'code') transfer = { amount: this.b.bet, winnerIsA: true }
    } else if (result === 'B_WIN') {
      deltaB = this.room.kind === 'quick' ? this.b.bet : this.a.bet
      deltaA = -this.a.bet
      if (this.room.kind === 'code') transfer = { amount: this.a.bet, winnerIsA: false }
    }
    let balanceA = 0
    let balanceB = 0
    try {
      const settled = await settleCoins(this.a.dbId, deltaA, this.b.dbId, deltaB, transfer)
      balanceA = settled.a
      balanceB = settled.b
      // Correct the notified values to the actually-applied deltas (transfer / negative clamp may have been applied)
      deltaA = settled.deltaA
      deltaB = settled.deltaB
    } catch (err) {
      console.error('[match] coin settlement failed', err)
      deltaA = 0
      deltaB = 0
    }

    // ── Record the rematch window + loser's eligibility to request (docs/ONLINE_MATCH.md) ──
    //  · Eligibility: not a Draw · not this match's rematch requester (no consecutive requests) · balance ≥ 1 after settlement
    //  · stake = min(previous bet × 2, balance after settlement) — if doubling isn't possible, ALL-IN
    const requesterOfThisMatch = this.room.revengeRequesterUserId ?? null
    let revengeA: { stake: number; allIn: boolean } | null = null
    let revengeB: { stake: number; allIn: boolean } | null = null
    if (result !== 'DRAW') {
      const winner = result === 'A_WIN' ? this.a : this.b
      const loser = result === 'A_WIN' ? this.b : this.a
      const loserBalance = result === 'A_WIN' ? balanceB : balanceA
      this.room.postMatch = {
        winnerUserId: winner.userId,
        loserUserId: loser.userId,
        bets: { [this.a.userId]: this.a.bet, [this.b.userId]: this.b.bet },
        requesterUserId: requesterOfThisMatch,
      }
      if (loser.userId !== requesterOfThisMatch && loserBalance >= 1) {
        const stake = Math.min(loser.bet * 2, loserBalance)
        const rev = { stake, allIn: stake === loserBalance }
        if (result === 'A_WIN') revengeB = rev
        else revengeA = rev
      }
    } else {
      this.room.postMatch = undefined // Draw — no rematch
    }
    this.room.revengeRequesterUserId = null

    const end = { matchId: this.matchId, result, recordedMatchId, playedAt }
    this.io.to(this.a.socketId).emit(EV.matchEnd, { ...end, coinDelta: deltaA, coinBalance: balanceA, revenge: revengeA })
    this.io.to(this.b.socketId).emit(EV.matchEnd, { ...end, coinDelta: deltaB, coinBalance: balanceB, revenge: revengeB })

    // Clean up the room (return to waiting state)
    this.stopped = true
    this.room.status = 'waiting'
    this.room.match = undefined
    for (const m of this.room.members) m.ready = false
  }

  pushInput(userId: string, ev: GameInputEvent): void {
    if (this.stopped || !this.state) return
    const isA = userId === this.a.userId
    if (!isA && userId !== this.b.userId) return
    const role: Role = isA ? this.roleOfA : this.roleOfA === 'P1' ? 'P2' : 'P1'
    const code = rewriteCodeForRole(ev.code, role)
    // cell (the square the client picked, e.g. in Gomoku) passes through as-is — the core validates it (my turn, empty cell).
    this.inputQueue.push({ code, type: ev.type, t: ev.t, cell: ev.cell })
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.introTimer) clearTimeout(this.introTimer)
    this.introTimer = null
  }
}

export type { Participant }
// Keeps the GAME_CORES import (not a tree-shake guard — actual use is in game-adapter)
void GAME_CORES
