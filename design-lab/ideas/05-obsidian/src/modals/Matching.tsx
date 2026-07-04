/**
 * S7 온라인 매칭 상태 모달 (modal-matching). 소유: lobby 에이전트.
 * SPEC S7 + PLAN §2.S7 참조.
 * 필요 testid: modal-matching(자동), btn-matching-cancel
 * 동작: connecting(1.2초, 취소 없음 — Q15) → waiting(취소하기) →
 *       총 3초 시점 mock 성사 → startOnlineMatch() → VS 와이프 → 인게임.
 *       취소 시 타이머 전부 clear (QA-S7-05) 후 onCancel(→ S6 복귀).
 *       배경 클릭으로는 닫히지 않게 (closeOnBackdrop={false}).
 *
 * VSWipe는 S6(코드 방 mock 입장)에서도 재사용한다.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '../components';
import { gamePath, getFlow, startOnlineMatch } from '../state/flow';
import { getSession } from '../state/session';
import '../screens/lobby.css';

export interface MatchingProps {
  open: boolean;
  /** 취소하기 → S6 복귀 */
  onCancel: () => void;
}

/** 매칭 성사 VS 와이프 (PLAN §1.4) — 좌 시안(나) / 우 마젠타(상대) 사선 충돌 */
export function VSWipe({ me, opponent }: { me: string; opponent: string }) {
  return (
    <div className="vswipe" aria-hidden="true">
      <div className="vswipe-half vswipe-l">
        <span className="vswipe-name">{me}</span>
      </div>
      <div className="vswipe-half vswipe-r">
        <span className="vswipe-name">{opponent}</span>
      </div>
      <div className="vswipe-vs">VS</div>
    </div>
  );
}

type Phase = 'connecting' | 'waiting' | 'matched';

const CONNECTING_MS = 1200;
const MATCHED_AT_MS = 3000; // 접속 1.2초 + 대기 1.8초
const WIPE_MS = 1100;

export default function Matching({ open, onCancel }: MatchingProps) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('connecting');
  const [vs, setVs] = useState<{ me: string; opponent: string } | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (!open) return;
    setPhase('connecting');
    setVs(null);
    const push = (id: number) => timersRef.current.push(id);

    push(window.setTimeout(() => setPhase('waiting'), CONNECTING_MS));
    push(
      window.setTimeout(() => {
        // mock 매칭 성사 — 봇 상대 배정 + 게임 랜덤 (SPEC Q8)
        const gameId = startOnlineMatch();
        setVs({
          me: getSession().user?.nickname ?? 'YOU',
          opponent: getFlow().opponent?.nickname ?? 'CHALLENGER',
        });
        setPhase('matched');
        push(window.setTimeout(() => navigate(gamePath(gameId)), WIPE_MS));
      }, MATCHED_AT_MS),
    );

    // 취소/언마운트 시 타이머 전부 정리 — 취소 후 가짜 성사 방지 (QA-S7-05)
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <Modal
        open={open}
        // 취소는 waiting 단계에만 (SPEC Q15 — connecting에는 취소 수단 없음)
        onClose={phase === 'waiting' ? onCancel : undefined}
        closeOnBackdrop={false}
        overline={
          phase === 'connecting'
            ? 'ESTABLISHING LINK'
            : phase === 'waiting'
              ? 'SEARCHING OPPONENT'
              : 'MATCH FOUND'
        }
        title="온라인 게임하기"
        testId="modal-matching"
        width={380}
      >
        <div className="mtc-body">
          <div className="mtc-radar" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          {phase === 'connecting' && <div className="mtc-text">게임에 접속 중입니다</div>}
          {phase === 'waiting' && (
            <>
              <div className="mtc-text">
                플레이어 대기 중
                <span className="dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <Button
                variant="secondary"
                testId="btn-matching-cancel"
                onClick={onCancel}
                style={{ marginTop: 22 }}
              >
                취소하기
              </Button>
            </>
          )}
          {phase === 'matched' && <div className="mtc-text">상대를 찾았습니다</div>}
        </div>
      </Modal>
      {open && phase === 'matched' && vs && <VSWipe me={vs.me} opponent={vs.opponent} />}
    </>
  );
}
