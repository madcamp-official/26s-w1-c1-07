/**
 * S7 online matchmaking status modal — real-server matchmaking.
 * Reflects the online store phase: connecting → (queue/room waiting) → opponent found → closes when the match starts.
 * When the match starts (countdown/playing), OnlineController moves to the game screen, so the modal closes.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, PlayerBadge } from '../components';
import { ALL_GAME_IDS, closeModal, getFlow, startBotGame, useFlow } from '../state/flow';
import { useSession } from '../state/session';
import { leaveQueue, leaveRoom, useOnline } from '../net/online';
import './matching.css';

/** How long to wait for a human in the quick-match queue before falling back to a bot opponent. */
const BOT_FALLBACK_MS = 3000;

export default function MatchingModal() {
  const flow = useFlow();
  const session = useSession();
  const o = useOnline();
  const navigate = useNavigate();
  const open = flow.modal === 'matching';

  // Close the modal when the match starts (OnlineController handles the game-screen transition)
  useEffect(() => {
    if (open && (o.phase === 'countdown' || o.phase === 'playing' || o.phase === 'match-end')) {
      closeModal();
    }
  }, [open, o.phase]);

  // Quick-match bot fallback — if no human challenger joins within BOT_FALLBACK_MS, drop into a solo
  // match vs the built-in bot (empty-lobby friendly). Only for the quick-match queue, not code rooms.
  // If a real opponent is found first, o.opponent flips non-null and this timer is cleared (real match proceeds).
  useEffect(() => {
    if (!open || o.phase !== 'queue' || o.opponent != null) return;
    const t = setTimeout(() => {
      const enabled = getFlow().enabledGames;
      const pool = enabled.length ? enabled : ALL_GAME_IDS;
      const gameId = pool[Math.floor(Math.random() * pool.length)];
      leaveQueue(); // release the server queue (and any locked bet) — we're going local vs bot
      startBotGame(gameId);
      closeModal();
      navigate(`/game/${gameId}`);
    }, BOT_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [open, o.phase, o.opponent, navigate]);

  const connecting = o.phase === 'connecting';
  const found = o.opponent != null;
  const waiting = !found && (o.phase === 'queue' || o.phase === 'room');

  const onCancel = () => {
    if (o.phase === 'queue') leaveQueue();
    else leaveRoom();
    closeModal();
  };

  const myName = session.nickname ?? 'PLAYER 1';

  return (
    <Modal
      open={open}
      marquee="Play Online"
      accentColor="var(--accent2)"
      testId="modal-matching"
      width={560}
    >
      <div className="s7-arena">
        <PlayerBadge role="P1" name={myName} you avatarColorIndex={session.user?.avatarColorIndex} />
        <span className={`s7-vs font-arcade${found ? ' s7-vs--lit glow-text' : ''}`} aria-hidden>
          VS
        </span>
        {found && o.opponent ? (
          <PlayerBadge role="P2" name={o.opponent.nickname} avatarColorIndex={1} className="anim-sign-on" />
        ) : (
          <PlayerBadge role="P2" name="???" empty />
        )}
      </div>

      <div className="s7-status">
        {connecting && (
          <>
            <p className="font-arcade s7-status-en c-accent2 anim-blink">NOW CONNECTING…</p>
            <p className="font-display s7-status-ko">Connecting to server</p>
          </>
        )}
        {waiting && (
          <>
            <p className="font-arcade s7-status-en c-p1 anim-blink">WAITING FOR CHALLENGER</p>
            <p className="font-display s7-status-ko">
              {o.phase === 'room' && o.room ? `Room code ${o.room.code} — waiting for opponent` : 'Waiting for player'}
            </p>
          </>
        )}
        {found && (
          <>
            <p className="font-arcade s7-status-en c-win glow-text anim-sign-on">CHALLENGER FOUND!</p>
            <p className="font-display s7-status-ko">Opponent found — starting soon</p>
          </>
        )}
      </div>

      {waiting && (
        <div className="s7-actions">
          <Button variant="danger" data-testid="btn-matching-cancel" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </Modal>
  );
}
