/**
 * LeaderboardTable — HI-SCORE table (PLAN §1.5 table grammar).
 *
 * Ranking basis = Coins held (docs/COINS.md). Column order: RANK | NAME | COIN | PLAY | WIN | RATE.
 * Users with equal coins share a rank (computed by the server) — here we only display the received rank as-is.
 * TOP3 is just the first 3 in sort order (if a tie pushes the 4th person out, it is truncated — SPEC Coin leaderboard §2).
 *
 * QA testid: TOP3 area = data-testid="lb-top3", my rank row = "lb-myrank".
 * If there is no data (top3 empty array), honestly show an empty-state message (SPEC §0.4).
 *
 * Usage (S2):
 *   <LeaderboardTable top3={rows} myRank={myRow} />
 *   Row shape is LeaderboardRow — mapped from GET /api/leaderboard response entries.
 */
import './leaderboard.css';

/** One leaderboard row — result of mapping an /api/leaderboard entry */
export interface LeaderboardRow {
  userId: string;
  rank: number;
  nickname: string;
  /** Coins held (ranking basis) */
  coins: number;
  plays: number;
  wins: number;
  /** 0~1 */
  winRate: number;
}

/** @deprecated legacy-name compatibility — use LeaderboardRow */
export type MyRankRow = LeaderboardRow;

export interface LeaderboardTableProps {
  /** Top 3 (first 3 in sort order). If empty array, show empty state */
  top3: LeaderboardRow[];
  /** My rank, one line. Omit if no record */
  myRank?: LeaderboardRow;
  className?: string;
}

/** Medal colors for 1st/2nd/3rd (gold/silver/bronze). From 4th onward undefined → use each screen's default color */
export function rankColor(rank: number): string | undefined {
  if (rank === 1) return '#ffd24a'; // gold
  if (rank === 2) return '#d7dee8'; // silver
  if (rank === 3) return '#e0905a'; // bronze
  return undefined;
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** English ordinal suffix — 1ST/2ND/3RD/4TH…, 11~13 are TH (matches the TOP3 row RANK_LABEL notation) */
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
          <p className="nc-lb__empty c-muted">NO RECORD — no records yet</p>
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
                    {/* Tied ranks show the same rank (e.g. 3RD, 3RD) — color also gold/silver/bronze by rank */}
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
            {/* If I'm 1st–3rd, gold/silver/bronze, otherwise default (p1) */}
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
          <p className="nc-lb__empty c-muted">NO RECORD — no records yet</p>
        )}
      </div>
    </div>
  );
}
