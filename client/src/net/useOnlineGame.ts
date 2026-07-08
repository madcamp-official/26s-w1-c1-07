/**
 * Online hook for game screens.
 * If this game (gameId) is the current round of the ongoing online match, returns { state, role, sendInput }.
 * In that case the screen doesn't run a local sim/bot; it renders the server state + sends input.
 */
import { useOnline, sendInput } from './online'
import type { GameId, GameResult, OpponentView, Role } from '@madcade/shared'

export interface OnlineGame {
  /** Authoritative server state (projection for rendering). null means before the first snapshot (countdown, etc.) */
  state: unknown | null
  role: Role
  round: number
  phase: 'countdown' | 'playing' | 'round-result'
  countdownUntil: number
  lastRoundResult: GameResult | null
  opponent: OpponentView | null
  /** Send my input (slot A=primary key / B=secondary key). cell (optional) = a cell picked with a local cursor, as in Gomoku. */
  sendInput: (slot: 'A' | 'B', type: 'down' | 'up', t: number, cell?: number) => void
}

export function useOnlineGame(gameId: GameId): OnlineGame | null {
  const o = useOnline()
  const active =
    o.gameId === gameId &&
    o.role != null &&
    (o.phase === 'countdown' || o.phase === 'playing' || o.phase === 'round-result')
  if (!active) return null
  return {
    state: o.serverState,
    role: o.role as Role,
    round: o.round,
    phase: o.phase as OnlineGame['phase'],
    countdownUntil: o.countdownUntil,
    lastRoundResult: o.lastRoundResult,
    opponent: o.opponent,
    sendInput,
  }
}
