/**
 * S6 온라인 게임하기 패널 (lobby 에이전트 소유).
 * 본체 testid: modal-online / 부품: btn-quickstart, btn-code-create, room-code-display,
 *   input-code, btn-code-join (+ 복사, 톱니→S4 재사용)
 * PLAN §2-S6: "온라인 게임하기 — VS MODE" 마퀴 + [빠른 시작](옐로 히어로, INSERT COIN ▶ 점멸)
 *   + surface-deep 서브 섹션 "게임 만들기 / 참가하기" — 1행 코드 생성(생성 전 점멸 슬롯 →
 *   생성 후 옐로 대형 코드 + 복사 COPIED! + 톱니) / OR 칩 / 2행 코드 입력 + 확인.
 * SPEC QA-S6-01~09:
 *   빠른 시작 → openModal('matching') / 코드 생성 → createRoomCode() + 2.5초 뒤 mock 상대
 *   입장(matchFound → navigate) / 코드 확인 → 형식 검증(isValidRoomCode) 후 openModal('matching')
 *   / 톱니 → S4 열고 닫히면 이 패널로 복귀 / 배경 클릭 닫기(타이머 정리).
 * 열림 조건: flow.modal === 'online'.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CoinButton, Modal } from '../components';
import {
  closeModal,
  createRoomCode,
  isValidRoomCode,
  matchFound,
  openModal,
  useFlow,
} from '../state/flow';
import './online.css';

export default function OnlineModal() {
  const flow = useFlow();
  const navigate = useNavigate();
  const open = flow.modal === 'online';

  /** 생성된 코드 (이번 패널 세션 로컬 표시용 — 닫으면 리셋) */
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  /** mock 상대 입장 타이머 (코드 생성 후) */
  const joinTimerRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  /** 톱니로 S4를 열었을 때, S4가 닫히면 이 패널로 복귀하기 위한 플래그 */
  const returnFromSettingsRef = useRef(false);

  const clearJoinTimer = () => {
    if (joinTimerRef.current !== null) {
      window.clearTimeout(joinTimerRef.current);
      joinTimerRef.current = null;
    }
  };

  // 모달 상태 감시: S4에서 돌아오기 / 패널 완전 이탈 시 정리
  useEffect(() => {
    if (flow.modal === null && returnFromSettingsRef.current) {
      // 톱니로 연 설정이 닫힘 → 온라인 패널로 복귀 (SPEC S6-5 방 설정 재사용)
      returnFromSettingsRef.current = false;
      openModal('online');
      return;
    }
    if (flow.modal !== 'online' && flow.modal !== 'settings') {
      // 패널을 떠남(닫기/매칭 진입) — mock 입장 타이머와 로컬 상태 정리
      clearJoinTimer();
      returnFromSettingsRef.current = false;
      setCreatedCode(null);
      setCopied(false);
      setJoinCode('');
      setJoinError(null);
    }
  }, [flow.modal]);

  // 언마운트 시 타이머 정리
  useEffect(
    () => () => {
      clearJoinTimer();
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const onQuickStart = () => {
    clearJoinTimer();
    openModal('matching'); // → S7이 connecting→waiting→성사 연출
  };

  const onCreateCode = () => {
    const code = createRoomCode();
    setCreatedCode(code);
    setCopied(false);
    // mock 상대 입장: 2.5초 후 매칭 성사 → 인게임 (QA-S6-06)
    clearJoinTimer();
    joinTimerRef.current = window.setTimeout(() => {
      joinTimerRef.current = null;
      // 설정(톱니)이 열려 있었어도 게임으로 가므로 패널 복귀 플래그는 해제
      returnFromSettingsRef.current = false;
      const id = matchFound();
      navigate(`/game/${id}`);
    }, 2500);
  };

  const onCopy = async () => {
    if (!createdCode) return;
    try {
      await navigator.clipboard.writeText(createdCode);
    } catch {
      // clipboard API 불가 환경 fallback
      const ta = document.createElement('textarea');
      ta.value = createdCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  const onGear = () => {
    returnFromSettingsRef.current = true;
    openModal('settings');
  };

  const onJoin = () => {
    if (!isValidRoomCode(joinCode)) {
      setJoinError('숫자 코드를 입력해 주세요');
      return;
    }
    setJoinError(null);
    clearJoinTimer();
    openModal('matching'); // 매칭 성사 플로우로 (QA-S6-07)
  };

  return (
    <Modal
      open={open}
      onClose={closeModal}
      marquee="온라인 게임하기 — VS MODE"
      accentColor="var(--accent)"
      testId="modal-online"
      width={640}
    >
      <h2 className="font-display s6-title">온라인 게임하기</h2>

      {/* 히어로 CTA — 빠른 시작 */}
      <div className="s6-hero">
        <p className="font-arcade c-accent anim-blink s6-insert" aria-hidden>
          INSERT COIN ▶
        </p>
        <Button variant="primary" coin block data-testid="btn-quickstart" onClick={onQuickStart}>
          빠른 시작
        </Button>
      </div>

      {/* 서브 섹션: 게임 만들기 / 참가하기 */}
      <section className="s6-sub">
        <h3 className="font-display s6-sub-title">게임 만들기 / 참가하기</h3>

        {/* 1행: 코드 생성 */}
        <div className="s6-row">
          <Button variant="secondary" data-testid="btn-code-create" onClick={onCreateCode}>
            코드 생성하기
          </Button>
          <div className="s6-code-slot" data-testid="room-code-display">
            {createdCode ? (
              <span className="font-arcade s6-code c-accent glow-text anim-sign-on">
                {createdCode}
              </span>
            ) : (
              <span className="font-arcade s6-code-placeholder c-muted anim-blink" aria-hidden>
                - - - - - -
              </span>
            )}
          </div>
          <div className="s6-code-tools">
            {copied && (
              <span className="font-arcade s6-copied c-p1 glow-text" role="status">
                COPIED!
              </span>
            )}
            <Button variant="tertiary" onClick={onCopy} disabled={!createdCode}>
              복사
            </Button>
            <CoinButton label="방 설정" color="var(--accent2)" onClick={onGear}>
              ⚙
            </CoinButton>
          </div>
        </div>

        {/* OR 구분선 */}
        <div className="s6-or" aria-hidden>
          <span className="s6-or-chip font-arcade c-accent2">OR</span>
        </div>

        {/* 2행: 코드 입력 */}
        <div className="s6-row s6-row--join">
          <span className="font-display s6-join-label">코드 입력하기</span>
          <div className="s6-join-field">
            <label className={`neon-input${joinError ? ' error anim-shake' : ''}`}>
              <span className="prompt">&gt;</span>
              <input
                data-testid="input-code"
                value={joinCode}
                inputMode="numeric"
                placeholder="상대의 방 코드"
                aria-label="코드 입력하기"
                onChange={(e) => {
                  setJoinCode(e.target.value);
                  if (joinError) setJoinError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onJoin();
                }}
              />
            </label>
            {joinError && <p className="s6-join-error c-error">{joinError}</p>}
          </div>
          <Button variant="primary" data-testid="btn-code-join" onClick={onJoin}>
            확인
          </Button>
        </div>
      </section>
    </Modal>
  );
}
