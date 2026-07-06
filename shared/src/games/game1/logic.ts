import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * 게임1 = 숫자 맞추기 · "누적 속도 게이지".
 *  · 게이지는 keyup으로 초기화되지 않는다(누적형).
 *  · keydown마다 게이지가 PRESS_GAIN(=30%p)씩 누적되어 최대 100%까지 오른다.
 *  · 게이지는 항상 sqrt 양상으로 감소한다(dg/dt = -DECAY_K·√g). 손을 떼면
 *    이 감쇠로 자연스럽게 0까지 내려간다(즉시 0이 아니라 서서히).
 *  → 빠르게 연타할수록 +30%p 누적이 감쇠를 앞질러 게이지가 100%로 차오르고,
 *    꾹 누르면 1회 +30%p 뒤 감쇠만 남아 사그라든다.
 *  · 넘버 증감 속도 = baseRate × (게이지 / GAUGE_REF).
 *    이번엔 GAUGE_REF=30 → "게이지 30% 부근의 속도 = 기존 홀드 속도".
 *    (게이지 100%면 약 3.3배까지 빨라진다.)
 *
 * 그 외(손 떼고 타겟에서 1초 정지 시 승리, 10초 종료 시 근접 판정, 범위 1~1000)는 동일.
 */
export const G1 = {
  /** 게이지 GAUGE_REF%일 때의 속도 = 기존 홀드 속도. 플레이어별 이 범위에서 랜덤 */
  RATE_MIN: 42,
  RATE_MAX: 88,
  MATCH_TOL: 0.5,
  HOLD_TO_WIN: 1,
  RANGE_MIN: 1,
  RANGE_MAX: 1000,
  /** keydown 1회당 누적되는 게이지(%p) */
  PRESS_GAIN: 30,
  /** 방향키 홀드 중 초당 충전(%p/s) — 홀드하면 게이지가 GAUGE_REF(=기준속도)까지 차오른다.
   *  (없으면 홀드 시 감쇠로 0까지 떨어져 speed가 안 오르던 버그) equilibrium≈(HOLD_GAIN/DECAY_K)² */
  HOLD_GAIN: 88,
  /** 게이지 상한(%) */
  GAUGE_MAX: 100,
  /** 이 게이지(%)에서 속도 = 플레이어 base rate  */
  GAUGE_REF: 30,
  /** sqrt 감쇠 계수: dg/dt = -DECAY_K·√g (항상 적용) */
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
  /** 속도 게이지 (0~100), 누적형 */
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

/** 게이지 감쇠(항상) + 값 갱신 + 정지-유지 판정 */
function advance(io: PlayerIO, target: number, dt: number) {
  const dir = (io.up ? 1 : 0) - (io.down ? 1 : 0)
  // 방향키를 누르고 있으면 게이지가 기준(GAUGE_REF)까지 차오른다 — 홀드=기준속도, 연타로 그 위 부스트.
  //  (예전엔 keydown 순간에만 +PRESS_GAIN이라 홀드 시 감쇠로 0까지 떨어져 speed가 안 오르던 버그)
  if (dir !== 0) io.gauge = Math.min(G1.GAUGE_MAX, io.gauge + G1.HOLD_GAIN * dt)
  // sqrt 양상 감쇠 — 누르든 안 누르든 항상 적용
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

  // 입력: keydown → 게이지 +30%p 누적(상한 100). keyup → 홀드 해제만(게이지 유지, 감쇠로 내려감)
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
