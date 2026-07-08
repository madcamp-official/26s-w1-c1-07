/**
 * S12 Game 3 — Fencing (scr-game2). Owner: game2 agent.
 *
 * The screen (UI/components/CSS classes/effects) is kept exactly as the neon-coinop mockup,
 * and only the game logic is swapped for the game-test tuning core (@madcade/shared `game2`).
 *
 * The new core is not 1-second-tick rock-paper-scissors but "real-time knockback fencing":
 *   · c(-EDGE..+EDGE) = clash position of the two fencers. + side = P1 advantage (pushed right), - side = P2 advantage.
 *   · KeyQ/KeyU = attack (judged after a random windup), KeyW/KeyI = dodge (invincibility window).
 *   · Blocking with a dodge knocks the attacker back (PARRY); failing to block knocks the victim back (HIT); a missed dodge is a WHIFF knockback.
 *   · waterLevel (rising tide) narrows the fall line inward. Pushed off the ring = falls out.
 *   · At the 10-second end, the sign of c decides win/loss; a tie is DRAW.
 *
 * Wiring:
 *   - game2.create(Math.random) / game2.step(state, events, dt seconds) — do not reimplement judging
 *   - attachLocalKeyboard(now = round elapsed seconds, push) — KeyQ/W/U/I only
 *   - state.result('P1'|'P2'|'DRAW') → map to MatchResult then reportRoundEnd (once per round)
 *   - Online mode: P2 is a bot — ignore local u/i, push heuristic input onto the queue
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { game2, G2, GAME_DURATION } from '@madcade/shared';
import type { GameInputEvent, Game2State, FencerState } from '@madcade/shared';
import type { MatchResult, PlayerRole } from '@/shell';
import { setDebugGame, useDebugScreen } from '../../debug';
import {
  exitMatch,
  getFlow,
  getPlayerDisplays,
  getRoundWins,
  reportRoundEnd,
  startOfflineGame,
  useFlow,
} from '../../state/flow';
import { attachLocalKeyboard } from '../../game/input/keyboard';
import { useOnlineRender } from '../../net/useOnlineRender';
import { functionColors, sendInput as onlineSendInput } from '../../net/online';
import { Button, HudFrame, KeyCap, useKeyLamp } from '../../components';
import { EndFlash } from '../../game/EndFlash';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import { sfx } from '@/audio';
import './game2.css';

// Effect constants (non-invasive to logic — all judging is in the @madcade/shared core)
const RINGOUT_FX_MS = 1400; // result overlay after the fall + splash effect
const TIMEUP_FX_MS = 1000; // result overlay after the TIME UP! caption
const SAFE_SEGS = 5; // number of safety lamps left until the fall line

// Coordinate mapping — lay pos[-EDGE..EDGE] onto the arena deck (--sea-w 14% ~ 86%).
const EDGE = G2.EDGE; // 1.0
const HALF_GAP = G2.HALF_GAP; // 0.06
const HALF_TRACK = 36; // in %/EDGE units (deck width 72% ÷ 2)

type Pose = 'NEUTRAL' | 'ATTACK' | 'DODGE';

const POSE_ICON: Record<Pose, string> = { NEUTRAL: '·', ATTACK: '⚔', DODGE: '🛡' };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/**
 * Player color ('blue'|'red') → existing role CSS variable. Color is player-bound (not role-bound):
 * 'blue' = existing P1 color (--p1 cyan), 'red' = existing P2 color (--p2 pink).
 */
const colorVar = (c: 'blue' | 'red') => (c === 'blue' ? 'var(--p1)' : 'var(--p2)');

/** pos(-EDGE..EDGE) → arena horizontal % */
const posToPct = (pos: number) => 50 + clamp(pos, -1.14, 1.14) * HALF_TRACK;

/** Effective fall line for the current tide (same formula as the core) */
const effEdgeOf = (waterLevel: number) => Math.max(EDGE - waterLevel, HALF_GAP + 0.02);

