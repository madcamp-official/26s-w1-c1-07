/**
 * 서버측 게임 코어 어댑터 — gameId로 create/step dispatch,
 * 입력 code를 role의 물리키로 재기입(안티치트), 상태 투영(seed 등 비전송).
 */
import { GAME_CORES, type GameId, type Role } from '@madpump/shared'
import type { GameInputEvent, GameResult } from '@madpump/shared'

/* eslint-disable @typescript-eslint/no-explicit-any */
type State = { elapsed: number; result: GameResult } & Record<string, any>

export function createState(gameId: GameId, rand: () => number): State {
  return GAME_CORES[gameId].create(rand) as State
}

export function stepState(
  gameId: GameId,
  state: State,
  events: GameInputEvent[],
  dt: number,
): State {
  return GAME_CORES[gameId].step(state, events, dt) as State
}

/**
 * 클라가 보낸 code(슬롯)를 그 플레이어 role의 물리키로 덮어쓴다.
 * 슬롯A = KeyQ|KeyU → P1이면 KeyQ, P2면 KeyU / 슬롯B = KeyW|KeyI → P1이면 KeyW, P2면 KeyI.
 * 클라 code를 신뢰하지 않고 서버 세션의 role로만 결정(스푸핑 방지).
 */
export function rewriteCodeForRole(
  code: GameInputEvent['code'],
  role: Role,
): GameInputEvent['code'] {
  const slotA = code === 'KeyQ' || code === 'KeyU'
  if (role === 'P1') return slotA ? 'KeyQ' : 'KeyW'
  return slotA ? 'KeyU' : 'KeyI'
}

/**
 * 렌더 투영 — 클라로 보낼 상태에서 비전송 필드(seed 등) 제거.
 * game-lab 상태는 전부 직렬화 가능(seed:number). seed는 치팅 방지 위해 제거.
 */
export function projectState(state: State): unknown {
  const { seed, rng, ...view } = state as Record<string, unknown>
  void seed
  void rng
  return view
}
