import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * 게임11 = 라이트 사이클(Tron).
 *  · 두 바이크가 일정 속도로 전진하며 지나온 칸에 궤적(벽)을 남긴다.
 *  · 각 플레이어는 두 키로 좌/우 회전만 한다.
 *      P1: Q=좌회전 / W=우회전,  P2: U=좌회전 / I=우회전.
 *  · 벽(외곽)·자신/상대 궤적에 부딪히면 그 바이크는 죽는다. 마지막 생존자 승.
 *  · 정면충돌(같은 칸)·동시 사망은 DRAW. 10초까지 둘 다 생존해도 DRAW.
 */
export const G5 = {
  W: 800,
  H: 450,
  GX: 64,
  GY: 36,
  /** 한 칸 전진에 걸리는 시간(초) → 속도 */
  STEP: 0.05,
} as const

// 방향: 0=우 1=하 2=좌 3=상
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

export interface Game5State {
  elapsed: number
  result: GameResult
  gx1: number
  gy1: number
  dir1: number
  /** 대기 회전: 0=없음 1=좌 2=우 */
  pend1: number
  gx2: number
  gy2: number
  dir2: number
  pend2: number
  accum: number
  /** 렌더 보간용 진행률(0~1) */
  frac: number
  /** 길이 GX*GY, 0=빈칸 1=P1궤적 2=P2궤적 */
  occ: number[]
}

const idx = (x: number, y: number) => y * G5.GX + x
const inBounds = (x: number, y: number) => x >= 0 && x < G5.GX && y >= 0 && y < G5.GY
const turn = (dir: number, pend: number) =>
  pend === 1 ? (dir + 3) % 4 : pend === 2 ? (dir + 1) % 4 : dir

export function create(_rand: () => number): Game5State {
  const occ = new Array(G5.GX * G5.GY).fill(0)
  const gx1 = 10
  const gy1 = 15
  const gx2 = G5.GX - 11
  const gy2 = 21
  occ[idx(gx1, gy1)] = 1
  occ[idx(gx2, gy2)] = 2
  return {
    elapsed: 0,
    result: null,
    gx1,
    gy1,
    dir1: 0, // 우
    pend1: 0,
    gx2,
    gy2,
    dir2: 2, // 좌
    pend2: 0,
    accum: 0,
    frac: 0,
    occ,
  }
}

export function step(state: Game5State, events: GameInputEvent[], dt: number): Game5State {
  if (state.result) return state
  state.elapsed += dt
  state.accum += dt

  // 회전 입력(가장 마지막 입력이 다음 스텝에 반영)
  for (const e of events) {
    if (e.type !== 'down') continue
    switch (e.code) {
      case 'KeyQ':
        state.pend1 = 1
        break
      case 'KeyW':
        state.pend1 = 2
        break
      case 'KeyU':
        state.pend2 = 1
        break
      case 'KeyI':
        state.pend2 = 2
        break
    }
  }

  while (state.accum >= G5.STEP && !state.result) {
    state.accum -= G5.STEP

    state.dir1 = turn(state.dir1, state.pend1)
    state.dir2 = turn(state.dir2, state.pend2)
    state.pend1 = 0
    state.pend2 = 0

    const n1x = state.gx1 + DX[state.dir1]
    const n1y = state.gy1 + DY[state.dir1]
    const n2x = state.gx2 + DX[state.dir2]
    const n2y = state.gy2 + DY[state.dir2]

    let dead1 = !inBounds(n1x, n1y) || state.occ[idx(n1x, n1y)] !== 0
    let dead2 = !inBounds(n2x, n2y) || state.occ[idx(n2x, n2y)] !== 0
    // 같은 칸으로 진입 = 정면충돌
    if (n1x === n2x && n1y === n2y) {
      dead1 = true
      dead2 = true
    }

    if (dead1 || dead2) {
      state.result = dead1 && dead2 ? 'DRAW' : dead1 ? 'P2' : 'P1'
      return state
    }

    state.gx1 = n1x
    state.gy1 = n1y
    state.occ[idx(n1x, n1y)] = 1
    state.gx2 = n2x
    state.gy2 = n2y
    state.occ[idx(n2x, n2y)] = 2
  }

  state.frac = state.accum / G5.STEP

  if (state.elapsed >= GAME_DURATION) state.result = 'DRAW'
  return state
}
