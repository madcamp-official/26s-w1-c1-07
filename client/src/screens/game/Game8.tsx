/**
 * Game 5 — Monster Bombardment (NEON COIN-OP). Owner: game8 agent.
 * Container testid: scr-game8 / parts: game-stage(CRT bezel), hud-*(HudFrame embedded), btn-exit
 *
 * ── Principles ────────────────────────────────────────────────────────────────
 *  · Logic/judging is 100% the @madpump/shared game8 core (create/step). No re-implementation or duplication.
 *  · The screen (canvas render/effects) is written fresh in the neon-coinop tone. No reference to game-lab/design-lab.
 *  · For colors/fonts, only theme.css token values (PLAN §1) are copied as hex into the canvas.
 *
 * ── What is drawn (derived from game8 state fields) ─────────────────────────────
 *  · Two cannons, center left/right: P1=(CX-GAP,CY) cyan / P2=(CX+GAP,CY) pink.
 *      state.p1Angle/p2Angle = barrel direction, p1Dir/p2Dir = rotation direction(±1),
 *      p1Cooldown/p2Cooldown = reload(cooldown ring), p1Score/p2Score = kill count.
 *  · state.monsters[] : straight-line invasion from the edge → target cannon. Core color by target(1|2).
 *  · state.shots[]    : owner(1|2) colored neon tracer.
 *  · Win/loss = cannon hit(instant death) or score judgment after surviving 10s → state.result('P1'|'P2'|'DRAW').
 *
 * ── Wiring (same pattern as game 1·2) ─────────────────────────────────────────────
 *   mount → if idle/different game, startOfflineGame(8) (direct-URL recovery)
 *   game8.create(Math.random) each round
 *   rAF loop(+background watchdog) → game8.step(state, events, dtSec) → setDebugGame every tick
 *   input attachLocalKeyboard: KeyQ/KeyW=P1, KeyU/KeyI=P2 (core handles edge/cooldown)
 *   result settled → in-game effect(RESULT_FX_MS) then reportRoundEnd(mapping) once → <ResultOverlay />
 *   online mode → P2 cannon is a bot(aims/fires at the most threatening monster), human is P1(q/w)
 *   ★The core mutates the original then returns the same reference → snapshot scalars before the step call for prev-value comparison.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { game8, G8, GAME_DURATION } from '@madpump/shared';
import type { Game8State, Monster, GameInputEvent } from '@madpump/shared';
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
import { useOnlineRender } from '../../net/useOnlineRender';
import { functionColors, onlineStore, sendInput as onlineSendInput } from '../../net/online';
import {
  createEndTracker,
  drawEndFlash,
  drawExplosion,
  makeExplosion,
  type EndTracker,
  type Particle,
} from '../../game/endFx';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import { sfx } from '@/audio';
import './game8.css';

// ---------------------------------------------------------------------------
// Canvas logical resolution = core field(800×450). Coordinates drawn 1:1 (no scaling).
// Actual pixels are upscaled by DPR → responsive via CSS aspect-ratio 16/9.
// ---------------------------------------------------------------------------
const CW = G8.W; // 800
const CH = G8.H; // 450

const ARCADE = "'Press Start 2P', monospace";

/** theme.css §1 palette (values copied only — no import). Role default colors = P1 cyan / P2 pink. */
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
  error: '#ff3864',
} as const;

type Pal = Record<keyof typeof COL0, string>;

/**
 * Color = player-dependent (not role) local palette.
 * Places p1/p2(+dim) using the actual player colors of this round's P1/P2 'function entities':
 *  if functionColors().p1='red', swap p1↔p2 so that P1 entity=pink · P2 entity=cyan.
 *  The rest (field/deep/accent/accent2/error, etc.) is player-independent, so unchanged.
 *  Offline · no color info → functionColors default({p1:'blue',p2:'red'}) → COL0 as-is (same as existing behavior).
 */
function playerCol(): Pal {
  const fc = functionColors();
  return fc.p1 === 'red'
    ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
    : COL0;
}

