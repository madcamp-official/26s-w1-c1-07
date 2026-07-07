/**
 * MADPUMP socket unified envelope — client/server shared contract (BUILD_PLAN D7·D8·D9).
 *
 * Principle: input is a single game-agnostic event (game:input), state is a per-game projection (game:state).
 * Adding a new game does not change this file.
 */
import type { GameInputEvent, GameResult } from '../games/types'
import type { GameId } from '../games/registry'

/** DB storage notation (based on match slot). Differs from GameResult('P1'/'P2') — server translates role→slot */
export type SlotResult = 'A_WIN' | 'B_WIN' | 'DRAW'

/** GameResult(round role winner) + role assignment → slot result translation.
 * roleOfA = the role playerA holds in this round ('P1'|'P2'). */
export function toSlotResult(r: GameResult, roleOfA: 'P1' | 'P2'): SlotResult {
  if (r === 'DRAW' || r === null) return 'DRAW'
  return r === roleOfA ? 'A_WIN' : 'B_WIN'
}

// ── Session/Lobby ────────────────────────────────────────────────
export interface MeInfo {
  id: string
  nickname: string
  imageUrl: string | null
}

export type Role = 'P1' | 'P2'
export type RoomStatus = 'waiting' | 'in_match'

export interface RoomMemberView {
  userId: string
  nickname: string
  role: Role
  ready: boolean
}

export interface RoomSnapshot {
  code: string
  status: RoomStatus
  hostUserId: string
  rounds: number
  members: RoomMemberView[]
}

// ── Match/Round ─────────────────────────────────────────────
export interface OpponentView {
  nickname: string
  imageUrl: string | null
}

/** Player color — bound to the 'player' rather than the role (P1/P2), fixed per match. The renderer paints with this color. */
export type PlayerColor = 'blue' | 'red'

/** match:start — sent individually to each player (includes their own slot) */
export interface MatchStartMsg {
  matchId: string
  you: 'A' | 'B' // match-fixed slot (for win/loss judging). Per-round role (P1/P2) comes in round:start
  totalRounds: number
  opponent: OpponentView
  /** My color (match-fixed). Independent of role — attack/defense roles are random each match, so color is not the role. */
  yourColor: PlayerColor
  /** Opponent color (match-fixed) */
  oppColor: PlayerColor
  /**
   * Slot-machine result (server draw) — **one reel per round**, so length = totalRounds (9).
   * Game of round r (1-based) = slotGames[r-1]. A single game appears in at most 3 of the 9 rounds.
   * `null` = a **hidden ("?") round** — 3 of rounds 5~9 are concealed on the slot screen and only
   * revealed by round:start when that round begins (the server never leaks the hidden games here).
   * The client uses this for the slot animation (9 reels in a row, sequential stop at 0.2s intervals).
   */
  slotGames: (GameId | null)[]
  /** Coins I bet on this match */
  yourBet: number
  /** Coins the opponent bet */
  oppBet: number
  /** true if my bet was my entire balance → show ALL-IN on the VS screen */
  yourAllIn: boolean
  /** true if the opponent's bet was their entire balance */
  oppAllIn: boolean
}

/** round:start — announces this round's game type (role is random each round, so it's carried here) */
export interface RoundStartMsg {
  matchId: string
  round: number // 1-based
  gameId: GameId
  role: Role // my role in this round (P1/P2)
  /**
   * Pre-play window (ms) the client fills with: "ROUND n" banner → (guide) → "2·1·START" countdown.
   * Variable: longer when the guide shows. The server starts the sim exactly after this window.
   */
  countdownMs: number
  /** true if this game type appears for the **first time in the match** → show the how-to-play guide (repeat games skip it). */
  showGuide: boolean
}

/** [C→S] game:input — unified input envelope */
export interface GameInputMsg {
  matchId: string
  code: GameInputEvent['code'] // server rewrites by role (anti-spoofing)
  type: GameInputEvent['type']
  t: number
  /** (optional) Cell index the client picked with a local cursor, like in Gomoku. The server validates only legality (my turn · empty cell). */
  cell?: number
}

