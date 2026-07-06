/**
 * Game 8 · Magma Shootout Duel (NEON COIN-OP). Owner: game7 agent.
 * Container testid: scr-game7 / parts: game-stage(CRT bezel), hud-*(HudFrame embedded), btn-exit
 *
 * ── Game (core game7) summary ─────────────────────────────────────────────
 *  · P1 (left cyan) and P2 (right pink) face off; the first to hit the opponent wins.
 *  · Both ships spawn at the top and fall under gravity — Q/U for a small jump (flappy), W/I for horizontal fire (cooldown).
 *  · Floor magma rises over 10s (H→H/2); touching it is instant death. Touching the ceiling spikes (0~SPIKE_H) is also instant death.
 *  · A bullet reaches the opponent in 0.5s → after firing, the opponent can change height to dodge.
 *  · Hit = the shooter wins / magma·spikes = the one who touched loses / surviving 10s = DRAW.
 *
 * ── Screen (neon-coinop, from scratch) ─────────────────────────────────
 *  · Logical 800×450 canvas (=G7.W/H, coords 1:1) + DPR scale, CSS 16:9 responsive.
 *  · Restrained glow elements: magma (yellow/heat), P1 (cyan), P2 (pink) — 3 glow families.
 *    Ceiling spikes·grid are non-glowing dim lines. No large areas of pure color (dim base + 2px border).
 *  · Entrance sign-on flicker (≈420ms), chromatic glitch only at the win/loss moment. Respects reduced-motion.
 *  · Scanlines are global (App) — do not render them redundantly here.
 *
 * ── Wiring (same envelope as games 1·2) ────────────────────────────────
 *  · game7.create(Math.random) / game7.step(state, events, dtSec)
 *  · attachLocalKeyboard: KeyQ/KeyW=P1, KeyU/KeyI=P2. The core handles only 'down' (edge fire/jump).
 *  · step mutates the original then returns the same reference → compare previous values via a scalar snapshot taken before the call.
 *  · result confirmed → short FX (RESULT_FX_MS) then reportRoundEnd once → <ResultOverlay />
 *  · online mode → P2 is a bot (survival hover + fires when aligned + bullet-dodge heuristic).
 *  · setDebugGame(state) every tick, setDebugGame(null) on unmount.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { game7, G7, GAME_DURATION, magmaSurfaceY } from '@madpump/shared';
import type { Game7State, GameInputEvent } from '@madpump/shared';
import type { MatchResult } from '@/shell';
import { attachLocalKeyboard } from '../../game/input/keyboard';
import { useOnlineRender } from '../../net/useOnlineRender';
import { functionColors, onlineStore, sendInput as onlineSendInput } from '../../net/online';
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
import { createEndTracker, drawEndFlash, type EndTracker } from '../../game/endFx';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import { sfx } from '@/audio';
import './game7.css';

// ---------------------------------------------------------------------------
// Canvas = core logical resolution (800×450) as-is → no coord transform needed (1:1).
// ---------------------------------------------------------------------------
const CW = G7.W;
const CH = G7.H;

const COL0 = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  bg: '#0d0221', // --bg
  p1: '#05d9e8',
  p1dim: '#0a3a4a',
  p2: '#ff2a6d',
  p2dim: '#4a0a26',
  accent: '#fdf500',
  accent2: '#d300c5',
  error: '#ff3864',
  win: '#39ff88',
  muted: '#9d8fbf',
} as const;

const ARCADE_FONT = '"Press Start 2P", monospace';

/**
 * Color is player-dependent (independent of role) — a palette that swaps P1/P2 entity colors to the 'player color' per functionColors().
 * If fc.p1==='red', swap p1/p2 (and dim) so P1 entity=red (pink)·P2 entity=blue (cyan).
 * If offline / no color info, fc={p1:'blue',p2:'red'} → COL0 as-is (keeps the existing look).
 */
function themedCols() {
  const fc = functionColors();
  return fc.p1 === 'red'
    ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
    : COL0;
}

