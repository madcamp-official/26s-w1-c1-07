/**
 * Prisma client singleton + match result persistence.
 * The DB only records the match final result (game_match) + per-round (game_round) — live state is not stored.
 */
import { PrismaClient, type MatchResult } from '@prisma/client'
import type { SlotResult } from '@madcade/shared'

export const prisma = new PrismaClient()

/** Stored data for one round (slot-based result) */
export interface RoundRecord {
  roundIndex: number
  gameType: number
  result: SlotResult
}

/**
 * On match end, INSERT 1 game_match row + N game_round rows in a single transaction.
 * @returns the stored game_match.id (string)
 */
export async function persistMatch(
  playerAId: bigint,
  playerBId: bigint,
  result: SlotResult,
  rounds: RoundRecord[],
): Promise<string> {
  const match = await prisma.gameMatch.create({
    data: {
      playerAId,
      playerBId,
      result: result as MatchResult,
      rounds: {
        create: rounds.map((r) => ({
          roundIndex: r.roundIndex,
          gameType: r.gameType,
          result: r.result as MatchResult,
        })),
      },
    },
  })
  return match.id.toString()
}

/**
 * Match coin settlement — adjusts both players' coins in a single transaction and returns the post-settlement balances.
 * (The bet amount is validated against holdings at join time. Guards against negative balances / coin creation even if holdings at settlement are less than the bet.)
 *
 * @param transfer (optional) In a code-room zero-sum settlement, the amount "the winner receives from the loser".
 *   When specified, it limits the winner's payout to the loser's 'actual' deduction to prevent unauthorized coin creation (review #4).
 *   winnerIsA = whether the winner is slot A. Quick start (house funding) omits transfer → existing behavior.
 */
export async function settleCoins(
  aId: bigint,
  deltaA: number,
  bId: bigint,
  deltaB: number,
  transfer?: { amount: number; winnerIsA: boolean },
): Promise<{ a: number; b: number; deltaA: number; deltaB: number }> {
  return prisma.$transaction(async (tx) => {
    const [ua, ub] = await Promise.all([
      tx.appUser.findUniqueOrThrow({ where: { id: aId }, select: { coins: true } }),
      tx.appUser.findUniqueOrThrow({ where: { id: bId }, select: { coins: true } }),
    ])
    let da = deltaA
    let db = deltaB
    // Code room (zero-sum): transfer only as much as the loser can actually pay — prevents overpaying the winner even if holdings are less than the bet.
    if (transfer) {
      const loserBal = transfer.winnerIsA ? ub.coins : ua.coins
      const actual = Math.max(0, Math.min(transfer.amount, loserBal))
      da = transfer.winnerIsA ? actual : -actual
      db = transfer.winnerIsA ? -actual : actual
    }
    const na = Math.max(0, ua.coins + da)
    const nb = Math.max(0, ub.coins + db)
    await Promise.all([
      tx.appUser.update({ where: { id: aId }, data: { coins: na } }),
      tx.appUser.update({ where: { id: bId }, data: { coins: nb } }),
    ])
    // The actually-applied deltas (with clamping) — used as-is in the match:end notification
    return { a: na, b: nb, deltaA: na - ua.coins, deltaB: nb - ub.coins }
  })
}

