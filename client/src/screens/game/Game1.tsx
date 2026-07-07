/**
 * S9 Game 1 — Number Guess (NEON COIN-OP). Owner: game1 agent.
 * Container testid: scr-game1 / parts: game-stage(CRT bezel), hud-*(HudFrame built-in), btn-exit
 *
 * The screen (UI, components, CSS classes, effects) is kept 100% intact; only the game logic is driven by the @madcade/shared game1 core.
 *
 * PLAN §2-S9 + §3.1 "Three scoreboards, one jackpot":
 *   - Center target scoreboard (#000 box + yellow oversized number + TARGET caption)
 *   - Left P1 cyan / right P2 pink current-number panel (dim background + 2px player-color border)
 *   - Value change = hard step + 80ms glow burst, ▲/▼ lamp lit for 1 frame
 *   - Proximity feedback: |diff|≤5 yellow border, ≤2 border glow pulse (300ms steps)
 *
 * New core mapping (design directive):
 *   - value  = state.p1 | state.p2 (float) → display/judgement uses Math.round(value)
 *   - matched = |round(value)-target| < G1.MATCH_TOL
 *   - hold(sec) = state.p1Hold | p2Hold, win hold time = G1.HOLD_TO_WIN(=1 sec)
 *   - timeRemainingMs = (GAME_DURATION - state.elapsed) * 1000
 *   - New mechanic "accumulated speed gauge (0~100)" → adds a neon gauge bar to each panel (--p1/--p2)
 *   - Reinterprets "1-second lock-in" via the existing 3-lamp effect (splitting progress into thirds). Bottom hint "HOLD 1 SEC"
 *
 * Wiring (design directive):
 *   - game1.create(Math.random) / game1.step(state, events, dt sec)
 *   - attachLocalKeyboard(now, push): KeyQ/KeyW=P1, KeyU/KeyI=P2 (push both down/up to the queue)
 *   - step mutates the original then returns it → replace state with the return value + setState forces a re-render with a new reference (clone)
 *   - state.result finalized → reportRoundEnd(map) once → <ResultOverlay />
 *   - In online mode (flow.mode==='online') P2 is a bot: a heuristic that gradually converges on the target
 *   - setDebugGame(state) every tick, setDebugGame(null) on unmount
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { game1, GAME_DURATION, G1 } from '@madcade/shared';
import type { Game1State, GameInputEvent } from '@madcade/shared';
import type { PlayerRole } from '@/shell';
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
import { attachLocalKeyboard } from '../../game/input/keyboard';
import { useOnlineRender } from '../../net/useOnlineRender';
import { functionColors, onlineStore, sendInput as onlineSendInput } from '../../net/online';
import { EndFlash } from '../../game/EndFlash';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import { sfx } from '@/audio';
import './game1.css';

interface ValuePulse {
  dir: 'up' | 'down';
  until: number;
}

// ---------------------------------------------------------------------------
// Interpolation (extrapolation) between snapshots — advances each player's value from the server snapshot
// by dt seconds at 'its own speed' to build a display state. speed=rate×(gauge/GAUGE_REF)·direction=up−down (same formula as core advance).
// The snapshot has rate/gauge/down/up all present, so no ID matching is needed and added latency is 0. The next snapshot corrects it immediately.
// The goal is to smoothly bridge 30/60Hz snapshots into a 60fps render (removing the stair-stepping of fast count-ups → matching the offline cadence).
// ---------------------------------------------------------------------------

const clampValue = (v: number): number => Math.min(G1.RANGE_MAX, Math.max(G1.RANGE_MIN, v));

function extrapolate(s: Game1State, dt: number): Game1State {
  const p1Dir = (s.p1Up ? 1 : 0) - (s.p1Down ? 1 : 0);
  const p2Dir = (s.p2Up ? 1 : 0) - (s.p2Down ? 1 : 0);
  const p1Speed = s.p1Rate * (s.p1Gauge / G1.GAUGE_REF);
  const p2Speed = s.p2Rate * (s.p2Gauge / G1.GAUGE_REF);
  return {
    ...s,
    p1: clampValue(s.p1 + p1Dir * p1Speed * dt),
    p2: clampValue(s.p2 + p2Dir * p2Speed * dt),
  };
}

export default function Game1() {
  useDebugScreen('scr-game1');
  const flow = useFlow();
  const navigate = useNavigate();

  // Online render hook (performance standard): subscribes only to active/role (re-renders only at round boundaries) +
  // mirrors server snapshots into stateRef (without re-rendering). per-snapshot work (debug bridge) is delegated to a callback.
  const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game1State>(1, (s) => {
    setDebugGame(s);
  });
  // A ref preventing stale closures so the input handler (empty-deps effect) always sees the latest 'online active' state.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const [game, setGame] = useState<Game1State>(() => game1.create(Math.random));
  const gameRef = useRef(game);
  const eventsRef = useRef<GameInputEvent[]>([]);
  const reportedRef = useRef(false);
  const pulseRef = useRef<Record<PlayerRole, ValuePulse | null>>({ P1: null, P2: null });
  // g1-gauge-max: a guard so it fires only once, the moment each player's gauge first reaches max (≈100).
  const gaugeMaxRef = useRef<Record<PlayerRole, boolean>>({ P1: false, P2: false });
  const botNextAtRef = useRef(0);
  const botHeldRef = useRef<'up' | 'down' | null>(null);

  // 4 on-screen keycap lamps (instant on → off after 80ms, PLAN §1.4)
  const [p1DownLit, flashP1Down] = useKeyLamp();
  const [p1UpLit, flashP1Up] = useKeyLamp();
  const [p2DownLit, flashP2Down] = useKeyLamp();
  const [p2UpLit, flashP2Up] = useKeyLamp();
  const lampRef = useRef({ flashP1Down, flashP1Up, flashP2Down, flashP2Up });
  lampRef.current = { flashP1Down, flashP1Up, flashP2Down, flashP2Up };

  // direct-URL entry recovery (if idle or a different game, start an offline match)
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 1) startOfflineGame(1);
  }, []);

  // Keyboard input (P1 q/w, P2 u/i). Push both down/up to the queue so the core updates the direction state.
  // When online, P2 input is handled by the bot, so it is ignored. Lamps light only at the down moment.
  useEffect(() => {
    const push = (e: GameInputEvent) => {
      // Server online active: send only to the server, no local queue/bot. Lamps remain as visual feedback.
      if (isOnlineRef.current) {
        // Online uses only the two U/I keys (requirement). U=main key (slotA), I=secondary key (slotB). Q/W are ignored.
        // The server rewrites the slot to my role's physical key, so each connected player controls their own character.
        if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
        if (e.type === 'down') {
          if (e.code === 'KeyU') lampRef.current.flashP2Down();
          else lampRef.current.flashP2Up();
          sfx('g1-tap');
        }
        const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
        onlineSendInput(slot, e.type, e.t);
        return;
      }

      const f = getFlow();
      const isP2 = e.code === 'KeyU' || e.code === 'KeyI';
      if (f.mode === 'online' && isP2) return; // online P2 = bot
      if (e.type === 'down') {
        sfx('g1-tap');
        switch (e.code) {
          case 'KeyQ':
            lampRef.current.flashP1Down();
            break;
          case 'KeyW':
            lampRef.current.flashP1Up();
            break;
          case 'KeyU':
            lampRef.current.flashP2Down();
            break;
          case 'KeyI':
            lampRef.current.flashP2Up();
            break;
        }
      }
      if (f.phase !== 'playing') return;
      eventsRef.current.push(e);
    };
    const detach = attachLocalKeyboard(() => performance.now() / 1000, push);
    return () => {
      detach();
      setDebugGame(null);
    };
  }, []);

  // Round start (mount/nextRound) → create a new game1 core state
  useEffect(() => {
    if (flow.phase !== 'playing' || flow.gameId !== 1) return;
    const s = game1.create(Math.random);
    gameRef.current = s;
    reportedRef.current = false;
    eventsRef.current = [];
    pulseRef.current = { P1: null, P2: null };
    gaugeMaxRef.current = { P1: false, P2: false };
    botNextAtRef.current = 0;
    botHeldRef.current = null;
    setGame({ ...s });
    setDebugGame(s);
  }, [flow.currentRound, flow.phase, flow.gameId]);

  // (Server-authoritative state mirroring is handled by useOnlineRender — it mirrors into stateRef every snapshot and
  //  delegates per-snapshot work (setDebugGame) to the hook callback above. No separate mirror effect is needed.)

  // rAF game loop — step + debug bridge + result reporting.
  // When the tab is backgrounded/occluded, rAF stops, so an interval watchdog steps in its place (for QA automation).
  useEffect(() => {
    // Online (server-authoritative): no local step/bot/result reporting — paint only the server snapshot (stateRef) each frame.
    // A paint on this screen = a React re-render via setGame with a new reference (this is a DOM game, so we re-render instead of a canvas blit).
    // Snapshot churn is absorbed by useOnlineRender (mirroring into stateRef without re-rendering) → here we render only once per frame.
    if (isOnline) {
      // Before the first snapshot, set the initial create state for rendering only (not judgement — onSnapshot overwrites it soon).
      if (!stateRef.current) {
        const seed = game1.create(Math.random);
        stateRef.current = seed;
        gaugeMaxRef.current = { P1: false, P2: false };
        setGame({ ...seed });
        setDebugGame(seed);
      }
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const s = stateRef.current;
        if (!s) return;
        // g1-gauge-max: once per player, the first moment the server-snapshot gauge nears max (≈100).
        if (!gaugeMaxRef.current.P1 && s.p1Gauge >= G1.GAUGE_MAX - 10) {
          gaugeMaxRef.current.P1 = true;
          sfx('g1-gauge-max');
        }
        if (!gaugeMaxRef.current.P2 && s.p2Gauge >= G1.GAUGE_MAX - 10) {
          gaugeMaxRef.current.P2 = true;
          sfx('g1-gauge-max');
        }
        // Extrapolation between snapshots: advance each player's value from the last snapshot by elapsed dt (≤50ms) at 'its own speed'.
        // Only values (p1/p2) are affected — same formula as core advance. Do not extrapolate once ended (result≠null).
        const extraDt = Math.min(0.05, Math.max(0, (now - snapAtRef.current) / 1000));
        const view = extraDt > 0 && s.result === null ? extrapolate(s, extraDt) : s;
        setGame({ ...view }); // force re-render with a new reference (clone the snapshot/extrapolated object)
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    if (flow.phase !== 'playing') return;
    let raf = 0;
    let stopped = false;
    let last = performance.now();

    const step = (now: number) => {
      if (stopped) return;
      // During the round intro, pause the sim (skip core step) + update last to prevent a dt jump on resume
      if (isRoundIntroActive()) {
        last = now;
        return;
      }
      const dtSec = Math.min(0.5, (now - last) / 1000);
      if (dtSec <= 0) return;
      last = now;
      const cur = gameRef.current;

      // Online bot (P2): gradually converges on the target — presses direction keys to fill the gauge and move, then releases and holds on reaching the target
      if (getFlow().mode === 'online' && cur.result === null && now >= botNextAtRef.current) {
        const t = now / 1000;
        const p2r = Math.round(cur.p2);
        const diff = cur.target - p2r;
        if (diff === 0) {
          // Reached the target — release the held key to stay stopped (hold)
          if (botHeldRef.current) {
            eventsRef.current.push({
              code: botHeldRef.current === 'up' ? 'KeyI' : 'KeyU',
              type: 'up',
              t,
            });
            botHeldRef.current = null;
          }
          botNextAtRef.current = now + 200;
        } else {
          const wantUp = diff > 0;
          const dir: 'up' | 'down' = wantUp ? 'up' : 'down';
          const code = wantUp ? 'KeyI' : 'KeyU';
          if (botHeldRef.current && botHeldRef.current !== dir) {
            eventsRef.current.push({
              code: botHeldRef.current === 'up' ? 'KeyI' : 'KeyU',
              type: 'up',
              t,
            });
            botHeldRef.current = null;
          }
          eventsRef.current.push({ code, type: 'down', t }); // gauge +30 accumulated
          botHeldRef.current = dir;
          (wantUp ? lampRef.current.flashP2Up : lampRef.current.flashP2Down)();
          const dist = Math.abs(diff);
          botNextAtRef.current = now + (dist > 12 ? 90 + Math.random() * 70 : 220 + Math.random() * 280);
        }
      }

      // ▲/▼ lamps: snapshot the value before step (step mutates the original, so capture it before the call)
      const prevP1 = Math.round(cur.p1);
      const prevP2 = Math.round(cur.p2);

      const events = eventsRef.current;
      eventsRef.current = [];
      const next = game1.step(cur, events, dtSec);

      const d1 = Math.round(next.p1) - prevP1;
      if (d1 !== 0) pulseRef.current.P1 = { dir: d1 > 0 ? 'up' : 'down', until: now + 160 };
      const d2 = Math.round(next.p2) - prevP2;
      if (d2 !== 0) pulseRef.current.P2 = { dir: d2 > 0 ? 'up' : 'down', until: now + 160 };

      // g1-gauge-max: once per player, the first moment the gauge nears max (≈100).
      // (The core applies decay every step, so the stored value never touches exactly 100 → judged by a near-upper-bound threshold.)
      if (!gaugeMaxRef.current.P1 && next.p1Gauge >= G1.GAUGE_MAX - 10) {
        gaugeMaxRef.current.P1 = true;
        sfx('g1-gauge-max');
      }
      if (!gaugeMaxRef.current.P2 && next.p2Gauge >= G1.GAUGE_MAX - 10) {
        gaugeMaxRef.current.P2 = true;
        sfx('g1-gauge-max');
      }

      gameRef.current = next; // for next-frame input (the core keeps mutating)
      setGame({ ...next }); // force re-render with a new reference (the core returns the same object, so cloning is required)
      setDebugGame(next);

      if (next.result !== null) {
        stopped = true; // stop the loop — ResultOverlay displays based on phase
        if (isOnlineRef.current) return; // online: the server drives round:end, the screen does not take part in result reporting
        if (!reportedRef.current) {
          reportedRef.current = true;
          reportRoundEnd(
            next.result === 'P1' ? 'P1_WIN' : next.result === 'P2' ? 'P2_WIN' : 'DRAW',
          );
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
      if (now - last > 280) step(now); // do not intervene if rAF is alive
    }, 250);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearInterval(watchdog);
    };
  }, [isOnline, myRole, flow.phase, flow.currentRound]);

  const displays = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  // Color depends on the player (not the role). fc.p1/.p2 = the actual player color of this round's P1/P2 functional entity.
  // Offline / no color info = default {p1:'blue', p2:'red'} → same as existing behavior. myColor = my color (for the YOU display).
  const fc = functionColors();
  const myColor = onlineStore.get().myColor ?? 'blue';
  const timeRemainingMs = Math.max(0, (GAME_DURATION - game.elapsed) * 1000);
  const urgent = flow.phase === 'playing' && game.result === null && timeRemainingMs <= 5000;

  const renderPanel = (role: PlayerRole) => {
    const isP1 = role === 'P1';
    const rawValue = isP1 ? game.p1 : game.p2;
    const value = Math.round(rawValue);
    const gauge = isP1 ? game.p1Gauge : game.p2Gauge;
    const hold = isP1 ? game.p1Hold : game.p2Hold;
    const disp = displays[role];

    const diff = value - game.target;
    const matched = Math.abs(value - game.target) < G1.MATCH_TOL;
    const holdProgress = Math.min(1, hold / G1.HOLD_TO_WIN);
    const near = !matched && Math.abs(diff) <= 5;
    const close = !matched && Math.abs(diff) <= 2;
    // Reinterpret the 1-second lock-in with the existing 3 lamps: light up in thirds of progress
    const holdLit = Math.min(3, Math.floor(holdProgress * 3));

    const pl = pulseRef.current[role];
    const dir = pl && pl.until > performance.now() ? pl.dir : null;
    // Paint with the actual player color of this entity (P1/P2 function), not the role.
    // 'blue'=existing P1 color (cyan --p1), 'red'=existing P2 color (pink --p2). Color selects the panel class/gauge/lamp color.
    const isBlue = (isP1 ? fc.p1 : fc.p2) === 'blue';
    const color = isBlue ? 'var(--p1)' : 'var(--p2)';
    const cls = [
      'g1-panel',
      isBlue ? 'g1-panel--p1' : 'g1-panel--p2',
      near ? 'g1-panel--near' : '',
      close ? 'g1-panel--close' : '',
      matched ? 'g1-panel--matched' : '',
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
        <span key={value} className="g1-panel__num font-arcade">
          {value}
        </span>
        {/* New mechanic: accumulated speed gauge (0~100) — neon bar (neon-coinop concept) */}
        <div className="g1-gauge-wrap">
          <span className="g1-gauge__cap font-arcade">SPEED</span>
          <div className="g1-gauge" aria-hidden>
            <div
              className="g1-gauge__fill"
              style={
                {
                  width: `${Math.max(0, Math.min(100, gauge))}%`,
                  '--gauge-color': color,
                } as CSSProperties
              }
            />
          </div>
        </div>
        {/* Coin lock-in: 3 match-hold progress lamps (splitting the 1-second lock-in into thirds, off on leaving — §3.1) */}
        <div className={`g1-hold ${matched ? '' : 'g1-hold--off'}`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`lamp ${i < holdLit ? 'lit' : ''}`}
              style={{ '--lamp-color': color } as CSSProperties}
            />
          ))}
          <span className="g1-hold__cap font-arcade">
            {holdProgress >= 1 ? 'LOCKED!' : 'HOLD'}
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
          ◀ Exit
        </Button>
      </header>

      <HudFrame
        p1={displays.P1}
        p2={displays.P2}
        roundWins={wins}
        roundCount={flow.roundConfig.roundCount}
        currentRound={flow.currentRound}
        timeRemainingMs={timeRemainingMs}
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
        <EndFlash active={game?.result != null} />
      </section>

      {/* Bottom control-key guide — shows the actually assigned keys (SPEC Q2) + lamps light at the input moment */}
      {/* Online uses only the two U/I keys, so it shows only my role's control in my color. Offline keeps the existing 2-player layout. */}
      {isOnline ? (
        <footer className="g1-pads g1-pads--online">
          <div className="g1-pad-group">
            {/* Color is my player color (myColor) — the role does not decide color. Action labels/icons are kept. */}
            <span
              className={`g1-pads-tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}
            >
              YOU · {myColor === 'blue' ? 'BLUE' : 'RED'}
            </span>
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="U" icon="▼" label="Down" lit={p2DownLit} />
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="I" icon="▲" label="Up" lit={p2UpLit} />
          </div>
          <span className="g1-pads-hint font-arcade">MATCH THE TARGET · HOLD 1 SEC</span>
        </footer>
      ) : (
        <footer className="g1-pads">
          <div className="g1-pad-group">
            <KeyCap role="P1" keyChar="Q" icon="▼" label="Down" lit={p1DownLit} />
            <KeyCap role="P1" keyChar="W" icon="▲" label="Up" lit={p1UpLit} />
          </div>
          <span className="g1-pads-hint font-arcade">MATCH THE TARGET · HOLD 1 SEC</span>
          <div className="g1-pad-group">
            <KeyCap role="P2" keyChar="U" icon="▼" label="Down" lit={p2DownLit} />
            <KeyCap role="P2" keyChar="I" icon="▲" label="Up" lit={p2UpLit} />
          </div>
        </footer>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}