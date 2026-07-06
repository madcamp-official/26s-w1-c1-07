/**
 * S? Game 6 — Dino Run (NEON COIN-OP). Owner: game6 agent.
 * Container testid: scr-game6 / parts: game-stage(CRT bezel), hud-*(HudFrame built-in), btn-exit
 *
 * ── Principles ────────────────────────────────────────────────────────
 *  · Logic/decisions use only the @madpump/shared game6 core(create/step) + G6 constants — no reimplementation.
 *  · The screen is built fresh from scratch on the neon-coinop concept(direct canvas render). No reference to the experimental folder.
 *
 * Game rules(core-comment summary):
 *  · P1(dino, cyan) = Q jump / W duck(hold). Survive 10 seconds and P1 wins.
 *  · P2(pink) = U cactus(ground obstacle, dodge by jumping) / I bird(head height, dodge by ducking).
 *    A shared cooldown(cooldown/cooldownMax) limits back-to-back spawns — prevents endless wall building.
 *  · A single collision and P2 wins instantly.
 *
 * Wiring(same contract as games 1·2):
 *  · direct-URL entry: if idle or gameId!==6, startOfflineGame(6)
 *  · each round game6.create(Math.random) → rAF loop game6.step(state, events, dtSec)
 *  · attachLocalKeyboard: KeyQ/KeyW=P1, KeyU/KeyI=P2. The core decides down/up(edge·hold).
 *  · step mutates the original then returns the same reference → prev-value comparisons are scalar snapshots taken before the call.
 *  · result decided → (after a short in-game effect) reportRoundEnd once → <ResultOverlay />
 *  · every tick setDebugGame(state), on unmount setDebugGame(null)
 *  · online mode: P2(obstacle spawning) is a bot — throws random obstacles each cooldown(the human is P1=q/w)
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { game6, G6, GAME_DURATION } from '@madpump/shared';
import type { Game6State, Obstacle, GameInputEvent } from '@madpump/shared';
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
import './game6.css';

// ---------------------------------------------------------------------------
// Canvas constants — the logical field is the core G6.W/H(800×450). The canvas is 1.2× (960×540) keeping 16:9.
// SX=SY=1.2 uniform scale, so logical→canvas conversion is a simple multiply.
// ---------------------------------------------------------------------------
const CW = 960;
const CH = 540;
const SC = CW / G6.W; // 1.2 (== CH / G6.H)

// Module default palette(P1=cyan/P2=pink). Colors must follow the 'player', not the 'role', so
// at the top of drawScene functionColors() shadows a local COL to swap the P1/P2 entity colors.
const COL0 = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  p1: '#05d9e8', // --p1 (dino — cyan)
  p1dim: '#0a3a4a', // --p1-dim
  p2: '#ff2a6d', // --p2 (obstacle — pink)
  p2dim: '#4a0a26', // --p2-dim
  accent: '#fdf500', // coin yellow
  accent2: '#d300c5', // neon purple(grid)
  muted: '#9d8fbf',
  win: '#39ff88',
} as const;

/** A palette with widened value types so it can also hold the swapped local palette(for sprite-helper args) */
type ColPalette = { readonly [K in keyof typeof COL0]: string };

const ARCADE_FONT = '"Press Start 2P", monospace';

/** In-game effect duration between decision → result-overlay transition(collision shards/survival rush) */
const RESULT_FX_MS = 700;

/** Core result('P1'|'P2'|'DRAW') → shell MatchResult mapping */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): MatchResult {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

// Background stars(parallax) — deterministic static placement, scrolled by elapsed
const STARS: readonly { x: number; y: number; z: number; r: number }[] = Array.from(
  { length: 34 },
  (_, i) => ({
    x: (i * 137.5) % CW,
    y: (i * 71.3) % 300,
    z: 0.15 + ((i * 53) % 100) / 300, // parallax speed factor
    r: 0.6 + ((i * 29) % 10) / 8,
  }),
);

// ---------------------------------------------------------------------------
// Render-only effects (non-invasive to logic)
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'dust'; x: number; y: number; t: number } // landing/jump dust
  | { kind: 'shards'; x: number; y: number; t: number } // collision shards
  | { kind: 'spawn'; x: number; y: number; t: number } // P2 throw flash
  | { kind: 'caption'; text: string; color: string; x: number; y: number; t: number; life: number }
  | { kind: 'chroma'; t: number } // chromatic aberration at the collision moment
  | { kind: 'rush'; t: number }; // survival-win rush

