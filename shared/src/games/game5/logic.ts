import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * Game 11 = Light Cycle (Tron).
 *  · Two bikes advance at a constant speed, leaving a trail (wall) on the cells they pass.
 *  · Each player only turns left/right with two keys.
 *      P1: Q=turn left / W=turn right,  P2: U=turn left / I=turn right.
 *  · Hitting a wall (edge) or your own/opponent's trail kills that bike. The last survivor wins.
 *  · Head-on collision (same cell) or simultaneous death is a DRAW. If both survive to 10s, it's also a DRAW.
 */
export const G5 = {
  W: 800,
  H: 450,
  GX: 64,
  GY: 36,
  /** Time to advance one cell (seconds) → speed */
  STEP: 0.05,
} as const

// Direction: 0=right 1=down 2=left 3=up
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

export interface Game5State {
  elapsed: number
  result: GameResult
  gx1: number
  gy1: number
  dir1: number
  /** Pending turn: 0=none 1=left 2=right */
  pend1: number
  gx2: number
  gy2: number
  dir2: number
  pend2: number
  accum: number
  /** Progress ratio for render interpolation (0~1) */
  frac: number
  /** Length GX*GY, 0=empty cell 1=P1 trail 2=P2 trail */
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
    dir1: 0, // right
    pend1: 0,
    gx2,
    gy2,
    dir2: 2, // left
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

  // Turn input (the very last input is applied on the next step)
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
    // Entering the same cell = head-on collision
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
