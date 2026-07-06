import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * 게임4 = 공룡 달리기 (Chrome Dino 차용).
 *  · P1(공룡)은 Q로 점프, W로 숙이기(홀드). 장애물을 피해 제한시간을 버틴다.
 *  · P2는 맵 오른쪽에서 장애물을 생성한다.
 *      - U: "점프 장애물"(선인장). 지면에 붙어 있어 점프로 넘어야 한다.
 *      - I: "숙이기 장애물"(새). 머리 높이로 날아와 숙여서 피해야 한다.
 *    생성에는 공용 쿨타임이 있어 무한정 벽을 쌓지 못한다.
 *  · 제한시간(10s)을 버티면 P1 승, 한 번이라도 부딪히면 즉시 P2 승.
 *
 * 판정 균형(px, s 단위):
 *   지면 상단 GROUND_Y=380. 서 있는 공룡은 y[330..380], 숙인 공룡은 y[352..380].
 *   선인장 y[334..380] → 서 있어도/숙여도 겹침 = 반드시 점프.
 *   새      y[310..338] → 서 있으면 겹치고 숙이면(352~) 안 겹침 = 반드시 숙이기.
 */
export const G6 = {
  W: 800,
  H: 450,
  GROUND_Y: 380,
  // ── 공룡 ──
  DINO_X: 120,
  DINO_W: 44,
  DINO_H: 50,
  DINO_DUCK_H: 28,
  GRAVITY: 2600,
  JUMP_V: 880,
  /** W를 누른 채 공중에 있으면 빠르게 낙하 */
  FASTFALL_MULT: 2.2,
  // ── 장애물 ──
  OBST_SPEED: 360,
  /** 시작 시(경과 0s) 장애물 생성 쿨타임 */
  SPAWN_COOLDOWN: 0.7,
  /** 쿨타임 하한 — 아무리 시간이 지나도 이 밑으로는 안 내려간다 */
  MIN_COOLDOWN: 0.28,
  /** 쿨타임 감소량 = COOLDOWN_K·√(경과초). √ 그래프처럼 시간이 지날수록 빨라진다 */
  COOLDOWN_K: 0.13,
  /** P2가 장애물을 던지는 모션 지속 시간 */
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
  /** 새의 날갯짓 등 렌더 위상 */
  phase: number
}

export interface Game6State {
  elapsed: number
  result: GameResult
  /** 지면 위 높이(0=지면). 점프 중 y>0 */
  y: number
  vy: number
  grounded: boolean
  ducking: boolean
  obstacles: Obstacle[]
  cooldown: number
  /** 이번 쿨타임을 걸 때 적용된 최댓값(게이지 바 정규화용) */
  cooldownMax: number
  /** P2 던지기 모션 잔여 시간(>0이면 던지는 중) */
  spawnAnim: number
  /** 달리기 애니메이션 위상 */
  runPhase: number
}

/** 경과 시간에 따라 줄어드는 현재 쿨타임 = base − K·√elapsed (하한 clamp) */
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

  // 1) 입력
  for (const e of events) {
    const down = e.type === 'down'
    switch (e.code) {
      case 'KeyQ': // P1 점프 — 지면에 있을 때만
        if (down && state.grounded) {
          state.vy = G6.JUMP_V
          state.grounded = false
        }
        break
      case 'KeyW': // P1 숙이기(홀드)
        state.ducking = down
        break
      case 'KeyU': // P2 점프 장애물 생성
        if (down && state.cooldown === 0) {
          state.obstacles.push({ x: G6.W, type: 'jump', phase: 0 })
          state.cooldownMax = cooldownFor(state.elapsed)
          state.cooldown = state.cooldownMax
          state.spawnAnim = G6.SPAWN_ANIM
        }
        break
      case 'KeyI': // P2 숙이기 장애물 생성
        if (down && state.cooldown === 0) {
          state.obstacles.push({ x: G6.W, type: 'duck', phase: 0 })
          state.cooldownMax = cooldownFor(state.elapsed)
          state.cooldown = state.cooldownMax
          state.spawnAnim = G6.SPAWN_ANIM
        }
        break
    }
  }

  // 2) 공룡 물리(점프/낙하)
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

  // 3) 장애물 이동 + 화면 밖 제거
  const survivors: Obstacle[] = []
  for (const o of state.obstacles) {
    o.x -= G6.OBST_SPEED * dt
    o.phase += dt
    const w = o.type === 'jump' ? G6.CACTUS_W : G6.BIRD_W
    if (o.x + w > 0) survivors.push(o)
  }
  state.obstacles = survivors

  // 4) 충돌 판정 — 숙이기는 지면에 있을 때만 히트박스를 낮춘다
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

  // 5) 제한시간을 버티면 P1 승
  if (state.elapsed >= GAME_DURATION) state.result = 'P1'
  return state
}
