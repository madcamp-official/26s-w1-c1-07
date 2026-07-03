/**
 * S6. 온라인 게임하기 패널 (modal-online)
 * [OWNER: lobby 에이전트] — 이 파일은 lobby 에이전트만 수정한다.
 *
 * SPEC S6 / PLAN §2-S6:
 *  - [빠른 시작](btn-quickstart) → openModal('matching') (연출은 S7)
 *  - [코드 생성하기](btn-code-create) → createRoomCode() → room-code-display 표시
 *    + [복사] clipboard + "COPIED!" 스티커 / 코드 없으면 비활성
 *    + 생성 n초 후 mock 상대 입장 → matchFound() → navigate (모달 닫히면 타이머 취소)
 *  - 코드 입력(input-code)+[확인](btn-code-join): isValidRoomCode → 매칭 합류, 오류는 인라인
 *  - 톱니 → openSettingsFromOnline() (닫히면 온라인 패널 복귀)
 *  - 배경 클릭 → closeModal() (메인 복귀)
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, Sticker } from '../components';
import {
  closeModal,
  createRoomCode,
  isValidRoomCode,
  matchFound,
  openModal,
  useFlow,
} from '../state/flow';
import { openSettingsFromOnline } from './Settings';

/** 코드 생성 후 mock 상대가 입장하기까지 대기 시간 */
const MOCK_JOIN_DELAY_MS = 3000;

const css = `
.s6-body {
  padding: 26px 30px 30px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.s6-sub {
  background: var(--surface-sunken);
  border: 3px solid var(--ink);
  padding: 18px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.s6-sub__title {
  font-family: var(--font-display);
  font-size: 18px;
  text-align: center;
}
.s6-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.s6-code-slot {
  flex: 1 1 200px;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 22px;
  letter-spacing: 0.12em;
  background: var(--surface);
  border: 3px solid var(--ink);
  padding: 4px 10px;
}
.s6-code-slot--empty {
  border-style: dashed;
  color: var(--ink-muted);
  background: transparent;
}
.s6-gear {
  width: 44px;
  height: 44px;
  border: 3px solid var(--ink);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink);
  transition:
    transform var(--dur-fast) var(--ease-snap),
    box-shadow var(--dur-fast) var(--ease-snap);
}
.s6-gear:hover {
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 var(--ink);
}
.s6-gear:active {
  transform: translate(4px, 4px);
  box-shadow: none;
}
.s6-or {
  display: flex;
  align-items: center;
  gap: 10px;
}
.s6-or::before,
.s6-or::after {
  content: '';
  flex: 1;
  border-top: 2px solid var(--ink);
}
.s6-or span {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 12px;
  border: 2px solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--surface);
  padding: 2px 10px;
}
.s6-wait {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-muted);
  text-align: center;
}
`;

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm9.3 5.2-2-.3c-.14.52-.34 1-.6 1.46l1.24 1.62-1.84 1.84-1.62-1.24c-.45.26-.94.46-1.46.6l-.3 2h-2.6l-.3-2a6.6 6.6 0 0 1-1.46-.6l-1.62 1.24-1.84-1.84 1.24-1.62a6.6 6.6 0 0 1-.6-1.46l-2-.3v-2.6l2-.3c.14-.52.34-1 .6-1.46L6.9 6.8l1.84-1.84 1.62 1.24c.45-.26.94-.46 1.46-.6l.3-2h2.6l.3 2c.52.14 1 .34 1.46.6l1.62-1.24 1.84 1.84-1.24 1.62c.26.45.46.94.6 1.46l2 .3v2.6Z"
      />
    </svg>
  );
}

