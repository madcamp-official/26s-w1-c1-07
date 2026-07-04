/**
 * S9 게임1 — 숫자 맞추기 "풍선 부풀리기 공작 시간" (game1 에이전트 소유).
 *
 * SPEC S9 / PLAN §3.1. 로직은 @shared game1 (재구현 금지):
 *   createGame1State(flow.roundConfig, Math.random) + tick(state, {frame, elapsedMs, actions}, dtMs)
 * 입력: attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, ...) → game1ActionFromKey.
 * 온라인 mock: P2는 봇 — 타겟으로 서서히 수렴하는 휴리스틱(간격 랜덤 + 가끔 과입력).
 * 매 틱 setDebugGame(state), 라운드 종료 시 reportRoundEnd(state.result!).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_KEYBOARD_MAP,
  attachKeyboardAdapter,
  createGame1State,
  game1ActionFromKey,
  tick,
} from '@shared';
import type { Game1Action, Game1State, PlayerRole } from '@shared';
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
import './Game1.css';

// ---------------------------------------------------------------------------
// 일치 유지 3초 홀드 게이지 — 3칸 클레이 도넛 링 conic-gradient
// ---------------------------------------------------------------------------

const RING_TRACK = 'rgba(74, 58, 82, 0.10)';

function ringGradient(progress: number): string {
  const stops: string[] = [];
  for (let i = 0; i < 3; i++) {
    const gapStart = i * 120;
    const segStart = gapStart + 5;
    const segEnd = gapStart + 115;
    const f = Math.min(1, Math.max(0, progress * 3 - i));
    const fillEnd = segStart + (segEnd - segStart) * f;
    stops.push(`transparent ${gapStart}deg ${segStart}deg`);
    if (f > 0) stops.push(`var(--pop) ${segStart}deg ${fillEnd}deg`);
    if (f < 1) stops.push(`${RING_TRACK} ${fillEnd}deg ${segEnd}deg`);
    stops.push(`transparent ${segEnd}deg ${(i + 1) * 120}deg`);
  }
  return `conic-gradient(from -90deg, ${stops.join(', ')})`;
}

/** 도넛 마스크 (링 두께 14px) */
const RING_MASK =
  'radial-gradient(closest-side, transparent calc(100% - 14px), #000 calc(100% - 13px))';

// ---------------------------------------------------------------------------
// 풍선 한 개 (현재숫자 + 홀드 링 + "나!" 태그 + 캡션)
// ---------------------------------------------------------------------------

interface BumpInfo {
  dir: 'up' | 'down';
  k: number;
}

interface BalloonProps {
  role: PlayerRole;
  game: Game1State;
  isYou: boolean;
  bump: BumpInfo;
  /** 링 부서짐 스냅샷 (이탈 순간의 progress) */
  ringBreak: { k: number; progress: number } | null;
}

