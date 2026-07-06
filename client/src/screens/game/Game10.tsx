/**
 * Game 9 · Tug of War — NEON COIN-OP screen. Owner: game10 agent.
 * Container testid: scr-game10 / parts: game-stage(CRT bezel), hud-*(HudFrame embedded), btn-exit
 *
 * ── Principles ──────────────────────────────────────────────────────
 *  · Logic/judgment is driven 100% by the @madpump/shared game10 core (create/step) only.
 *  · Screen/rendering is a neon canvas scene written from scratch in this file (does not reference the game-lab renderer).
 *  · 0 lines of design-lab import — colors/fonts are used only as constants copied from theme.css token values.
 *
 * ── Core state (logic file summary) → screen derivation ─────────────
 *  · pos ∈ [-1,1]: rope knot position. -1=P1 win line (left·cyan), +1=P2 win line (right·pink).
 *  · Each team pulls by pressing two keys "alternately" (P1 Q↔W, P2 U↔I). Mashing the same key is void.
 *  · p1LastKey/p2LastKey → visualized as the next key to press (NEXT hint) (pure state derivation).
 *  · p1Pulls/p2Pulls → arcade score (pull count), p1Flash/p2Flash → yank effect at the moment of a pull.
 *  · Reaching a win line wins instantly / when the 10s timer ends the side holding the knot wins (dead center = DRAW).
 *
 * ── Wiring (same pattern as Game 1·2) ───────────────────────────────
 *  mount → if idle or a different game, startOfflineGame(10) (direct-URL recovery)
 *  each round game10.create(Math.random) → game10.step(state, events, dt seconds) in the rAF loop
 *  step mutates the original then returns the same reference → continuity kept via stateRef, setDebugGame(state) every tick
 *  input attachLocalKeyboard(GameInputEvent queue): KeyQ/KeyW=P1, KeyU/KeyI=P2
 *  online mode → P2 is a bot (synthesizes U↔I alternating mashing), the human is P1 (q/w)
 *  result confirmed → slam effect (RESULT_FX_MS) then reportRoundEnd(mapped) once → <ResultOverlay />
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { game10, G10, GAME_DURATION } from '@madpump/shared';
import type { Game10State, GameInputEvent } from '@madpump/shared';
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
import './game10.css';

// ---------------------------------------------------------------------------
// Canvas constants (logical resolution 960×540 = 16:9, responsive scaling via CSS · DPR separate).
// The core's only coordinate is the normalized pos(-1..1), so everything else is placed directly in canvas px.
// ---------------------------------------------------------------------------
const CW = 960;
const CH = 540;

const ROPE_Y = 292; // rope line y
const CENTER_X = 480; // pos=0
const HALF_SPAN = 348; // left/right distance to pos=±1
const LEFT_GOAL_X = CENTER_X - HALF_SPAN; // 132 (pos=-1, P1 win line)
const RIGHT_GOAL_X = CENTER_X + HALF_SPAN; // 828 (pos=+1, P2 win line)
const LEFT_BASE_X = 66; // P1 anchor (team position)
const RIGHT_BASE_X = 894; // P2 anchor
const FLOOR_Y = ROPE_Y + 60;

const ARCADE = '"Press Start 2P", monospace';

/**
 * theme.css token values copied (canvas can't read CSS variables, so as hex constants).
 * p1/p2 are not a 'role' but a 'player color' reference value: p1=blue (cyan), p2=red (pink).
 * At the top of drawScene, functionColors() reflects the actual player colors of the P1/P2 functional entities and swaps them into the local COL.
 */
const COL0 = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  text: '#f4f0ff', // --text
  muted: '#9d8fbf', // --text-muted
  accent: '#fdf500', // --accent (coin yellow)
  accent2: '#d300c5', // --accent2 (neon purple)
  p1: '#05d9e8', // blue reference color — cyan
  p1dim: '#0a3a4a', // blue dim
  p2: '#ff2a6d', // red reference color — pink
  p2dim: '#4a0a26', // red dim
} as const;

