import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * 게임7 = 스피드 오목(3목) · 턴제.
 *  · 7×7 판(교점)을 시스템이 행 우선(row-major)으로 순회한다: [0][0]…[0][6],[1][0]…[6][6].
 *  · 돌은 격자선의 교점 위에 놓인다(바둑/오목 방식).
 *  · 턴제: 시작하면 P1에게 TURN_TIME(≈1s, 한 바퀴)이 주어진다. 각 점은 CELL_TIME(0.02s)씩 강조.
 *     - 현재 턴 플레이어가 자기 키(P1=Q, P2=U)를 누르면 커서가 있는 교점에 돌을 놓고 '즉시' 상대 턴으로.
 *       (이미 찬 교점을 누르면 무시 — 커서는 계속 흐르므로 다시 노릴 수 있다.)
 *     - 시간 안에 못 놓으면 시스템이 빈 교점 중 하나에 랜덤으로 대신 놓고 상대 턴으로 넘긴다.
 *  · W(P1)/I(P2)는 턴과 무관하게 언제든 FLASH_TIME(0.1s) 화면 플래시로 시야 방해.
 *  · 먼저 가로/세로/대각 3목을 만들면 즉시 승리.
 *  · 시간이 끝나면: 2목이 있는 사람이 승. 둘 다 2목 여부가 같으면 '밀집도' 비교.
 *  · 밀집도 = 자기 돌들의 모든 쌍 사이 거리 제곱의 총합. 값이 작은(=더 촘촘한) 쪽이 승리.
 *    ※ 수학적으로 Σ|pi−pj|² = n·Σ|pi−중심|² 로 '퍼짐(분산)' 척도다. 값이 작을수록 고밀도이므로
 *      승자 방향을 바꾸려면 DENSITY_SMALLER_WINS만 뒤집으면 된다.
 */
export const G7 = {
  N: 7,
  CELLS: 49,
  CELL_TIME: 0.02,
  /** 한 턴 길이(≈1s) = CELLS × CELL_TIME. 커서가 판을 정확히 한 바퀴 돈다 */
  TURN_TIME: 0.98,
  WIN_RUN: 3,
  FLASH_TIME: 0.1,
  /** true면 거리제곱합이 작은(촘촘한) 쪽 승, false면 큰(퍼진) 쪽 승 */
  DENSITY_SMALLER_WINS: true,
} as const

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

export interface Game7State {
  elapsed: number
  result: GameResult
  /** 길이 49, 0=빈칸 1=P1 2=P2. 인덱스 = r*N+c */
  board: number[]
  /** 현재 턴 플레이어(1 또는 2) */
  turn: 1 | 2
  /** 현재 턴 경과 시간(초). TURN_TIME에 도달하면 자동 배치 후 턴 전환 */
  turnClock: number
  /** 플래시 잔여 시간 */
  flash: number
  /** 렌더용 현재 커서 교점 인덱스 */
  cursor: number
  /** 방금 놓인 교점(하이라이트용), 없으면 -1 */
  lastPlaced: number
  /** 직전 배치가 시간초과 자동 배치였는지(렌더 표시용) */
  lastAuto: boolean
  /** 자동 배치용 난수 시드 */
  seed: number
}

export function create(rand: () => number): Game7State {
  return {
    elapsed: 0,
    result: null,
    board: new Array(G7.CELLS).fill(0),
    turn: 1,
    turnClock: 0,
    flash: 0,
    cursor: 0,
    lastPlaced: -1,
    lastAuto: false,
    seed: (Math.floor(rand() * 4294967296) >>> 0) || 1,
  }
}

/** 결정적 LCG 난수 */
function nextRand(seed: number): { u: number; seed: number } {
  const s = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return { u: s / 4294967296, seed: s }
}

const inBounds = (r: number, c: number) => r >= 0 && r < G7.N && c >= 0 && c < G7.N

/** idx에 놓인 player 돌이 만드는 최장 연속 길이 */
function runThrough(board: number[], idx: number, player: number): number {
  const r0 = Math.floor(idx / G7.N)
  const c0 = idx % G7.N
  let best = 0
  for (const [dr, dc] of DIRS) {
    let count = 1
    for (const s of [1, -1]) {
      let r = r0 + dr * s
      let c = c0 + dc * s
      while (inBounds(r, c) && board[r * G7.N + c] === player) {
        count++
        r += dr * s
        c += dc * s
      }
    }
    if (count > best) best = count
  }
  return best
}

/** 판 전체에서 player의 최장 연속 길이 */
export function maxRun(board: number[], player: number): number {
  let best = 0
  for (let idx = 0; idx < G7.CELLS; idx++) {
    if (board[idx] !== player) continue
    const run = runThrough(board, idx, player)
    if (run > best) best = run
  }
  return best
}

