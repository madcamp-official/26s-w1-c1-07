/**
 * S8 Game Select (owned by the lobby agent).
 * Container testid: scr-game-select / cards: card-game{internal id} (e.g. card-game1, card-game5)
 *
 * Display order / numbering (shared/coins.ts GAME_ORDER = [1,3,6,2,10,4,8,5,7,9]):
 *   Cabinets are laid out in GAME_ORDER, and the marquee label "GAME 1..10" follows the
 *   position in this array (1-based), not the game's internal id. Routing, pictograms, and
 *   test ids use the internal id as-is.
 *
 * Unlocking (shared/coins.ts):
 *   Only the last two games in display order (LOCKABLE_GAME_IDS) are locked; the rest are open from the start.
 *   The two locked games can each be unlocked independently, regardless of order (login required).
 *   Click a locked card → bottom confirm bar → POST /api/unlock({gameId}). Logged-out users cannot unlock.
 *
 * SPEC QA-S8-01~04: click card → startOfflineGame(id); navigate(`/game/${id}`) — immediate, no matchmaking.
 *   No login required (no route guard). Way back to main = [◀ Back to main].
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GAME_ORDER, isLockable, unlockCost, unlockedGameIds } from '@madcade/shared';
import type { GameId } from '@/shell';
import { Button, GamePictogram } from '../components';
import { useDebugScreen } from '../debug';
import { startOfflineGame } from '../state/flow';
import { restoreSession, unlockGame, useSession } from '../state/session';
import { openLoginModal } from '../modals/Login';
import { GAME_NAMES } from '../game/gameNames';
import './game-select.css';
import '../global-interaction.css';

interface CabinetSpec {
  id: GameId;
  /** display order position (1-based) — marquee "GAME N" label */
  displayNo: number;
  title: string;
  name: string;
  colorVar: string;
}

const CAB_COLORS = ['var(--accent)', 'var(--p1)', 'var(--p2)', 'var(--accent2)', 'var(--win)'];
/** Build cabinets in GAME_ORDER — label/color by position, identity (id, name, pictogram) by internal id */
const CABINETS: CabinetSpec[] = (GAME_ORDER as readonly GameId[]).map((id, i) => ({
  id,
  displayNo: i + 1,
  title: `GAME ${i + 1}`,
  name: GAME_NAMES[id],
  colorVar: CAB_COLORS[i % CAB_COLORS.length],
}));

export default function GameSelect() {
  useDebugScreen('scr-game-select');
  const navigate = useNavigate();
  const session = useSession();

  /** unlock confirm bar target (when a locked card is clicked) */
  const [armed, setArmed] = useState<GameId | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // Coins may have changed from a match/unlock, so refresh the wallet on entry
  useEffect(() => {
    if (session.loggedIn) void restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // unlocked_count is a bitmask — logged-out is 0 (default-open only)
  const unlocked = unlockedGameIds(session.loggedIn ? session.unlockedCount : 0);
  const armedCab = armed !== null ? CABINETS.find((c) => c.id === armed) ?? null : null;

  const pick = (id: GameId) => {
    if (unlocked.has(id)) {
      startOfflineGame(id); // straight into the game, no matchmaking step (comment 16:1665)
      navigate(`/game/${id}`);
      return;
    }
    // Locked game: show the unlock confirm bar only when logged in (free unlock, order-independent)
    setUnlockError(null);
    if (session.loggedIn && isLockable(id)) setArmed(id);
  };

  const onUnlock = async () => {
    if (unlocking || armed === null) return;
    setUnlocking(true);
    const r = await unlockGame(armed);
    setUnlocking(false);
    if (r.error) {
      setUnlockError(r.error);
      return;
    }
    setArmed(null); // success — the session store updates and the card opens
  };

  return (
    <main data-testid="scr-game-select" className="s8-root">
      <div className="vanish-grid" aria-hidden />

      <header className="s8-header">
        <Button variant="tertiary" onClick={() => navigate('/')}>
          ◀ Back to main
        </Button>
        <p className="s8-wordmark font-arcade" aria-label="MADCADE">
          <span className="c-p2 glow-text">MAD</span>
          <span className="c-p1 glow-text">CADE</span>
        </p>
        {session.loggedIn ? (
          <span className="s8-coins font-arcade c-accent glow-text" data-testid="coin-balance">
            🪙 {session.coins}
          </span>
        ) : (
          <span className="s8-header-spacer" aria-hidden />
        )}
      </header>

      <p className="s8-caption font-arcade c-accent2">SELECT YOUR GAME</p>

      <div className="s8-floor">
        {CABINETS.map((cab) => {
          const isLocked = !unlocked.has(cab.id);
          const canUnlock = isLocked && session.loggedIn; // when logged in, any locked game can be unlocked
          return (
            <button
              key={cab.id}
              type="button"
              className={`s8-cabinet${isLocked ? ' s8-cabinet--locked' : ''}${
                armed === cab.id ? ' s8-cabinet--armed' : ''
              }`}
              data-testid={`card-game${cab.id}`}
              style={{ '--cab-color': cab.colorVar } as React.CSSProperties}
              onClick={() => pick(cab.id)}
              aria-disabled={isLocked && !canUnlock}
            >
              <span className="s8-marquee">
                <span className="lamp" aria-hidden />
                <span className="s8-marquee-title font-arcade">{cab.title}</span>
                <span className="lamp" aria-hidden />
              </span>
              <span className="s8-screen">
                <GamePictogram id={cab.id} displayNo={cab.displayNo} />
                {isLocked && (
                  <span className="s8-lock" aria-hidden>
                    <span className="s8-lock-icon">🔒</span>
                    {canUnlock ? (
                      <span className="s8-lock-cost font-arcade">{unlockCost(cab.id)} COIN</span>
                    ) : (
                      <span className="s8-lock-cost font-arcade c-muted">LOCKED</span>
                    )}
                  </span>
                )}
              </span>
              <span className="s8-name font-display">{cab.name}</span>
              <span className="s8-panel" aria-hidden>
                <span className="s8-dot s8-dot--p1" />
                <span className="s8-dot s8-dot--p2" />
              </span>
            </button>
          );
        })}
      </div>

      {/* Unlock confirm bar — when a locked card is clicked (order-independent) */}
      {armedCab && (
        <div className="s8-unlock-bar" data-testid="unlock-bar" role="dialog" aria-live="polite">
          <span className="font-display">
            Unlock GAME {armedCab.displayNo} ({armedCab.name}) for{' '}
            <strong className="c-accent">{unlockCost(armedCab.id)} Coins</strong>?
          </span>
          {unlockError && <span className="s8-unlock-err c-error font-display">{unlockError}</span>}
          <div className="s8-unlock-actions">
            <Button variant="primary" data-testid="btn-unlock" onClick={onUnlock} disabled={unlocking}>
              {unlocking ? 'Unlocking…' : 'Unlock'}
            </Button>
            <Button variant="tertiary" onClick={() => setArmed(null)} disabled={unlocking}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* COIN FARM — earn coins via a solo Pump mission (logged-out goes to the login modal) */}
      <button
        type="button"
        className="s8-grind font-arcade"
        data-testid="btn-coin-grind"
        onClick={() => {
          if (session.loggedIn) navigate('/farm');
          else openLoginModal();
        }}
      >
        GET FREE COIN
      </button>
    </main>
  );
}