/** Color palette type — also holds the swapped local COL (values are string, not literals) */
type Palette = { [K in keyof typeof COL0]: string };

/** In-game slam effect duration between judgment → result overlay transition */
const RESULT_FX_MS = 620;

const clampPos = (v: number) => Math.max(-1.03, Math.min(1.03, v));
const clampLean = (v: number) => Math.max(-6, Math.min(30, v));
const markerXOf = (pos: number) => CENTER_X + clampPos(pos) * HALF_SPAN;

// ---------------------------------------------------------------------------
// Effects (render-only — does not intrude on logic)
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'shock'; side: 'P1' | 'P2'; t: number }
  | { kind: 'chroma'; t: number }
  | { kind: 'win'; winner: 'P1' | 'P2' | 'DRAW'; t: number };

interface Trail {
  x: number;
  t: number;
}

interface WhoYou {
  p1IsYou: boolean;
  p2IsYou: boolean;
}

/** core result → shell MatchResult */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): 'P1_WIN' | 'P2_WIN' | 'DRAW' {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

// ---------------------------------------------------------------------------
// Render helpers (pure drawing — state is read-only)
// ---------------------------------------------------------------------------

/** Glowing rope segment (slight sag + inner highlight wick) */
function drawRopeSeg(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  color: string,
): void {
  const mx = (x1 + x2) / 2;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, ROPE_Y);
  ctx.quadraticCurveTo(mx, ROPE_Y + 7, x2, ROPE_Y);
  ctx.stroke();
  // wick highlight
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(244,240,255,0.85)';
  ctx.beginPath();
  ctx.moveTo(x1, ROPE_Y);
  ctx.quadraticCurveTo(mx, ROPE_Y + 7, x2, ROPE_Y);
  ctx.stroke();
  ctx.restore();
}

