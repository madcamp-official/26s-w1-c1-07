/**
 * S12 게임3 — 펜싱 "피스트 스트립 + 바다 링아웃" (game3 에이전트 구현).
 *
 * SPEC S12 + PLAN §3.3. 로직은 @shared createGame3State/tickGame3만 사용 (재구현 금지).
 * - 1초 틱 가위바위보: q·u=공격(ATTACK), w·i=회피(DODGE), 무입력=무행동 — 마지막 입력 채택은 코어 처리.
 * - 판정 연출: state.lastTick(밀림/클래시/낙사)을 스큐 배너 + 포즈 + 스키드/스플래시로 재생.
 * - 온라인 mock: P2 = 봇 (틱 윈도우마다 랜덤 지연 후 가중 랜덤 행동).
 * - 매 프레임 setDebugGame(state), 언마운트 시 setDebugGame(null).
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  createGame3State,
  tickGame3,
  attachKeyboardAdapter,
  DEFAULT_KEYBOARD_MAP,
} from '@shared';
import type { Game3Action, Game3Move, Game3State, PlayerRole } from '@shared';
import {
  useFlow,
  exitMatch,
  nextRound,
  reportRoundEnd,
  getPlayerDisplays,
  getRoundWins,
} from '../../state/flow';
import type { FlowState } from '../../state/flow';
import { useDebugScreen, setDebugGame } from '../../debug';
import { Button, KeyCap, LiveBadge, ScoreBug, SkewTab } from '../../components';
import ResultOverlay from './ResultOverlay';
import './game3.css';

// ---------------------------------------------------------------------------
// 상수/헬퍼
// ---------------------------------------------------------------------------

/** 스테이지에서 좌우 바다가 차지하는 폭 (%) — game3.css의 .g3-sea/.g3-platform과 짝 */
const SEA_PCT = 15;

const MOVE_LABEL: Record<Game3Move, string> = {
  ATTACK: '공격',
  DODGE: '회피',
  NONE: '무행동',
};

function otherRole(role: PlayerRole): PlayerRole {
  return role === 'P1' ? 'P2' : 'P1';
}

/** 피스트 셀 → 스테이지 left(%) (셀 밖 값은 바다 위 좌표가 됨 — 낙사 연출에 그대로 사용) */
function leftForCell(cell: number, trackLength: number): number {
  return SEA_PCT + ((cell + 0.5) * (100 - SEA_PCT * 2)) / trackLength;
}

// ---------------------------------------------------------------------------
// 픽토그램 (⚔/🛡/– 를 인라인 SVG로)
// ---------------------------------------------------------------------------

