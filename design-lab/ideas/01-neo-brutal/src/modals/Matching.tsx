/**
 * S7. 온라인 매칭 상태 모달 (modal-matching)
 * [OWNER: lobby 에이전트] — 이 파일은 lobby 에이전트만 수정한다.
 *
 * SPEC S7 / PLAN §2-S7:
 *  - 'connecting'(1.2초, "게임에 접속 중입니다", 취소 없음)
 *    → 'waiting'(2초, "플레이어 대기 중", [취소하기](btn-matching-cancel))
 *    → mock 성사: matchFound() → 1.5초 VS 연출(상대 닉네임 하드 컷 공개) → navigate
 *  - 취소: cancelMatching() → S6 복귀. 대기 타이머는 effect cleanup으로 정리 (QA-S7-05)
 *  - 모달이 열릴 때마다 'connecting'부터 재시작 / 배경 클릭으로 닫히지 않음 (onClose 없음)
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameId } from '@shared';
import { Button, Modal, PlayerBadge } from '../components';
import { cancelMatching, getFlow, matchFound, useFlow } from '../state/flow';
import { useSession } from '../state/session';

const CONNECTING_MS = 1200;
const WAITING_MS = 2000;
const VS_REVEAL_MS = 1500;

const css = `
.s7-body {
  padding: 30px 30px 26px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.s7-arena {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.s7-vs {
  font-family: var(--font-display);
  font-size: 44px;
  line-height: 1;
  color: transparent;
  -webkit-text-stroke: 2px var(--ink);
  user-select: none;
}
.s7-slot-empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 120px;
  padding: 10px 16px;
  border: 3px dashed var(--p2);
  color: var(--p2);
  font-family: var(--font-display);
  font-size: 20px;
  background: var(--p2-tint);
}
.s7-strip {
  background: var(--ink);
  color: var(--bg);
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 15px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.s7-dot {
  display: inline-block;
  font-style: normal;
}
.s7-foot {
  display: flex;
  justify-content: center;
  min-height: 48px;
}
.s7-reveal {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 30px;
}
.s7-reveal::before,
.s7-reveal::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 18px;
  background: repeating-linear-gradient(45deg, #ffd600 0 12px, #0a0a0a 12px 24px);
}
.s7-reveal::before {
  top: 0;
}
.s7-reveal::after {
  bottom: 0;
}
.s7-reveal__row {
  display: flex;
  align-items: center;
  gap: 26px;
}
.s7-reveal__vs {
  font-family: var(--font-display);
  font-size: 72px;
  line-height: 1;
  background: var(--accent);
  color: var(--ink);
  border: 4px solid var(--ink);
  box-shadow: var(--shadow-md);
  padding: 6px 20px;
  transform: rotate(-6deg);
  animation: stamp-in 200ms var(--ease-snap);
}
.s7-reveal__label {
  font-family: var(--font-mono);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
`;

function Dots() {
  return (
    <span aria-hidden>
      {[0, 1, 2].map((i) => (
        <i key={i} className="s7-dot blink-steps" style={{ animationDelay: `${i * 220}ms` }}>
          .
        </i>
      ))}
    </span>
  );
}

export default function MatchingModal() {
  const flow = useFlow();
  const session = useSession();
  const navigate = useNavigate();
  const open = flow.modal === 'matching';

  const [phase, setPhase] = useState<'connecting' | 'waiting'>('connecting');
  const [vs, setVs] = useState<{ name: string; color: number; gameId: GameId } | null>(null);

  // 열릴 때마다 connecting부터 재시작
  useEffect(() => {
    if (!open) return;
    setPhase('connecting');
    const t = setTimeout(() => setPhase('waiting'), CONNECTING_MS);
    return () => clearTimeout(t);
  }, [open]);

  // 대기 → mock 성사. 취소(모달 이탈) 시 cleanup으로 타이머 정리 (QA-S7-05)
  useEffect(() => {
    if (!open || phase !== 'waiting') return;
    const t = setTimeout(() => {
      const gameId = matchFound(); // 봇 배정 + 모달 닫힘
      const opp = getFlow().opponent;
      setVs({ name: opp?.nickname ?? '???', color: opp?.avatarColorIndex ?? 1, gameId });
    }, WAITING_MS);
    return () => clearTimeout(t);
  }, [open, phase]);

  // 성사 → 1.5초 VS 연출 후 인게임 진입
  useEffect(() => {
    if (!vs) return;
    const t = setTimeout(() => {
      setVs(null);
      navigate(`/game/${vs.gameId}`);
    }, VS_REVEAL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vs]);

  const myName = session.nickname ?? 'PLAYER';
  const myColor = session.user?.avatarColorIndex ?? 0;

  return (
    <>
      <Modal open={open} title="온라인 게임하기" testId="modal-matching" width={520}>
        <style>{css}</style>
        <div className="s7-body">
          <div className="s7-arena">
            <PlayerBadge side="P1" name={myName} avatarColorIndex={myColor} isYou />
            <span className="s7-vs" aria-hidden>
              VS
            </span>
            <span className="s7-slot-empty blink-steps">???</span>
          </div>

          <div className="s7-strip">
            {phase === 'connecting' ? '게임에 접속 중입니다' : '플레이어 대기 중'}
            <Dots />
          </div>

          <div className="s7-foot">
            {phase === 'waiting' && (
              <Button variant="danger" data-testid="btn-matching-cancel" onClick={cancelMatching}>
                취소하기
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {vs && (
        <div className="s7-reveal" role="status" aria-label="매칭 성사">
          <style>{css}</style>
          <span className="s7-reveal__label">MATCH FOUND!</span>
          <div className="s7-reveal__row">
            <PlayerBadge side="P1" name={myName} avatarColorIndex={myColor} isYou />
            <span className="s7-reveal__vs">VS</span>
            <PlayerBadge side="P2" name={vs.name} avatarColorIndex={vs.color} />
          </div>
        </div>
      )}
    </>
  );
}
