/**
 * S7 온라인 매칭 상태 모달 (lobby 에이전트 소유).
 * 본체 testid: modal-matching / 부품: btn-matching-cancel
 * PLAN §2-S7: VS 스크린 대기실 — 좌 내 프로필 칩(P1 시안, YOU) / 중앙 대형 "VS"(대기 중 소등)
 *   / 우 "???" 빈 슬롯(P2 핑크 점선 점멸). 하단 상태 스트립:
 *   상태1 "NOW CONNECTING…(게임에 접속 중입니다)" → 상태2 "WAITING FOR CHALLENGER(플레이어
 *   대기 중)" + [취소하기](대기 단계만 — SPEC Q15). 성사: 상대 닉네임 점등 + VS 발광 →
 *   잠시 후 인게임 (전체 연출 후 자동 전환).
 * SPEC QA-S7-01~05:
 *   connecting 1.2초 → waiting 2.0초 → matchFound()(봇 배정+모달 닫힘) → 0.9초 성사 연출
 *   유지(local hold) → navigate(`/game/${id}`). 취소 → 타이머 전부 정리 + cancelMatching().
 * 열림 조건: flow.modal === 'matching' (배경/ESC로 닫히지 않음 — onClose 없음).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameId } from '@shared';
import { Button, Modal, PlayerBadge } from '../components';
import { cancelMatching, matchFound, useFlow } from '../state/flow';
import { useSession } from '../state/session';
import './matching.css';

type Phase = 'connecting' | 'waiting' | 'found';

const CONNECTING_MS = 1200;
const WAITING_MS = 2000;
const REVEAL_MS = 900;

export default function MatchingModal() {
  const flow = useFlow();
  const session = useSession();
  const navigate = useNavigate();
  const open = flow.modal === 'matching';

  const [phase, setPhase] = useState<Phase>('connecting');
  /** 성사 연출 동안 flow.modal이 null이어도 모달을 유지하기 위한 로컬 홀드 */
  const [hold, setHold] = useState(false);
  const [foundGameId, setFoundGameId] = useState<GameId | null>(null);

  // 매칭 진행 타이머: connecting → waiting → found
  // (모달이 닫히면 — 취소 포함 — cleanup이 타이머를 전부 정리: QA-S7-05)
  useEffect(() => {
    if (!open) return;
    setPhase('connecting');
    setFoundGameId(null);
    const t1 = window.setTimeout(() => setPhase('waiting'), CONNECTING_MS);
    const t2 = window.setTimeout(() => setPhase('found'), CONNECTING_MS + WAITING_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [open]);

  // 성사: 봇 배정(matchFound — flow.modal도 닫힘) → 연출 유지 → 인게임 전환
  useEffect(() => {
    if (phase !== 'found') return;
    const id = matchFound(); // SPEC Q8: 빠른 시작 = 게임 랜덤
    setFoundGameId(id);
    setHold(true);
    const t = window.setTimeout(() => {
      setHold(false);
      setPhase('connecting');
      navigate(`/game/${id}`);
    }, REVEAL_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const onCancel = () => {
    cancelMatching(); // → flow.modal='online' → 위 cleanup이 타이머 정리
  };

  const found = phase === 'found';
  const myName = session.nickname ?? 'PLAYER 1';

  return (
    <Modal
      open={open || hold}
      marquee="온라인 게임하기"
      accentColor="var(--accent2)"
      testId="modal-matching"
      width={560}
    >
      {/* VS 대기실 */}
      <div className="s7-arena">
        <PlayerBadge
          role="P1"
          name={myName}
          you
          avatarColorIndex={session.user?.avatarColorIndex}
        />
        <span
          className={`s7-vs font-arcade${found ? ' s7-vs--lit glow-text' : ''}`}
          aria-hidden
        >
          VS
        </span>
        {found && flow.opponent ? (
          <PlayerBadge
            role="P2"
            name={flow.opponent.nickname}
            avatarColorIndex={flow.opponent.avatarColorIndex}
            className="anim-sign-on"
          />
        ) : (
          <PlayerBadge role="P2" name="???" empty />
        )}
      </div>

      {/* 상태 스트립 */}
      <div className="s7-status">
        {phase === 'connecting' && (
          <>
            <p className="font-arcade s7-status-en c-accent2 anim-blink">NOW CONNECTING…</p>
            <p className="font-display s7-status-ko">게임에 접속 중입니다</p>
          </>
        )}
        {phase === 'waiting' && (
          <>
            <p className="font-arcade s7-status-en c-p1 anim-blink">WAITING FOR CHALLENGER</p>
            <p className="font-display s7-status-ko">플레이어 대기 중</p>
          </>
        )}
        {found && (
          <>
            <p className="font-arcade s7-status-en c-win glow-text anim-sign-on">
              CHALLENGER FOUND!
            </p>
            <p className="font-display s7-status-ko">
              상대를 찾았습니다{foundGameId ? ` — GAME ${foundGameId}` : ''}
            </p>
          </>
        )}
      </div>

      {/* 취소는 대기 단계에만 노출 (SPEC Q15) */}
      {phase === 'waiting' && (
        <div className="s7-actions">
          <Button variant="danger" data-testid="btn-matching-cancel" onClick={onCancel}>
            취소하기
          </Button>
        </div>
      )}
    </Modal>
  );
}
