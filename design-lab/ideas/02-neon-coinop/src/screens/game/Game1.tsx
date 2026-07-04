/**
 * S9 게임1 — 숫자 맞추기 (NEON COIN-OP). 담당: game1 에이전트.
 * 컨테이너 testid: scr-game1 / 부품: game-stage(CRT 베젤), hud-*(HudFrame 내장), btn-exit
 *
 * PLAN §2-S9 + §3.1 "세 개의 스코어보드, 하나의 잭팟":
 *   - 중앙 타겟 스코어보드(#000 박스 + 옐로 초대형 숫자 + TARGET 캡션)
 *   - 좌 P1 시안 / 우 P2 핑크 현재숫자 패널(dim 바탕 + 2px 플레이어색 보더)
 *   - 값 변경 = 하드 스텝 + 80ms 글로우 버스트, ▲/▼ 램프 1프레임 점등
 *   - 근접 피드백: |diff|≤5 옐로 보더, ≤2 보더 글로우 맥동(300ms steps)
 *   - 일치 유지 3초 = 코인 락인 램프 3개(1초마다 점등, 이탈 시 일괄 소등)
 *
 * 배선 (ARCHITECTURE §3.3):
 *   - @shared createGame1State(flow.roundConfig, Math.random) + tick(state, inputs, dtMs)
 *   - attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, ...) + game1ActionFromKey
 *   - 매 틱 setDebugGame(state), 언마운트 시 setDebugGame(null)
 *   - state.result 확정 → reportRoundEnd(state.result) 1회 → <ResultOverlay />
 *   - 온라인 모드(flow.mode==='online')면 P2는 봇: 타겟으로 서서히 수렴하는 휴리스틱
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_KEYBOARD_MAP,
  attachKeyboardAdapter,
  createGame1State,
  game1ActionFromKey,
  tick,
} from '@shared';
import type { Game1Action, Game1State, PlayerRole } from '@shared';
import { Button, HudFrame, KeyCap, useKeyLamp } from '../../components';
import {
  exitMatch,
  getFlow,
  getPlayerDisplays,
  getRoundWins,
  reportRoundEnd,
  startOfflineGame,
  useFlow,
} from '../../state/flow';
import { setDebugGame, useDebugScreen } from '../../debug';
import ResultOverlay from './ResultOverlay';
import './game1.css';

interface ValuePulse {
  dir: 'up' | 'down';
  until: number;
}

export default function Game1() {
  useDebugScreen('scr-game1');
  const flow = useFlow();
  const navigate = useNavigate();

  const [game, setGame] = useState<Game1State>(() =>
    createGame1State(getFlow().roundConfig, Math.random),
  );
  const gameRef = useRef(game);
  const actionsRef = useRef<Game1Action[]>([]);
  const frameRef = useRef(0);
  const reportedRef = useRef(false);
  const pulseRef = useRef<Record<PlayerRole, ValuePulse | null>>({ P1: null, P2: null });
  const botNextAtRef = useRef(0);

  // 온스크린 키캡 램프 4개 (즉발 점등 → 80ms 소등, PLAN §1.4)
  const [p1DownLit, flashP1Down] = useKeyLamp();
  const [p1UpLit, flashP1Up] = useKeyLamp();
  const [p2DownLit, flashP2Down] = useKeyLamp();
  const [p2UpLit, flashP2Up] = useKeyLamp();
  const lampRef = useRef({ flashP1Down, flashP1Up, flashP2Down, flashP2Up });
  lampRef.current = { flashP1Down, flashP1Up, flashP2Down, flashP2Up };

  // direct-URL 진입 복구 (ARCHITECTURE §3.3: idle이면 오프라인 매치로 시작)
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 1) startOfflineGame(1);
  }, []);

  // 키보드 (P1 q/w, P2 u/i — @shared 키맵). 온라인이면 P2 입력은 봇 대행이므로 무시.
  useEffect(() => {
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      if (ev.phase !== 'down') return;
      const f = getFlow();
      if (f.mode === 'online' && ev.player === 'P2') return;
      if (ev.player === 'P1') {
        (ev.key === 'key1' ? lampRef.current.flashP1Down : lampRef.current.flashP1Up)();
      } else {
        (ev.key === 'key1' ? lampRef.current.flashP2Down : lampRef.current.flashP2Up)();
      }
      if (f.phase !== 'playing') return;
      actionsRef.current.push(game1ActionFromKey(ev.player, ev.key));
    });
    return () => {
      detach();
      setDebugGame(null);
    };
  }, []);

  // 라운드 시작(마운트/nextRound) → 새 @shared 게임 state 생성
  useEffect(() => {
    if (flow.phase !== 'playing' || flow.gameId !== 1) return;
    const s = createGame1State(getFlow().roundConfig, Math.random);
    gameRef.current = s;
    frameRef.current = 0;
    reportedRef.current = false;
    actionsRef.current = [];
    pulseRef.current = { P1: null, P2: null };
    botNextAtRef.current = 0;
    setGame(s);
    setDebugGame(s);
  }, [flow.currentRound, flow.phase, flow.gameId]);

  // rAF 게임 루프 — tick + 디버그 브리지 + 결과 보고.
  // 탭이 백그라운드/오클루전이면 rAF가 멈추므로 interval 워치독이 대신 스텝을 밟는다 (QA 자동화 대응).
  useEffect(() => {
    if (flow.phase !== 'playing') return;
    let raf = 0;
    let stopped = false;
    let last = performance.now();

    const step = (now: number) => {
      if (stopped) return;
      const dt = Math.min(500, now - last);
      if (dt <= 0) return;
      last = now;
      const cur = gameRef.current;

      // 온라인 봇(P2): 타겟으로 서서히 수렴 — 멀면 빠르게, 근접할수록 천천히
      if (getFlow().mode === 'online' && cur.result === null && now >= botNextAtRef.current) {
        const bot = cur.players.P2;
        if (bot.value !== cur.target) {
          const key = bot.value < cur.target ? 'key2' : 'key1';
          actionsRef.current.push(game1ActionFromKey('P2', key));
          (key === 'key1' ? lampRef.current.flashP2Down : lampRef.current.flashP2Up)();
          const dist = Math.abs(bot.value - cur.target);
          botNextAtRef.current =
            now + (dist > 12 ? 90 + Math.random() * 70 : 180 + Math.random() * 260);
        } else {
          botNextAtRef.current = now + 250; // 일치 유지(홀드) 중 — 손 뗌
        }
      }

      const inputs = {
        frame: frameRef.current++,
        elapsedMs: cur.elapsedMs,
        actions: actionsRef.current,
      };
      actionsRef.current = [];
      const next = tick(cur, inputs, dt);

      // ▲/▼ 램프: 값 변화 방향을 짧게 점등 (§3.1)
      for (const role of ['P1', 'P2'] as const) {
        const d = next.players[role].value - cur.players[role].value;
        if (d !== 0) pulseRef.current[role] = { dir: d > 0 ? 'up' : 'down', until: now + 160 };
      }

      gameRef.current = next;
      setGame(next);
      setDebugGame(next);

      if (next.result !== null) {
        stopped = true; // 루프 정지 — ResultOverlay가 phase를 보고 표시
        if (!reportedRef.current) {
          reportedRef.current = true;
          reportRoundEnd(next.result);
        }
      }
    };

    const loop = (now: number) => {
      step(now);
      if (!stopped) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const watchdog = setInterval(() => {
      const now = performance.now();
      if (now - last > 280) step(now); // rAF가 살아있으면 개입하지 않음
    }, 250);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearInterval(watchdog);
    };
  }, [flow.phase, flow.currentRound]);

  const displays = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent =
    flow.phase === 'playing' && game.result === null && game.derived.timeRemainingMs <= 5000;
  const keys = DEFAULT_KEYBOARD_MAP;

  const renderPanel = (role: PlayerRole) => {
    const p = game.players[role];
    const dv = game.derived[role];
    const disp = displays[role];
    const pl = pulseRef.current[role];
    const dir = pl && pl.until > performance.now() ? pl.dir : null;
    const near = !dv.matched && Math.abs(dv.diff) <= 5;
    const close = !dv.matched && Math.abs(dv.diff) <= 2;
    const holdLit = Math.min(3, Math.floor(p.holdMs / 1000));
    const color = role === 'P1' ? 'var(--p1)' : 'var(--p2)';
    const cls = [
      'g1-panel',
      role === 'P1' ? 'g1-panel--p1' : 'g1-panel--p2',
      near ? 'g1-panel--near' : '',
      close ? 'g1-panel--close' : '',
      dv.matched ? 'g1-panel--matched' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div className={cls}>
        <div className="g1-panel__cap">
          <span className="g1-panel__tag font-arcade">{role}</span>
          {disp.isYou && <span className="g1-panel__you font-arcade anim-blink">YOU</span>}
          <span className={`g1-arrow ${dir === 'up' ? 'lit' : ''}`} aria-hidden>
            ▲
          </span>
          <span className={`g1-arrow ${dir === 'down' ? 'lit' : ''}`} aria-hidden>
            ▼
          </span>
        </div>
        <span key={p.value} className="g1-panel__num font-arcade">
          {p.value}
        </span>
        {/* 코인 락인: 일치 유지 진행 램프 3개 (1초당 1점등, 이탈 시 소등 — §3.1) */}
        <div className={`g1-hold ${dv.matched ? '' : 'g1-hold--off'}`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`lamp ${i < holdLit ? 'lit' : ''}`}
              style={{ '--lamp-color': color } as CSSProperties}
            />
          ))}
          <span className="g1-hold__cap font-arcade">
            {dv.holdProgress >= 1 ? 'LOCKED!' : 'HOLD'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <main data-testid="scr-game1" className="g1-root">
      <div className="vanish-grid dim" aria-hidden />

      <header className="g1-topbar">
        <Button
          variant="tertiary"
          data-testid="btn-exit"
          onClick={() => {
            exitMatch();
            navigate('/');
          }}
        >
          ◀ 나가기
        </Button>
      </header>

      <HudFrame
        p1={displays.P1}
        p2={displays.P2}
        roundWins={wins}
        roundCount={flow.roundConfig.roundCount}
        currentRound={flow.currentRound}
        timeRemainingMs={game.derived.timeRemainingMs}
      />

      <section data-testid="game-stage" className={`crt-bezel g1-stage ${urgent ? 'urgent' : ''}`}>
        <span className="g1-watermark font-arcade" aria-hidden>
          PUMP
        </span>
        <div className="g1-row">
          {renderPanel('P1')}
          <div className="g1-target corner-brackets">
            <i className="cb2" />
            <span className="g1-target__cap font-arcade">TARGET</span>
            <span className="g1-target__num font-arcade glow-text">{game.target}</span>
          </div>
          {renderPanel('P2')}
        </div>
      </section>

      {/* 하단 조작키 안내 — 실제 배정 키 표기 (SPEC Q2) + 입력 순간 램프 점등 */}
      <footer className="g1-pads">
        <div className="g1-pad-group">
          <KeyCap
            role="P1"
            keyChar={keys.playerL.key1.toUpperCase()}
            icon="▼"
            label="내리기"
            lit={p1DownLit}
          />
          <KeyCap
            role="P1"
            keyChar={keys.playerL.key2.toUpperCase()}
            icon="▲"
            label="올리기"
            lit={p1UpLit}
          />
        </div>
        <span className="g1-pads-hint font-arcade">MATCH THE TARGET · HOLD 3 SEC</span>
        <div className="g1-pad-group">
          <KeyCap
            role="P2"
            keyChar={keys.playerR.key1.toUpperCase()}
            icon="▼"
            label="내리기"
            lit={p2DownLit}
          />
          <KeyCap
            role="P2"
            keyChar={keys.playerR.key2.toUpperCase()}
            icon="▲"
            label="올리기"
            lit={p2UpLit}
          />
        </div>
      </footer>

      <ResultOverlay />
    </main>
  );
}
