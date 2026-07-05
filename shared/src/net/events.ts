/**
 * MADPUMP 소켓 통합 봉투 — client/server 공유 계약 (BUILD_PLAN D7·D8·D9).
 *
 * 원칙: 입력은 게임 무관 단일 이벤트(game:input), 상태는 게임별 투영(game:state).
 * 새 게임 추가 시 이 파일은 안 바뀐다.
 */
import type { GameInputEvent, GameResult } from '../games/types'
import type { GameId } from '../games/registry'

/** DB 저장 표기(매치 슬롯 기준). GameResult('P1'/'P2')와 다름 — 서버가 역할→슬롯 번역 */
export type SlotResult = 'A_WIN' | 'B_WIN' | 'DRAW'

/** GameResult(라운드 역할 승자) + 역할배정 → 슬롯 결과 번역.
 * roleOfA = 이 라운드에서 playerA가 맡은 역할('P1'|'P2'). */
export function toSlotResult(r: GameResult, roleOfA: 'P1' | 'P2'): SlotResult {
  if (r === 'DRAW' || r === null) return 'DRAW'
  return r === roleOfA ? 'A_WIN' : 'B_WIN'
}

// ── 세션/로비 ────────────────────────────────────────────────
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

// ── 매치/라운드 ─────────────────────────────────────────────
export interface OpponentView {
  nickname: string
  imageUrl: string | null
}

/** match:start — 각 플레이어에게 개별(자기 슬롯 포함) */
export interface MatchStartMsg {
  matchId: string
  you: 'A' | 'B' // 매치 고정 슬롯(승패 판정용). 라운드별 역할(P1/P2)은 round:start
  totalRounds: number
  opponent: OpponentView
}

/** round:start — 이 라운드의 게임 종류 통보 (역할은 매 라운드 랜덤이라 여기 실림) */
export interface RoundStartMsg {
  matchId: string
  round: number // 1-based
  gameId: GameId
  role: Role // 이 라운드에서 내 역할 (P1/P2)
  countdownMs: number // 라운드 시작 전 카운트다운
}

/** [C→S] game:input — 통합 입력 봉투 */
export interface GameInputMsg {
  matchId: string
  code: GameInputEvent['code'] // 서버가 role로 재기입(스푸핑 방지)
  type: GameInputEvent['type']
  t: number
  /** (선택) 오목처럼 클라가 로컬 커서로 고른 칸 인덱스. 서버는 유효성(내 턴·빈칸)만 검증. */
  cell?: number
}

/** [S→C] game:state — 렌더 투영(seed 등 비전송) */
export interface GameStateMsg {
  matchId: string
  round: number
  seq: number
  state: unknown // 게임별 view (seed 제거). 클라가 gameId로 타입 해석
}

/** round:end */
export interface RoundEndMsg {
  matchId: string
  round: number
  result: GameResult // 그 라운드 역할 승자
  wins: { P1: number; P2: number } // 누적(라운드 역할 기준 표시용)
}

/** [C→S] queue:join / room:create / room:join 에 실리는 베팅액 (보유 코인 한도 내 정수) */
export interface BetPayload {
  bet: number
}

/** match:end — game_match INSERT 커밋 후에만. 플레이어별 개별 전송(코인 정산 결과 포함) */
export interface MatchEndMsg {
  matchId: string
  result: SlotResult // 매치 최종(슬롯 기준)
  recordedMatchId: string // game_match.id
  playedAt: string
  /** 이 매치로 인한 내 코인 증감 (빠른시작: ±자기 베팅 / 코드방: 승자 +패자 베팅) */
  coinDelta: number
  /** 정산 후 내 보유 코인 */
  coinBalance: number
}

export interface MatchAbortedMsg {
  matchId: string
  reason: 'OPPONENT_LEFT'
}

/** 소켓 ack 규약 */
export type Ack<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

/** 이벤트명 상수 (오타 방지) */
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
} as const