// Coordinate conversion
const X = (u: number) => u * SC;
const Y = (u: number) => u * SC;

// ---------------------------------------------------------------------------
// Sprites (neon outline — fill is dim, stroke is player color + glow)
// ---------------------------------------------------------------------------

/** Dino(P1, cyan). leftPx=box left px, bottomPx=box bottom px */
function drawDino(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  bottomPx: number,
  ducking: boolean,
  grounded: boolean,
  runPhase: number,
  blink: boolean,
  col: ColPalette,
): void {
  const boxH = ducking ? G6.DINO_DUCK_H : G6.DINO_H;
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => bottomPx - (boxH - y) * SC; // y: 0=top .. boxH=bottom

  ctx.save();
  ctx.strokeStyle = col.p1;
  ctx.fillStyle = col.p1dim;
  ctx.shadowColor = col.p1;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  if (blink) ctx.globalAlpha = 0.4;

  const poly = (pts: readonly (readonly [number, number])[]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(mx(x), my(y)) : ctx.moveTo(mx(x), my(y))));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  if (!ducking) {
    // Standing T-rex(facing right) silhouette
    poly([
      [4, 32], [12, 24], [12, 14], [19, 14], [19, 4], [40, 4],
      [41, 16], [30, 16], [30, 21], [27, 21], [27, 40], [13, 40], [13, 32],
    ]);
    // arm
    ctx.beginPath();
    ctx.moveTo(mx(28), my(23));
    ctx.lineTo(mx(33), my(27));
    ctx.stroke();
    // legs(running — alternated by runPhase). Tucked short when airborne.
    const step = Math.floor(runPhase * 14) % 2 === 0;
    const frontH = grounded ? (step ? 10 : 4) : 5;
    const backH = grounded ? (step ? 4 : 10) : 5;
    const leg = (bx: number, h: number) => {
      ctx.beginPath();
      ctx.rect(mx(bx), my(40), 5 * SC, h * SC);
      ctx.fill();
      ctx.stroke();
    };
    leg(13, backH);
    leg(21, frontH);
    // eye
    ctx.shadowBlur = 0;
    ctx.fillStyle = col.p1;
    ctx.beginPath();
    ctx.arc(mx(34), my(9), 1.6 * SC, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Ducked pose — low and long(head forward)
    poly([
      [0, 12], [10, 6], [22, 3], [44, 3], [44, 11], [33, 13], [14, 15], [8, 20], [2, 20],
    ]);
    const step = Math.floor(runPhase * 16) % 2 === 0;
    const frontH = step ? 8 : 4;
    const backH = step ? 4 : 8;
    const leg = (bx: number, h: number) => {
      ctx.beginPath();
      ctx.rect(mx(bx), my(20), 4.5 * SC, h * SC);
      ctx.fill();
      ctx.stroke();
    };
    leg(12, backH);
    leg(23, frontH);
    ctx.shadowBlur = 0;
    ctx.fillStyle = col.p1;
    ctx.beginPath();
    ctx.arc(mx(39), my(7), 1.5 * SC, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Cactus(P2 jump obstacle, pink). Base anchored to the ground */
function drawCactus(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  groundPx: number,
  col: ColPalette,
): void {
  const H = G6.CACTUS_H;
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => groundPx - (H - y) * SC; // y: 0=top .. H=bottom(ground)
  ctx.save();
  ctx.strokeStyle = col.p2;
  ctx.fillStyle = col.p2dim;
  ctx.shadowColor = col.p2;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.beginPath();
    ctx.rect(mx(x0), my(y1), (x1 - x0) * SC, (y1 - y0) * SC);
    ctx.fill();
    ctx.stroke();
  };
  seg(10, 4, 17, 46); // body
  seg(3, 18, 8, 30); // left arm vertical
  seg(6, 24, 11, 30); // left arm connector
  seg(19, 12, 24, 26); // right arm vertical
  seg(16, 20, 21, 26); // right arm connector
  ctx.restore();
}

/** Bird(P2 duck obstacle, pink). Flies in at head height + wing flap(phase) */
function drawBird(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  topPx: number,
  phase: number,
  col: ColPalette,
): void {
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => topPx + y * SC; // relative to box top (0..28)
  ctx.save();
  ctx.strokeStyle = col.p2;
  ctx.fillStyle = col.p2dim;
  ctx.shadowColor = col.p2;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  // body(beak on the left = travel direction)
  ctx.beginPath();
  const body: readonly [number, number][] = [
    [2, 14], [10, 9], [24, 8], [34, 10], [38, 15], [28, 19], [12, 19], [7, 16],
  ];
  body.forEach(([x, y], i) => (i ? ctx.lineTo(mx(x), my(y)) : ctx.moveTo(mx(x), my(y))));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // wing — flaps up/down
  const flap = Math.sin(phase * 16);
  ctx.beginPath();
  ctx.moveTo(mx(15), my(12));
  ctx.lineTo(mx(30), my(12));
  ctx.lineTo(mx(22), my(12 - 9 * flap));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // eye
  ctx.shadowBlur = 0;
  ctx.fillStyle = col.p2;
  ctx.beginPath();
  ctx.arc(mx(12), my(12), 1.4 * SC, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Scene renderer (pure drawing — state is read-only)
// ---------------------------------------------------------------------------
function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game6State,
  fx: readonly Fx[],
  now: number,
  p1IsYou: boolean,
  p2IsYou: boolean,
): void {
  // Colors are player-dependent(not role) — paint the P1/P2 function entities in the actual player colors.
  //  If the P1 entity is blue, keep COL0 as-is; if red, swap p1/p2 colors. Shadowing the local COL → COL.p1/p2 and helpers below reflect it automatically.
  const fc = functionColors();
  const COL: ColPalette =
    fc.p1 === 'red'
      ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
      : COL0;
  // rgb for state-driven P2 glow(spawn flash·reload-gauge outline) — follows the P2 player color, not hardcoded pink.
  const p2rgb = fc.p2 === 'red' ? '255,42,109' : '5,217,232';
  const horizon = Y(G6.GROUND_Y);
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const crashed = s.result === 'P2';
  const resultFx = fx.find((f) => f.kind === 'chroma' || f.kind === 'rush');
  const resultAge = resultFx ? now - resultFx.t : Infinity;
  const gridCol = urgent ? 'rgba(255,42,109,0.16)' : 'rgba(211,0,197,0.13)';

  // --- Sky field ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // --- Stars(parallax) ---
  ctx.save();
  ctx.fillStyle = COL.muted;
  for (const st of STARS) {
    const sx = (st.x - s.elapsed * G6.OBST_SPEED * SC * st.z * 0.25) % CW;
    const x = sx < 0 ? sx + CW : sx;
    ctx.globalAlpha = 0.15 + st.z * 0.3;
    ctx.fillRect(x, st.y, st.r, st.r);
  }
  ctx.restore();

  // --- Synthwave perspective grid below the ground ---
  ctx.save();
  const vpx = CW / 2;
  // converging vertical lines
  ctx.strokeStyle = gridCol;
  ctx.lineWidth = 1;
  for (let k = -7; k <= 7; k++) {
    ctx.beginPath();
    ctx.moveTo(vpx, horizon);
    ctx.lineTo(vpx + k * 96, CH);
    ctx.stroke();
  }
  // approaching horizontal lines(flowing downward = sense of forward motion)
  const gscroll = (s.elapsed * 0.7) % 1;
  const N = 9;
  for (let j = 0; j < N; j++) {
    const t = (j + gscroll) / N;
    const y = horizon + (CH - horizon) * t * t;
    ctx.globalAlpha = 0.15 + t * 0.55;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CW, y);
    ctx.stroke();
  }
  ctx.restore();

  // --- Ground line(cyan) + speed-dash scroll ---
  ctx.save();
  ctx.strokeStyle = COL.p1;
  ctx.shadowColor = COL.p1;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(CW, horizon);
  ctx.stroke();
  // short dashes on the ground(flowing left for a sense of speed)
  ctx.shadowBlur = 6;
  ctx.globalAlpha = 0.7;
  const gap = 60;
  const off = (s.elapsed * G6.OBST_SPEED * SC) % gap;
  ctx.lineWidth = 1.5;
  for (let x = -off; x < CW; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x, horizon + 8);
    ctx.lineTo(x + 22, horizon + 8);
    ctx.stroke();
  }
  ctx.restore();

  // Final 5 seconds: rising scanlines(pink)
  if (urgent) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,42,109,0.10)';
    ctx.lineWidth = 1;
    const so = 40 - ((now / 8) % 40);
    for (let y = so; y < horizon; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CW, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- Obstacles(pink) ---
  for (const o of s.obstacles) {
    if (o.type === 'jump') drawCactus(ctx, X(o.x), horizon, COL);
    else drawBird(ctx, X(o.x), Y(G6.BIRD_TOP), o.phase, COL);
  }

  // --- P2 throw flash(derived from spawnAnim) — the moment an obstacle pops out from the right edge ---
  if (s.spawnAnim > 0) {
    const a = Math.min(1, s.spawnAnim / G6.SPAWN_ANIM);
    ctx.save();
    ctx.globalAlpha = 0.5 * a;
    const grad = ctx.createLinearGradient(CW, 0, CW - 90, 0);
    grad.addColorStop(0, `rgba(${p2rgb},0.9)`);
    grad.addColorStop(1, `rgba(${p2rgb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(CW - 90, horizon - 150, 90, 170);
    ctx.restore();
  }

  // --- Dino(P1, cyan) ---
  const dinoBottom = horizon - Y(s.y);
  const blink = crashed && resultAge < RESULT_FX_MS && Math.floor(now / 60) % 2 === 0;
  const showDino = !(crashed && resultAge > RESULT_FX_MS * 0.55); // replaced by shards after collision
  if (showDino) {
    drawDino(
      ctx,
      X(G6.DINO_X),
      dinoBottom,
      s.ducking && s.grounded,
      s.grounded,
      s.runPhase,
      blink,
      COL,
    );
  }
  // Dino shadow(ground ellipse)
  if (s.result === null) {
    ctx.save();
    ctx.globalAlpha = s.grounded ? 0.35 : 0.18;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(X(G6.DINO_X + G6.DINO_W / 2), horizon + 3, X(22), 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- Player badge ---
  ctx.save();
  ctx.font = `10px ${ARCADE_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = COL.p1;
  ctx.shadowColor = COL.p1;
  ctx.shadowBlur = 6;
  ctx.fillText('P1', X(G6.DINO_X + G6.DINO_W / 2), dinoBottom - Y(G6.DINO_H) - 8);
  if (p1IsYou && Math.floor(now / 500) % 2 === 0) {
    ctx.fillStyle = COL.accent;
    ctx.shadowColor = COL.accent;
    ctx.fillText('YOU', X(G6.DINO_X + G6.DINO_W / 2), dinoBottom - Y(G6.DINO_H) - 22);
  }
  ctx.restore();

  // --- P2 reload gauge(top-right) — exposes core cooldown/cooldownMax ---
  {
    const ready = s.cooldown <= 0;
    const ratio = ready ? 1 : 1 - s.cooldown / Math.max(0.0001, s.cooldownMax);
    const gw = 150;
    const gh = 12;
    const gx = CW - gw - 20;
    const gy = 18;
    ctx.save();
    ctx.font = `9px ${ARCADE_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = COL.p2;
    ctx.shadowColor = COL.p2;
    ctx.shadowBlur = ready ? 8 : 0;
    ctx.fillText(p2IsYou ? 'P2(YOU) RELOAD' : 'P2 RELOAD', gx + gw, gy - 4);
    ctx.shadowBlur = 0;
    // track
    ctx.strokeStyle = `rgba(${p2rgb},0.4)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.fillStyle = COL.p2dim;
    ctx.fillRect(gx, gy, gw, gh);
    // fill
    const blinkReady = ready && Math.floor(now / 200) % 2 === 0;
    ctx.fillStyle = COL.p2;
    ctx.globalAlpha = ready ? (blinkReady ? 1 : 0.75) : 0.9;
    ctx.shadowColor = COL.p2;
    ctx.shadowBlur = ready ? 10 : 4;
    ctx.fillRect(gx + 1, gy + 1, (gw - 2) * ratio, gh - 2);
    ctx.restore();
  }

  // --- Effects ---
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'dust' && age < 320) {
      ctx.save();
      ctx.fillStyle = COL.muted;
      ctx.globalAlpha = Math.max(0, 0.5 - age / 640);
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 4; i++) {
        const d = 4 + age * 0.06 + i * 3;
        ctx.fillRect(cx - d, cy - (i % 2) * 3, 3, 3);
      }
      ctx.restore();
    } else if (f.kind === 'shards' && age < 640) {
      ctx.save();
      ctx.fillStyle = COL.p1;
      ctx.shadowColor = COL.p1;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = Math.max(0, 1 - age / 640);
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 7; i++) {
        const ang = (Math.PI * 2 * i) / 7 + 0.4;
        const dist = 8 + age * 0.13;
        ctx.fillRect(cx + Math.cos(ang) * dist - 3, cy + Math.sin(ang) * dist - 3, 6, 6);
      }
      ctx.restore();
    } else if (f.kind === 'spawn' && age < 260) {
      ctx.save();
      ctx.strokeStyle = COL.p2;
      ctx.shadowColor = COL.p2;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.globalAlpha = Math.max(0, 1 - age / 260);
      const mx = X(f.x);
      const myv = Y(f.y);
      ctx.beginPath();
      ctx.moveTo(mx - 10, myv);
      ctx.lineTo(mx + 10, myv);
      ctx.moveTo(mx, myv - 10);
      ctx.lineTo(mx, myv + 10);
      ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'caption' && age < f.life) {
      const on = Math.floor(age / 110) % 2 === 0 || age > 260; // blinks in steps then holds
      if (on) {
        ctx.save();
        ctx.font = `13px ${ARCADE_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 10;
        ctx.fillText(f.text, Math.min(CW - 60, Math.max(60, X(f.x))), Y(f.y));
        ctx.restore();
      }
    }
  }

  // --- Survival-win rush(ground-line cyan glow rush) ---
  const rush = fx.find((f) => f.kind === 'rush');
  if (rush) {
    const a = Math.min(1, (now - rush.t) / 260);
    ctx.save();
    const grad = ctx.createLinearGradient(0, horizon - 60, 0, horizon);
    grad.addColorStop(0, 'rgba(5,217,232,0)');
    grad.addColorStop(1, `rgba(5,217,232,${0.3 * a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizon - 60, CW, 60);
    ctx.restore();
  }

  // --- Chromatic aberration at the collision moment(a one-frame series only at the win/loss moment) ---
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && now - chroma.t < 90) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(ctx.canvas, -5, 0, CW, CH);
    ctx.globalAlpha = 0.22;
    ctx.drawImage(ctx.canvas, 5, 0, CW, CH);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Between-snapshot interpolation(extrapolation) — builds a display-only state by advancing the
// server snapshot dt seconds forward with each object's 'own velocity'. The snapshot already has
// vy·grounded·obstacles, so no ID matching is needed and added latency is 0. Only the landing/
// direction-change moments have a tiny error, which the next snapshot corrects immediately.
// The goal is to smoothly bridge 30/60Hz snapshots into a 60fps render(removing obstacle teleporting·jump stair-stepping).
//  · obstacles: x -= OBST_SPEED·dt (leftward travel).
//  · dino: advances the jump arc(gravity·fastfall) with the same semi-implicit Euler as the core.
//  · elapsed: keeps the ground dashes·stars·grid scrolling at the same speed as obstacles(prevents background judder).
// ---------------------------------------------------------------------------
function extrapolate(s: Game6State, dt: number): Game6State {
  let y = s.y;
  let vy = s.vy;
  let grounded = s.grounded;
  if (!grounded) {
    const g = G6.GRAVITY * (s.ducking ? G6.FASTFALL_MULT : 1);
    vy -= g * dt;
    y += vy * dt;
    if (y <= 0) {
      y = 0;
      vy = 0;
      grounded = true;
    }
  }
  return {
    ...s,
    elapsed: s.elapsed + dt,
    y,
    vy,
    grounded,
    runPhase: s.runPhase + dt,
    obstacles: s.obstacles.map((o) => ({ ...o, x: o.x - G6.OBST_SPEED * dt, phase: o.phase + dt })),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Game6() {
  useDebugScreen('scr-game6');
  const flow = useFlow();
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const fxRef = useRef<Fx[]>([]);
  // End effect: track result transition → default flash(no explosion)
  const endRef = useRef<EndTracker>(createEndTracker());
  const passedRef = useRef<WeakSet<Obstacle>>(new WeakSet());
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const botNextAtRef = useRef(0);
  const duckRef = useRef(false);

  /** Remaining time for HUD display(quantized to seconds — saves re-renders) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);
  /** W(duck) is a hold — reflects the ducking state to keep the keycap lit */
  const [ducking, setDucking] = useState(false);

  const [qLit, flashQ] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();

  // Online render hook(performance-structure standard) — isOnline when this game(id 4) is the round of the current server match.
  //  · isOnline=false → offline/direct-entry(the existing local sim·mock bot path is 100% preserved).
  //  · isOnline=true  → turns off local sim/bot/decisions and renders server state + sends only my input to the server.
  // Only active/role are 'selectively subscribed'(re-render only at round boundaries); server snapshots(60Hz) are
  // mirrored via stateRef/snapAtRef(no re-render). Per-snapshot work(debug bridge·HUD time) is delegated to onSnapshot.
  const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game6State>(6, (s) => {
    setDebugGame(s); // debug bridge — updated each snapshot(does not trigger a re-render)
    const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remainingMs / 1000) * 1000); // quantize to seconds → re-render only ~1/s
  });
  // ref so the keyboard handler(stable closure) sees the latest 'online active?'.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  // Online input action sounds change meaning by role(P1=runner→jump/duck, P2=spawner→obstacle spawn).
  // ref so the key handler's stable closure sees the latest role.
  const myRoleRef = useRef(myRole);
  myRoleRef.current = myRole;

  // My color(fixed per match, independent of role) — keycap/HUD colors use this value. It changes only at match:start,
  // and being a primitive-value selective subscription, 60Hz snapshots cause no re-render(useSyncExternalStore skips when the value is unchanged).
  const myColor = useSyncExternalStore(
    onlineStore.subscribe,
    () => onlineStore.get().myColor ?? 'blue',
    () => onlineStore.get().myColor ?? 'blue',
  );

  // direct-URL recovery + debug-bridge cleanup on leave
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 6) startOfflineGame(6);
    return () => setDebugGame(null);
  }, []);

  // Canvas resolution init(dpr scale)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // Keyboard — local adapter. GameInputEvent queue + lamp lighting.
  // P1 Q=jump / W=duck(hold), P2 U=cactus / I=bird. Online, P2 is handled by the bot.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // If real server online is active: send only my input to the server(no local queue/bot).
        // Whatever the role, the server rewrites by role, so pressing any of the 4 keys goes to my slot.
        if (isOnlineRef.current) {
          // Online uses only the U/I two keys(requirement). U=primary key(slotA=jump), I=secondary key(slotB=duck). Q/W are ignored.
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          if (e.type === 'down') {
            if (e.code === 'KeyU') flashU();
            else flashI();
            // Per-role action sound: P1(runner)=U jump/I duck, P2(spawner)=U/I obstacle spawn
            if (myRoleRef.current === 'P1') sfx(e.code === 'KeyU' ? 'g6-jump' : 'g6-duck');
            else sfx('g6-obstacle-spawn');
          }
          // I(secondary key=duck) is a hold — reflect ducking for local visuals
          if (e.code === 'KeyI') setDucking(e.type === 'down');
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t);
          return;
        }
        // ── Offline(+ mock-online bot) path — unchanged behavior ──
        const f = getFlow();
        const mockOnline = f.mode === 'online';
        // KeyW(duck) is a hold — the lamp is driven by the ducking state(reflecting the core decision), so no flash
        if (e.code === 'KeyQ') {
          if (e.type === 'down') {
            flashQ();
            sfx('g6-jump');
          }
        } else if (e.code === 'KeyW') {
          // duck(hold) — the lamp is driven by the ducking state, but the entering keydown plays an action sound
          if (e.type === 'down') sfx('g6-duck');
        } else if (e.code === 'KeyU') {
          if (mockOnline) return; // online mock: P2(obstacles) is a bot
          if (e.type === 'down') {
            flashU();
            sfx('g6-obstacle-spawn');
          }
        } else if (e.code === 'KeyI') {
          if (mockOnline) return;
          if (e.type === 'down') {
            flashI();
            sfx('g6-obstacle-spawn');
          }
        }
        if (f.phase === 'playing') actionsRef.current.push(e);
      },
    );
    return detach;
  }, [flashQ, flashU, flashI]);

  // Round lifecycle: create state → rAF loop(step + draw) → report result
  useEffect(() => {
    // ── Online(server authority): draw only server state, no local sim/bot/decision(draw-only) ──
    if (isOnline) {
      // Before the first snapshot, set the initial create state for rendering only(not a decision — onSnapshot soon overwrites it).
      if (!stateRef.current) {
        const seed = game6.create(Math.random);
        stateRef.current = seed;
        setDebugGame(seed);
        setHudMs(GAME_DURATION * 1000);
      }
      let raf = 0;
      // Online is driven by server snapshots — play the collision impact sound once on the first frame of the result transition(null→P2).
      let crashPlayed = false;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const ctx = canvasRef.current?.getContext('2d');
        const s = stateRef.current;
        if (ctx && s) {
          if (!crashPlayed && s.result === 'P2') {
            crashPlayed = true;
            sfx('g6-crash');
          }
          const disp = getPlayerDisplays(getFlow());
          fxRef.current = fxRef.current.filter((f) => now - f.t < 1200);
          // Between-snapshot extrapolation: advance the last snapshot by the elapsed dt at its own velocity(capped at 50ms).
          // On end(result), do not extrapolate(keep the shards/rush effect exactly at the server's final state).
          const extraDt = Math.min(0.05, Math.max(0, (now - snapAtRef.current) / 1000));
          const view = extraDt > 0 && s.result === null ? extrapolate(s, extraDt) : s;
          drawScene(ctx, view, fxRef.current, now, disp.P1.isYou, disp.P2.isYou);
          endRef.current.update(s.result, now);
          drawEndFlash(ctx, CW, CH, endRef.current.age(now));
        }
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    if (flow.gameId !== 6 || flow.phase !== 'playing') return;

    const st = game6.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    fxRef.current = [];
    passedRef.current = new WeakSet();
    reportedRef.current = false;
    resultAtRef.current = 0;
    botNextAtRef.current = 0;
    duckRef.current = false;
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);
    setDucking(false);

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (isRoundIntroActive()) { last = now; return; }
      // dt in seconds, clamped to 100ms for physics stability(prevents jump/collision jitter on large dt)
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        const events = actionsRef.current;
        actionsRef.current = [];

        // Online bot(P2, obstacle spawn): throws a random obstacle each cooldown — delayed so the human(P1) can dodge
        if (getFlow().mode === 'online' && s.cooldown <= 0 && now >= botNextAtRef.current) {
          const code: 'KeyU' | 'KeyI' = Math.random() < 0.5 ? 'KeyU' : 'KeyI';
          const tSec = now / 1000;
          events.push({ code, type: 'down', t: tSec });
          events.push({ code, type: 'up', t: tSec });
          botNextAtRef.current = now + 220 + Math.random() * 380;
        }

        // step mutates the original in-place then returns the same reference → snapshot comparison values before the call.
        const prevGrounded = s.grounded;
        const prevSpawnAnim = s.spawnAnim;

        s = game6.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s); // debug bridge — every tick

        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000); // quantize to seconds
        if (s.ducking !== duckRef.current) {
          duckRef.current = s.ducking;
          setDucking(s.ducking);
        }

        // ---- Derive render-only effects ----
        // dust at jump takeoff / dust at landing
        if (prevGrounded && !s.grounded) {
          fxRef.current.push({ kind: 'dust', x: G6.DINO_X, y: G6.GROUND_Y, t: now });
        } else if (!prevGrounded && s.grounded) {
          fxRef.current.push({ kind: 'dust', x: G6.DINO_X, y: G6.GROUND_Y, t: now });
        }
        // P2 throw moment(the frame spawnAnim jumped up) — flash in the lane of the just-spawned obstacle
        if (s.spawnAnim > prevSpawnAnim) {
          const newest = s.obstacles[s.obstacles.length - 1];
          const y =
            newest && newest.type === 'duck' ? G6.BIRD_TOP + G6.BIRD_H / 2 : G6.GROUND_Y - 24;
          fxRef.current.push({ kind: 'spawn', x: G6.W - 12, y, t: now });
        }
        // Near-pass "SAFE!" — the moment an obstacle has fully passed the dino(once)
        if (s.result === null) {
          for (const o of s.obstacles) {
            const w = o.type === 'jump' ? G6.CACTUS_W : G6.BIRD_W;
            if (o.x + w < G6.DINO_X && !passedRef.current.has(o)) {
              passedRef.current.add(o);
              fxRef.current.push({
                kind: 'caption',
                text: 'SAFE!',
                color: COL0.p1,
                x: G6.DINO_X + 4,
                y: G6.GROUND_Y - G6.DINO_H - 30,
                t: now,
                life: 420,
              });
            }
          }
        }
        // Decision-moment effect(glitch only at the win/loss moment)
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          if (s.result === 'P2') {
            // dino collision = P2 win (loser impact sound — the victory fanfare is a global layer)
            sfx('g6-crash');
            fxRef.current.push(
              { kind: 'chroma', t: now },
              { kind: 'shards', x: G6.DINO_X + G6.DINO_W / 2, y: G6.GROUND_Y - 24, t: now },
              {
                kind: 'caption',
                text: 'CRASH!',
                color: COL0.p2,
                x: G6.DINO_X + 12,
                y: G6.GROUND_Y - G6.DINO_H - 26,
                t: now,
                life: RESULT_FX_MS,
              },
            );
          } else {
            // 10-second survival = P1 win
            fxRef.current.push(
              { kind: 'rush', t: now },
              {
                kind: 'caption',
                text: 'SURVIVED!',
                color: COL0.p1,
                x: G6.W / 2,
                y: G6.GROUND_Y - G6.DINO_H - 30,
                t: now,
                life: RESULT_FX_MS,
              },
            );
          }
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // After briefly showing the collision/survival effect, report the round end once → ResultOverlay
        if (isOnline) return; // Online, the server drives round:end — the screen does not participate
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        const disp = getPlayerDisplays(getFlow());
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1200);
        drawScene(ctx, s, fxRef.current, now, disp.P1.isYou, disp.P2.isYou);
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= 5000;

  return (
    <main data-testid="scr-game6" className="g6-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g6-topbar">
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
        <span className="g6-title font-display c-muted">Game 6 · Dino Run</span>
      </div>

      <div className="g6-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g6-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g6-canvas" aria-label="Game 6 stage — Dino Run" />
      </div>

      {/* On-screen keycaps — show the actually-assigned keys(SPEC Q2), lit on input. W is a hold, so ducking is reflected */}
      {isOnline ? (
        // Online: use only the U/I two keys and operate only my role. Colors use my player color(myColor),
        // while the action label/icon keep the role(myRole) — asymmetric game(P1=runner, P2=spawner).
        <div className="g6-keys g6-keys--online">
          <div className="g6-keys__group">
            <span
              className={`g6-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}
            >
              YOU · {myColor === 'blue' ? 'BLUE' : 'RED'} · {myRole === 'P1' ? 'RUN' : 'SPAWN'}
            </span>
            <KeyCap
              role={myColor === 'blue' ? 'P1' : 'P2'}
              keyChar="U"
              icon={myRole === 'P1' ? '▲' : '▂'}
              lit={uLit}
              label={myRole === 'P1' ? 'Jump' : 'Cactus'}
            />
            <KeyCap
              role={myColor === 'blue' ? 'P1' : 'P2'}
              keyChar="I"
              icon={myRole === 'P1' ? '▼' : '▔'}
              lit={iLit}
              label={myRole === 'P1' ? 'Duck' : 'Bird'}
            />
          </div>
        </div>
      ) : (
        <div className="g6-keys">
          <div className="g6-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="▲" lit={qLit} label="Jump" />
            <KeyCap role="P1" keyChar="W" icon="▼" lit={ducking} label="Duck" />
            <span className="g6-keys__tag font-arcade c-p1">P1 · RUN</span>
          </div>
          <div className="g6-keys__group">
            <span className="g6-keys__tag font-arcade c-p2">P2 · SPAWN</span>
            <KeyCap role="P2" keyChar="U" icon="▂" lit={uLit} label="Cactus" />
            <KeyCap role="P2" keyChar="I" icon="▔" lit={iLit} label="Bird" />
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}