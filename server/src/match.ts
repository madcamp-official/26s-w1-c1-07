/**
 * 서버 권위 매치 러너 (BUILD_PLAN D3·D4·D7·D8).
 *  · 매치 = 3라운드, 라운드마다 게임 랜덤(서로 다른 것 우선) + 역할 랜덤.
 *  · 라운드 자동 카운트다운 → 서버 고정틱 루프(create/step) → game:state 브로드캐스트.
 *  · 끊겨도 서버가 끝까지 연산(입력만 멈춤). 매치 종료 시 game_match+game_round INSERT → match:end.
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
  type Role,
  type SlotResult,
} from '@madpump/shared'
import { createState, projectState, rewriteCodeForRole, stepState } from './game-adapter'
import { persistMatch, type RoundRecord } from './db'
import type { Room } from './rooms'
import type { MatchRuntime } from './match-types'

const TICK_MS = 16 // ~60Hz 서버 틱(클라 rAF와 맞춰 온라인 렌더 부드럽게 — 30Hz는 빠른 게임에서 끊겨 보임)
const DT = TICK_MS / 1000
const GAME_DURATION = 10
const COUNTDOWN_MS = 3000
const ROUND_GAP_MS = 2500 // round:end 후 다음 라운드까지
const TOTAL_ROUNDS = 3

interface Participant {
  userId: string
  dbId: bigint
  socketId: string
  nickname: string
  imageUrl: string | null
}

export class MatchRunner implements MatchRuntime {
  readonly matchId: string
  private io: Server
  private room: Room
  private a: Participant
  private b: Participant
  private roundResults: RoundRecord[] = []
  private currentRound = 0
  private usedGames: GameId[] = []
  // 현재 라운드 런타임
  private gameId: GameId = 1
  private roleOfA: Role = 'P1'
  private state: ReturnType<typeof createState> | null = null
  private inputQueue: GameInputEvent[] = []
  private seq = 0
  private timer: NodeJS.Timeout | null = null
  private elapsed = 0
  private stopped = false

  constructor(io: Server, room: Room, a: Participant, b: Participant) {
    this.io = io
    this.room = room
    this.a = a
    this.b = b
    this.matchId = `m_${randomInt(0x100000, 0xffffff).toString(16)}`
    // 색상(역할)은 매치 시작 때 한 번만 정한다 — 이 매치의 모든 라운드에서 A/B가 같은 역할(색) 유지.
    this.roleOfA = randomInt(0, 2) === 0 ? 'P1' : 'P2'
  }

  start(): void {
    // 각 플레이어에게 개별 match:start (상대 정보)
    this.io.to(this.a.socketId).emit(EV.matchStart, {
      matchId: this.matchId,
      you: 'A',
      totalRounds: TOTAL_ROUNDS,
      opponent: { nickname: this.b.nickname, imageUrl: this.b.imageUrl },
    })
    this.io.to(this.b.socketId).emit(EV.matchStart, {
      matchId: this.matchId,
      you: 'B',
      totalRounds: TOTAL_ROUNDS,
      opponent: { nickname: this.a.nickname, imageUrl: this.a.imageUrl },
    })
    this.beginRound()
  }

  private pickGame(): GameId {
    // 아직 안 쓴 게임 우선(서로 다른 것), 다 썼으면 전체에서
    const pool = ALL_GAME_IDS.filter((g) => !this.usedGames.includes(g))
    const from = pool.length ? pool : ALL_GAME_IDS
    const g = from[randomInt(0, from.length)]
    this.usedGames.push(g)
    return g
  }

  private beginRound(): void {
    if (this.stopped) return
    this.gameId = this.pickGame()
    // roleOfA(색)는 매치 시작 때 고정됨 — 라운드마다 재배정하지 않는다.
    const roleOfB: Role = this.roleOfA === 'P1' ? 'P2' : 'P1'
    const round = this.currentRound + 1

    this.io.to(this.a.socketId).emit(EV.roundStart, {
      matchId: this.matchId,
      round,
      gameId: this.gameId,
      role: this.roleOfA,
      countdownMs: COUNTDOWN_MS,
    })
    this.io.to(this.b.socketId).emit(EV.roundStart, {
      matchId: this.matchId,
      round,
      gameId: this.gameId,
      role: roleOfB,
      countdownMs: COUNTDOWN_MS,
    })

    // 카운트다운 후 시뮬 시작
    setTimeout(() => this.runRound(), COUNTDOWN_MS)
  }

  private runRound(): void {
    if (this.stopped) return
    const rand = () => randomInt(0, 0x100000000) / 0x100000000
    this.state = createState(this.gameId, rand)
    this.inputQueue = []
    this.elapsed = 0
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  private tick(): void {
    if (this.stopped || !this.state) return
    const events = this.inputQueue
    this.inputQueue = []
    this.state = stepState(this.gameId, this.state, events, DT)
    this.elapsed += DT

    // 상태 투영 브로드캐스트 (seq 단조증가)
    const msg = {
      matchId: this.matchId,
      round: this.currentRound + 1,
      seq: this.seq++,
      state: projectState(this.state),
    }
    this.io.to(this.a.socketId).emit(EV.gameState, msg)
    this.io.to(this.b.socketId).emit(EV.gameState, msg)

    const done = this.state.result !== null || this.elapsed >= GAME_DURATION + 0.5
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

    const wins = { P1: 0, P2: 0 }
    // 표시용 라운드 승수(역할 기준) — 간단히 슬롯→역할 역산은 생략, 클라 표시는 slot 기반
    this.io.to(this.a.socketId).emit(EV.roundEnd, {
      matchId: this.matchId,
      round: this.currentRound + 1,
      result: roleResult,
      wins,
    })
    this.io.to(this.b.socketId).emit(EV.roundEnd, {
      matchId: this.matchId,
      round: this.currentRound + 1,
      result: roleResult,
      wins,
    })

    this.currentRound += 1
    if (this.currentRound >= TOTAL_ROUNDS) {
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
      console.error('[match] persist 실패', err)
    }

    const end = { matchId: this.matchId, result, recordedMatchId, playedAt }
    this.io.to(this.a.socketId).emit(EV.matchEnd, end)
    this.io.to(this.b.socketId).emit(EV.matchEnd, end)

    // 방 정리 (대기 상태로 복귀)
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
    // cell(오목 등에서 클라가 고른 칸)은 그대로 통과 — 코어가 유효성(내 턴·빈칸)을 검증한다.
    this.inputQueue.push({ code, type: ev.type, t: ev.t, cell: ev.cell })
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

export type { Participant }
// GAME_CORES import 유지용(트리셰이크 방지 아님 — 실제 사용은 game-adapter)
void GAME_CORES
