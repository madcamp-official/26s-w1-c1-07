import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * Game 4 = Dino Run (borrowed from Chrome Dino).
 *  · P1 (dino) jumps with Q, ducks (hold) with W. Dodge obstacles and survive the time limit.
 *  · P2 spawns obstacles from the right side of the map.
 *      - U: "jump obstacle" (cactus). Sits on the ground, so you must jump over it.
 *      - I: "duck obstacle" (bird). Flies in at head height, so you must duck to avoid it.
 *    Spawning has a shared cooldown, so you can't build an endless wall.
 *  · Survive the time limit (10s) and P1 wins; hit anything even once and P2 wins instantly.
 *
 * Judgement balance (in px, s units):
 *   Ground top GROUND_Y=380. A standing dino is y[330..380], a ducking dino is y[352..380].
 *   Cactus y[334..380] → overlaps whether standing or ducking = must jump.
 *   Bird   y[310..338] → overlaps when standing, doesn't overlap when ducking (352~) = must duck.
 */
export const G6 = {
  W: 800,
  H: 450,
  GROUND_Y: 380,
  // ── Dino ──
  DINO_X: 120,
  DINO_W: 44,
  DINO_H: 50,
  DINO_DUCK_H: 28,
  GRAVITY: 2600,
  JUMP_V: 880,
  /** Fall faster while airborne if W is held down */
  FASTFALL_MULT: 2.2,
  // ── Obstacles ──
  OBST_SPEED: 360,
  /** Obstacle spawn cooldown at the start (0s elapsed) */
  SPAWN_COOLDOWN: 0.7,
  /** Cooldown floor — no matter how much time passes, it won't go below this */
  MIN_COOLDOWN: 0.28,
  /** Cooldown reduction = COOLDOWN_K·√(elapsed seconds). Like a √ curve, it speeds up over time */
  COOLDOWN_K: 0.13,
  /** Duration of P2's obstacle-throwing motion */
  SPAWN_ANIM: 0.25,
  CACTUS_W: 26,
  CACTUS_H: 46,
  BIRD_W: 42,
  BIRD_H: 28,
  BIRD_TOP: 310,
} as const

export type ObstacleType = 'jump' | 'duck'

export interface Obstacle {
  x: number
  type: ObstacleType
  /** Render phase for the bird's wing flap, etc. */
  phase: number
}

export interface Game6State {
  elapsed: number
  result: GameResult
  /** Height above the ground (0=ground). y>0 while jumping */
  y: number
  vy: number
  grounded: boolean
  ducking: boolean
  obstacles: Obstacle[]
  cooldown: number
  /** Max value applied when this cooldown was set (for normalizing the gauge bar) */
  cooldownMax: number
  /** Remaining time on P2's throw motion (>0 means currently throwing) */
  spawnAnim: number
  /** Running animation phase */
  runPhase: number
}

/** Current cooldown that shrinks with elapsed time = base − K·√elapsed (clamped to floor) */
export function cooldownFor(elapsed: number): number {
  return Math.max(G6.MIN_COOLDOWN, G6.SPAWN_COOLDOWN - G6.COOLDOWN_K * Math.sqrt(elapsed))
}

interface Box {
  x0: number
  x1: number
  top: number
  bottom: number
}

function obstacleBox(o: Obstacle): Box {
  if (o.type === 'jump') {
    return {
      x0: o.x,
      x1: o.x + G6.CACTUS_W,
      top: G6.GROUND_Y - G6.CACTUS_H,
      bottom: G6.GROUND_Y,
    }
  }
  return {
    x0: o.x,
    x1: o.x + G6.BIRD_W,
    top: G6.BIRD_TOP,
    bottom: G6.BIRD_TOP + G6.BIRD_H,
  }
}

export function create(_rand: () => number): Game6State {
  return {
    elapsed: 0,
    result: null,
    y: 0,
    vy: 0,
    grounded: true,
    ducking: false,
    obstacles: [],
    cooldown: 0,
    cooldownMax: G6.SPAWN_COOLDOWN,
    spawnAnim: 0,
    runPhase: 0,
  }
}

export function step(state: Game6State, events: GameInputEvent[], dt: number): Game6State {
  if (state.result) return state
  state.elapsed += dt
  state.cooldown = Math.max(0, state.cooldown - dt)
  state.spawnAnim = Math.max(0, state.spawnAnim - dt)
  state.runPhase += dt

  // 1) Input
  for (const e of events) {
    const down = e.type === 'down'
    switch (e.code) {
      case 'KeyQ': // P1 jump — only when on the ground
        if (down && state.grounded) {
          state.vy = G6.JUMP_V
          state.grounded = false
        }
        break
      case 'KeyW': // P1 duck (hold)
        state.ducking = down
        break
      case 'KeyU': // P2 spawn jump obstacle
        if (down && state.cooldown === 0) {
          state.obstacles.push({ x: G6.W, type: 'jump', phase: 0 })
          state.cooldownMax = cooldownFor(state.elapsed)
          state.cooldown = state.cooldownMax
          state.spawnAnim = G6.SPAWN_ANIM
        }
        break
      case 'KeyI': // P2 spawn duck obstacle
        if (down && state.cooldown === 0) {
          state.obstacles.push({ x: G6.W, type: 'duck', phase: 0 })
          state.cooldownMax = cooldownFor(state.elapsed)
          state.cooldown = state.cooldownMax
          state.spawnAnim = G6.SPAWN_ANIM
        }
        break
    }
  }

  // 2) Dino physics (jump/fall)
  if (!state.grounded) {
    const g = G6.GRAVITY * (state.ducking ? G6.FASTFALL_MULT : 1)
    state.vy -= g * dt
    state.y += state.vy * dt
    if (state.y <= 0) {
      state.y = 0
      state.vy = 0
      state.grounded = true
    }
  }

  // 3) Move obstacles + remove off-screen ones
  const survivors: Obstacle[] = []
  for (const o of state.obstacles) {
    o.x -= G6.OBST_SPEED * dt
    o.phase += dt
    const w = o.type === 'jump' ? G6.CACTUS_W : G6.BIRD_W
    if (o.x + w > 0) survivors.push(o)
  }
  state.obstacles = survivors

  // 4) Collision check — ducking only lowers the hitbox when on the ground
  const curH = state.ducking && state.grounded ? G6.DINO_DUCK_H : G6.DINO_H
  const dinoBottom = G6.GROUND_Y - state.y
  const dino: Box = {
    x0: G6.DINO_X,
    x1: G6.DINO_X + G6.DINO_W,
    top: dinoBottom - curH,
    bottom: dinoBottom,
  }
  for (const o of state.obstacles) {
    const b = obstacleBox(o)
    if (dino.x0 < b.x1 && dino.x1 > b.x0 && dino.top < b.bottom && dino.bottom > b.top) {
      state.result = 'P2'
      return state
    }
  }

  // 5) Survive the time limit and P1 wins
  if (state.elapsed >= GAME_DURATION) state.result = 'P1'
  return state
}
