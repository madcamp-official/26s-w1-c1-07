/**
 * S9. 게임1 인게임 — 숫자 맞추기 (scr-game1)
 * [소유: game1 에이전트]
 *
 * SPEC S9 + PLAN §2 S9 / §3.1 아트 디렉션 (오렌지/옐로 테마):
 * - 로직: @shared createGame1State / tick / game1ActionFromKey (재구현 금지)
 * - 키: attachKeyboardAdapter — playerL q(↓)/w(↑) = P1, playerR u(↓)/i(↑) = P2
 * - 온라인 mock: P2 = 봇 (타겟으로 서서히 수렴하는 휴리스틱, P2 키보드 무시)
 * - HUD: hud-countdown / hud-profile-p1 / hud-profile-p2 / game-stage / btn-exit
 * - 라운드 종료 → recordRoundResult → ResultOverlay(같은 폴더, 전 게임 공용)
 * - 틱마다 setDebugGame(state), 언마운트 시 setDebugGame(null)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  attachKeyboardAdapter,
  createGame1State,
  DEFAULT_KEYBOARD_MAP,
  game1ActionFromKey,
  GAME1_MAX_VALUE,
  tick,
} from '@shared';
import type { Game1Action, Game1State, MatchResult, PlayerRole } from '@shared';
import {
  getFlow,
  recordRoundResult,
  resetFlow,
  startMatch,
  useFlow,
} from '../../state/flow';
import { setDebugGame, useDebugScreen } from '../../debug';
import { Keycap, PlayerBadge } from '../../components';
import ResultOverlay from './ResultOverlay';
import './Game1.css';

// ---------------------------------------------------------------------------
// 라운드 진행 페이즈
// ---------------------------------------------------------------------------

type Phase = 'intro' | 'play' | 'result';

interface RoundOutcome {
  winner: PlayerRole | null;
  matchOver: boolean;
  matchResult: MatchResult | null;
}

/** 라운드 시작 연출: ROUND N → 3 → 2 → 1 → GO! (steps 감성, 총 ~2.2초) */
const INTRO_DURATION_MS = [700, 450, 450, 350, 300];

/** 카운트다운 바 블록 수 */
const TIME_BLOCKS = 16;
/** 일치 유지 하트 수 (3초 = 하트 3칸, PLAN §3.1) */
const HOLD_HEARTS = 3;

/** 눌림 상태 키 (온스크린 키캡 1:1 동기화용) */
type HeldKeys = Record<'P1key1' | 'P1key2' | 'P2key1' | 'P2key2', boolean>;
const NO_KEYS: HeldKeys = { P1key1: false, P1key2: false, P2key1: false, P2key2: false };

function newGameState(): Game1State {
  return createGame1State(getFlow().roundConfig, Math.random);
}

