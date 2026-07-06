/**
 * S10·S11 Game 2 — dodge the rockets (keep the neon-coinop screen · swap only the logic for the new core).
 * Container testid: scr-game4 / parts: game-stage, hud-*(built into HudFrame), btn-exit
 *
 * ── Principles of this swap ─────────────────────────────────────────────
 *  · UI · components · CSS classes · canvas effects stay 100% as-is.
 *  · Only game state/judgement is driven by the @madpump/shared game4 core (create/step).
 *  · New mechanic HP(3) → an element the existing screen lacked, so add 3 neon HP cells (--p2 color).
 *
 * Wiring:
 *   mount → if idle, startOfflineGame(4) (direct-URL recovery)
 *   each round game4.create(Math.random)
 *   rAF loop → game4.step(state, events, dtSec) → setDebugGame(state) every tick
 *   input via attachLocalKeyboard(GameInputEvent queue) → passed straight to step (edge/hold handled by the core)
 *   result('P1'|'P2') settled → (after RESULT_FX_MS effect) reportRoundEnd(mapping) once → <ResultOverlay />
 *   online mode → P2 (dodger) is a bot heuristic (synthesizes KeyU/KeyI down/up events), the human is P1 (q/w)
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { game4, G4, GAME_DURATION } from '@madpump/shared';
import type { Game4State, GameInputEvent, PlayerColor, Role } from '@madpump/shared';
import type { MatchResult } from '@/shell';
import { attachLocalKeyboard } from '../../game/input/keyboard';
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
import { functionColors, onlineStore, sendInput as onlineSendInput } from '../../net/online';
import { createEndTracker, drawEndFlash, type EndTracker } from '../../game/endFx';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import { sfx } from '@/audio';
import './game4.css';

// ---------------------------------------------------------------------------
// Canvas constants (logical resolution — responsive scaling via CSS). Field logical size is the core G4.W/H (800×450).
// The canvas is 1.2× that (960×540) to keep 16:9 — uniform X/Y scale.
// ---------------------------------------------------------------------------

const CW = 960;
const CH = 540;

const COL0 = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  p1: '#05d9e8',
  p1dim: '#0a3a4a',
  p2: '#ff2a6d',
  p2dim: '#4a0a26',
  accent: '#fdf500',
  accent2: '#d300c5',
  muted: '#9d8fbf',
} as const;

const ARCADE_FONT = '"Press Start 2P", monospace';

/** Launcher body half-width (render only — the core has no launcher hitbox) */
const LAUNCHER_HALF = 24;

/** In-game effect time between judgement → result overlay transition (hit shards / survival rush) */
const RESULT_FX_MS = 650;

