import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * 게임12 = RED LIGHT, GREEN LIGHT (무궁화 꽃이 피었습니다).
 *  · 두 플레이어는 왼쪽 출발선(pos=0)에서 오른쪽 술래/도착선(pos=1)을 향해 달린다.
 *  · Q(P1)/U(P2) 연타로 전진(관성 있음 — 안 누르면 서서히 감속). W(P1)/I(P2)=급정거(속도 0).
 *  · 술래는 랜덤 간격으로 green(등 돌림·안전) ↔ red(응시·위험). red 직전 TELEGRAPH(0.2s) 예고.
 *  · red 중 속도가 CAUGHT_SPEED 이상이면 적발 → 그 플레이어 즉시 패배(상대 승).
 *    둘 다 같은 프레임에 적발되면 술래에 더 가까운(pos 큰) 쪽이 잡아먹혀 패배.
 *  · red가 아닐 때 도착선(pos>=1) 도달 → 즉시 승리.
 *  · 10초 종료 시 아무도 못 끝냈으면 더 가까운(pos 큰) 쪽 승, 동률이면 DRAW.
 *
 * 술래 스케줄(reds)은 create(rand)에서 미리 굽는다(서버 권위 — 결정적). 렌더는 elapsed로 phase 파생.
 */
export const G12 = {
  /** 최대 속도(pos/초). 낮게 잡아 한 번의 green으로 결승선에 못 닿게 — 여러 red를 넘어야 도착 */
  V_MAX: 0.6,
  /** 연타 1회 임펄스(pos/초). 사람이 ~10회/초 연타 시 ~0.45 pos/초 유지 */
  MASH: 0.13,
  /** 지수 감속 계수(1/초) — 안 누르면 v *= e^(-FRICTION·dt).
   *  0.2s 코스팅만으론 임계값 아래로 못 내려가 → 반드시 급정거(W/I)로 멈춰야 안전(의도된 난이도) */
  FRICTION: 3.4,
  /** red 중 적발 속도 임계값(pos/초) */
  CAUGHT_SPEED: 0.12,
  /** red 직전 예고 시간(초) — 술래가 도는 동안 멈출 여유 */
  TELEGRAPH: 0.35,
  FINISH: 1.0,
} as const

export interface Game12State {
  elapsed: number
  result: GameResult
  pos1: number
  v1: number
  pos2: number
  v2: number
  /** 적발(잡아먹힘) 여부 — 렌더 연출용 */
  caught1: boolean
  caught2: boolean
  /** red 구간 평탄 배열 [s0,e0,s1,e1,...] (elapsed 기준). 렌더가 phase 판정에 재사용 */
  reds: number[]
}

/** elapsed가 red 구간 안(응시 중)인지 */
export function isRed(reds: number[], elapsed: number): boolean {
  for (let i = 0; i < reds.length; i += 2) {
    if (elapsed >= reds[i] && elapsed < reds[i + 1]) return true
  }
  return false
}

/** 예고(turning) 중인지 — red 시작 0.2s 전 */
export function isTelegraph(reds: number[], elapsed: number): boolean {
  for (let i = 0; i < reds.length; i += 2) {
    if (elapsed >= reds[i] - G12.TELEGRAPH && elapsed < reds[i]) return true
  }
  return false
}

export function create(rand: () => number): Game12State {
  // green(0.7~1.7s) ↔ red(0.6~1.3s) 교대 스케줄을 10초까지 굽는다. 첫 red는 0.6~1.2s(빨리 개입).
  const reds: number[] = []
  let t = 0.6 + rand() * 0.6
  while (t < GAME_DURATION) {
    const redDur = 0.6 + rand() * 0.7
    const s = t
    const e = Math.min(GAME_DURATION, t + redDur)
    reds.push(s, e)
    t = e + (0.7 + rand() * 1.0) // 다음 green
  }
  return {
    elapsed: 0,
    result: null,
    pos1: 0,
    v1: 0,
    pos2: 0,
    v2: 0,
    caught1: false,
    caught2: false,
    reds,
  }
}

export function step(state: Game12State, events: GameInputEvent[], dt: number): Game12State {
  if (state.result) return state
  state.elapsed += dt

  // 입력: 연타 임펄스 / 급정거
  for (const e of events) {
    if (e.type !== 'down') continue
    switch (e.code) {
      case 'KeyQ':
        state.v1 = Math.min(G12.V_MAX, state.v1 + G12.MASH)
        break
      case 'KeyW':
        state.v1 = 0
        break
      case 'KeyU':
        state.v2 = Math.min(G12.V_MAX, state.v2 + G12.MASH)
        break
      case 'KeyI':
        state.v2 = 0
        break
    }
  }

  // 관성 이동 + 지수 감속 (뒤로는 안 감)
  const decay = Math.exp(-G12.FRICTION * dt)
  state.pos1 = Math.min(G12.FINISH, state.pos1 + state.v1 * dt)
  state.pos2 = Math.min(G12.FINISH, state.pos2 + state.v2 * dt)
  state.v1 = Math.max(0, state.v1 * decay)
  state.v2 = Math.max(0, state.v2 * decay)

  // red 중 적발 판정 (예고 구간은 제외 — 그때 멈추면 안전)
  if (isRed(state.reds, state.elapsed)) {
    if (state.v1 >= G12.CAUGHT_SPEED) state.caught1 = true
    if (state.v2 >= G12.CAUGHT_SPEED) state.caught2 = true
    if (state.caught1 || state.caught2) {
      state.result =
        state.caught1 && state.caught2
          ? state.pos1 > state.pos2
            ? 'P2'
            : state.pos2 > state.pos1
              ? 'P1'
              : 'DRAW'
          : state.caught1
            ? 'P2'
            : 'P1'
      return state
    }
  }

  // 도착선 도달 → 승리 (red가 아니거나, red라도 위에서 적발 안 됐으면 = 느리게 넘은 것)
  const f1 = state.pos1 >= G12.FINISH
  const f2 = state.pos2 >= G12.FINISH
  if (f1 || f2) {
    state.result = f1 && f2 ? 'DRAW' : f1 ? 'P1' : 'P2'
    return state
  }

  // 시간 종료 → 더 가까운(pos 큰) 쪽 승
  if (state.elapsed >= GAME_DURATION) {
    state.result = state.pos1 > state.pos2 ? 'P1' : state.pos2 > state.pos1 ? 'P2' : 'DRAW'
  }
  return state
}
