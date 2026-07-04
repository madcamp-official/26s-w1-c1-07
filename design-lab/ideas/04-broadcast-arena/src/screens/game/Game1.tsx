/**
 * S9 게임1 — 숫자 맞추기 (game1 에이전트 구현).
 *
 * SPEC S9: 타겟 숫자(1~100) / 양측 현재숫자 + 내 쪽 구분("this is you") /
 *          q↓ w↑ · u↓ i↑ / 일치 3초 유지 승리 / 카운트다운 / 프로필 / 패드에 화살표+실제 키.
 * PLAN §3.1: 스플릿스크린 기록 경기 — 듀오톤 필드, 타겟 플립보드, 팀 컬러 패널,
 *            HOLD 골드 프로그레스 링, 근접 발광, 유지 중 스테이지 줌 인.
 *
 * 로직은 @shared createGame1State/tick 전용 (재구현 금지).
 * 온라인 모드: P2는 봇 — 타겟으로 서서히 수렴하는 휴리스틱 (판정은 동일 코어).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  attachKeyboardAdapter,
  createGame1State,
  game1ActionFromKey,
  tick,
  DEFAULT_KEYBOARD_MAP,
} from '@shared';
import type { Game1Action, Game1State, PlayerRole } from '@shared';
import {
  exitMatch,
  getFlow,
  getPlayerDisplays,
  getRoundWins,
  nextRound,
  reportRoundEnd,
  useFlow,
} from '../../state/flow';
import { useDebugScreen, setDebugGame } from '../../debug';
import { Button, KeyCap, LiveBadge, ScoreBug, SkewTab } from '../../components';
import ResultOverlay from './ResultOverlay';
import './game1.css';

type PressedMap = Record<PlayerRole, { key1: boolean; key2: boolean }>;

const PRESSED_INIT: PressedMap = {
  P1: { key1: false, key2: false },
  P2: { key1: false, key2: false },
};

/** HOLD 골드 프로그레스 링 (일치 유지 진행 표시) */
function HoldRing({ progress, matched }: { progress: number; matched: boolean }) {
  const R = 20;
  const C = 2 * Math.PI * R;
  return (
    <span className="g1-hold" aria-hidden="true">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle className="g1-hold-track" cx="26" cy="26" r={R} fill="none" strokeWidth="4" />
        <circle
          className={`g1-hold-bar${matched ? '' : ' g1-hold-idle'}`}
          cx="26"
          cy="26"
          r={R}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
        />
      </svg>
      <span className={`g1-hold-label label${matched ? ' g1-holding' : ''}`}>
        {matched ? 'HOLD' : '—'}
      </span>
    </span>
  );
}