/** Duration of the in-game effect (hit shards/glitch) between the verdict → the result overlay */
const RESULT_FX_MS = 620;

/** core result → shell MatchResult */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): MatchResult {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Round-end impact SFX (loser sign) — call only once at the result transition moment (guarded by the caller).
 *  · The victory fanfare is played by the global layer, so no victory jingle is played here.
 *  · Loser detection: if a winner bullet overlaps the loser rect it's a hit (g7-hit),
 *    otherwise if the feet are below the magma surface it's a fall death (g7-magma-death). Ceiling-spike death has no mapping (silent).
 */
function playRoundEndSfx(s: Game7State): void {
  const surf = magmaSurfaceY(s.elapsed);
  const inMagma = (y: number) => y + G7.PH / 2 >= surf;
  if (s.result === 'DRAW') {
    if (inMagma(s.p1Y) || inMagma(s.p2Y)) sfx('g7-magma-death');
    return;
  }
  if (s.result !== 'P1' && s.result !== 'P2') return;
  const winner = s.result === 'P1' ? 1 : 2;
  const loserX = s.result === 'P1' ? G7.P2_X : G7.P1_X;
  const loserY = s.result === 'P1' ? s.p2Y : s.p1Y;
  const hitByBullet = s.bullets.some(
    (b) =>
      b.owner === winner &&
      b.x + G7.BULLET_R > loserX - G7.PW / 2 &&
      b.x - G7.BULLET_R < loserX + G7.PW / 2 &&
      b.y + G7.BULLET_R > loserY - G7.PH / 2 &&
      b.y - G7.BULLET_R < loserY + G7.PH / 2,
  );
  if (hitByBullet) sfx('g7-hit');
  else if (inMagma(loserY)) sfx('g7-magma-death');
  // else: ceiling-spike death — no mapping (silent)
}

/** sign-on flicker off-window (blank frame during entrance). f = age/420 ∈ [0,1) */
function signOffWindow(f: number): boolean {
  return f < 0.29 || (f >= 0.45 && f < 0.59) || (f >= 0.75 && f < 0.84);
}

// ---------------------------------------------------------------------------
// Render-only effects (state is read-only — does not touch logic)
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'muzzle'; x: number; y: number; color: string; dir: 1 | -1; t: number }
  | { kind: 'shards'; x: number; y: number; color: string; t: number }
  | { kind: 'caption'; text: string; color: string; x: number; y: number; t: number; life: number }
  | { kind: 'chroma'; t: number };

interface DrawUi {
  p1IsYou: boolean;
  p2IsYou: boolean;
  mountAt: number;
  reduce: boolean;
}

// ---------------------------------------------------------------------------
// Online mock bot — controls P2 (pink). The core only reacts to 'down' events, so synthesize only down.
//   ① Survive: flappy hover in the safe zone between ceiling spikes ↔ rising magma.
//   ② Dodge: if an approaching P1 bullet (owner 1) overlaps in y, move the target to the opposite side.
//   ③ Fire: fire when aligned with the opponent in y + cooldown ready.
// Returns: the array of events synthesized this frame.
// ---------------------------------------------------------------------------
interface BotRefs {
  jumpAt: number;
  fireAt: number;
}
function computeBotEvents(
  s: Game7State,
  now: number,
  bot: BotRefs,
  onJump: () => void,
  onFire: () => void,
): GameInputEvent[] {
  const events: GameInputEvent[] = [];
  const t = now / 1000;
  const surf = magmaSurfaceY(s.elapsed);
  const safeTop = G7.SPIKE_H + G7.PH / 2 + 6; // min p2Y (avoid ceiling)
  const safeBottom = surf - G7.PH / 2 - 8; // max p2Y (avoid magma)

  // Default target: align to the opponent's height (clamped within the safe zone)
  let targetY = clamp(s.p1Y, safeTop + 8, safeBottom - 10);

  // Dodge: if an approaching P1 bullet overlaps in y, move to the opposite side of the safe zone
  for (const b of s.bullets) {
    if (b.owner !== 1) continue;
    const dist = G7.P2_X - b.x;
    if (dist > 4 && dist < 280 && Math.abs(b.y - s.p2Y) < 42) {
      const mid = (safeTop + safeBottom) / 2;
      targetY = b.y > mid ? safeTop + 10 : safeBottom - 12;
    }
  }

  // Flappy hover: if below the target (larger y) and not rising, jump (throttled)
  if (s.p2Y > targetY + 4 && s.p2Vy > -30 && now >= bot.jumpAt) {
    events.push({ code: 'KeyU', type: 'down', t });
    bot.jumpAt = now + 110 + Math.random() * 70;
    onJump();
  }

  // Fire: y-aligned + cooldown ready
  if (Math.abs(s.p1Y - s.p2Y) < 22 && s.p2Cd === 0 && now >= bot.fireAt) {
    events.push({ code: 'KeyI', type: 'down', t });
    bot.fireAt = now + 240 + Math.random() * 240;
    onFire();
  }
  return events;
}

