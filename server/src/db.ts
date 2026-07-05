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
 * (베팅액은 참가 시점에 보유량 검증됨. 음수 방지로 0 바닥 클램프)
 */
export async function settleCoins(
  aId: bigint,
  deltaA: number,
  bId: bigint,
  deltaB: number,
): Promise<{ a: number; b: number }> {
  const [a, b] = await prisma.$transaction([
    prisma.appUser.update({ where: { id: aId }, data: { coins: { increment: deltaA } }, select: { coins: true } }),
    prisma.appUser.update({ where: { id: bId }, data: { coins: { increment: deltaB } }, select: { coins: true } }),
  ])
  // 동시 매치 등으로 음수가 됐으면 0으로 보정 (일반 경로에선 발생하지 않음)
  const fixes = []
  if (a.coins < 0) fixes.push(prisma.appUser.update({ where: { id: aId }, data: { coins: 0 } }))
  if (b.coins < 0) fixes.push(prisma.appUser.update({ where: { id: bId }, data: { coins: 0 } }))
  if (fixes.length) await prisma.$transaction(fixes)
  return { a: Math.max(0, a.coins), b: Math.max(0, b.coins) }
}

