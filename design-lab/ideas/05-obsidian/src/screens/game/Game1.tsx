/**
 * S9 게임1 — 숫자 맞추기 "주파수 동조" (scr-game1). 소유: game1 에이전트.
 * SPEC S9 + PLAN §2.S9/§3.1 참조.
 *
 * 로직: @shared의 createGame1State / tick / game1ActionFromKey — 재구현 금지.
 * 입력: attachKeyboardAdapter (playerL q/w → P1, playerR u/i → P2).
 * 온라인(mock) 모드: P2는 봇 — 타겟으로 서서히 수렴하는 휴리스틱으로
 *                   같은 액션 파이프에 입력을 주입한다.
 *
 * testid: hud-countdown, hud-profile-p1/p2, game-stage, btn-exit
 *         (result-overlay/result-text/btn-next-round/btn-back-main은 ResultOverlay)
 * 브리지: 매 틱 reportGame(state), 언마운트 시 reportGame(null).
 * 라운드 루프: mount → ensureMatch(1) → 3·2·1 카운트다운 → createGame1State
 *   → rAF tick → result 확정 → reportRoundResult → ResultOverlay
 *   → 다음 라운드(beginNextRound) 또는 메인 복귀(resetFlow).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  attachKeyboardAdapter,
  createGame1State,
  game1ActionFromKey,
  tick,
  DEFAULT_KEYBOARD_MAP,
  GAME1_MAX_VALUE,
  GAME1_MIN_VALUE,
  type Game1Action,
  type Game1State,
  type PlayerRole,
} from '@shared';
import { Button, KeyCap, PlayerBadge } from '../../components';
import { reportGame, useScreenBridge } from '../../debug';
import {
  beginNextRound,
  ensureMatch,
  getScore,
  isBotMatch,
  reportRoundResult,
  resetFlow,
  useFlow,
} from '../../state/flow';
import { useSession } from '../../state/session';
import { ResultOverlay } from './ResultOverlay';
import './game1.css';

type Phase = 'countdown' | 'playing' | 'over';
/** 온스크린 키캡 점등 상태 키 (플레이어 x 키 슬롯) */
type PadKey = 'P1key1' | 'P1key2' | 'P2key1' | 'P2key2';

const VALUE_SPAN = GAME1_MAX_VALUE - GAME1_MIN_VALUE; // 근접도 게이지 정규화용 (99)

