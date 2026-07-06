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

// ── 코인 노가다 (coin farm) — 솔로 펌프 미션 (docs/COINS.md) ──────
// 로그인 유저 1인이 U/I 키로 펌프를 쳐서 제한시간 안에 목표 점수를 채우면 코인 지급.
// 오답 1회 = 즉시 MISSION FAILED. 보상 액수는 서버가 확률표로 굴린다(클라 지정 불가).

/** 제한시간(초) */
export const FARM_DURATION = 10
/** 미션 목표 점수 (정답 타수) */
export const FARM_TARGET = 25
/** 연속 보상 수령 최소 간격(ms) — 서버 쿨다운 (정상 플레이는 클리어에 최소 수 초 소요) */
export const FARM_CLAIM_COOLDOWN_MS = 5000

/**
 * 보상 확률표 [코인, 가중치] (가중치 합 1000).
 * 기댓값 = 4700/1000 = 4.7코인 (≈5), 최소 1 / 최대 100.
 */
export const FARM_REWARD_TABLE: readonly (readonly [number, number])[] = [
  [1, 300],
  [2, 200],
  [3, 150],
  [5, 180],
  [10, 110],
  [20, 50],
  [50, 9],
  [100, 1],
]

/** 확률표에서 보상 1회 추첨. rand: [0,1) 균등난수 */
export function rollFarmReward(rand: () => number): number {
  let r = rand() * 1000
  for (const [coin, weight] of FARM_REWARD_TABLE) {
    r -= weight
    if (r < 0) return coin
  }
  return FARM_REWARD_TABLE[FARM_REWARD_TABLE.length - 1][0]
}

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
