/**
 * S12 게임3 — 펜싱 "찰흙 해적판 위의 결투" (game3 에이전트 소유)
 *
 * 컨테이너 testid: scr-game3 / hud-profile-p1·p2 / hud-countdown / game-stage / btn-exit
 * SPEC S12 + PLAN §3.3.
 *  - 로직은 @shared createGame3State/tickGame3 그대로 (1초 틱 가위바위보·마지막 입력 채택·
 *    링아웃·타임아웃 판정 전부 코어) — 재구현 없음.
 *  - 오프라인: 한 키보드 2인 (P1 q/w, P2 u/i). 온라인 mock: P2는 봇(랜덤 행동), u/i 무시.
 *  - 매 프레임 setDebugGame(state), 종료 시 잠깐 연출 후 reportRoundEnd(state.result).
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  attachKeyboardAdapter,
  createGame3State,
  tickGame3,
  DEFAULT_KEYBOARD_MAP,
} from '@shared';
import type { Game3Action, Game3Move, Game3State, PlayerRole } from '@shared';
import {
  exitMatch,
  getFlow,
  getPlayerDisplays,
  reportRoundEnd,
  startOfflineGame,
  useFlow,
} from '../../state/flow';
import { setDebugGame, useDebugScreen } from '../../debug';
import { Button, ClayBlob, CountdownPill, KeyCap, PlayerBadge } from '../../components';
import ResultOverlay from './ResultOverlay';
import './Game3.css';

// ---------------------------------------------------------------------------
// 표시 메타
// ---------------------------------------------------------------------------

const MOVE_META: Record<Game3Move, { icon: string; label: string }> = {
  ATTACK: { icon: '🗡️', label: '공격' },
  DODGE: { icon: '🛡️', label: '회피' },
  NONE: { icon: '💤', label: '무행동' },
};

const DOLL_VARS: Record<PlayerRole, CSSProperties> = {
  P1: { '--doll': 'var(--p1)', '--doll-tint': 'var(--p1-tint)' } as CSSProperties,
  P2: { '--doll': 'var(--p2)', '--doll-tint': 'var(--p2-tint)' } as CSSProperties,
};

/** 스탠스 공개/포즈 유지 시간 (틱 윈도우 1초의 앞부분) */
const POSE_HOLD_MS = 700;
/** 종료 연출(풍덩/배너)을 보여준 뒤 ResultOverlay를 띄우기까지의 지연 */
const RESULT_DELAY_MS = 1200;

function cellPct(cell: number, trackLength: number): number {
  return ((cell + 0.5) / trackLength) * 100;
}

// ---------------------------------------------------------------------------
// 부분 컴포넌트 (전부 이 파일 스코프)
// ---------------------------------------------------------------------------

