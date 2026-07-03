/**
 * S12. 게임3 인게임 — 펜싱 (scr-game3)
 * [OWNER: game3 에이전트] — 이 파일은 game3 에이전트만 수정한다.
 *
 * SPEC S12 / PLAN §2-S12·§3.3 구현:
 *  - @shared createGame3State/tickGame3 — 1초 틱 가위바위보·밀림·링아웃·타임아웃 판정은 전부 코어.
 *    이 파일은 렌더 루프(rAF)에서 tickGame3만 호출한다. 로직 재구현 없음.
 *  - 입력: attachKeyboardAdapter(q/w vs u/i), down 엣지만 → key1=ATTACK, key2=DODGE.
 *    온라인 모드(flow.mode==='online')는 P2를 봇이 대신함 (틱 윈도우마다 랜덤 행동).
 *  - 연출: state.lastTick(Game3TickEvent) — 말풍선 칩 동시 공개 / TOUCHÉ / CLASH / 낙하+스플래시.
 *    스탠스 피드백: 검·방패 포즈(판정 공개), INPUT LOCKED 칩(입력 접수 표시 — 선택 내용은 비공개).
 *  - HUD/카운트다운/프로필: HudFrame (view.timeRemainingMs). 결과: reportRoundEnd → ResultOverlay.
 *  - 디버그 브리지: 매 틱 setDebugGame(state), 언마운트 시 setDebugGame(null).
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  attachKeyboardAdapter,
  createGame3State,
  DEFAULT_KEYBOARD_MAP,
  tickGame3,
} from '@shared';
import type { Game3Action, Game3Move, Game3State, PlayerRole } from '@shared';
import {
  exitMatch,
  getPlayerDisplays,
  getRoundWins,
  nextRound,
  reportRoundEnd,
  useFlow,
} from '../../state/flow';
import { setDebugGame, useDebugScreen } from '../../debug';
import { HudFrame, Stamp, Sticker } from '../../components';
import ResultOverlay from './ResultOverlay';
import './game3.css';

/** 물리 키 표기 (키캡 눌림 피드백용) — DEFAULT_KEYBOARD_MAP과 동일 배열 */
const KEY_CHAR: Record<PlayerRole, Record<'key1' | 'key2', string>> = {
  P1: { key1: 'q', key2: 'w' },
  P2: { key1: 'u', key2: 'i' },
};

const MOVE_ICON: Record<Game3Move, string> = { ATTACK: '⚔', DODGE: '🛡', NONE: '…' };
const MOVE_LABEL: Record<Game3Move, string> = { ATTACK: 'ATTACK', DODGE: 'DODGE', NONE: 'PASS' };

/** 라운드 시작 인트로 (3·2·1·EN GARDE — 코인토스 배정 연출 포함) */
const INTRO_STEPS = ['3', '2', '1', 'EN GARDE!'] as const;
const INTRO_STEP_AT_MS = [0, 600, 1200, 1800];
const INTRO_TOTAL_MS = 2300;

/** 장면 가로 배분: 좌우 바다 13% + 플랫폼 74% */
const SEA_PCT = 13;
const PLAT_PCT = 100 - SEA_PCT * 2;

/** 봇(온라인 mock) 행동 — 단순 랜덤 휴리스틱 */
function randomBotMove(): Game3Move {
  const r = Math.random();
  if (r < 0.38) return 'ATTACK';
  if (r < 0.72) return 'DODGE';
  return 'NONE';
}

interface BotPlan {
  window: number;
  move: Game3Move;
  fireAtMs: number;
  fired: boolean;
}

