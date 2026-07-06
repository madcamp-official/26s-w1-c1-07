import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * Game 5 = Monster Barrage (symmetric duel).
 *  · The two players sit as cannons near the center of the screen with a small gap between them.
 *      P1 left cannon (CX-GAP, CY) / P2 right cannon (CX+GAP, CY).
 *  · Monsters spawn at random points along the screen edges and move in a straight line toward their target cannon.
 *      On spawn the target cannon (P1/P2) is assigned alternately → both cannons face an even threat.
 *  · Controls — the cannon rotates continuously by default (default counter-clockwise).
 *      P1: Q toggle rotation direction · W fire (cooldown FIRE_COOLDOWN)
 *      P2: U toggle rotation direction · I fire
 *  · When a bullet hits a monster the monster is destroyed + the shooter gets +1 point. (any monster can be hit)
 *  · If a monster touches either cannon, that cannon's owner loses instantly → the opponent wins.
 *  · Surviving the time limit (10s): if both survive, the higher score wins; a tie is a DRAW.
 *
 * Angle convention: muzzle direction = (cos a, sin a) (canvas coordinates, y increases downward).
 *   To rotate "counter-clockwise" on screen, decrease a → rotation direction dir=-1 is counter-clockwise (the default).
 */
export const G8 = {
  W: 800,
  H: 450,
  CX: 400,
  CY: 225,
  /** Gap spread left/right from the center of the two cannons */
  GAP: 74,
  CANNON_R: 16,
  /** Barrel length (render + bullet spawn position) */
  BARREL_LEN: 26,
  // ── Cannon controls ──
  ROT_SPEED: 5.4, // rad/s (always rotating, Q/U toggles direction)
  FIRE_COOLDOWN: 0.32,
  // ── Bullets ──
  BULLET_SPEED: 660,
  BULLET_R: 5,
  /**
   * Extra radius added only to the bullet↔monster hit test (forgiving hits).
   * Mitigates the problem where a fast bullet (BULLET_SPEED) tunnels through a
   * small hitbox between frames and grazes past. Does not affect the visual
   * sprite size (MONSTER_R) or the monster→cannon loss test (touchR).
   */
  HIT_PAD: 6,
  // ── Monsters (straight-line movement, 20% slower than before) ──
  MONSTER_R: 13,
  MONSTER_SPEED_MIN: 44.8,
  MONSTER_SPEED_MAX: 76.8,
  // ── Spawn: the interval shortens over time ──
  SPAWN_INTERVAL_START: 0.9,
  SPAWN_INTERVAL_MIN: 0.42,
  /** Spawn slightly inside the edge */
  SPAWN_MARGIN: 24,
} as const

export interface Shot {
  x: number
  y: number
  vx: number
  vy: number
  owner: 1 | 2
}

export interface Monster {
  x: number
  y: number
  /** The cannon this monster is targeting */
  target: 1 | 2
  /** Straight-line velocity fixed toward the target at spawn */
  vx: number
  vy: number
  /** Animation phase for rendering */
  anim: number
}

