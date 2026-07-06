import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * Game 1 = Number Guess · "cumulative speed gauge".
 *  · The gauge is not reset on keyup (it accumulates).
 *  · Each keydown accumulates PRESS_GAIN (=30%p) on the gauge, up to a max of 100%.
 *  · The gauge always decays in a sqrt pattern (dg/dt = -DECAY_K·√g). When you release,
 *    this decay naturally brings it down to 0 (gradually, not instantly).
 *  → The faster you tap, the more the +30%p accumulation outpaces the decay and the gauge fills to 100%,
 *    while holding gives a single +30%p and then only decay remains, so it fades out.
 *  · Number increment/decrement speed = baseRate × (gauge / GAUGE_REF).
 *    This time GAUGE_REF=30 → "speed around 30% gauge = the old hold speed".
 *    (At 100% gauge it speeds up to about 3.3x.)
 *
 * Everything else (win on releasing and holding on target for 1s, proximity check at the 10s end, range 1~1000) is the same.
 */
export const G1 = {
  /** Speed at GAUGE_REF% gauge = the old hold speed. Randomized per player within this range */
  RATE_MIN: 42,
  RATE_MAX: 88,
  MATCH_TOL: 0.5,
  HOLD_TO_WIN: 1,
  RANGE_MIN: 1,
  RANGE_MAX: 1000,
  /** Gauge accumulated per keydown (%p) */
  PRESS_GAIN: 30,
  /** Charge per second while holding a direction key (%p/s) — holding fills the gauge up to GAUGE_REF (=base speed).
   *  (Without this, holding would decay to 0 and speed wouldn't rise — a bug) equilibrium≈(HOLD_GAIN/DECAY_K)² */
  HOLD_GAIN: 88,
  /** Gauge upper limit (%) */
  GAUGE_MAX: 100,
  /** At this gauge (%), speed = player base rate  */
  GAUGE_REF: 30,
  /** sqrt decay coefficient: dg/dt = -DECAY_K·√g (always applied) */
  DECAY_K: 16,
} as const

export interface Game1State {
  target: number
  p1: number
  p2: number
  p1Rate: number
  p2Rate: number
  p1Down: boolean
  p1Up: boolean
  p2Down: boolean
  p2Up: boolean
  /** Speed gauge (0~100), cumulative */
  p1Gauge: number
  p2Gauge: number
  p1Hold: number
  p2Hold: number
  elapsed: number
  result: GameResult
}

const randInt = (rand: () => number, lo: number, hi: number) =>
  lo + Math.floor(rand() * (hi - lo + 1))

const randIntExcluding = (rand: () => number, exclude: number) => {
  const v = randInt(rand, G1.RANGE_MIN, G1.RANGE_MAX - 1)
  return v >= exclude ? v + 1 : v
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function create(rand: () => number): Game1State {
  const target = randInt(rand, G1.RANGE_MIN, G1.RANGE_MAX)
  return {
    target,
    p1: randIntExcluding(rand, target),
    p2: randIntExcluding(rand, target),
    p1Rate: lerp(G1.RATE_MIN, G1.RATE_MAX, rand()),
    p2Rate: lerp(G1.RATE_MIN, G1.RATE_MAX, rand()),
    p1Down: false,
    p1Up: false,
    p2Down: false,
    p2Up: false,
    p1Gauge: 0,
    p2Gauge: 0,
    p1Hold: 0,
    p2Hold: 0,
    elapsed: 0,
    result: null,
  }
}

interface PlayerIO {
  value: number
  down: boolean
  up: boolean
  gauge: number
  rate: number
  hold: number
}

/** Gauge decay (always) + value update + stop-and-hold check */
function advance(io: PlayerIO, target: number, dt: number) {
  const dir = (io.up ? 1 : 0) - (io.down ? 1 : 0)
  // While a direction key is held, the gauge fills up to the reference (GAUGE_REF) — hold=base speed, tap to boost above it.
  //  (Previously +PRESS_GAIN only happened at the moment of keydown, so holding decayed to 0 and speed wouldn't rise — a bug)
  if (dir !== 0) io.gauge = Math.min(G1.GAUGE_MAX, io.gauge + G1.HOLD_GAIN * dt)
  // sqrt-pattern decay — always applied, whether pressed or not
  io.gauge = Math.max(0, io.gauge - G1.DECAY_K * Math.sqrt(io.gauge) * dt)

  const speed = io.rate * (io.gauge / G1.GAUGE_REF)
  const next = Math.min(G1.RANGE_MAX, Math.max(G1.RANGE_MIN, io.value + dir * speed * dt))

  const stopped = dir === 0
  const onTarget = Math.abs(Math.round(next) - target) < G1.MATCH_TOL
  const nextHold = stopped && onTarget ? io.hold + dt : 0
  const won = nextHold >= G1.HOLD_TO_WIN

  io.value = next
  io.hold = nextHold
  return won
}

export function step(state: Game1State, events: GameInputEvent[], dt: number): Game1State {
  if (state.result) return state
  state.elapsed += dt

  // Input: keydown → accumulate +30%p on the gauge (cap 100). keyup → release hold only (gauge stays, decays down)
  for (const e of events) {
    const down = e.type === 'down'
    switch (e.code) {
      case 'KeyQ':
        state.p1Down = down
        if (down) state.p1Gauge = Math.min(G1.GAUGE_MAX, state.p1Gauge + G1.PRESS_GAIN)
        break
      case 'KeyW':
        state.p1Up = down
        if (down) state.p1Gauge = Math.min(G1.GAUGE_MAX, state.p1Gauge + G1.PRESS_GAIN)
        break
      case 'KeyU':
        state.p2Down = down
        if (down) state.p2Gauge = Math.min(G1.GAUGE_MAX, state.p2Gauge + G1.PRESS_GAIN)
        break
      case 'KeyI':
        state.p2Up = down
        if (down) state.p2Gauge = Math.min(G1.GAUGE_MAX, state.p2Gauge + G1.PRESS_GAIN)
        break
    }
  }

  const io1: PlayerIO = {
    value: state.p1,
    down: state.p1Down,
    up: state.p1Up,
    gauge: state.p1Gauge,
    rate: state.p1Rate,
    hold: state.p1Hold,
  }
  const won1 = advance(io1, state.target, dt)
  state.p1 = io1.value
  state.p1Gauge = io1.gauge
  state.p1Hold = io1.hold

  const io2: PlayerIO = {
    value: state.p2,
    down: state.p2Down,
    up: state.p2Up,
    gauge: state.p2Gauge,
    rate: state.p2Rate,
    hold: state.p2Hold,
  }
  const won2 = advance(io2, state.target, dt)
  state.p2 = io2.value
  state.p2Gauge = io2.gauge
  state.p2Hold = io2.hold

  if (won1) {
    state.result = 'P1'
    return state
  }
  if (won2) {
    state.result = 'P2'
    return state
  }

  if (state.elapsed >= GAME_DURATION) {
    const d1 = Math.abs(Math.round(state.p1) - state.target)
    const d2 = Math.abs(Math.round(state.p2) - state.target)
    state.result = d1 < d2 ? 'P1' : d2 < d1 ? 'P2' : 'DRAW'
  }
  return state
}
