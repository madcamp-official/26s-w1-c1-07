/**
 * S6 온라인 게임하기 패널 (lobby 에이전트 소유).
 * 본체 testid: modal-online / 부품: btn-quickstart, btn-code-create, room-code-display,
 *   input-code, btn-code-join, input-bet, btn-bet-place (+ 복사, 톱니→S4 재사용)
 * PLAN §2-S6: "온라인 게임하기 — VS MODE" 마퀴 + [빠른 시작](옐로 히어로, INSERT COIN ▶ 점멸)
 *   + surface-deep 서브 섹션 "게임 만들기 / 참가하기" — 1행 코드 생성(생성 전 점멸 슬롯 →
 *   생성 후 옐로 대형 코드 + 복사 COPIED! + 톱니) / OR 칩 / 2행 코드 입력 + 확인.
 * SPEC QA-S6-01~09 + 코인 베팅(분리 창 방식):
 *   하나의 오버레이 안에 "온라인 게임하기"(modal-online)와 "코인 베팅"(modal-bet)
 *   두 창이 나란히 뜬다. 베팅 창에서 1 ~ 보유코인 정수 입력 후 [베팅]으로 확정 —
 *   확정 전에 빠른 시작/코드 생성/코드 입력을 누르면 "코인 베팅을 먼저 해주세요".
 *   확정된 베팅액이 각 액션의 bet 페이로드로 전달된다(서버가 보유량 재검증).
 *   톱니 → S4 열고 닫히면 이 패널로 복귀 / 배경 클릭·ESC 닫기(타이머 정리).
 * 열림 조건: flow.modal === 'online'.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Button, CoinButton } from '../components';
import { closeModal, isValidRoomCode, openModal, useFlow } from '../state/flow';
import { useSession } from '../state/session';
import { connectOnline, createRoom, joinQueue, joinRoom } from '../net/online';
import './online.css';

/** 오버레이 안의 네온 창 1장 — components/Modal의 본체 마크업(modal.css 전역 클래스) 재사용 */
function NeonWindow({
  marquee,
  accent,
  testId,
  width,
  className = '',
  children,
}: {
  marquee: ReactNode;
  accent: string;
  testId: string;
  width: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`nc-modal corner-brackets anim-sign-on ${className}`}
      style={{ '--modal-accent': accent, '--bracket-color': accent, maxWidth: width } as CSSProperties}
      data-testid={testId}
      role="dialog"
      aria-modal="true"
    >
      <i className="cb2" aria-hidden />
      <div className="marquee-strip" style={{ color: accent }}>
        <span className="lamp lit" style={{ '--lamp-color': accent } as CSSProperties} />
        <span className="marquee-title glow-text">{marquee}</span>
        <span className="lamp lit" style={{ '--lamp-color': accent } as CSSProperties} />
      </div>
      <div className="nc-modal__body">{children}</div>
    </div>
  );
}