function Balloon({ role, game, isYou, bump, ringBreak }: BalloonProps) {
  const p = game.players[role];
  const d = game.derived[role];
  // 타겟과의 거리 비례 크기 매핑 — 가까울수록 통통 (PLAN §3.1)
  const dist = Math.min(30, Math.abs(d.diff));
  const size = Math.round(118 + (1 - dist / 30) * 46);
  const resultClass =
    game.result === (role === 'P1' ? 'P1_WIN' : 'P2_WIN')
      ? 'g1-balloon--win'
      : game.result !== null && game.result !== 'DRAW'
        ? 'g1-balloon--lose'
        : '';
  const lost = resultClass === 'g1-balloon--lose';

  return (
    <div className="g1-balloon-block">
      <div className="g1-balloon-slot">
        {isYou && <span className="g1-you-tag">나!</span>}
        {/* 홀드 게이지 링 (3칸) */}
        <div
          className="g1-hold-ring"
          style={{
            background: ringGradient(d.holdProgress),
            WebkitMask: RING_MASK,
            mask: RING_MASK,
            opacity: d.holdProgress > 0 || d.matched ? 1 : 0.45,
          }}
        />
        {/* 이탈 순간 링이 툭 떨어져 부서지는 고스트 */}
        {ringBreak && (
          <div
            key={ringBreak.k}
            className="g1-hold-ring g1-ring-broken"
            style={{
              background: ringGradient(ringBreak.progress),
              WebkitMask: RING_MASK,
              mask: RING_MASK,
            }}
          />
        )}
        <div key={`${bump.dir}-${bump.k}`} className={bump.k > 0 ? `g1-pump-${bump.dir}` : ''}>
          <div
            className={`g1-balloon g1-balloon--${role.toLowerCase()} ${
              d.matched && !game.result ? 'g1-balloon--matched' : ''
            } ${resultClass}`}
            style={{ width: size, height: size }}
          >
            <span className="num g1-balloon-num" style={{ fontSize: Math.round(size * 0.34) }}>
              {p.value}
            </span>
            {lost && (
              <span className="g1-balloon-face" aria-hidden="true">
                &gt;﹏&lt;
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="g1-balloon-caption">
        <span className={`num g1-role-chip g1-role-chip--${role.toLowerCase()}`}>{role}</span>
        <span>
          현재숫자 <span className="num">{p.value}</span>
        </span>
        {d.matched && !game.result && (
          <span className="num g1-hold-caption">
            {(d.holdRemainingMs / 1000).toFixed(1)}초 유지!
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// S9 본체
// ---------------------------------------------------------------------------

const INITIAL_BUMP: Record<PlayerRole, BumpInfo> = {
  P1: { dir: 'up', k: 0 },
  P2: { dir: 'up', k: 0 },
};

export default function Game1() {
  useDebugScreen('scr-game1');
  const flow = useFlow();
  const navigate = useNavigate();

  const [game, setGame] = useState<Game1State | null>(null);
  const gameRef = useRef<Game1State | null>(null);
  const actionsRef = useRef<Game1Action[]>([]);
  const frameRef = useRef(0);

  // 연출 상태
  const [bump, setBump] = useState(INITIAL_BUMP);
  const [ringBreak, setRingBreak] = useState<Record<PlayerRole, { k: number; progress: number } | null>>(
    { P1: null, P2: null },
  );
  const [pressed, setPressed] = useState<Record<string, boolean>>({});

  const isOnline = flow.mode === 'online';
  const playing = flow.phase === 'playing' && flow.mode !== null;

  // 직접 URL 진입(매치 컨텍스트 없음) → 오프라인 매치로 시작
  useEffect(() => {
    if (flow.mode === null && flow.phase === 'idle') startOfflineGame(1);
  }, [flow.mode, flow.phase]);

  // 언마운트 시 디버그 브리지 정리
  useEffect(() => () => setDebugGame(null), []);

  // 키보드 입력 (온라인이면 P2 키는 봇 몫 — 무시)
  useEffect(() => {
    return attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      if (isOnline && ev.player === 'P2') return;
      setPressed((prev) => ({ ...prev, [`${ev.player}:${ev.key}`]: ev.phase === 'down' }));
      if (ev.phase === 'down' && getFlow().phase === 'playing') {
        actionsRef.current.push(game1ActionFromKey(ev.player, ev.key));
      }
    });
  }, [isOnline]);

  // 라운드 시작 → 새 state 생성 + rAF 틱 루프 (currentRound가 바뀌면 재시작)
  useEffect(() => {
    if (!playing) return;
    const state = createGame1State(getFlow().roundConfig, Math.random);
    gameRef.current = state;
    actionsRef.current = [];
    setGame(state);
    setDebugGame(state);
    setBump(INITIAL_BUMP);
    setRingBreak({ P1: null, P2: null });

    // 온라인 봇(P2) — 타겟으로 서서히 수렴하는 휴리스틱
    let botWaitMs = 700 + Math.random() * 500; // 첫 반응 지연
    const botStep = (dtMs: number) => {
      botWaitMs -= dtMs;
      if (botWaitMs > 0) return;
      const s = gameRef.current;
      if (!s || s.result !== null) return;
      const diff = s.target - s.players.P2.value;
      if (diff === 0) {
        botWaitMs = 250; // 일치 — 가만히 유지
        return;
      }
      const type: Game1Action['type'] = diff > 0 ? 'INCREMENT' : 'DECREMENT';
      actionsRef.current.push({ gameId: 1, player: 'P2', type });
      if (Math.abs(diff) <= 3 && Math.random() < 0.15) {
        actionsRef.current.push({ gameId: 1, player: 'P2', type }); // 가끔 과입력 → 오버슛
      }
      // 멀수록 빠르게, 가까울수록 신중하게
      botWaitMs =
        Math.abs(diff) > 10 ? 80 + Math.random() * 90 : 200 + Math.random() * 260;
    };
    const online = getFlow().mode === 'online';

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dtMs = Math.min(100, now - last);
      last = now;
      if (online) botStep(dtMs);
      const actions = actionsRef.current;
      actionsRef.current = [];
      frameRef.current += 1;
      const prev = gameRef.current!;
      const next = tick(prev, { frame: frameRef.current, elapsedMs: prev.elapsedMs, actions }, dtMs);
      gameRef.current = next;
      setGame(next);
      setDebugGame(next);

      // 연출: 값 변화 젤리 펌프 / 일치 이탈 링 부서짐
      for (const role of ['P1', 'P2'] as const) {
        const was = prev.players[role];
        const is = next.players[role];
        if (is.value > was.value) {
          setBump((b) => ({ ...b, [role]: { dir: 'up', k: b[role].k + 1 } }));
        } else if (is.value < was.value) {
          setBump((b) => ({ ...b, [role]: { dir: 'down', k: b[role].k + 1 } }));
        }
        if (was.holdMs > 0 && is.holdMs === 0 && next.result === null) {
          const progress = prev.derived[role].holdProgress;
          setRingBreak((r) => ({ ...r, [role]: { k: (r[role]?.k ?? 0) + 1, progress } }));
        }
      }

      if (next.result !== null) {
        reportRoundEnd(next.result);
        return; // 루프 종료 — ResultOverlay가 뜬다
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // flow.mode 포함: 진행 중 모드가 바뀌면(오프라인↔온라인) 봇 유무가 달라지므로 라운드 재시작
  }, [playing, flow.currentRound, flow.mode]);

  const displays = getPlayerDisplays(flow);
  const remainingMs = game
    ? game.derived.timeRemainingMs
    : flow.roundConfig.timePerRoundSec * 1000;

  return (
    <main data-testid="scr-game1" className="screen g1-root">
      {/* 놀이방 배경 클레이 블롭 */}
      <ClayBlob shape="donut" size={220} style={{ top: -60, right: -70 }} />
      <ClayBlob shape="drop" size={180} style={{ bottom: -50, left: -40 }} />

      <header className="g1-hud">
        <div className="g1-hud-left">
          <Button
            variant="cancel"
            size="sm"
            data-testid="btn-exit"
            onClick={() => {
              exitMatch();
              navigate('/');
            }}
          >
            나가기
          </Button>
          <PlayerBadge
            role="P1"
            name={displays.P1.name}
            isYou={displays.P1.isYou}
            data-testid="hud-profile-p1"
          />
        </div>
        <CountdownPill
          remainingMs={remainingMs}
          round={flow.currentRound || 1}
          totalRounds={flow.roundConfig.roundCount}
          data-testid="hud-countdown"
        />
        <div className="g1-hud-right">
          <PlayerBadge
            role="P2"
            name={displays.P2.name}
            isYou={displays.P2.isYou}
            align="right"
            data-testid="hud-profile-p2"
          />
        </div>
      </header>

      <section data-testid="game-stage" className="g1-stage">
        <div className="g1-target clay-lg breath">
          <span className="g1-target-label">타겟 숫자</span>
          <span className="num g1-target-num">{game?.target ?? '—'}</span>
          <span className="g1-target-hint">숫자를 맞추고 3초 유지하면 승리!</span>
        </div>

        <div className="g1-floor">
          {game ? (
            <>
              <div className="g1-side">
                <Balloon
                  role="P1"
                  game={game}
                  isYou={displays.P1.isYou}
                  bump={bump.P1}
                  ringBreak={ringBreak.P1}
                />
                <div className="g1-pads">
                  <KeyCap role="P1" keyLabel="Q" icon="↓" pressed={pressed['P1:key1']} />
                  <KeyCap role="P1" keyLabel="W" icon="↑" pressed={pressed['P1:key2']} />
                </div>
              </div>
              <div className="g1-side">
                <Balloon
                  role="P2"
                  game={game}
                  isYou={displays.P2.isYou}
                  bump={bump.P2}
                  ringBreak={ringBreak.P2}
                />
                {isOnline ? (
                  <div className="g1-bot-chip num">BOT 자동 조작 중…</div>
                ) : (
                  <div className="g1-pads">
                    <KeyCap role="P2" keyLabel="U" icon="↓" pressed={pressed['P2:key1']} />
                    <KeyCap role="P2" keyLabel="I" icon="↑" pressed={pressed['P2:key2']} />
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </section>

      <footer className="g1-keyhint">
        {isOnline ? (
          <>
            <b className="g1-k-p1">P1(나)</b> — <span className="num">Q</span> 내리기 ·{' '}
            <span className="num">W</span> 올리기 <b className="g1-k-p2">/ P2</b>는 봇이 조작해요
          </>
        ) : (
          <>
            <b className="g1-k-p1">P1</b> — <span className="num">Q</span> 내리기 ·{' '}
            <span className="num">W</span> 올리기 &nbsp;|&nbsp; <b className="g1-k-p2">P2</b> —{' '}
            <span className="num">U</span> 내리기 · <span className="num">I</span> 올리기
          </>
        )}
      </footer>

      <ResultOverlay />
    </main>
  );
}
