/**
 * S6 온라인 게임하기 패널 (lobby 에이전트 소유).
 *
 * modal testid: modal-online
 * testid: btn-quickstart, btn-code-create, room-code-display, input-code, btn-code-join
 * - 빠른 시작 → openModal('matching') (QA-S6-03)
 * - 코드 생성 → createRoomCode() 표시(구슬 목걸이 연출), n초 후 mock 상대 입장 →
 *   matchFound() + navigate (QA-S6-04·06). 패널이 닫히면 대기 타이머 clear.
 * - 복사 → clipboard + 토스트 (QA-S6-05). 코드 미생성 시 비활성.
 * - 코드 입력 + 확인 → isValidRoomCode 통과 시 매칭 모달 (QA-S6-07),
 *   실패 시 에러 링 + 흔들림.
 * - 톱니 → 설정 모달(S4 재사용), 닫히면 이 패널로 복귀 (QA-S6-08)
 * - 배경 클릭 → closeModal (QA-S6-09)
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  closeModal,
  createRoomCode,
  isValidRoomCode,
  matchFound,
  openModal,
  useFlow,
} from '../state/flow';
import { Button, Modal, Toast, useToast } from '../components';
import { GearIcon, openSettingsFrom } from './Settings';
import './lobby.css';

/** 코드 생성 후 mock 상대가 입장하기까지의 지연 (SPEC S6: "n초 후 가짜 입장") */
const MOCK_JOIN_DELAY_MS = 4000;

/** 번개 아이콘 — 빠른 시작 (PLAN §2-S6) */
function BoltIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#FFF9F4" d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}

export default function OnlineModal() {
  const flow = useFlow();
  const navigate = useNavigate();
  const { toast, showToast } = useToast();
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const open = flow.modal === 'online';

  // 코드 생성 후 mock 상대 입장 대기 — 패널이 열려 있는 동안만 (닫히면 clear)
  useEffect(() => {
    if (!open || !flow.roomCode) return;
    const t = setTimeout(() => {
      const id = matchFound();
      navigate(`/game/${id}`);
    }, MOCK_JOIN_DELAY_MS);
    return () => clearTimeout(t);
  }, [open, flow.roomCode, navigate]);

  if (!open) return null;

  const join = () => {
    if (isValidRoomCode(codeInput)) {
      setCodeError(false);
      openModal('matching');
    } else {
      setCodeError(true);
      setShaking(true);
    }
  };

  const copy = async () => {
    if (!flow.roomCode) return;
    try {
      await navigator.clipboard.writeText(flow.roomCode);
      showToast('코드 복사됨!');
    } catch {
      showToast('복사에 실패했어요');
    }
  };

  return (
    <Modal testId="modal-online" onClose={closeModal} tone="sky" width={560}>
      <h2 className="onl-title">온라인 게임하기</h2>

      <Button
        variant="primary"
        size="lg"
        data-testid="btn-quickstart"
        style={{ width: '100%' }}
        onClick={() => openModal('matching')}
      >
        <BoltIcon />
        빠른 시작
      </Button>

      <section className="onl-sub sunken">
        <h3 className="onl-sub-title">게임 만들기 / 참가하기</h3>

        {/* 1행: 코드 생성 + 코드 표시(구슬) + 복사 + 톱니 */}
        <div className="onl-row">
          <Button
            variant="secondary"
            size="sm"
            data-testid="btn-code-create"
            onClick={() => createRoomCode()}
          >
            코드 생성하기
          </Button>
          <div data-testid="room-code-display" className="onl-code num">
            {flow.roomCode ? (
              flow.roomCode
                .split('')
                .map((digit, i) => (
                  <span
                    key={`${flow.roomCode}-${i}`}
                    className="onl-bead pop-in"
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    {digit}
                  </span>
                ))
            ) : (
              <span className="onl-code-empty" aria-label="코드 미생성" />
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={copy}
            disabled={!flow.roomCode}
            style={!flow.roomCode ? { opacity: 0.45, cursor: 'default' } : undefined}
          >
            복사
          </Button>
          <button
            type="button"
            className="jelly onl-gear"
            aria-label="방 설정"
            onClick={() => openSettingsFrom('online')}
          >
            <GearIcon size={20} />
          </button>
        </div>

        {/* 2행: 코드 입력 + 확인 */}
        <div className="onl-row">
          <span className="onl-label">코드 입력하기</span>
          <input
            data-testid="input-code"
            className={`onl-input num ${codeError ? 'onl-input-error' : ''} ${shaking ? 'shake' : ''}`}
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value);
              if (codeError) setCodeError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') join();
            }}
            onAnimationEnd={() => setShaking(false)}
            placeholder="코드를 입력하세요"
            inputMode="numeric"
            aria-invalid={codeError}
          />
          <Button variant="primary" size="sm" data-testid="btn-code-join" onClick={join}>
            확인
          </Button>
        </div>
        {codeError && <p className="onl-error">숫자 코드만 입력할 수 있어요</p>}
      </section>

      <Toast message={toast} />
    </Modal>
  );
}
