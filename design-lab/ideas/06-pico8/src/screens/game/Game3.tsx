/**
 * S12. 게임3 인게임 — 펜싱 (scr-game3)
 * [소유: game3 에이전트]
 *
 * - 로직: @shared createGame3State / tickGame3 (재구현 금지)
 * - 1초 틱 가위바위보 (q/u=공격, w/i=회피, 무입력=무행동), 칸 밀림/링아웃/바다
 * - 오프라인 2인(q/w vs u/i) + 온라인 mock(봇 — 틱 윈도우마다 랜덤 행동)
 * - HUD: hud-countdown / hud-profile-p1 / hud-profile-p2 / game-stage / btn-exit
 * - 라운드 종료 → recordRoundResult → ResultOverlay(game1 소유, import만)
 * - 틱마다 setDebugGame(state), 언마운트 시 setDebugGame(null)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  attachKeyboardAdapter,
  createGame3State,
  DEFAULT_KEYBOARD_MAP,
  tickGame3,
} from '@shared';
import type {
  Game3Action,
  Game3Move,
  Game3State,
  Game3TickEvent,
  MatchResult,
  PlayerRole,
} from '@shared';
import {
  getFlow,
  recordRoundResult,
  resetFlow,
  startMatch,
  useFlow,
} from '../../state/flow';
import { Keycap, PlayerBadge } from '../../components';
import ResultOverlay from './ResultOverlay';
import { setDebugGame, useDebugScreen } from '../../debug';
import './Game3.css';

// ---------------------------------------------------------------------------
// 픽셀 스프라이트 (8px 그리드 · PICO-8 팔레트 · 이모지 미사용)
// ---------------------------------------------------------------------------

type Pose = 'idle' | 'attack' | 'dodge';

const MOVE_POSE: Record<Game3Move, Pose> = {
  ATTACK: 'attack',
  DODGE: 'dodge',
  NONE: 'idle',
};

/** 16x16 픽셀 펜서 — 대기(검 세움)/공격(찌르기 런지)/회피(방패 웅크림) 3포즈 */
function FencerSprite({ team, pose }: { team: PlayerRole; pose: Pose }) {
  const c = team === 'P1' ? 'var(--p1)' : 'var(--p2)';
  const skin = 'var(--flesh)';
  const metal = '#c2c3c7';
  const bright = '#fff1e8';
  return (
    <svg viewBox="0 0 16 16" className="g3-fencer-svg" aria-hidden>
      {pose === 'idle' && (
        <g>
          <rect x="4" y="1" width="4" height="4" fill={skin} />
          <rect x="4" y="5" width="4" height="6" fill={c} />
          <rect x="4" y="11" width="2" height="4" fill={c} />
          <rect x="7" y="11" width="2" height="4" fill={c} />
          <rect x="8" y="6" width="2" height="2" fill={skin} />
          <rect x="10" y="5" width="1" height="1" fill={metal} />
          <rect x="11" y="4" width="1" height="1" fill={metal} />
          <rect x="12" y="3" width="1" height="1" fill={bright} />
          <rect x="13" y="2" width="1" height="1" fill={bright} />
        </g>
      )}
      {pose === 'attack' && (
        <g>
          <rect x="4" y="2" width="4" height="4" fill={skin} />
          <rect x="4" y="6" width="5" height="5" fill={c} />
          <rect x="3" y="11" width="2" height="4" fill={c} />
          <rect x="8" y="11" width="4" height="2" fill={c} />
          <rect x="9" y="7" width="2" height="2" fill={skin} />
          <rect x="11" y="7" width="4" height="1" fill={bright} />
          <rect x="11" y="8" width="1" height="1" fill={metal} />
        </g>
      )}
      {pose === 'dodge' && (
        <g>
          <rect x="3" y="4" width="4" height="4" fill={skin} />
          <rect x="3" y="8" width="4" height="5" fill={c} />
          <rect x="3" y="13" width="2" height="2" fill={c} />
          <rect x="6" y="13" width="2" height="2" fill={c} />
          <rect x="8" y="5" width="3" height="8" fill={metal} />
          <rect x="8" y="5" width="3" height="1" fill={bright} />
          <rect x="9" y="7" width="1" height="4" fill={c} />
        </g>
      )}
    </svg>
  );
}

