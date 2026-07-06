/**
 * 코인 시스템 상수 — client/server 공유 계약.
 *  · 모든 유저는 STARTING_COINS(30)으로 시작 (DB app_user.coins DEFAULT).
 *  · 오프라인 게임하기: GAME_ORDER 순서로 표시하며, 마지막 두 게임(LOCKABLE_GAME_IDS)만
 *    잠겨 있고 나머지(FREE_GAME_IDS)는 처음부터 오픈. 잠긴 두 게임은 순서와 무관하게
 *    자유롭게(각각 독립적으로) 코인으로 해금할 수 있다.
 *  · 온라인 베팅: 최소 1코인. 빠른시작 = 승자 +자기 베팅 / 패자 -자기 베팅,
 *    코드방 = 승자 +패자 베팅 / 패자 -자기 베팅. 무승부는 변동 없음.
 *
 * 해금 상태 저장(app_user.unlocked_count):
 *   이 정수 컬럼은 이제 "개수"가 아니라 LOCKABLE_GAME_IDS 순서의 **비트마스크**로 쓴다.
 *   (bit i = LOCKABLE_GAME_IDS[i] 해금됨) — 순서 무관 자유 해금을 위해 재해석한 것으로,
 *   잠금 대상이 2개뿐이라 값 범위 0..3 이면 충분해 스키마 마이그레이션이 필요 없다.
 */
import type { GameId } from './games/registry'

export const STARTING_COINS = 30

/**
 * 오프라인 게임 선택 화면의 표시(=플레이) 순서.
 * 내부 id 자체가 화면 순서와 일치하므로 이 배열은 항등(1..13)이다.
 * (화면 라벨 "GAME N" = 배열 위치 = 게임 id)
 */
export const GAME_ORDER: readonly GameId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

/**
 * 잠긴 게임(코인 해금 대상) = 게임 9·10 고정. 그 외(신규 11·12·13 포함)는 처음부터 오픈.
 * (신규 게임 추가 시 잠금이 마지막 두 개로 밀려나지 않도록 명시 고정 — unlocked_count 비트마스크
 *  의미도 bit0=9·bit1=10로 유지돼 기존 유저 해금 상태가 보존된다.)
 */
export const LOCKABLE_GAME_IDS: readonly GameId[] = [9, 10]

/** 기본 오픈 게임 = 잠금 대상을 제외한 나머지 (비로그인 유저도 플레이 가능) */
export const FREE_GAME_IDS: readonly GameId[] = GAME_ORDER.filter(
  (id) => !LOCKABLE_GAME_IDS.includes(id),
)

/** 게임별 해금 비용 (LOCKABLE 게임만 의미 있음) */
const UNLOCK_COST_BY_ID: Readonly<Record<number, number>> = {
  [LOCKABLE_GAME_IDS[0]]: 30,
  [LOCKABLE_GAME_IDS[1]]: 50,
}

/** 이 게임이 코인 해금 대상인지 */
export function isLockable(gameId: number): gameId is GameId {
  return (LOCKABLE_GAME_IDS as readonly number[]).includes(gameId)
}

/** LOCKABLE_GAME_IDS 내 위치 비트(bit i = LOCKABLE[i]). 대상이 아니면 0 */
export function unlockBit(gameId: number): number {
  const i = (LOCKABLE_GAME_IDS as readonly number[]).indexOf(gameId)
  return i < 0 ? 0 : 1 << i
}

/** 게임 해금 비용. 잠금 대상이 아니면 0 */
export function unlockCost(gameId: number): number {
  return UNLOCK_COST_BY_ID[gameId] ?? 0
}

/**
 * 해금 상태(unlocked_count 비트마스크) → 플레이 가능한 게임 집합.
 *  · FREE_GAME_IDS 는 항상 포함.
 *  · bit i 가 켜져 있으면 LOCKABLE_GAME_IDS[i] 추가.
 */
export function unlockedGameIds(unlockMask: number): Set<GameId> {
  const s = new Set<GameId>(FREE_GAME_IDS)
  LOCKABLE_GAME_IDS.forEach((id, i) => {
    if (unlockMask & (1 << i)) s.add(id)
  })
  return s
}

/** 특정 게임이 이미 해금(또는 기본 오픈)됐는지 */
export function isUnlocked(unlockMask: number, gameId: number): boolean {
  return unlockedGameIds(unlockMask).has(gameId as GameId)
}

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
