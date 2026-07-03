/**
 * S9. 게임1 인게임 — 숫자 맞추기 (scr-game1)
 * [OWNER: game1 에이전트] — 이 파일은 game1 에이전트만 수정한다.
 *
 * 구현 (SPEC S9 / PLAN §2-S9·§3.1):
 *  - @shared createGame1State + tick — 로직 재구현 없음, rAF 루프에서 tick만 호출
 *  - 입력: attachKeyboardAdapter(q/w vs u/i), down 엣지만 액션화 (홀드 리핏 없음)
 *  - 온라인 모드: P2는 봇 — 타겟으로 서서히 수렴하는 휴리스틱 (가끔 실수)
 *  - HudFrame(hud-countdown/hud-profile-p1·p2/game-stage/btn-exit/키캡) + ResultOverlay
 *  - 매 틱 setDebugGame(state), 언마운트 시 setDebugGame(null)
 *  - 연출(§3.1): 3연 숫자 구도, 숫자 변경 하드 스텝 + 튕김, 근접(≤5 accent / ≤2 셰이크),
 *    일치 유지 3초 = "LOCKED" 스탬프 3칸 차징, 이탈 시 깨짐, "PUMP IT" 워터마크
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  attachKeyboardAdapter,
  createGame1State,
  DEFAULT_KEYBOARD_MAP,
  game1ActionFromKey,
  tick,
} from '@shared';
import type { Game1Action, Game1State, PlayerRole } from '@shared';
import {
  exitMatch,
  getPlayerDisplays,
  getRoundWins,
  nextRound,
  reportRoundEnd,
  useFlow,
} from '../../state/flow';
import { HudFrame, Stamp, Sticker } from '../../components';
import { setDebugGame, useDebugScreen } from '../../debug';
import ResultOverlay from './ResultOverlay';

const CSS = `
.g1-inner {
  /* game-stage(position:relative)를 확실히 가득 채우도록 절대 배치 */
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  overflow: hidden;
  background: var(--surface-sunken);
}
.g1-watermark {
  position: absolute;
  font-family: var(--font-display);
  font-size: 18vw;
  line-height: 1;
  color: transparent;
  -webkit-text-stroke: 3px rgba(10, 10, 10, 0.05);
  transform: rotate(-12deg);
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
}
.g1-row {
  display: flex;
  align-items: center;
  gap: 40px;
  z-index: 1;
}
.g1-target {
  position: relative;
  background: var(--ink);
  color: var(--bg);
  border: var(--border-w-hero) solid var(--ink);
  box-shadow: var(--shadow-lg);
  padding: 20px 36px 26px;
  min-width: 280px;
  text-align: center;
}
.g1-target__sticker {
  position: absolute;
  top: -16px;
  left: -20px;
}
.g1-target__num {
  font-family: var(--font-display);
  font-size: 168px;
  line-height: 1;
  display: block;
}
.g1-card {
  position: relative;
  width: 230px;
  border: var(--border-w-hero) solid var(--p1);
  background: var(--p1-tint);
  box-shadow: 8px 8px 0 var(--ink);
  padding: 14px 12px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: border-color var(--dur-fast) linear;
}
.g1-card--p2 {
  border-color: var(--p2);
  background: var(--p2-tint);
}
.g1-card--near {
  border-color: var(--accent);
}
.g1-card--hot {
  animation: g1-shake 140ms steps(2) infinite;
}
.g1-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
}
.g1-card__num {
  font-family: var(--font-display);
  font-size: 112px;
  line-height: 1;
}
.g1-card__num--up {
  animation: g1-bump-up 140ms var(--ease-snap);
}
.g1-card__num--down {
  animation: g1-bump-down 140ms var(--ease-snap);
}
/* 일치 유지 차징 스탬프 (§3.1 "LOCKED") */
.g1-lock {
  position: absolute;
  top: -20px;
  right: -14px;
  transform: rotate(-8deg);
  border: var(--border-w) solid var(--ink);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-display);
  font-size: 14px;
  animation: stamp-in 200ms var(--ease-snap);
}
.g1-lock--done {
  background: var(--win);
  color: var(--surface);
}
.g1-lock__cells {
  display: inline-flex;
  gap: 3px;
}
.g1-lock__cell {
  width: 14px;
  height: 14px;
  border: 2px solid var(--ink);
  background: var(--surface);
  position: relative;
  overflow: hidden;
}
.g1-lock__cell-fill {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
}
/* 이탈 시 스탬프 깨짐 (§3.1) */
.g1-lock-break {
  position: absolute;
  top: -20px;
  right: -14px;
  font-family: var(--font-display);
  font-size: 15px;
  border: var(--border-w) solid var(--error);
  color: var(--error);
  background: var(--surface);
  padding: 4px 8px;
  pointer-events: none;
  animation: g1-lock-break 420ms var(--ease-snap) forwards;
}
.g1-hint {
  z-index: 1;
  color: var(--ink-muted);
}
.g1-intro {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 10;
}
@keyframes g1-bump-up {
  from { transform: translateY(-4px); }
  to   { transform: translateY(0); }
}
@keyframes g1-bump-down {
  from { transform: translateY(4px); }
  to   { transform: translateY(0); }
}
@keyframes g1-shake {
  from { transform: translate(-1px, 0); }
  to   { transform: translate(1px, 0); }
}
@keyframes g1-lock-break {
  from { transform: rotate(-8deg) translateY(0); opacity: 1; }
  to   { transform: rotate(18deg) translateY(34px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .g1-card--hot, .g1-card__num--up, .g1-card__num--down, .g1-lock {
    animation: none;
  }
  /* 깨짐 연출은 애니메이션 없이는 잔상만 남으므로 아예 표시하지 않음 */
  .g1-lock-break {
    display: none;
  }
}
`;

/** 매핑된 입력 → 물리 키 문자 (키캡 눌림 피드백용) */
function physicalChar(player: PlayerRole, key: 'key1' | 'key2'): string {
  const side = player === 'P1' ? DEFAULT_KEYBOARD_MAP.playerL : DEFAULT_KEYBOARD_MAP.playerR;
  return key === 'key1' ? side.key1 : side.key2;
}

interface BumpFx {
  seq: number;
  dir: 'up' | 'down';
}

export default function Game1() {
  useDebugScreen('scr-game1');
  const flow = useFlow();
  const navigate = useNavigate();
  const online = flow.mode === 'online';

  const [game, setGame] = useState<Game1State | null>(null);
  const gameRef = useRef<Game1State | null>(null);
  const pendingRef = useRef<Game1Action[]>([]);
  const frameRef = useRef(0);
  const reportedRef = useRef(false);
  const botAccRef = useRef(0);
  const botNextRef = useRef(320);
  const [pressed, setPressed] = useState<ReadonlySet<string>>(() => new Set());
  const [bump, setBump] = useState<Record<PlayerRole, BumpFx>>({
    P1: { seq: 0, dir: 'up' },
    P2: { seq: 0, dir: 'up' },
  });
  const [lockBreak, setLockBreak] = useState<Record<PlayerRole, number>>({ P1: 0, P2: 0 });

  // 라운드 시작: 새 state 생성 + rAF 틱 루프 (phase가 playing으로 진입할 때마다)
  useEffect(() => {
    if (flow.gameId !== 1 || flow.phase !== 'playing') return;
    const s0 = createGame1State(flow.roundConfig, Math.random);
    gameRef.current = s0;
    pendingRef.current = [];
    frameRef.current = 0;
    reportedRef.current = false;
    botAccRef.current = 0;
    setGame(s0);
    setDebugGame(s0);
    setLockBreak({ P1: 0, P2: 0 }); // 지난 라운드의 깨짐 연출 잔상 제거

    // rAF 대신 setInterval: 백그라운드 탭(rAF 정지)에서도 게임 시계가 흐르도록.
    // dt는 실측(performance.now) 무제한 — 탭 스로틀링으로 wake 간격이 아무리 벌어져도
    // 게임 시계는 벽시계와 동일하게 경과한다 (@shared tick은 큰 dt도 정상 처리).
    let last = performance.now();
    const step = () => {
      const s = gameRef.current;
      if (!s || s.result !== null) return;
      const now = performance.now();
      const dt = Math.max(0, now - last);
      last = now;

      // 온라인 mock: P2 봇 — 일정 간격으로 타겟을 향해 1칸씩 수렴 (12% 확률로 실수)
      if (online) {
        botAccRef.current += dt;
        if (botAccRef.current >= botNextRef.current) {
          botAccRef.current = 0;
          botNextRef.current = 180 + Math.random() * 280;
          const bot = s.players.P2;
          if (bot.value !== s.target) {
            const toward: Game1Action['type'] =
              s.target > bot.value ? 'INCREMENT' : 'DECREMENT';
            const mistake = Math.random() < 0.12;
            pendingRef.current.push({
              gameId: 1,
              player: 'P2',
              type: mistake ? (toward === 'INCREMENT' ? 'DECREMENT' : 'INCREMENT') : toward,
            });
          }
        }
      }

      const actions = pendingRef.current;
      pendingRef.current = [];
      frameRef.current += 1;
      const next = tick(s, { frame: frameRef.current, elapsedMs: s.elapsedMs, actions }, dt);

      // 연출 트리거: 숫자 변경 튕김 / LOCKED 이탈 깨짐 (로직 비침범 — 표시 전용)
      for (const role of ['P1', 'P2'] as const) {
        const prev = s.players[role];
        const cur = next.players[role];
        if (cur.value !== prev.value) {
          const dir: BumpFx['dir'] = cur.value > prev.value ? 'up' : 'down';
          setBump((b) => ({ ...b, [role]: { seq: b[role].seq + 1, dir } }));
        }
        if (prev.holdMs > 0 && cur.holdMs === 0 && next.result === null) {
          setLockBreak((l) => ({ ...l, [role]: l[role] + 1 }));
        }
      }

      gameRef.current = next;
      setGame(next);
      setDebugGame(next);
      if (next.result !== null) clearInterval(timer);
    };
    const timer = setInterval(step, 33);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.gameId, flow.phase, flow.currentRound, online]);

  // 키보드: q/w(P1) vs u/i(P2). down 엣지만 액션, up은 키캡 피드백 해제만
  useEffect(() => {
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      const char = physicalChar(ev.player, ev.key);
      setPressed((prev) => {
        const nextSet = new Set(prev);
        if (ev.phase === 'down') nextSet.add(char);
        else nextSet.delete(char);
        return nextSet;
      });
      if (ev.phase !== 'down') return;
      if (online && ev.player === 'P2') return; // 온라인: P2는 봇 전담
      const s = gameRef.current;
      if (!s || s.result !== null) return;
      pendingRef.current.push(game1ActionFromKey(ev.player, ev.key));
    });
    return detach;
  }, [online]);

  // 라운드 종료 보고 (state.result 확정 → flow가 다승제/매치 종료 판정)
  useEffect(() => {
    if (!game || game.result === null || reportedRef.current) return;
    reportedRef.current = true;
    reportRoundEnd(game.result);
  }, [game]);

  // 언마운트: 디버그 브리지 정리
  useEffect(() => () => setDebugGame(null), []);

  // 매치 컨텍스트 없이 직접 진입(URL) 시 메인으로
  if (flow.gameId !== 1 || flow.phase === 'idle') return <Navigate to="/" replace />;

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const totalMs = flow.roundConfig.timePerRoundSec * 1000;
  const onExit = () => {
    exitMatch();
    navigate('/');
  };

  const lastRoundWinner: PlayerRole | null =
    flow.roundResults.length > 0 ? flow.roundResults[flow.roundResults.length - 1].winner : null;
  const matchWinner: PlayerRole | null =
    flow.matchResult === 'P1_WIN' ? 'P1' : flow.matchResult === 'P2_WIN' ? 'P2' : null;

  const numberCard = (side: PlayerRole) => {
    if (!game) return null;
    const d = game.derived[side];
    const disp = players[side];
    const near = !d.matched && Math.abs(d.diff) <= 5;
    const hot = !d.matched && Math.abs(d.diff) <= 2;
    const fx = bump[side];
    const sideColor = side === 'P1' ? 'var(--p1)' : 'var(--p2)';
    // LOCKED 차징: 3칸(1초 단위), holdProgress 0~1 → 칸별 채움 비율
    const cellFill = [0, 1, 2].map((i) =>
      Math.max(0, Math.min(1, d.holdProgress * 3 - i)),
    );
    return (
      <div
        className={[
          'g1-card',
          side === 'P2' ? 'g1-card--p2' : '',
          near ? 'g1-card--near' : '',
          hot ? 'g1-card--hot' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="g1-card__head">
          <span className="label-caps" style={{ color: sideColor, fontWeight: 700 }}>
            {side} · {disp.name}
          </span>
          {disp.isYou && (
            <Sticker tilt={-6} bg="var(--highlight)" fontSize={11} style={{ padding: '1px 6px' }}>
              THIS IS YOU
            </Sticker>
          )}
        </div>
        <span key={fx.seq} className={`g1-card__num g1-card__num--${fx.dir}`}>
          {game.players[side].value}
        </span>
        {d.matched && (
          <span className={`g1-lock${d.holdProgress >= 1 ? ' g1-lock--done' : ''}`}>
            LOCKED
            <span className="g1-lock__cells">
              {cellFill.map((f, i) => (
                <span key={i} className="g1-lock__cell">
                  <span
                    className="g1-lock__cell-fill"
                    style={{ height: `${f * 100}%`, background: sideColor }}
                  />
                </span>
              ))}
            </span>
          </span>
        )}
        {!d.matched && lockBreak[side] > 0 && (
          <span key={lockBreak[side]} className="g1-lock-break">
            LOCKED
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="screen" data-testid="scr-game1">
      <style>{CSS}</style>
      <HudFrame
        p1={players.P1}
        p2={players.P2}
        timeRemainingMs={game ? game.derived.timeRemainingMs : totalMs}
        timeTotalMs={totalMs}
        roundWins={wins}
        roundCount={flow.roundConfig.roundCount}
        currentRound={flow.currentRound}
        onExit={onExit}
        keyIcons={{ p1: ['↓', '↑'], p2: ['↓', '↑'] }}
        pressedKeys={pressed}
      >
        <div className="g1-inner">
          <span className="g1-watermark">PUMP IT</span>
          {game && (
            <>
              <div className="g1-row">
                {numberCard('P1')}
                <div className="g1-target">
                  <span className="g1-target__sticker">
                    <Sticker tilt={-6} bg="var(--highlight)">
                      TARGET
                    </Sticker>
                  </span>
                  <span className="g1-target__num">{game.target}</span>
                </div>
                {numberCard('P2')}
              </div>
              <span className="g1-hint label-caps">
                타겟과 일치한 숫자를 3초 유지하면 승리 — 이탈하면 리셋!
              </span>
              {game.elapsedMs < 900 && game.result === null && (
                <div className="g1-intro">
                  <Stamp tone="accent" fontSize={64} tilt={-8}>
                    ROUND {flow.currentRound}
                  </Stamp>
                </div>
              )}
            </>
          )}
          {flow.phase === 'round-result' && (
            <ResultOverlay
              kind="round"
              winner={lastRoundWinner}
              p1Name={players.P1.name}
              p2Name={players.P2.name}
              onNextRound={() => nextRound()}
              onBackToMain={onExit}
            />
          )}
          {flow.phase === 'match-result' && (
            <ResultOverlay
              kind="match"
              winner={matchWinner}
              p1Name={players.P1.name}
              p2Name={players.P2.name}
              onBackToMain={onExit}
            />
          )}
        </div>
      </HudFrame>
    </div>
  );
}
