/**
 * S7 online matchmaking status modal — real-server matchmaking.
 * Reflects the online store phase: connecting → (queue/room waiting) → opponent found → closes when the match starts.
 * When the match starts (countdown/playing), OnlineController moves to the game screen, so the modal closes.
 */
import { useEffect } from 'react';
import { Button, Modal, PlayerBadge } from '../components';
import { closeModal, useFlow } from '../state/flow';
import { useSession } from '../state/session';
import { leaveQueue, leaveRoom, useOnline } from '../net/online';
import './matching.css';

export default function MatchingModal() {
  const flow = useFlow();
  const session = useSession();
  const o = useOnline();
  const open = flow.modal === 'matching';

  // Close the modal when the match starts (OnlineController handles the game-screen transition)
  useEffect(() => {
    if (open && (o.phase === 'countdown' || o.phase === 'playing' || o.phase === 'match-end')) {
      closeModal();
    }
  }, [open, o.phase]);

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