export default function Game1() {
  useDebugScreen('scr-game1');
  const navigate = useNavigate();
  const flow = useFlow();

  // 직접 URL 진입(딥링크) 시에도 매치 컨텍스트가 있도록 오프라인 매치로 시작
  useEffect(() => {
    if (getFlow().currentRound === 0 || getFlow().gameId !== 1) {
      startMatch('offline', 1);
    }
  }, []);

  const [game, setGame] = useState<Game1State>(newGameState);
  const [phase, setPhase] = useState<Phase>('intro');
  const [introStep, setIntroStep] = useState(0);
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [held, setHeld] = useState<HeldKeys>(NO_KEYS);

  const gameRef = useRef(game);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const frameRef = useRef(0);
  const pendingRef = useRef<Game1Action[]>([]);
  const botRef = useRef({ nextAt: 0 });

  // ---- 디버그 브리지: 마운트 시 초기 state, 언마운트 시 정리 ----
  useEffect(() => {
    setDebugGame(gameRef.current);
    return () => setDebugGame(null);
  }, []);

  // ---- 키보드 (전 게임 공통 어댑터) ----
  useEffect(() => {
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      // 온라인 mock: P2는 봇 — 오른쪽 키보드 입력 무시
      if (getFlow().mode === 'online' && ev.player === 'P2') return;
      const heldKey = `${ev.player}${ev.key}` as keyof HeldKeys;
      setHeld((prev) =>
        prev[heldKey] === (ev.phase === 'down')
          ? prev
          : { ...prev, [heldKey]: ev.phase === 'down' },
      );
      if (ev.phase === 'down' && phaseRef.current === 'play') {
        pendingRef.current.push(game1ActionFromKey(ev.player, ev.key));
      }
    });
    return detach;
  }, []);

  // ---- 라운드 인트로 시퀀스 (ROUND N → 3·2·1·GO!) ----
  useEffect(() => {
    if (phase !== 'intro') return;
    if (introStep >= INTRO_DURATION_MS.length) {
      setPhase('play');
      return;
    }
    const t = window.setTimeout(
      () => setIntroStep((s) => s + 1),
      INTRO_DURATION_MS[introStep],
    );
    return () => window.clearTimeout(t);
  }, [phase, introStep]);

  // ---- 봇 휴리스틱 (온라인 mock 전용): 타겟으로 서서히 수렴 ----
  const botAct = useCallback((now: number) => {
    if (getFlow().mode !== 'online') return;
    const bot = botRef.current;
    if (now < bot.nextAt) return;
    const st = gameRef.current;
    const diff = st.target - st.players.P2.value;
    if (diff !== 0) {
      let dir: 1 | -1 = diff > 0 ? 1 : -1;
      // 멀리 있을 땐 가끔 헛손질(사람 같은 흔들림) — 가까워지면 정확
      if (Math.abs(diff) > 3 && Math.random() < 0.1) dir = dir === 1 ? -1 : 1;
      pendingRef.current.push({
        gameId: 1,
        player: 'P2',
        type: dir === 1 ? 'INCREMENT' : 'DECREMENT',
      });
      bot.nextAt = now + 140 + Math.random() * 260; // 초당 2.5~7회 → 서서히 수렴
    } else {
      bot.nextAt = now + 250; // 일치 중엔 가만히 유지(홀드)
    }
  }, []);

  // ---- 게임 루프 — 판정은 전부 @shared tick ----
  // rAF 대신 setInterval 구동: 페이지가 hidden(백그라운드 탭)이어도
  // 게임 시간이 벽시계와 함께 진행된다 (백그라운드 1초 스로틀은 dt로 흡수).
  useEffect(() => {
    if (phase !== 'play') return;
    let last = performance.now();
    let done = false;
    const step = () => {
      if (done) return;
      const now = performance.now();
      const dtMs = Math.min(1200, Math.max(0, now - last));
      last = now;
      botAct(now);
      const actions = pendingRef.current;
      pendingRef.current = [];
      const prev = gameRef.current;
      const next = tick(
        prev,
        { frame: frameRef.current, elapsedMs: prev.elapsedMs, actions },
        dtMs,
      );
      frameRef.current += 1;
      gameRef.current = next;
      setGame(next);
      setDebugGame(next);
      if (next.result !== null) {
        done = true;
        const winner: PlayerRole | null =
          next.result === 'DRAW' ? null : next.result === 'P1_WIN' ? 'P1' : 'P2';
        const r = recordRoundResult(winner);
        setOutcome({ winner, matchOver: r.matchOver, matchResult: r.matchResult });
        setPhase('result');
      }
    };
    const id = window.setInterval(step, 33);
    return () => window.clearInterval(id);
  }, [phase, botAct]);

  // ---- 다음 라운드 (ResultOverlay가 advanceRound() 호출 후 콜백) ----
  const handleNextRound = useCallback(() => {
    const st = newGameState();
    gameRef.current = st;
    frameRef.current = 0;
    pendingRef.current = [];
    botRef.current.nextAt = 0;
    setGame(st);
    setOutcome(null);
    setIntroStep(0);
    setPhase('intro');
  }, []);

  const handleExit = useCallback(() => {
    resetFlow();
    navigate('/');
  }, [navigate]);

  // ---- 파생 표시값 ----
  const d = game.derived;
  const online = flow.mode === 'online';
  const secondsLeft = Math.ceil(d.timeRemainingMs / 1000);
  const timeFrac = game.timeLimitMs > 0 ? d.timeRemainingMs / game.timeLimitMs : 0;
  const blocksOn = Math.ceil(timeFrac * TIME_BLOCKS);
  const danger = secondsLeft <= 3;

  const introLabel =
    introStep === 0
      ? `ROUND ${Math.max(1, flow.currentRound)}`
      : introStep >= INTRO_DURATION_MS.length - 1
        ? 'GO!'
        : String(INTRO_DURATION_MS.length - 1 - introStep);

  const sideFor = (role: PlayerRole) => {
    const p = game.players[role];
    const pd = d[role];
    const heartsFilled = Math.min(HOLD_HEARTS, Math.floor(p.holdMs / 1000));
    return { p, pd, heartsFilled };
  };

  return (
    <div data-testid="scr-game1" className="g1-root px-snap-in">
      {/* ---------- HUD: 프로필 / 카운트다운 / 나가기 ---------- */}
      <div className="g1-hud">
        <div className="g1-hud-side">
          <PlayerBadge
            role="P1"
            nickname={flow.playerNames.P1}
            isYou={online}
            data-testid="hud-profile-p1"
          />
        </div>

        <div className="g1-countdown-wrap">
          <div
            data-testid="hud-countdown"
            className={`g1-countdown${danger ? ' is-danger' : ''}`}
          >
            <span className={`px-font g1-count-num${danger ? ' px-pulse' : ''}`}>
              {secondsLeft}
            </span>
            <div className="g1-timebar" aria-hidden="true">
              {Array.from({ length: TIME_BLOCKS }, (_, i) => (
                <span key={i} className={i < blocksOn ? 'on' : 'off'} />
              ))}
            </div>
          </div>
          <span className="px-font g1-round-label">
            ROUND {Math.max(1, flow.currentRound)}/{flow.roundConfig.roundCount}
          </span>
        </div>

        <div className="g1-hud-side g1-hud-right">
          <PlayerBadge
            role="P2"
            nickname={flow.playerNames.P2}
            data-testid="hud-profile-p2"
          />
          <Keycap
            keyLabel="ESC"
            icon={<span className="g1-kr-icon">나가기</span>}
            size={48}
            data-testid="btn-exit"
            onClick={handleExit}
            aria-label="게임 나가기"
          />
        </div>
      </div>

      {/* ---------- 콘솔 스크린 (game-stage) ---------- */}
      <div className="g1-stage-frame">
        <div data-testid="game-stage" className="g1-stage">
          <div className="g1-horizon" aria-hidden="true" />

          {/* 타겟 전광판 */}
          <div className="g1-target">
            <span className="px-font g1-target-label">TARGET</span>
            <span className="px-font g1-target-num">{game.target}</span>
          </div>

          {/* 좌우 플레이어 사이드 (게이지 탑 + 현재숫자 + 유지 하트) */}
          {(['P1', 'P2'] as const).map((role) => {
            const { p, pd, heartsFilled } = sideFor(role);
            const isMe = online ? role === 'P1' : false;
            return (
              <div key={role} className={`g1-side g1-side--${role.toLowerCase()}`}>
                {isMe ? (
                  <span className="px-font g1-you-tag px-blink">▶THIS IS YOU</span>
                ) : null}
                <div className="g1-gauge" aria-hidden="true">
                  <div
                    className="g1-gauge-fill"
                    style={{ height: `${(p.value / GAME1_MAX_VALUE) * 100}%` }}
                  />
                  <div
                    className="g1-gauge-marker"
                    style={{ bottom: `${(game.target / GAME1_MAX_VALUE) * 100}%` }}
                  />
                  <div className="g1-gauge-grid" />
                </div>
                <div className={`g1-value-panel${pd.matched ? ' is-matched' : ''}`}>
                  <span className="px-font g1-value-role">{role}</span>
                  <span className="px-font g1-value-num">{p.value}</span>
                  <span className="g1-hearts" aria-hidden="true">
                    {Array.from({ length: HOLD_HEARTS }, (_, i) => (
                      <span
                        key={i}
                        className={`g1-heart${i < heartsFilled ? ' on' : ''}${
                          pd.matched && i === heartsFilled ? ' px-blink' : ''
                        }`}
                      >
                        ♥
                      </span>
                    ))}
                  </span>
                  {pd.matched ? (
                    <span className="px-font g1-hold-tag">HOLD!</span>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* 라운드 인트로 스탬프 (3·2·1·GO!) */}
          {phase === 'intro' ? (
            <div className="g1-intro" aria-hidden="true">
              <span className="px-font g1-intro-text px-pulse">{introLabel}</span>
            </div>
          ) : null}

          <span className="px-font g1-engrave">MADPUMP-8</span>
        </div>
      </div>

      {/* ---------- 하단 조작키 안내 (온스크린 키패드) ---------- */}
      <div className="g1-keys">
        <div className="g1-keygroup">
          <span className="g1-keygroup-label" style={{ color: 'var(--p1)' }}>
            {flow.playerNames.P1}
          </span>
          <div className="g1-keyrow">
            <Keycap
              keyLabel="Q"
              icon={<span className="g1-kr-icon">↓ 내리기</span>}
              owner="P1"
              pressed={held.P1key1}
            />
            <Keycap
              keyLabel="W"
              icon={<span className="g1-kr-icon">↑ 올리기</span>}
              owner="P1"
              pressed={held.P1key2}
            />
          </div>
        </div>
        <span className="g1-keys-hint">타겟 숫자에 맞추고 3초 유지!</span>
        <div className="g1-keygroup">
          <span className="g1-keygroup-label" style={{ color: 'var(--p2)' }}>
            {online ? `${flow.playerNames.P2} (BOT)` : flow.playerNames.P2}
          </span>
          <div className="g1-keyrow">
            <Keycap
              keyLabel="U"
              icon={<span className="g1-kr-icon">↓ 내리기</span>}
              owner="P2"
              pressed={held.P2key1}
            />
            <Keycap
              keyLabel="I"
              icon={<span className="g1-kr-icon">↑ 올리기</span>}
              owner="P2"
              pressed={held.P2key2}
            />
          </div>
        </div>
      </div>

      {/* ---------- 라운드/매치 결과 ---------- */}
      {phase === 'result' && outcome ? (
        <ResultOverlay
          winner={outcome.winner}
          matchOver={outcome.matchOver}
          matchResult={outcome.matchResult}
          onNextRound={handleNextRound}
        />
      ) : null}
    </div>
  );
}
