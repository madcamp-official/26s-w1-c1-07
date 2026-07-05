/**
 * LeaderboardTable — HI-SCORE 테이블 (PLAN §1.5 테이블 문법).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * QA testid를 내장한다: TOP3 영역 = data-testid="lb-top3", 내 등수 행 = "lb-myrank".
 * 데이터가 없으면(entries 빈 배열) 빈 상태 문구를 정직하게 표시 (SPEC §0.4).
 *
 * 사용법 (S2 lobby 에이전트):
 *   const lb = computeLeaderboard(mockUsers.filter(u => u.groupId === myGroup), mockMatches, scoreConfig);
 *   <LeaderboardTable
 *     top3={lb.top3}
 *     myRank={{ rank: 4, nickname: session.nickname!, plays: 12, wins: 5, winRate: 0.42 }}
 *   />
 *   top3 항목은 @/shell LeaderboardEntry 그대로 넘기면 된다.
 *   내 기록이 없으면 myRank 생략 → "NO RECORD" 표시.
 */
import type { LeaderboardEntry } from '@/shell';
import './leaderboard.css';

export interface MyRankRow {
  rank: number;
  nickname: string;
  plays: number;
  wins: number;
  /** 0~1 */
  winRate: number;
}

export interface LeaderboardTableProps {
  /** 상위 3명 (@/shell computeLeaderboard().top3). 빈 배열이면 빈 상태 표시 */
  top3: LeaderboardEntry[];
  /** 내 등수 1줄. 기록 없으면 생략 */
  myRank?: MyRankRow;
  className?: string;
}

const RANK_LABEL = ['1ST', '2ND', '3RD'] as const;
const RANK_COLOR = ['var(--accent)', 'var(--p1)', 'var(--p2)'] as const;

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** 영어 서수 접미사 — 1ST/2ND/3RD/4TH…, 11~13은 TH (TOP3 행 RANK_LABEL과 표기 통일) */
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}TH`;
  switch (n % 10) {
    case 1:
      return `${n}ST`;
    case 2:
      return `${n}ND`;
    case 3:
      return `${n}RD`;
    default:
      return `${n}TH`;
  }
}

export function LeaderboardTable({ top3, myRank, className = '' }: LeaderboardTableProps) {
  return (
    <div className={`nc-lb ${className}`}>
      <div data-testid="lb-top3">
        {top3.length === 0 ? (
          <p className="nc-lb__empty c-muted">NO RECORD — 아직 기록이 없습니다</p>
        ) : (
          <table className="nc-lb__table">
            <thead>
              <tr className="font-arcade">
                <th>RANK</th>
                <th className="nc-lb__name-col">NAME</th>
                <th>PLAY</th>
                <th>WIN</th>
                <th>RATE</th>
              </tr>
            </thead>
            <tbody>
              {top3.slice(0, 3).map((e, i) => (
                <tr key={e.userId}>
                  <td
                    className="font-arcade nc-lb__rank glow-text"
                    style={{ color: RANK_COLOR[i] }}
                  >
                    {RANK_LABEL[i]}
                  </td>
                  <td className="nc-lb__name-col">{e.nickname}</td>
                  <td className="font-arcade nc-lb__num">{e.totalPlays}</td>
                  <td className="font-arcade nc-lb__num">{e.wins}</td>
                  <td className="font-arcade nc-lb__num">{pct(e.winRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="nc-lb__me" data-testid="lb-myrank">
        {myRank ? (
          <div className="nc-lb__me-row">
            <span className="nc-lb__you-tag font-arcade anim-blink c-p1">YOU</span>
            <span className="font-arcade nc-lb__rank c-p1 glow-text">{ordinal(myRank.rank)}</span>
            <span className="nc-lb__me-name">{myRank.nickname}</span>
            <span className="font-arcade nc-lb__num c-muted">
              {myRank.plays}P {myRank.wins}W {pct(myRank.winRate)}
            </span>
          </div>
        ) : (
          <p className="nc-lb__empty c-muted">NO RECORD — 아직 기록이 없습니다</p>
        )}
      </div>
    </div>
  );
}