/** 8x8 행동 아이콘 — 검 / 방패 / 무행동(점 3개) */
function MoveIcon({ move, size = 20 }: { move: Game3Move; size?: number }) {
  return (
    <svg viewBox="0 0 8 8" width={size} height={size} aria-hidden>
      {move === 'ATTACK' && (
        <g>
          <rect x="6" y="1" width="1" height="1" fill="#fff1e8" />
          <rect x="5" y="2" width="1" height="1" fill="#fff1e8" />
          <rect x="4" y="3" width="1" height="1" fill="#c2c3c7" />
          <rect x="3" y="4" width="1" height="1" fill="#c2c3c7" />
          <rect x="2" y="4" width="1" height="1" fill="#ab5236" />
          <rect x="4" y="5" width="1" height="1" fill="#ab5236" />
          <rect x="1" y="5" width="2" height="2" fill="#ab5236" />
        </g>
      )}
      {move === 'DODGE' && (
        <g>
          <rect x="1" y="1" width="6" height="5" fill="#c2c3c7" />
          <rect x="2" y="6" width="4" height="1" fill="#c2c3c7" />
          <rect x="3" y="2" width="2" height="4" fill="#ffa300" />
          <rect x="1" y="1" width="6" height="1" fill="#fff1e8" />
        </g>
      )}
      {move === 'NONE' && (
        <g>
          <rect x="1" y="4" width="1" height="1" fill="#83769c" />
          <rect x="3" y="4" width="1" height="1" fill="#83769c" />
          <rect x="5" y="4" width="1" height="1" fill="#83769c" />
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 봇 (온라인 mock — 틱 윈도우마다 랜덤 행동)
// ---------------------------------------------------------------------------

interface BotPlan {
  windowIndex: number;
  fireAtMs: number;
  move: Game3Move;
  fired: boolean;
}

function pickBotMove(state: Game3State): Game3Move {
  const danger = state.players.P2.distanceFromEdge <= 1;
  const r = Math.random();
  if (danger) return r < 0.45 ? 'ATTACK' : r < 0.85 ? 'DODGE' : 'NONE';
  return r < 0.35 ? 'ATTACK' : r < 0.65 ? 'DODGE' : 'NONE';
}

// ---------------------------------------------------------------------------
// 화면
// ---------------------------------------------------------------------------

type Phase = 'countdown' | 'playing' | 'ended';

interface OverlayInfo {
  winner: PlayerRole | null;
  matchOver: boolean;
  matchResult: MatchResult | null;
}

interface FxInfo {
  ev: Game3TickEvent;
}

function makeRoundState(): Game3State {
  return createGame3State({
    roundDurationMs: getFlow().roundConfig.timePerRoundSec * 1000,
  });
}

const COUNT_SEQ = ['3', '2', '1', 'GO!'];
const TICK_SEGS = 8;
const CD_BLOCKS = 12;

export default function Game3() {
  useDebugScreen('scr-game3');
  const navigate = useNavigate();

  // 직접 URL 진입(QA) fallback — 매치 미시작이면 오프라인 매치로 초기화
  const [ready, setReady] = useState(() => getFlow().currentRound > 0);
  useEffect(() => {
    if (getFlow().currentRound === 0) {
      startMatch('offline', 3);
      setReady(true);
    }
  }, []);

  const flow = useFlow();
  const online = flow.mode === 'online';

  const stateRef = useRef<Game3State>(null as unknown as Game3State);
  if (stateRef.current === null) stateRef.current = makeRoundState();
  const [snap, setSnap] = useState<Game3State>(stateRef.current);

  const [phase, setPhase] = useState<Phase>('countdown');
  const phaseRef = useRef<Phase>('countdown');
  phaseRef.current = phase;

  const [countText, setCountText] = useState(COUNT_SEQ[0]);
  const [fx, setFx] = useState<FxInfo | null>(null);
  const [overlay, setOverlay] = useState<OverlayInfo | null>(null);
  const [pressed, setPressed] = useState({
    P1key1: false,
    P1key2: false,
    P2key1: false,
    P2key2: false,
  });
  const [botPressed, setBotPressed] = useState({ key1: false, key2: false });

  const inputsRef = useRef<Game3Action[]>([]);
  const botRef = useRef<BotPlan | null>(null);
  const recordedRef = useRef(false);
  const timeoutsRef = useRef<Set<number>>(new Set());

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timeoutsRef.current.delete(id);
      fn();
    }, ms);
    timeoutsRef.current.add(id);
  }, []);

  // 디버그 브리지 — 마운트 시 초기 state, 언마운트 시 정리
  useEffect(() => {
    setDebugGame(stateRef.current);
    const timeouts = timeoutsRef.current;
    return () => {
      setDebugGame(null);
      timeouts.forEach((id) => window.clearTimeout(id));
      timeouts.clear();
    };
  }, []);

  // 키보드 (q/w vs u/i) — 온라인이면 P2는 봇 소유라 사람 입력 무시
  useEffect(() => {
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      if (ev.player === 'P2' && getFlow().mode === 'online') return;
      const slot = `${ev.player}${ev.key}` as keyof typeof pressed;
      setPressed((p) => ({ ...p, [slot]: ev.phase === 'down' }));
      if (ev.phase !== 'down') return;
      if (phaseRef.current !== 'playing') return;
      inputsRef.current.push({
        gameId: 3,
        player: ev.player,
        type: ev.key === 'key1' ? 'ATTACK' : 'DODGE',
      });
    });
    return detach;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 라운드 시작 카운트다운 (ROUND N → 3·2·1·GO!)
  useEffect(() => {
    if (phase !== 'countdown' || !ready) return;
    setCountText(COUNT_SEQ[0]);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      if (i < COUNT_SEQ.length) {
        setCountText(COUNT_SEQ[i]);
      } else {
        window.clearInterval(id);
        setPhase('playing');
      }
    }, 700);
    return () => window.clearInterval(id);
  }, [phase, ready]);

  const flashBotKey = useCallback(
    (key: 'key1' | 'key2') => {
      setBotPressed((p) => ({ ...p, [key]: true }));
      later(() => setBotPressed((p) => ({ ...p, [key]: false })), 160);
    },
    [later],
  );

  const endRound = useCallback(
    (final: Game3State) => {
      setPhase('ended');
      if (recordedRef.current) return;
      recordedRef.current = true;
      const winner: PlayerRole | null =
        final.result === 'DRAW' ? null : final.result === 'P1_WIN' ? 'P1' : 'P2';
      const outcome = recordRoundResult(winner);
      // 낙하/스플래시(링아웃)·스탬프(시간 종료) 연출을 보여준 뒤 오버레이
      later(
        () =>
          setOverlay({
            winner,
            matchOver: outcome.matchOver,
            matchResult: outcome.matchResult,
          }),
        1400,
      );
    },
    [later],
  );

  // 게임 루프 (rAF) — 로직은 전부 @shared tickGame3
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(100, Math.max(0, now - last));
      last = now;
      const prev = stateRef.current;

      // 온라인 봇: 틱 윈도우마다 랜덤 행동 1회 (랜덤 시점에 입력)
      if (getFlow().mode === 'online') {
        let plan = botRef.current;
        if (!plan || plan.windowIndex !== prev.tickCount) {
          plan = {
            windowIndex: prev.tickCount,
            fireAtMs: 120 + Math.random() * 680,
            move: pickBotMove(prev),
            fired: false,
          };
          botRef.current = plan;
        }
        if (!plan.fired && prev.windowElapsedMs + dt >= plan.fireAtMs) {
          plan.fired = true;
          if (plan.move !== 'NONE') {
            inputsRef.current.push({
              gameId: 3,
              player: 'P2',
              type: plan.move,
            });
            flashBotKey(plan.move === 'ATTACK' ? 'key1' : 'key2');
          }
        }
      }

      const inputs = inputsRef.current;
      inputsRef.current = [];
      const next = tickGame3(prev, inputs, dt);
      stateRef.current = next;
      setSnap(next);
      setDebugGame(next);

      // 틱 판정 공개 연출 (밀림/동일행동/낙사 — lastTick 이벤트 활용)
      if (next.tickCount !== prev.tickCount && next.lastTick) {
        setFx({ ev: next.lastTick });
        later(() => setFx((f) => (f?.ev === next.lastTick ? null : f)), 750);
      }

      if (next.result !== null) {
        endRound(next);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, endRound, flashBotKey, later]);

  // ResultOverlay "다음 라운드" — 새 라운드 state 생성 (advanceRound는 오버레이 내부)
  const handleNextRound = useCallback(() => {
    recordedRef.current = false;
    inputsRef.current = [];
    botRef.current = null;
    const s = makeRoundState();
    stateRef.current = s;
    setSnap(s);
    setDebugGame(s);
    setFx(null);
    setOverlay(null);
    setPhase('countdown');
  }, []);

  const handleExit = useCallback(() => {
    resetFlow();
    navigate('/');
  }, [navigate]);

  // ------------------------------------------------------------------ 파생값
  const view = snap.view;
  const cols = view.trackLength + 4; // 좌우 바다 각 2칸
  const colPct = 100 / cols;
  const seaW = `${colPct * 2}%`;
  const platformStyle: CSSProperties = {
    left: seaW,
    width: `${colPct * view.trackLength}%`,
  };
  const charStyle = (cell: number): CSSProperties => ({
    left: `${(2 + cell) * colPct}%`,
    width: `${colPct}%`,
  });

  const secondsLeft = Math.ceil(view.timeRemainingMs / 1000);
  const totalMs = snap.config.roundDurationMs;
  const cdFilled = Math.ceil((view.timeRemainingMs / totalMs) * CD_BLOCKS);
  const last3 = secondsLeft <= 3;

  const tickFilled = Math.min(
    TICK_SEGS,
    Math.floor((snap.windowElapsedMs / snap.config.tickIntervalMs) * TICK_SEGS),
  );

  const fell = snap.resultReason === 'RING_OUT' ? snap.lastTick?.fell ?? null : null;
  const winnerRole: PlayerRole | null =
    snap.result === 'P1_WIN' ? 'P1' : snap.result === 'P2_WIN' ? 'P2' : null;

  const dangerP1 = snap.result === null && snap.players.P1.distanceFromEdge <= 1;
  const dangerP2 = snap.result === null && snap.players.P2.distanceFromEdge <= 1;

  const poseFor = (role: PlayerRole): Pose => {
    if (fell === role) return 'idle';
    if (fx) return MOVE_POSE[fx.ev.moves[role]];
    return MOVE_POSE[snap.pending[role]];
  };

  const clangLeft = `${(((2 + view.p1Cell) + (2 + view.p2Cell) + 1) / 2) * colPct}%`;

  const renderChar = (role: PlayerRole) => {
    const cell = role === 'P1' ? view.p1Cell : view.p2Cell;
    const pushedNow = fx?.ev.pushed === role && !fell;
    const cls = [
      'g3-char',
      role === 'P2' ? 'is-p2' : '',
      fell === role ? 'is-fallen' : '',
      pushedNow ? 'is-pushed-now' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div className={cls} style={charStyle(cell)}>
        {phase === 'ended' && winnerRole === role ? (
          <span className="g3-win-star">★WIN★</span>
        ) : null}
        {fx ? (
          <div className="g3-bubble">
            <MoveIcon move={fx.ev.moves[role]} />
          </div>
        ) : null}
        {fx && fx.ev.moves[role] === 'NONE' && !fell ? (
          <span className="g3-zzz">ZZZ</span>
        ) : null}
        {fx?.ev.pushed === role ? (
          <span className="g3-push-arrow">{role === 'P1' ? '◀' : '▶'}</span>
        ) : null}
        <FencerSprite team={role} pose={poseFor(role)} />
      </div>
    );
  };

  if (!ready) return <div data-testid="scr-game3" className="g3-root" />;

  return (
    <div data-testid="scr-game3" className="g3-root px-snap-in">
      {/* ---------------- HUD ---------------- */}
      <div className="g3-hud">
        <PlayerBadge
          role="P1"
          nickname={flow.playerNames.P1}
          isYou={online}
          data-testid="hud-profile-p1"
        />
        <div className="g3-hud-center">
          <span className="g3-round-label">
            ROUND {Math.max(1, flow.currentRound)}/{flow.roundConfig.roundCount}
            {' · '}
            {flow.scores.p1Wins}-{flow.scores.p2Wins}
          </span>
          <div data-testid="hud-countdown">
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span
                className={`g3-cd-seconds${last3 ? ' is-last3 px-pulse' : ''}`}
              >
                {secondsLeft}
              </span>
              <div className="g3-cd-blocks">
                {Array.from({ length: CD_BLOCKS }, (_, i) => (
                  <span
                    key={i}
                    className={`g3-cd-block${i < cdFilled ? ' is-on' : ''}${
                      last3 ? ' is-last3' : ''
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="g3-exit-slot">
          <PlayerBadge
            role="P2"
            nickname={flow.playerNames.P2}
            data-testid="hud-profile-p2"
          />
          <Keycap
            keyLabel="X"
            icon="EXIT"
            data-testid="btn-exit"
            onClick={handleExit}
            aria-label="나가기"
          />
        </div>
      </div>

      {/* ---------------- 콘솔 스크린 ---------------- */}
      <div className="g3-frame">
        <div data-testid="game-stage" className="g3-stage">
          {/* 1초 틱 진행 바 */}
          <div className="g3-tickbar">
            <span className="g3-tickbar-label">JUDGE</span>
            <div className="g3-tickbar-segs">
              {Array.from({ length: TICK_SEGS }, (_, i) => (
                <span
                  key={i}
                  className={`g3-tick-seg${
                    phase === 'playing' && i < tickFilled ? ' is-on' : ''
                  }`}
                />
              ))}
            </div>
          </div>

          {/* 바다 (좌=P1 낭떠러지 / 우=P2 낭떠러지) */}
          <div
            className={`g3-sea${dangerP1 ? ' is-danger' : ''}`}
            style={{ left: 0, width: seaW }}
          />
          <div
            className={`g3-sea${dangerP2 ? ' is-danger' : ''}`}
            style={{ right: 0, width: seaW }}
          />

          {/* 칸 분절 플랫폼 */}
          <div className="g3-platform" style={platformStyle}>
            {Array.from({ length: view.trackLength }, (_, i) => {
              const blink =
                (dangerP1 && i === view.p1Cell) ||
                (dangerP2 && i === view.p2Cell);
              return (
                <div key={i} className={`g3-cell${blink ? ' is-blink' : ''}`} />
              );
            })}
          </div>

          {/* 펜서 */}
          {renderChar('P1')}
          {renderChar('P2')}

          {/* 동일행동 CLANG! (무행동/무행동은 zzz로만 표현) */}
          {fx?.ev.clash && fx.ev.moves.P1 !== 'NONE' && snap.result === null ? (
            <span className="g3-clang" style={{ left: clangLeft }}>
              CLANG!
            </span>
          ) : null}

          {/* 링아웃 스플래시 */}
          {fell ? (
            <div
              className="g3-splash"
              style={{
                left: `${(2 + (fell === 'P1' ? view.p1Cell : view.p2Cell) + 0.5) * colPct}%`,
              }}
            >
              <span className="g3-splash-text">SPLASH!</span>
              <span className="g3-splash-col" />
            </div>
          ) : null}

          {/* 종료 판정 스탬프 — 링아웃 / 시간 종료 */}
          {phase === 'ended' && snap.resultReason === 'RING_OUT' ? (
            <span className="g3-stamp-end">
              RING OUT! {winnerRole ? `${winnerRole} WIN` : ''}
            </span>
          ) : null}
          {phase === 'ended' && snap.resultReason === 'TIMEOUT' ? (
            <span className="g3-stamp-end">
              TIME UP! {winnerRole ? `${winnerRole} WIN` : 'DRAW'}
            </span>
          ) : null}

          {/* 라운드 시작 카운트다운 */}
          {phase === 'countdown' ? (
            <div className="g3-stamp-layer">
              <span className="g3-stamp-round">
                ROUND {Math.max(1, flow.currentRound)}
              </span>
              <span
                className={`g3-stamp-count${countText === 'GO!' ? ' is-go' : ''}`}
              >
                {countText}
              </span>
            </div>
          ) : null}
        </div>
        <span className="g3-engrave">MADPUMP-8</span>
      </div>

      {/* ---------------- 온스크린 키패드 + 스탠스 피드백 ---------------- */}
      <div className="g3-pads">
        <div className="g3-pad-group">
          <span className="g3-pad-title">
            P1{online ? ' (YOU)' : ''}
          </span>
          <Keycap
            keyLabel="Q"
            owner="P1"
            pressed={pressed.P1key1}
            icon={<MoveIcon move="ATTACK" size={14} />}
            aria-label="P1 공격 (Q)"
          />
          <Keycap
            keyLabel="W"
            owner="P1"
            pressed={pressed.P1key2}
            icon={<MoveIcon move="DODGE" size={14} />}
            aria-label="P1 회피 (W)"
          />
          <div className="g3-stance-chip">
            <span className="g3-stance-label">STANCE</span>
            <MoveIcon move={snap.pending.P1} size={16} />
          </div>
        </div>
        <div className="g3-pad-group">
          <div className="g3-stance-chip">
            <span className="g3-stance-label">STANCE</span>
            <MoveIcon move={snap.pending.P2} size={16} />
          </div>
          <Keycap
            keyLabel="U"
            owner="P2"
            pressed={online ? botPressed.key1 : pressed.P2key1}
            icon={<MoveIcon move="ATTACK" size={14} />}
            aria-label="P2 공격 (U)"
          />
          <Keycap
            keyLabel="I"
            owner="P2"
            pressed={online ? botPressed.key2 : pressed.P2key2}
            icon={<MoveIcon move="DODGE" size={14} />}
            aria-label="P2 회피 (I)"
          />
          <span className="g3-pad-title">
            P2{online ? ' (BOT)' : ''}
          </span>
        </div>
      </div>

      {overlay ? (
        <ResultOverlay
          winner={overlay.winner}
          matchOver={overlay.matchOver}
          matchResult={overlay.matchResult}
          onNextRound={handleNextRound}
        />
      ) : null}
    </div>
  );
}
