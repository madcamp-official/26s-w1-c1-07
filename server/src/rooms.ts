/**
 * In-memory rooms + quick-start queue (BUILD_PLAN D2). Not persisted to DB — server RAM.
 * Rooms/queue are tied to the socket connection: cleaned up when the connection drops.
 */
import { randomInt } from 'node:crypto'
import type { GameId, Role, RoomSnapshot, RoomStatus } from '@madcade/shared'
import type { MatchRuntime } from './match-types'

export interface Member {
  userId: string
  nickname: string
  imageUrl: string | null
  socketId: string
  role: Role
  ready: boolean
  /** Coins staked on this match (balance verified at join time) */
  bet: number
  /** true if the bet was the entire balance at join time — for the ALL-IN badge on the VS screen */
  allIn: boolean
}

/** Match kind — coin settlement rules differ (see shared/src/coins.ts) */
export type RoomKind = 'quick' | 'code'

/** Rematch window after a match ends — recorded by MatchRunner.finishMatch, reset when a new match starts */
export interface PostMatch {
  winnerUserId: string
  loserUserId: string
  /** userId → coins staked in that match (rematch stake = ×2 baseline) */
  bets: Record<string, number>
  /** if that match was a rematch, the requester userId — used to enforce the no-consecutive-request rule (item e) */
  requesterUserId: string | null
  /** in-progress rematch offer (waiting for winner's response after a request) */
  pending?: { requesterId: string; timer: NodeJS.Timeout }
}

export interface Room {
  code: string
  hostUserId: string
  status: RoomStatus
  rounds: number
  /** Games playable in this room (settings checkboxes) — the candidate pool for the slot machine's 3 reels. */
  games: GameId[]
  kind: RoomKind
  members: Member[]
  match?: MatchRuntime
  /** Rematch window from the previous match (absent on a Draw or before any match) */
  postMatch?: PostMatch
  /** if the current match is a rematch, its requester userId (finishMatch moves it into postMatch) */
  revengeRequesterUserId?: string | null
}

export const rooms = new Map<string, Room>()

/** Global quick-start FIFO queue (game-agnostic — the slot machine draws the 3 games) */
export interface QueueEntry {
  userId: string
  nickname: string
  imageUrl: string | null
  socketId: string
  /** Quick-start bet amount */
  bet: number
  /** true if bet = entire balance (ALL-IN badge) */
  allIn: boolean
}
export const quickQueue: QueueEntry[] = []

export function genRoomCode(): string {
  let code = ''
  do {
    code = String(randomInt(10000, 99999)) // 5 digits
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

/** Find the room a userId belongs to */
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