export interface Game8State {
  elapsed: number
  result: GameResult
  // ── P1 cannon ──
  p1Angle: number
  /** Rotation direction (-1=counter-clockwise default, 1=clockwise). Toggled with Q */
  p1Dir: 1 | -1
  p1Cooldown: number
  p1Score: number
  // ── P2 cannon ──
  p2Angle: number
  /** Rotation direction (-1=counter-clockwise default, 1=clockwise). Toggled with U */
  p2Dir: 1 | -1
  p2Cooldown: number
  p2Score: number
  // ──
  shots: Shot[]
  monsters: Monster[]
  spawnTimer: number
  /** The cannon the next monster will target (assigned alternately) */
  nextTarget: 1 | 2
  seed: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function nextRand(seed: number): { u: number; seed: number } {
  const s = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return { u: s / 4294967296, seed: s }
}

const p1Pos = () => ({ x: G8.CX - G8.GAP, y: G8.CY })
const p2Pos = () => ({ x: G8.CX + G8.GAP, y: G8.CY })

/** Spawn interval based on current elapsed time (linear acceleration) */
function spawnInterval(elapsed: number): number {
  const t = clamp(elapsed / GAME_DURATION, 0, 1)
  return lerp(G8.SPAWN_INTERVAL_START, G8.SPAWN_INTERVAL_MIN, t)
}

export function create(rand: () => number): Game8State {
  return {
    elapsed: 0,
    result: null,
    p1Angle: -Math.PI / 2, // start pointing upward
    p1Dir: -1, // default counter-clockwise
    p1Cooldown: 0,
    p1Score: 0,
    p2Angle: -Math.PI / 2,
    p2Dir: -1, // default counter-clockwise
    p2Cooldown: 0,
    p2Score: 0,
    shots: [],
    monsters: [],
    spawnTimer: 0.4, // small delay before the first monster
    nextTarget: rand() < 0.5 ? 1 : 2,
    seed: Math.floor(rand() * 4294967296) >>> 0,
  }
}

/** Create a monster at a random edge point that targets the given cannon */
function spawnMonster(state: Game8State, target: 1 | 2): void {
  const m = G8.SPAWN_MARGIN
  let r = nextRand(state.seed)
  state.seed = r.seed
  const edge = Math.floor(r.u * 4) % 4 // 0 top 1 bottom 2 left 3 right

  r = nextRand(state.seed)
  state.seed = r.seed
  const along = r.u

  let x: number
  let y: number
  if (edge === 0) {
    x = lerp(m, G8.W - m, along)
    y = m
  } else if (edge === 1) {
    x = lerp(m, G8.W - m, along)
    y = G8.H - m
  } else if (edge === 2) {
    x = m
    y = lerp(m, G8.H - m, along)
  } else {
    x = G8.W - m
    y = lerp(m, G8.H - m, along)
  }

  r = nextRand(state.seed)
  state.seed = r.seed
  const speed = lerp(G8.MONSTER_SPEED_MIN, G8.MONSTER_SPEED_MAX, r.u)

  // Fixed straight-line velocity toward the target cannon (the cannon is stationary → the path is straight)
  const tp = target === 1 ? p1Pos() : p2Pos()
  const dist = Math.hypot(tp.x - x, tp.y - y) || 1
  const vx = ((tp.x - x) / dist) * speed
  const vy = ((tp.y - y) / dist) * speed

  state.monsters.push({ x, y, target, vx, vy, anim: 0 })
}

export function step(state: Game8State, events: GameInputEvent[], dt: number): Game8State {
  if (state.result) return state
  state.elapsed += dt
  state.p1Cooldown = Math.max(0, state.p1Cooldown - dt)
  state.p2Cooldown = Math.max(0, state.p2Cooldown - dt)

  // 1) Input
  for (const e of events) {
    const down = e.type === 'down'
    switch (e.code) {
      case 'KeyQ': // P1 toggle rotation direction
        if (down) state.p1Dir = state.p1Dir === -1 ? 1 : -1
        break
      case 'KeyU': // P2 toggle rotation direction
        if (down) state.p2Dir = state.p2Dir === -1 ? 1 : -1
        break
      case 'KeyW': // P1 fire
        if (down && state.p1Cooldown === 0) {
          const p = p1Pos()
          state.shots.push({
            x: p.x + Math.cos(state.p1Angle) * G8.BARREL_LEN,
            y: p.y + Math.sin(state.p1Angle) * G8.BARREL_LEN,
            vx: Math.cos(state.p1Angle) * G8.BULLET_SPEED,
            vy: Math.sin(state.p1Angle) * G8.BULLET_SPEED,
            owner: 1,
          })
          state.p1Cooldown = G8.FIRE_COOLDOWN
        }
        break
      case 'KeyI': // P2 fire
        if (down && state.p2Cooldown === 0) {
          const p = p2Pos()
          state.shots.push({
            x: p.x + Math.cos(state.p2Angle) * G8.BARREL_LEN,
            y: p.y + Math.sin(state.p2Angle) * G8.BARREL_LEN,
            vx: Math.cos(state.p2Angle) * G8.BULLET_SPEED,
            vy: Math.sin(state.p2Angle) * G8.BULLET_SPEED,
            owner: 2,
          })
          state.p2Cooldown = G8.FIRE_COOLDOWN
        }
        break
    }
  }

  // 2) Cannon rotation — always rotating (dir=-1 counter-clockwise default), Q/U only toggle direction
  state.p1Angle += G8.ROT_SPEED * state.p1Dir * dt
  state.p2Angle += G8.ROT_SPEED * state.p2Dir * dt

  // 3) Monster spawn (alternating target assignment)
  state.spawnTimer -= dt
  if (state.spawnTimer <= 0) {
    spawnMonster(state, state.nextTarget)
    state.nextTarget = state.nextTarget === 1 ? 2 : 1
    state.spawnTimer += spawnInterval(state.elapsed)
  }

  // 4) Monster movement — straight-line toward the target fixed at spawn
  for (const mo of state.monsters) {
    mo.x += mo.vx * dt
    mo.y += mo.vy * dt
    mo.anim += dt
  }

  // 5) Bullet movement + remove off-screen
  const liveShots: Shot[] = []
  for (const sh of state.shots) {
    sh.x += sh.vx * dt
    sh.y += sh.vy * dt
    if (sh.x >= -20 && sh.x <= G8.W + 20 && sh.y >= -20 && sh.y <= G8.H + 20) {
      liveShots.push(sh)
    }
  }
  state.shots = liveShots

  // 6) Bullet ↔ monster collision — on hit the monster is destroyed + the shooter gets +1, and the bullet is destroyed too
  //    Forgiving by HIT_PAD: the visual sprite / loss test stay the same, only the hit detection is made more reliable.
  const hitR = G8.MONSTER_R + G8.BULLET_R + G8.HIT_PAD
  const deadMonster = new Set<number>()
  const usedShot = new Set<number>()
  for (let si = 0; si < state.shots.length; si++) {
    const sh = state.shots[si]
    for (let mi = 0; mi < state.monsters.length; mi++) {
      if (deadMonster.has(mi)) continue
      const mo = state.monsters[mi]
      if (Math.hypot(sh.x - mo.x, sh.y - mo.y) <= hitR) {
        deadMonster.add(mi)
        usedShot.add(si)
        if (sh.owner === 1) state.p1Score += 1
        else state.p2Score += 1
        break
      }
    }
  }
  if (deadMonster.size > 0) {
    state.monsters = state.monsters.filter((_, i) => !deadMonster.has(i))
    state.shots = state.shots.filter((_, i) => !usedShot.has(i))
  }

  // 7) Monster ↔ cannon collision — the owner of the touched cannon loses instantly
  const touchR = G8.MONSTER_R + G8.CANNON_R
  const p1 = p1Pos()
  const p2 = p2Pos()
  for (const mo of state.monsters) {
    if (Math.hypot(mo.x - p1.x, mo.y - p1.y) <= touchR) {
      state.result = 'P2'
      return state
    }
    if (Math.hypot(mo.x - p2.x, mo.y - p2.y) <= touchR) {
      state.result = 'P1'
      return state
    }
  }

  // 8) Time limit ends — both survived, decided by score
  if (state.elapsed >= GAME_DURATION) {
    if (state.p1Score > state.p2Score) state.result = 'P1'
    else if (state.p2Score > state.p1Score) state.result = 'P2'
    else state.result = 'DRAW'
  }
  return state
}