export default function Game1() {
  useScreenBridge('scr-game1');
  const navigate = useNavigate();
  const flow = useFlow();
  const session = useSession();

  const [phase, setPhase] = useState<Phase>('countdown');
  const [count, setCount] = useState(3);
  const [gs, setGs] = useState<Game1State | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [roundWinner, setRoundWinner] = useState<PlayerRole | null>(null);
  const [pressed, setPressed] = useState<Record<PadKey, boolean>>({
    P1key1: false,
    P1key2: false,
    P2key1: false,
    P2key2: false,
  });

  const stateRef = useRef<Game1State | null>(null);
  const pendingRef = useRef<Game1Action[]>([]);
  const phaseRef = useRef<Phase>('countdown');
  phaseRef.current = phase;
  // 봇 휴리스틱 페이싱 (타겟으로 서서히 수렴 — 초당 ~5회, 간헐적 딜레이)
  const botAccRef = useRef(0);
  const botIntervalRef = useRef(180);
  const botTimersRef = useRef<number[]>([]);

  // ---------------------------------------------------------------------
  // 마운트 가드 + 언마운트 정리
  // ---------------------------------------------------------------------
  useEffect(() => {
    ensureMatch(1);
    const timers = botTimersRef.current;
    return () => {
      reportGame(null);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  // ---------------------------------------------------------------------
  // 키보드 입력 (q/w vs u/i) — 봇 매치에서는 P2 물리 입력 무시
  // ---------------------------------------------------------------------
  useEffect(() => {
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      if (ev.player === 'P2' && isBotMatch()) return;
      const padKey = `${ev.player}${ev.key}` as PadKey;
      const down = ev.phase === 'down';
      setPressed((p) => (p[padKey] === down ? p : { ...p, [padKey]: down }));
      if (down && phaseRef.current === 'playing') {
        pendingRef.current.push(game1ActionFromKey(ev.player, ev.key));
      }
    });
    return detach;
  }, []);

  // ---------------------------------------------------------------------
  // ESC / btn-exit → 매치 이탈
  // ---------------------------------------------------------------------
  const exitToMain = useCallback(() => {
    resetFlow();
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitToMain();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exitToMain]);

  // ---------------------------------------------------------------------
  // 시작 카운트다운 3·2·1 → 라운드 state 생성
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count <= 0) {
      const st = createGame1State(flow.settings, Math.random);
      stateRef.current = st;
      pendingRef.current = [];
      botAccRef.current = 0;
      setGs(st);
      reportGame(st);
      setPhase('playing');
      return;
    }
    const t = window.setTimeout(() => setCount((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [phase, count, flow.settings]);

  // 봇 키캡 점등 연출 (실입력처럼 짧게 플래시)
  const flashBotKey = (padKey: PadKey) => {
    setPressed((p) => ({ ...p, [padKey]: true }));
    const id = window.setTimeout(() => {
      setPressed((p) => ({ ...p, [padKey]: false }));
    }, 110);
    botTimersRef.current.push(id);
  };

  // ---------------------------------------------------------------------
  // rAF 게임 루프 — @shared tick + 봇 입력 주입 + 브리지 갱신
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    let last = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const dt = Math.min(100, now - last); // 탭 비활성 복귀 시 폭주 방지
      last = now;
      const prev = stateRef.current;
      if (!prev) return;

      // 봇(온라인 mock 상대): 타겟으로 서서히 수렴, 일치하면 유지(입력 없음)
      if (isBotMatch()) {
        botAccRef.current += dt;
        if (botAccRef.current >= botIntervalRef.current) {
          botAccRef.current = 0;
          botIntervalRef.current = 120 + Math.random() * 180;
          const diff = prev.target - prev.players.P2.value;
          if (diff !== 0 && Math.random() < 0.92) {
            const key = diff > 0 ? 'key2' : 'key1'; // key2=올리기, key1=내리기
            pendingRef.current.push(game1ActionFromKey('P2', key));
            flashBotKey(`P2${key}` as PadKey);
          }
        }
      }

      const actions = pendingRef.current;
      pendingRef.current = [];
      const next = tick(prev, { frame: frame++, elapsedMs: prev.elapsedMs + dt, actions }, dt);
      stateRef.current = next;
      setGs(next);
      reportGame(next);

      if (next.result !== null) {
        const winner: PlayerRole | null =
          next.result === 'P1_WIN' ? 'P1' : next.result === 'P2_WIN' ? 'P2' : null;
        reportRoundResult(winner);
        setRoundWinner(winner);
        setPhase('over');
        setOverlayOpen(true);
        return; // 루프 종료
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---------------------------------------------------------------------
  // ResultOverlay 핸들러
  // ---------------------------------------------------------------------
  const handleNextRound = () => {
    setOverlayOpen(false);
    setRoundWinner(null);
    beginNextRound();
    stateRef.current = null;
    setGs(null);
    reportGame(null);
    setCount(3);
    setPhase('countdown');
  };

  // ---------------------------------------------------------------------
  // 표기값
  // ---------------------------------------------------------------------
  const online = flow.mode === 'online';
  const p1Name = online ? (session.user?.nickname ?? 'PLAYER 1') : 'PLAYER 1';
  const p2Name = online ? (flow.opponent?.nickname ?? 'BOT') : 'PLAYER 2';
  const score = getScore(flow.roundResults);
  const settings = flow.settings;
  const secLeft = gs ? Math.ceil(gs.derived.timeRemainingMs / 1000) : settings.timePerRoundSec;
  const danger = phase === 'playing' && gs !== null && gs.derived.timeRemainingMs <= 5000;
  const keys = DEFAULT_KEYBOARD_MAP;

  // 좌우 현재숫자 콘솔 (P1=시안 / P2=마젠타 — 절대 불변)
  const renderConsole = (role: PlayerRole) => {
    const side = role === 'P1' ? 'p1' : 'p2';
    const color = role === 'P1' ? 'var(--p1)' : 'var(--p2)';
    const ps = gs ? gs.players[role] : null;
    const dv = gs ? gs.derived[role] : null;
    const matched = dv?.matched ?? false;
    const holdProgress = dv?.holdProgress ?? 0;
    const gauge = dv ? Math.max(0, 1 - Math.abs(dv.diff) / VALUE_SPAN) : 0;
    const isYou = online && role === 'P1'; // 온라인 = 나(P1) vs 봇 상대. "this is you"
    const gaugeEl = (
      <div className="g1-gauge" aria-hidden="true">
        <div
          className={`g1-gauge-fill${matched ? ' g1-gauge-fill--spark' : ''}`}
          style={{ height: `${Math.round(gauge * 100)}%`, background: color }}
        />
      </div>
    );
    return (
      <section
        className={`g1-console g1-console--${side}${matched ? ' g1-console--matched' : ''}`}
      >
        <div className="g1-console-head">
          <span className="overline" style={{ color }}>
            {role} // CURRENT
          </span>
          {isYou && <span className={`chip chip--${side}`}>THIS IS YOU</span>}
        </div>
        <div className="g1-console-body">
          {role === 'P1' && gaugeEl}
          <div className="g1-numwrap">
            {holdProgress > 0 && (
              <div
                className="g1-ring"
                style={{
                  background: `conic-gradient(${color} ${holdProgress * 360}deg, rgba(255, 255, 255, 0.05) 0deg)`,
                }}
              />
            )}
            <span
              key={ps ? ps.value : 'idle'}
              className="display-noskew num g1-value"
              style={{ color }}
            >
              {ps ? ps.value : '--'}
            </span>
          </div>
          {role === 'P2' && gaugeEl}
        </div>
        <div className="overline g1-holdlabel" style={{ opacity: matched ? 1 : 0, color }}>
          HOLD {((dv ? dv.holdRemainingMs : 3000) / 1000).toFixed(1)}S
        </div>
      </section>
    );
  };

  return (
    <div className="screen" data-testid="scr-game1">
      {/* 상단 HUD — 프로필 / ROUND·카운트다운 / 프로필 */}
      <header className="g1-hud">
        <PlayerBadge
          side="p1"
          name={p1Name}
          you={online}
          wins={score.p1Wins}
          totalRounds={settings.roundCount}
          testId="hud-profile-p1"
        />
        <div className="g1-hud-center">
          <span className="overline">
            ROUND {flow.roundIndex + 1} / {settings.roundCount}
          </span>
          <span
            data-testid="hud-countdown"
            className={`num display-noskew g1-countdown${danger ? ' g1-countdown--danger' : ''}`}
          >
            {secLeft}
          </span>
        </div>
        <PlayerBadge
          side="p2"
          name={p2Name}
          wins={score.p2Wins}
          totalRounds={settings.roundCount}
          testId="hud-profile-p2"
        />
      </header>

      {/* HUD 아래 우측 — 나가기 */}
      <div className="g1-exitrow">
        <Button variant="ghost" testId="btn-exit" onClick={exitToMain}>
          [ESC] 나가기
        </Button>
      </div>

      {/* 스테이지 */}
      <main
        className={`g1-stage brackets${danger ? ' heartbeat' : ''}`}
        data-testid="game-stage"
      >
        <div className="g1-sideline g1-sideline--p1" />
        <div className="g1-sideline g1-sideline--p2" />
        {/* 3초 유지 중 진영색 워시 (§3.1) */}
        <div
          className="g1-wash g1-wash--p1"
          style={{ opacity: gs ? gs.derived.P1.holdProgress : 0 }}
        />
        <div
          className="g1-wash g1-wash--p2"
          style={{ opacity: gs ? gs.derived.P2.holdProgress : 0 }}
        />

        <div className="g1-arena">
          {renderConsole('P1')}
          <section className="g1-target">
            <span className="overline">TARGET FREQUENCY</span>
            <span className="display num g1-target-num">{gs ? gs.target : '--'}</span>
            <span className="g1-target-hint">타겟 숫자에 맞추고 3초를 유지하세요</span>
          </section>
          {renderConsole('P2')}
        </div>

        {/* 하단 조작키 안내 — 화살표 + 실제 배정 키 (SPEC Q2) */}
        <div className="g1-pads">
          <div className="g1-pad">
            <KeyCap
              label={keys.playerL.key1.toUpperCase()}
              desc="↓ 내리기"
              side="p1"
              active={pressed.P1key1}
            />
            <KeyCap
              label={keys.playerL.key2.toUpperCase()}
              desc="↑ 올리기"
              side="p1"
              active={pressed.P1key2}
            />
          </div>
          <div className="g1-pad">
            <KeyCap
              label={keys.playerR.key1.toUpperCase()}
              desc="↓ 내리기"
              side="p2"
              active={pressed.P2key1}
            />
            <KeyCap
              label={keys.playerR.key2.toUpperCase()}
              desc="↑ 올리기"
              side="p2"
              active={pressed.P2key2}
            />
          </div>
        </div>

        {/* 시작 카운트다운 3·2·1 */}
        {phase === 'countdown' && (
          <div className="g1-count-overlay">
            <span className="overline">SYNCHRONIZING</span>
            <span key={count} className="display num g1-count-num count-pop">
              {count > 0 ? count : 'GO'}
            </span>
          </div>
        )}

        <ResultOverlay
          open={overlayOpen}
          roundWinner={roundWinner}
          matchResult={flow.matchResult}
          roundNumber={flow.roundIndex + 1}
          p1Name={p1Name}
          p2Name={p2Name}
          onNextRound={handleNextRound}
          onBackMain={exitToMain}
        />
      </main>
    </div>
  );
}
