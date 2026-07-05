/**
 * 인메모리 방 + 빠른시작 큐 (BUILD_PLAN D2). DB 미저장 — 서버 RAM.
 * 방/큐는 소켓 연결에 묶임: 연결 끊기면 정리.
 */
import { randomInt } from 'node:crypto'
import type { Role, RoomSnapshot, RoomStatus } from '@madpump/shared'
import type { MatchRuntime } from './match-types'

export interface Member {
  userId: string
  nickname: string
  imageUrl: string | null
  socketId: string
  role: Role
  ready: boolean
}

export interface Room {
  code: string
  hostUserId: string
  status: RoomStatus
  rounds: number
  members: Member[]
  match?: MatchRuntime
}

export const rooms = new Map<string, Room>()

/** 빠른시작 글로벌 FIFO 큐 (게임 무관 — 매치는 어차피 랜덤 3게임) */
export interface QueueEntry {
  userId: string
  nickname: string
  imageUrl: string | null
  socketId: string
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