export default function Game1() {
  useDebugScreen('scr-game1');
  const flow = useFlow();
  const navigate = useNavigate();
  const valid = flow.gameId === 1 && flow.phase !== 'idle';
  const isOnline = flow.mode === 'online';

  // ── 게임 state (@shared) ──────────────────────────────────────
  const [game, setGame] = useState<Game1State>(() =>
    createGame1State(getFlow().roundConfig, Math.random),
  );
  const stateRef = useRef<Game1State>(game);
  const actionsRef = useRef<Game1Action[]>([]);
  const frameRef = useRef(0);
  const reportedRef = useRef(false);
  // 봇(온라인 mock) 페이싱
  const botWaitRef = useRef(0);
  const botNextRef = useRef(300);

  const [pressed, setPressed] = useState<PressedMap>(PRESSED_INIT);

  /** 새 라운드 state 생성 (다음 라운드 버튼 / 재시작 공통) */
  const startFreshRound = useCallback(() => {
    const s = createGame1State(getFlow().roundConfig, Math.random);
    stateRef.current = s;
    actionsRef.current = [];
    frameRef.current = 0;
    reportedRef.current = false;
    botWaitRef.current = 0;
    botNextRef.current = 250 + Math.random() * 300;
    setGame(s);
    setDebugGame(s);
  }, []);

  // ── 키보드 입력 (playerL q/w → P1, playerR u/i → P2) ─────────
  useEffect(() => {
    if (!valid) return;
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      setPressed((prev) => ({
        ...prev,
        [ev.player]: { ...prev[ev.player], [ev.key]: ev.phase === 'down' },
      }));
      if (ev.phase !== 'down') return;
      const f = getFlow();
      if (f.phase !== 'playing') return;
      // 온라인 모드에서 P2는 봇 소유 — 오른쪽 물리 키는 무시
      if (f.mode === 'online' && ev.player === 'P2') return;
      actionsRef.current.push(game1ActionFromKey(ev.player, ev.key));
    });
    return detach;
  }, [valid]);

  // ── 봇 휴리스틱 (온라인 mock): 타겟으로 서서히 수렴 ──────────
  const botTick = useCallback((dtMs: number) => {
    botWaitRef.current += dtMs;
    if (botWaitRef.current < botNextRef.current) return;
    botWaitRef.current = 0;
    const st = stateRef.current;
    const diff = st.target - st.players.P2.value;
    if (diff === 0) {
      // 일치 중 — 가만히 유지, 다음 판단은 느긋하게
      botNextRef.current = 400 + Math.random() * 300;
      return;
    }
    // 근접할수록 신중(간격 증가), 멀면 빠르게
    const near = Math.abs(diff) <= 3;
    botNextRef.current = near ? 320 + Math.random() * 320 : 170 + Math.random() * 200;
    const r = Math.random();
    let key: 'key1' | 'key2' | null = null;
    if (r < 0.86) key = diff > 0 ? 'key2' : 'key1'; // 올바른 방향 (key2=↑, key1=↓)
    else if (r < 0.94) key = null; // 머뭇거림
    else key = diff > 0 ? 'key1' : 'key2'; // 실수
    if (key) {
      const k = key;
      actionsRef.current.push(game1ActionFromKey('P2', k));
      // 봇 입력도 키캡 점등으로 노출 (관전 재미)
      setPressed((prev) => ({ ...prev, P2: { ...prev.P2, [k]: true } }));
      window.setTimeout(
        () => setPressed((prev) => ({ ...prev, P2: { ...prev.P2, [k]: false } })),
        90,
      );
    }
  }, []);

  // ── rAF 게임 루프 ─────────────────────────────────────────────
  useEffect(() => {
    if (!valid || flow.phase !== 'playing') return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      if (getFlow().mode === 'online') botTick(dt);
      const actions = actionsRef.current;
      actionsRef.current = [];
      const next = tick(
        stateRef.current,
        { frame: frameRef.current++, elapsedMs: stateRef.current.elapsedMs, actions },
        dt,
      );
      stateRef.current = next;
      setGame(next);
      setDebugGame(next);
      if (next.result !== null) {
        if (!reportedRef.current) {
          reportedRef.current = true;
          reportRoundEnd(next.result);
        }
        return; // phase 전이 → 루프 종료 (오버레이 표시)
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [valid, flow.phase, flow.currentRound, botTick]);

  // 언마운트 시 디버그 브리지 정리
  useEffect(() => () => setDebugGame(null), []);

  if (!valid) return <Navigate to="/select" replace />;

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const holding = game.derived.P1.matched || game.derived.P2.matched;

  const exit = () => {
    exitMatch();
    navigate('/');
  };

  const panel = (role: PlayerRole) => {
    const p = game.players[role];
    const d = game.derived[role];
    const disp = players[role];
    const team = role === 'P1' ? 'p1' : 'p2';
    const near = Math.abs(d.diff) <= 8 && !d.matched;
    return (
      <div
        className={`g1-panel g1-panel-${team}${near || d.matched ? ' g1-near' : ''}`}
        data-player={role}
      >
        {disp.isYou && (
          <span className="g1-youtag">
            <SkewTab tone={team}>THIS IS YOU</SkewTab>
          </span>
        )}
        <div className="g1-panel-head">
          <span className="label" style={{ color: `var(--${team})` }}>
            {role} · {disp.name}
          </span>
          {d.matched && (
            <span className="label" style={{ color: 'var(--gold)', fontSize: 10 }}>
              MATCHED
            </span>
          )}
        </div>
        <div className="g1-panel-body">
          <span>
            <span key={p.value} className="g1-value tnum flip-roll" style={{ display: 'block' }}>
              {p.value}
            </span>
            <span className="g1-diff tnum" style={{ display: 'block' }}>
              {d.matched
                ? `유지 ${(d.holdRemainingMs / 1000).toFixed(1)}s 남음`
                : `타겟까지 ${d.diff > 0 ? '-' : '+'}${Math.abs(d.diff)}`}
            </span>
          </span>
          <HoldRing progress={d.holdProgress} matched={d.matched} />
        </div>
      </div>
    );
  };

  return (
    <div data-testid="scr-game1" className="g1-root">
      {/* 상단: LIVE — 스코어 버그(프로필/카운트다운) — 나가기 */}
      <div className="g1-topbar">
        <div>
          <LiveBadge />
        </div>
        <ScoreBug
          players={players}
          roundWins={wins}
          currentRound={flow.currentRound}
          roundCount={flow.roundConfig.roundCount}
          timeRemainingMs={game.derived.timeRemainingMs}
        />
        <div className="g1-topbar-right">
          <Button testId="btn-exit" variant="secondary" onClick={exit}>
            나가기
          </Button>
        </div>
      </div>

      {/* 스테이지: 듀오톤 이분할 + 타겟 플립보드 + 현재숫자 패널 */}
      <div data-testid="game-stage" className={`g1-stage${holding ? ' g1-zoom' : ''}`}>
        <div className="g1-half g1-half-p1" />
        <div className="g1-half g1-half-p2" />
        <div className="g1-divider" />
        <div className="g1-target">
          <SkewTab>TARGET</SkewTab>
          <div className="g1-target-board">
            <span key={game.target} className="g1-target-num tnum flip-roll" style={{ display: 'block' }}>
              {game.target}
            </span>
          </div>
          <span className="label" style={{ color: 'var(--ink-sub)', fontSize: 10 }}>
            일치 3초 유지 시 승리
          </span>
        </div>
        {panel('P1')}
        {panel('P2')}
      </div>

      {/* 하단 조작키 안내 — 화살표 + 실제 배정 키 (q/w · u/i) */}
      <div className="g1-pads">
        <div className="g1-pad-group">
          <span className="label" style={{ color: 'var(--p1)' }}>
            P1 · {players.P1.name}
          </span>
          <div className="g1-pad-keys">
            <KeyCap keyLabel="q" hint="↓ 내리기" team="p1" active={pressed.P1.key1} />
            <KeyCap keyLabel="w" hint="↑ 올리기" team="p1" active={pressed.P1.key2} />
          </div>
        </div>
        <div className="g1-pad-group g1-pad-right">
          <span className="label" style={{ color: 'var(--p2)' }}>
            P2 · {players.P2.name}
            {isOnline ? ' (BOT)' : ''}
          </span>
          <div className="g1-pad-keys">
            <KeyCap keyLabel="u" hint="↓ 내리기" team="p2" active={pressed.P2.key1} />
            <KeyCap keyLabel="i" hint="↑ 올리기" team="p2" active={pressed.P2.key2} />
          </div>
        </div>
      </div>

      {flow.phase !== 'playing' && (
        <ResultOverlay
          flow={flow}
          players={players}
          onNextRound={() => {
            nextRound();
            startFreshRound();
          }}
          onBackMain={exit}
        />
      )}
    </div>
  );
}
