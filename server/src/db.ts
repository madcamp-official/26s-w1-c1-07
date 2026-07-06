/**
 * Prisma 클라이언트 싱글턴 + 매치 결과 영속화.
 * DB엔 매치 최종결과(game_match) + 라운드별(game_round)만 기록 — 라이브 상태는 저장 안 함.
 */
import { PrismaClient, type MatchResult } from '@prisma/client'
import type { SlotResult } from '@madpump/shared'

export const prisma = new PrismaClient()

/** 한 라운드의 저장 데이터 (슬롯 기준 결과) */
export interface RoundRecord {
  roundIndex: number
  gameType: number
  result: SlotResult
}

/**
 * 매치 종료 시 game_match 1행 + game_round N행을 한 트랜잭션으로 INSERT.
 * @returns 저장된 game_match.id (string)
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
 * 매치 코인 정산 — 두 플레이어 코인을 한 트랜잭션으로 증감하고 정산 후 잔액을 돌려준다.
 * (베팅액은 참가 시점에 보유량 검증됨. 정산 시점 보유가 베팅보다 적어도 음수/코인생성이 없도록 방어.)
 *
 * @param transfer (선택) 코드방 제로섬 정산에서 "승자가 패자에게서 받는" 금액.
 *   지정하면 승자 지급을 패자의 '실제' 차감분으로 제한해 코인 무단생성을 막는다(리뷰 #4).
 *   winnerIsA = 승자가 슬롯 A인지. 빠른시작(하우스 펀딩)은 transfer 생략 → 기존 동작.
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
    // 코드방(제로섬): 패자가 실제로 낼 수 있는 만큼만 이전 — 보유가 베팅보다 적어도 승자 초과지급 방지.
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
    // 실제 반영된 증감(클램프 반영) — match:end 통지에 그대로 쓴다
    return { a: na, b: nb, deltaA: na - ua.coins, deltaB: nb - ub.coins }
  })
}

