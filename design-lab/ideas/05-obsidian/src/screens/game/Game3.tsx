/**
 * S12 게임3 — 펜싱 "심해 위의 결투장" (scr-game3). 소유: game3 에이전트.
 * SPEC S12 + PLAN §2.S12/§3.3 준수.
 *
 * 로직: @shared createGame3State / tickGame3 — 재구현 금지.
 *   roundDurationMs = settings.timePerRoundSec * 1000 (QA-S4-06).
 * 입력: attachKeyboardAdapter — playerL q(공격)/w(회피), playerR u/i.
 *   틱 윈도우 내 마지막 입력 채택은 shared state.pending이 처리.
 * 온라인(mock): isBotMatch() → P2 봇 — 틱 윈도우마다 랜덤 행동을 랜덤 시점에 주입.
 * 브리지: 매 프레임 reportGame(state), 언마운트 reportGame(null).
 * 라운드 종료: reportRoundResult → ResultOverlay(import만, 계약 동결).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  attachKeyboardAdapter,
  createGame3State,
  tickGame3,
  DEFAULT_KEYBOARD_MAP,
  type Game3Action,
  type Game3Move,
  type Game3State,
  type MatchResult,
  type PlayerRole,
} from '@shared';
import { Button, KeyCap, PlayerBadge } from '../../components';
import { ResultOverlay } from './ResultOverlay';
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
import './game3.css';

type Phase = 'pre' | 'play' | 'end';

const GLOW = {
  p1: 'rgba(0, 240, 255, 0.55)',
  p2: 'rgba(255, 51, 88, 0.55)',
} as const;

/* -------------------------------------------------------------------------
 * 네온 스틱 파이터 — 포즈 3종 (공격=런지 / 회피=방패 웅크림 / 무행동=중립).
 * P1 기준 우향(오른쪽 상대를 향함), P2는 scaleX(-1) 미러 (game3.css).
 * ------------------------------------------------------------------------- */
function StickFighter({ side, move }: { side: 'p1' | 'p2'; move: Game3Move }) {
  const color = side === 'p1' ? 'var(--p1)' : 'var(--p2)';
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg
      width="92"
      height="88"
      viewBox="0 0 92 88"
      aria-hidden="true"
      style={{ filter: `drop-shadow(0 0 6px ${GLOW[side]})` }}
    >
      {move === 'ATTACK' ? (
        /* 런지: 전방 돌진 + 검 수평 찌르기 */
        <g {...common}>
          <circle cx="52" cy="22" r="7" />
          <polyline points="52,29 40,50" />
          <polyline points="50,33 66,30" />
          <line x1="66" y1="30" x2="88" y2="27" strokeWidth="2.4" />
          <line x1="66" y1="23" x2="67" y2="37" />
          <polyline points="50,35 38,41" />
          <polyline points="40,50 58,62 58,84" />
          <polyline points="40,50 22,70 15,84" />
        </g>
      ) : move === 'DODGE' ? (
        /* 방패 웅크림: 낮은 자세 + 전방 방패 아크 */
        <g {...common}>
          <circle cx="34" cy="33" r="7" />
          <polyline points="34,40 31,58" />
          <polyline points="33,46 46,50" />
          <path d="M 52 30 A 21 21 0 0 1 52 70" strokeWidth="2.4" />
          <line x1="52" y1="30" x2="52" y2="70" />
          <polyline points="33,47 24,55" />
          <polyline points="31,58 20,68 22,84" />
          <polyline points="31,58 41,68 39,84" />
        </g>
      ) : (
        /* 중립 스탠스: 검을 비껴 든 대기 자세 */
        <g {...common}>
          <circle cx="40" cy="17" r="7" />
          <polyline points="40,24 40,52" />
          <polyline points="40,31 30,43" />
          <polyline points="40,31 52,41" />
          <line x1="52" y1="41" x2="67" y2="26" strokeWidth="2.4" />
          <line x1="49" y1="36" x2="57" y2="44" />
          <polyline points="40,52 30,68 28,84" />
          <polyline points="40,52 48,68 51,84" />
        </g>
      )}
    </svg>
  );
}