export default function OnlineModal() {
  const flow = useFlow();
  const session = useSession();
  const open = flow.modal === 'online';

  /** 코인 베팅 (사이드 패널) — placedBet 확정 전에는 어떤 액션도 실행 불가 */
  const [betInput, setBetInput] = useState('1');
  const [placedBet, setPlacedBet] = useState<number | null>(null);
  const [betError, setBetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setBetInput('1');
      setPlacedBet(null);
      setBetError(null);
      setBusy(false);
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

  /** [베팅] — 1 ~ 보유코인 정수만 확정 */
  const onPlaceBet = () => {
    const bet = Number(betInput.trim());
    if (!Number.isInteger(bet) || bet < 1) {
      setPlacedBet(null);
      setBetError('반드시 1코인 이상 베팅해야 해요');
      return;
    }
    if (bet > session.coins) {
      setPlacedBet(null);
      setBetError('보유 코인을 넘을 수 없어요');
      return;
    }
    setBetError(null);
    setPlacedBet(bet);
  };

  /**
   * 액션 공통 가드 — 베팅 미확정이면 안내 메시지, 확정액이 잔액을 넘으면 재베팅 요구.
   * @returns 유효한 베팅액 또는 null(액션 중단)
   */
  const requireBet = (): number | null => {
    if (placedBet === null) {
      setBetError('코인 베팅을 먼저 해주세요');
      return null;
    }
    if (placedBet > session.coins) {
      setPlacedBet(null);
      setBetError('보유 코인이 바뀌었어요 — 다시 베팅해주세요');
      return null;
    }
    return placedBet;
  };

  const onQuickStart = async () => {
    if (busy) return;
    const bet = requireBet();
    if (bet === null) return;
    clearJoinTimer();
    setBusy(true);
    await connectOnline(); // 세션 확인 + 소켓
    const r = await joinQueue(bet); // 글로벌 FIFO 큐 (2명 모이면 서버가 자동 매칭·시작)
    setBusy(false);
    if (!r.ok) return setBetError(r.message ?? '큐 진입 실패');
    openModal('matching'); // 대기 연출 — 매칭되면 OnlineController가 게임으로 이동
  };

  const onCreateCode = async () => {
    if (busy) return;
    const bet = requireBet();
    if (bet === null) return;
    setCopied(false);
    setBusy(true);
    await connectOnline();
    const r = await createRoom(flow.roundConfig.roundCount, flow.enabledGames, bet); // 설정(라운드수·게임)+베팅
    setBusy(false);
    if (!r.room) return setBetError(r.message ?? '코드 생성 실패');
    setCreatedCode(r.room.code); // 상대 입장 시 서버가 자동 시작 → 자동 이동
  };

  const onJoin = async () => {
    if (busy) return;
    if (!isValidRoomCode(joinCode)) {
      setJoinError('숫자 코드를 입력해 주세요');
      return;
    }
    setJoinError(null);
    const bet = requireBet();
    if (bet === null) return;
    clearJoinTimer();
    setBusy(true);
    await connectOnline();
    const r = await joinRoom(joinCode.trim(), bet);
    setBusy(false);
    if (!r.ok) return setJoinError(r.message ?? '방을 찾을 수 없어요');
    openModal('matching'); // 입장 성공 → 대기(자동 시작 시 이동)
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

  // ESC로 닫기 (Modal 컴포넌트 대신 커스텀 오버레이라 직접 처리)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="nc-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div
        className="s6-windows"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        {/* ── 창 1: 온라인 게임하기 (제목은 마퀴가 대신 — 본문 중복 제목 없음) ── */}
        <NeonWindow marquee="온라인 게임하기" accent="var(--accent)" testId="modal-online" width={620}>
          {/* 히어로 CTA — 빠른 시작 */}
          <div className="s6-hero">
            <p className="font-arcade c-accent anim-blink s6-insert" aria-hidden>
              INSERT COIN ▶
            </p>
            <Button variant="primary" coin block data-testid="btn-quickstart" onClick={onQuickStart} disabled={busy}>
              빠른 시작
            </Button>
          </div>

          {/* 서브 섹션: 게임 만들기 / 참가하기 */}
          <section className="s6-sub">
            <h3 className="font-display s6-sub-title">게임 만들기 / 참가하기</h3>

            {/* 1행: 코드 생성 */}
            <div className="s6-row">
              <Button variant="secondary" data-testid="btn-code-create" onClick={onCreateCode} disabled={busy}>
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
              <Button variant="primary" data-testid="btn-code-join" onClick={onJoin} disabled={busy}>
                확인
              </Button>
            </div>
          </section>
        </NeonWindow>

        {/* ── 창 2: 코인 베팅 (모든 액션의 선행 조건) ── */}
        <NeonWindow
          marquee="코인 베팅"
          accent="var(--accent)"
          testId="modal-bet"
          width={250}
          className={betError ? 'anim-shake' : ''}
        >
          <div className="s6-bet-win" data-testid="bet-panel">
            <p className="s6-bet-balance font-arcade">
              보유 <span className="c-accent glow-text">{session.coins}</span> COIN
            </p>
            <label className={`neon-input s6-bet-input${betError ? ' error' : ''}`}>
              <span className="prompt">&gt;</span>
              <input
                data-testid="input-bet"
                value={betInput}
                inputMode="numeric"
                aria-label="베팅할 코인"
                onChange={(e) => {
                  // 숫자 외 키는 입력 자체가 안 되도록 필터
                  setBetInput(e.target.value.replace(/[^\d]/g, ''));
                  if (betError) setBetError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onPlaceBet();
                }}
              />
            </label>
            <Button variant="primary" block data-testid="btn-bet-place" onClick={onPlaceBet} disabled={busy}>
              BETTING
            </Button>
            {placedBet !== null && (
              <p className="s6-bet-placed font-arcade" data-testid="bet-placed" role="status">
                {placedBet} COINS
              </p>
            )}
            {betError && (
              <p className="s6-join-error c-error" role="alert">
                {betError}
              </p>
            )}
            {session.coins < 1 && (
              <p className="s6-bet-broke font-display c-muted">
                코인이 없어요 — 오프라인의 "코인 노가다"로 벌 수 있어요
              </p>
            )}
          </div>
        </NeonWindow>
      </div>
    </div>
  );
}
