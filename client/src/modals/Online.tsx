/**
 * S6 온라인 게임하기 패널 (lobby 에이전트 소유).
 * 본체 testid: modal-online / 부품: btn-quickstart, btn-code-create, room-code-display,
 *   input-code, btn-code-join (+ 복사, 톱니→S4 재사용)
 * PLAN §2-S6: "온라인 게임하기 — VS MODE" 마퀴 + [빠른 시작](옐로 히어로, INSERT COIN ▶ 점멸)
 *   + surface-deep 서브 섹션 "게임 만들기 / 참가하기" — 1행 코드 생성(생성 전 점멸 슬롯 →
 *   생성 후 옐로 대형 코드 + 복사 COPIED! + 톱니) / OR 칩 / 2행 코드 입력 + 확인.
 * SPEC QA-S6-01~09 + 코인 베팅:
 *   빠른 시작/코드 생성/코드 입력 각각 실행 전 "코인 베팅" 단계가 끼어든다 —
 *   보유 코인 한도 내 정수를 텍스트필드로 입력(0 허용). 서버가 보유량 재검증.
 *   빠른 시작 → 베팅 → openModal('matching') / 코드 생성 → 베팅 → 코드 표시
 *   / 코드 확인 → 형식 검증(isValidRoomCode) → 베팅 → openModal('matching')
 *   / 톱니 → S4 열고 닫히면 이 패널로 복귀 / 배경 클릭 닫기(타이머 정리).
 * 열림 조건: flow.modal === 'online'.
 */
import { useEffect, useRef, useState } from 'react';
import { Button, CoinButton, Modal } from '../components';
import { closeModal, isValidRoomCode, openModal, useFlow } from '../state/flow';
import { useSession } from '../state/session';
import { connectOnline, createRoom, joinQueue, joinRoom } from '../net/online';
import './online.css';

/** 베팅 창이 실행할 대기 액션 */
type BetFor = 'quick' | 'create' | 'join';

export default function OnlineModal() {
  const flow = useFlow();
  const session = useSession();
  const open = flow.modal === 'online';

  /** 코인 베팅 단계 (null = 일반 패널) */
  const [betFor, setBetFor] = useState<BetFor | null>(null);
  const [betInput, setBetInput] = useState('0');
  const [betError, setBetError] = useState<string | null>(null);
  const [betBusy, setBetBusy] = useState(false);

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
      setBetFor(null);
      setBetInput('0');
      setBetError(null);
      setBetBusy(false);
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

  /** 각 액션은 실행 전 "코인 베팅" 단계를 거친다 */
  const openBet = (target: BetFor) => {
    setBetInput('0');
    setBetError(null);
    setBetFor(target);
  };

  const onQuickStart = () => {
    clearJoinTimer();
    openBet('quick');
  };

  const onCreateCode = () => {
    setCopied(false);
    openBet('create');
  };

  /** 베팅 확정 → 대기 중이던 액션 실행 */
  const onBetConfirm = async () => {
    if (betBusy || !betFor) return;
    const bet = Number(betInput.trim() === '' ? '0' : betInput.trim());
    if (!Number.isInteger(bet) || bet < 0) {
      setBetError('0 이상의 정수를 입력해주세요');
      return;
    }
    if (bet > session.coins) {
      setBetError(`보유 코인(${session.coins})을 넘을 수 없어요`);
      return;
    }
    setBetBusy(true);
    setBetError(null);
    await connectOnline(); // 세션 확인 + 소켓
    if (betFor === 'quick') {
      const r = await joinQueue(bet); // 글로벌 FIFO 큐 (2명 모이면 서버가 자동 매칭·시작)
      setBetBusy(false);
      if (!r.ok) return setBetError(r.message ?? '큐 진입 실패');
      setBetFor(null);
      openModal('matching'); // 대기 연출 — 매칭되면 OnlineController가 게임으로 이동
    } else if (betFor === 'create') {
      const r = await createRoom(flow.roundConfig.roundCount, flow.enabledGames, bet); // 설정(라운드수·게임)+베팅
      setBetBusy(false);
      if (!r.room) return setBetError(r.message ?? '코드 생성 실패');
      setCreatedCode(r.room.code); // 상대 입장 시 서버가 자동 시작 → 자동 이동
      setBetFor(null);
    } else {
      const r = await joinRoom(joinCode.trim(), bet);
      setBetBusy(false);
      if (!r.ok) return setBetError(r.message ?? '방을 찾을 수 없어요');
      setBetFor(null);
      openModal('matching'); // 입장 성공 → 대기(자동 시작 시 이동)
    }
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
    openBet('join');
  };

  // ── 코인 베팅 단계 ──
  if (open && betFor) {
    const label =
      betFor === 'quick' ? '빠른 시작' : betFor === 'create' ? '코드 생성하기' : `코드 입장 (${joinCode.trim()})`;
    return (
      <Modal
        open={open}
        onClose={betBusy ? undefined : () => setBetFor(null)}
        marquee="코인 베팅 — PLACE YOUR BET"
        accentColor="var(--accent)"
        testId="modal-bet"
        width={440}
      >
        <div className="s6-bet">
          <h2 className="font-display s6-title">코인 베팅</h2>
          <p className="s6-bet-target font-display">{label}</p>
          <p className="s6-bet-balance font-arcade">
            보유 <span className="c-accent glow-text">{session.coins}</span> COIN
          </p>
          <p className="s6-bet-hint font-display c-muted">
            이 매치에 걸 코인을 입력하세요 (0 ~ {session.coins})
          </p>
          <label className={`neon-input${betError ? ' error anim-shake' : ''}`}>
            <span className="prompt">&gt;</span>
            <input
              data-testid="input-bet"
              value={betInput}
              inputMode="numeric"
              autoFocus
              aria-label="베팅할 코인"
              onChange={(e) => {
                setBetInput(e.target.value);
                if (betError) setBetError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onBetConfirm();
              }}
            />
          </label>
          {betError && <p className="s6-join-error c-error">{betError}</p>}
          <div className="s6-bet-actions">
            <Button variant="primary" block data-testid="btn-bet-confirm" onClick={onBetConfirm} disabled={betBusy}>
              {betBusy ? '연결 중…' : '베팅하고 시작'}
            </Button>
            <Button variant="tertiary" block onClick={() => setBetFor(null)} disabled={betBusy}>
              ← 돌아가기
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={closeModal}
      marquee="온라인 게임하기 — VS MODE"
      accentColor="var(--accent)"
      testId="modal-online"
      width={640}
    >
      <h2 className="font-display s6-title">
        온라인 게임하기
        <span className="s6-coin-badge font-arcade" title="보유 코인">
          🪙 {session.coins}
        </span>
      </h2>

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