/* 틱 공개 칩 라인 아이콘 — 검 / 방패 / 무행동 */
function MoveIcon({ move }: { move: Game3Move }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
  };
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      {move === 'ATTACK' ? (
        <g {...common}>
          <line x1="5" y1="19" x2="18" y2="6" />
          <line x1="11" y1="5" x2="19" y2="13" />
        </g>
      ) : move === 'DODGE' ? (
        <g {...common}>
          <path d="M 9 4 A 12.5 12.5 0 0 1 9 20" />
          <line x1="9" y1="4" x2="9" y2="20" />
        </g>
      ) : (
        <g {...common} strokeDasharray="3 3">
          <line x1="5" y1="12" x2="19" y2="12" />
        </g>
      )}
    </svg>
  );
}

const MOVE_KO: Record<Game3Move, string> = {
  ATTACK: '공격',
  DODGE: '회피',
  NONE: '무행동',
};

interface OverlayInfo {
  roundWinner: PlayerRole | null;
  matchResult: MatchResult | null;
}

export default function Game3() {
  useScreenBridge('scr-game3');
  const navigate = useNavigate();
  const flow = useFlow();
  const session = useSession();

  useEffect(() => {
    ensureMatch(3);
  }, []);

  const online = flow.mode === 'online';
  const p1Name = online ? (session.user?.nickname ?? 'PLAYER 1') : 'PLAYER 1';
  const p2Name = online ? (flow.opponent?.nickname ?? 'BOT') : 'PLAYER 2';

  const [phase, setPhase] = useState<Phase>('pre');
  const [preCount, setPreCount] = useState(3);
  const [game, setGame] = useState<Game3State | null>(null);
  const [pressed, setPressed] = useState({ q: false, w: false, u: false, i: false });
  const [overlay, setOverlay] = useState<OverlayInfo | null>(null);

  const stateRef = useRef<Game3State | null>(null);
  const inputsRef = useRef<Game3Action[]>([]);
  const reportedRef = useRef(false);
  const overlayTimerRef = useRef(0);

  // 언마운트 시 브리지/오버레이 타이머 정리
  useEffect(
    () => () => {
      reportGame(null);
      window.clearTimeout(overlayTimerRef.current);
    },
    [],
  );

  const exitToMain = useCallback(() => {
    resetFlow();
    navigate('/');
  }, [navigate]);

  // [ESC] 나가기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitToMain();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exitToMain]);

  // 시작 카운트다운 3·2·1
  useEffect(() => {
    if (phase !== 'pre') return;
    setPreCount(3);
    let n = 3;
    const iv = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(iv);
        setPhase('play');
      } else {
        setPreCount(n);
      }
    }, 800);
    return () => window.clearInterval(iv);
  }, [phase]);

  // 키보드 입력 (q/w vs u/i) — 봇 매치에선 P2 키 입력 무시
  useEffect(() => {
    if (phase !== 'play') return;
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      if (isBotMatch() && ev.player === 'P2') return;
      const physical = (
        ev.player === 'P1' ? (ev.key === 'key1' ? 'q' : 'w') : ev.key === 'key1' ? 'u' : 'i'
      ) as 'q' | 'w' | 'u' | 'i';
      setPressed((p) => ({ ...p, [physical]: ev.phase === 'down' }));
      if (ev.phase !== 'down') return;
      inputsRef.current.push({
        gameId: 3,
        player: ev.player,
        type: ev.key === 'key1' ? 'ATTACK' : 'DODGE',
      });
    });
    return detach;
  }, [phase]);

  // 게임 루프 — rAF, shared tickGame3에 위임
  useEffect(() => {
    if (phase !== 'play') return;
    const { timePerRoundSec } = flow.settings;
    const initial = createGame3State({ roundDurationMs: timePerRoundSec * 1000 });
    stateRef.current = initial;
    inputsRef.current = [];
    reportedRef.current = false;
    setGame(initial);
    reportGame(initial);

    // 봇 계획: 틱 윈도우마다 행동/시점을 한 번 뽑는다 (온라인 mock)
    const bot = { forTick: -1, atMs: 0, move: 'NONE' as Game3Move, done: true };

    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const prev = stateRef.current;
      if (!prev) return;
      const dt = Math.min(100, Math.max(0, now - last));
      last = now;

      if (isBotMatch()) {
        if (bot.forTick !== prev.tickCount) {
          bot.forTick = prev.tickCount;
          const r = Math.random();
          // 벼랑 끝에 몰리면 무행동 확률을 줄이는 간단 휴리스틱
          const cornered = prev.players.P2.distanceFromEdge <= 1;
          bot.move = r < 0.4 ? 'ATTACK' : r < (cornered ? 0.9 : 0.75) ? 'DODGE' : 'NONE';
          bot.atMs = 120 + Math.random() * 680;
          bot.done = bot.move === 'NONE';
        }
        if (!bot.done && prev.windowElapsedMs + dt >= bot.atMs) {
          inputsRef.current.push({
            gameId: 3,
            player: 'P2',
            type: bot.move as 'ATTACK' | 'DODGE',
          });
          bot.done = true;
        }
      }

      const inputs = inputsRef.current;
      inputsRef.current = [];
      const next = tickGame3(prev, inputs, dt);
      stateRef.current = next;
      setGame(next);
      reportGame(next);

      if (next.result !== null) {
        // 라운드 확정 — 1회만 보고, 낙하 연출 시간만큼 오버레이 지연
        if (!reportedRef.current) {
          reportedRef.current = true;
          setPhase('end');
          const winner: PlayerRole | null =
            next.result === 'P1_WIN' ? 'P1' : next.result === 'P2_WIN' ? 'P2' : null;
          const { matchResult } = reportRoundResult(winner);
          const delay = next.resultReason === 'RING_OUT' ? 1050 : 450;
          overlayTimerRef.current = window.setTimeout(
            () => setOverlay({ roundWinner: winner, matchResult }),
            delay,
          );
        }
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // ※ 오버레이 지연 타이머는 여기서 정리하지 않는다 — setPhase('end')가
    //   이 effect의 cleanup을 곧바로 발동시키기 때문 (타이머 정리는 언마운트 시).
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleNextRound = () => {
    setOverlay(null);
    setGame(null);
    stateRef.current = null;
    setPressed({ q: false, w: false, u: false, i: false });
    beginNextRound();
    setPhase('pre');
  };

  // --- 파생 렌더 값 --------------------------------------------------------
  const settings = flow.settings;
  const score = getScore(flow.roundResults);
  const view = game?.view ?? null;
  const trackLength = view?.trackLength ?? 8;
  const p1Cell = view?.p1Cell ?? Math.floor((trackLength - 2) / 2);
  const p2Cell = view?.p2Cell ?? trackLength - 1 - Math.floor((trackLength - 2) / 2);
  const secondsLeft = view ? Math.ceil(view.timeRemainingMs / 1000) : settings.timePerRoundSec;
  const danger = phase === 'play' && view !== null && view.timeRemainingMs <= 5000;

  const lastTick = game?.lastTick ?? null;
  const p1Move: Game3Move = lastTick?.moves.P1 ?? 'NONE';
  const p2Move: Game3Move = lastTick?.moves.P2 ?? 'NONE';
  const fell: PlayerRole | null =
    game?.resultReason === 'RING_OUT' ? (game.result === 'P1_WIN' ? 'P2' : 'P1') : null;
  const fellCell = fell === 'P1' ? p1Cell : p2Cell;

  const pending = game?.pending ?? { P1: 'NONE' as Game3Move, P2: 'NONE' as Game3Move };
  const tickPct = game ? (game.windowElapsedMs / game.config.tickIntervalMs) * 100 : 0;

  // 밀림 플래시 대상 칸 (낙사면 트랙 밖 → 플래시 생략)
  const flashCell =
    lastTick && lastTick.pushed && !lastTick.fell
      ? lastTick.pushed === 'P1'
        ? p1Cell
        : p2Cell
      : null;

  const cellLeftPct = (cell: number) => ((cell + 0.5) / trackLength) * 100;

  return (
    <div className="screen" data-testid="scr-game3">
      {/* HUD */}
      <div className="g3-hud">
        <PlayerBadge
          side="p1"
          name={p1Name}
          you={online}
          wins={score.p1Wins}
          totalRounds={settings.roundCount}
          testId="hud-profile-p1"
        />
        <div className="g3-hud-center">
          <span className="overline">
            ROUND {flow.roundIndex + 1} / {settings.roundCount}
          </span>
          <span
            key={secondsLeft}
            className={`num count-pop g3-countdown${danger ? ' g3-countdown--danger' : ''}`}
            data-testid="hud-countdown"
          >
            {secondsLeft}
          </span>
          <span className="overline" style={{ color: 'var(--text-lo)' }}>
            TIME REMAINING
          </span>
        </div>
        <PlayerBadge
          side="p2"
          name={p2Name}
          wins={score.p2Wins}
          totalRounds={settings.roundCount}
          testId="hud-profile-p2"
        />
      </div>

      <div className="g3-exit-row">
        <Button variant="ghost" testId="btn-exit" onClick={exitToMain}>
          [ESC] 나가기
        </Button>
      </div>

      {/* 스테이지 */}
      <div className="g3-stage-wrap">
        <div className={`g3-stage brackets${danger ? ' heartbeat' : ''}`} data-testid="game-stage">
          <span className="g3-sideline g3-sideline--p1" />
          <span className="g3-sideline g3-sideline--p2" />

          {/* 1초 틱 진행 표시 */}
          <div className="g3-tick">
            <span className="overline" style={{ fontSize: 10, color: 'var(--text-lo)' }}>
              TICK {game ? game.tickCount + 1 : 1}
            </span>
            <span className="g3-tickbar">
              <i style={{ width: `${Math.min(100, tickPct)}%` }} />
            </span>
          </div>

          {/* 틱 판정 공개 연출 */}
          {lastTick && (
            <div className="g3-reveal" key={lastTick.tickIndex}>
              <span className={`g3-chip g3-chip--p1${lastTick.pushed === 'P1' ? ' g3-chip--lose' : ''}`}>
                <MoveIcon move={lastTick.moves.P1} />
              </span>
              <span className="g3-verdict">
                {lastTick.clash ? (
                  <>
                    <span className="overline" style={{ color: 'var(--text-hi)' }}>
                      CLASH
                    </span>
                    <span className="g3-verdict-ko">동일 행동 — 밀림 없음</span>
                  </>
                ) : (
                  <>
                    <span
                      className="overline"
                      style={{ color: lastTick.pushed === 'P1' ? 'var(--p2)' : 'var(--p1)' }}
                    >
                      {lastTick.fell ? 'RING OUT' : `PUSH // ${lastTick.pushed}`}
                    </span>
                    <span className="g3-verdict-ko">
                      {MOVE_KO[lastTick.moves[lastTick.pushed === 'P1' ? 'P2' : 'P1']]} 승 —{' '}
                      {lastTick.pushed} {lastTick.fell ? '낙하!' : '1칸 밀림'}
                    </span>
                  </>
                )}
              </span>
              <span className={`g3-chip g3-chip--p2${lastTick.pushed === 'P2' ? ' g3-chip--lose' : ''}`}>
                <MoveIcon move={lastTick.moves.P2} />
              </span>
            </div>
          )}

          {/* 아레나: 심해 + 피스트 + 파이터 */}
          <div className="g3-scene">
            <div className="g3-sea">
              <span className="g3-wave" style={{ top: '22%' }} />
              <span className="g3-wave" style={{ top: '48%', animationDelay: '-1.6s' }} />
              <span className="g3-wave" style={{ top: '74%', animationDelay: '-3.1s' }} />
            </div>

            <div className="g3-platform">
              {Array.from({ length: trackLength }, (_, i) => {
                const dangerCell =
                  (i === 0 && game !== null && game.players.P1.distanceFromEdge <= 1) ||
                  (i === trackLength - 1 && game !== null && game.players.P2.distanceFromEdge <= 1);
                return (
                  <span key={i} className={`g3-cell${dangerCell ? ' g3-cell--danger' : ''}`}>
                    {flashCell === i && lastTick && (
                      <span
                        key={lastTick.tickIndex}
                        className="g3-cell-flash"
                        style={{
                          ['--g3-flash' as string]:
                            lastTick.pushed === 'P1' ? 'var(--p1)' : 'var(--p2)',
                        }}
                      />
                    )}
                  </span>
                );
              })}

              {/* P1 파이터 (시안, 우향) */}
              <div
                className={`g3-fighter${fell === 'P1' ? ' g3-fighter--fell' : ''}`}
                style={{ left: `${cellLeftPct(p1Cell)}%` }}
              >
                <div className="g3-fighter-inner">
                  <StickFighter side="p1" move={p1Move} />
                </div>
              </div>
              {/* P2 파이터 (마젠타, 좌향 미러) */}
              <div
                className={`g3-fighter g3-fighter--p2${fell === 'P2' ? ' g3-fighter--fell' : ''}`}
                style={{ left: `${cellLeftPct(p2Cell)}%` }}
              >
                <div className="g3-fighter-inner">
                  <StickFighter side="p2" move={p2Move} />
                </div>
              </div>

              {/* 링아웃 물결 링 */}
              {fell && (
                <div className="g3-ripples" style={{ left: `${cellLeftPct(fellCell)}%` }}>
                  <i />
                  <i />
                </div>
              )}
            </div>
          </div>

          {/* 시작 카운트다운 오버레이 */}
          {phase === 'pre' && (
            <div className="g3-pre">
              <span className="overline">
                ROUND {flow.roundIndex + 1} // EN GARDE
              </span>
              <span key={preCount} className="display num g3-pre-num count-pop">
                {preCount}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-md)' }}>
                공격은 회피에, 회피는 무행동에, 무행동은 공격에 밀립니다
              </span>
            </div>
          )}

          {/* 라운드/매치 결과 (계약 동결 — import만) */}
          <ResultOverlay
            open={overlay !== null}
            roundWinner={overlay?.roundWinner ?? null}
            matchResult={overlay?.matchResult ?? null}
            roundNumber={flow.roundIndex + 1}
            p1Name={p1Name}
            p2Name={p2Name}
            onNextRound={handleNextRound}
            onBackMain={exitToMain}
          />
        </div>
      </div>

      {/* 하단 키패드 — 실제 배정 키 표기 (SPEC Q2) */}
      <div className="g3-pads">
        <div className="g3-pad">
          <span className="chip chip--p1">P1{online ? ' · YOU' : ''}</span>
          <KeyCap label="Q" desc="공격" side="p1" active={pressed.q || pending.P1 === 'ATTACK'} />
          <KeyCap label="W" desc="회피" side="p1" active={pressed.w || pending.P1 === 'DODGE'} />
        </div>
        <span className="overline" style={{ color: 'var(--text-lo)' }}>
          LAST INPUT WINS THE TICK
        </span>
        <div className="g3-pad">
          <span className="chip chip--p2">P2{online ? ' · BOT' : ''}</span>
          <KeyCap label="U" desc="공격" side="p2" active={pressed.u || pending.P2 === 'ATTACK'} />
          <KeyCap label="I" desc="회피" side="p2" active={pressed.i || pending.P2 === 'DODGE'} />
        </div>
      </div>
    </div>
  );
}
