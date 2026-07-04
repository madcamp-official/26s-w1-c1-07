/**
 * S7 온라인 매칭 상태 모달 (lobby 에이전트 소유).
 *
 * modal testid: modal-matching / 취소: btn-matching-cancel (waiting 단계에만 — Q15)
 * - connecting("게임에 접속 중입니다", 취소 없음) → waiting("플레이어 대기 중"+취소)
 *   → found("매칭 완료!" ≤600ms 연출) → matchFound() + navigate (QA-S7-01~04)
 * - 취소: cancelMatching() → flow.modal이 'online'으로 → effect cleanup이
 *   진행 중 타이머 전부 clear (QA-S7-05: 취소 후 가짜 성사 금지)
 * - 배경 클릭/ESC로 닫히지 않음 (onClose 생략)
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cancelMatching, matchFound, useFlow } from '../state/flow';
import { Button, Modal } from '../components';
import './lobby.css';

type Phase = 'connecting' | 'waiting' | 'found';

const CONNECT_MS = 1200; // 접속 중 (SPEC: 1~2초)
const WAIT_MS = 2000; // 플레이어 대기 중 (SPEC: 2~4초)
const FOUND_MS = 600; // "매칭 완료!" 연출 (PLAN: ≤600ms)

/** 클레이 공 3개 로더 (coral/butter/mint — PLAN §2-S7) */
function BallLoader() {
  return (
    <div className="mtc-loader" aria-hidden="true">
      <span className="mtc-ball" style={{ background: 'var(--accent)' }} />
      <span className="mtc-ball" style={{ background: 'var(--pop)', animationDelay: '120ms' }} />
      <span className="mtc-ball" style={{ background: 'var(--p2)', animationDelay: '240ms' }} />
    </div>
  );
}

export default function MatchingModal() {
  const flow = useFlow();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('connecting');
  const open = flow.modal === 'matching';

  useEffect(() => {
    if (!open) {
      setPhase('connecting'); // 다음 오픈을 위한 리셋
      return;
    }
    const t1 = setTimeout(() => setPhase('waiting'), CONNECT_MS);
    const t2 = setTimeout(() => setPhase('found'), CONNECT_MS + WAIT_MS);
    const t3 = setTimeout(() => {
      const id = matchFound();
      navigate(`/game/${id}`);
    }, CONNECT_MS + WAIT_MS + FOUND_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [open, navigate]);

  if (!open) return null;

  return (
    <Modal testId="modal-matching" width={400}>
      <div className="mtc-body">
        <h2 className="mtc-title">온라인 게임하기</h2>

        {phase === 'found' ? (
          <>
            {/* P1/P2 클레이 인형이 맞부딪히는 성사 연출 */}
            <div className="mtc-found" aria-hidden="true">
              <span className="mtc-doll squash" style={{ background: 'var(--p1)' }} />
              <span className="mtc-doll squash" style={{ background: 'var(--p2)' }} />
            </div>
            <p className="mtc-msg">매칭 완료!</p>
          </>
        ) : (
          <>
            <BallLoader />
            <p className="mtc-msg" role="status">
              {phase === 'connecting' ? '게임에 접속 중입니다' : '플레이어 대기 중'}
            </p>
          </>
        )}

        {phase === 'waiting' && (
          <div className="mtc-cancel-row">
            <Button variant="cancel" data-testid="btn-matching-cancel" onClick={cancelMatching}>
              취소하기
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
