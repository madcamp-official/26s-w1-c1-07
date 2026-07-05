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

/** dev 로그인 스텁 — 닉네임으로 app_user upsert (Google OAuth 전 임시). */
export async function devUpsertUser(nickname: string): Promise<{
  id: bigint
  nickname: string
  imageUrl: string | null
}> {
  const sub = `dev:${nickname}`
  const user = await prisma.appUser.upsert({
    where: { googleSub: sub },
    update: {},
    create: {
      googleSub: sub,
      email: `${nickname}@dev.local`,
      nickname,
    },
  })
  return { id: user.id, nickname: user.nickname, imageUrl: user.googleImageUrl }
}
