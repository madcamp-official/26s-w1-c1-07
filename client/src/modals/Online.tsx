/**
 * S6 Play Online panel (owned by the lobby agent).
 * root testid: modal-online / parts: btn-quickstart, btn-code-create, room-code-display,
 *   input-code, btn-code-join, input-bet, btn-bet-place (+ copy, gear→S4 reuse)
 * PLAN §2-S6: "Play Online — VS MODE" marquee + [Quick Start] (yellow hero, INSERT COIN ▶ blinking)
 *   + surface-deep sub-section "Create / Join Game" — row 1 code create (blinking slot before creation →
 *   large yellow code after creation + copy COPIED! + gear) / OR chip / row 2 code input + confirm.
 * SPEC QA-S6-01~09 + coin bet (separate-window style):
 *   Within a single overlay, two windows appear side by side: "Play Online" (modal-online) and "Coin Bet" (modal-bet).
 *   In the bet window, enter an integer from 1 to your coin balance and confirm with [Bet] —
 *   if you press Quick Start / code create / code input before confirming, "Place your coin bet first".
 *   The confirmed bet amount is passed as the bet payload of each action (the server re-validates the balance).
 *   gear → opens S4; when it closes, returns to this panel / background click·ESC closes (clears timers).
 * Open condition: flow.modal === 'online'.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Button, CoinButton } from '../components';
import { closeModal, isValidRoomCode, openModal, useFlow } from '../state/flow';
import { useSession } from '../state/session';
import { connectOnline, createRoom, joinQueue, joinRoom } from '../net/online';
import './online.css';
import '../global-interaction.css';

/** A single neon window inside the overlay — reuses the root markup of components/Modal (modal.css global classes) */
function NeonWindow({
  marquee,
  accent,
  testId,
  width,
  className = '',
  children,
}: {
  marquee: ReactNode;
  accent: string;
  testId: string;
  width: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`nc-modal corner-brackets anim-sign-on ${className}`}
      style={{ '--modal-accent': accent, '--bracket-color': accent, maxWidth: width } as CSSProperties}
      data-testid={testId}
      role="dialog"
      aria-modal="true"
    >
      <i className="cb2" aria-hidden />
      <div className="marquee-strip" style={{ color: accent }}>
        <span className="lamp lit" style={{ '--lamp-color': accent } as CSSProperties} />
        <span className="marquee-title glow-text">{marquee}</span>
        <span className="lamp lit" style={{ '--lamp-color': accent } as CSSProperties} />
      </div>
      <div className="nc-modal__body">{children}</div>
    </div>
  );
}

