import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * 게임13 = POT SHOT (박 터뜨리기).
 *  · 화면 중앙에 박(pot)이 상하로 왕복(속도는 매 게임 랜덤, 왕복 2~3초).
 *  · P1 좌하단 / P2 우하단 대포. 포물선(중력) 발사체로 박을 맞히면 +1점.
 *  · Q(P1)/U(P2) 홀드: 발사 각도 0~90° 왕복(0.25s에 90° = 360°/s). 떼면 그 각도로 고정.
 *  · W(P1)/I(P2) 홀드: 세기 충전(1초에 MAX). 떼는 순간 고정 각도·충전 세기로 발사.
 *    발사 후 RELOAD(0.4s) 재장전 쿨다운 동안 충전 불가.
 *  · 제한시간 10초 동안 더 많이 맞힌 쪽 승(동점 DRAW).
 *
 * 좌표계: 논리 캔버스 960×540. y는 아래로 증가(중력 +GRAV). 각도는 x축 기준(0°=수평, 90°=수직).
 * 튜닝: P1(120,476)에서 45°·MAX면 t≈0.57s에 (480,~260) 통과 → 박 중앙 높이와 일치.
 *   각도 30~60°·MAX로 박의 상하 왕복 범위 전체를 커버, 세기로 사거리/궤적 조절.
 */
export const G13 = {
  W: 960,
  H: 540,
  P1X: 120,
  P2X: 840,
  CANNON_Y: 476,
  POT_X: 480,
  /** 박 중심 기준 y와 진폭 → 왕복 범위 [BASE-AMP, BASE+AMP] = [140,400] */
  POT_BASE_Y: 270,
  POT_AMP: 130,
  POT_R: 30,
  PROJ_R: 6,
  GRAV: 900,
  /** 각속도(도/초). 0.25s에 90° */
  ANG_SPEED: 360,
  MAX_POWER: 900,
  MIN_POWER: 220,
  /** 세기 MAX까지 충전 시간(초) */
  CHARGE_TIME: 1.0,
  /** 재장전 쿨다운(초) */
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
  // 조준(각도) — 0~90도, aiming 중 왕복
  angle1: number
  angle2: number
  aimDir1: number // ±1
  aimDir2: number
  aiming1: boolean
  aiming2: boolean
  // 세기 충전
  power1: number
  power2: number
  charging1: boolean
  charging2: boolean
  cd1: number // 재장전 쿨다운 잔여(초)
  cd2: number
  // 점수
  score1: number
  score2: number
  // 박
  potY: number
  potPeriod: number // 왕복 주기(초) — 렌더 보간용
  potPhase: number // 위상(라디안)
  // 발사체
  shots: Shot13[]
}

const DEG = Math.PI / 180

export function create(rand: () => number): Game13State {
  const potPeriod = 2 + rand() // 2~3초 왕복
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

/** 발사체 스폰: owner의 대포에서 고정 각도·세기로 */
function fire(state: Game13State, owner: 1 | 2, angleDeg: number, power: number): void {
  const p = Math.max(G13.MIN_POWER, power)
  const a = angleDeg * DEG
  const dir = owner === 1 ? 1 : -1
  state.shots.push({
    x: owner === 1 ? G13.P1X : G13.P2X,
    y: G13.CANNON_Y,
    vx: dir * p * Math.cos(a),
    vy: -p * Math.sin(a), // 위로(음수)
    owner,
  })
}

export function step(state: Game13State, events: GameInputEvent[], dt: number): Game13State {
  if (state.result) return state
  state.elapsed += dt
  state.cd1 = Math.max(0, state.cd1 - dt)
  state.cd2 = Math.max(0, state.cd2 - dt)

  // 입력: 각도 홀드(down=시작/up=고정), 세기 홀드(down=충전시작/up=발사)
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
          // 떼는 순간 발사 (충전 중이었고 재장전 아님)
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

  // 각도 왕복 (aiming 중에만)
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

  // 세기 충전 (charging 중, MAX까지)
  const chargeRate = G13.MAX_POWER / G13.CHARGE_TIME
  if (state.charging1) state.power1 = Math.min(G13.MAX_POWER, state.power1 + chargeRate * dt)
  if (state.charging2) state.power2 = Math.min(G13.MAX_POWER, state.power2 + chargeRate * dt)

  // 박 상하 왕복
  state.potY = G13.POT_BASE_Y + G13.POT_AMP * Math.sin((state.elapsed / state.potPeriod) * Math.PI * 2 + state.potPhase)

  // 발사체 이동 + 박 충돌 + 화면 밖 제거
  const live: Shot13[] = []
  const potR2 = (G13.POT_R + G13.PROJ_R) * (G13.POT_R + G13.PROJ_R)
  for (const sh of state.shots) {
    sh.x += sh.vx * dt
    sh.y += sh.vy * dt
    sh.vy += G13.GRAV * dt
    const ddx = sh.x - G13.POT_X
    const ddy = sh.y - state.potY
    if (ddx * ddx + ddy * ddy <= potR2) {
      // 박 명중 → 쏜 쪽 +1점, 발사체 소멸
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
