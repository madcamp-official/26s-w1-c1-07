/**
 * LeaderboardTable — S2 분반 리더보드 (SPEC 행24: TOP3 플레이/승/승률 + 내 등수).
 *
 * data-testid: lb-top3 (TOP3 tbody), lb-myrank (내 등수 로우) — 자동 부착.
 * 빈 상태(entries 없음)는 "NO RECORDS / 기록 없음" — 가짜 순위 금지 (SPEC §0.4).
 *
 * 사용 예 (lobby 에이전트, MainLoggedIn):
 *   const users = [...groupMembers(), selfAsMockUser()!];
 *   const lb = computeLeaderboard(users, mockMatches, scoreConfig);
 *   <LeaderboardTable top3={lb.top3} myEntry={lb.entryOf('me')} />
 *
 * 헥사곤 랭크 엠블럼: 1위 골드 / 2위 실버 / 3위 브론즈 / 그 외 --line (PLAN §1.3).
 */
import type { LeaderboardEntry } from '@shared';

export interface LeaderboardTableProps {
  /** 상위 3명 (빈 배열이면 빈 상태 렌더) */
  top3: LeaderboardEntry[];
  /** 내 엔트리 (null이면 내 등수 로우 생략) */
  myEntry?: LeaderboardEntry | null;
}

const RANK_COLORS: Record<number, string> = {
  1: 'var(--gold)',
  2: 'var(--silver)',
  3: 'var(--bronze)',
};

function RankEmblem({ rank, accent }: { rank: number; accent?: string }) {
  const color = accent ?? RANK_COLORS[rank] ?? 'var(--line)';
  return (
    <span
      className="hex num"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        background: color,
        color: 'var(--bg-0)',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {rank}
    </span>
  );
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function LeaderboardTable({ top3, myEntry }: LeaderboardTableProps) {
  if (top3.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <div className="overline" style={{ marginBottom: 8 }}>
          NO RECORDS
        </div>
        <div style={{ color: 'var(--text-lo)', fontSize: 13 }}>기록 없음</div>
      </div>
    );
  }

  return (
    <table className="lb-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Player</th>
          <th style={{ textAlign: 'right' }}>Play</th>
          <th style={{ textAlign: 'right' }}>Win</th>
          <th style={{ textAlign: 'right' }}>Win%</th>
        </tr>
      </thead>
      <tbody data-testid="lb-top3">
        {top3.map((e) => (
          <tr key={e.userId} className="lb-row--top">
            <td>
              <RankEmblem rank={e.rank} />
            </td>
            <td style={{ fontWeight: 500 }}>{e.nickname}</td>
            <td className="num" style={{ textAlign: 'right' }}>
              {e.totalPlays}
            </td>
            <td className="num" style={{ textAlign: 'right' }}>
              {e.wins}
            </td>
            <td className="num" style={{ textAlign: 'right' }}>
              {pct(e.winRate)}
            </td>
          </tr>
        ))}
      </tbody>
      {myEntry && (
        <tbody>
          <tr className="lb-row--me" data-testid="lb-myrank">
            <td>
              <RankEmblem rank={myEntry.rank} accent="var(--p1)" />
            </td>
            <td style={{ fontWeight: 700 }}>
              {myEntry.nickname}{' '}
              <span className="chip chip--p1" style={{ marginLeft: 6 }}>
                YOU
              </span>
            </td>
            <td className="num" style={{ textAlign: 'right' }}>
              {myEntry.totalPlays}
            </td>
            <td className="num" style={{ textAlign: 'right' }}>
              {myEntry.wins}
            </td>
            <td className="num" style={{ textAlign: 'right' }}>
              {pct(myEntry.winRate)}
            </td>
          </tr>
        </tbody>
      )}
    </table>
  );
}
