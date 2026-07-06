/**
 * S2 Main — after login (owned by the lobby agent).
 * Container testid: scr-main-in
 * PLAN §2-S2: left logo zone + right HI-SCORE panel. Neon greeting doubling as "PLAYER 1: OOO" (cyan) +
 *   logout (tertiary) + Settings coin button + LeaderboardTable (lb-top3/lb-myrank built in) +
 *   btn-online (yellow primary, blinking INSERT COIN ▶ caption)/btn-offline (cyan secondary).
 * SPEC QA-S2-01~09. Leaderboard = GET /api/leaderboard — ranking is by coins held (docs/COINS.md).
 *   Shows TOP3 (first 3 in sort order) + my info. Panel click → full class ranking modal (ranking).
 *   If the class has no records, show an honest empty state (§0.4) — LeaderboardTable's NO RECORD.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, LeaderboardTable } from '../components';
import type { LeaderboardRow } from '../components';
import { useDebugScreen } from '../debug';
import { logout, restoreSession, useSession } from '../state/session';
import { openModal } from '../state/flow';
import { fetchLeaderboard } from '../net/leaderboard';
import '@/audio'; // global audio (UI/flow/coin SFX + BGM) self-initializes — do not modify locked files
import './main-in.css';

export default function MainLoggedIn() {
  useDebugScreen('scr-main-in');
  const session = useSession();
  const navigate = useNavigate();

  const nickname = session.nickname ?? 'PLAYER';
  const groupName = session.groupName;

  const [top3, setTop3] = useState<LeaderboardRow[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardRow | undefined>(undefined);

  // Coins may have changed from match settlement/unlock, so refresh the wallet on returning to main
  useEffect(() => {
    void restoreSession();
  }, []);

  // Load the latest ranking from the server on every mount — auto-refresh when returning to main after a match/grind
  useEffect(() => {
    let alive = true;
    void fetchLeaderboard().then((lb) => {
      if (!alive || !lb) return;
      setTop3(lb.rows.slice(0, 3)); // only the first 3, even if there are ties
      setMyRank(lb.me ?? undefined);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main data-testid="scr-main-in" className="s2-root">
      <div className="vanish-grid" aria-hidden />

      {/* Top-right header: greeting + coins + logout + Settings */}
      <header className="s2-header">
        <span className="s2-coins font-arcade c-accent glow-text" data-testid="coin-balance" title="Coins held">
          🪙 {session.coins}
        </span>
        <p className="s2-greet">
          <span className="font-display s2-greet-name c-p1 glow-text">{nickname}</span>
          <span className="font-display s2-greet-hello">, welcome!</span>
        </p>
        <Button
          variant="tertiary"
          onClick={() => {
            logout();
            navigate('/');
          }}
        >
          Logout
        </Button>
      </header>

      <div className="s2-body">
        {/* Left logo zone */}
        <section className="s2-logo-zone">
          <h1 className="s2-logo font-arcade" aria-label="MADPUMP">
            <span className="s2-logo-mad glow-text">MAD</span>
            <span className="s2-logo-pump glow-text">PUMP</span>
          </h1>
          <p className="s2-tagline font-arcade c-accent2">1v1 PUMPING DUEL</p>

          <div className="s2-cta">
            <p className="s2-insert font-arcade c-accent anim-blink" aria-hidden>
              INSERT COIN ▶
            </p>
            <Button
              variant="primary"
              coin
              block
              data-testid="btn-online"
              onClick={() => openModal('online')}
            >
              Play Online
            </Button>
            <Button
              variant="secondary"
              block
              data-testid="btn-offline"
              onClick={() => navigate('/select')}
            >
              Play Offline
            </Button>
          </div>
        </section>

        {/* Right HI-SCORE panel */}
        <section className="s2-lb-zone">
          <Card
            marquee={
              <span className="font-display">
                {groupName ? `${groupName} ` : ''}
                <span className="font-arcade s2-hiscore-word">HI-SCORE</span>
              </span>
            }
            marqueeColor="var(--accent)"
            brackets
            bracketColor="var(--p1)"
            className="s2-lb-card"
          >
            {/* Panel click → full class ranking modal */}
            <button
              type="button"
              className="s2-lb-click"
              data-testid="btn-open-ranking"
              onClick={() => openModal('ranking')}
              title="View full class ranking"
            >
              <LeaderboardTable top3={top3} myRank={myRank} />
              <span className="s2-lb-more font-arcade c-muted">▶ View full ranking</span>
            </button>
          </Card>
        </section>
      </div>

      {/* Bottom-right: Change Theme (store mock) */}
      <button
        type="button"
        className="s2-theme-btn font-display"
        data-testid="btn-theme-shop"
        onClick={() => openModal('theme-shop')}
      >
        🎨 Change Theme
      </button>
    </main>
  );
}
