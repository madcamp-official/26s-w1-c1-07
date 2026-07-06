import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * 게임2 = 로켓 피하기.
 *  · P1은 좌우로 스캔하는 발사대에서 W로 3방향 부채꼴 탄을 발사한다.
 *  · P2는 좌우로 이동해 피하며, 체력 HP 3(피격 시 무적 0.45s).
 *  · 로켓이 적당히 느려 P2가 읽고 피할 여유가 있다.
 */
export const G4 = {
  W: 800,
  H: 450,
  MARGIN: 40,
  LAUNCHER_Y: 60,
  SCAN_SPEED: 560,
  ROCKET_W: 12,
  ROCKET_H: 28,
  /** 기본 대비 20% 낮춘 속도 */
  ROCKET_SPEED_MIN: 600,
  ROCKET_SPEED_MAX: 800,
  P2_Y: 396,
  P2_W: 46,
  P2_H: 26,
  P2_SPEED_MIN: 1380,
  P2_SPEED_MAX: 1760,
  // ── 발사대 3방향 부채꼴 ──
  BULLET_COUNT: 3,
  FIRE_COOLDOWN: 0.25,
  SPREAD_DEG: 22,
  SPEED_JITTER: 0.12,
  MAX_BOUNCE: 1,
  // ── HP 시스템 ──
  MAX_HP: 3,
  IFRAME_TIME: 0.45,
} as const

export interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  bounces: number
}

export interface Game4State {
  elapsed: number
  result: GameResult
  launcherX: number
  launcherDir: 1 | -1
  p2Speed: number
  p2X: number
  leftHeld: boolean
  rightHeld: boolean
  rockets: Bullet[]
  cooldown: number
  seed: number
  hp: number
  iframes: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const DEG = Math.PI / 180

function nextRand(seed: number): { u: number; seed: number } {
  const s = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return { u: s / 4294967296, seed: s }
}

/** N방향 부채꼴 각(도). [-SPREAD..+SPREAD] 균등 분배 */
function fanAngles(): number[] {
  const n = G4.BULLET_COUNT
  const s = G4.SPREAD_DEG
  if (n <= 1) return [0]
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(-s + (2 * s * i) / (n - 1))
  return out
}

export function create(rand: () => number): Game4State {
  return {
    elapsed: 0,
    result: null,
    launcherX: G4.W / 2,
    launcherDir: rand() < 0.5 ? -1 : 1,
    p2Speed: lerp(G4.P2_SPEED_MIN, G4.P2_SPEED_MAX, rand()),
    p2X: G4.W / 2,
    leftHeld: false,
    rightHeld: false,
    rockets: [],
    cooldown: 0,
    seed: Math.floor(rand() * 4294967296) >>> 0,
    hp: G4.MAX_HP,
    iframes: 0,
  }
}

export function step(state: Game4State, events: GameInputEvent[], dt: number): Game4State {
  if (state.result) return state
  state.elapsed += dt
  state.cooldown = Math.max(0, state.cooldown - dt)
  state.iframes = Math.max(0, state.iframes - dt)

  // 1) 입력 — W: 발사대에서 N방향 부채꼴 발사
  for (const e of events) {
    if (e.code === 'KeyU') state.leftHeld = e.type === 'down'
    else if (e.code === 'KeyI') state.rightHeld = e.type === 'down'
    else if (e.type === 'down' && e.code === 'KeyQ') {
      state.launcherDir = state.launcherDir === 1 ? -1 : 1
    } else if (e.type === 'down' && e.code === 'KeyW' && state.cooldown === 0) {
      const b = nextRand(state.seed)
      state.seed = b.seed
      const baseSpeed = lerp(G4.ROCKET_SPEED_MIN, G4.ROCKET_SPEED_MAX, b.u)
      for (const deg of fanAngles()) {
        const j = nextRand(state.seed)
        state.seed = j.seed
        const speed = baseSpeed * (1 - G4.SPEED_JITTER / 2 + G4.SPEED_JITTER * j.u)
        const rad = deg * DEG
        state.rockets.push({
          x: state.launcherX,
          y: G4.LAUNCHER_Y,
          vx: speed * Math.sin(rad),
          vy: speed * Math.cos(rad),
          bounces: 0,
        })
      }
      state.cooldown = G4.FIRE_COOLDOWN
    }
  }

  // 2) 발사대 이동
  state.launcherX += state.launcherDir * G4.SCAN_SPEED * dt
  if (state.launcherX < G4.MARGIN) {
    state.launcherX = G4.MARGIN
    state.launcherDir = 1
  } else if (state.launcherX > G4.W - G4.MARGIN) {
    state.launcherX = G4.W - G4.MARGIN
    state.launcherDir = -1
  }

  // 3) P2 이동
  const dir = (state.rightHeld ? 1 : 0) - (state.leftHeld ? 1 : 0)
  state.p2X = clamp(state.p2X + dir * state.p2Speed * dt, G4.MARGIN, G4.W - G4.MARGIN)

  // 4) 탄 이동(직선) + 측벽 반사
  const survivors: Bullet[] = []
  for (const r of state.rockets) {
    r.x += r.vx * dt
    r.y += r.vy * dt
    if (r.x < G4.MARGIN && r.vx < 0 && r.bounces < G4.MAX_BOUNCE) {
      r.x = G4.MARGIN
      r.vx = -r.vx
      r.bounces++
    } else if (r.x > G4.W - G4.MARGIN && r.vx > 0 && r.bounces < G4.MAX_BOUNCE) {
      r.x = G4.W - G4.MARGIN
      r.vx = -r.vx
      r.bounces++
    }
    if (r.y < G4.H + G4.ROCKET_H) survivors.push(r)
  }
  state.rockets = survivors

  // 5) 피격 판정 — 무적이 아닐 때만 1대 맞고 HP-1, 무적 부여, 맞은 탄 소멸
  if (state.iframes <= 0) {
    const px0 = state.p2X - G4.P2_W / 2
    const px1 = state.p2X + G4.P2_W / 2
    for (let idx = 0; idx < state.rockets.length; idx++) {
      const r = state.rockets[idx]
      const rx0 = r.x - G4.ROCKET_W / 2
      const rx1 = r.x + G4.ROCKET_W / 2
      if (rx0 < px1 && rx1 > px0 && r.y < G4.P2_Y + G4.P2_H && r.y + G4.ROCKET_H > G4.P2_Y) {
        state.hp -= 1
        state.iframes = G4.IFRAME_TIME
        state.rockets.splice(idx, 1)
        if (state.hp <= 0) {
          state.result = 'P1'
          return state
        }
        break
      }
    }
  }

  if (state.elapsed >= GAME_DURATION) state.result = 'P2'
  return state
}
