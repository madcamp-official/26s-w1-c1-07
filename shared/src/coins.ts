/**
 * Coin system constants — shared client/server contract.
 *  · Every user starts with STARTING_COINS (30) (DB app_user.coins DEFAULT).
 *  · Offline play: displayed in GAME_ORDER order; only the last two games (LOCKABLE_GAME_IDS)
 *    are locked, and the rest (FREE_GAME_IDS) are open from the start. The two locked games can be
 *    unlocked with coins freely (each independently), regardless of order.
 *  · Online betting: minimum 1 coin. Quick start = winner +own bet / loser -own bet,
 *    code room = winner +loser's bet / loser -own bet. A draw causes no change.
 *
 * Unlock state storage (app_user.unlocked_count):
 *   This integer column is now used not as a "count" but as a **bitmask** over LOCKABLE_GAME_IDS order.
 *   (bit i = LOCKABLE_GAME_IDS[i] unlocked) — reinterpreted to allow order-independent free unlocking,
 *   and since there are only 2 lockable games, a value range of 0..3 is enough, so no schema migration is needed.
 */
import type { GameId } from './games/registry'

export const STARTING_COINS = 30

/**
 * Display (= play) order of the offline game select screen.
 * After the full renumbering, the internal id itself matches the screen order, so this array is the identity (1..13).
 * (screen label "GAME N" = array position = game id)
 */
export const GAME_ORDER: readonly GameId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

/**
 * Locked games (coin-unlock targets) = games 9 & 10, fixed. Everything else (including the new 11/12/13) is open from the start.
 * (Pinned explicitly so adding games doesn't push the lock onto the last two — this keeps the unlocked_count bitmask
 *  meaning bit0=9 / bit1=10, preserving existing users' unlock state.)
 */
export const LOCKABLE_GAME_IDS: readonly GameId[] = [9, 10]

/** Default-open games = everything except the lockable ones (playable even by logged-out users) */
export const FREE_GAME_IDS: readonly GameId[] = GAME_ORDER.filter(
  (id) => !LOCKABLE_GAME_IDS.includes(id),
)

/** Unlock cost per game (only meaningful for LOCKABLE games) */
const UNLOCK_COST_BY_ID: Readonly<Record<number, number>> = {
  [LOCKABLE_GAME_IDS[0]]: 30,
  [LOCKABLE_GAME_IDS[1]]: 50,
}

/** Whether this game is a coin-unlock target */
export function isLockable(gameId: number): gameId is GameId {
  return (LOCKABLE_GAME_IDS as readonly number[]).includes(gameId)
}

/** Position bit within LOCKABLE_GAME_IDS (bit i = LOCKABLE[i]). 0 if not a target */
export function unlockBit(gameId: number): number {
  const i = (LOCKABLE_GAME_IDS as readonly number[]).indexOf(gameId)
  return i < 0 ? 0 : 1 << i
}

/** Game unlock cost. 0 if not a lock target */
export function unlockCost(gameId: number): number {
  return UNLOCK_COST_BY_ID[gameId] ?? 0
}

/**
 * Unlock state (unlocked_count bitmask) → set of playable games.
 *  · FREE_GAME_IDS is always included.
 *  · If bit i is set, add LOCKABLE_GAME_IDS[i].
 */
export function unlockedGameIds(unlockMask: number): Set<GameId> {
  const s = new Set<GameId>(FREE_GAME_IDS)
  LOCKABLE_GAME_IDS.forEach((id, i) => {
    if (unlockMask & (1 << i)) s.add(id)
  })
  return s
}

/** Whether a specific game is already unlocked (or open by default) */
export function isUnlocked(unlockMask: number, gameId: number): boolean {
  return unlockedGameIds(unlockMask).has(gameId as GameId)
}

// ── Coin farm — solo Pump mission (docs/COINS.md) ──────
// A single logged-in user taps Pump with the U/I keys and, if they hit the target score within the time limit, earns coins.
// One wrong answer = immediate MISSION FAILED. The reward amount is rolled by the server from a probability table (the client cannot specify it).

/** Time limit (seconds) */
export const FARM_DURATION = 10
/** Mission target score (correct hits) */
export const FARM_TARGET = 25
/** Minimum interval between consecutive reward claims (ms) — server cooldown (normal play takes at least a few seconds to clear) */
export const FARM_CLAIM_COOLDOWN_MS = 5000

/**
 * Reward probability table [coins, weight] (weights sum to 1000).
 * Expected value = 4700/1000 = 4.7 coins (≈5), min 1 / max 100.
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

/** Draw one reward from the probability table. rand: uniform random in [0,1) */
export function rollFarmReward(rand: () => number): number {
  let r = rand() * 1000
  for (const [coin, weight] of FARM_REWARD_TABLE) {
    r -= weight
    if (r < 0) return coin
  }
  return FARM_REWARD_TABLE[FARM_REWARD_TABLE.length - 1][0]
}
