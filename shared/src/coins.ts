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
 * 전면 재번호 이후 내부 id 자체가 화면 순서와 일치하므로 이 배열은 항등(1..10)이다.
 * (화면 라벨 "GAME N" = 배열 위치 = 게임 id)
 */
export const GAME_ORDER: readonly GameId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** 잠긴 게임 = 표시 순서의 마지막 두 개(코인으로 해금). 그 외는 처음부터 오픈. */
export const LOCKABLE_GAME_IDS: readonly GameId[] = [GAME_ORDER[GAME_ORDER.length - 2], GAME_ORDER[GAME_ORDER.length - 1]]

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