// ---------------------------------------------------------------------------
// Canvas renderer (pure drawing)
// ---------------------------------------------------------------------------
function drawScene(ctx: CanvasRenderingContext2D, s: Game7State, fx: readonly Fx[], now: number, ui: DrawUi): void {
  // Color is player-dependent — the local COL overrides the COL.p1/p2 usages below (bullets·ships·FX) with the player color.
  const COL = themedCols();
  const surf = magmaSurfaceY(s.elapsed);
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const step120 = Math.floor(now / 120); // arcade step phase

  // ---- Background field ----
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // Non-glowing vertical grid + center divider (P1 | P2)
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,42,109,0.10)' : 'rgba(211,0,197,0.08)';
  ctx.lineWidth = 1;
  for (let gx = 100; gx < CW; gx += 100) {
    ctx.beginPath();
    ctx.moveTo(gx, G7.SPIKE_H + 6);
    ctx.lineTo(gx, surf - 4);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(211,0,197,0.14)';
  ctx.beginPath();
  ctx.moveTo(CW / 2, G7.SPIKE_H + 6);
  ctx.lineTo(CW / 2, surf - 4);
  ctx.stroke();
  ctx.restore();

  // Background watermark "VS" (purple, non-glowing outline — not a glow element)
  ctx.save();
  ctx.font = `bold 150px ${ARCADE_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(211,0,197,0.05)';
  ctx.strokeText('VS', CW / 2, CH / 2 - 20);
  ctx.restore();

  // ---- Ceiling spikes (non-glowing dim) ----
  ctx.save();
  ctx.fillStyle = COL.deep;
  ctx.fillRect(0, 0, CW, G7.SPIKE_H);
  ctx.fillStyle = 'rgba(255,56,100,0.35)';
  ctx.strokeStyle = 'rgba(255,56,100,0.6)';
  ctx.lineWidth = 1;
  const sw = 20;
  for (let x = 0; x < CW; x += sw) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + sw / 2, G7.SPIKE_H);
    ctx.lineTo(x + sw, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // ---- Magma (rising threat, yellow/heat glow = glow element 1) ----
  ctx.save();
  const mg = ctx.createLinearGradient(0, surf - 4, 0, CH);
  mg.addColorStop(0, 'rgba(253,245,0,0.85)');
  mg.addColorStop(0.14, 'rgba(255,56,100,0.85)');
  mg.addColorStop(1, 'rgba(74,10,38,0.96)');
  ctx.fillStyle = mg;
  ctx.fillRect(0, surf, CW, CH - surf);
  // Surface line (step wave + glow)
  ctx.shadowColor = COL.accent;
  ctx.shadowBlur = urgent ? 22 : 15;
  ctx.strokeStyle = COL.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= CW; x += 16) {
    const wob = ui.reduce ? 0 : Math.sin(x * 0.05 + step120) * 3;
    const y = surf + wob;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // ---- Bullets (trail + core dot, owner color = included in P1/P2 glow) ----
  for (const b of s.bullets) {
    const col = b.owner === 1 ? COL.p1 : COL.p2;
    const tx = b.x - b.vx * 0.1;
    ctx.save();
    const g = ctx.createLinearGradient(tx, b.y, b.x, b.y);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, col);
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, b.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(b.x, b.y, G7.BULLET_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- Player ships ----
  const drawShip = (
    cx: number,
    cy: number,
    color: string,
    dim: string,
    dir: 1 | -1,
    vy: number,
    cdReady: boolean,
    isYou: boolean,
    label: string,
    hidden: boolean,
  ) => {
    if (hidden) return;
    const halfW = G7.PW / 2;
    const halfH = G7.PH / 2;
    const inDanger = cy + halfH > surf - 22 || cy - halfH < G7.SPIKE_H + 16;
    ctx.save();
    // Jump thruster flame (while rising in flappy)
    if (!ui.reduce && vy < -30) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      const fh = 6 + (step120 % 2) * 4;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy + halfH);
      ctx.lineTo(cx + 5, cy + halfH);
      ctx.lineTo(cx, cy + halfH + fh);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.translate(cx, cy);
    ctx.fillStyle = dim;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillRect(-halfW, -halfH, G7.PW, G7.PH);
    ctx.strokeRect(-halfW, -halfH, G7.PW, G7.PH);
    // Barrel (toward the opponent)
    const bx = dir > 0 ? halfW : -halfW - 8;
    ctx.fillRect(bx, -3, 8, 6);
    ctx.strokeRect(bx, -3, 8, 6);
    // Cockpit dot
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(dir * 4, -2, 3, 0, Math.PI * 2);
    ctx.fill();
    // Reload-ready indicator (muzzle light dot)
    if (cdReady) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(dir > 0 ? halfW + 10 : -halfW - 10, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // Danger warning border (step-blink when near magma/spikes)
    if (inDanger && (ui.reduce || step120 % 2 === 0)) {
      ctx.strokeStyle = COL.error;
      ctx.lineWidth = 2;
      ctx.shadowColor = COL.error;
      ctx.shadowBlur = 10;
      ctx.strokeRect(-halfW - 3, -halfH - 3, G7.PW + 6, G7.PH + 6);
      ctx.shadowBlur = 0;
    }
    // Label
    ctx.font = `10px ${ARCADE_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.shadowBlur = 0;
    ctx.fillText(label, 0, -halfH - 8);
    if (isYou && (ui.reduce || Math.floor(now / 500) % 2 === 0)) {
      ctx.fillStyle = COL.accent;
      ctx.fillText('YOU', 0, -halfH - 22);
    }
    ctx.restore();
  };

  const loserHidden = (owner: 1 | 2) => {
    // During the hit/death effect, replace that ship with shards
    const chroma = fx.find((f) => f.kind === 'chroma');
    if (!chroma) return false;
    if (s.result === 'P1' && owner === 2) return now - chroma.t > 60;
    if (s.result === 'P2' && owner === 1) return now - chroma.t > 60;
    return false;
  };

  drawShip(G7.P1_X, s.p1Y, COL.p1, COL.p1dim, 1, s.p1Vy, s.p1Cd === 0, ui.p1IsYou, 'P1', loserHidden(1));
  drawShip(G7.P2_X, s.p2Y, COL.p2, COL.p2dim, -1, s.p2Vy, s.p2Cd === 0, ui.p2IsYou, 'P2', loserHidden(2));

  // ---- Effects (muzzle/shards/caption) ----
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'muzzle' && age < 90) {
      ctx.save();
      ctx.strokeStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      const mx = f.x;
      const my = f.y;
      ctx.beginPath();
      ctx.moveTo(mx - 8, my);
      ctx.lineTo(mx + 8, my);
      ctx.moveTo(mx, my - 8);
      ctx.lineTo(mx, my + 8);
      ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'shards' && age < 640) {
      ctx.save();
      ctx.fillStyle = f.color;
      ctx.globalAlpha = Math.max(0, 1 - age / 640);
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 8;
      for (let i = 0; i < 7; i++) {
        const ang = (Math.PI * 2 * i) / 7 + 0.4;
        const d = 8 + age * 0.14;
        ctx.fillRect(f.x + Math.cos(ang) * d - 3, f.y + Math.sin(ang) * d - 3, 6, 6);
      }
      ctx.restore();
    } else if (f.kind === 'caption' && age < f.life) {
      const on = ui.reduce || Math.floor(age / 110) % 2 === 0 || age > 240;
      if (on) {
        ctx.save();
        ctx.font = `16px ${ARCADE_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 12;
        ctx.fillText(f.text, clamp(f.x, 80, CW - 80), f.y);
        ctx.restore();
      }
    }
  }

  // ---- Win/loss chromatic glitch (only at the win/loss moment) ----
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && !ui.reduce && now - chroma.t < 90) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(ctx.canvas, -5, 0, CW, CH);
    ctx.globalAlpha = 0.22;
    ctx.drawImage(ctx.canvas, 5, 0, CW, CH);
    ctx.restore();
  }

  // ---- Entrance sign-on flicker (blank frame) ----
  if (!ui.reduce) {
    const age = now - ui.mountAt;
    if (age < 420 && signOffWindow(age / 420)) {
      ctx.fillStyle = COL.bg;
      ctx.fillRect(0, 0, CW, CH);
    }
  }
}

// ---------------------------------------------------------------------------
// Extrapolation (interpolation) between snapshots — a display-only copy that advances the server snapshot by dt seconds using each object's 'own physics'.
//  · Bullets: horizontal constant velocity (x += vx·dt). Ships: gravity integration (vy += G·dt, y += vy·dt) — same formula as core step.
//  · vx/vy are already in the snapshot, so no ID matching·zero added latency. Only jump/reversal moments have a tiny error, and
//    the next snapshot corrects it immediately. Smoothly bridges 30/60Hz snapshots at 60fps (removes bullet·ship teleporting).
//  · Not called once result is confirmed (win/loss positions stay at the server values).
// ---------------------------------------------------------------------------
function extrapolate(s: Game7State, dt: number): Game7State {
  const p1Vy = Math.min(G7.MAX_FALL, s.p1Vy + G7.GRAVITY * dt);
  const p2Vy = Math.min(G7.MAX_FALL, s.p2Vy + G7.GRAVITY * dt);
  return {
    ...s,
    p1Vy,
    p1Y: s.p1Y + p1Vy * dt,
    p2Vy,
    p2Y: s.p2Y + p2Vy * dt,
    bullets: s.bullets.map((b) => ({ ...b, x: b.x + b.vx * dt })),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Game7() {
  useDebugScreen('scr-game7');
  const flow = useFlow();
  const navigate = useNavigate();

  // ── Online render hook (performance standard): subscribe only to active/role → re-render only at round boundaries where the values change.
  //   Snapshots are mirrored via stateRef/snapAtRef (no re-render triggered); per-snapshot work is delegated to onSnapshot.
  const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game7State>(7, (s) => {
    setDebugGame(s); // debug bridge — updated every snapshot (the body of the old mirror effect)
  });
  // A stale-closure-preventing ref so the input handler (long-lived listener) always sees the latest 'is online active'
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  // My color (fixed per match, independent of role). KeyCap/YOU labels use this color — re-render only when the value changes (not every snapshot).
  const myColor = useSyncExternalStore(
    onlineStore.subscribe,
    () => onlineStore.get().myColor ?? 'blue',
    () => onlineStore.get().myColor ?? 'blue',
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const botRef = useRef<BotRefs>({ jumpAt: 0, fireAt: 0 });
  const fxRef = useRef<Fx[]>([]);
  const endRef = useRef<EndTracker>(createEndTracker());
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const mountAtRef = useRef(0);
  const reduceRef = useRef(false);
  /** Online local prediction: pending-jump flag for my ship (set on KeyU down, consumed in the loop) */
  const jumpPendingRef = useRef(false);
  /** Online locally-predicted y of my ship (null=before first snapshot / needs snap) */
  const predYRef = useRef<number | null>(null);
  /** Online locally-predicted vy of my ship (gravity-integration state) */
  const predVyRef = useRef(0);
  /** Timestamp of the previous render frame, used for prediction integration (performance.now) */
  const lastFrameRef = useRef(0);

  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();
  const lampRef = useRef({ flashU, flashI });
  lampRef.current = { flashU, flashI };

  // direct-URL recovery + debug bridge cleanup
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 7) startOfflineGame(7);
    reduceRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => setDebugGame(null);
  }, []);

  // Initialize canvas resolution (DPR scale)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // Keyboard — local adapter. Enqueues GameInputEvent + lights lamps.
  // (P1 Q/W, P2 U/I. When online, the bot handles P2 keys so they are not absorbed)
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // True server-online: does not use the local queue/bot → sends only to the server. The server rewrites my role,
        // so pressing any of the 4 keys (Q/W/U/I) goes to my slot (A=primary key Q·U / B=secondary key W·I).
        if (isOnlineRef.current) {
          // Online uses only the two keys U/I (requirement). U=primary key (slotA=jump), I=secondary key (slotB=fire). Q/W ignored.
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          if (e.code === 'KeyU') {
            // U=my ship jump. The down edge is also reflected in local prediction (immediate rise) — U=my jump for any role.
            if (e.type === 'down') {
              jumpPendingRef.current = true;
              flashU();
              sfx('g7-flap');
            }
          } else if (e.type === 'down') {
            flashI();
            sfx('g7-shoot');
          }
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          return;
        }
        // ── Offline path (as-is) — f.mode==='online' is a local bot match (absorbs P2 keys) ──
        const f = getFlow();
        const online = f.mode === 'online';
        if (e.code === 'KeyQ') {
          if (e.type === 'down') {
            flashQ();
            sfx('g7-flap');
          }
        } else if (e.code === 'KeyW') {
          if (e.type === 'down') {
            flashW();
            sfx('g7-shoot');
          }
        } else if (e.code === 'KeyU') {
          if (online) return;
          if (e.type === 'down') {
            flashU();
            sfx('g7-flap');
          }
        } else if (e.code === 'KeyI') {
          if (online) return;
          if (e.type === 'down') {
            flashI();
            sfx('g7-shoot');
          }
        }
        if (f.phase === 'playing') actionsRef.current.push(e);
      },
    );
    return detach;
  }, [flashQ, flashW, flashU, flashI]);

  // Round lifecycle: create state → rAF loop (step+draw) → report result.
  // Even if rAF stalls due to a background tab, the watchdog interval advances the timer (10s→DRAW).
  useEffect(() => {
    if (isOnline) {
      // Online: draws only the server-authoritative state (no step·bot·verdict reporting).
      // Before the first snapshot (state=null), draw the initial create state to avoid a blank canvas.
      if (!stateRef.current) stateRef.current = game7.create(Math.random);
      mountAtRef.current = performance.now();
      predYRef.current = null; // enter/re-enter boundary — re-snap my ship prediction on the next snapshot
      jumpPendingRef.current = false;
      resultAtRef.current = 0; // reset the guard used to detect the server result transition once
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const ctx = canvasRef.current?.getContext('2d');
        const s = stateRef.current;
        if (!ctx || !s) return;
        // Play the loser impact sound once, only on the frame where the server-authoritative result is first confirmed
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          playRoundEndSfx(s);
        }
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1200);
        const players = getPlayerDisplays(getFlow());

        // (others') Extrapolate between snapshots: advance the last snapshot by the elapsed dt using each object's physics (capped at 50ms).
        //  Bullet=horizontal constant velocity (vx), ship=gravity integration. Do not extrapolate at end (result) (server position as-is).
        const extraDt = Math.min(0.05, Math.max(0, (now - snapAtRef.current) / 1000));
        let view = extraDt > 0 && s.result === null ? extrapolate(s, extraDt) : s;

        // (my character) My ship is locally predicted from live input → immediate jump response·no rollback.
        //  Reconciliation: converge weakly toward the server value each frame + snap only on large discrepancies (round reset/death).
        if (myRole && s.result === null) {
          const frameDt = lastFrameRef.current ? Math.min(0.05, (now - lastFrameRef.current) / 1000) : 0;
          const myY = myRole === 'P1' ? s.p1Y : s.p2Y;
          const myVy = myRole === 'P1' ? s.p1Vy : s.p2Vy;
          let py = predYRef.current;
          let pvy = predVyRef.current;
          if (py === null || Math.abs(myY - py) > 80) {
            py = myY; // snap on initial/round-reset/large desync
            pvy = myVy;
          }
          if (jumpPendingRef.current) {
            pvy = -G7.JUMP_V; // reflect the jump immediately (same impulse as the core)
            jumpPendingRef.current = false;
          }
          pvy = Math.min(G7.MAX_FALL, pvy + G7.GRAVITY * frameDt); // gravity integration (same formula as the server)
          py = py + pvy * frameDt;
          py += (myY - py) * 0.08; // converge weakly toward the server (corrects latency·integration drift)
          predYRef.current = py;
          predVyRef.current = pvy;
          view = myRole === 'P1' ? { ...view, p1Y: py, p1Vy: pvy } : { ...view, p2Y: py, p2Vy: pvy };
        }
        lastFrameRef.current = now;

        drawScene(ctx, view, fxRef.current, now, {
          p1IsYou: players.P1.isYou,
          p2IsYou: players.P2.isYou,
          mountAt: mountAtRef.current,
          reduce: reduceRef.current,
        });
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    if (flow.gameId !== 7 || flow.phase !== 'playing') return;

    const st = game7.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    botRef.current = { jumpAt: 0, fireAt: 0 };
    fxRef.current = [];
    reportedRef.current = false;
    resultAtRef.current = 0;
    mountAtRef.current = performance.now();
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      // Pause the sim during the round intro (skip core step) + update `last` to prevent a dt jump on resume
      if (isRoundIntroActive()) {
        last = now;
        return;
      }
      const dt = Math.min(0.1, (now - last) / 1000); // in seconds, clamped to 100ms (prevents gravity runaway)
      if (dt <= 0) return;
      last = now;
      let s = stateRef.current;
      if (!s) return;
      // FX (muzzle/shards/caption) colors also use the player-dependent palette — offline is the same as the default role color.
      const COL = themedCols();

      if (s.result === null) {
        const events = actionsRef.current;
        actionsRef.current = [];
        if (getFlow().mode === 'online') {
          const botEvents = computeBotEvents(
            s,
            now,
            botRef.current,
            () => lampRef.current.flashU(),
            () => lampRef.current.flashI(),
          );
          for (const e of botEvents) events.push(e);
        }

        // step mutates the original in-place then returns the same reference → previous values come from a snapshot taken before the call
        const prevP1Cd = s.p1Cd;
        const prevP2Cd = s.p2Cd;
        const prevP1Y = s.p1Y;
        const prevP2Y = s.p2Y;
        s = game7.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);
        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);

        // At the firing moment (cooldown rises 0→FIRE_COOLDOWN) → muzzle spark
        if (s.p1Cd > prevP1Cd) {
          fxRef.current.push({ kind: 'muzzle', x: G7.P1_X + G7.PW / 2 + 8, y: prevP1Y, color: COL.p1, dir: 1, t: now });
        }
        if (s.p2Cd > prevP2Cd) {
          fxRef.current.push({ kind: 'muzzle', x: G7.P2_X - G7.PW / 2 - 8, y: prevP2Y, color: COL.p2, dir: -1, t: now });
        }

        // Verdict-moment effect (glitch only at the win/loss moment)
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          playRoundEndSfx(s); // loser impact sound (hit/fall) — this block runs once per round
          fxRef.current.push({ kind: 'chroma', t: now });
          if (s.result === 'P1') {
            fxRef.current.push(
              { kind: 'shards', x: G7.P2_X, y: s.p2Y, color: COL.p2, t: now },
              { kind: 'caption', text: 'K.O!', color: COL.p1, x: G7.P2_X, y: s.p2Y - 26, t: now, life: RESULT_FX_MS },
            );
          } else if (s.result === 'P2') {
            fxRef.current.push(
              { kind: 'shards', x: G7.P1_X, y: s.p1Y, color: COL.p1, t: now },
              { kind: 'caption', text: 'K.O!', color: COL.p2, x: G7.P1_X, y: s.p1Y - 26, t: now, life: RESULT_FX_MS },
            );
          } else {
            fxRef.current.push({
              kind: 'caption',
              text: 'TIME UP',
              color: COL.accent2,
              x: CW / 2,
              y: CH / 2 - 40,
              t: now,
              life: RESULT_FX_MS,
            });
          }
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // Online: the server drives round:end → the screen does not participate in result reporting.
        if (isOnline) return;
        // Show the hit/death effect briefly, then report once → ResultOverlay (phase transition → this effect's cleanup)
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1200);
        const players = getPlayerDisplays(getFlow());
        drawScene(ctx, s, fxRef.current, now, {
          p1IsYou: players.P1.isYou,
          p2IsYou: players.P2.isYou,
          mountAt: mountAtRef.current,
          reduce: reduceRef.current,
        });
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      frame(now);
    };
    raf = requestAnimationFrame(loop);
    // If rAF is throttled (background tab), the interval advances the timer — no intervention while rAF is alive
    const watchdog = setInterval(() => {
      const now = performance.now();
      if (now - last > 280) frame(now);
    }, 250);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(watchdog);
    };
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= 5000;

  return (
    <main data-testid="scr-game7" className="g7-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g7-topbar">
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
        <span className="g7-title font-arcade c-muted">Game 7 · Icarus Match</span>
      </div>

      <div className="g7-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g7-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g7-canvas" aria-label="Game 7 stage — Icarus Match" />

        {/* Hazard badges — rising magma / ceiling spikes (top-left, non-glowing caption) */}
        <div className="g7-hazard" aria-hidden>
          <span className="g7-hazard__row g7-hazard__row--spike font-arcade">▲ SPIKES</span>
          <span className="g7-hazard__row g7-hazard__row--magma font-arcade">MAGMA ▲</span>
        </div>
      </div>

      {/* On-screen keycaps — actual assigned keys (SPEC Q2), lamp lights on input */}
      {isOnline ? (
        // Online: local player controls only (U=jump / I=fire), labeled in my color
        <div className="g7-keys g7-keys--online">
          <div className="g7-keys__group">
            <span className={`g7-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myColor === 'blue' ? 'BLUE' : 'RED'} · HOVER · FIRE
            </span>
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="U" icon="▲" lit={uLit} label="Jump" />
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="I" icon="◉" lit={iLit} label="Fire" />
          </div>
        </div>
      ) : (
        <div className="g7-keys">
          <div className="g7-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="▲" lit={qLit} label="Jump" />
            <KeyCap role="P1" keyChar="W" icon="◉" lit={wLit} label="Fire" />
            <span className="g7-keys__tag font-arcade c-p1">P1 · CYAN</span>
          </div>
          <div className="g7-keys__group">
            <span className="g7-keys__tag font-arcade c-p2">P2 · PINK</span>
            <KeyCap role="P2" keyChar="U" icon="▲" lit={uLit} label="Jump" />
            <KeyCap role="P2" keyChar="I" icon="◉" lit={iLit} label="Fire" />
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}