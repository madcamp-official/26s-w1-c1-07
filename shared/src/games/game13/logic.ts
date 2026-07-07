import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * Game 13 = POT SHOT (burst the pot).
 *  · A pot bobs up and down at the center of the screen (speed random each game, 2~3s per cycle).
 *  · P1 bottom-left / P2 bottom-right cannon. Hit the pot with a parabolic (gravity) projectile for +1 point.
 *  · Hold Q(P1)/U(P2): firing angle sweeps 0~90° (90° in 0.25s = 360°/s). Release to lock that angle.
 *  · Hold W(P1)/I(P2): charge power (MAX in 1s). On release, fire at the locked angle and charged power.
 *    After firing, charging is blocked during the RELOAD(0.4s) reload cooldown.
 *  · Over the 10s time limit, whoever lands more hits wins (tie = DRAW).
 *
 * Coordinate system: logical canvas 960×540. y increases downward (gravity +GRAV). Angle is measured from the x-axis (0°=horizontal, 90°=vertical).
 * Tuning: from P1(120,476) at 45°·MAX, at t≈0.57s it passes (480,~260) → matching the pot's center height.
 *   Angle 30~60°·MAX covers the pot's entire up-down travel range; power adjusts the range/trajectory.
 */
export const G13 = {
  W: 960,
  H: 540,
  P1X: 120,
  P2X: 840,
  CANNON_Y: 476,
  POT_X: 480,
  /** Pot center y and amplitude → travel range [BASE-AMP, BASE+AMP] = [140,400] */
  POT_BASE_Y: 270,
  POT_AMP: 130,
  POT_R: 30,
  PROJ_R: 6,
  GRAV: 900,
  /** Angular speed (deg/s). 90° in 0.25s */
  ANG_SPEED: 360,
  MAX_POWER: 900,
  MIN_POWER: 220,
  /** Time to charge power to MAX (s) */
  CHARGE_TIME: 1.0,
  /** Reload cooldown (s) */
  RELOAD: 0.4,
} as const

export interface Shot13 {
  x: number
  y: number
  vx: number
  vy: number
  owner: 1 | 2
}

export interface Game13State {
  elapsed: number
  result: GameResult
  // Aim (angle) — 0~90 deg, sweeps while aiming
  angle1: number
  angle2: number
  aimDir1: number // ±1
  aimDir2: number
  aiming1: boolean
  aiming2: boolean
  // Power charge
  power1: number
  power2: number
  charging1: boolean
  charging2: boolean
  cd1: number // Remaining reload cooldown (s)
  cd2: number
  // Score
  score1: number
  score2: number
  // Pot
  potY: number
  potPeriod: number // Cycle period (s) — for render interpolation
  potPhase: number // Phase (radians)
  // Projectiles
  shots: Shot13[]
}

const DEG = Math.PI / 180

export function create(rand: () => number): Game13State {
  const potPeriod = 2 + rand() // 2~3s per cycle
  const potPhase = rand() * Math.PI * 2
  return {
    elapsed: 0,
    result: null,
    angle1: 45,
    angle2: 45,
    aimDir1: 1,
    aimDir2: 1,
    aiming1: false,
    aiming2: false,
    power1: 0,
    power2: 0,
    charging1: false,
    charging2: false,
    cd1: 0,
    cd2: 0,
    score1: 0,
    score2: 0,
    potY: G13.POT_BASE_Y + G13.POT_AMP * Math.sin(potPhase),
    potPeriod,
    potPhase,
    shots: [],
  }
}

/** Spawn a projectile: from owner's cannon at the locked angle and power */
function fire(state: Game13State, owner: 1 | 2, angleDeg: number, power: number): void {
  const p = Math.max(G13.MIN_POWER, power)
  const a = angleDeg * DEG
  const dir = owner === 1 ? 1 : -1
  state.shots.push({
    x: owner === 1 ? G13.P1X : G13.P2X,
    y: G13.CANNON_Y,
    vx: dir * p * Math.cos(a),
    vy: -p * Math.sin(a), // upward (negative)
    owner,
  })
}

export function step(state: Game13State, events: GameInputEvent[], dt: number): Game13State {
  if (state.result) return state
  state.elapsed += dt
  state.cd1 = Math.max(0, state.cd1 - dt)
  state.cd2 = Math.max(0, state.cd2 - dt)

  // Input: angle hold (down=start/up=lock), power hold (down=start charge/up=fire)
  for (const e of events) {
    switch (e.code) {
      case 'KeyQ':
        state.aiming1 = e.type === 'down'
        break
      case 'KeyU':
        state.aiming2 = e.type === 'down'
        break
      case 'KeyW':
        if (e.type === 'down') {
          if (state.cd1 === 0) {
            state.charging1 = true
            state.power1 = 0
          }
        } else {
          // Fire on release (was charging and not reloading)
          if (state.charging1) {
            fire(state, 1, state.angle1, state.power1)
            state.charging1 = false
            state.power1 = 0
            state.cd1 = G13.RELOAD
          }
        }
        break
      case 'KeyI':
        if (e.type === 'down') {
          if (state.cd2 === 0) {
            state.charging2 = true
            state.power2 = 0
          }
        } else {
          if (state.charging2) {
            fire(state, 2, state.angle2, state.power2)
            state.charging2 = false
            state.power2 = 0
            state.cd2 = G13.RELOAD
          }
        }
        break
    }
  }

  // Angle sweep (only while aiming)
  const aStep = G13.ANG_SPEED * dt
  if (state.aiming1) {
    state.angle1 += state.aimDir1 * aStep
    if (state.angle1 >= 90) {
      state.angle1 = 90
      state.aimDir1 = -1
    } else if (state.angle1 <= 0) {
      state.angle1 = 0
      state.aimDir1 = 1
    }
  }
  if (state.aiming2) {
    state.angle2 += state.aimDir2 * aStep
    if (state.angle2 >= 90) {
      state.angle2 = 90
      state.aimDir2 = -1
    } else if (state.angle2 <= 0) {
      state.angle2 = 0
      state.aimDir2 = 1
    }
  }

  // Power charge (while charging, up to MAX)
  const chargeRate = G13.MAX_POWER / G13.CHARGE_TIME
  if (state.charging1) state.power1 = Math.min(G13.MAX_POWER, state.power1 + chargeRate * dt)
  if (state.charging2) state.power2 = Math.min(G13.MAX_POWER, state.power2 + chargeRate * dt)

  // Pot bobs up and down
  state.potY = G13.POT_BASE_Y + G13.POT_AMP * Math.sin((state.elapsed / state.potPeriod) * Math.PI * 2 + state.potPhase)

  // Move projectiles + pot collision + cull off-screen
  const live: Shot13[] = []
  const potR2 = (G13.POT_R + G13.PROJ_R) * (G13.POT_R + G13.PROJ_R)
  for (const sh of state.shots) {
    sh.x += sh.vx * dt
    sh.y += sh.vy * dt
    sh.vy += G13.GRAV * dt
    const ddx = sh.x - G13.POT_X
    const ddy = sh.y - state.potY
    if (ddx * ddx + ddy * ddy <= potR2) {
      // Pot hit → shooter +1 point, projectile removed
      if (sh.owner === 1) state.score1 += 1
      else state.score2 += 1
      continue
    }
    if (sh.x > -40 && sh.x < G13.W + 40 && sh.y < G13.H + 60) live.push(sh)
  }
  state.shots = live

  if (state.elapsed >= GAME_DURATION) {
    state.result =
      state.score1 > state.score2 ? 'P1' : state.score2 > state.score1 ? 'P2' : 'DRAW'
  }
  return state
}
