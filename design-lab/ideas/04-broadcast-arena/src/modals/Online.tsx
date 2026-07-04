/**
 * S6 온라인 게임하기 패널 — MATCHMAKING 대형 패널 (lobby 에이전트 구현).
 *
 * SPEC S6: 빠른 시작 / 코드 생성 + 표시 + 복사 + 톱니(S4 재사용) / 코드 입력 + 확인 /
 * 배경 클릭 닫기 / 코드는 분반 제한 없음.
 * - 빠른 시작·코드 참가: openModal('matching') → MatchingModal이 연출 후 matchFound().
 * - 코드 생성: createRoomCode() → n초 후 mock 상대 입장 → matchFound() (QA-S6-06).
 *   타이머는 이 컴포넌트가 관리하고, online/settings 문맥을 벗어나면 정리한다.
 *
 * testid: modal-online / btn-quickstart / btn-code-create / room-code-display /
 *         input-code / btn-code-join
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Button, useToast } from '../components';
import {
  useFlow,
  closeModal,
  openModal,
  createRoomCode,
  isValidRoomCode,
  matchFound,
} from '../state/flow';
import '../screens/lobby.css';

/**
 * S4 설정을 S6 톱니로 열었는지 기록 — SettingsModal이 닫힐 때 consume해서
 * online 패널로 복귀시킨다 (ARCHITECTURE §시나리오, 재량 처리).
 */
let settingsOpenedFromOnline = false;

export function consumeSettingsReturnToOnline(): boolean {
  const r = settingsOpenedFromOnline;
  settingsOpenedFromOnline = false;
  return r;
}

function GearIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm8.6 3.5c0-.6-.05-1.16-.15-1.7l2.05-1.6-2-3.46-2.42.98a8.5 8.5 0 0 0-2.94-1.7L14.77 2h-4l-.37 2.52a8.5 8.5 0 0 0-2.94 1.7l-2.42-.98-2 3.46 2.05 1.6a8.6 8.6 0 0 0 0 3.4l-2.05 1.6 2 3.46 2.42-.98a8.5 8.5 0 0 0 2.94 1.7L10.77 22h4l.37-2.52a8.5 8.5 0 0 0 2.94-1.7l2.42.98 2-3.46-2.05-1.6c.1-.54.15-1.1.15-1.7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 코드 생성 후 mock 상대 입장까지 지연 (SPEC S6 "코드 생성 n초 후 가짜 입장") */
const MOCK_JOIN_DELAY_MS = 4000;

export default function OnlineModal() {
  const flow = useFlow();
  const navigate = useNavigate();
  const { toast, showToast } = useToast();
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(false);
  const joinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearJoinTimer = () => {
    if (joinTimer.current) {
      clearTimeout(joinTimer.current);
      joinTimer.current = null;
    }
  };

  // online(또는 톱니로 연 settings) 문맥을 벗어나면 mock 입장 타이머 정리
  useEffect(() => {
    if (flow.modal !== 'online' && flow.modal !== 'settings') clearJoinTimer();
  }, [flow.modal]);
  useEffect(() => clearJoinTimer, []);

  if (flow.modal !== 'online') return null;

  const onQuickstart = () => {
    clearJoinTimer();
    openModal('matching'); // QA-S6-03 — MatchingModal이 connecting→waiting 연출
  };

  const onCreateCode = () => {
    createRoomCode(); // flow.roomCode에 저장 → 아래 슬롯에 표시 (QA-S6-04)
    clearJoinTimer();
    joinTimer.current = setTimeout(() => {
      const id = matchFound(); // mock 상대 입장 → 인게임 (QA-S6-06)
      navigate(`/game/${id}`);
    }, MOCK_JOIN_DELAY_MS);
  };

  const onCopy = () => {
    if (!flow.roomCode) return;
    void navigator.clipboard
      .writeText(flow.roomCode)
      .then(() => showToast('복사됨'))
      .catch(() => showToast('복사 실패'));
  };

  const onJoin = () => {
    if (!isValidRoomCode(codeInput)) {
      setCodeError(true); // 잘못된 형식 인라인 에러
      return;
    }
    setCodeError(false);
    clearJoinTimer();
    openModal('matching'); // 성사 플로우 (QA-S6-07)
  };

  const onGear = () => {
    settingsOpenedFromOnline = true;
    openModal('settings'); // QA-S6-08 — S4 재사용
  };

  const onDismiss = () => {
    clearJoinTimer();
    setCodeError(false);
    closeModal(); // 배경 클릭/ESC 닫기 (QA-S6-09)
  };

  return (
    <Modal testId="modal-online" tab="MATCHMAKING" onClose={onDismiss} width={560}>
      <h2 className="display" style={{ margin: '0 0 18px', fontSize: 22, fontWeight: 800 }}>
        온라인 게임하기
      </h2>

      {/* 빠른 시작 — 풀폭 primary */}
      <Button
        testId="btn-quickstart"
        variant="primary"
        size="lg"
        onClick={onQuickstart}
        style={{ width: '96%', marginLeft: '2%', marginBottom: 22 }}
      >
        빠른 시작 · QUICK MATCH
      </Button>

      {/* 게임 만들기 / 참가하기 서브카드 */}
      <div className="lobby-subcard">
        <p className="label" style={{ margin: '0 0 14px', color: 'var(--ink-sub)' }}>
          게임 만들기 / 참가하기
        </p>

        {/* 1행: 코드 생성 + 코드 슬롯 + 복사 + 톱니 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Button testId="btn-code-create" variant="secondary" onClick={onCreateCode}>
            코드 생성하기
          </Button>
          <span
            data-testid="room-code-display"
            className="lobby-code-slot tnum"
            style={{ color: flow.roomCode ? 'var(--ink)' : 'var(--ink-sub)' }}
          >
            {flow.roomCode ?? '＿＿＿＿＿＿'}
          </span>
          <Button variant="secondary" onClick={onCopy} disabled={!flow.roomCode}>
            복사
          </Button>
          <button
            type="button"
            className="lobby-icon-btn"
            aria-label="방 설정"
            onClick={onGear}
          >
            <GearIcon />
          </button>
        </div>

        {/* 2행: 코드 입력 + 확인 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="label" style={{ color: 'var(--ink-sub)', flexShrink: 0 }}>
            코드 입력하기
          </span>
          <input
            data-testid="input-code"
            className={`input tnum${codeError ? ' input-error' : ''}`}
            style={{ flex: 1, minWidth: 0, letterSpacing: '0.1em' }}
            inputMode="numeric"
            placeholder="상대방의 방 코드"
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value);
              if (codeError) setCodeError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onJoin();
            }}
          />
          <Button testId="btn-code-join" variant="primary" onClick={onJoin}>
            확인
          </Button>
        </div>
        {codeError && (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--live)' }}>
            숫자로 된 방 코드를 입력해 주세요
          </p>
        )}
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-sub)' }}>
          코드는 분반 제한 없이 누구와도 대결할 수 있습니다
        </p>
      </div>
      {toast}
    </Modal>
  );
}