export default function Game3() {
  useDebugScreen('scr-game3');
  const flow = useFlow();
  const navigate = useNavigate();
  const online = flow.mode === 'online';

  const [game, setGame] = useState<Game3State | null>(null);
  /** INTRO_STEPS 인덱스. INTRO_STEPS.length = 인트로 종료 */
  const [introStep, setIntroStep] = useState(0);
  const [pressed, setPressed] = useState<ReadonlySet<string>>(() => new Set<string>());

  const gameRef = useRef<Game3State | null>(null);
  const actionsRef = useRef<Game3Action[]>([]);
  const reportedRef = useRef(false);
  const botRef = useRef<BotPlan>({ window: -1, move: 'NONE', fireAtMs: 0, fired: true });

  // ── 라운드 (재)시작: 새 state + 인트로 ────────────────────────────
  useEffect(() => {
    if (flow.gameId !== 3 || flow.phase !== 'playing') return;
    const s = createGame3State({ roundDurationMs: flow.roundConfig.timePerRoundSec * 1000 });
    gameRef.current = s;
    actionsRef.current = [];
    reportedRef.current = false;
    botRef.current = { window: -1, move: 'NONE', fireAtMs: 0, fired: true };
    setGame(s);
    setDebugGame(s);
    setIntroStep(0);
    const timers: number[] = [];
    for (let i = 1; i < INTRO_STEPS.length; i++) {
      timers.push(window.setTimeout(() => setIntroStep(i), INTRO_STEP_AT_MS[i]));
    }
    timers.push(window.setTimeout(() => setIntroStep(INTRO_STEPS.length), INTRO_TOTAL_MS));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.gameId, flow.currentRound]);

  // ── 언마운트: 디버그 브리지 정리 ──────────────────────────────────
  useEffect(() => () => setDebugGame(null), []);

  // ── 키보드 입력 (down 엣지만 액션, up은 키캡 피드백 해제만) ────────
  useEffect(() => {
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      const ch = KEY_CHAR[ev.player][ev.key];
      if (ev.phase === 'down') {
        setPressed((prev) => {
          const n = new Set(prev);
          n.add(ch);
          return n;
        });
        if (online && ev.player === 'P2') return; // 온라인: P2는 봇 전용
        actionsRef.current.push({
          gameId: 3,
          player: ev.player,
          type: ev.key === 'key1' ? 'ATTACK' : 'DODGE',
        });
      } else {
        setPressed((prev) => {
          const n = new Set(prev);
          n.delete(ch);
          return n;
        });
      }
    });
    return detach;
  }, [online]);

  // ── 게임 루프 (rAF) — 인트로 후, 결과 확정 전까지 ─────────────────
  const running =
    game !== null &&
    game.result === null &&
    introStep >= INTRO_STEPS.length &&
    flow.phase === 'playing';

  useEffect(() => {
    if (!running) return;
    actionsRef.current = []; // 인트로 중 눌린 입력은 버림
    let raf = 0;
    let last = performance.now();
    const flashBotKey = (move: Game3Move) => {
      const ch = move === 'ATTACK' ? 'u' : 'i';
      setPressed((prev) => new Set(prev).add(ch));
      window.setTimeout(() => {
        setPressed((prev) => {
          const n = new Set(prev);
          n.delete(ch);
          return n;
        });
      }, 160);
    };
    const loop = (now: number) => {
      const cur = gameRef.current;
      if (!cur || cur.result !== null) return;
      const dt = Math.min(120, Math.max(0, now - last));
      last = now;
      const actions = actionsRef.current;
      actionsRef.current = [];
      // 봇: 틱 윈도우마다 랜덤 행동을 윈도우 내 랜덤 시점에 1회 입력
      if (online) {
        if (botRef.current.window !== cur.tickCount) {
          botRef.current = {
            window: cur.tickCount,
            move: randomBotMove(),
            fireAtMs: 120 + Math.random() * 700,
            fired: false,
          };
        }
        const bot = botRef.current;
        if (!bot.fired && cur.windowElapsedMs + dt >= bot.fireAtMs) {
          bot.fired = true;
          if (bot.move !== 'NONE') {
            actions.push({ gameId: 3, player: 'P2', type: bot.move });
            flashBotKey(bot.move);
          }
        }
      }
      const next = tickGame3(cur, actions, dt);
      gameRef.current = next;
      setGame(next);
      setDebugGame(next);
      if (next.result === null) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, online]);

  // ── 라운드 종료 보고 (낙하/타임업 연출 0.9초 후 오버레이) ──────────
  useEffect(() => {
    if (!game || game.result === null || reportedRef.current) return;
    reportedRef.current = true;
    const result = game.result;
    const t = window.setTimeout(() => reportRoundEnd(result), 900);
    return () => window.clearTimeout(t);
  }, [game]);

  // ── 가드: 매치 없이 직접 진입 ─────────────────────────────────────
  if (flow.gameId !== 3 || flow.phase === 'idle') return <Navigate to="/" replace />;

  const handleExit = () => {
    exitMatch();
    navigate('/');
  };

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);

  const lastRound =
    flow.roundResults.length > 0 ? flow.roundResults[flow.roundResults.length - 1] : undefined;
  const lastRoundWinner: PlayerRole | null = lastRound ? lastRound.winner : null;
  const matchWinner: PlayerRole | null =
    flow.matchResult === 'P1_WIN' ? 'P1' : flow.matchResult === 'P2_WIN' ? 'P2' : null;

  // ── 장면 렌더 헬퍼 ────────────────────────────────────────────────
  const renderScene = (g: Game3State) => {
    const { view, lastTick } = g;
    const track = view.trackLength;
    const cellX = (cell: number) => SEA_PCT + ((cell + 0.5) / track) * PLAT_PCT;
    const poses: Record<PlayerRole, Game3Move> = lastTick
      ? lastTick.moves
      : { P1: 'NONE', P2: 'NONE' };
    const fellSide = g.resultReason === 'RING_OUT' ? (lastTick?.fell ?? null) : null;
    const tickProgress =
      g.result === null && running
        ? Math.min(1, g.windowElapsedMs / g.config.tickIntervalMs)
        : 0;

    const fencer = (side: PlayerRole) => {
      const cell = side === 'P1' ? view.p1Cell : view.p2Cell;
      const fell = fellSide === side;
      const move = poses[side];
      return (
        <div
          className={`g3-fencer g3-fencer--${side.toLowerCase()}${fell ? ' g3-fencer--fell' : ''}`}
          style={{ left: `${cellX(cell)}%` }}
        >
          {lastTick && (
            <div
              key={`${lastTick.tickIndex}-${side}`}
              className={`g3-bubble g3-bubble--${side.toLowerCase()}`}
            >
              <span className="g3-bubble__icon">{MOVE_ICON[move]}</span>
              <span className="g3-bubble__label">{MOVE_LABEL[move]}</span>
            </div>
          )}
          <div className="g3-figwrap">
            <div className={`g3-figure g3-pose--${move.toLowerCase()}`}>
              <span className="g3-head" />
              <span className="g3-torso" />
              <span className="g3-shield" />
              <span className="g3-sword" />
              <span className="g3-leg g3-leg--a" />
              <span className="g3-leg g3-leg--b" />
            </div>
          </div>
        </div>
      );
    };

    const panel = (side: PlayerRole) => {
      const remaining = Math.max(0, g.players[side].distanceFromEdge);
      const total = g.config.startDistanceFromEdge;
      const hasInput = g.pending[side] !== 'NONE';
      return (
        <div className={`g3-panel g3-panel--${side.toLowerCase()}`}>
          <span className="g3-panel__label">{players[side].name} — 남은 칸</span>
          <span className="g3-panel__chips">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={`g3-cellchip ${
                  i < remaining ? `g3-cellchip--${side.toLowerCase()}` : 'g3-cellchip--lost'
                }`}
              />
            ))}
          </span>
          {running && hasInput && <span className="g3-locked">INPUT LOCKED</span>}
        </div>
      );
    };

    const pushedCell =
      lastTick?.pushed === 'P1' ? view.p1Cell : lastTick?.pushed === 'P2' ? view.p2Cell : null;

    return (
      <div className="g3-root">
        {/* 1초 틱 진행 미터 */}
        <div className="g3-meterwrap">
          <div className="g3-meter">
            <span className="g3-meter__label">Judge Tick</span>
            <span className="g3-meter__bar">
              <span className="g3-meter__fill" style={{ width: `${tickProgress * 100}%` }} />
            </span>
            <span className="g3-meter__count">#{g.tickCount + (g.result === null ? 1 : 0)}</span>
          </div>
        </div>

        <div className="g3-scene">
          {/* 남은 칸 패널 + 입력 접수 표시 */}
          {panel('P1')}
          {panel('P2')}

          {/* 바다 */}
          <div className="g3-sea">
            <div className="g3-wave g3-wave--1" />
            <div className="g3-wave g3-wave--2" />
            <div className="g3-wave g3-wave--3" />
          </div>

          {/* 피스트(플랫폼): 칸 눈금 + 해저드 끝단 */}
          <div className="g3-platform" style={{ left: `${SEA_PCT}%`, right: `${SEA_PCT}%` }}>
            <div className="g3-platform__top">
              {Array.from({ length: track }, (_, i) => (
                <span
                  key={i}
                  className={`g3-cell ${i < track / 2 ? 'g3-cell--p1' : 'g3-cell--p2'}`}
                >
                  <span className="g3-cell__num">{i + 1}</span>
                </span>
              ))}
            </div>
            <span className="g3-edge g3-edge--l hazard" />
            <span className="g3-edge g3-edge--r hazard" />
          </div>

          {/* 검객 2명 */}
          {fencer('P1')}
          {fencer('P2')}

          {/* 밀림 먼지 */}
          {lastTick?.pushed && !lastTick.fell && pushedCell !== null && (
            <div
              key={`dust-${lastTick.tickIndex}`}
              className="g3-dust"
              style={{ left: `${cellX(pushedCell)}%` }}
            >
              <span />
              <span />
            </div>
          )}

          {/* 링아웃 물기둥 */}
          {fellSide !== null && (
            <div
              className="g3-splash"
              style={{ left: `${cellX(fellSide === 'P1' ? view.p1Cell : view.p2Cell)}%` }}
            >
              <span />
              <span />
              <span />
            </div>
          )}

          {/* 틱 판정 연출: 밀림 = TOUCHÉ (승자색) / 동일 행동 = CLASH */}
          {g.result === null && lastTick && lastTick.pushed && (
            <div key={`fx-${lastTick.tickIndex}`} className="g3-fx">
              <Stamp tone={lastTick.pushed === 'P1' ? 'p2' : 'p1'} tilt={-15} fontSize={34}>
                TOUCHÉ!
              </Stamp>
            </div>
          )}
          {g.result === null && lastTick && lastTick.clash && lastTick.moves.P1 !== 'NONE' && (
            <div key={`fx-${lastTick.tickIndex}`} className="g3-fx g3-fx--clash">
              <span className="g3-clash-swords">⚔⚔</span>
              <Sticker tilt={-4} bg="var(--highlight)" fontSize={16}>
                CLASH
              </Sticker>
            </div>
          )}

          {/* 종료 판정 배너: 링아웃 / 시간 종료 */}
          {g.result !== null && (
            <div className="g3-fx g3-fx--end">
              <Stamp tone="accent" tilt={-8} fontSize={44}>
                {g.resultReason === 'RING_OUT' ? 'RING OUT!' : "TIME'S UP!"}
              </Stamp>
            </div>
          )}
        </div>

        {/* 라운드 시작 인트로 */}
        {introStep < INTRO_STEPS.length && (
          <div className="g3-intro">
            <div key={introStep}>
              <Stamp
                tone={introStep === INTRO_STEPS.length - 1 ? 'accent' : 'ink'}
                tilt={-6}
                fontSize={64}
              >
                {INTRO_STEPS[introStep]}
              </Stamp>
            </div>
            <span className="g3-intro__hint label-caps">
              {online
                ? `${players.P1.name} (Q·W) vs ${players.P2.name} — BOT`
                : `COIN TOSS — LEFT: ${players.P1.name} (Q·W) / RIGHT: ${players.P2.name} (U·I)`}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="screen" data-testid="scr-game3">
      {game && (
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          timeRemainingMs={game.view.timeRemainingMs}
          timeTotalMs={flow.roundConfig.timePerRoundSec * 1000}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={flow.currentRound}
          keyIcons={{ p1: ['⚔', '🛡'], p2: ['⚔', '🛡'] }}
          pressedKeys={pressed}
          onExit={handleExit}
        >
          {renderScene(game)}

          {flow.phase === 'round-result' && (
            <ResultOverlay
              kind="round"
              winner={lastRoundWinner}
              p1Name={players.P1.name}
              p2Name={players.P2.name}
              onNextRound={() => nextRound()}
              onBackToMain={handleExit}
            />
          )}
          {flow.phase === 'match-result' && (
            <ResultOverlay
              kind="match"
              winner={matchWinner}
              p1Name={players.P1.name}
              p2Name={players.P2.name}
              onBackToMain={handleExit}
            />
          )}
        </HudFrame>
      )}
    </div>
  );
}
