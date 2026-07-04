/**
 * S7 온라인 매칭 상태 모달 — ESTABLISHING FEED 중계 연결 연출 (lobby 에이전트 구현).
 *
 * SPEC S7: connecting("게임에 접속 중입니다", 취소 없음) → waiting("플레이어 대기 중" +
 * 취소하기) → 1.5초 연출 후 mock 매칭 성사 → 인게임 자동 전환. 취소 시 타이머 정리 후 S6.
 * - 취소 버튼은 waiting 단계에만 노출 (Q15 원안 충실).
 * - 성사 순간 짧은 VS 와이프(found) 후 matchFound() → navigate (PLAN §2 S7).
 * - 배경 클릭/ESC로 닫히지 않음 (진행 중 모달 — onClose 생략).
 *
 * testid: modal-matching / btn-matching-cancel
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Button } from '../components';
import { useFlow, cancelMatching, matchFound } from '../state/flow';
import { useSession } from '../state/session';
import '../screens/lobby.css';

const CONNECTING_MS = 1000; // connecting → waiting
const WAITING_MS = 1500; // waiting → 매칭 성사 (SPEC "1.5초 연출")
const FOUND_MS = 700; // VS 와이프 → 인게임 전환

type Stage = 'connecting' | 'waiting' | 'found';

/** 위성 신호 바 4개 순차 점등 */
function SignalBars() {
  return (
    <div
      aria-hidden="true"
      style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 44 }}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="lobby-signal-bar"
          style={{ height: 14 + i * 10, animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </div>
  );
}

/** 스큐 네임플레이트 (내 쪽 파랑 / 빈 상대 슬롯) */
function Plate({
  name,
  side,
  empty = false,
  blink = false,
}: {
  name: string;
  side: 'p1' | 'p2';
  empty?: boolean;
  blink?: boolean;
}) {
  return (
    <span
      className={`skew${blink ? ' lobby-blink' : ''}`}
      style={{
        display: 'inline-block',
        minWidth: 130,
        textAlign: 'center',
        background: empty ? 'var(--bg)' : 'var(--surface)',
        border: empty ? '1px dashed var(--line)' : '1px solid var(--line)',
        borderLeft: `4px solid var(--${side})`,
        padding: '8px 18px',
        boxShadow: empty ? undefined : 'var(--shadow)',
      }}
    >
      <span
        className="unskew"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 14,
          color: empty ? 'var(--ink-sub)' : 'var(--ink)',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
    </span>
  );
}

export default function MatchingModal() {
  const flow = useFlow();
  const session = useSession();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('connecting');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const active = flow.modal === 'matching';

  // 열릴 때마다 connecting부터 연출 시작. 닫히면(취소 포함) 타이머 전부 정리 (QA-S7-05)
  useEffect(() => {
    if (!active) return;
    setStage('connecting');
    const t1 = setTimeout(() => setStage('waiting'), CONNECTING_MS);
    const t2 = setTimeout(() => setStage('found'), CONNECTING_MS + WAITING_MS);
    const t3 = setTimeout(() => {
      const id = matchFound(); // 봇 배정 + 매치 시작 + 모달 닫기
      navigate(`/game/${id}`); // QA-S7-04 인게임 자동 전환
    }, CONNECTING_MS + WAITING_MS + FOUND_MS);
    timers.current = [t1, t2, t3];
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // navigate는 안정 참조 — active 전환 시에만 재실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  const onCancel = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cancelMatching(); // → S6 복귀 (QA-S7-03)
  };

  const myName = session.nickname ?? 'YOU';

  return (
    <Modal testId="modal-matching" tab="ESTABLISHING FEED…" width={480}>
      <h2 className="display" style={{ margin: '0 0 22px', fontSize: 22, fontWeight: 800 }}>
        온라인 게임하기
      </h2>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          padding: '6px 0 4px',
          minHeight: 190,
          justifyContent: 'center',
        }}
      >
        {stage === 'connecting' && (
          <>
            <SignalBars />
            {/* QA-S7-01 */}
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>게임에 접속 중입니다</p>
            <p className="label" style={{ margin: 0, color: 'var(--ink-sub)' }}>
              CONNECTING TO ARENA FEED
            </p>
          </>
        )}

        {stage === 'waiting' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Plate name={myName} side="p1" />
              <span
                className="display"
                style={{ fontWeight: 900, fontStyle: 'italic', fontSize: 18 }}
              >
                VS
              </span>
              <Plate name="대기 중…" side="p2" empty blink />
            </div>
            {/* QA-S7-02 */}
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>플레이어 대기 중</p>
            <Button testId="btn-matching-cancel" variant="secondary" onClick={onCancel}>
              취소하기
            </Button>
          </>
        )}

        {stage === 'found' && (
          <>
            <div
              className="wipe-in"
              style={{ display: 'flex', alignItems: 'center', gap: 16 }}
            >
              <Plate name={myName} side="p1" />
              <span
                className="display"
                style={{ fontWeight: 900, fontStyle: 'italic', fontSize: 18 }}
              >
                VS
              </span>
              <Plate name="CHALLENGER" side="p2" />
            </div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>상대를 찾았습니다!</p>
            <p className="label" style={{ margin: 0, color: 'var(--ink-sub)' }}>
              GOING LIVE…
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
