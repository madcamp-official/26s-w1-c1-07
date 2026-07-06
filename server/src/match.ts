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
  type PlayerColor,
  type Role,
  type SlotResult,
} from '@madpump/shared'
import { createState, projectState, rewriteCodeForRole, stepState } from './game-adapter'
import { persistMatch, settleCoins, type RoundRecord } from './db'
import type { Room } from './rooms'
import type { MatchRuntime } from './match-types'

// 시뮬(계산)과 브로드캐스트(전송)를 분리한다.
//  · SIM_HZ       = 게임 스텝 계산 주기(물리/판정 정밀도). 높을수록 정확.
//  · BROADCAST_HZ = 상태 전송 주기(네트워크/클라 렌더 부하). 낮을수록 가벼움(렉↓).
// 전송은 매 틱이 아니라 BROADCAST_EVERY 틱마다 1번만. (남은 gap·지터는 클라 보간(외삽)으로 보완)
// 2명 매치라 대역폭 부담이 없어 60Hz 전송으로 상향 — 스냅샷 간격 33ms→16ms로 좁혀 끊김↓.
const SIM_HZ = 60
const BROADCAST_HZ = 60
const TICK_MS = Math.round(1000 / SIM_HZ) // ≈16ms — 계산 틱 간격
const DT = TICK_MS / 1000
const BROADCAST_EVERY = Math.max(1, Math.round(SIM_HZ / BROADCAST_HZ)) // 1 → 매 틱 전송 = 60Hz
const GAME_DURATION = 10
// 아래 타이밍 상수는 E2E 테스트에서만 env로 단축한다(운영 기본값 불변).
const COUNTDOWN_MS = Number(process.env.MATCH_COUNTDOWN_MS ?? 3000)
const ROUND_GAP_MS = Number(process.env.MATCH_ROUND_GAP_MS ?? 2500) // round:end 후 다음 라운드까지
/** 온라인 매치는 항상 9라운드 — 슬롯 3릴 × 3회전 (릴 k = 라운드 k, k+3, k+6) */
const TOTAL_ROUNDS = 9
/**
 * match:start(슬롯 결과·베팅 공개) 후 1라운드 round:start까지의 대기.
 * 클라 연출: 릴 스핀 → 1.2s/1.5s/1.8s 순차 정지(0.3s 간격) → 2.5s부터 VS(베팅 공개) 2초.
 */
const INTRO_MS = Number(process.env.MATCH_INTRO_MS ?? 4700)

