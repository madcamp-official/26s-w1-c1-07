import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * Game 7 = Speed Gomoku (3-in-a-row) · turn-based.
 *  · The system scans the 7×7 board (intersections) in row-major order: [0][0]…[0][6],[1][0]…[6][6].
 *  · Stones are placed on the intersections of the grid lines (Go/Gomoku style).
 *  · Turn-based: at the start, P1 is given TURN_TIME (≈1s, one full loop). Each point is highlighted for CELL_TIME (0.02s).
 *     - When the current-turn player presses their key (P1=Q, P2=U), a stone is placed on the intersection under the cursor and 'immediately' passes to the opponent's turn.
 *       (Pressing an already-filled intersection is ignored — the cursor keeps flowing, so you can aim again.)
 *     - If you fail to place in time, the system places one for you at random on an empty intersection and passes to the opponent's turn.
 *  · W(P1)/I(P2), regardless of whose turn it is, disrupt vision anytime with a FLASH_TIME (0.1s) screen flash.
 *  · The first to make a horizontal/vertical/diagonal 3-in-a-row wins immediately.
 *  · When time runs out: whoever has a 2-in-a-row wins. If both have the same 2-in-a-row status, compare 'density'.
 *  · Density = the sum of the squared distances between every pair of your own stones. The smaller (= more tightly packed) side wins.
 *    ※ Mathematically Σ|pi−pj|² = n·Σ|pi−center|², a 'spread (variance)' measure. The smaller the value, the higher the density, so
 *      to flip the winner direction, just invert DENSITY_SMALLER_WINS.
 */
export const G9 = {
  N: 7,
  CELLS: 49,
  CELL_TIME: 0.02,
  /** One turn length (≈1s) = CELLS × CELL_TIME. The cursor loops around the board exactly once */
  TURN_TIME: 0.98,
  WIN_RUN: 3,
  FLASH_TIME: 0.1,
  /** if true, the side with the smaller (tighter) sum of squared distances wins; if false, the larger (more spread) side wins */
  DENSITY_SMALLER_WINS: true,
} as const

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

export interface Game9State {
  elapsed: number
  result: GameResult
  /** length 49, 0=empty 1=P1 2=P2. index = r*N+c */
  board: number[]
  /** current-turn player (1 or 2) */
  turn: 1 | 2
  /** elapsed time of the current turn (seconds). When it reaches TURN_TIME, an auto placement happens and the turn switches */
  turnClock: number
  /** remaining flash time */
  flash: number
  /** current cursor intersection index for rendering */
  cursor: number
  /** the intersection just placed (for highlighting), or -1 if none */
  lastPlaced: number
  /** whether the previous placement was a timeout auto placement (for render display) */
  lastAuto: boolean
  /** random seed for auto placement */
  seed: number
}

export function create(rand: () => number): Game9State {
  return {
    elapsed: 0,
    result: null,
    board: new Array(G9.CELLS).fill(0),
    turn: 1,
    turnClock: 0,
    flash: 0,
    cursor: 0,
    lastPlaced: -1,
    lastAuto: false,
    seed: (Math.floor(rand() * 4294967296) >>> 0) || 1,
  }
}

/** deterministic LCG random */
function nextRand(seed: number): { u: number; seed: number } {
  const s = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return { u: s / 4294967296, seed: s }
}

const inBounds = (r: number, c: number) => r >= 0 && r < G9.N && c >= 0 && c < G9.N

/** the longest run length formed by the player's stone placed at idx */
function runThrough(board: number[], idx: number, player: number): number {
  const r0 = Math.floor(idx / G9.N)
  const c0 = idx % G9.N
  let best = 0
  for (const [dr, dc] of DIRS) {
    let count = 1
    for (const s of [1, -1]) {
      let r = r0 + dr * s
      let c = c0 + dc * s
      while (inBounds(r, c) && board[r * G9.N + c] === player) {
        count++
        r += dr * s
        c += dc * s
      }
    }
    if (count > best) best = count
  }
  return best
}

/** the player's longest run length across the whole board */
export function maxRun(board: number[], player: number): number {
  let best = 0
  for (let idx = 0; idx < G9.CELLS; idx++) {
    if (board[idx] !== player) continue
    const run = runThrough(board, idx, player)
    if (run > best) best = run
  }
  return best
}

