/**
 * 코인 시스템 상수 — client/server 공유 계약.
 *  · 모든 유저는 STARTING_COINS(30)으로 시작 (DB app_user.coins DEFAULT).
 *  · 오프라인 게임하기: FREE_GAME_IDS만 기본 오픈, 나머지는 UNLOCK_ORDER 순서대로만
 *    해금 가능(순서 강제). n번째 해금 비용 = UNLOCK_COSTS[n].
 *  · 온라인 베팅: 빠른시작 = 승자 +자기 베팅 / 패자 -자기 베팅,
 *    코드방 = 승자 +패자 베팅 / 패자 -자기 베팅. 무승부는 변동 없음.
 */
import type { GameId } from './games/registry'

export const STARTING_COINS = 30

/** 처음부터 열려 있는 오프라인 게임 */
export const FREE_GAME_IDS: readonly GameId[] = [1, 3, 6]

/** 해금 순서 (이 순서로만 해금 가능) */
export const UNLOCK_ORDER: readonly GameId[] = [2, 7, 4, 8, 5, 9, 10]

/** UNLOCK_ORDER[n] 해금 비용 */
export const UNLOCK_COSTS: readonly number[] = [3, 3, 5, 10, 30, 50, 100]

/** 해금 수(app_user.unlocked_count) → 플레이 가능한 게임 집합 */
export function unlockedGameIds(unlockedCount: number): Set<GameId> {
  const n = Math.max(0, Math.min(UNLOCK_ORDER.length, unlockedCount))
  return new Set<GameId>([...FREE_GAME_IDS, ...UNLOCK_ORDER.slice(0, n)])
}

/** 다음 해금 대상. 전부 해금했으면 null */
export function nextUnlock(unlockedCount: number): { gameId: GameId; cost: number } | null {
  if (unlockedCount < 0 || unlockedCount >= UNLOCK_ORDER.length) return null
  return { gameId: UNLOCK_ORDER[unlockedCount], cost: UNLOCK_COSTS[unlockedCount] }
}