interface Participant {
  userId: string
  dbId: bigint
  socketId: string
  nickname: string
  imageUrl: string | null
  /** 이 매치에 건 코인 (참가 시 검증 완료) */
  bet: number
  /** 베팅 = 참가 시점 보유 전액이면 true (VS 화면 ALL-IN 표시) */
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
  private totalRounds = TOTAL_ROUNDS // 항상 9 (설정과 무관)
  /** 슬롯머신 3릴 결과 — 라운드 r 게임 = slotGames[(r-1) % 3] */
  private slotGames: [GameId, GameId, GameId]
  // 색(플레이어 종속, 매치당 고정) — 역할(roleOfA)과 독립. 렌더는 이 색으로 칠한다.
  private colorOfA: PlayerColor = 'blue'
  private colorOfB: PlayerColor = 'red'
  // 현재 라운드 런타임
  private gameId: GameId = 1
  private roleOfA: Role = 'P1'
  private state: ReturnType<typeof createState> | null = null
  private inputQueue: GameInputEvent[] = []
  private seq = 0
  private tickCount = 0 // 이 라운드의 시뮬 틱 수(BROADCAST_EVERY로 전송 주기 결정)
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
    // 역할(공격/수비 등 게임기능)은 라운드마다 랜덤 재배정된다(beginRound). 여기선 초기값만.
    this.roleOfA = randomInt(0, 2) === 0 ? 'P1' : 'P2'
    // 색은 '플레이어'에 종속(역할과 독립). 어느 슬롯이 파랑일지 매치당 랜덤 → roleOfA와 무관하게
    // 공격자가 파랑일 때도 빨강일 때도 생긴다(색≠역할).
    if (randomInt(0, 2) === 0) {
      this.colorOfA = 'blue'
      this.colorOfB = 'red'
    } else {
      this.colorOfA = 'red'
      this.colorOfB = 'blue'
    }
    // 슬롯머신 3릴 추첨 — 방 설정 체크박스가 후보 풀. 풀이 3개 이상이면 서로 다른 3개,
    // 3개 미만이면(호스트가 1~2개만 체크) 그 안에서 중복 허용.
    const pool = (room.games ?? []).filter((g) => ALL_GAME_IDS.includes(g))
    const from = pool.length ? pool : [...ALL_GAME_IDS]
    if (from.length >= 3) {
      const shuffled = [...from]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = randomInt(0, i + 1)
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      this.slotGames = [shuffled[0], shuffled[1], shuffled[2]]
    } else {
      this.slotGames = [
        from[randomInt(0, from.length)],
        from[randomInt(0, from.length)],
        from[randomInt(0, from.length)],
      ]
    }
  }

  start(): void {
    // 각 플레이어에게 개별 match:start (상대 정보 + 슬롯 결과 + 베팅 공개)
    this.io.to(this.a.socketId).emit(EV.matchStart, {
      matchId: this.matchId,
      you: 'A',
      totalRounds: this.totalRounds,
      opponent: { nickname: this.b.nickname, imageUrl: this.b.imageUrl },
      yourColor: this.colorOfA,
      oppColor: this.colorOfB,
      slotGames: this.slotGames,
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
      slotGames: this.slotGames,
      yourBet: this.b.bet,
      oppBet: this.a.bet,
      yourAllIn: this.b.allIn,
      oppAllIn: this.a.allIn,
    })
    // 클라 인트로(슬롯 연출 → VS 베팅 공개 2초)가 끝날 때쯤 1라운드 시작
    this.introTimer = setTimeout(() => this.beginRound(), INTRO_MS)
  }

  private beginRound(): void {
    if (this.stopped) return
    this.gameId = this.slotGames[this.currentRound % 3]
    // 역할(공격/수비)은 라운드마다 랜덤 재배정 — 비대칭 게임(로켓·공룡 등)에서 매 라운드
    // 공격/수비가 바뀐다. 색(플레이어 종속)과는 독립이라 색으로 역할을 알 수 없다.
    this.roleOfA = randomInt(0, 2) === 0 ? 'P1' : 'P2'
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

    // 전송은 시뮬(매 틱)보다 낮은 주기(BROADCAST_EVERY 틱마다). 단, 종료 프레임은 항상 보낸다.
    if (this.tickCount % BROADCAST_EVERY === 0 || done) {
      const msg = {
        matchId: this.matchId,
        round: this.currentRound + 1,
        seq: this.seq++, // 전송 순서(단조증가) — 클라 순서역전 무시용
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
      console.error('[match] persist 실패', err)
    }

    // 코인 정산 (shared/src/coins.ts 규칙):
    //  빠른시작(quick): 승자 +자기 베팅 / 패자 -자기 베팅
    //  코드방(code):    승자 +패자 베팅 / 패자 -자기 베팅
    //  무승부: 변동 없음
    let deltaA = 0
    let deltaB = 0
    // 코드방 제로섬은 transfer로 정산해 승자 지급이 패자 실제 차감분을 넘지 않게 한다(리뷰 #4).
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
      // 실제 반영된 증감으로 통지값 보정 (transfer/음수 클램프가 적용됐을 수 있음)
      deltaA = settled.deltaA
      deltaB = settled.deltaB
    } catch (err) {
      console.error('[match] 코인 정산 실패', err)
      deltaA = 0
      deltaB = 0
    }

    // ── 리벤지 창구 기록 + 패자 신청 자격 (docs/ONLINE_MATCH.md) ──
    //  · 자격: 무승부 아님 · 이 매치의 리벤지 신청자가 아님(연속 신청 금지) · 정산 후 보유 ≥ 1
    //  · stake = min(직전 베팅 × 2, 정산 후 보유) — 2배가 안 되면 ALL-IN
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
      this.room.postMatch = undefined // 무승부 — 리벤지 없음
    }
    this.room.revengeRequesterUserId = null

    const end = { matchId: this.matchId, result, recordedMatchId, playedAt }
    this.io.to(this.a.socketId).emit(EV.matchEnd, { ...end, coinDelta: deltaA, coinBalance: balanceA, revenge: revengeA })
    this.io.to(this.b.socketId).emit(EV.matchEnd, { ...end, coinDelta: deltaB, coinBalance: balanceB, revenge: revengeB })

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
    if (this.introTimer) clearTimeout(this.introTimer)
    this.introTimer = null
  }
}

export type { Participant }
// GAME_CORES import 유지용(트리셰이크 방지 아님 — 실제 사용은 game-adapter)
void GAME_CORES