/** Fixed cannon positions (same as the core convention) */
const P1 = { x: G8.CX - G8.GAP, y: G8.CY };
const P2 = { x: G8.CX + G8.GAP, y: G8.CY };

/** In-game effect time between judgment → result overlay transition (explosion/survival rush) */
const RESULT_FX_MS = 650;

/** Cannon threat-detection radius (render-only warning ring) */
const DANGER_R = 96;

/** core result → shell MatchResult */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): MatchResult {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

/** Normalize the angle to (-π, π] */
function normAngle(a: number): number {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x <= -Math.PI) x += Math.PI * 2;
  return x;
}

// ---------------------------------------------------------------------------
// Render-only effects (does not touch logic)
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'muzzle'; x: number; y: number; color: string; t: number }
  | { kind: 'shards'; x: number; y: number; color: string; t: number }
  | { kind: 'boom'; x: number; y: number; color: string; t: number }
  | { kind: 'rush'; owner: 1 | 2; t: number }
  | { kind: 'chroma'; t: number }
  | { kind: 'caption'; text: string; color: string; x: number; y: number; t: number; life: number };

function nearestMonsterDist(monsters: readonly Monster[], p: { x: number; y: number }): number {
  let d = Infinity;
  for (const m of monsters) {
    const dd = Math.hypot(m.x - p.x, m.y - p.y);
    if (dd < d) d = dd;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Canvas renderer (pure drawing — state is read-only)
// ---------------------------------------------------------------------------
function drawBaseRing(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, col: string): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, G8.CANNON_R + 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMonster(ctx: CanvasRenderingContext2D, m: Monster, COL: Pal, reduce: boolean): void {
  const target = m.target === 1 ? P1 : P2;
  const coreCol = m.target === 1 ? COL.p1 : COL.p2;

  // Aim line — faint, in the color of the cannon this monster targets (instantly reads threat assignment)
  ctx.save();
  ctx.strokeStyle = coreCol;
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(m.x, m.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.restore();

  // Body — purple neon spikes (alien invader)
  const pulse = reduce ? 1 : 1 + 0.1 * Math.sin(m.anim * 6);
  const R = G8.MONSTER_R * pulse;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(reduce ? 0 : m.anim * 1.4);
  ctx.beginPath();
  const spikes = 8;
  for (let i = 0; i < spikes * 2; i++) {
    const rr = i % 2 === 0 ? R : R * 0.58;
    const a = (Math.PI * i) / spikes;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = COL.deep;
  ctx.fill();
  ctx.strokeStyle = COL.accent2;
  ctx.lineWidth = 2;
  ctx.shadowColor = COL.accent2;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();

  // Core (target-colored eyeball)
  ctx.save();
  ctx.fillStyle = coreCol;
  ctx.shadowColor = coreCol;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShot(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number, owner: 1 | 2, COL: Pal): void {
  const col = owner === 1 ? COL.p1 : COL.p2;
  // rgb is for the tracer gradient — derived back from the resolved color (cyan/pink) so it follows swaps exactly too.
  const rgb = col === COL0.p1 ? '5,217,232' : '255,42,109';
  const tx = x - vx * 0.05;
  const ty = y - vy * 0.05;
  ctx.save();
  const grad = ctx.createLinearGradient(tx, ty, x, y);
  grad.addColorStop(0, `rgba(${rgb},0)`);
  grad.addColorStop(1, `rgba(${rgb},0.85)`);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x, y, G8.BULLET_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCannon(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  angle: number,
  cooldown: number,
  col: string,
  dim: string,
  nearestDist: number,
  label: string,
  isYou: boolean,
  now: number,
  reduce: boolean,
): void {
  // Threat warning ring (when a monster is near — tension feedback)
  if (nearestDist < DANGER_R) {
    const prox = 1 - nearestDist / DANGER_R;
    const pulse = reduce ? 0.6 : 0.45 + 0.45 * Math.sin(now / 70);
    ctx.save();
    ctx.strokeStyle = COL0.error;
    ctx.globalAlpha = Math.min(0.85, prox * pulse + 0.15);
    ctx.lineWidth = 2;
    ctx.shadowColor = COL0.error;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, G8.CANNON_R + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Barrel
  const tipx = p.x + Math.cos(angle) * G8.BARREL_LEN;
  const tipy = p.y + Math.sin(angle) * G8.BARREL_LEN;
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.shadowColor = col;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(tipx, tipy);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(tipx, tipy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Body (dim base + 2px player-color border + glow)
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, G8.CANNON_R, 0, Math.PI * 2);
  ctx.fillStyle = dim;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();

  // Reload ring (cooldown recovery = arc fill, glow when ready)
  const ready = 1 - Math.min(1, Math.max(0, cooldown / G8.FIRE_COOLDOWN));
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, G8.CANNON_R + 4, -Math.PI / 2, -Math.PI / 2 + ready * Math.PI * 2);
  ctx.strokeStyle = col;
  ctx.globalAlpha = ready >= 1 ? 0.9 : 0.5;
  ctx.lineWidth = 2;
  if (ready >= 1) {
    ctx.shadowColor = col;
    ctx.shadowBlur = 6;
  }
  ctx.stroke();
  ctx.restore();

  // Label + YOU
  ctx.save();
  ctx.font = `10px ${ARCADE}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 6;
  ctx.fillText(label, p.x, p.y + G8.CANNON_R + 18);
  if (isYou && (reduce || Math.floor(now / 500) % 2 === 0)) {
    ctx.fillStyle = COL0.accent;
    ctx.shadowColor = COL0.accent;
    ctx.fillText('YOU', p.x, p.y - G8.CANNON_R - 12);
  }
  ctx.restore();
}

function drawFx(ctx: CanvasRenderingContext2D, f: Fx, COL: Pal, now: number, reduce: boolean): void {
  const age = now - f.t;
  if (f.kind === 'muzzle') {
    if (age >= 110) return;
    ctx.save();
    ctx.strokeStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    const r = 6 + age * 0.06;
    ctx.beginPath();
    ctx.moveTo(f.x - r, f.y);
    ctx.lineTo(f.x + r, f.y);
    ctx.moveTo(f.x, f.y - r);
    ctx.lineTo(f.x, f.y + r);
    ctx.stroke();
    ctx.restore();
  } else if (f.kind === 'shards') {
    if (age >= 520) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age / 520);
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 6;
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * 2 * i) / 7 + 0.4;
      const dist = 6 + age * 0.12;
      ctx.fillRect(f.x + Math.cos(a) * dist - 2.5, f.y + Math.sin(a) * dist - 2.5, 5, 5);
    }
    ctx.restore();
  } else if (f.kind === 'boom') {
    if (age >= RESULT_FX_MS + 200) return;
    ctx.save();
    const t = age / (RESULT_FX_MS + 200);
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.strokeStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 10 + age * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = f.color;
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10;
      const dist = 8 + age * 0.14;
      ctx.fillRect(f.x + Math.cos(a) * dist - 3, f.y + Math.sin(a) * dist - 3, 6, 6);
    }
    ctx.restore();
  } else if (f.kind === 'rush') {
    if (age >= RESULT_FX_MS + 200) return;
    const pos = f.owner === 1 ? P1 : P2;
    const col = f.owner === 1 ? COL.p1 : COL.p2;
    const pulse = reduce ? 0.6 : 0.4 + 0.4 * Math.sin(age / 60);
    ctx.save();
    ctx.globalAlpha = 0.5 * pulse + 0.3;
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, G8.CANNON_R + 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (f.kind === 'caption') {
    if (age >= f.life) return;
    const blinkOn = reduce || Math.floor(age / 120) % 2 === 0 || age > 300;
    if (!blinkOn) return;
    ctx.save();
    ctx.font = `14px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 12;
    ctx.fillText(f.text, Math.min(CW - 60, Math.max(60, f.x)), f.y);
    ctx.restore();
  }
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game8State,
  fx: readonly Fx[],
  now: number,
  p1IsYou: boolean,
  p2IsYou: boolean,
  reduce: boolean,
): void {
  // Color = player-dependent (not role) — paint the P1/P2 function entities with the actual player colors.
  // Local COL shadows module COL0 → the COL.p1/p2 usages below automatically follow the player colors.
  const COL = playerCol();
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;

  // Field
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // Faint neon grid (pink tone when time is almost up)
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,42,109,0.10)' : 'rgba(211,0,197,0.07)';
  ctx.lineWidth = 1;
  for (let gx = 40; gx < CW; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, CH);
    ctx.stroke();
  }
  for (let gy = 40; gy < CH; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(CW, gy);
    ctx.stroke();
  }
  ctx.restore();

  // Cannon base rings
  drawBaseRing(ctx, P1, COL.p1);
  drawBaseRing(ctx, P2, COL.p2);

  // Monsters
  for (const m of s.monsters) drawMonster(ctx, m, COL, reduce);

  // Bullets
  for (const sh of s.shots) drawShot(ctx, sh.x, sh.y, sh.vx, sh.vy, sh.owner, COL);

  // Cannons
  const near1 = nearestMonsterDist(s.monsters, P1);
  const near2 = nearestMonsterDist(s.monsters, P2);
  drawCannon(ctx, P1, s.p1Angle, s.p1Cooldown, COL.p1, COL.p1dim, near1, 'P1', p1IsYou, now, reduce);
  drawCannon(ctx, P2, s.p2Angle, s.p2Cooldown, COL.p2, COL.p2dim, near2, 'P2', p2IsYou, now, reduce);

  // Effects
  for (const f of fx) drawFx(ctx, f, COL, now, reduce);

  // Single-frame chromatic aberration at the win/loss moment
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && now - chroma.t < 110) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(ctx.canvas, -4, 0, CW, CH);
    ctx.globalAlpha = 0.22;
    ctx.drawImage(ctx.canvas, 4, 0, CW, CH);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Online mock bot — P2 cannon. Judging is still the core (game8.step).
// Aims at the most threatening monster (targeting it · nearby), fires when aligned.
// Returns: this frame's synthetic input events (KeyU=change direction / KeyI=fire)
// ---------------------------------------------------------------------------
interface BotMemory {
  lastToggleAt: number;
  lastFireAt: number;
}

function botEvents(s: Game8State, now: number, mem: BotMemory): GameInputEvent[] {
  const out: GameInputEvent[] = [];
  // 1) Target selection — prefer monsters targeting P2 (threat), otherwise any monster (scoring)
  let target: Monster | null = null;
  let best = Infinity;
  for (const m of s.monsters) {
    const threat = m.target === 2 ? 0 : 100000; // strong bonus for threatening monsters
    const d = Math.hypot(m.x - P2.x, m.y - P2.y) + threat;
    if (d < best) {
      best = d;
      target = m;
    }
  }
  if (!target) return out;

  const desired = Math.atan2(target.y - P2.y, target.x - P2.x);
  const diff = normAngle(desired - s.p2Angle);
  const tSec = now / 1000;

  // 2) Align rotation direction — since angle += ROT_SPEED*dir*dt, if diff>0 then dir=+1 is shortest
  const wantDir: 1 | -1 = diff >= 0 ? 1 : -1;
  if (Math.abs(diff) > 0.25 && s.p2Dir !== wantDir && now - mem.lastToggleAt > 150) {
    out.push({ code: 'KeyU', type: 'down', t: tSec });
    mem.lastToggleAt = now;
  }

  // 3) Fire — roughly aligned + cooldown ready (safe since the core re-checks cooldown)
  if (Math.abs(diff) < 0.16 && s.p2Cooldown === 0 && now - mem.lastFireAt > G8.FIRE_COOLDOWN * 1000 * 0.85) {
    out.push({ code: 'KeyI', type: 'down', t: tSec });
    mem.lastFireAt = now;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Interpolation between snapshots (extrapolation) — advances the server snapshot by dt seconds
// at each object's 'own velocity' to build a display state. Bullets·monsters advance by vx/vy,
// cannons rotate by ROT_SPEED·dir. Since velocity/direction are already in the snapshot, no ID
// matching is needed and there is 0 added latency. Only the direction-change (toggle) moment has a
// tiny error, and the next snapshot corrects it immediately. The goal is to smoothly bridge 30/60Hz
// snapshots into a 60fps render. (Shallow copy for display — original state is read-only, judging untouched)
// ---------------------------------------------------------------------------
function extrapolate(s: Game8State, dt: number): Game8State {
  return {
    ...s,
    p1Angle: s.p1Angle + G8.ROT_SPEED * s.p1Dir * dt,
    p2Angle: s.p2Angle + G8.ROT_SPEED * s.p2Dir * dt,
    shots: s.shots.map((sh) => ({ ...sh, x: sh.x + sh.vx * dt, y: sh.y + sh.vy * dt })),
    monsters: s.monsters.map((m) => ({
      ...m,
      x: m.x + m.vx * dt,
      y: m.y + m.vy * dt,
      anim: m.anim + dt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
/**
 * End effect — the moment result flips from null→win/loss, spawns an explosion at the
 * 'losing side's cannon', then draws explosion debris + a base flash every frame. Shared by the online/offline loops.
 */
function runEndFx(
  ctx: CanvasRenderingContext2D,
  endRef: React.MutableRefObject<EndTracker>,
  exRef: React.MutableRefObject<{ parts: Particle[]; cx: number; cy: number } | null>,
  result: Game8State['result'],
  now: number,
): void {
  const started = endRef.current.update(result, now);
  if (started && result && result !== 'DRAW') {
    // result='P1' means P2 loses → P2 cannon explodes; 'P2' means P1 cannon explodes.
    const loser = result === 'P1' ? P2 : P1;
    exRef.current = { parts: makeExplosion(loser.x, loser.y), cx: loser.x, cy: loser.y };
  }
  if (!result) exRef.current = null; // clean up for a new round
  const age = endRef.current.age(now);
  if (exRef.current && age !== null) {
    drawExplosion(ctx, exRef.current.parts, exRef.current.cx, exRef.current.cy, age);
  }
  drawEndFlash(ctx, CW, CH, age);
}

export default function Game8() {
  useDebugScreen('scr-game8');
  const flow = useFlow();
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const fxRef = useRef<Fx[]>([]);
  // End effect: track result transition + retain the losing side's cannon explosion debris
  const endRef = useRef<EndTracker>(createEndTracker());
  const explosionRef = useRef<{ parts: Particle[]; cx: number; cy: number } | null>(null);
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const botRef = useRef<BotMemory>({ lastToggleAt: 0, lastFireAt: 0 });
  const reduceRef = useRef(false);

  /** HUD remaining time (quantized to seconds — saves re-renders) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);
  /** Kill score (new mechanic — neon score cells) */
  const [scores, setScores] = useState<{ p1: number; p2: number }>({ p1: 0, p2: 0 });

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();
  const lampRef = useRef({ flashU, flashI });
  lampRef.current = { flashU, flashI };

  // ── Online render hook (performance standard): selectively subscribes only to active/role → re-renders only at round boundaries.
  //    Server snapshots are mirrored directly into stateRef/snapAtRef (no re-render); per-snapshot HUD updates via onSnapshot.
  //    If isOnline=false, offline (local 2-player/bot) behaves 100% as before.
  const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game8State>(8, (s) => {
    setDebugGame(s);
    // Replace the offline loop's setHudMs/setScores with server state (keeps HUD live) — re-render only when values change.
    const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remainingMs / 1000) * 1000);
    setScores({ p1: s.p1Score, p2: s.p2Score });
  });
  // ref that lets the keyboard handler (stable closure) see the latest 'is online active'.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  // Color = player-dependent (independent of role). Paint the keycaps/YOU tag with this color.
  // Color is a primitive that changes only at match boundaries → responds via selective subscription without 60Hz re-renders.
  const myColor = useSyncExternalStore(
    onlineStore.subscribe,
    () => onlineStore.get().myColor ?? 'blue',
    () => onlineStore.get().myColor ?? 'blue',
  );

  // direct-URL recovery + record prefers-reduced-motion + clean up the debug bridge
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 8) startOfflineGame(8);
    reduceRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    return () => setDebugGame(null);
  }, []);

  // Canvas resolution (dpr scale) — coordinates use the 800×450 logical space as-is
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // Keyboard — collect the GameInputEvent queue + light lamps.
  // P1 q/w, P2 u/i. When online, P2 keys are handled by the bot, so they are not absorbed.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // ── Server online: send only to the server, no local queue/bot ──
        // Whatever my role is, the server rewrites it by role, so any of the 4 keys goes to my slot.
        if (isOnlineRef.current) {
          // Online uses only the U/I two keys (requirement). U=primary key(slotA), I=secondary key(slotB). Q/W ignored.
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          if (e.type === 'down') {
            if (e.code === 'KeyU') flashU();
            else {
              flashI(); // I=fire(slotB)
              sfx('g8-cannon-fire');
            }
          }
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          return;
        }

        // ── Offline (local 2-player + bot) existing handling as-is ──
        const f = getFlow();
        const botMode = f.mode === 'online'; // legacy online = P2 mock bot mode
        if (e.code === 'KeyQ') {
          if (e.type === 'down') flashQ();
        } else if (e.code === 'KeyW') {
          if (e.type === 'down') {
            flashW();
            sfx('g8-cannon-fire'); // P1 fire input
          }
        } else if (e.code === 'KeyU') {
          if (botMode) return; // online(bot) P2 = handled by bot
          if (e.type === 'down') flashU();
        } else if (e.code === 'KeyI') {
          if (botMode) return;
          if (e.type === 'down') {
            flashI();
            sfx('g8-cannon-fire'); // P2 fire input
          }
        }
        if (f.phase === 'playing') actionsRef.current.push(e);
      },
    );
    return detach;
  }, [flashQ, flashW, flashU, flashI]);

  // Round lifecycle: create state → rAF loop(step+draw) → report result
  useEffect(() => {
    // ── Online: draw-only loop that renders only server state (no step·bot·result reporting) ──
    if (isOnline) {
      // Before the first snapshot, render a static create state instead of an empty canvas (never steps)
      if (!stateRef.current) stateRef.current = game8.create(Math.random);
      let raf = 0;
      let stopped = false;
      const loop = () => {
        if (stopped) return;
        const ctx = canvasRef.current?.getContext('2d');
        const s = stateRef.current;
        if (ctx && s) {
          const now = performance.now();
          fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
          const disp = getPlayerDisplays(getFlow());
          // Extrapolation between snapshots: advance the last snapshot by elapsed dt at each object's own velocity (capped at 50ms).
          // After end (result), do not extrapolate (so bullets/monsters don't appear to overshoot the judged position).
          const extraDt = Math.min(0.05, Math.max(0, (now - snapAtRef.current) / 1000));
          const view = extraDt > 0 && s.result === null ? extrapolate(s, extraDt) : s;
          drawScene(ctx, view, fxRef.current, now, disp.P1.isYou, disp.P2.isYou, reduceRef.current);
          runEndFx(ctx, endRef, explosionRef, s.result, now); // losing side's cannon explosion + flash
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => {
        stopped = true;
        cancelAnimationFrame(raf);
      };
    }

    if (flow.gameId !== 8 || flow.phase !== 'playing') return;

    const st = game8.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    fxRef.current = [];
    reportedRef.current = false;
    resultAtRef.current = 0;
    botRef.current = { lastToggleAt: 0, lastFireAt: 0 };
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);
    setScores({ p1: 0, p2: 0 });

    let raf = 0;
    let stopped = false;
    let last = performance.now();

    const step = (now: number) => {
      if (stopped) return;
      if (isRoundIntroActive()) { last = now; return; }
      const dt = Math.min(0.5, (now - last) / 1000);
      if (dt <= 0) return;
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        const events = actionsRef.current;
        actionsRef.current = [];

        // Online bot (P2) synthetic input
        if (getFlow().mode === 'online') {
          const bev = botEvents(s, now, botRef.current);
          for (const e of bev) {
            events.push(e);
            if (e.code === 'KeyU') lampRef.current.flashU();
            else if (e.code === 'KeyI') lampRef.current.flashI();
          }
        }

        // ★step mutates the original then returns the same reference → snapshot prev values by value/reference before the call
        const prevP1Cd = s.p1Cooldown;
        const prevP2Cd = s.p2Cooldown;
        const prevP1Score = s.p1Score;
        const prevP2Score = s.p2Score;
        const prevMonsters = s.monsters; // for kill detection (reference diff)

        s = game8.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);

        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);
        if (s.p1Score !== prevP1Score || s.p2Score !== prevP2Score) {
          setScores({ p1: s.p1Score, p2: s.p2Score });
        }

        // Color = player-dependent (not role) — fx colors also use the actual player colors of the P1/P2 entities.
        const COL = playerCol();

        // ── Render-only effect derivation (does not touch logic) ──
        // Fire: the moment cooldown rises from 0→FIRE_COOLDOWN (muzzle spark at the barrel tip)
        if (s.p1Cooldown > prevP1Cd) {
          fxRef.current.push({
            kind: 'muzzle',
            x: P1.x + Math.cos(s.p1Angle) * G8.BARREL_LEN,
            y: P1.y + Math.sin(s.p1Angle) * G8.BARREL_LEN,
            color: COL.p1,
            t: now,
          });
        }
        if (s.p2Cooldown > prevP2Cd) {
          fxRef.current.push({
            kind: 'muzzle',
            x: P2.x + Math.cos(s.p2Angle) * G8.BARREL_LEN,
            y: P2.y + Math.sin(s.p2Angle) * G8.BARREL_LEN,
            color: COL.p2,
            t: now,
          });
        }

        // Kill: a monster present in the pre-step array but absent from the post-step array = destroyed by a bullet
        if (prevMonsters !== s.monsters) {
          let hit = false;
          for (const m of prevMonsters) {
            if (!s.monsters.includes(m)) {
              hit = true;
              fxRef.current.push({ kind: 'shards', x: m.x, y: m.y, color: COL.accent2, t: now });
            }
          }
          if (hit) sfx('g8-monster-hit'); // the moment a monster is killed in this step (once, 15ms duplicates suppressed by the engine)
        }

        // Judgment moment (once) — distinguish cannon hit(instant death) vs timeout(score)
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          const touchR = G8.MONSTER_R + G8.CANNON_R + 0.5;
          let loser: 1 | 2 | null = null;
          for (const m of s.monsters) {
            if (Math.hypot(m.x - P1.x, m.y - P1.y) <= touchR) loser = 1;
            else if (Math.hypot(m.x - P2.x, m.y - P2.y) <= touchR) loser = 2;
          }
          if (loser !== null) {
            sfx('g8-cannon-damaged'); // impact of a cannon hit by a monster and destroyed (loser death sound, once)
            // Cannon destroyed — explosion + glitch
            const pos = loser === 1 ? P1 : P2;
            const col = loser === 1 ? COL.p1 : COL.p2;
            fxRef.current.push(
              { kind: 'chroma', t: now },
              { kind: 'boom', x: pos.x, y: pos.y, color: col, t: now },
              { kind: 'caption', text: 'CANNON DOWN', color: col, x: pos.x, y: pos.y - 34, t: now, life: RESULT_FX_MS },
            );
          } else if (s.result === 'DRAW') {
            fxRef.current.push({
              kind: 'caption',
              text: 'DRAW',
              color: COL.accent2,
              x: G8.CX,
              y: G8.CY - 40,
              t: now,
              life: RESULT_FX_MS,
            });
          } else {
            // Survived timeout — the higher-scoring cannon successfully defended
            const owner: 1 | 2 = s.result === 'P1' ? 1 : 2;
            const pos = owner === 1 ? P1 : P2;
            const col = owner === 1 ? COL.p1 : COL.p2;
            fxRef.current.push(
              { kind: 'rush', owner, t: now },
              { kind: 'caption', text: 'DEFENDED!', color: col, x: pos.x, y: pos.y - 34, t: now, life: RESULT_FX_MS },
            );
          }
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // Online: the server drives round:end, so the screen does not report
        if (isOnline) return;
        // After briefly showing the explosion/survival effect, report round end once → ResultOverlay
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      // Render
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
        const disp = getPlayerDisplays(getFlow());
        drawScene(ctx, s, fxRef.current, now, disp.P1.isYou, disp.P2.isYou, reduceRef.current);
        runEndFx(ctx, endRef, explosionRef, s.result, now); // losing side's cannon explosion + flash
      }
    };

    const loop = (now: number) => {
      step(now);
      if (!stopped) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // If rAF halts in a background tab, an interval watchdog steps instead (handles QA automation)
    const watchdog = setInterval(() => {
      const now = performance.now();
      if (!stopped && now - last > 280) step(now);
    }, 250);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearInterval(watchdog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= 5000;
  // Color = player-dependent — score cells also use the actual player colors of the P1/P2 entities (blue→--p1 cyan / red→--p2 pink).
  const fc = functionColors();
  const p1KillCls = fc.p1 === 'blue' ? 'g8-score--p1' : 'g8-score--p2';
  const p2KillCls = fc.p2 === 'blue' ? 'g8-score--p1' : 'g8-score--p2';

  return (
    <main data-testid="scr-game8" className="g8-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g8-topbar">
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
        <span className="g8-title font-arcade c-muted">Game 8 · Pew Pew</span>
      </div>

      <div className="g8-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g8-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g8-canvas" aria-label="Game 8 stage — Pew Pew" />

        {/* New mechanic: kill score — neon score cells (P1 top-left / P2 top-right) */}
        <div className={`g8-score ${p1KillCls}`} aria-label={`P1 kills ${scores.p1}`}>
          <span className="g8-score__label font-arcade">P1 KILLS</span>
          <span key={scores.p1} className="g8-score__num font-arcade">
            {scores.p1}
          </span>
        </div>
        <div className={`g8-score ${p2KillCls}`} aria-label={`P2 kills ${scores.p2}`}>
          <span className="g8-score__label font-arcade">P2 KILLS</span>
          <span key={scores.p2} className="g8-score__num font-arcade">
            {scores.p2}
          </span>
        </div>

      </div>

      {/* On-screen keycaps — actual assigned keys(SPEC Q2) + lamp lights on input */}
      {isOnline ? (
        // Online: only the local player(U/I). Color=my player color(not role). U=change direction(slotA) / I=fire(slotB).
        <div className="g8-keys g8-keys--online">
          <div className="g8-keys__group">
            <span className={`g8-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myColor === 'blue' ? 'BLUE' : 'RED'}
            </span>
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="U" icon="⇄" lit={uLit} label="Change direction" />
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="I" icon="◉" lit={iLit} label="Fire" />
          </div>
          <span className="g8-keys__hint font-arcade">SHOOT THE INVADERS</span>
        </div>
      ) : (
        <div className="g8-keys">
          <div className="g8-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="⇄" lit={qLit} label="Change direction" />
            <KeyCap role="P1" keyChar="W" icon="◉" lit={wLit} label="Fire" />
            <span className="g8-keys__tag font-arcade c-p1">P1</span>
          </div>
          <span className="g8-keys__hint font-arcade">SHOOT THE INVADERS</span>
          <div className="g8-keys__group">
            <span className="g8-keys__tag font-arcade c-p2">P2</span>
            <KeyCap role="P2" keyChar="U" icon="⇄" lit={uLit} label="Change direction" />
            <KeyCap role="P2" keyChar="I" icon="◉" lit={iLit} label="Fire" />
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}