/** Fencer pose — judged including a short visual hold of the attack/dodge window */
function poseOf(f: FencerState | undefined, now: number): Pose {
  if (!f || !f.attacks || !f.dodges) return 'NEUTRAL';
  let atk = -Infinity;
  let dod = -Infinity;
  for (const a of f.attacks) if (now >= a.press && now <= a.end + 0.16) atk = Math.max(atk, a.press);
  for (const d of f.dodges) if (now >= d.start && now <= d.end + 0.14) dod = Math.max(dod, d.start);
  if (atk === -Infinity && dod === -Infinity) return 'NEUTRAL';
  return atk >= dod ? 'ATTACK' : 'DODGE';
}

// ---------------------------------------------------------------------------
// Neon stick fencer (2px stroke outline — §3.3) — reused as-is from the mockup
// ---------------------------------------------------------------------------

function FencerSvg({ pose }: { pose: Pose }) {
  return (
    <svg viewBox="0 0 110 120" className={`g2-fencer g2-fencer--${pose.toLowerCase()}`} aria-hidden>
      {pose === 'ATTACK' && (
        <g>
          {/* Lunge: forward lean + horizontal sword thrust + glowing sword tip */}
          <circle cx="52" cy="30" r="9" />
          <line x1="52" y1="39" x2="42" y2="74" />
          <line x1="42" y1="74" x2="62" y2="100" />
          <line x1="62" y1="100" x2="71" y2="100" />
          <line x1="42" y1="74" x2="24" y2="100" />
          <line x1="50" y1="48" x2="72" y2="46" />
          <line x1="72" y1="46" x2="100" y2="46" />
          <circle cx="102" cy="46" r="3" className="g2-swordtip" />
          <line x1="50" y1="48" x2="36" y2="60" />
        </g>
      )}
      {pose === 'DODGE' && (
        <g>
          {/* Upper body retreat + shield arc deployment */}
          <circle cx="34" cy="34" r="9" />
          <line x1="34" y1="43" x2="42" y2="78" />
          <line x1="42" y1="78" x2="30" y2="102" />
          <line x1="42" y1="78" x2="54" y2="102" />
          <line x1="36" y1="54" x2="54" y2="58" />
          <path d="M 60 40 A 20 20 0 0 1 60 78" />
          <line x1="36" y1="54" x2="26" y2="70" />
          <line x1="26" y1="70" x2="32" y2="84" />
        </g>
      )}
      {pose === 'NEUTRAL' && (
        <g>
          {/* Neutral guard */}
          <circle cx="42" cy="26" r="9" />
          <line x1="42" y1="35" x2="40" y2="72" />
          <line x1="40" y1="72" x2="30" y2="100" />
          <line x1="40" y1="72" x2="50" y2="100" />
          <line x1="41" y1="46" x2="30" y2="58" />
          <line x1="41" y1="46" x2="58" y2="52" />
          <line x1="58" y1="52" x2="82" y2="42" />
          <circle cx="84" cy="41" r="2.2" className="g2-swordtip" />
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Wireframe sea (mockup zigzag 2~3 layers, steps sway — §3.3) — reused as-is from the mockup
// ---------------------------------------------------------------------------

function zigzag(y: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 12; i++) pts.push(`${i * 10},${y + (i % 2 === 0 ? 5 : -5)}`);
  return pts.join(' ');
}

function Sea({ side, splashKey }: { side: 'left' | 'right'; splashKey: number | null }) {
  return (
    <div className={`g2-sea g2-sea--${side}`} aria-hidden>
      <svg viewBox="0 0 120 60" preserveAspectRatio="none">
        <polyline points={zigzag(12)} className="g2-wave g2-wave--1" />
        <polyline points={zigzag(30)} className="g2-wave g2-wave--2" />
        <polyline points={zigzag(48)} className="g2-wave g2-wave--3" />
      </svg>
      {splashKey !== null && (
        <div className="g2-splash" key={splashKey}>
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function Game2() {
  useDebugScreen('scr-game2');
  const flow = useFlow();
  const navigate = useNavigate();

  // Seed the initial state with a valid create() (feed/p1/p2 exist even before the first server snapshot, e.g. during the online countdown).
  const [game, setGame] = useState<Game2State | null>(() => game2.create(Math.random));

  // Previous-value snapshot for detecting SFX transitions (stores scalars only — the core mutates the
  // same object in-place, so an object-reference diff isn't possible). Shared by both the offline rAF step and the online onSnapshot.
  const sfxRef = useRef({
    feedT: -Infinity,
    ripPress: { P1: -Infinity, P2: -Infinity } as Record<'P1' | 'P2', number>,
    combo: { P1: 0, P2: 0 } as Record<'P1' | 'P2', number>,
    ended: false,
  });
  // Called once per new game state (offline next / online server snapshot) — rings sfx only at the moment
  // something first changes versus the previous value (no per-frame spam). Side effects only — never touches state/render.
  const playTransitionSfx = (s: Game2State) => {
    const g = sfxRef.current;
    // feed: parry success → g2-parry, taking a knockback hit → g2-knockback (whiff is silent). Monotonic-t guard.
    let maxT = g.feedT;
    for (const ev of s.feed) {
      if (ev.t > g.feedT) {
        if (ev.kind === 'parry') sfx('g2-parry');
        else if (ev.kind === 'hit') sfx('g2-knockback');
      }
      if (ev.t > maxT) maxT = ev.t;
    }
    g.feedT = maxT;
    // riposte (counter window) trigger = the moment an attack with the riposte flag is created. Monotonic-press guard (per player).
    for (const name of ['P1', 'P2'] as const) {
      const f = name === 'P1' ? s.p1 : s.p2;
      let maxPress = g.ripPress[name];
      for (const a of f.attacks) {
        if (a.riposte && a.press > g.ripPress[name]) sfx('g2-riposte');
        if (a.riposte && a.press > maxPress) maxPress = a.press;
      }
      g.ripPress[name] = maxPress;
    }
    // combo: the moment the combo count increases (≥2 = threshold for the visible COMBO badge). The core resets it to 0 on a bad outcome.
    if (s.p1.combo > g.combo.P1 && s.p1.combo >= 2) sfx('g2-combo');
    if (s.p2.combo > g.combo.P2 && s.p2.combo >= 2) sfx('g2-combo');
    g.combo.P1 = s.p1.combo;
    g.combo.P2 = s.p2.combo;
    // ringout: the moment of a ring-out elimination (once). TIME UP win/loss is handled by the global fanfare → silent here.
    if (s.result !== null && !g.ended) {
      g.ended = true;
      const eff = effEdgeOf(s.waterLevel);
      const ring =
        (s.result === 'P2' && s.c - HALF_GAP <= -eff + 1e-4) ||
        (s.result === 'P1' && s.c + HALF_GAP >= eff - 1e-4);
      if (ring) sfx('g2-ringout');
    }
  };

  // Online render hook (standard performance structure) — 'selective subscription' to only active/role, mirroring the server
  // snapshot into stateRef (removes full-store subscription / effect churn). When truthy (isOnline), turn off the local
  // sim/bot, render server state, and only send my input. This screen draws DOM/SVG from game state rather than canvas, so the
  // per-snapshot work (= this game's 'draw') is done via setGame in onSnapshot (an actual re-render only on a new snapshot reference).
  const { isOnline, myRole, stateRef } = useOnlineRender<Game2State>(2, (s) => {
    setGame(s); // render the server-authoritative snapshot to DOM/SVG (= draw)
    setDebugGame(s);
    playTransitionSfx(s); // online: action sfx on server-snapshot transitions (the rAF loop is stopped when online)
  });
  // Ref that lets the input handler (stable closure) see the latest 'online active?' value.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const queueRef = useRef<GameInputEvent[]>([]);
  const reportedRef = useRef(false);
  const reportTimerRef = useRef<number | null>(null);
  const botRef = useRef<{ nextAt: number } | null>(null);

  // Keycap lamp (lights for 80ms at the moment of input — §1.4)
  const [litP1Atk, flashP1Atk] = useKeyLamp();
  const [litP1Dod, flashP1Dod] = useKeyLamp();
  const [litP2Atk, flashP2Atk] = useKeyLamp();
  const [litP2Dod, flashP2Dod] = useKeyLamp();
  const flashRef = useRef({
    P1: { key1: flashP1Atk, key2: flashP1Dod },
    P2: { key1: flashP2Atk, key2: flashP2Dod },
  });
  flashRef.current = {
    P1: { key1: flashP1Atk, key2: flashP1Dod },
    P2: { key1: flashP2Atk, key2: flashP2Dod },
  };

  // direct-URL recovery: with no match context, fall back to offline Game 3 (§3.3).
  // However, for a real-server online match, don't pollute it with the offline flow.
  useEffect(() => {
    if (isOnline) return;
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 2) startOfflineGame(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Round (re)start — create new @madcade/shared state on every currentRound change
  useEffect(() => {
    const f = getFlow();
    if (f.gameId !== 2 || f.currentRound < 1) return;
    const st = game2.create(Math.random);
    stateRef.current = st;
    queueRef.current = [];
    reportedRef.current = false;
    botRef.current = null;
    sfxRef.current = {
      feedT: -Infinity,
      ripPress: { P1: -Infinity, P2: -Infinity },
      combo: { P1: 0, P2: 0 },
      ended: false,
    };
    setGame({ ...st }); // the core returns the same object, so clone to force a new reference (re-render)
    setDebugGame(st);
  }, [flow.gameId, flow.currentRound]);

  // Online (real-server) snapshot mirroring is handled by the onSnapshot of useOnlineRender above (setGame = draw).
  // Since this screen renders DOM/SVG from game state, onSnapshot's setGame is effectively the "draw" of each snapshot.

  // Keyboard: KeyQ/KeyU = attack (key1), KeyW/KeyI = dodge (key2). now = round elapsed seconds.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => stateRef.current?.elapsed ?? 0,
      (e) => {
        const isP1 = e.code === 'KeyQ' || e.code === 'KeyW';
        const role: PlayerRole = isP1 ? 'P1' : 'P2';
        const key: 'key1' | 'key2' = e.code === 'KeyQ' || e.code === 'KeyU' ? 'key1' : 'key2';

        // Real-server online: don't use the local queue/bot, send to the server only (both down/up).
        // Slot A = primary key (Q/U), B = secondary key (W/I). Whatever role I am, the server rewrites by slot, so
        // pressing any of the local 4 keys (Q/W/U/I) is sent as my slot input.
        if (isOnlineRef.current) {
          // Online uses only the two U/I keys (requirement). U = primary key (slotA), I = secondary key (slotB). Q/W ignored.
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          flashRef.current[role][key](); // keep the lamp lit (U/I → P2 side)
          if (e.type === 'down' && slot === 'A') sfx('g2-clash'); // attack (U) keydown
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          return;
        }

        // ── Offline path (100% identical to before) ──
        if (e.type !== 'down') return; // the core judges down only
        const f = getFlow();
        // In offline mock bot mode (flow.mode==='online'), the P2 slot (u/i) is bot-only — ignore local key input
        if (f.mode === 'online' && role === 'P2') return;
        flashRef.current[role][key]();
        if (f.phase !== 'playing') return;
        if (key === 'key1') sfx('g2-clash'); // attack (Q/U) keydown — clash sound immediately on input
        queueRef.current.push(e);
      },
    );
    return detach;
  }, []);

  // Game loop — rAF (foreground) + interval watchdog (for backgrounded tabs). A shared clock (last) prevents double-stepping.
  useEffect(() => {
    // Online (real server): don't run the local step/bot/result-reporting.
    // This screen has no canvas and renders DOM/SVG from game state → onSnapshot's setGame drives a
    // re-render (= draw) on every server snapshot, so no separate draw loop is needed.
    if (isOnline) return;

    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      // During the round intro, pause the sim (skip the core step) + update last to avoid a dt jump on resume
      if (isRoundIntroActive()) {
        last = now;
        return;
      }
      const dtMs = clamp(now - last, 0, 250);
      last = now;
      const st = stateRef.current;
      if (!st || st.result !== null) return;
      const dt = dtMs / 1000;

      // Bot (online mock): real-time heuristic — dodge when a threat (imminent P1 attack) is detected, otherwise probabilistic attack/dodge
      if (getFlow().mode === 'online') {
        const t = st.elapsed;
        if (botRef.current === null) botRef.current = { nextAt: t + 0.25 + Math.random() * 0.3 };
        if (t >= botRef.current.nextAt) {
          const threat = st.p1.attacks.some((a) => !a.resolved && t <= a.end && a.start <= t + 0.16);
          let code: GameInputEvent['code'];
          if (threat && st.p2.dodgeCdUntil <= t) code = 'KeyI';
          else if (Math.random() < 0.62 && st.p2.attackCdUntil <= t) code = 'KeyU';
          else code = 'KeyI';
          queueRef.current.push({ code, type: 'down', t });
          const key: 'key1' | 'key2' = code === 'KeyU' ? 'key1' : 'key2';
          flashRef.current.P2[key]();
          botRef.current.nextAt = t + 0.12 + Math.random() * 0.22;
        }
      }

      const inputs = queueRef.current;
      queueRef.current = [];
      const next = game2.step(st, inputs, dt);
      stateRef.current = next;
      setGame({ ...next }); // the core returns the same object → clone to force a new reference (re-render every frame)
      setDebugGame(next);
      playTransitionSfx(next); // offline: action sfx on core step transitions (once each, guarded by previous value)

      // Win/loss decided → report the round result after the ring-out/time-up effect (once per round)
      // Online: the server drives round:end, so the screen doesn't participate in result reporting.
      if (isOnlineRef.current) return;
      if (next.result !== null && !reportedRef.current) {
        reportedRef.current = true;
        const effEdge = effEdgeOf(next.waterLevel);
        const ring =
          (next.result === 'P2' && next.c - HALF_GAP <= -effEdge + 1e-4) ||
          (next.result === 'P1' && next.c + HALF_GAP >= effEdge - 1e-4);
        const delay = ring ? RINGOUT_FX_MS : TIMEUP_FX_MS;
        const mr: MatchResult =
          next.result === 'P1' ? 'P1_WIN' : next.result === 'P2' ? 'P2_WIN' : 'DRAW';
        reportTimerRef.current = window.setTimeout(() => reportRoundEnd(mr), delay);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      step(now);
    };
    raf = requestAnimationFrame(loop);
    const iv = window.setInterval(() => step(performance.now()), 250);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
    };
  }, [isOnline, myRole]);

  // Unmount cleanup
  useEffect(
    () => () => {
      if (reportTimerRef.current !== null) clearTimeout(reportTimerRef.current);
      setDebugGame(null);
    },
    [],
  );

  // ------------------------------------------------------------------ Derived values
  // Legacy offline mock bot mode (flow.mode==='online') — label P2 as 'CPU'.
  // Real-server online is handled by the useOnlineRender(3) hook above (isOnline/myRole).
  const flowOnline = flow.mode === 'online';
  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);

  const now = game?.elapsed ?? 0;
  const c = game?.c ?? 0;
  const waterLevel = game?.waterLevel ?? 0;
  const effEdge = effEdgeOf(waterLevel);
  const p1 = game?.p1;
  const p2 = game?.p2;
  const result = game?.result ?? null;

  // Color is player-bound (not role-bound) — paint with the actual player color of the P1/P2 functional entities.
  // Offline/no-info defaults to {p1:'blue', p2:'red'} → same as before (P1 cyan / P2 pink).
  const fc = functionColors();
  const p1Color = colorVar(fc.p1); // color of the P1 entity (attacker's slot)
  const p2Color = colorVar(fc.p2); // color of the P2 entity (dodger's slot)
  // The online bottom control (YOU) is labeled by which color my role is.
  const myPlayerColor = myRole === 'P1' ? fc.p1 : fc.p2;
  const myColorVar = colorVar(myPlayerColor);

  const p1Pos = c - HALF_GAP;
  const p2Pos = c + HALF_GAP;

  const ringOut =
    result !== null && game !== null
      ? (result === 'P2' && p1Pos <= -effEdge + 1e-4) ||
        (result === 'P1' && p2Pos >= effEdge - 1e-4)
      : false;
  const p1Fell = result === 'P2' && ringOut;
  const p2Fell = result === 'P1' && ringOut;

  const timeRemainingMs =
    game !== null ? Math.max(0, GAME_DURATION - now) * 1000 : GAME_DURATION * 1000;
  const urgent = game !== null && result === null && timeRemainingMs <= 5000;

  // Tide width (both ends) — waterLevel (in EDGE units) as deck %
  const tideW = (waterLevel * HALF_TRACK).toFixed(2);

  // Safety lamps left until the fall line (relative to one's own cliff)
  const safeLit = (pos: number, ownCliff: number, fell: boolean) => {
    if (fell) return 0;
    const frac = clamp01(Math.abs(pos - ownCliff) / (2 * effEdge));
    return clamp(Math.round(frac * SAFE_SEGS), 0, SAFE_SEGS);
  };
  const litSafeP1 = safeLit(p1Pos, -effEdge, p1Fell);
  const litSafeP2 = safeLit(p2Pos, effEdge, p2Fell);

  // Advantage bar (momentum) — fills from the center in the direction of c's sign. Right = P1, left = P2.
  const advFrac = clamp(c / EDGE, -1, 1); // -1..1
  const advPct = Math.abs(advFrac) * 50; // relative to half width
  const advFillLeft = advFrac >= 0 ? 50 : 50 - advPct;
  const advColor = advFrac >= 0 ? p1Color : p2Color;
  const advMarkerLeft = 50 + advFrac * 50;

  const pose1 = poseOf(p1, now);
  const pose2 = poseOf(p2, now);

  const combo1 = p1?.combo ?? 0;
  const combo2 = p2?.combo ?? 0;
  const riposte1 = result === null && !!p1 && now < p1.riposteUntil;
  const riposte2 = result === null && !!p2 && now < p2.riposteUntil;

  // Latest feed event (HIT/PARRY/WHIFF neon flash)
  const lastFeed = game && game.feed && game.feed.length ? game.feed[game.feed.length - 1] : null;
  const feedFresh = lastFeed !== null && now - lastFeed.t < 0.9 && result === null;
  const feedText = lastFeed
    ? lastFeed.kind === 'hit'
      ? 'TOUCHÉ!'
      : lastFeed.kind === 'parry'
        ? 'PARRY!'
        : 'WHIFF'
    : '';
  const feedColor = lastFeed
    ? lastFeed.kind === 'whiff'
      ? 'var(--text-muted)'
      : lastFeed.victim === 'P1'
        ? p2Color
        : p1Color
    : 'var(--text)';
  const feedMultStr = lastFeed && lastFeed.mult && lastFeed.mult > 1.05 ? ` ×${lastFeed.mult.toFixed(1)}` : '';
  const feedPos = lastFeed ? (lastFeed.victim === 'P1' ? p1Pos : p2Pos) : 0;

  const ringOutFx = ringOut;
  const endcapColor =
    result === 'P1' ? p1Color : result === 'P2' ? p2Color : 'var(--accent2)';

  // Extra effects beside the fencer (combo/riposte/hit sparks)
  const fighterFx = (role: PlayerRole) => {
    const combo = role === 'P1' ? combo1 : combo2;
    const riposte = role === 'P1' ? riposte1 : riposte2;
    const spark =
      feedFresh &&
      lastFeed !== null &&
      lastFeed.victim === role &&
      (lastFeed.kind === 'hit' || lastFeed.kind === 'parry');
    return (
      <>
        {riposte && <span className="g3a-rip-badge font-arcade anim-blink">RIPOSTE</span>}
        {combo >= 2 && <span className="g3a-combo font-arcade">COMBO ×{combo}</span>}
        {spark && lastFeed && (
          <span key={`sp-${role}-${lastFeed.t.toFixed(3)}`} className="g2-sparks" aria-hidden>
            <i />
            <i />
          </span>
        )}
      </>
    );
  };

  // ------------------------------------------------------------------ Render
  return (
    <main data-testid="scr-game2" className="g2-root">
      <div className="vanish-grid dim" aria-hidden />
      <div className="g2-inner">
        <header className="g2-topbar">
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
          <div className="g2-hud">
            <HudFrame
              p1={players.P1}
              p2={players.P2}
              roundWins={wins}
              roundCount={flow.roundConfig.roundCount}
              currentRound={Math.max(1, flow.currentRound)}
              timeRemainingMs={timeRemainingMs}
            />
          </div>
        </header>

        <section data-testid="game-stage" className={`g2-stage crt-bezel ${urgent ? 'urgent' : ''}`}>
          <div className={`g2-arena ${result !== null ? 'g2-arena--glitch' : ''}`}>
            {/* Advantage meter — shows c's sign/magnitude (momentum) */}
            <div className="g3a-advbar" aria-hidden>
              <div className="g3a-advbar__track">
                <span className="g3a-advbar__mid" />
                <span
                  className="g3a-advbar__fill"
                  style={
                    {
                      left: `${advFillLeft}%`,
                      width: `${advPct}%`,
                      background: advColor,
                      color: advColor,
                    } as CSSProperties
                  }
                />
                <span className="g3a-advbar__marker" style={{ left: `${advMarkerLeft}%` }} />
              </div>
              <div className="g3a-advbar__cap font-arcade">
                <span style={{ color: p2Color }}>◀ P2</span>
                <span className="c-muted">CLASH</span>
                <span style={{ color: p1Color }}>P1 ▶</span>
              </div>
            </div>

            {/* Safety lamps left (until one's own cliff — §3.3 tone reused) */}
            <div className="g2-safe g2-safe--p1">
              <span className="g2-safe__label font-arcade" style={{ color: p1Color }}>P1 SAFE</span>
              <span className="lamps">
                {Array.from({ length: SAFE_SEGS }, (_, i) => (
                  <span
                    key={i}
                    className={`lamp ${i < litSafeP1 ? 'lit' : ''}`}
                    style={{ '--lamp-color': p1Color } as CSSProperties}
                  />
                ))}
              </span>
            </div>
            <div className="g2-safe g2-safe--p2">
              <span className="g2-safe__label font-arcade" style={{ color: p2Color }}>P2 SAFE</span>
              <span className="lamps">
                {Array.from({ length: SAFE_SEGS }, (_, i) => (
                  <span
                    key={i}
                    className={`lamp ${i < litSafeP2 ? 'lit' : ''}`}
                    style={{ '--lamp-color': p2Color } as CSSProperties}
                  />
                ))}
              </span>
            </div>

            {/* Sea (deep water beyond the cliffs at both ends) */}
            <Sea side="left" splashKey={p1Fell ? Math.floor(now * 10) : null} />
            <Sea side="right" splashKey={p2Fell ? Math.floor(now * 10) : null} />

            {/* Platform: grid top (cell ticks + edge warning) + #000 side face */}
            <div className="g2-deck" aria-hidden>
              <div className="g2-deck-top">
                {Array.from({ length: 12 }, (_, i) => (
                  <div
                    key={i}
                    className={`g2-cell ${i === 0 || i === 11 ? 'g2-cell--edge' : ''}`}
                  />
                ))}
              </div>
              <div className="g2-deck-face" />
            </div>

            {/* Tide — water rising inward with waterLevel (shows the shrinking ring) */}
            <div className="g3a-tide g3a-tide--left" style={{ width: `${tideW}%` }} aria-hidden />
            <div className="g3a-tide g3a-tide--right" style={{ width: `${tideW}%` }} aria-hidden />

            {/* Fencers — color is player-bound (not role-bound). Use the actual player color of the P1/P2 entities.
                Inner SVG/sparks/combo use currentColor, so setting the fencer's color alone is reflected automatically. */}
            <div
              className={`g2-fighter g2-fighter--rt g2-fighter--p1 ${p1Fell ? 'g2-fighter--fall' : ''} ${riposte1 ? 'g3a-riposte' : ''}`}
              style={{ left: `${posToPct(p1Pos)}%`, color: p1Color }}
              aria-label={`P1 position: ${litSafeP1} cells of margin until the fall line`}
            >
              <FencerSvg pose={pose1} />
              {fighterFx('P1')}
            </div>
            <div
              className={`g2-fighter g2-fighter--rt g2-fighter--p2 ${p2Fell ? 'g2-fighter--fall' : ''} ${riposte2 ? 'g3a-riposte' : ''}`}
              style={{ left: `${posToPct(p2Pos)}%`, color: p2Color }}
              aria-label={`P2 position: ${litSafeP2} cells of margin until the fall line`}
            >
              <FencerSvg pose={pose2} />
              {fighterFx('P2')}
            </div>

            {/* Judgment flash (HIT/PARRY/WHIFF) — neon caption at the victim's position */}
            {feedFresh && lastFeed && (
              <div
                key={`fd-${lastFeed.kind}-${lastFeed.victim}-${lastFeed.t.toFixed(3)}`}
                className="g3a-flash font-arcade glow-text"
                style={{ left: `${posToPct(feedPos)}%`, color: feedColor }}
              >
                {feedText}
                {feedMultStr}
              </div>
            )}

            {/* Round-end caption: ring-out win/loss / time-up judgment (effect just before the overlay) */}
            {game !== null && result !== null && flow.phase === 'playing' && (
              <div
                className="g2-endcap font-arcade glow-text anim-sign-on"
                style={{ color: endcapColor }}
              >
                {ringOutFx ? 'RING OUT!' : 'TIME UP!'}
              </div>
            )}

          </div>

          {/* Base end flash — white flash the instant result is decided (overlay relative to the stage container) */}
          <EndFlash active={game?.result != null} />
        </section>

        {/* Bottom: on-screen keycaps (showing the actual assigned keys — SPEC Q2) + stance feedback */}
        {isOnline ? (
          // Online: only the local player's (my role's) U/I controls, labeled in my color.
          // Fencing is a symmetric game (P1/P2 act identically: U=attack, I=dodge), so icons/labels are role-independent.
          <footer className="g2-controls g2-controls--online">
            <div className={`g2-pad ${myPlayerColor === 'blue' ? 'g2-pad--p1' : 'g2-pad--p2'}`}>
              <div className="g2-stance" style={{ color: myColorVar }}>
                <span className="g2-stance__label">
                  YOU · {myPlayerColor === 'blue' ? 'BLUE' : 'RED'}
                </span>
                <span className="g2-stance__icon">
                  {POSE_ICON[myRole === 'P1' ? pose1 : pose2]}
                </span>
              </div>
              <KeyCap
                role={myPlayerColor === 'blue' ? 'P1' : 'P2'}
                keyChar="U"
                icon="⚔"
                label="Attack"
                lit={litP2Atk}
              />
              <KeyCap
                role={myPlayerColor === 'blue' ? 'P1' : 'P2'}
                keyChar="I"
                icon="🛡"
                label="Dodge"
                lit={litP2Dod}
              />
            </div>
            <div className="g2-hint c-muted">
              Real-time knockback — attack (⚔) pushes the opponent, and blocking with a dodge (🛡) counters back · the tide tightens the ring ·
              pushed off the ring means falling out
            </div>
          </footer>
        ) : (
          <footer className="g2-controls">
            <div className="g2-pad g2-pad--p1">
              <KeyCap role="P1" keyChar="Q" icon="⚔" label="Attack" lit={litP1Atk} />
              <KeyCap role="P1" keyChar="W" icon="🛡" label="Dodge" lit={litP1Dod} />
              <div className="g2-stance c-p1">
                <span className="g2-stance__label">STANCE</span>
                <span className="g2-stance__icon">{POSE_ICON[pose1]}</span>
              </div>
            </div>
            <div className="g2-hint c-muted">
              Real-time knockback — attack (⚔) pushes the opponent, and blocking with a dodge (🛡) counters back · the tide tightens the ring ·
              pushed off the ring means falling out
            </div>
            <div className="g2-pad g2-pad--p2">
              <div className="g2-stance c-p2">
                <span className="g2-stance__label">{flowOnline ? 'CPU' : 'STANCE'}</span>
                <span className="g2-stance__icon">{POSE_ICON[pose2]}</span>
              </div>
              <KeyCap role="P2" keyChar="U" icon="⚔" label="Attack" lit={litP2Atk} />
              <KeyCap role="P2" keyChar="I" icon="🛡" label="Dodge" lit={litP2Dod} />
            </div>
          </footer>
        )}
      </div>

      {/* Round/match result overlay (shared, owned by game1 — import only) */}
      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}