export default function OnlineModal() {
  const flow = useFlow();
  const navigate = useNavigate();
  const open = flow.modal === 'online';

  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  /** 코드 생성 직후 mock 상대 입장 타이머가 무장된 상태 */
  const [armed, setArmed] = useState(false);

  // 패널이 열릴 때마다 일시 피드백 초기화
  useEffect(() => {
    if (open) {
      setJoinError(null);
      setCopied(null);
    }
  }, [open]);

  // 코드 생성 → n초 후 mock 상대 입장 → 인게임. 모달이 닫히면 취소 (QA-S6-06)
  useEffect(() => {
    if (!armed) return;
    if (flow.modal === 'settings') return; // 톱니로 설정 여는 동안은 일시 정지
    if (flow.modal !== 'online') {
      setArmed(false); // 패널을 떠났으면 무장 해제
      return;
    }
    const t = setTimeout(() => {
      setArmed(false);
      const id = matchFound();
      navigate(`/game/${id}`);
    }, MOCK_JOIN_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, flow.modal]);

  // "COPIED!" 스티커 자동 소멸
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const onCreateCode = () => {
    createRoomCode();
    setCopied(null);
    setArmed(true);
  };

  const onCopy = () => {
    const code = flow.roomCode;
    if (!code) return;
    navigator.clipboard
      .writeText(code)
      .then(() => setCopied('ok'))
      .catch(() => setCopied('fail'));
  };

  const onJoin = () => {
    if (!isValidRoomCode(joinCode)) {
      setJoinError('숫자만 입력 가능한 코드입니다');
      return;
    }
    setJoinError(null);
    setJoinCode('');
    openModal('matching');
  };

  return (
    <Modal
      open={open}
      title="온라인 게임하기 / FIND YOUR RIVAL"
      onClose={closeModal}
      testId="modal-online"
      width={640}
    >
      <style>{css}</style>
      <div className="s6-body">
        <Button
          variant="primary"
          size="lg"
          data-testid="btn-quickstart"
          style={{ width: '100%' }}
          onClick={() => openModal('matching')}
        >
          빠른 시작
        </Button>

        <div className="s6-sub">
          <div className="s6-sub__title">게임 만들기 / 참가하기</div>

          <div className="s6-row">
            <Button variant="secondary" data-testid="btn-code-create" onClick={onCreateCode}>
              코드 생성하기
            </Button>
            <div
              data-testid="room-code-display"
              className={`s6-code-slot${flow.roomCode ? '' : ' s6-code-slot--empty'}`}
            >
              {flow.roomCode ?? '–  –  –  –  –'}
            </div>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Button variant="secondary" size="sm" disabled={!flow.roomCode} onClick={onCopy}>
                복사
              </Button>
              {copied === 'ok' && (
                <Sticker
                  tilt={-6}
                  bg="var(--highlight)"
                  fontSize={12}
                  style={{ position: 'absolute', top: -26, right: -10, zIndex: 1 }}
                >
                  COPIED!
                </Sticker>
              )}
              {copied === 'fail' && (
                <Sticker
                  tilt={-6}
                  color="var(--error)"
                  fontSize={12}
                  style={{ position: 'absolute', top: -26, right: -10, zIndex: 1 }}
                >
                  복사 실패
                </Sticker>
              )}
            </span>
            <button
              type="button"
              className="s6-gear"
              aria-label="방 설정"
              onClick={openSettingsFromOnline}
            >
              <GearIcon />
            </button>
          </div>

          {armed && flow.roomCode && (
            <div className="s6-wait">
              상대 입장 대기 중<span className="blink-steps">…</span>
            </div>
          )}

          <div className="s6-or" aria-hidden>
            <span>OR</span>
          </div>

          <div className="s6-row">
            <span className="label-caps" style={{ fontSize: 13, fontWeight: 700 }}>
              코드 입력하기
            </span>
            <input
              className={`nb-input font-mono${joinError ? ' nb-input--error' : ''}`}
              data-testid="input-code"
              value={joinCode}
              placeholder="00000000000"
              inputMode="numeric"
              style={{ flex: '1 1 180px', letterSpacing: '0.12em' }}
              onChange={(e) => {
                setJoinCode(e.target.value);
                if (joinError) setJoinError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onJoin();
              }}
            />
            <Button variant="secondary" data-testid="btn-code-join" onClick={onJoin}>
              확인
            </Button>
          </div>
          {joinError && <p className="input-error-text">{joinError}</p>}
        </div>
      </div>
    </Modal>
  );
}
