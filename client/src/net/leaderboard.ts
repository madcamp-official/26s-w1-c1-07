/**
 * Class leaderboard client — GET /api/leaderboard wrapper.
 * Ranking criterion = Coins held (docs/COINS.md). The server computes sorting and tied ranks (rank) before sending it down.
 * Shared by MainLoggedIn (TOP3 + my info) and the Ranking modal (full list).
 */
import { SERVER_URL } from './config'
import type { LeaderboardRow } from '../components'

/** GET /api/leaderboard response entry */
interface LbEntryDto {
  userId: string
  nickname: string
  coins: number
  wins: number
  draws: number
  losses: number
  rank: number
}

export interface LeaderboardData {
  groupName: string | null
  /** All class members, sorted by Coins with tied ranks computed */
  rows: LeaderboardRow[]
  /** My row (always present if I belong to a class) */
  me: LeaderboardRow | null
}

function toRow(d: LbEntryDto): LeaderboardRow {
  const plays = d.wins + d.draws + d.losses
  return {
    userId: d.userId,
    rank: d.rank,
    nickname: d.nickname,
    coins: d.coins,
    plays,
    wins: d.wins,
    winRate: plays > 0 ? d.wins / plays : 0,
  }
}

/** Load the class leaderboard. Returns null on failure (not logged in / server down) */
export async function fetchLeaderboard(): Promise<LeaderboardData | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leaderboard`, { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== 'OK') return null
    const rows = ((data.entries ?? []) as LbEntryDto[]).map(toRow)
    return {
      groupName: data.groupName ?? null,
      rows,
      me: rows.find((r) => r.userId === data.myUserId) ?? null,
    }
  } catch {
    return null
  }
}
