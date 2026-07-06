import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * Game 8 = magma shootout duel.
 *  · P1 (left) and P2 (right) face each other; the first to hit the opponent wins.
 *  · Both players spawn at the top of the screen and fall under gravity. Their x positions are fixed.
 *      Q/U: small jump (a small upward impulse, also usable mid-air) — flappy-style height control.
 *      W/I: fire a bullet horizontally toward the opponent from the current height (cooldown FIRE_COOLDOWN).
 *  · The floor is magma. It starts at the bottom of the screen and rises linearly over 10 seconds,
 *      reaching 50% of the screen height (H/2) at the time limit. A player who touches the magma loses instantly.
 *  · Spikes stud the ceiling, so jumping too high and touching them also makes that player lose instantly.
 *      → You die both below and above, so you must control your height within a narrow safe band.
 *  · The bullet flies horizontally at a speed that reaches the opponent's position in exactly 0.5 seconds
 *      → within 0.5 seconds after firing, the opponent can change height to dodge it.
 *  · Win/loss: whoever lands a hit wins instantly / whoever touches the magma loses / if both survive to 10s it's a DRAW.
 *
 * Coordinates: y is the player's vertical center (increasing downward in canvas y).
 */
export const G7 = {
  W: 800,
  H: 450,
  P1_X: 150,
  P2_X: 650,
  PW: 26,
  PH: 30,
  SPAWN_Y: 90,
  /** Height of the ceiling spike zone (0~SPIKE_H). A player dies if their head goes below this line */
  SPIKE_H: 14,
  // ── Movement (flappy style: floats smoothly to give slack on hover timing) ──
  GRAVITY: 900,
  /** Upward impulse per jump (small) — rise height ≈ JUMP_V²/(2·GRAVITY) ≈ 27px, hover cadence ≈ 0.49s */
  JUMP_V: 220,
  MAX_FALL: 480,
  // ── Firing ──
  FIRE_COOLDOWN: 0.35,
  BULLET_R: 5,
  /** Time (seconds) it takes to reach the opponent → speed is back-computed from it */
  BULLET_TRAVEL_TIME: 0.5,
  // ── Magma ──
  /** Ratio of the magma surface height reached at the time limit (50% of the screen) */
  MAGMA_END_FRAC: 0.5,
} as const

/** Bullet speed (px/s) that covers the P1→P2 distance in 0.5 seconds */
const BULLET_SPEED = (G7.P2_X - G7.P1_X) / G7.BULLET_TRAVEL_TIME

export interface Shot8 {
  x: number
  y: number
  vx: number
  owner: 1 | 2
}

export interface Game7State {
  elapsed: number
  result: GameResult
  // ── P1 ──
  p1Y: number
  p1Vy: number
  p1Cd: number
  // ── P2 ──
  p2Y: number
  p2Vy: number
  p2Cd: number
  // ──
  bullets: Shot8[]
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** y coordinate of the magma surface as a function of elapsed time (smaller = risen higher). t=0 → H, t=10 → H/2 */
export function magmaSurfaceY(elapsed: number): number {
  const t = clamp(elapsed / GAME_DURATION, 0, 1)
  return G7.H - G7.MAGMA_END_FRAC * G7.H * t
}

export function create(_rand: () => number): Game7State {
  return {
    elapsed: 0,
    result: null,
    p1Y: G7.SPAWN_Y,
    p1Vy: 0,
    p1Cd: 0,
    p2Y: G7.SPAWN_Y,
    p2Vy: 0,
    p2Cd: 0,
    bullets: [],
  }
}

/** Whether the bullet's owner overlaps the opponent player's rectangle */
function hitsOpponent(b: Shot8, oppX: number, oppY: number): boolean {
  const left = oppX - G7.PW / 2
  const right = oppX + G7.PW / 2
  const top = oppY - G7.PH / 2
  const bottom = oppY + G7.PH / 2
  return (
    b.x + G7.BULLET_R > left &&
    b.x - G7.BULLET_R < right &&
    b.y + G7.BULLET_R > top &&
    b.y - G7.BULLET_R < bottom
  )
}

export function step(state: Game7State, events: GameInputEvent[], dt: number): Game7State {
  if (state.result) return state
  state.elapsed += dt
  state.p1Cd = Math.max(0, state.p1Cd - dt)
  state.p2Cd = Math.max(0, state.p2Cd - dt)

  // 1) Input
  for (const e of events) {
    if (e.type !== 'down') continue
    switch (e.code) {
      case 'KeyQ': // P1 small jump
        state.p1Vy = -G7.JUMP_V
        break
      case 'KeyU': // P2 small jump
        state.p2Vy = -G7.JUMP_V
        break
      case 'KeyW': // P1 fire (to the right)
        if (state.p1Cd === 0) {
          state.bullets.push({
            x: G7.P1_X + G7.PW / 2 + G7.BULLET_R,
            y: state.p1Y,
            vx: BULLET_SPEED,
            owner: 1,
          })
          state.p1Cd = G7.FIRE_COOLDOWN
        }
        break
      case 'KeyI': // P2 fire (to the left)
        if (state.p2Cd === 0) {
          state.bullets.push({
            x: G7.P2_X - G7.PW / 2 - G7.BULLET_R,
            y: state.p2Y,
            vx: -BULLET_SPEED,
            owner: 2,
          })
          state.p2Cd = G7.FIRE_COOLDOWN
        }
        break
    }
  }

  // 2) Player physics (gravity fall) — no ceiling clamp. Go too high and you die on the spikes.
  state.p1Vy = Math.min(G7.MAX_FALL, state.p1Vy + G7.GRAVITY * dt)
  state.p1Y += state.p1Vy * dt
  state.p2Vy = Math.min(G7.MAX_FALL, state.p2Vy + G7.GRAVITY * dt)
  state.p2Y += state.p2Vy * dt

  // 3) Move bullets + remove off-screen ones
  const live: Shot8[] = []
  for (const b of state.bullets) {
    b.x += b.vx * dt
    if (b.x > -20 && b.x < G7.W + 20) live.push(b)
  }
  state.bullets = live

  // 4) Hit detection — whoever lands a hit first wins instantly
  for (const b of state.bullets) {
    if (b.owner === 1 && hitsOpponent(b, G7.P2_X, state.p2Y)) {
      state.result = 'P1'
      return state
    }
    if (b.owner === 2 && hitsOpponent(b, G7.P1_X, state.p1Y)) {
      state.result = 'P2'
      return state
    }
  }

  // 5) Death detection — you lose if your feet (center+PH/2) touch the magma or your head (center−PH/2) touches the ceiling spikes
  const surf = magmaSurfaceY(state.elapsed)
  const p1Dead = state.p1Y + G7.PH / 2 >= surf || state.p1Y - G7.PH / 2 <= G7.SPIKE_H
  const p2Dead = state.p2Y + G7.PH / 2 >= surf || state.p2Y - G7.PH / 2 <= G7.SPIKE_H
  if (p1Dead && p2Dead) {
    state.result = 'DRAW'
    return state
  }
  if (p1Dead) {
    state.result = 'P2'
    return state
  }
  if (p2Dead) {
    state.result = 'P1'
    return state
  }

  // 6) Both survive to the time limit → draw
  if (state.elapsed >= GAME_DURATION) state.result = 'DRAW'
  return state
}
