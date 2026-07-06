/**
 * LeaderboardTable — HI-SCORE 테이블 (PLAN §1.5 테이블 문법).
 *
 * 랭킹 기준 = 보유 코인 (docs/COINS.md). 열 순서: RANK | NAME | COIN | PLAY | WIN | RATE.
 * 코인 동일 유저는 공동 등수(서버가 계산) — 여기는 받은 rank를 그대로 표기만 한다.
 * TOP3는 정렬 순 앞 3명만 (공동 등수가 4명째로 밀리면 잘림 — SPEC 코인 리더보드 §2).
 *
 * QA testid: TOP3 영역 = data-testid="lb-top3", 내 등수 행 = "lb-myrank".
 * 데이터가 없으면(top3 빈 배열) 빈 상태 문구를 정직하게 표시 (SPEC §0.4).
 *
 * 사용법 (S2):
 *   <LeaderboardTable top3={rows} myRank={myRow} />
 *   행 형태는 LeaderboardRow — GET /api/leaderboard 응답 entry에서 매핑.
 */
import './leaderboard.css';

/** 리더보드 한 행 — /api/leaderboard entry 매핑 결과 */
export interface LeaderboardRow {
  userId: string;
  rank: number;
  nickname: string;
  /** 보유 코인 (랭킹 기준) */
  coins: number;
  plays: number;
  wins: number;
  /** 0~1 */
  winRate: number;
}

/** @deprecated 이전 이름 호환 — LeaderboardRow 사용 */
export type MyRankRow = LeaderboardRow;

export interface LeaderboardTableProps {
  /** 상위 3명 (정렬 순 앞 3명). 빈 배열이면 빈 상태 표시 */
  top3: LeaderboardRow[];
  /** 내 등수 1줄. 기록 없으면 생략 */
  myRank?: LeaderboardRow;
  className?: string;
}

/** 1·2·3등 메달 색 (금/은/동). 4등부터는 undefined → 각 화면의 기본색 사용 */
export function rankColor(rank: number): string | undefined {
  if (rank === 1) return '#ffd24a'; // 금
  if (rank === 2) return '#d7dee8'; // 은
  if (rank === 3) return '#e0905a'; // 동
  return undefined;
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** 영어 서수 접미사 — 1ST/2ND/3RD/4TH…, 11~13은 TH (TOP3 행 RANK_LABEL과 표기 통일) */
export function ordinal(n: number): string {
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
                <th>COIN</th>
                <th>PLAY</th>
                <th>WIN</th>
                <th>RATE</th>
              </tr>
            </thead>
            <tbody>
              {top3.slice(0, 3).map((e) => (
                <tr key={e.userId}>
                  <td
                    className="font-arcade nc-lb__rank glow-text"
                    style={{ color: rankColor(e.rank) ?? 'var(--accent)' }}
                  >
                    {/* 공동 등수면 표시도 같은 등수 (예: 3RD, 3RD) — 색도 등수 기준 금/은/동 */}
                    {ordinal(e.rank)}
                  </td>
                  <td className="nc-lb__name-col">{e.nickname}</td>
                  <td className="font-arcade nc-lb__num nc-lb__coin c-accent">🪙 {e.coins}</td>
                  <td className="font-arcade nc-lb__num">{e.plays}</td>
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
            {/* 내가 1~3등이면 금/은/동, 아니면 기본(p1) */}
            <span
              className="font-arcade nc-lb__rank c-p1 glow-text"
              style={{ color: rankColor(myRank.rank) }}
            >
              {ordinal(myRank.rank)}
            </span>
            <span className="nc-lb__me-name">{myRank.nickname}</span>
            <span className="font-arcade nc-lb__num nc-lb__coin c-accent">🪙 {myRank.coins}</span>
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
