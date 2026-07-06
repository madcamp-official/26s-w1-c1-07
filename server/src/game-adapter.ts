/**
 * Server-side game core adapter — dispatches create/step by gameId,
 * rewrites the input code to the role's physical key (anti-cheat), projects state (non-transmitted fields like seed).
 */
import { GAME_CORES, type GameId, type Role } from '@madpump/shared'
import type { GameInputEvent, GameResult } from '@madpump/shared'

/* eslint-disable @typescript-eslint/no-explicit-any */
type State = { elapsed: number; result: GameResult } & Record<string, any>

export function createState(gameId: GameId, rand: () => number): State {
  return GAME_CORES[gameId].create(rand) as State
}

export function stepState(
  gameId: GameId,
  state: State,
  events: GameInputEvent[],
  dt: number,
): State {
  return GAME_CORES[gameId].step(state, events, dt) as State
}

/**
 * Overwrites the code (slot) sent by the client with the physical key of that player's role.
 * Slot A = KeyQ|KeyU → KeyQ for P1, KeyU for P2 / Slot B = KeyW|KeyI → KeyW for P1, KeyI for P2.
 * Does not trust the client code and decides purely from the server session's role (anti-spoofing).
 */
export function rewriteCodeForRole(
  code: GameInputEvent['code'],
  role: Role,
): GameInputEvent['code'] {
  const slotA = code === 'KeyQ' || code === 'KeyU'
  if (role === 'P1') return slotA ? 'KeyQ' : 'KeyW'
  return slotA ? 'KeyU' : 'KeyI'
}

/**
 * Render projection — removes non-transmitted fields (like seed) from the state sent to the client.
 * game-lab state is fully serializable (seed:number). seed is removed to prevent cheating.
 */
export function projectState(state: State): unknown {
  const { seed, rng, ...view } = state as Record<string, unknown>
  void seed
  void rng
  return view
}
