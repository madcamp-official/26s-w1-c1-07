/**
 * S7 온라인 매칭 상태 모달 — 실서버 매칭.
 * 온라인 스토어의 phase를 반영: connecting → (queue/room 대기) → 상대 발견 → 매치 시작 시 닫힘.
 * 매치가 시작(countdown/playing)되면 OnlineController가 게임 화면으로 이동하므로 모달을 닫는다.
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

  // 매치 시작되면 모달 닫기 (게임 화면 전환은 OnlineController 담당)
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
      marquee="온라인 게임하기"
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
            <p className="font-display s7-status-ko">서버에 접속 중입니다</p>
          </>
        )}
        {waiting && (
          <>
            <p className="font-arcade s7-status-en c-p1 anim-blink">WAITING FOR CHALLENGER</p>
            <p className="font-display s7-status-ko">
              {o.phase === 'room' && o.room ? `방 코드 ${o.room.code} — 상대 대기 중` : '플레이어 대기 중'}
            </p>
          </>
        )}
        {found && (
          <>
            <p className="font-arcade s7-status-en c-win glow-text anim-sign-on">CHALLENGER FOUND!</p>
            <p className="font-display s7-status-ko">상대를 찾았습니다 — 곧 시작</p>
          </>
        )}
      </div>

      {waiting && (
        <div className="s7-actions">
          <Button variant="danger" data-testid="btn-matching-cancel" onClick={onCancel}>
            취소하기
          </Button>
        </div>
      )}
    </Modal>
  );
}
