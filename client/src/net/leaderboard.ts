/**
 * 분반 리더보드 클라이언트 — GET /api/leaderboard 래퍼.
 * 랭킹 기준 = 보유 코인 (docs/COINS.md). 서버가 정렬·공동등수(rank)까지 계산해서 내려준다.
 * MainLoggedIn(TOP3 + 내 정보)과 Ranking 모달(전체 목록)이 공유.
 */
import { SERVER_URL } from './config'
import type { LeaderboardRow } from '../components'

/** GET /api/leaderboard 응답 엔트리 */
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
  /** 코인순 정렬 + 공동등수 계산 완료된 전체 분반원 */
  rows: LeaderboardRow[]
  /** 내 행 (분반 소속이면 항상 존재) */
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

/** 분반 리더보드 로드. 실패(미로그인/서버 다운) 시 null */
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