/** Neon stick fighter (tug-of-war pose: body leaning outward, arms on the rope) */
function drawPuller(
  ctx: CanvasRenderingContext2D,
  side: 'P1' | 'P2',
  baseX: number,
  lean: number,
  isYou: boolean,
  now: number,
  col: Palette,
): void {
  const isP1 = side === 'P1';
  const color = isP1 ? col.p1 : col.p2;
  const dir = isP1 ? -1 : 1; // outward (pulling) direction
  const hipY = ROPE_Y + 30;
  const shoulderX = baseX + dir * lean;
  const shoulderY = ROPE_Y + 2;
  const headX = shoulderX + dir * 4;
  const headY = ROPE_Y - 16;
  const gripX = baseX - dir * 24; // hands toward the rope (center)
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2.6;
  // torso
  ctx.beginPath();
  ctx.moveTo(baseX, hipY);
  ctx.lineTo(shoulderX, shoulderY);
  ctx.stroke();
  // arm → rope grip
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(gripX, ROPE_Y);
  ctx.stroke();
  // legs (outer brace + inner support)
  ctx.beginPath();
  ctx.moveTo(baseX, hipY);
  ctx.lineTo(baseX + dir * 16, FLOOR_Y);
  ctx.moveTo(baseX, hipY);
  ctx.lineTo(baseX - dir * 10, FLOOR_Y);
  ctx.stroke();
  // head
  ctx.beginPath();
  ctx.arc(headX, headY, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // YOU tag (my side in online) — stepped blink
  if (isYou && Math.floor(now / 500) % 2 === 0) {
    ctx.save();
    ctx.font = `10px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = col.accent;
    ctx.shadowColor = col.accent;
    ctx.shadowBlur = 8;
    ctx.fillText('YOU', headX, headY - 16);
    ctx.restore();
  }
}

/** Rope knot + pennant flag */
function drawKnot(
  ctx: CanvasRenderingContext2D,
  markerX: number,
  pos: number,
  now: number,
  reduce: boolean,
  col: Palette,
): void {
  const color = pos < -0.02 ? col.p1 : pos > 0.02 ? col.p2 : col.text;
  // knot (diamond)
  ctx.save();
  ctx.translate(markerX, ROPE_Y);
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-9, -9, 18, 18);
  ctx.restore();
  // bright center
  ctx.save();
  ctx.fillStyle = col.text;
  ctx.beginPath();
  ctx.arc(markerX, ROPE_Y, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // flagpole + pennant (points toward the winning side)
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(markerX, ROPE_Y - 10);
  ctx.lineTo(markerX, ROPE_Y - 52);
  ctx.stroke();
  const flutter = reduce ? 0 : Math.sin(now / 90) * 3;
  const dirSign = pos < 0 ? -1 : 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(markerX, ROPE_Y - 52);
  ctx.lineTo(markerX + dirSign * 26, ROPE_Y - 46 + flutter);
  ctx.lineTo(markerX, ROPE_Y - 40);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game10State,
  fx: readonly Fx[],
  trail: readonly Trail[],
  now: number,
  who: WhoYou,
  reduce: boolean,
): void {
  // Color is player-dependent (not role) — paint with the actual player colors of the P1/P2 functional entities.
  //  If the P1 entity color is blue, keep COL0 as-is; if red, swap p1/p2(+dim). Local COL for shadow → COL.p1/p2 below auto-reflected.
  //  ('blue'=existing P1 color cyan, 'red'=existing P2 color pink. If offline/no info, fc={p1:'blue',p2:'red'}→no swap.)
  const fc = functionColors();
  const COL: Palette =
    fc.p1 === 'red'
      ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
      : COL0;
  const pos = clampPos(s.pos);
  const markerX = markerXOf(s.pos);
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const winFx = fx.find((f): f is Extract<Fx, { kind: 'win' }> => f.kind === 'win');
  const winAge = winFx ? now - winFx.t : Infinity;

  // --- background ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // giant watermark "PULL" (non-glowing, very faint)
  ctx.save();
  ctx.font = `bold 150px ${ARCADE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(211,0,197,0.06)';
  ctx.strokeText('PULL', CENTER_X, ROPE_Y - 20);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';

  // grid bands
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,42,109,0.10)' : 'rgba(211,0,197,0.08)';
  ctx.lineWidth = 1;
  for (let gx = LEFT_GOAL_X; gx <= RIGHT_GOAL_X; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, ROPE_Y - 150);
    ctx.lineTo(gx, FLOOR_Y);
    ctx.stroke();
  }
  for (let gy = ROPE_Y - 120; gy < FLOOR_Y; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(LEFT_GOAL_X, gy);
    ctx.lineTo(RIGHT_GOAL_X, gy);
    ctx.stroke();
  }
  ctx.restore();

  // floor line
  ctx.save();
  ctx.strokeStyle = 'rgba(211,0,197,0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, FLOOR_Y);
  ctx.lineTo(CW - 40, FLOOR_Y);
  ctx.stroke();
  ctx.restore();

  // --- win line zones (both sides) ---
  for (const side of ['P1', 'P2'] as const) {
    const isP1 = side === 'P1';
    const color = isP1 ? COL.p1 : COL.p2;
    const dim = isP1 ? COL.p1dim : COL.p2dim;
    const goalX = isP1 ? LEFT_GOAL_X : RIGHT_GOAL_X;
    const zoneX = isP1 ? 0 : RIGHT_GOAL_X;
    const zoneW = isP1 ? LEFT_GOAL_X : CW - RIGHT_GOAL_X;
    const near = Math.max(0, isP1 ? -pos : pos); // how close to this win line (0..1)
    // dim background (darker the closer it gets)
    ctx.save();
    ctx.fillStyle = dim;
    ctx.globalAlpha = 0.4 + near * 0.4;
    ctx.fillRect(zoneX, 0, zoneW, CH);
    ctx.restore();
    // win line (thick and flickering when near/winning)
    const hot = near > 0.72 || (winFx && winFx.winner === side);
    const blur = hot ? (reduce ? 16 : 12 + (Math.sin(now / 80) + 1) * 6) : 8;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.lineWidth = hot ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(goalX, 0);
    ctx.lineTo(goalX, CH);
    ctx.stroke();
    ctx.restore();
  }

  // --- center battle line ---
  ctx.save();
  ctx.strokeStyle = 'rgba(211,0,197,0.55)';
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CENTER_X, ROPE_Y - 140);
  ctx.lineTo(CENTER_X, FLOOR_Y);
  ctx.stroke();
  ctx.restore();

  // --- knot afterimage ---
  ctx.save();
  for (const tr of trail) {
    const age = now - tr.t;
    if (age > 220) continue;
    ctx.globalAlpha = 0.18 * (1 - age / 220);
    ctx.fillStyle = pos < 0 ? COL.p1 : COL.p2;
    ctx.fillRect(tr.x - 3, ROPE_Y - 3, 6, 6);
  }
  ctx.restore();

  // --- rope (relative to knot: left=cyan / right=pink) ---
  drawRopeSeg(ctx, LEFT_BASE_X + 16, markerX, COL.p1);
  drawRopeSeg(ctx, markerX, RIGHT_BASE_X - 16, COL.p2);

  // --- fighters (yank at the moment of a pull + lean when leading) ---
  const p1Lean = 8 + Math.max(0, -pos) * 16 + (s.p1Flash > 0 ? (s.p1Flash / G10.FLASH) * 6 : 0);
  const p2Lean = 8 + Math.max(0, pos) * 16 + (s.p2Flash > 0 ? (s.p2Flash / G10.FLASH) * 6 : 0);
  drawPuller(ctx, 'P1', LEFT_BASE_X, clampLean(p1Lean), who.p1IsYou, now, COL);
  drawPuller(ctx, 'P2', RIGHT_BASE_X, clampLean(p2Lean), who.p2IsYou, now, COL);

  // --- knot + flag ---
  drawKnot(ctx, markerX, pos, now, reduce, COL);

  // --- pull shockwave rings ---
  for (const f of fx) {
    if (f.kind !== 'shock') continue;
    const age = now - f.t;
    if (age > 320) continue;
    const color = f.side === 'P1' ? COL.p1 : COL.p2;
    const ox = f.side === 'P1' ? LEFT_BASE_X + 30 : RIGHT_BASE_X - 30;
    ctx.save();
    ctx.globalAlpha = 0.5 * (1 - age / 320);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ox, ROPE_Y, 6 + age * 0.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // --- canvas labels: win lines / NEXT hint / pull score (Press Start 2P ≥10px) ---
  ctx.save();
  ctx.textAlign = 'center';
  // win line caption
  ctx.font = `12px ${ARCADE}`;
  ctx.fillStyle = COL.p1;
  ctx.fillText('P1 WIN', LEFT_GOAL_X / 2 + 8, 32);
  ctx.fillStyle = COL.p2;
  ctx.fillText('P2 WIN', (RIGHT_GOAL_X + CW) / 2 - 8, 32);
  // NEXT key hint (visualizes the forced alternation — derived from p1/p2LastKey)
  const p1Next = s.p1LastKey === 'KeyQ' ? 'W' : s.p1LastKey === 'KeyW' ? 'Q' : 'Q W';
  const p2Next = s.p2LastKey === 'KeyU' ? 'I' : s.p2LastKey === 'KeyI' ? 'U' : 'U I';
  ctx.font = `10px ${ARCADE}`;
  ctx.fillStyle = COL.muted;
  ctx.fillText('NEXT', LEFT_BASE_X + 34, ROPE_Y - 104);
  ctx.fillText('NEXT', RIGHT_BASE_X - 34, ROPE_Y - 104);
  ctx.font = `16px ${ARCADE}`;
  ctx.fillStyle = COL.p1;
  ctx.shadowColor = COL.p1;
  ctx.shadowBlur = 8;
  ctx.fillText(p1Next, LEFT_BASE_X + 34, ROPE_Y - 82);
  ctx.fillStyle = COL.p2;
  ctx.shadowColor = COL.p2;
  ctx.fillText(p2Next, RIGHT_BASE_X - 34, ROPE_Y - 82);
  ctx.shadowBlur = 0;
  // pull score
  ctx.font = `10px ${ARCADE}`;
  ctx.fillStyle = COL.muted;
  ctx.fillText('PULLS', LEFT_BASE_X + 34, CH - 40);
  ctx.fillText('PULLS', RIGHT_BASE_X - 34, CH - 40);
  ctx.font = `16px ${ARCADE}`;
  ctx.fillStyle = COL.p1;
  ctx.fillText(String(s.p1Pulls), LEFT_BASE_X + 34, CH - 20);
  ctx.fillStyle = COL.p2;
  ctx.fillText(String(s.p2Pulls), RIGHT_BASE_X - 34, CH - 20);
  ctx.restore();

  // --- win slam overlay (only at the win/loss moment) ---
  if (winFx && winAge < RESULT_FX_MS + 300) {
    const color =
      winFx.winner === 'P1' ? COL.p1 : winFx.winner === 'P2' ? COL.p2 : COL.accent2;
    const a = Math.max(0, 1 - winAge / (RESULT_FX_MS + 300));
    ctx.save();
    ctx.globalAlpha = 0.22 * a;
    ctx.fillStyle = color;
    if (winFx.winner === 'P1') ctx.fillRect(0, 0, CENTER_X, CH);
    else if (winFx.winner === 'P2') ctx.fillRect(CENTER_X, 0, CW - CENTER_X, CH);
    else ctx.fillRect(0, 0, CW, CH);
    ctx.restore();
    if (Math.floor(winAge / 120) % 2 === 0 || winAge > 360) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `24px ${ARCADE}`;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillText(winFx.winner === 'DRAW' ? 'DRAW' : `${winFx.winner} WINS`, CENTER_X, 92);
      ctx.restore();
    }
  }

  // --- chromatic glitch 1 frame (at the win/loss moment, respects reduced-motion) ---
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (!reduce && chroma && now - chroma.t < 90) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.28;
    ctx.drawImage(ctx.canvas, -5, 0, CW, CH);
    ctx.globalAlpha = 0.2;
    ctx.drawImage(ctx.canvas, 5, 0, CW, CH);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Game10() {
  useDebugScreen('scr-game10');
  const flow = useFlow();
  const navigate = useNavigate();

  // Online render hook (performance standard). Selectively subscribes to active/role only → rerenders only at round boundaries.
  // Server snapshots are mirrored via stateRef (no rerender), and only per-snapshot HUD/debug reflection happens in onSnapshot.
  const { isOnline, myRole, stateRef } = useOnlineRender<Game10State>(10, (s) => {
    setDebugGame(s);
    const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remainingMs / 1000) * 1000);
  });
  // Prevent stale closure: ref mirror so the keyboard callback always sees the latest 'online active state'.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const botRef = useRef<{ last: 'KeyU' | 'KeyI' | null; nextAt: number }>({ last: null, nextAt: 0 });
  const fxRef = useRef<Fx[]>([]);
  const trailRef = useRef<Trail[]>([]);
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  // End effect: track result transition → basic flash (no explosion)
  const endRef = useRef<EndTracker>(createEndTracker());

  /** Remaining time for HUD display (quantized to seconds — saves rerenders) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();
  const lampRef = useRef({ flashU, flashI });
  lampRef.current = { flashU, flashI };

  // direct-URL recovery + clean up debug bridge on unmount
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 10) startOfflineGame(10);
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

  // Keyboard — local adapter. Loads the GameInputEvent queue + lights lamps.
  // When online, the P2 keys are handled by the bot, so they are not absorbed.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // True server online: no local queue/bot — only my input is sent to the server.
        // Any of the 4 keys maps to my slot (the server rewrites the slot by role).
        //   slot A = primary key (KeyQ/KeyU), slot B = secondary key (KeyW/KeyI).
        if (isOnlineRef.current) {
          // Online uses only the U/I two keys (requirement). U=primary key (slotA), I=secondary key (slotB). Q/W are ignored.
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          if (e.type === 'down') {
            if (e.code === 'KeyU') flashU();
            else flashI();
          }
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          return;
        }

        // --- offline (local 2-player / local online mock bot): unchanged ---
        const f = getFlow();
        const localOnline = f.mode === 'online';
        const isP2 = e.code === 'KeyU' || e.code === 'KeyI';
        if (localOnline && isP2) return; // online P2 = bot
        if (e.type === 'down') {
          if (e.code === 'KeyQ') flashQ();
          else if (e.code === 'KeyW') flashW();
          else if (e.code === 'KeyU') flashU();
          else if (e.code === 'KeyI') flashI();
        }
        if (f.phase === 'playing') actionsRef.current.push(e);
      },
    );
    return detach;
  }, [flashQ, flashW, flashU, flashI]);

  // Round lifecycle: create state → rAF loop (step + draw) → report result
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // ── Online: draw-only loop that draws only server state (no step·bot·result reporting) ──
    if (isOnline) {
      // Prepare a neutral initial state so there is something to draw even before the first snapshot (render-only, no step)
      if (!stateRef.current) {
        stateRef.current = game10.create(Math.random);
        setDebugGame(stateRef.current);
      }
      let raf = 0;
      let prevP1Pulls = stateRef.current?.p1Pulls ?? 0;
      let prevP2Pulls = stateRef.current?.p2Pulls ?? 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const s = stateRef.current;
        const ctx = canvasRef.current?.getContext('2d');
        if (!s || !ctx) return;
        // Only once, at the moment a valid pull (pull count increase) in the server snapshot is first detected this frame.
        if (s.p1Pulls > prevP1Pulls) sfx('g10-pull');
        if (s.p2Pulls > prevP2Pulls) sfx('g10-pull');
        prevP1Pulls = s.p1Pulls;
        prevP2Pulls = s.p2Pulls;
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
        const disp = getPlayerDisplays(getFlow());
        drawScene(
          ctx,
          s,
          fxRef.current,
          trailRef.current,
          now,
          { p1IsYou: disp.P1.isYou, p2IsYou: disp.P2.isYou },
          reduce,
        );
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    // ── Offline (local sim + bot + result reporting): unchanged ──
    if (flow.gameId !== 10 || flow.phase !== 'playing') return;

    const st = game10.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    botRef.current = { last: null, nextAt: 0 };
    fxRef.current = [];
    trailRef.current = [];
    reportedRef.current = false;
    resultAtRef.current = 0;
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (isRoundIntroActive()) { last = now; return; }
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        const events = actionsRef.current;
        actionsRef.current = [];

        // Online bot (P2): synthesizes U↔I alternating mashing (medium tempo so the human P1 has a chance to win)
        if (getFlow().mode === 'online' && now >= botRef.current.nextAt) {
          const nk: 'KeyU' | 'KeyI' = botRef.current.last === 'KeyU' ? 'KeyI' : 'KeyU';
          events.push({ code: nk, type: 'down', t: now / 1000 });
          botRef.current.last = nk;
          (nk === 'KeyU' ? lampRef.current.flashU : lampRef.current.flashI)();
          botRef.current.nextAt = now + 120 + Math.random() * 70;
        }

        // step mutates the original then returns the same reference → snapshot comparison values as scalars before the call
        const prevP1Pulls = s.p1Pulls;
        const prevP2Pulls = s.p2Pulls;
        const prevPos = s.pos;
        s = game10.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);
        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);

        // ---- render-only derivation ----
        if (s.p1Pulls > prevP1Pulls) { fxRef.current.push({ kind: 'shock', side: 'P1', t: now }); sfx('g10-pull'); }
        if (s.p2Pulls > prevP2Pulls) { fxRef.current.push({ kind: 'shock', side: 'P2', t: now }); sfx('g10-pull'); }
        const mxPrev = markerXOf(prevPos);
        const mxNow = markerXOf(s.pos);
        if (Math.abs(mxNow - mxPrev) > 0.3) trailRef.current.push({ x: mxPrev, t: now });
        trailRef.current = trailRef.current.filter((tr) => now - tr.t < 220);

        // judgment moment (glitch only at the win/loss moment)
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          fxRef.current.push({ kind: 'win', winner: s.result, t: now });
          if (!reduce) fxRef.current.push({ kind: 'chroma', t: now });
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // When online the server drives round:end, so the screen does not report.
        if (isOnline) return;
        // Briefly show the slam effect, then report round end once → ResultOverlay
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
        const disp = getPlayerDisplays(getFlow());
        drawScene(
          ctx,
          s,
          fxRef.current,
          trailRef.current,
          now,
          { p1IsYou: disp.P1.isYou, p2IsYou: disp.P2.isYou },
          reduce,
        );
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= 5000;
  // My color (fixed per match, independent of role) — keycap color uses this. Immutable within a match, so a non-reactive read suffices.
  const myColor = isOnline ? (onlineStore.get().myColor ?? 'blue') : 'blue';

  return (
    <main data-testid="scr-game10" className="g10-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g10-topbar">
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
        <span className="g10-title font-arcade c-muted">Game 10 · Tug of War</span>
      </div>

      <div className="g10-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g10-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g10-canvas" aria-label="Game 10 stage — Tug of War" />
      </div>

      {/* On-screen keycaps. Online uses only the U/I two keys, so it only shows/lights the controls on my role (color) side.
          Offline keeps the existing 2-player layout (Q/W ↔ U/I). */}
      {isOnline ? (
        <div className="g10-keys g10-keys--online">
          <div className="g10-keys__group">
            <span
              className={`g10-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}
            >
              YOU · {myColor === 'blue' ? 'BLUE' : 'RED'} · pull alternately
            </span>
            <KeyCap
              role={myColor === 'blue' ? 'P1' : 'P2'}
              keyChar="U"
              icon={myRole === 'P1' ? '◀' : '▶'}
              lit={uLit}
              label="Pull"
            />
            <KeyCap
              role={myColor === 'blue' ? 'P1' : 'P2'}
              keyChar="I"
              icon={myRole === 'P1' ? '◀' : '▶'}
              lit={iLit}
              label="Pull"
            />
          </div>
          <span className="g10-keys__hint font-arcade c-muted">Mash U↔I alternately!</span>
        </div>
      ) : (
        <div className="g10-keys">
          <div className="g10-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="◀" lit={qLit} label="Pull" />
            <KeyCap role="P1" keyChar="W" icon="◀" lit={wLit} label="Pull" />
            <span className="g10-keys__tag font-arcade c-p1">P1 · pull alternately</span>
          </div>
          <span className="g10-keys__hint font-arcade c-muted">Mash Q↔W · U↔I alternately!</span>
          <div className="g10-keys__group">
            <span className="g10-keys__tag font-arcade c-p2">P2 · pull alternately</span>
            <KeyCap role="P2" keyChar="U" icon="▶" lit={uLit} label="Pull" />
            <KeyCap role="P2" keyChar="I" icon="▶" lit={iLit} label="Pull" />
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}