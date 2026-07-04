/**
 * S7. 온라인 매칭 상태 모달 (modal-matching) — 매치메이킹 연출 (PLAN §2 S7)
 * [소유: lobby 에이전트]
 *
 * connecting("게임에 접속 중입니다", 취소 없음, ~1.2초)
 *   → waiting("플레이어 대기 중" + btn-matching-cancel, 1.5초 연출)
 *   → matched(봇 매칭 성사: 실루엣→레드 캐릭터 + VS 스탬프)
 *   → startMatch('online', pickRandomGameId()) 후 인게임 navigate
 * 취소: 타이머 전부 clear 후 onCancel() — 취소 후 성사 발생 금지 (QA-S7-05)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '../components';
import { getFlow, pickRandomGameId, startMatch } from '../state/flow';
import { useSession } from '../state/session';
import './Matching.css';

export interface MatchingProps {
  open: boolean;
  /** 취소하기 → S6 복귀 */
  onCancel: () => void;
}

type Phase = 'connecting' | 'waiting' | 'matched';

const CONNECT_MS = 1200; // 접속 연출
const WAIT_MS = 1500; // 대기 연출 (1.5초 후 봇 매칭 성사)
const VS_MS = 800; // VS 스탬프 팝 후 인게임 전환

/** 8x8 픽셀 캐릭터 스프라이트 (블루/레드 팔레트 스왑용) */
function PixelRunner({ color }: { color: string }) {
  return (
    <svg width="48" height="48" viewBox="0 0 8 8" aria-hidden="true">
      {/* 머리 */}
      <rect x="3" y="0" width="2" height="2" fill={color} />
      {/* 몸통 */}
      <rect x="2" y="2" width="4" height="3" fill={color} />
      {/* 눈 */}
      <rect x="4" y="1" width="1" height="1" fill="var(--bg-deep)" />
      {/* 팔 */}
      <rect x="1" y="3" width="1" height="1" fill={color} />
      <rect x="6" y="3" width="1" height="1" fill={color} />
      {/* 다리 */}
      <rect x="2" y="5" width="1" height="2" fill={color} />
      <rect x="5" y="5" width="1" height="2" fill={color} />
    </svg>
  );
}

export default function Matching({ open, onCancel }: MatchingProps) {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const timersRef = useRef<number[]>([]);
  const navigate = useNavigate();
  const session = useSession();

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  };

  useEffect(() => {
    if (!open) return;
    setPhase('connecting');
    setOpponentName(null);
    const push = (fn: () => void, ms: number) => {
      timersRef.current.push(window.setTimeout(fn, ms));
    };
    push(() => setPhase('waiting'), CONNECT_MS);
    push(() => {
      // 매칭 성사 — 봇 상대 배정 (flow가 상대를 뽑는다)
      const gameId = pickRandomGameId();
      startMatch('online', gameId);
      setOpponentName(getFlow().opponent?.nickname ?? 'BOT');
      setPhase('matched');
      push(() => navigate(`/game/${gameId}`), VS_MS);
    }, CONNECT_MS + WAIT_MS);
    // 언마운트/닫힘 시 타이머 정리 (취소 후 성사 금지 — QA-S7-05)
    return clearTimers;
  }, [open, navigate]);

  const handleCancel = () => {
    clearTimers();
    onCancel();
  };

  const myName = session.nickname ?? 'YOU';

  return (
    <Modal open={open} title="ONLINE MATCH" testId="modal-matching" width={360} closeOnBackdrop={false}>
      <div className="mat-body">
        <div className="mat-loading">
          {phase === 'matched' ? 'MATCH FOUND!' : 'NOW LOADING'}
          {phase !== 'matched' ? (
            <span aria-hidden="true">
              <span className="mat-dot">.</span>
              <span className="mat-dot">.</span>
              <span className="mat-dot">.</span>
            </span>
          ) : null}
        </div>

        <div className="mat-vs-row">
          {/* 내 캐릭터 (블루) — 제자리 걷기 */}
          <div className="mat-slot">
            <span className="mat-walk" title={myName}>
              <PixelRunner color="var(--p1)" />
            </span>
          </div>

          {phase !== 'connecting' ? (
            <span className={phase === 'matched' ? 'mat-vs px-pop' : 'mat-vs'} style={phase === 'matched' ? undefined : { color: 'var(--text-soft)' }}>
              VS
            </span>
          ) : null}

          {/* 상대 슬롯: 대기 중 실루엣 → 성사 시 레드 캐릭터로 팔레트 스왑 */}
          {phase === 'waiting' ? (
            <div className="mat-silhouette px-blink" aria-label="상대 대기 중">
              ?
            </div>
          ) : null}
          {phase === 'matched' ? (
            <div className="mat-slot px-pop" title={opponentName ?? ''}>
              <PixelRunner color="var(--p2)" />
            </div>
          ) : null}
        </div>

        {phase === 'connecting' ? <p className="mat-status">게임에 접속 중입니다</p> : null}
        {phase === 'waiting' ? <p className="mat-status">플레이어 대기 중</p> : null}
        {phase === 'matched' ? (
          <>
            <p className="mat-status">
              <span style={{ color: 'var(--p2)' }}>{opponentName}</span> 님과 매칭되었습니다!
            </p>
            <span className="mat-ok px-blink">GET READY!</span>
          </>
        ) : null}

        {phase === 'waiting' ? (
          <Button data-testid="btn-matching-cancel" variant="ghost" size="md" onClick={handleCancel}>
            취소하기
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