/** [S→C] game:state — render projection (seed etc. not sent) */
export interface GameStateMsg {
  matchId: string
  round: number
  seq: number
  state: unknown // per-game view (seed removed). The client interprets the type by gameId
}

/** round:end */
export interface RoundEndMsg {
  matchId: string
  round: number
  result: GameResult // winner of that round's role (kept for reference; role is random each round)
  /**
   * Winner in the **match-fixed identity** = player color (blue/red), null on a draw.
   * Display maps color → side: blue = P1 (cyan/left), red = P2 (pink/right). Stable across the whole match.
   */
  winnerColor: PlayerColor | null
  /** Cumulative round wins by player color (for the round-result overlay + HUD lamps). */
  wins: { blue: number; red: number }
}

/** [C→S] Bet amount carried on queue:join / room:create / room:join (integer within the held-coin limit) */
export interface BetPayload {
  bet: number
}

/** match:end — only after the game_match INSERT commits. Sent individually per player (includes coin settlement result) */
export interface MatchEndMsg {
  matchId: string
  result: SlotResult // match final (slot-based)
  recordedMatchId: string // game_match.id
  playedAt: string
  /** My coin change from this match (quick start: ±own bet / code room: winner +loser's bet) */
  coinDelta: number
  /** My held coins after settlement */
  coinBalance: number
  /**
   * Rematch eligibility — non-null only when I'm the loser and can request one (docs/ONLINE_MATCH.md):
   *  · not a draw · not the rematch requester of the previous match (no consecutive requests) · held ≥ 1 after settlement
   *  · stake = min(my previous bet × 2, held after settlement) — if it can't double, ALL-IN
   */
  revenge: { stake: number; allIn: boolean } | null
}

export interface MatchAbortedMsg {
  matchId: string
  reason: 'OPPONENT_LEFT'
}

// ── Rematch (docs/ONLINE_MATCH.md) ───────────────────────────
/** [S→C winner] revenge:offer — rematch offer requested by the loser */
export interface RevengeOfferMsg {
  /** Requester (previous loser) nickname */
  fromNickname: string
  /** Coins I'll stake if I accept = min(my previous bet × 2, current held) */
  yourStake: number
  /** true if my stake is my entire balance (ALL-IN) */
  yourAllIn: boolean
  /** Coins the requester will stake */
  oppStake: number
  oppAllIn: boolean
  /** Auto-decline if no response within this time (ms) */
  timeoutMs: number
}

/** [S→C both sides] revenge:result — whether the rematch is on. If accepted=true, match:start follows immediately */
export interface RevengeResultMsg {
  accepted: boolean
  /** Decline reason (when accepted=false) */
  reason?: 'DECLINED' | 'TIMEOUT' | 'CANCELLED' | 'UNAVAILABLE'
}

/** Socket ack convention */
export type Ack<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

/** Event-name constants (typo prevention) */
export const EV = {
  hello: 'lobby:hello',
  lobbyError: 'lobby:error',
  roomCreate: 'room:create',
  roomJoin: 'room:join',
  roomConfigure: 'room:configure',
  roomReady: 'room:ready',
  roomStart: 'room:start',
  roomLeave: 'room:leave',
  roomState: 'room:state',
  queueJoin: 'queue:join',
  queueLeave: 'queue:leave',
  queueMatched: 'queue:matched',
  matchStart: 'match:start',
  matchGo: 'match:go',
  roundStart: 'round:start',
  gameInput: 'game:input',
  gameState: 'game:state',
  gameReject: 'game:reject',
  roundEnd: 'round:end',
  matchEnd: 'match:end',
  matchAborted: 'match:aborted',
  // Rematch
  revengeRequest: 'revenge:request', // C→S (loser, ack)
  revengeOffer: 'revenge:offer', // S→C (winner)
  revengeRespond: 'revenge:respond', // C→S (winner, { accept })
  revengeCancel: 'revenge:cancel', // C→S (loser — cancel while waiting)
  revengeResult: 'revenge:result', // S→C (both sides)
} as const
