import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * Game 12 = RED LIGHT, GREEN LIGHT.
 *  · Both players run from the left start line (pos=0) toward the "it"/tagger and finish line on the right (pos=1).
 *  · Mash Q(P1)/U(P2) to advance (with inertia — decelerates gradually when not pressed). W(P1)/I(P2)=hard stop (speed 0).
 *  · The "it" alternates at random intervals between green (back turned · safe) ↔ red (staring · dangerous). Just before red, a TELEGRAPH(0.2s) heads-up.
 *  · During red, if speed is at or above CAUGHT_SPEED you're caught → that player loses immediately (opponent wins).
 *    If both are caught on the same frame, the one closer to the "it" (larger pos) gets eaten and loses.
 *  · Reaching the finish line (pos>=1) when it's not red → instant win.
 *  · If nobody finishes by the 10s mark, the one closer (larger pos) wins; if tied, DRAW.
 *
 * The "it" schedule (reds) is pre-baked in create(rand) (server-authoritative — deterministic). Render derives phase from elapsed.
 */
export const G12 = {
  /** Max speed (pos/s). Kept low so a single green can't reach the finish — you must clear several reds to arrive */
  V_MAX: 0.6,
  /** Impulse per mash (pos/s). A human mashing ~10/s sustains ~0.45 pos/s */
  MASH: 0.13,
  /** Exponential decay coefficient (1/s) — when not pressed, v *= e^(-FRICTION·dt).
   *  0.2s of coasting alone won't drop below the threshold → you must hard-stop (W/I) to be safe (intended difficulty) */
  FRICTION: 3.4,
  /** Speed threshold for being caught during red (pos/s) */
  CAUGHT_SPEED: 0.12,
  /** Heads-up time before red (s) — leeway to stop while the "it" turns around */
  TELEGRAPH: 0.35,
  FINISH: 1.0,
} as const

export interface Game12State {
  elapsed: number
  result: GameResult
  pos1: number
  v1: number
  pos2: number
  v2: number
  /** Whether caught (eaten) — for render effect */
  caught1: boolean
  caught2: boolean
  /** Flat array of red intervals [s0,e0,s1,e1,...] (in elapsed). Render reuses it for phase decisions */
  reds: number[]
}

/** Whether elapsed is inside a red interval (being watched) */
export function isRed(reds: number[], elapsed: number): boolean {
  for (let i = 0; i < reds.length; i += 2) {
    if (elapsed >= reds[i] && elapsed < reds[i + 1]) return true
  }
  return false
}

/** Whether in the heads-up (turning) window — 0.2s before red starts */
export function isTelegraph(reds: number[], elapsed: number): boolean {
  for (let i = 0; i < reds.length; i += 2) {
    if (elapsed >= reds[i] - G12.TELEGRAPH && elapsed < reds[i]) return true
  }
  return false
}

export function create(rand: () => number): Game12State {
  // Bake an alternating green(0.7~1.7s) ↔ red(0.6~1.3s) schedule out to 10s. First red is at 0.6~1.2s (early intervention).
  const reds: number[] = []
  let t = 0.6 + rand() * 0.6
  while (t < GAME_DURATION) {
    const redDur = 0.6 + rand() * 0.7
    const s = t
    const e = Math.min(GAME_DURATION, t + redDur)
    reds.push(s, e)
    t = e + (0.7 + rand() * 1.0) // next green
  }
  return {
    elapsed: 0,
    result: null,
    pos1: 0,
    v1: 0,
    pos2: 0,
    v2: 0,
    caught1: false,
    caught2: false,
    reds,
  }
}

export function step(state: Game12State, events: GameInputEvent[], dt: number): Game12State {
  if (state.result) return state
  state.elapsed += dt

  // Input: mash impulse / hard stop
  for (const e of events) {
    if (e.type !== 'down') continue
    switch (e.code) {
      case 'KeyQ':
        state.v1 = Math.min(G12.V_MAX, state.v1 + G12.MASH)
        break
      case 'KeyW':
        state.v1 = 0
        break
      case 'KeyU':
        state.v2 = Math.min(G12.V_MAX, state.v2 + G12.MASH)
        break
      case 'KeyI':
        state.v2 = 0
        break
    }
  }

  // Inertial movement + exponential decay (never goes backward)
  const decay = Math.exp(-G12.FRICTION * dt)
  state.pos1 = Math.min(G12.FINISH, state.pos1 + state.v1 * dt)
  state.pos2 = Math.min(G12.FINISH, state.pos2 + state.v2 * dt)
  state.v1 = Math.max(0, state.v1 * decay)
  state.v2 = Math.max(0, state.v2 * decay)

  // Caught check during red (excluding the heads-up window — stopping then is safe)
  if (isRed(state.reds, state.elapsed)) {
    if (state.v1 >= G12.CAUGHT_SPEED) state.caught1 = true
    if (state.v2 >= G12.CAUGHT_SPEED) state.caught2 = true
    if (state.caught1 || state.caught2) {
      state.result =
        state.caught1 && state.caught2
          ? state.pos1 > state.pos2
            ? 'P2'
            : state.pos2 > state.pos1
              ? 'P1'
              : 'DRAW'
          : state.caught1
            ? 'P2'
            : 'P1'
      return state
    }
  }

  // Reached the finish line → win (when it's not red, or during red but not caught above = crossed slowly)
  const f1 = state.pos1 >= G12.FINISH
  const f2 = state.pos2 >= G12.FINISH
  if (f1 || f2) {
    state.result = f1 && f2 ? 'DRAW' : f1 ? 'P1' : 'P2'
    return state
  }

  // Time's up → the closer one (larger pos) wins
  if (state.elapsed >= GAME_DURATION) {
    state.result = state.pos1 > state.pos2 ? 'P1' : state.pos2 > state.pos1 ? 'P2' : 'DRAW'
  }
  return state
}
