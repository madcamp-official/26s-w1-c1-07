/**
 * 인메모리 방 + 빠른시작 큐 (BUILD_PLAN D2). DB 미저장 — 서버 RAM.
 * 방/큐는 소켓 연결에 묶임: 연결 끊기면 정리.
 */
import { randomInt } from 'node:crypto'
import type { GameId, Role, RoomSnapshot, RoomStatus } from '@madpump/shared'
import type { MatchRuntime } from './match-types'

export interface Member {
  userId: string
  nickname: string
  imageUrl: string | null
  socketId: string
  role: Role
  ready: boolean
  /** 이 매치에 건 코인 (참가 시 보유량 검증 완료) */
  bet: number
  /** 베팅이 참가 시점 보유 전액이었으면 true — VS 화면 ALL-IN 표시용 */
  allIn: boolean
}

/** 매치 종류 — 코인 정산 규칙이 다르다 (shared/src/coins.ts 참고) */
export type RoomKind = 'quick' | 'code'

/** 매치 종료 후 리벤지 창구 — MatchRunner.finishMatch가 기록, 새 매치 시작 시 초기화 */
export interface PostMatch {
  winnerUserId: string
  loserUserId: string
  /** userId → 그 매치에서 건 코인 (리벤지 스테이크 = ×2 기준) */
  bets: Record<string, number>
  /** 그 매치가 리벤지였다면 신청자 userId — 연속 신청 금지(e항) 판정용 */
  requesterUserId: string | null
  /** 진행 중인 리벤지 오퍼 (신청 후 승자 응답 대기) */
  pending?: { requesterId: string; timer: NodeJS.Timeout }
}

export interface Room {
  code: string
  hostUserId: string
  status: RoomStatus
  rounds: number
  /** 이 방에서 플레이 가능한 게임(설정 체크박스) — 슬롯머신 3릴의 후보 풀. */
  games: GameId[]
  kind: RoomKind
  members: Member[]
  match?: MatchRuntime
  /** 직전 매치의 리벤지 창구 (무승부·매치 전이면 없음) */
  postMatch?: PostMatch
  /** 지금 매치가 리벤지 매치라면 그 신청자 userId (finishMatch가 postMatch로 옮김) */
  revengeRequesterUserId?: string | null
}

export const rooms = new Map<string, Room>()

/** 빠른시작 글로벌 FIFO 큐 (게임 무관 — 슬롯머신이 3게임을 뽑는다) */
export interface QueueEntry {
  userId: string
  nickname: string
  imageUrl: string | null
  socketId: string
  /** 빠른시작 베팅액 */
  bet: number
  /** 베팅 = 보유 전액이면 true (ALL-IN 표시) */
  allIn: boolean
}
export const quickQueue: QueueEntry[] = []

export function genRoomCode(): string {
  let code = ''
  do {
    code = String(randomInt(10000, 99999)) // 5자리
  } while (rooms.has(code))
  return code
}

export function roomSnapshot(room: Room): RoomSnapshot {
  return {
    code: room.code,
    status: room.status,
    hostUserId: room.hostUserId,
    rounds: room.rounds,
    members: room.members.map((m) => ({
      userId: m.userId,
      nickname: m.nickname,
      role: m.role,
      ready: m.ready,
    })),
  }
}

/** userId가 속한 방 찾기 */
export function findRoomByUser(userId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.members.some((m) => m.userId === userId)) return room
  }
  return undefined
}

export function removeFromQueue(userId: string): void {
  const i = quickQueue.findIndex((q) => q.userId === userId)
  if (i >= 0) quickQueue.splice(i, 1)
}