/** density = the sum of squared distances of every pair (= n·center-variance, a 'spread' measure) */
export function density(board: number[], player: number): number {
  const pts: Array<[number, number]> = []
  for (let idx = 0; idx < G9.CELLS; idx++) {
    if (board[idx] === player) pts.push([Math.floor(idx / G9.N), idx % G9.N])
  }
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dr = pts[i][0] - pts[j][0]
      const dc = pts[i][1] - pts[j][1]
      sum += dr * dr + dc * dc
    }
  }
  return sum
}

/** current-turn cursor position (intersection index). Scans from turn start (turnClock=0) */
function cursorAt(turnClock: number): number {
  const i = Math.floor(turnClock / G9.CELL_TIME)
  return i < 0 ? 0 : i >= G9.CELLS ? G9.CELLS - 1 : i
}

/** places the current-turn player's stone at idx and passes the turn. If it makes a 3-in-a-row, sets result */
function placeAndAdvance(state: Game9State, idx: number, auto: boolean) {
  const player = state.turn
  state.board[idx] = player
  state.lastPlaced = idx
  state.lastAuto = auto
  if (runThrough(state.board, idx, player) >= G9.WIN_RUN) {
    state.result = player === 1 ? 'P1' : 'P2'
    return
  }
  // turn switch
  state.turn = player === 1 ? 2 : 1
  state.turnClock = 0
}

/** picks one empty intersection at random. Returns -1 if none */
function randomEmpty(state: Game9State): number {
  const empties: number[] = []
  for (let i = 0; i < G9.CELLS; i++) if (state.board[i] === 0) empties.push(i)
  if (empties.length === 0) return -1
  const r = nextRand(state.seed)
  state.seed = r.seed
  return empties[Math.floor(r.u * empties.length)]
}

export function step(state: Game9State, events: GameInputEvent[], dt: number): Game9State {
  if (state.result) return state
  state.elapsed += dt
  state.turnClock += dt
  state.flash = Math.max(0, state.flash - dt)
  state.cursor = cursorAt(state.turnClock)

  const placeKey = state.turn === 1 ? 'KeyQ' : 'KeyU'
  for (const e of events) {
    if (e.type !== 'down') continue
    // flash works anytime, regardless of whose turn it is
    if (e.code === 'KeyW' || e.code === 'KeyI') {
      state.flash = G9.FLASH_TIME
      continue
    }
    // only the current-turn player's placement key is valid
    if (e.code === placeKey && state.turnClock < G9.TURN_TIME) {
      // online: trust the cell the client picked with its local cursor (e.cell) (only validate my-turn + empty → no cheating advantage:
      //   the cursor sweeps every cell anyway, so any empty cell is reachable by timing).
      // offline/unspecified: judge by the server-side scan cursor (state.cursor).
      const idx =
        typeof e.cell === 'number' && Number.isInteger(e.cell) && e.cell >= 0 && e.cell < G9.CELLS
          ? e.cell
          : state.cursor
      if (state.board[idx] === 0) {
        placeAndAdvance(state, idx, false)
        if (state.result) return state
        break // don't accept new-turn input in this frame
      }
      // already-filled intersection — ignored, you can keep aiming
    }
  }

  // if not placed within the time limit, the system places at random then passes the turn
  if (!state.result && state.turnClock >= G9.TURN_TIME) {
    const idx = randomEmpty(state)
    if (idx >= 0) {
      placeAndAdvance(state, idx, true)
      if (state.result) return state
    } else {
      // if there's nowhere to place (effectively never happens), just pass the turn
      state.turn = state.turn === 1 ? 2 : 1
      state.turnClock = 0
    }
  }

  if (state.elapsed >= GAME_DURATION) {
    state.result = resolveTimeout(state.board)
  }
  return state
}

/** decide win/loss when time runs out */
export function resolveTimeout(board: number[]): GameResult {
  const has2p1 = maxRun(board, 1) >= 2
  const has2p2 = maxRun(board, 2) >= 2
  // (5) whoever has a 2-in-a-row wins — if only one side has it, that side wins
  if (has2p1 && !has2p2) return 'P1'
  if (has2p2 && !has2p1) return 'P2'

  // (6) if both have the same 2-in-a-row status, compare density
  const d1 = density(board, 1)
  const d2 = density(board, 2)
  if (d1 === d2) return 'DRAW'
  const p1Wins = G9.DENSITY_SMALLER_WINS ? d1 < d2 : d1 > d2
  return p1Wins ? 'P1' : 'P2'
}
