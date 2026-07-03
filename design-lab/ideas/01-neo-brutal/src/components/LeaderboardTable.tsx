/**
 * LeaderboardTable — S2 분반 리더보드 테이블 (PLAN §1.5 테이블 스타일).
 * lb-top3 / lb-myrank testid 포함. 데이터가 비면 정직한 빈 상태(SPEC §0.4).
 *
 * 사용법 (lobby 에이전트, MainLoggedIn.tsx):
 *   import { computeLeaderboard, mockUsers, mockMatches, scoreConfig } from '@shared';
 *   const board = computeLeaderboard(mockUsers.filter(u => u.groupId === 'g1'), mockMatches, scoreConfig);
 *   <LeaderboardTable
 *     top3={board.top3}
 *     myNickname={session.nickname ?? ''}
 *     myEntry={board.entryOf(myMockUserId)}   // 매치 기록 없는 신규 유저면 null
 *   />
 *
 * - top3가 비면(=매치 기록 없음) "기록 없음 — 첫 승부를 남겨라" 빈 상태를 렌더한다.
 * - myEntry가 null이면 내 행에 "기록 없음"을 표기한다 (가짜 순위 금지).
 */
import type { LeaderboardEntry } from '@shared';

export interface LeaderboardTableProps {
  /** 상위 3명 (computeLeaderboard(...).top3) */
  top3: LeaderboardEntry[];
  /** 내 표시 이름 (세션 닉네임) */
  myNickname: string;
  /** 내 리더보드 엔트리 — 기록이 없으면 null */
  myEntry: LeaderboardEntry | null;
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function LeaderboardTable({ top3, myNickname, myEntry }: LeaderboardTableProps) {
  return (
    <div>
      <div data-testid="lb-top3">
        {top3.length === 0 ? (
          <p
            style={{
              padding: '20px 14px',
              color: 'var(--ink-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
            }}
          >
            기록 없음 — 첫 승부를 남겨라
          </p>
        ) : (
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>이름</th>
                <th style={{ textAlign: 'right' }}>판</th>
                <th style={{ textAlign: 'right' }}>승</th>
                <th style={{ textAlign: 'right' }}>승률</th>
              </tr>
            </thead>
            <tbody>
              {top3.map((e) => (
                <tr key={e.userId}>
                  <td>
                    <span className={`lb-rank-chip${e.rank === 1 ? ' lb-rank-chip--top' : ''}`}>
                      {e.rank}
                    </span>
                  </td>
                  <td>{e.nickname}</td>
                  <td className="num">{e.totalPlays}</td>
                  <td className="num">{e.wins}</td>
                  <td className="num">{pct(e.winRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div
        data-testid="lb-myrank"
        className="lb-my-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 14px',
          borderTop: '3px solid var(--ink)',
          fontSize: 14,
        }}
      >
        <span style={{ fontFamily: 'var(--font-display)' }}>
          {myEntry ? `${myEntry.rank}위` : '-'} {myNickname}
        </span>
        <span className="num" style={{ fontFamily: 'var(--font-mono)' }}>
          {myEntry
            ? `${myEntry.totalPlays}판 ${myEntry.wins}승 ${pct(myEntry.winRate)}`
            : '기록 없음'}
        </span>
      </div>
    </div>
  );
}