function MoveIcon({ move, size = 14 }: { move: Game3Move; size?: number }) {
  if (move === 'ATTACK') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 16 L14 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M10.5 4.5 L15.5 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M3.5 16.5 L5.5 14.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  if (move === 'DODGE') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M10 2 L17 5 V10 C17 14.5 13.8 17.2 10 18 C6.2 17.2 3 14.5 3 10 V5 Z"
          fill="currentColor"
          fillOpacity="0.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <line x1="5" y1="10" x2="15" y2="10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 스틱 펜서 (선 굵은 스틱맨, 포즈 3종 — PLAN §3.3)
// ---------------------------------------------------------------------------

function Fencer({ team, pose }: { team: 'p1' | 'p2'; pose: Game3Move }) {
  const c = team === 'p1' ? 'var(--p1)' : 'var(--p2)';
  const deep = team === 'p1' ? 'var(--p1-deep)' : 'var(--p2-deep)';
  const tint = team === 'p1' ? 'var(--p1-tint)' : 'var(--p2-tint)';
  const stroke = { stroke: c, strokeWidth: 4.5, strokeLinecap: 'round' as const, fill: 'none' };
  const sword = { stroke: 'var(--ink)', strokeWidth: 3, strokeLinecap: 'round' as const };

  let body;
  if (pose === 'ATTACK') {
    // 검 찌르기 런지
    body = (
      <g>
        <circle cx="46" cy="20" r="8" fill={c} />
        <path d="M46 28 L34 56" {...stroke} />
        <path d="M34 56 L56 68 L58 88" {...stroke} strokeLinejoin="round" />
        <path d="M34 56 L14 88" {...stroke} />
        <path d="M46 34 L32 42" {...stroke} />
        <path d="M46 32 L64 32" {...stroke} />
        <path d="M64 32 L92 32" {...sword} />
        <path d="M66 25 L66 39" {...sword} strokeWidth={2.5} />
      </g>
    );
  } else if (pose === 'DODGE') {
    // 방패 웅크림
    body = (
      <g>
        <circle cx="34" cy="34" r="8" fill={c} />
        <path d="M34 42 L30 64" {...stroke} />
        <path d="M30 64 L18 88" {...stroke} />
        <path d="M30 64 L42 88" {...stroke} />
        <path d="M33 48 L46 54" {...stroke} />
        <circle cx="53" cy="54" r="15" fill={tint} stroke={deep} strokeWidth="4" />
        <circle cx="53" cy="54" r="3.5" fill={deep} />
      </g>
    );
  } else {
    // 중립 스탠스
    body = (
      <g>
        <circle cx="36" cy="18" r="8" fill={c} />
        <path d="M36 26 L36 58" {...stroke} />
        <path d="M36 58 L26 86" {...stroke} />
        <path d="M36 58 L46 86" {...stroke} />
        <path d="M36 34 L26 44" {...stroke} />
        <path d="M36 34 L50 42" {...stroke} />
        <path d="M50 42 L70 28" {...sword} />
      </g>
    );
  }

  return (
    <svg
      width="96"
      height="96"
      viewBox="0 0 96 96"
      aria-hidden="true"
      style={{
        transform: team === 'p2' ? 'scaleX(-1)' : undefined,
        transition: 'transform 120ms var(--ease)',
        display: 'block',
      }}
    >
      {body}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 화면 본체
// ---------------------------------------------------------------------------

export default function Game3() {
  useDebugScreen('scr-game3');
  const flow = useFlow();
  if (flow.gameId !== 3 || flow.phase === 'idle') {
    return <Navigate to="/select" replace />;
  }
  // key=currentRound: nextRound() 때 arena 전체 리마운트 → 새 @shared state로 라운드 재시작
  return <Game3Arena key={flow.currentRound} flow={flow} />;
}

type PressedMap = Record<PlayerRole, { key1: boolean; key2: boolean }>;

interface BotPlan {
  window: number;
  delayMs: number;
  move: Game3Move;
  done: boolean;
}

function Game3Arena({ flow }: { flow: FlowState }) {
  const navigate = useNavigate();
  const isOnline = flow.mode === 'online';
  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);

  const [game, setGame] = useState<Game3State>(() =>
    createGame3State({ roundDurationMs: flow.roundConfig.timePerRoundSec * 1000 }),
  );
  const gameRef = useRef(game);
  const actionsRef = useRef<Game3Action[]>([]);
  const botPlanRef = useRef<BotPlan | null>(null);
  const flashTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [pressed, setPressed] = useState<PressedMap>({
    P1: { key1: false, key2: false },
    P2: { key1: false, key2: false },
  });

  // 봇 키캡 점등 (짧은 플래시)
  function flashBotKey(key: 'key1' | 'key2') {
    setPressed((p) => ({ ...p, P2: { ...p.P2, [key]: true } }));
    flashTimersRef.current.push(
      setTimeout(() => setPressed((p) => ({ ...p, P2: { ...p.P2, [key]: false } })), 160),
    );
  }
  useEffect(
    () => () => {
      flashTimersRef.current.forEach(clearTimeout);
    },
    [],
  );

  // 봇 mock: 틱 윈도우마다 랜덤 지연(120~770ms) 후 가중 랜덤 행동 (공격 40 / 회피 35 / 무행동 25)
  function runBot() {
    const g = gameRef.current;
    let plan = botPlanRef.current;
    if (!plan || plan.window !== g.tickCount) {
      const r = Math.random();
      const move: Game3Move = r < 0.4 ? 'ATTACK' : r < 0.75 ? 'DODGE' : 'NONE';
      plan = { window: g.tickCount, delayMs: 120 + Math.random() * 650, move, done: false };
      botPlanRef.current = plan;
    }
    if (!plan.done && g.windowElapsedMs >= plan.delayMs) {
      plan.done = true;
      if (plan.move !== 'NONE') {
        actionsRef.current.push({ gameId: 3, player: 'P2', type: plan.move });
        flashBotKey(plan.move === 'ATTACK' ? 'key1' : 'key2');
      }
    }
  }

  // 디버그 브리지: 최신 state 즉시 반영 (rAF가 잠든 백그라운드 탭에서도 초기 state 노출)
  useEffect(() => {
    setDebugGame(game);
  }, [game]);

  // rAF 루프 — 코어 1s 틱은 tickGame3가 윈도우 경계에서 처리
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (isOnline && gameRef.current.result === null) runBot();
      const queued = actionsRef.current;
      actionsRef.current = [];
      const prev = gameRef.current;
      const next = tickGame3(prev, queued, dt);
      if (next !== prev) {
        gameRef.current = next;
        setGame(next);
      }
      setDebugGame(gameRef.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      setDebugGame(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // 키보드 입력 (오프라인 2인 / 온라인은 P1만 — P2는 봇)
  useEffect(() => {
    return attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      if (isOnline && ev.player === 'P2') return;
      setPressed((p) => ({ ...p, [ev.player]: { ...p[ev.player], [ev.key]: ev.phase === 'down' } }));
      if (ev.phase !== 'down') return;
      if (gameRef.current.result !== null) return;
      actionsRef.current.push({
        gameId: 3,
        player: ev.player,
        type: ev.key === 'key1' ? 'ATTACK' : 'DODGE',
      });
    });
  }, [isOnline]);

  // 라운드 종료 보고 — 낙하/스플래시 연출 시간을 두고 1회 보고 (reportRoundEnd는 중복 no-op)
  useEffect(() => {
    if (!game.result) return;
    const delay = game.resultReason === 'RING_OUT' ? 1100 : 700;
    const t = setTimeout(() => reportRoundEnd(game.result!), delay);
    return () => clearTimeout(t);
  }, [game.result, game.resultReason]);

  // ── 렌더 파생값 ───────────────────────────────────────────
  const { view, lastTick, pending, players: gp } = game;
  const p1Fell = gp.P1.distanceFromEdge < 0;
  const p2Fell = gp.P2.distanceFromEdge < 0;

  /** 표시 포즈: 이번 윈도우의 예약 행동 우선, 판정 직후 600ms는 판정 행동 유지 */
  const poseFor = (role: PlayerRole): Game3Move => {
    if (game.result !== null && lastTick) return lastTick.moves[role];
    if (pending[role] !== 'NONE') return pending[role];
    if (lastTick && game.windowElapsedMs < 600) return lastTick.moves[role];
    return 'NONE';
  };

  const bannerText = (t: NonNullable<Game3State['lastTick']>): string => {
    if (t.fell) return `RING OUT! ${t.fell} 바다로 낙하`;
    if (t.pushed) return `${otherRole(t.pushed)} PUSHES! — ${t.pushed} 1칸 밀림`;
    if (t.moves.P1 === 'ATTACK') return 'PARRY! 검 격돌 — 밀림 없음';
    if (t.moves.P1 === 'DODGE') return 'STANDOFF! 방패 대치 — 밀림 없음';
    return '탐색전 — 양측 무행동';
  };

  const calloutWinner: PlayerRole | null =
    game.result === 'P1_WIN' ? 'P1' : game.result === 'P2_WIN' ? 'P2' : null;

  const skidLeft = lastTick?.pushed
    ? leftForCell(lastTick.pushed === 'P1' ? view.p1Cell : view.p2Cell, view.trackLength)
    : 0;

  const splashRole = lastTick?.fell ?? null;
  const splashLeft = splashRole
    ? leftForCell(splashRole === 'P1' ? view.p1Cell : view.p2Cell, view.trackLength)
    : 0;

  const padFor = (role: PlayerRole) => {
    const team = role === 'P1' ? 'p1' : 'p2';
    const keys = role === 'P1' ? DEFAULT_KEYBOARD_MAP.playerL : DEFAULT_KEYBOARD_MAP.playerR;
    const stance = pending[role];
    const isBotSide = isOnline && role === 'P2';
    return (
      <div className={`g3-pad ${team}`}>
        <SkewTab tone={team}>
          {role} · {players[role].name}
          {isBotSide ? ' · BOT' : ''}
        </SkewTab>
        <KeyCap keyLabel={keys.key1} hint="공격" team={team} active={pressed[role].key1} />
        <KeyCap keyLabel={keys.key2} hint="회피" team={team} active={pressed[role].key2} />
        <span className="g3-stance">
          <span className={`g3-stance-chip ${team} ${stance !== 'NONE' ? 'on' : ''}`}>
            <MoveIcon move={stance} />
            {MOVE_LABEL[stance]}
          </span>
          <span className="g3-pad-hint">1초 틱 · 마지막 입력 채택</span>
        </span>
      </div>
    );
  };

  const fencerFor = (role: PlayerRole) => {
    const team = role === 'P1' ? 'p1' : 'p2';
    const cell = role === 'P1' ? view.p1Cell : view.p2Cell;
    const fell = role === 'P1' ? p1Fell : p2Fell;
    const dist = Math.max(0, gp[role].distanceFromEdge);
    return (
      <div
        className={`g3-fencer ${fell ? `g3-fall ${role === 'P2' ? 'g3-fall-right' : ''}` : ''}`}
        style={{ left: `${leftForCell(cell, view.trackLength)}%` }}
      >
        <span className="g3-fencer-tags">
          {players[role].isYou && (
            <span className="g3-you" style={{ background: `var(--${team})` }}>
              YOU
            </span>
          )}
          <span className="g3-edgeplate">
            <span className="label" style={{ fontSize: 9, color: 'var(--ink-sub)' }}>
              EDGE
            </span>
            <b key={dist} className="tnum flip-roll" style={{ color: `var(--${team})`, fontSize: 12 }}>
              {dist}
            </b>
          </span>
        </span>
        <Fencer team={team} pose={poseFor(role)} />
      </div>
    );
  };

  return (
    <div data-testid="scr-game3" className="g3-root">
      {/* 상단 바: LIVE + 종목 라벨 / 스코어 버그(hud-*) / 나가기 */}
      <div className="g3-topbar">
        <div className="g3-topbar-left">
          <LiveBadge />
          <span className="label" style={{ color: 'var(--ink-sub)' }}>
            GAME 3 — FENCING PISTE
          </span>
        </div>
        <ScoreBug
          players={players}
          roundWins={wins}
          currentRound={flow.currentRound}
          roundCount={flow.roundConfig.roundCount}
          timeRemainingMs={view.timeRemainingMs}
        />
        <div className="g3-topbar-right">
          <Button
            testId="btn-exit"
            variant="secondary"
            onClick={() => {
              exitMatch();
              navigate('/');
            }}
          >
            나가기
          </Button>
        </div>
      </div>

      {/* 1초 틱 진행 표시 */}
      <div className="g3-judge">
        <span className="label" style={{ color: 'var(--ink-sub)', fontSize: 10 }}>
          NEXT CALL
        </span>
        <div className="g3-judge-track">
          <div
            className="g3-judge-fill"
            style={{
              width: `${Math.min(100, (game.windowElapsedMs / game.config.tickIntervalMs) * 100)}%`,
            }}
          />
        </div>
        <span className="tnum" style={{ fontSize: 11, color: 'var(--ink-sub)' }}>
          TICK {game.tickCount}
        </span>
      </div>

      {/* 스테이지: 피스트 + 바다 */}
      <div data-testid="game-stage" className="g3-stage">
        {/* 틱 판정 배너 (매 틱 로워서드 와이프) */}
        {lastTick && (
          <div key={lastTick.tickIndex} className="g3-banner">
            <div className="g3-banner-card skew wipe-in">
              <div className="unskew g3-banner-in">
                <span className="g3-movechip p1">
                  <MoveIcon move={lastTick.moves.P1} />
                  {MOVE_LABEL[lastTick.moves.P1]}
                </span>
                <b className="display" style={{ fontSize: 15 }}>
                  {bannerText(lastTick)}
                </b>
                <span className="g3-movechip p2">
                  <MoveIcon move={lastTick.moves.P2} />
                  {MOVE_LABEL[lastTick.moves.P2]}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 바다 (좌우) */}
        <div className="g3-sea g3-sea-left">
          <div className="g3-wave" data-anim="ticker" />
          <div className="g3-wave g3-wave2" data-anim="ticker" />
        </div>
        <div className="g3-sea g3-sea-right">
          <div className="g3-wave" data-anim="ticker" />
          <div className="g3-wave g3-wave2" data-anim="ticker" />
        </div>

        {/* 피스트 플랫폼 (칸 + 번호 스텐실) + 해저드 에지 */}
        <div className="g3-platform">
          {Array.from({ length: view.trackLength }, (_, i) => (
            <div key={i} className="g3-cell">
              <span className="g3-cell-num">{i + 1}</span>
            </div>
          ))}
        </div>
        <div className="g3-hazard g3-hazard-left" />
        <div className="g3-hazard g3-hazard-right" />

        {/* 펜서 2명 */}
        {fencerFor('P1')}
        {fencerFor('P2')}

        {/* 밀림 스키드 라인 */}
        {lastTick?.pushed && game.windowElapsedMs < 420 && game.result === null && (
          <div
            key={`skid-${lastTick.tickIndex}`}
            className="g3-skid"
            style={{
              left: `${skidLeft}%`,
              background: lastTick.pushed === 'P1' ? 'var(--p1)' : 'var(--p2)',
            }}
          />
        )}

        {/* 링아웃 스플래시 (팀 컬러 물방울) */}
        {splashRole && (
          <div key={`splash-${lastTick!.tickIndex}`} className="g3-splash" style={{ left: `${splashLeft}%` }}>
            {[-26, -12, 0, 12, 26].map((dx, i) => (
              <span
                key={i}
                style={{
                  background: splashRole === 'P1' ? 'var(--p1)' : 'var(--p2)',
                  ['--dx' as string]: `${dx}px`,
                  animationDelay: `${i * 40}ms`,
                }}
              />
            ))}
          </div>
        )}

        {/* 승패 확정 콜아웃 — ResultOverlay 등장 전 스테이지 연출 */}
        {game.result !== null && flow.phase === 'playing' && (
          <div className="g3-callout">
            <SkewTab tone={game.resultReason === 'RING_OUT' ? 'live' : 'navy'}>
              {game.resultReason === 'RING_OUT' ? 'RING OUT' : 'FULL TIME'}
            </SkewTab>
            <span className="g3-callout-title">
              {game.result === 'DRAW' ? 'DRAW' : `${calloutWinner} WINS`}
            </span>
            <span style={{ color: 'var(--ink-sub)', fontSize: 13 }}>
              {game.resultReason === 'RING_OUT'
                ? `${otherRole(calloutWinner!)} 링아웃 — 바다에 떨어졌습니다`
                : game.result === 'DRAW'
                  ? `시간 종료 — 남은 칸 동일 (P1 ${Math.max(0, gp.P1.distanceFromEdge)} : P2 ${Math.max(0, gp.P2.distanceFromEdge)})`
                  : `시간 종료 — 더 밀린 쪽 패배 (남은 칸 P1 ${Math.max(0, gp.P1.distanceFromEdge)} : P2 ${Math.max(0, gp.P2.distanceFromEdge)})`}
            </span>
          </div>
        )}
      </div>

      {/* 하단 패드: 키 인디케이터 + 스탠스 피드백 */}
      <div className="g3-pads">
        {padFor('P1')}
        {padFor('P2')}
      </div>

      {/* 라운드/매치 결과 오버레이 (game1 에이전트 소유 — import만) */}
      {flow.phase !== 'playing' && (
        <ResultOverlay
          flow={flow}
          players={players}
          onNextRound={() => nextRound()}
          onBackMain={() => {
            exitMatch();
            navigate('/');
          }}
        />
      )}
    </div>
  );
}
