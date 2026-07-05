import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * 게임8 = 마그마 총격 듀얼.
 *  · P1(왼쪽)·P2(오른쪽)이 서로 마주 보고, 먼저 상대를 맞히는 쪽이 승리한다.
 *  · 두 플레이어는 화면 맨 위에서 스폰돼 중력으로 낙하한다. x 위치는 고정.
 *      Q/U: 살짝 점프(위로 작은 임펄스, 공중에서도 가능) — 플래피 방식으로 높이 조절.
 *      W/I: 그 시점의 높이에서 상대를 향해 수평으로 총알 발사(쿨 FIRE_COOLDOWN).
 *  · 바닥은 마그마. 시작 시 화면 맨 아래에서 출발해 10초 동안 선형으로 상승,
 *      제한시간에 화면 50% 높이(H/2)까지 올라온다. 플레이어가 마그마에 닿으면 즉시 패배.
 *  · 천장에는 가시가 박혀 있어 너무 높이 뛰어 닿으면 그 플레이어도 즉시 패배.
 *      → 아래로도 위로도 죽으므로 좁은 안전대 안에서 높이를 조절해야 한다.
 *  · 총알은 상대 위치까지 정확히 0.5초에 도달하는 속도로 수평 비행한다
 *      → 발사 후 0.5초 안에 상대가 높이를 바꿔 피할 수 있다.
 *  · 승패: 명중 즉시 쏜 쪽 승 / 마그마에 닿은 쪽 패 / 10초까지 둘 다 생존하면 DRAW.
 *
 * 좌표: y 는 플레이어의 세로 중심(캔버스 y 아래로 증가).
 */
export const G8 = {
  W: 800,
  H: 450,
  P1_X: 150,
  P2_X: 650,
  PW: 26,
  PH: 30,
  SPAWN_Y: 90,
  /** 천장 가시 영역의 높이(0~SPIKE_H). 플레이어 머리가 이 아래로 들어오면 사망 */
  SPIKE_H: 14,
  // ── 이동 (플래피 방식: 부드럽게 떠서 호버 타이밍에 여유를 준다) ──
  GRAVITY: 900,
  /** 점프 1회 위쪽 임펄스(살짝) — 상승 폭 ≈ JUMP_V²/(2·GRAVITY) ≈ 27px, 호버 케이던스 ≈ 0.49s */
  JUMP_V: 220,
  MAX_FALL: 480,
  // ── 발사 ──
  FIRE_COOLDOWN: 0.35,
  BULLET_R: 5,
  /** 상대까지 도달하는 데 걸리는 시간(초) → 속도를 역산 */
  BULLET_TRAVEL_TIME: 0.5,
  // ── 마그마 ──
  /** 제한시간에 도달하는 마그마 표면 높이 비율(화면의 50%) */
  MAGMA_END_FRAC: 0.5,
} as const

/** P1→P2 거리를 0.5초에 주파하는 총알 속도(px/s) */
const BULLET_SPEED = (G8.P2_X - G8.P1_X) / G8.BULLET_TRAVEL_TIME

export interface Shot8 {
  x: number
  y: number
  vx: number
  owner: 1 | 2
}

export interface Game8State {
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

/** 경과 시간 기준 마그마 표면의 y 좌표(작을수록 높이 올라온 것). t=0 → H, t=10 → H/2 */
export function magmaSurfaceY(elapsed: number): number {
  const t = clamp(elapsed / GAME_DURATION, 0, 1)
  return G8.H - G8.MAGMA_END_FRAC * G8.H * t
}

export function create(_rand: () => number): Game8State {
  return {
    elapsed: 0,
    result: null,
    p1Y: G8.SPAWN_Y,
    p1Vy: 0,
    p1Cd: 0,
    p2Y: G8.SPAWN_Y,
    p2Vy: 0,
    p2Cd: 0,
    bullets: [],
  }
}

/** 총알 owner 가 상대 플레이어 사각형과 겹치는지 */
function hitsOpponent(b: Shot8, oppX: number, oppY: number): boolean {
  const left = oppX - G8.PW / 2
  const right = oppX + G8.PW / 2
  const top = oppY - G8.PH / 2
  const bottom = oppY + G8.PH / 2
  return (
    b.x + G8.BULLET_R > left &&
    b.x - G8.BULLET_R < right &&
    b.y + G8.BULLET_R > top &&
    b.y - G8.BULLET_R < bottom
  )
}

export function step(state: Game8State, events: GameInputEvent[], dt: number): Game8State {
  if (state.result) return state
  state.elapsed += dt
  state.p1Cd = Math.max(0, state.p1Cd - dt)
  state.p2Cd = Math.max(0, state.p2Cd - dt)

  // 1) 입력
  for (const e of events) {
    if (e.type !== 'down') continue
    switch (e.code) {
      case 'KeyQ': // P1 살짝 점프
        state.p1Vy = -G8.JUMP_V
        break
      case 'KeyU': // P2 살짝 점프
        state.p2Vy = -G8.JUMP_V
        break
      case 'KeyW': // P1 발사(오른쪽으로)
        if (state.p1Cd === 0) {
          state.bullets.push({
            x: G8.P1_X + G8.PW / 2 + G8.BULLET_R,
            y: state.p1Y,
            vx: BULLET_SPEED,
            owner: 1,
          })
          state.p1Cd = G8.FIRE_COOLDOWN
        }
        break
      case 'KeyI': // P2 발사(왼쪽으로)
        if (state.p2Cd === 0) {
          state.bullets.push({
            x: G8.P2_X - G8.PW / 2 - G8.BULLET_R,
            y: state.p2Y,
            vx: -BULLET_SPEED,
            owner: 2,
          })
          state.p2Cd = G8.FIRE_COOLDOWN
        }
        break
    }
  }

  // 2) 플레이어 물리(중력 낙하) — 천장 클램프 없음. 위로 넘으면 가시에 죽는다.
  state.p1Vy = Math.min(G8.MAX_FALL, state.p1Vy + G8.GRAVITY * dt)
  state.p1Y += state.p1Vy * dt
  state.p2Vy = Math.min(G8.MAX_FALL, state.p2Vy + G8.GRAVITY * dt)
  state.p2Y += state.p2Vy * dt

  // 3) 총알 이동 + 화면 밖 제거
  const live: Shot8[] = []
  for (const b of state.bullets) {
    b.x += b.vx * dt
    if (b.x > -20 && b.x < G8.W + 20) live.push(b)
  }
  state.bullets = live

  // 4) 명중 판정 — 먼저 맞힌 쪽 즉시 승리
  for (const b of state.bullets) {
    if (b.owner === 1 && hitsOpponent(b, G8.P2_X, state.p2Y)) {
      state.result = 'P1'
      return state
    }
    if (b.owner === 2 && hitsOpponent(b, G8.P1_X, state.p1Y)) {
      state.result = 'P2'
      return state
    }
  }

  // 5) 사망 판정 — 발끝(중심+PH/2)이 마그마에 닿거나 머리(중심−PH/2)가 천장 가시에 닿으면 패배
  const surf = magmaSurfaceY(state.elapsed)
  const p1Dead = state.p1Y + G8.PH / 2 >= surf || state.p1Y - G8.PH / 2 <= G8.SPIKE_H
  const p2Dead = state.p2Y + G8.PH / 2 >= surf || state.p2Y - G8.PH / 2 <= G8.SPIKE_H
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

  // 6) 제한시간까지 둘 다 생존 → 무승부
  if (state.elapsed >= GAME_DURATION) state.result = 'DRAW'
  return state
}
