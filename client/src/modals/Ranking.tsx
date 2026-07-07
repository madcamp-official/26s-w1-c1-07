/**
 * Class full ranking modal — entered by clicking the main leaderboard panel (docs/COINS.md).
 * root testid: modal-ranking / parts: ranking-me, ranking-list, btn-ranking-close
 *
 * Layout (top → bottom):
 *   ① My info row (highlighted)
 *   ② Spacing
 *   ③ Everyone in the class from 1st to last (by coins, tied ranks shown as-is — scrolls)
 *   ④ "Close" button
 * Data: GET /api/leaderboard (re-fetched each time it opens — reflects coin changes).
 */
import { useEffect, useState } from 'react';
import { Button, Modal, ordinal, rankColor } from '../components';
import type { LeaderboardRow } from '../components';
import { closeModal, useFlow } from '../state/flow';
import { fetchLeaderboard } from '../net/leaderboard';
import type { LeaderboardData } from '../net/leaderboard';
import './ranking.css';

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function Row({ row, me }: { row: LeaderboardRow; me?: boolean }) {
  return (
    <div className={`rk-row${me ? ' rk-row--me' : ''}`}>
      {/* 1st·2nd·3rd are gold/silver/bronze (rankColor), the rest use the CSS default color */}
      <span className="rk-rank font-arcade glow-text" style={{ color: rankColor(row.rank) }}>
        {ordinal(row.rank)}
      </span>
      <span className="rk-name font-display">
        {row.nickname}
        {me && <span className="rk-you font-arcade anim-blink"> YOU</span>}
      </span>
      <span className="rk-coin font-arcade c-accent">🪙 {row.coins}</span>
      <span className="rk-stat font-arcade c-muted">{row.plays}P</span>
      <span className="rk-stat font-arcade c-muted">{row.wins}W</span>
      <span className="rk-stat font-arcade c-muted">{pct(row.winRate)}</span>
    </div>
  );
}

export default function RankingModal() {
  const flow = useFlow();
  const open = flow.modal === 'ranking';

  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(false);

  // Re-fetch the latest ranking each time it opens
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    void fetchLeaderboard().then((lb) => {
      if (!alive) return;
      setData(lb);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={closeModal}
      marquee="FULL RANKING"
      accentColor="var(--accent)"
      testId="modal-ranking"
      width={560}
    >
      <div className="rk-body">
        {loading && <p className="rk-empty font-arcade c-muted">LOADING…</p>}

        {!loading && (!data || data.rows.length === 0) && (
          <p className="rk-empty c-muted">NO RECORD — No ranking data</p>
        )}

        {!loading && data && data.rows.length > 0 && (
          <>
            {/* ① Top: my info */}
            {data.me && (
              <div className="rk-me" data-testid="ranking-me">
                <Row row={data.me} me />
              </div>
            )}

            {/* ② After spacing, ③ full list (1st → last) */}
            <div className="rk-list" data-testid="ranking-list">
              <div className="rk-head font-arcade c-muted" aria-hidden>
                <span className="rk-rank">RANK</span>
                <span className="rk-name">NAME</span>
                <span className="rk-coin">COIN</span>
                <span className="rk-stat">PLAY</span>
                <span className="rk-stat">WIN</span>
                <span className="rk-stat">RATE</span>
              </div>
              {data.rows.map((r) => (
                <Row key={r.userId} row={r} me={r.userId === data.me?.userId} />
              ))}
            </div>
          </>
        )}

        {/* ④ Bottom: close */}
        <Button variant="tertiary" block data-testid="btn-ranking-close" onClick={closeModal}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
