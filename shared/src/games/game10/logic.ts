import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * Game 10 = Tug of War · alternating mashing.
 *  · Rope center marker pos ∈ [-1, 1]. -1 = P1 win line (left), +1 = P2 win line (right).
 *  · Each player must press their two keys 'alternately' to pull.
 *      P1: alternate Q↔W,  P2: alternate U↔I. Mashing the same key is void (only a key different from the previous one counts).
 *  · One valid pull = PULL toward your side. If no one pulls, the SPRING slowly returns it to center.
 *  · When the marker touches a win line (±1) it's an instant win. When the 10s runs out, the side the marker is on wins (dead center is a DRAW).
 */
export const G10 = {
  W: 800,
  H: 450,
  /** Normalized distance pulled per valid alternating input */
  PULL: 0.045,
  /** Center-return spring coefficient (per second) */
  SPRING: 0.55,
  /** Win boundary */
  WIN_AT: 1,
  /** Pull feedback flash duration */
  FLASH: 0.12,
} as const

export interface Game10State {
  elapsed: number
  result: GameResult
  /** [-1,1], negative = P1 leading */
  pos: number
  p1LastKey: 'KeyQ' | 'KeyW' | null
  p2LastKey: 'KeyU' | 'KeyI' | null
  p1Pulls: number
  p2Pulls: number
  p1Flash: number
  p2Flash: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function create(_rand: () => number): Game10State {
  return {
    elapsed: 0,
    result: null,
    pos: 0,
    p1LastKey: null,
    p2LastKey: null,
    p1Pulls: 0,
    p2Pulls: 0,
    p1Flash: 0,
    p2Flash: 0,
  }
}

export function step(state: Game10State, events: GameInputEvent[], dt: number): Game10State {
  if (state.result) return state
  state.elapsed += dt
  state.p1Flash = Math.max(0, state.p1Flash - dt)
  state.p2Flash = Math.max(0, state.p2Flash - dt)

  for (const e of events) {
    if (e.type !== 'down') continue
    if (e.code === 'KeyQ' || e.code === 'KeyW') {
      // Only valid when the key differs from the previous one (enforces alternation)
      if (e.code !== state.p1LastKey) {
        state.p1LastKey = e.code
        state.pos -= G10.PULL
        state.p1Pulls += 1
        state.p1Flash = G10.FLASH
      }
    } else if (e.code === 'KeyU' || e.code === 'KeyI') {
      if (e.code !== state.p2LastKey) {
        state.p2LastKey = e.code
        state.pos += G10.PULL
        state.p2Pulls += 1
        state.p2Flash = G10.FLASH
      }
    }
  }

  // Center-return spring
  state.pos += -state.pos * G10.SPRING * dt
  state.pos = clamp(state.pos, -1.2, 1.2)

  // Win check
  if (state.pos <= -G10.WIN_AT) {
    state.result = 'P1'
    return state
  }
  if (state.pos >= G10.WIN_AT) {
    state.result = 'P2'
    return state
  }

  if (state.elapsed >= GAME_DURATION) {
    state.result = state.pos < 0 ? 'P1' : state.pos > 0 ? 'P2' : 'DRAW'
  }
  return state
}