/** Map core result('P1'|'P2'|'DRAW') → shell MatchResult */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): MatchResult {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

// ---------------------------------------------------------------------------
// Effects (render only — does not touch logic)
// ---------------------------------------------------------------------------

type Fx =
  | { kind: 'muzzle'; x: number; y: number; t: number }
  | { kind: 'reload'; t: number }
  | { kind: 'shards'; x: number; y: number; t: number }
  | { kind: 'caption'; text: string; color: string; x: number; y: number; t: number; life: number }
  | { kind: 'chroma'; t: number }
  | { kind: 'rush'; t: number };

interface Trail {
  x: number;
  t: number;
}

// ---------------------------------------------------------------------------
// Online mock bot — P2 (dodger) heuristic. Judgement logic is still the core (game4.step).
// Returns: movement direction (-1 left / 0 stop / 1 right)
// ---------------------------------------------------------------------------

function computeBotDir(s: Game4State): -1 | 0 | 1 {
  const x = s.p2X;
  const danger = G4.P2_W / 2 + G4.ROCKET_W / 2;
  let threatX: number | null = null;
  let bestEta = Infinity;
  for (const r of s.rockets) {
    if (r.vy <= 0) continue;
    if (r.y > G4.P2_Y) continue;
    const eta = (G4.P2_Y - r.y) / r.vy; // sec
    if (eta > 0.55) continue; // still room — reaction delay eases bot difficulty
    const bx = r.x + r.vx * eta; // predicted arrival x
    if (Math.abs(bx - x) < danger * 2.2 && eta < bestEta) {
      bestEta = eta;
      threatX = bx;
    }
  }
  if (threatX !== null) {
    let dir: 1 | -1 = x <= threatX ? -1 : 1; // away from the bullet
    const margin = G4.MARGIN + G4.P2_W / 2;
    const reach = s.p2Speed * Math.min(bestEta, 0.4);
    // if cornered against a wall, cross to the other side
    if (dir === -1 && x - reach < margin) dir = 1;
    if (dir === 1 && x + reach > G4.W - margin) dir = -1;
    return dir;
  }
  // no threat — return to center (deadzone ±12)
  const center = G4.W / 2;
  if (x < center - 12) return 1;
  if (x > center + 12) return -1;
  return 0;
}

// ---------------------------------------------------------------------------
// Rocket sprites (baked once) — blit instead of shadowBlur+gradient every frame.
//  · head: a fixed sprite baking core+glow into a radial gradient (replaces shadowBlur).
//  · tracer: a vertical gradient strip (head bright → tail transparent). Each rocket is
//    rotated to its velocity direction + stretched by tail length when drawn (keeps velocity-proportional afterglow).
// Even with N rockets there's no gradient allocation / shadowBlur = 0 → frame cost stays flat no matter how many projectiles.
// ---------------------------------------------------------------------------

let rocketSprites: { head: HTMLCanvasElement; tracer: HTMLCanvasElement } | null = null;
function getRocketSprites(): { head: HTMLCanvasElement; tracer: HTMLCanvasElement } {
  if (rocketSprites) return rocketSprites;
  const HR = 18; // head sprite radius (core+glow margin)
  const head = document.createElement('canvas');
  head.width = HR * 2;
  head.height = HR * 2;
  const TW = 6;
  const TH = 64;
  const tracer = document.createElement('canvas');
  tracer.width = TW;
  tracer.height = TH;
  const hc = head.getContext('2d');
  const tc = tracer.getContext('2d');
  if (hc && tc) {
    // head: bright center core → outer glow fade (bakes the shadowBlur=12 look)
    const hg = hc.createRadialGradient(HR, HR, 0, HR, HR, HR);
    hg.addColorStop(0, 'rgba(253,245,0,1)');
    hg.addColorStop(0.22, 'rgba(253,245,0,0.95)');
    hg.addColorStop(0.5, 'rgba(253,245,0,0.35)');
    hg.addColorStop(1, 'rgba(253,245,0,0)');
    hc.fillStyle = hg;
    hc.beginPath();
    hc.arc(HR, HR, HR, 0, Math.PI * 2);
    hc.fill();
    // tracer: y=0 (head, bright) → y=TH (tail, transparent). Width 3, centered.
    const tg = tc.createLinearGradient(0, 0, 0, TH);
    tg.addColorStop(0, 'rgba(253,245,0,0.75)');
    tg.addColorStop(1, 'rgba(253,245,0,0)');
    tc.fillStyle = tg;
    tc.fillRect(TW / 2 - 1.5, 0, 3, TH);
  }
  rocketSprites = { head, tracer };
  return rocketSprites;
}

// ---------------------------------------------------------------------------
// Canvas renderer (pure drawing — state is read-only)
// ---------------------------------------------------------------------------

function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game4State,
  fx: readonly Fx[],
  trail: readonly Trail[],
  now: number,
  p1IsYou: boolean,
): void {
  // Color depends on the player (not the role) — paint the P1/P2 functional entities with their actual player color.
  //  If the P1 entity color is blue, keep COL0 as-is; if red, swap the p1/p2 colors. Shadow the local COL → the COL.p1/p2 below reflect it automatically.
  const fc = functionColors();
  const COL =
    fc.p1 === 'red'
      ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
      : COL0;
  const X = (u: number) => (u / G4.W) * CW;
  const Y = (u: number) => (u / G4.H) * CH;
  const railP1 = Y(G4.LAUNCHER_Y);
  const railP2 = Y(G4.P2_Y);
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const hit = s.result === 'P1'; // shooter wins = P2 killed by a hit
  const resultFx = fx.find((f) => f.kind === 'chroma' || f.kind === 'rush');
  const resultAge = resultFx ? now - resultFx.t : Infinity;

  // --- Field (deep-purple drop space) ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // faint vertical grid — pink tone + rising scan when time is nearly up
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,42,109,0.14)' : 'rgba(211,0,197,0.09)';
  ctx.lineWidth = 1;
  for (let gx = 48; gx < CW; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, railP1 + 14);
    ctx.lineTo(gx, railP2 - 8);
    ctx.stroke();
  }
  if (urgent) {
    const off = 36 - ((now / 9) % 36); // horizontal lines flowing upward
    ctx.strokeStyle = 'rgba(255,42,109,0.10)';
    for (let gy = railP1 + 20 + off; gy < railP2 - 8; gy += 36) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(CW, gy);
      ctx.stroke();
    }
  }
  ctx.restore();

  // --- P1 rail (cyan) ---
  ctx.save();
  ctx.strokeStyle = COL.p1;
  ctx.globalAlpha = 0.75;
  ctx.shadowColor = COL.p1;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, railP1);
  ctx.lineTo(CW, railP1);
  ctx.stroke();
  ctx.restore();

  // --- P2 rail (pink = hit line) — rush glow on a survival win ---
  const rush = fx.find((f) => f.kind === 'rush');
  ctx.save();
  ctx.strokeStyle = COL.p2;
  ctx.shadowColor = COL.p2;
  if (rush) {
    const a = Math.min(1, (now - rush.t) / 250);
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 22;
    ctx.lineWidth = 4;
    const grad = ctx.createLinearGradient(0, railP2 - 46, 0, railP2);
    grad.addColorStop(0, 'rgba(255,42,109,0)');
    grad.addColorStop(1, `rgba(255,42,109,${0.28 * a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, railP2 - 46, CW, 46);
  } else {
    ctx.globalAlpha = 0.85;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
  }
  ctx.beginPath();
  ctx.moveTo(0, railP2);
  ctx.lineTo(CW, railP2);
  ctx.stroke();
  ctx.restore();

  // --- Rockets: yellow neon tracer (sprite blit — no shadowBlur/gradient allocation) ---
  const { head: headSprite, tracer: tracerSprite } = getRocketSprites();
  const uToCanvas = CW / G4.W; // logical→canvas scale (converts tail length)
  for (const r of s.rockets) {
    const bx = X(r.x);
    const by = Y(r.y);
    if (by < railP1 - 20) continue;
    const speed = Math.hypot(r.vx, r.vy);
    // tail = 0.28s of travel distance (canvas px). Align local +Y (head→tail) to the -velocity direction: θ=atan2(vx,-vy)
    const tailLen = Math.max(6, speed * 0.28 * uToCanvas);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(Math.atan2(r.vx, -r.vy));
    ctx.drawImage(tracerSprite, -tracerSprite.width / 2, 0, tracerSprite.width, tailLen);
    ctx.restore();
    // head glow (fixed size, rotation-independent) — sprite replacing shadowBlur
    ctx.drawImage(headSprite, bx - headSprite.width / 2, by - headSprite.height / 2);
  }

  // --- P1 launcher (cyan, auto-sweeps + direction read at a glance) ---
  const ax = X(s.launcherX);
  const muzzle = fx.find((f) => f.kind === 'muzzle');
  const recoil = muzzle && now - muzzle.t < 90 ? -3 : 0; // 1-frame recoil on fire
  const tw = X(LAUNCHER_HALF);
  ctx.save();
  ctx.translate(ax, railP1 + recoil);
  ctx.strokeStyle = COL.p1;
  ctx.fillStyle = COL.p1dim;
  ctx.shadowColor = COL.p1;
  ctx.shadowBlur = 9;
  ctx.lineWidth = 2;
  ctx.fillRect(-tw, -8, tw * 2, 14);
  ctx.strokeRect(-tw, -8, tw * 2, 14);
  ctx.fillRect(-4, 6, 8, 9); // muzzle (pointing down)
  ctx.strokeRect(-4, 6, 8, 9);
  // movement-direction chevron
  ctx.shadowBlur = 0;
  ctx.fillStyle = COL.p1;
  ctx.font = `9px ${ARCADE_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(s.launcherDir === 1 ? '▶' : '◀', s.launcherDir === 1 ? tw + 14 : -tw - 14, 2);
  // P1 badge (+ YOU blink when online)
  ctx.font = `10px ${ARCADE_FONT}`;
  ctx.fillText('P1', 0, -18);
  if (p1IsYou && Math.floor(now / 500) % 2 === 0) {
    ctx.fillStyle = COL.accent;
    ctx.fillText('YOU', 0, -32);
  }
  ctx.restore();

  // --- 3 ammo lamps (cooldown → reload indicator) ---
  const readyRatio = 1 - Math.min(1, Math.max(0, s.cooldown / G4.FIRE_COOLDOWN));
  const reload = fx.find((f) => f.kind === 'reload');
  const flicker = reload && now - reload.t < 160 && Math.floor(now / 40) % 2 === 0;
  const lit = flicker ? 0 : Math.floor(readyRatio * 3 + 1e-6);
  const lampBaseX = ax + tw + 16 + 2 * 13 > CW - 8 ? ax - tw - 16 - 2 * 13 : ax + tw + 16;
  for (let i = 0; i < 3; i++) {
    const lx = lampBaseX + i * 13;
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, railP1 - 14, 4, 0, Math.PI * 2);
    if (i < lit) {
      ctx.fillStyle = COL.p1;
      ctx.shadowColor = COL.p1;
      ctx.shadowBlur = 7;
      ctx.fill();
    } else {
      ctx.fillStyle = COL.deep;
      ctx.fill();
      ctx.strokeStyle = 'rgba(211,0,197,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- P2 runner (pink) + movement afterimage. Blinks during invulnerability (iframes). Right after a fatal hit, replaced with shards ---
  const dx = X(s.p2X);
  const rw = X(G4.P2_W / 2);
  const invulnBlink = s.iframes > 0 && Math.floor(now / 60) % 2 === 0;
  if (!(hit && resultAge < RESULT_FX_MS + 400)) {
    ctx.save();
    for (const tr of trail) {
      const age = now - tr.t;
      if (age > 240) continue;
      ctx.globalAlpha = age < 120 ? 0.22 : 0.1; // stepped-opacity afterimage
      ctx.fillStyle = COL.p2;
      ctx.fillRect(X(tr.x) - rw, railP2 - 7, rw * 2, 12);
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = invulnBlink ? 0.35 : 1;
    ctx.translate(dx, railP2);
    ctx.strokeStyle = COL.p2;
    ctx.fillStyle = COL.p2dim;
    ctx.shadowColor = COL.p2;
    ctx.shadowBlur = 9;
    ctx.lineWidth = 2;
    ctx.fillRect(-rw, -7, rw * 2, 12);
    ctx.strokeRect(-rw, -7, rw * 2, 12);
    ctx.shadowBlur = 0;
    ctx.fillStyle = COL.p2;
    ctx.beginPath();
    ctx.arc(0, -1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `10px ${ARCADE_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('P2', 0, 24);
    ctx.restore();
  }

  // --- Effects: muzzle spark / shards / caption ---
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'muzzle' && age < 90) {
      // cyan muzzle spark (cross-shaped glint)
      ctx.save();
      ctx.strokeStyle = COL.p1;
      ctx.shadowColor = COL.p1;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      const mx = X(f.x);
      const my = Y(f.y) + 18;
      ctx.beginPath();
      ctx.moveTo(mx - 8, my);
      ctx.lineTo(mx + 8, my);
      ctx.moveTo(mx, my - 8);
      ctx.lineTo(mx, my + 8);
      ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'shards' && age < 620) {
      // 6 pixel shards radiating out (hit)
      ctx.save();
      ctx.fillStyle = COL.p2;
      ctx.globalAlpha = Math.max(0, 1 - age / 620);
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI * 2 * i) / 6 + 0.5;
        const dist = 8 + age * 0.11;
        ctx.fillRect(cx + Math.cos(ang) * dist - 3, cy + Math.sin(ang) * dist - 3, 6, 6);
      }
      ctx.restore();
    } else if (f.kind === 'caption' && age < f.life) {
      const blinkOn = Math.floor(age / 120) % 2 === 0 || age > 240; // blinks in steps then stays on
      if (blinkOn) {
        ctx.save();
        ctx.font = `13px ${ARCADE_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 10;
        ctx.fillText(f.text, Math.min(CW - 70, Math.max(70, X(f.x))), Y(f.y));
        ctx.restore();
      }
    }
  }

  // --- Chromatic aberration at the moment of a hit (only at the win/loss instant) ---
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && now - chroma.t < 90) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(ctx.canvas, -4, 0, CW, CH); // cyan/pink offset ghost (self-copy)
    ctx.globalAlpha = 0.22;
    ctx.drawImage(ctx.canvas, 4, 0, CW, CH);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// JIT/paint prewarming — bring step·drawScene up to the optimized tier before the round starts.
// (Eases early cold-start lag. V8 has no force-compile API, so 'running it many times up front' is the only way.)
//
// Shape consistency is critical — if warmup and real play have different object structures, a deopt invalidates the warmup.
// So we don't hand-build state; we use only the 'real' path: create state with game4.create,
// feed game4.step actual KeyW events to genuinely spawn rockets (vx/vy as Double, identical to live play),
// and call drawScene with its real signature too. It's an offscreen canvas, so no on-screen flicker.
// Split into chunks (a little per frame) so the warmup itself doesn't become a spike.
// Return value = cancel function (cleans up rAF on unmount).
// ---------------------------------------------------------------------------

function prewarmGame2(): () => void {
  const scratch = document.createElement('canvas');
  scratch.width = CW;
  scratch.height = CH;
  const sctx = scratch.getContext('2d');
  if (!sctx) return () => {};

  let s = game4.create(Math.random);
  const fire: GameInputEvent[] = [{ code: 'KeyW', type: 'down', t: 0 }];
  const noEvents: GameInputEvent[] = [];
  const TOTAL = 300; // 300 iterations of step·drawScene is enough to enter the optimized tier
  const PER_FRAME = 6; // chunk: 6 per frame (≈50 frames/0.8s, comfortably within the 3s countdown)

  let i = 0;
  let raf = 0;
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    for (let k = 0; k < PER_FRAME && i < TOTAL; k++, i += 1) {
      // periodic KeyW → step spawns rockets the real way (cooldown handled by the core)
      s = game4.step(s, i % 8 === 0 ? fire : noEvents, 1 / 60);
      if (s.result) s = game4.create(Math.random); // reset when the round ends
      drawScene(sctx, s, [], [], i * 16, true);
    }
    if (i < TOTAL) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (raf) cancelAnimationFrame(raf);
  };
}

// ---------------------------------------------------------------------------
// Between-snapshot interpolation (extrapolation) — build a display state by advancing the server
// snapshot by dt seconds at each object's 'own velocity'. The snapshot already has vx/vy·p2Speed·launcherDir,
// so no ID matching is needed and zero extra latency. Only direction-change (bounce/reverse) moments have a tiny error, which the next snapshot corrects immediately.
// The goal is to smoothly bridge 30/60Hz snapshots into a 60fps render (removes rocket teleporting).
// ---------------------------------------------------------------------------

const clampField = (v: number): number => Math.min(G4.W - G4.MARGIN, Math.max(G4.MARGIN, v));

function extrapolate(s: Game4State, dt: number): Game4State {
  const p2dir = (s.rightHeld ? 1 : 0) - (s.leftHeld ? 1 : 0);
  return {
    ...s,
    p2X: clampField(s.p2X + p2dir * s.p2Speed * dt),
    launcherX: clampField(s.launcherX + s.launcherDir * G4.SCAN_SPEED * dt),
    rockets: s.rockets.map((r) => ({ ...r, x: r.x + r.vx * dt, y: r.y + r.vy * dt })),
  };
}

// ---------------------------------------------------------------------------
// Performance-metrics overlay (for tuning) — drawn directly on the canvas (no React re-render).
//  · Toggle with the ` (backtick) key, also turned on via the ?fps query, state kept in localStorage.
//  · FPS = last-0.5s average, max = worst frame time in the last 1s (spike detection), rockets = current bullet count.
//  · How to read: if max spikes big only once early, it's a mount/cold spike; if FPS stays ~30, it's an interpolation problem;
//    if max rises as rocket count grows, it's render (shadowBlur/gradient) cost.
// ---------------------------------------------------------------------------

const perf = {
  show: (() => {
    try {
      return localStorage.getItem('mp_fps') === '1' || /[?&]fps\b/.test(location.search);
    } catch {
      return false;
    }
  })(),
  last: 0,
  maxMs: 0,
  maxAt: 0,
  frames: 0,
  accum: 0,
  fps: 0,
};

function drawPerfHud(ctx: CanvasRenderingContext2D, now: number, rocketCount: number): void {
  if (perf.last) {
    const ms = now - perf.last;
    perf.frames += 1;
    perf.accum += ms;
    if (ms > perf.maxMs || now - perf.maxAt > 1000) {
      perf.maxMs = ms;
      perf.maxAt = now;
    } // 1-second rolling max (old peaks get replaced)
    if (perf.accum >= 500) {
      perf.fps = Math.round((perf.frames / perf.accum) * 1000);
      perf.frames = 0;
      perf.accum = 0;
    }
  }
  perf.last = now;
  if (!perf.show) return;
  ctx.save();
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(6, 6, 210, 20);
  ctx.fillStyle = perf.maxMs > 32 ? '#ff5b5b' : perf.maxMs > 20 ? '#ffd24a' : '#7cfc00';
  ctx.fillText(`FPS ${perf.fps}  max ${perf.maxMs.toFixed(1)}ms  rockets ${rocketCount}`, 12, 20);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Game4() {
  useDebugScreen('scr-game4');
  const flow = useFlow();
  const navigate = useNavigate();

  // 'Selective subscription' to only online-active/role — re-render only at round boundaries
  // where this value changes, not on every (60Hz) snapshot. (The old useOnlineGame subscribed to the whole store, causing 60Hz re-renders.)
  //  · sig = primitive string → useSyncExternalStore compares by value (Object.is) → no re-render if unchanged
  const readOnlineSig = () => {
    const o = onlineStore.get();
    const active =
      o.gameId === 4 &&
      o.role != null &&
      (o.phase === 'countdown' || o.phase === 'playing' || o.phase === 'round-result');
    return active ? `1:${o.role}:${o.myColor ?? 'blue'}` : '0';
  };
  const onlineSig = useSyncExternalStore(onlineStore.subscribe, readOnlineSig, readOnlineSig);
  const isOnline = onlineSig !== '0';
  const sigParts = onlineSig.split(':'); // ['1', role, color] | ['0']
  const myRole: Role | null = isOnline ? (sigParts[1] as Role) : null;
  // Color depends on the player (independent of role). Key caps/display use this color.
  const myColor: PlayerColor = isOnline ? (sigParts[2] as PlayerColor) : 'blue';
  // ref that lets the keyboard handler (stable closure) see the latest 'online active?' value.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<Game4State | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const botHeldRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const fxRef = useRef<Fx[]>([]);
  const trailRef = useRef<Trail[]>([]);
  // End effect: track the moment result changes from null → win/loss and draw the default flash.
  const endRef = useRef<EndTracker>(createEndTracker());
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const lastCloseRef = useRef(0);
  /** Time the last server snapshot was received (performance.now) — for computing render extrapolation dt */
  const snapAtRef = useRef(0);
  /** For online local prediction: my dodge key holds (U=left/I=right) */
  const localHeldRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  /** Online locally-predicted my paddle x (null=before first snapshot) */
  const predP2XRef = useRef<number | null>(null);
  /** Previous render frame time for prediction integration (performance.now) */
  const lastFrameRef = useRef(0);

  /** Remaining time for HUD display (quantized to seconds — saves re-renders) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);
  /** P2 HP (new mechanic — reflected in neon HP cells) */
  const [hp, setHp] = useState<number>(G4.MAX_HP);

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();

  // direct-URL recovery + clean up the debug bridge on leave
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 4) startOfflineGame(4);
    return () => setDebugGame(null);
  }, []);

  // Server snapshot → ref mirroring handled via 'direct store subscription' (no re-render).
  // Update only refs on each snapshot, and setState hp/remaining-time 'only when they actually change' → removes 60Hz re-renders.
  useEffect(() => {
    const sync = () => {
      const o = onlineStore.get();
      const activeNow =
        o.gameId === 4 &&
        o.role != null &&
        (o.phase === 'countdown' || o.phase === 'playing' || o.phase === 'round-result');
      if (!activeNow || !o.serverState) return;
      const s = o.serverState as Game4State;
      const prevSnap = stateRef.current; // the previous server snapshot before overwrite (for the transition guard)
      stateRef.current = s;
      snapAtRef.current = performance.now(); // reference point for extrapolation dt
      setDebugGame(s);
      // Play the hit/KO sound only at the moment the runner's HP first drops in this snapshot (dedup is the engine + this guard).
      if (prevSnap && s.hp < prevSnap.hp) {
        if (s.hp > 0) sfx('g4-hit');
        else sfx('g4-ko');
      }
      setHp(s.hp); // if the value is the same, React skips the re-render
      const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
      setHudMs(Math.ceil(remainingMs / 1000) * 1000); // quantize to seconds → re-render only ~1/s
    };
    sync(); // once initially
    return onlineStore.subscribe(sync); // called on every snapshot but triggers no re-render
  }, []);

  // Initialize canvas resolution (dpr scale)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // JIT/paint prewarming — once right after mount. It overlaps the countdown (3s) idle time
  // so step·drawScene are ready as optimized machine code before the real first frame. Return = unmount cleanup.
  useEffect(() => prewarmGame2(), []);

  // Performance overlay toggle — ` (backtick). State kept in localStorage.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Backquote') return;
      perf.show = !perf.show;
      try {
        localStorage.setItem('mp_fps', perf.show ? '1' : '0');
      } catch {
        /* localStorage unavailable — ignore */
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Keyboard — local adapter. Queue GameInputEvents and light the lamps.
  // (playerL Q/W = P1, playerR U/I = P2 — the core judges edge/hold)
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // Real server online: don't use the local queue/bot, send only to the server.
        // (KeyQ·KeyU=slot A, KeyW·KeyI=slot B. The server rewrites by my role, so any of the 4 keys goes to my slot.)
        if (isOnlineRef.current) {
          // Online uses only the U/I keys (requirement). U=primary key (slotA=left), I=secondary key (slotB=right). Q/W ignored.
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          // Hold state for local prediction (used to predict p2X when I'm the dodger P2). If attacker, it's set but never read.
          if (e.code === 'KeyU') localHeldRef.current.left = e.type === 'down';
          else localHeldRef.current.right = e.type === 'down';
          if (e.type === 'down') {
            if (e.code === 'KeyU') flashU();
            else flashI();
            // Online U/I is role-dependent: runner (P2) → left/right dodge; attacker (P1) → I=fire (U=change direction)
            if (myRole === 'P2') sfx('g4-dodge');
            else if (myRole === 'P1' && e.code === 'KeyI') sfx('g4-rocket-fire');
          }
          const slot = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          return;
        }

        const f = getFlow();
        const online = f.mode === 'online';
        // Light the lamp (on down) + don't absorb the P2 online key since the bot handles it
        if (e.code === 'KeyQ') {
          if (e.type === 'down') flashQ();
        } else if (e.code === 'KeyW') {
          if (e.type === 'down') {
            flashW();
            sfx('g4-rocket-fire'); // fire (attacker P1) input
          }
        } else if (e.code === 'KeyU') {
          if (online) return; // online mock: P2 (dodger) is a bot
          if (e.type === 'down') {
            flashU();
            sfx('g4-dodge'); // runner move-left input
          }
        } else if (e.code === 'KeyI') {
          if (online) return;
          if (e.type === 'down') {
            flashI();
            sfx('g4-dodge'); // runner move-right input
          }
        }
        if (f.phase === 'playing') actionsRef.current.push(e);
      },
    );
    return detach;
  }, [flashQ, flashW, flashU, flashI]);

  // Round lifecycle: create state → rAF loop (step+draw) → report result
  useEffect(() => {
    // ── Online (server-authoritative): no local sim/bot/result-report, just draw the server state (draw-only) ──
    if (isOnline) {
      // Before the first snapshot, set the initial create state for rendering only (not a judgement — the mirror effect overwrites it soon).
      if (!stateRef.current) {
        const seed = game4.create(Math.random);
        stateRef.current = seed;
        setDebugGame(seed);
        setHp(seed.hp);
        setHudMs(GAME_DURATION * 1000);
      }
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const ctx = canvasRef.current?.getContext('2d');
        const s = stateRef.current;
        if (ctx && s) {
          const p1IsYou = getPlayerDisplays(getFlow()).P1.isYou;
          fxRef.current = fxRef.current.filter((f) => now - f.t < 1200);
          const gs = s as Game4State;
          // (others') between-snapshot extrapolation: advance the last snapshot by elapsed dt at velocity (capped at 50ms).
          const extraDt = Math.min(0.05, Math.max(0, (now - snapAtRef.current) / 1000));
          let view = extraDt > 0 && gs.result === null ? extrapolate(gs, extraDt) : gs;
          // (my character) if dodger (P2), predict my paddle locally from live input → instant response, no rollback.
          //  reconciliation: when stopped, smoothly converge to the server value + snap only on large mismatches (round reset, etc.).
          if (myRole === 'P2' && gs.result === null) {
            const frameDt = lastFrameRef.current
              ? Math.min(0.05, (now - lastFrameRef.current) / 1000)
              : 0;
            const held = localHeldRef.current;
            const dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
            let px = predP2XRef.current;
            if (px === null || Math.abs(gs.p2X - px) > 150) px = gs.p2X; // snap on initial/round-reset/large desync
            px = clampField(px + dir * gs.p2Speed * frameDt); // predictive advance (same formula as the server)
            if (dir === 0) px += (gs.p2X - px) * 0.15; // converge to the server when stopped
            predP2XRef.current = px;
            view = { ...view, p2X: px };
          }
          lastFrameRef.current = now;
          drawScene(ctx, view, fxRef.current, trailRef.current, now, p1IsYou);
          endRef.current.update(s.result, now);
          drawEndFlash(ctx, CW, CH, endRef.current.age(now));
          drawPerfHud(ctx, now, view.rockets.length);
        }
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    if (flow.gameId !== 4 || flow.phase !== 'playing') return;

    const st = game4.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    botHeldRef.current = { left: false, right: false };
    fxRef.current = [];
    trailRef.current = [];
    reportedRef.current = false;
    resultAtRef.current = 0;
    lastCloseRef.current = 0;
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);
    setHp(st.hp);

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (isRoundIntroActive()) { last = now; return; }
      const dt = Math.min(0.1, (now - last) / 1000); // seconds, clamped at 100ms
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        // this frame's input = drained key events + (online) bot events
        const events = actionsRef.current;
        actionsRef.current = [];
        if (getFlow().mode === 'online') {
          const dir = computeBotDir(s);
          const wantLeft = dir === -1;
          const wantRight = dir === 1;
          const bh = botHeldRef.current;
          const tSec = now / 1000;
          if (wantLeft !== bh.left) {
            events.push({ code: 'KeyU', type: wantLeft ? 'down' : 'up', t: tSec });
            bh.left = wantLeft;
          }
          if (wantRight !== bh.right) {
            events.push({ code: 'KeyI', type: wantRight ? 'down' : 'up', t: tSec });
            bh.right = wantRight;
          }
        }

        // game4.step mutates the original state in-place and returns the same reference.
        // So previous-value comparisons must snapshot the scalars by value "before" the step call (no reference aliasing).
        const prevHp = s.hp;
        const prevCooldown = s.cooldown;
        const prevP2X = s.p2X;
        s = game4.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s); // debug bridge — update every tick
        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000); // quantize to seconds
        if (s.hp !== prevHp) setHp(s.hp);

        // ---- Derive render-only effects (does not touch logic) ----
        // fire: the moment cooldown rose from 0→FIRE_COOLDOWN
        if (s.cooldown > prevCooldown) {
          fxRef.current.push({ kind: 'muzzle', x: s.launcherX, y: G4.LAUNCHER_Y, t: now });
        }
        // brief flicker at reload-complete (the frame cooldown drained to 0)
        if (prevCooldown > 0 && s.cooldown === 0) {
          fxRef.current.push({ kind: 'reload', t: now });
        }
        // runner afterimage
        if (s.p2X !== prevP2X) {
          trailRef.current.push({ x: prevP2X, t: now });
        }
        trailRef.current = trailRef.current.filter((tr) => now - tr.t < 260);
        // non-fatal hit (HP drops, still alive) — shards + short caption
        if (s.hp < prevHp && s.hp > 0) {
          sfx('g4-hit'); // runner hit (HP drop)
          fxRef.current.push(
            { kind: 'shards', x: s.p2X, y: G4.P2_Y, t: now },
            {
              kind: 'caption',
              text: `HP ${s.hp}`,
              color: COL0.p2,
              x: s.p2X,
              y: G4.P2_Y - 10,
              t: now,
              life: 500,
            },
          );
        }
        // near-miss "CLOSE!" — when a rocket that just passed the hit line is near the runner (a miss) (throttled)
        if (s.result === null) {
          const danger = G4.P2_W / 2 + G4.ROCKET_W / 2;
          let nearX: number | null = null;
          let nd = Infinity;
          for (const r of s.rockets) {
            if (r.vy <= 0) continue;
            if (r.y >= G4.P2_Y && r.y <= G4.P2_Y + 46) {
              const d = Math.abs(r.x - s.p2X);
              if (d < nd) {
                nd = d;
                nearX = r.x;
              }
            }
          }
          if (nearX !== null && nd <= danger * 2.4 && nd > danger && now - lastCloseRef.current > 350) {
            lastCloseRef.current = now;
            fxRef.current.push({
              kind: 'caption',
              text: 'CLOSE!',
              color: COL0.p1,
              x: nearX,
              y: G4.P2_Y - 8,
              t: now,
              life: 400,
            });
          }
        }
        // effect at the judgement moment (glitch only at the win/loss instant)
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          if (s.result === 'P1') {
            // shooter wins = P2 killed by a hit
            sfx('g4-ko'); // HP 0 — runner shot down (death sound, victory jingle is the global layer)
            fxRef.current.push(
              { kind: 'chroma', t: now },
              { kind: 'shards', x: s.p2X, y: G4.P2_Y, t: now },
              {
                kind: 'caption',
                text: 'HIT!',
                color: COL0.p2,
                x: s.p2X,
                y: G4.P2_Y - 10,
                t: now,
                life: RESULT_FX_MS,
              },
            );
          } else {
            // dodger survives and wins
            fxRef.current.push(
              { kind: 'rush', t: now },
              {
                kind: 'caption',
                text: 'SURVIVED!',
                color: COL0.p2,
                x: G4.W / 2,
                y: G4.P2_Y - 12,
                t: now,
                life: RESULT_FX_MS,
              },
            );
          }
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // Online drives round/match transitions via the server (round:end) and OnlineController — the screen does not report.
        if (isOnline) return;
        // After briefly showing the hit/survival effect, report round end once → ResultOverlay
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        const p1IsYou = getPlayerDisplays(getFlow()).P1.isYou;
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1200); // clean up expired effects
        drawScene(ctx, s, fxRef.current, trailRef.current, now, p1IsYou);
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
        drawPerfHud(ctx, now, s.rockets.length);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= 5000;

  return (
    <main data-testid="scr-game4" className="g4-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g4-topbar">
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
        <span className="g4-title font-arcade c-muted">Game 4 · Missile Match</span>
      </div>

      <div className="g4-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g4-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g4-canvas" aria-label="Game 4 stage — Missile Match" />

        {/* New mechanic HP(3) — neon HP cells. P2 (dodger) remaining health */}
        <div className="g4-hp" aria-label={`P2 health ${hp}/${G4.MAX_HP}`}>
          <span className="g4-hp__label font-arcade">P2 HP</span>
          <div className="g4-hp__cells">
            {Array.from({ length: G4.MAX_HP }, (_, i) => (
              <span key={i} className={`g4-hp__cell ${i < hp ? 'on' : ''}`} aria-hidden />
            ))}
          </div>
        </div>
      </div>

      {/* On-screen key caps — show the actually-assigned keys (SPEC Q2), lamp lights on input */}
      {isOnline ? (
        // Online: use only the U/I keys. Show my role's action in my color only (asymmetric game — role-conditional).
        <div className="g4-keys g4-keys--online">
          <div className="g4-keys__group">
            <span className={`g4-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myColor === 'blue' ? 'BLUE' : 'RED'} · {myRole === 'P1' ? 'ATTACK' : 'DODGE'}
            </span>
            <KeyCap
              role={myColor === 'blue' ? 'P1' : 'P2'}
              keyChar="U"
              icon={myRole === 'P1' ? '⇄' : '◀'}
              lit={uLit}
              label={myRole === 'P1' ? 'Change direction' : 'Left'}
            />
            <KeyCap
              role={myColor === 'blue' ? 'P1' : 'P2'}
              keyChar="I"
              icon={myRole === 'P1' ? '◉' : '▶'}
              lit={iLit}
              label={myRole === 'P1' ? 'Fire' : 'Right'}
            />
          </div>
        </div>
      ) : (
        <div className="g4-keys">
          <div className="g4-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="⇄" lit={qLit} label="Change direction" />
            <KeyCap role="P1" keyChar="W" icon="◉" lit={wLit} label="Fire" />
            <span className="g4-keys__tag font-arcade c-p1">P1 · ATTACK</span>
          </div>
          <div className="g4-keys__group">
            <span className="g4-keys__tag font-arcade c-p2">P2 · DODGE</span>
            <KeyCap role="P2" keyChar="U" icon="◀" lit={uLit} label="Left" />
            <KeyCap role="P2" keyChar="I" icon="▶" lit={iLit} label="Right" />
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}