export default function OnlineModal() {
  const flow = useFlow();
  const session = useSession();
  const open = flow.modal === 'online';

  /** Coin bet (side panel) — uses the input field's value directly as the bet amount (no separate [Bet] confirm needed) */
  const [betInput, setBetInput] = useState('1');
  const [betError, setBetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Generated code (local display for this panel session — reset on close) */
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  /** mock opponent-join timer (after code creation) */
  const joinTimerRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  /** Flag to return to this panel when S4, opened via the gear, closes */
  const returnFromSettingsRef = useRef(false);

  const clearJoinTimer = () => {
    if (joinTimerRef.current !== null) {
      window.clearTimeout(joinTimerRef.current);
      joinTimerRef.current = null;
    }
  };

  // Watch modal state: return from S4 / clean up when fully leaving the panel
  useEffect(() => {
    if (flow.modal === null && returnFromSettingsRef.current) {
      // Settings opened via the gear closed → return to the online panel (SPEC S6-5 room-settings reuse)
      returnFromSettingsRef.current = false;
      openModal('online');
      return;
    }
    if (flow.modal !== 'online' && flow.modal !== 'settings') {
      // Leaving the panel (close/enter matchmaking) — clear the mock join timer and local state
      clearJoinTimer();
      returnFromSettingsRef.current = false;
      setCreatedCode(null);
      setCopied(false);
      setJoinCode('');
      setJoinError(null);
      setBetInput('1');
      setBetError(null);
      setBusy(false);
    }
  }, [flow.modal]);

  // Clear timers on unmount
  useEffect(
    () => () => {
      clearJoinTimer();
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  /**
   * Shared action guard — validates and uses the input field's value directly as the bet amount (no separate [Bet] confirm needed).
   * Quick Start / code create / code input call this right before running.
   * @returns a valid bet amount (integer 1 to coin balance) or null (abort action + show error)
   */
  const requireBet = (): number | null => {
    const bet = Number(betInput.trim());
    if (!Number.isInteger(bet) || bet < 1) {
      setBetError('You must bet at least 1 coin');
      return null;
    }
    if (bet > session.coins) {
      setBetError('Cannot exceed your coin balance');
      return null;
    }
    setBetError(null);
    return bet;
  };

  const onQuickStart = async () => {
    if (busy) return;
    const bet = requireBet();
    if (bet === null) return;
    clearJoinTimer();
    setBusy(true);
    await connectOnline(); // session check + socket
    const r = await joinQueue(bet); // global FIFO queue (once 2 players gather, the server auto-matches and starts)
    setBusy(false);
    if (!r.ok) return setBetError(r.message ?? 'Failed to join queue');
    openModal('matching'); // waiting animation — once matched, OnlineController moves to the game
  };

  const onCreateCode = async () => {
    if (busy) return;
    const bet = requireBet();
    if (bet === null) return;
    setCopied(false);
    setBusy(true);
    await connectOnline();
    const r = await createRoom(flow.enabledGames, bet); // settings (game checkboxes) + bet — rounds are always 9
    setBusy(false);
    if (!r.room) return setBetError(r.message ?? 'Failed to create code');
    setCreatedCode(r.room.code); // when the opponent joins, the server auto-starts → auto-navigates
  };

  const onJoin = async () => {
    if (busy) return;
    if (!isValidRoomCode(joinCode)) {
      setJoinError('Please enter a numeric code');
      return;
    }
    setJoinError(null);
    const bet = requireBet();
    if (bet === null) return;
    clearJoinTimer();
    setBusy(true);
    await connectOnline();
    const r = await joinRoom(joinCode.trim(), bet);
    setBusy(false);
    if (!r.ok) return setJoinError(r.message ?? 'Could not find the room');
    openModal('matching'); // join success → wait (navigates on auto-start)
  };

  const onCopy = async () => {
    if (!createdCode) return;
    try {
      await navigator.clipboard.writeText(createdCode);
    } catch {
      // fallback for environments where the clipboard API is unavailable
      const ta = document.createElement('textarea');
      ta.value = createdCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  const onGear = () => {
    returnFromSettingsRef.current = true;
    openModal('settings');
  };

  // Close with ESC (handled directly since this is a custom overlay instead of the Modal component)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="nc-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div
        className="s6-windows"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        {/* ── Window 1: Play Online (the marquee serves as the title — no duplicate title in the body) ── */}
        <NeonWindow marquee="Play Online" accent="var(--accent)" testId="modal-online" width={620}>
          {/* Hero CTA — Quick Start */}
          <div className="s6-hero">
            <p className="font-arcade c-accent anim-blink s6-insert" aria-hidden>
              INSERT COIN ▶
            </p>
            <Button variant="primary" coin block data-testid="btn-quickstart" onClick={onQuickStart} disabled={busy}>
              Quick Start
            </Button>
          </div>

          {/* Sub-section: Create / Join Game */}
          <section className="s6-sub">
            <h3 className="font-display s6-sub-title">Create / Join Game</h3>

            {/* Row 1: code create */}
            <div className="s6-row">
              <Button variant="secondary" data-testid="btn-code-create" onClick={onCreateCode} disabled={busy}>
                Create code
              </Button>
              <div className="s6-code-slot" data-testid="room-code-display">
                {createdCode ? (
                  <span className="font-arcade s6-code c-accent glow-text anim-sign-on">
                    {createdCode}
                  </span>
                ) : (
                  <span className="font-arcade s6-code-placeholder c-muted anim-blink" aria-hidden>
                    - - - - - -
                  </span>
                )}
              </div>
              <div className="s6-code-tools">
                {copied && (
                  <span className="font-arcade s6-copied c-p1 glow-text" role="status">
                    COPIED!
                  </span>
                )}
                <Button variant="tertiary" onClick={onCopy} disabled={!createdCode}>
                  Copy
                </Button>
                <CoinButton label="Room Settings" color="var(--accent2)" onClick={onGear}>
                  ⚙
                </CoinButton>
              </div>
            </div>

            {/* OR divider */}
            <div className="s6-or" aria-hidden>
              <span className="s6-or-chip font-arcade c-accent2">OR</span>
            </div>

            {/* Row 2: code input */}
            <div className="s6-row s6-row--join">
              <span className="font-display s6-join-label">Enter code</span>
              <div className="s6-join-field">
                <label className={`neon-input${joinError ? ' error anim-shake' : ''}`}>
                  <span className="prompt">&gt;</span>
                  <input
                    data-testid="input-code"
                    value={joinCode}
                    inputMode="numeric"
                    placeholder="Opponent's room code"
                    aria-label="Enter code"
                    onChange={(e) => {
                      setJoinCode(e.target.value);
                      if (joinError) setJoinError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onJoin();
                    }}
                  />
                </label>
                {joinError && <p className="s6-join-error c-error">{joinError}</p>}
              </div>
              <Button variant="primary" data-testid="btn-code-join" onClick={onJoin} disabled={busy}>
                Confirm
              </Button>
            </div>
          </section>
        </NeonWindow>

        {/* ── Window 2: Coin Bet (uses the input value directly as the bet amount) ── */}
        <NeonWindow
          marquee="Coin Bet"
          accent="var(--accent)"
          testId="modal-bet"
          width={250}
          className={betError ? 'anim-shake' : ''}
        >
          <div className="s6-bet-win" data-testid="bet-panel">
            <p className="s6-bet-balance font-arcade">
              Balance <span className="c-accent glow-text">{session.coins}</span> COIN
            </p>
            <label className={`neon-input s6-bet-input${betError ? ' error' : ''}`}>
              <span className="prompt">&gt;</span>
              <input
                data-testid="input-bet"
                value={betInput}
                inputMode="numeric"
                aria-label="Coins to bet"
                onChange={(e) => {
                  // Filter out non-numeric keys so they can't be entered at all
                  setBetInput(e.target.value.replace(/[^\d]/g, ''));
                  if (betError) setBetError(null);
                }}
              />
            </label>
            {betError && (
              <p className="s6-join-error c-error" role="alert">
                {betError}
              </p>
            )}
            {session.coins < 1 && (
              <p className="s6-bet-broke font-display c-muted">
                No coins — you can earn some with the offline "Coin Grind"
              </p>
            )}
          </div>
        </NeonWindow>
      </div>
    </div>
  );
}