function MoveChip({ role, move }: { role: PlayerRole; move: Game3Move }) {
  const meta = MOVE_META[move];
  return (
    <span
      className="g3-chip"
      style={{
        background: role === 'P1' ? 'var(--p1-tint)' : 'var(--p2-tint)',
        color: 'var(--ink)',
      }}
    >
      <span className="num" style={{ fontWeight: 800, color: role === 'P1' ? 'var(--p1)' : 'var(--p2)' }}>
        {role}
      </span>
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}

function Doll({
  role,
  xPct,
  pose,
  squashing,
  fell,
  winner,
}: {
  role: PlayerRole;
  xPct: number;
  pose: 'idle' | 'attack' | 'dodge';
  squashing: boolean;
  fell: boolean;
  winner: boolean;
}) {
  return (
    <div
      className={`g3-doll ${role === 'P2' ? 'g3-flip' : ''} ${fell ? 'g3-fell' : ''} ${
        winner && !fell ? 'g3-win' : ''
      }`}
      style={{ left: `${xPct}%`, ...DOLL_VARS[role] }}
    >
      <div className="g3-figure">
        <div
          className={`g3-pose pose-${pose} ${squashing ? 'squash' : ''} ${
            pose === 'idle' && !fell ? 'breath' : ''
          }`}
        >
          <div className="g3-body" />
          <div className="g3-head" />
          <div className="g3-sword" />
          <div className="g3-shield" />
        </div>
      </div>
      <span
        className="num g3-doll-label"
        style={{ color: role === 'P1' ? 'var(--p1)' : 'var(--p2)' }}
      >
        {role}
      </span>
    </div>
  );
}

/** 풍덩 스플래시 — 클레이 물방울 6개가 튄다 (1회) */
function Splash({ xPct }: { xPct: number }) {
  const drops = [
    { dx: -34, dy: -66 },
    { dx: -18, dy: -88 },
    { dx: -4, dy: -100 },
    { dx: 10, dy: -84 },
    { dx: 26, dy: -62 },
    { dx: 0, dy: -44 },
  ];
  return (
    <div className="g3-splash" style={{ left: `${xPct}%` }} aria-hidden="true">
      {drops.map((d, i) => (
        <span
          key={i}
          className="g3-drop"
          style={
            {
              '--dx': `${d.dx}px`,
              '--dy': `${d.dy}px`,
              animationDelay: `${i * 30}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 화면
// ---------------------------------------------------------------------------

interface PressedMap {
  P1: { key1: boolean; key2: boolean };
  P2: { key1: boolean; key2: boolean };
}

export default function Game3() {
  useDebugScreen('scr-game3');
  const flow = useFlow();
  const navigate = useNavigate();
  const online = flow.mode === 'online';

  const [gs, setGs] = useState<Game3State | null>(null);
  const stateRef = useRef<Game3State | null>(null);
  const queueRef = useRef<Game3Action[]>([]);
  const botPlanRef = useRef<{ tick: number; move: Game3Move; atMs: number; fired: boolean } | null>(
    null,
  );
  const [pressed, setPressed] = useState<PressedMap>({
    P1: { key1: false, key2: false },
    P2: { key1: false, key2: false },
  });

  // 직접 URL 진입 등 매치 컨텍스트가 없으면 오프라인 게임3으로 정직하게 시작
  useEffect(() => {
    if (getFlow().phase === 'idle') startOfflineGame(3);
  }, []);

  // 언마운트 시 디버그 브리지 정리
  useEffect(() => () => setDebugGame(null), []);

  // ---- 게임 루프 (라운드마다 새 state — flow.currentRound 변화가 트리거) ----
  useEffect(() => {
    const st0 = createGame3State({
      roundDurationMs: flow.roundConfig.timePerRoundSec * 1000,
    });
    stateRef.current = st0;
    queueRef.current = [];
    botPlanRef.current = null;
    setGs(st0);
    setDebugGame(st0);

    let reported = false;
    let reportTimer: ReturnType<typeof setTimeout> | null = null;
    let raf = 0;
    let last = performance.now();
    const isOnline = flow.mode === 'online';

    /** 봇(온라인 mock 상대) — 틱 윈도우마다 랜덤 행동을 랜덤 시점에 흘려 넣는 휴리스틱 */
    const scheduleBot = (st: Game3State) => {
      const plan = botPlanRef.current;
      if (!plan || plan.tick !== st.tickCount) {
        const r = Math.random();
        const move: Game3Move = r < 0.42 ? 'ATTACK' : r < 0.78 ? 'DODGE' : 'NONE';
        botPlanRef.current = {
          tick: st.tickCount,
          move,
          atMs: 120 + Math.random() * 720,
          fired: false,
        };
        return;
      }
      if (!plan.fired && plan.move !== 'NONE' && st.windowElapsedMs >= plan.atMs) {
        plan.fired = true;
        queueRef.current.push({ gameId: 3, player: 'P2', type: plan.move });
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(250, now - last);
      last = now;
      const prev = stateRef.current;
      if (prev && prev.result === null) {
        if (isOnline) scheduleBot(prev);
        const actions = queueRef.current;
        queueRef.current = [];
        const next = tickGame3(prev, actions, dt);
        stateRef.current = next;
        setGs(next);
        setDebugGame(next);
        if (next.result !== null && !reported) {
          reported = true;
          // 풍덩/배너 연출을 잠깐 보여준 뒤 라운드 종료 보고 → ResultOverlay
          reportTimer = setTimeout(() => reportRoundEnd(next.result!), RESULT_DELAY_MS);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      if (reportTimer) clearTimeout(reportTimer);
    };
  }, [flow.currentRound, flow.roundConfig.timePerRoundSec, flow.mode]);

  // ---- 키보드 (P1 q/w, P2 u/i — 온라인이면 P2 키 무시, 봇이 담당) ----
  useEffect(() => {
    const isOnline = flow.mode === 'online';
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      if (isOnline && ev.player === 'P2') return;
      setPressed((p) => ({
        ...p,
        [ev.player]: { ...p[ev.player], [ev.key]: ev.phase === 'down' },
      }));
      if (ev.phase !== 'down') return;
      const st = stateRef.current;
      if (!st || st.result !== null) return;
      if (getFlow().phase !== 'playing') return;
      queueRef.current.push({
        gameId: 3,
        player: ev.player,
        type: ev.key === 'key1' ? 'ATTACK' : 'DODGE',
      });
    });
    return detach;
  }, [flow.mode]);

  const onExit = () => {
    exitMatch();
    navigate('/');
  };

  // ---- 파생 렌더 값 ----
  const displays = getPlayerDisplays(flow);

  if (!gs) {
    return (
      <main data-testid="scr-game3" className="screen g3-screen">
        <div data-testid="game-stage" className="g3-stage clay-lg" />
      </main>
    );
  }

  const view = gs.view;
  const lt = gs.lastTick;
  const ended = gs.result !== null;
  // 틱 직후 POSE_HOLD_MS 동안 포즈/밀림 연출 유지 (종료 후엔 마지막 판정 고정)
  const showPose = lt !== null && (ended || gs.windowElapsedMs < POSE_HOLD_MS);

  const poseOf = (role: PlayerRole): 'idle' | 'attack' | 'dodge' => {
    if (!lt || !showPose) return 'idle';
    const mv = lt.moves[role];
    return mv === 'ATTACK' ? 'attack' : mv === 'DODGE' ? 'dodge' : 'idle';
  };

  const fellRole: PlayerRole | null = lt?.fell ?? null;
  const fellX = fellRole
    ? Math.min(
        104,
        Math.max(-4, cellPct(fellRole === 'P1' ? view.p1Cell : view.p2Cell, view.trackLength)),
      )
    : 0;

  const warnL = !ended && gs.players.P1.distanceFromEdge <= 1;
  const warnR = !ended && gs.players.P2.distanceFromEdge <= 1;

  // 1초 틱 진행 표시 — 차오르는 게이지 + 좌우로 통통 튀는 메트로놈 점
  const tickFrac = Math.min(1, gs.windowElapsedMs / gs.config.tickIntervalMs);
  const dotPct = (tickFrac < 0.5 ? tickFrac * 2 : 2 - tickFrac * 2) * 100;

  const banner = !ended
    ? null
    : gs.resultReason === 'RING_OUT'
      ? `링아웃! ${gs.result === 'P1_WIN' ? 'P2' : 'P1'} 바다에 풍덩!`
      : gs.result === 'DRAW'
        ? '시간 종료 — 무승부!'
        : `시간 종료! ${gs.result === 'P1_WIN' ? 'P1' : 'P2'} 승리!`;

  const verdictText = lt
    ? lt.fell
      ? `${lt.fell} 링아웃!`
      : lt.pushed
        ? `${lt.pushed} 1칸 밀림!`
        : '동일 행동 — 밀림 없음'
    : '';

  const half = view.trackLength / 2;

  return (
    <main data-testid="scr-game3" className="screen g3-screen">
      <ClayBlob shape="star" size={150} style={{ top: -30, left: -40 }} />
      <ClayBlob shape="drop" size={190} style={{ top: -60, right: -60 }} />

      {/* ---- HUD ---- */}
      <header className="g3-hud">
        <div className="g3-hud-side">
          <Button variant="cancel" size="sm" data-testid="btn-exit" onClick={onExit}>
            나가기
          </Button>
          <PlayerBadge
            role="P1"
            name={displays.P1.name}
            isYou={displays.P1.isYou}
            data-testid="hud-profile-p1"
          />
        </div>
        <div className="g3-hud-center">
          <CountdownPill
            remainingMs={view.timeRemainingMs}
            round={flow.currentRound || 1}
            totalRounds={flow.roundConfig.roundCount}
            data-testid="hud-countdown"
          />
          <div className="g3-tickmeter sunken" aria-hidden="true">
            <div className="g3-tickfill" style={{ width: `${tickFrac * 100}%` }} />
            <div className="g3-tickdot" style={{ left: `${dotPct}%` }} />
          </div>
          <span className="g3-tick-label">1초마다 동시 판정!</span>
        </div>
        <div className="g3-hud-side">
          <PlayerBadge
            role="P2"
            name={displays.P2.name}
            isYou={displays.P2.isYou}
            align="right"
            data-testid="hud-profile-p2"
          />
        </div>
      </header>

      {/* ---- 무대 ---- */}
      <section data-testid="game-stage" className="g3-stage clay-lg">
        {/* 틱 판정 공개 칩 — 매 틱 '뿅' */}
        {lt && (
          <div className="g3-reveal">
            <div key={lt.tickIndex} className="g3-reveal-card pop-in">
              <div className="g3-reveal-row">
                <MoveChip role="P1" move={lt.moves.P1} />
                <span className="g3-vs">VS</span>
                <MoveChip role="P2" move={lt.moves.P2} />
              </div>
              <div className="g3-verdict">{verdictText}</div>
            </div>
          </div>
        )}

        {/* 칸이 새겨진 클레이 판자 다리 + 인형 */}
        <div
          className={`g3-bridge-zone ${warnL ? 'g3-tilt-l' : ''} ${warnR ? 'g3-tilt-r' : ''}`}
        >
          <div className="g3-bridge">
            {Array.from({ length: view.trackLength }, (_, i) => (
              <div
                key={i}
                className="g3-cell"
                style={{
                  background:
                    i < half
                      ? 'linear-gradient(180deg, rgba(255,222,230,0.55), rgba(255,222,230,0.2))'
                      : 'linear-gradient(180deg, rgba(214,244,234,0.55), rgba(214,244,234,0.2))',
                }}
              />
            ))}
          </div>
          {fellRole !== 'P1' && (
            <Doll
              role="P1"
              xPct={cellPct(view.p1Cell, view.trackLength)}
              pose={poseOf('P1')}
              squashing={showPose && lt?.pushed === 'P1'}
              fell={false}
              winner={ended && gs.result === 'P1_WIN'}
            />
          )}
          {fellRole !== 'P2' && (
            <Doll
              role="P2"
              xPct={cellPct(view.p2Cell, view.trackLength)}
              pose={poseOf('P2')}
              squashing={showPose && lt?.pushed === 'P2'}
              fell={false}
              winner={ended && gs.result === 'P2_WIN'}
            />
          )}
          {/* 낙사자 — 떨어지는 인형 (애니메이션 후 사라짐) */}
          {fellRole && (
            <Doll
              role={fellRole}
              xPct={fellX}
              pose="idle"
              squashing={false}
              fell
              winner={false}
            />
          )}
        </div>

        {/* 바다 — 물결 + (낙사 시) 삐진 얼굴 동동 */}
        <div className={`g3-sea ${warnL || warnR ? 'g3-sea-warn' : ''}`}>
          <div className="g3-waves" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} className="g3-wave" />
            ))}
          </div>
          {fellRole && (
            <div
              className="g3-face"
              style={{ left: `${11 + (fellX * 78) / 100}%`, ...DOLL_VARS[fellRole] }}
            />
          )}
        </div>
        {fellRole && <Splash xPct={11 + (fellX * 78) / 100} />}

        {/* 종료 배너 — 링아웃/시간 종료 판정 (오버레이 전 연출) */}
        {banner && (
          <div className="g3-banner-wrap">
            <h2 className="g3-banner clay-lg pop-in">{banner}</h2>
          </div>
        )}

        {/* ---- 온스크린 패드 ---- */}
        <div className="g3-pad g3-pad-l">
          {!ended && (
            <span className="g3-pending">
              이번 틱 P1: {MOVE_META[gs.pending.P1].icon} {MOVE_META[gs.pending.P1].label}
            </span>
          )}
          <div className="g3-pad-keys">
            <div className="g3-pad-col">
              <KeyCap role="P1" keyLabel="Q" icon="🗡️" pressed={pressed.P1.key1} />
              <span className="g3-key-role">공격</span>
            </div>
            <div className="g3-pad-col">
              <KeyCap role="P1" keyLabel="W" icon="🛡️" pressed={pressed.P1.key2} />
              <span className="g3-key-role">회피</span>
            </div>
          </div>
        </div>
        <div className="g3-pad g3-pad-r">
          {online ? (
            <span className="g3-bot-chip">BOT</span>
          ) : (
            <>
              {!ended && (
                <span className="g3-pending">
                  이번 틱 P2: {MOVE_META[gs.pending.P2].icon} {MOVE_META[gs.pending.P2].label}
                </span>
              )}
              <div className="g3-pad-keys">
                <div className="g3-pad-col">
                  <KeyCap role="P2" keyLabel="U" icon="🗡️" pressed={pressed.P2.key1} />
                  <span className="g3-key-role">공격</span>
                </div>
                <div className="g3-pad-col">
                  <KeyCap role="P2" keyLabel="I" icon="🛡️" pressed={pressed.P2.key2} />
                  <span className="g3-key-role">회피</span>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <ResultOverlay />
    </main>
  );
}