/** 밀집도 = 모든 쌍 거리 제곱의 총합 (= n·중심분산, '퍼짐' 척도) */
export function density(board: number[], player: number): number {
  const pts: Array<[number, number]> = []
  for (let idx = 0; idx < G7.CELLS; idx++) {
    if (board[idx] === player) pts.push([Math.floor(idx / G7.N), idx % G7.N])
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

/** 현재 턴 커서 위치(교점 인덱스). 턴 시작(turnClock=0)부터 순회 */
function cursorAt(turnClock: number): number {
  const i = Math.floor(turnClock / G7.CELL_TIME)
  return i < 0 ? 0 : i >= G7.CELLS ? G7.CELLS - 1 : i
}

/** idx에 현재 턴 플레이어 돌을 놓고 턴을 넘긴다. 3목이면 result 세팅 */
function placeAndAdvance(state: Game7State, idx: number, auto: boolean) {
  const player = state.turn
  state.board[idx] = player
  state.lastPlaced = idx
  state.lastAuto = auto
  if (runThrough(state.board, idx, player) >= G7.WIN_RUN) {
    state.result = player === 1 ? 'P1' : 'P2'
    return
  }
  // 턴 전환
  state.turn = player === 1 ? 2 : 1
  state.turnClock = 0
}

/** 빈 교점 중 하나를 랜덤으로 고른다. 없으면 -1 */
function randomEmpty(state: Game7State): number {
  const empties: number[] = []
  for (let i = 0; i < G7.CELLS; i++) if (state.board[i] === 0) empties.push(i)
  if (empties.length === 0) return -1
  const r = nextRand(state.seed)
  state.seed = r.seed
  return empties[Math.floor(r.u * empties.length)]
}

export function step(state: Game7State, events: GameInputEvent[], dt: number): Game7State {
  if (state.result) return state
  state.elapsed += dt
  state.turnClock += dt
  state.flash = Math.max(0, state.flash - dt)
  state.cursor = cursorAt(state.turnClock)

  const placeKey = state.turn === 1 ? 'KeyQ' : 'KeyU'
  for (const e of events) {
    if (e.type !== 'down') continue
    // 플래시는 턴과 무관하게 언제든
    if (e.code === 'KeyW' || e.code === 'KeyI') {
      state.flash = G7.FLASH_TIME
      continue
    }
    // 현재 턴 플레이어의 배치 키만 유효
    if (e.code === placeKey && state.turnClock < G7.TURN_TIME) {
      // 온라인: 클라가 로컬 커서로 고른 칸(e.cell)을 신뢰(내 턴·빈칸만 검증 → 치팅 이득 없음:
      //   커서는 어차피 전 칸을 훑으므로 어떤 빈칸이든 타이밍으로 도달 가능).
      // 오프라인/미지정: 서버측 스캔 커서(state.cursor)로 판정.
      const idx =
        typeof e.cell === 'number' && Number.isInteger(e.cell) && e.cell >= 0 && e.cell < G7.CELLS
          ? e.cell
          : state.cursor
      if (state.board[idx] === 0) {
        placeAndAdvance(state, idx, false)
        if (state.result) return state
        break // 이번 프레임에서 새 턴 입력은 받지 않는다
      }
      // 이미 찬 교점 — 무시하고 계속 노릴 수 있음
    }
  }

  // 제한시간 안에 못 놓았으면 시스템이 랜덤 배치 후 턴 넘김
  if (!state.result && state.turnClock >= G7.TURN_TIME) {
    const idx = randomEmpty(state)
    if (idx >= 0) {
      placeAndAdvance(state, idx, true)
      if (state.result) return state
    } else {
      // 둘 곳이 없으면(사실상 발생 X) 턴만 넘긴다
      state.turn = state.turn === 1 ? 2 : 1
      state.turnClock = 0
    }
  }

  if (state.elapsed >= GAME_DURATION) {
    state.result = resolveTimeout(state.board)
  }
  return state
}

/** 시간 종료 시 승패 판정 */
export function resolveTimeout(board: number[]): GameResult {
  const has2p1 = maxRun(board, 1) >= 2
  const has2p2 = maxRun(board, 2) >= 2
  // (5) 2목이 있는 사람이 승 — 한쪽만 2목이면 그쪽 승
  if (has2p1 && !has2p2) return 'P1'
  if (has2p2 && !has2p1) return 'P2'

  // (6) 둘 다 2목 여부가 같으면 밀집도 비교
  const d1 = density(board, 1)
  const d2 = density(board, 2)
  if (d1 === d2) return 'DRAW'
  const p1Wins = G7.DENSITY_SMALLER_WINS ? d1 < d2 : d1 > d2
  return p1Wins ? 'P1' : 'P2'
}
