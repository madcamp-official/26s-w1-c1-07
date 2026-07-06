/**
 * Game 7 — Speed Gomoku (NEON COIN-OP). Owner: game9 agent.
 * Container testid: scr-game9 / parts: game-stage(CRT bezel), hud-*(HudFrame embedded), btn-exit
 *
 * ── Principles of this screen ──────────────────────────────────────────────
 *  · Logic/decision is 100% @madpump/shared game9 core(create/step) + G9 constants + maxRun helper reuse only.
 *  · Rendering (canvas neon art) is written fresh from scratch — does not reference the game-lab renderer. design-lab import 0 lines.
 *  · Colors/fonts copy the theme.css token values (canvas can't read CSS variables, so hex is hardcoded).
 *
 * ── Game (core logic summary, per shared/games/game9/logic.ts comments) ──
 *  · 7×7 intersection board (index=r*7+c). The scanner cursor sweeps the board row-first once every ~1s (=49×0.02s).
 *  · Turn-based: when the current-turn player presses their placement key (P1=Q / P2=U), a stone is placed at the intersection under the cursor and the turn switches immediately.
 *    If they fail to place within the time limit (TURN_TIME), the system randomly auto-places on an empty intersection.
 *  · W(P1)/I(P2) = turn-independent FLASH_TIME(0.1s) screen flash to disrupt the opponent's view.
 *  · First to get 3 in a row horizontally/vertically/diagonally (WIN_RUN) → instant win. On time-up, decided by 2-in-a-row holdings/density (handled by the core).
 *
 * ── Art direction: "Speed Gomoku — neon grid, flowing scanner" (derived from the PLAN §1 synthwave system) ──
 *  · Purple neon grid over a deep-purple board + a player-colored scanner reticle (corner brackets) sweeps the intersections.
 *  · Stone = dim base + 2px player-colored ring + restrained glow (no large-area pure color). Only the just-placed stone pulses strongly.
 *  · At the moment 3-in-a-row completes, a winner-colored glowing line + a short glitch. Flash is expressed as CRT interference noise over the board.
 *  · Keep strong glowing elements to 3 or fewer: scanner reticle / turn-time bar / (transient) placement pulse·win line.
 *
 * ── Wiring (same pattern as the Game 1·2 screens) ──
 *  mount → if idle or a different game, startOfflineGame(9) (direct-URL recovery)
 *  each round game9.create(Math.random) → in the rAF loop game9.step(state, events, dtSec) → setDebugGame every tick
 *  input: attachLocalKeyboard(GameInputEvent queue) → passed straight to step. KeyQ/KeyW=P1, KeyU/KeyI=P2.
 *  the core mutates the original then returns the same reference → prev-value comparison snapshots before the step call, HUD holds scalars as React state.
 *  result finalized → (after the RESULT_FX_MS effect) reportRoundEnd once (reportedRef guard) → <ResultOverlay />
 *  online mode → P2 is a bot (picks a target intersection via a maxRun-based heuristic, then synthesizes KeyU when the cursor passes it, occasionally KeyI to disrupt)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { game9, G9, GAME_DURATION, maxRun } from '@madpump/shared';
import type { Game9State, GameInputEvent, PlayerColor } from '@madpump/shared';
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
import { useOnlineRender } from '../../net/useOnlineRender';
import { functionColors, onlineStore, sendInput as onlineSendInput } from '../../net/online';
import { createEndTracker, drawEndFlash, type EndTracker } from '../../game/endFx';
import { setDebugGame, useDebugScreen } from '../../debug';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import { sfx } from '@/audio';
import './game9.css';

// ---------------------------------------------------------------------------
// Canvas logical resolution (responsive scaling via CSS). Keeps 16:9 — a square board centered with info columns on either side.
// ---------------------------------------------------------------------------
const CW = 960;
const CH = 540;

const N = G9.N; // 7
const CELL = 56; // intersection spacing(px)
const BOARD = CELL * (N - 1); // 336
const BX = (CW - BOARD) / 2; // 312 (board top-left x)
const BY = 118; // board top-left y
const BR = BX + BOARD; // 648
const BB = BY + BOARD; // 454
const STONE_R = 20;

// theme.css token values copied (§1.1) — module default palette (by role P1=cyan / P2=pink).
// Colors are player-dependent: at the top of drawScene, functionColors() swaps the local COL so
// the P1/P2 functional entities follow the actual player colors (minimizing per-item substitution).
const COL0 = {
  field: '#160a33', // --surface-deep
  raised: '#1a0b2e', // --bg-raised
  grid: '#d300c5', // --accent2 (neon purple grid/border)
  p1: '#05d9e8', // --p1 (left, fixed cyan)
  p1dim: '#0a3a4a', // --p1-dim
  p2: '#ff2a6d', // --p2 (right, fixed pink)
  p2dim: '#4a0a26', // --p2-dim
  accent: '#fdf500', // --accent (Coin yellow — already owned by the HUD countdown, unused on the stage)
  muted: '#9d8fbf', // --text-muted
  text: '#f4f0ff', // --text
  error: '#ff3864', // --error (turn-time imminent warning)
} as const;

/** Type holding both COL0 (literal) and the swapped local palette — used when passing the local COL that drawScene builds to helpers. */
interface Palette {
  field: string;
  raised: string;
  grid: string;
  p1: string;
  p1dim: string;
  p2: string;
  p2dim: string;
  accent: string;
  muted: string;
  text: string;
  error: string;
}

const FONT_ARCADE = '"Press Start 2P", monospace';
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** In-game effect duration between the decision moment → the result overlay transition (win line + glitch) */
const RESULT_FX_MS = 620;

// ---------------------------------------------------------------------------
// Pure utils (render/bot helpers — do not intrude on core decisions)
// ---------------------------------------------------------------------------

/** intersection index → canvas coords/row-col */
function pt(idx: number): { x: number; y: number; r: number; c: number } {
  const r = Math.floor(idx / N);
  const c = idx % N;
  return { x: BX + c * CELL, y: BY + r * CELL, r, c };
}

function countStones(board: number[], player: number): number {
  let n = 0;
  for (let i = 0; i < board.length; i++) if (board[i] === player) n++;
  return n;
}

/** Longest run of player stones passing through idx, as an intersection list (geometry for rendering the win line) */
function runSegment(board: number[], idx: number, player: number): number[] {
  const r0 = Math.floor(idx / N);
  const c0 = idx % N;
  let best: number[] = [idx];
  for (const [dr, dc] of DIRS) {
    const line = [idx];
    for (const s of [1, -1]) {
      let r = r0 + dr * s;
      let c = c0 + dc * s;
      while (r >= 0 && r < N && c >= 0 && c < N && board[r * N + c] === player) {
        line.push(r * N + c);
        r += dr * s;
        c += dc * s;
      }
    }
    if (line.length > best.length) best = line;
  }
  return best;
}

/** Online bot move selection — based on maxRun (shared helper). Priority: my 3-in-a-row > block > extend > center density */
function pickBotMove(board: number[]): number {
  const empties: number[] = [];
  for (let i = 0; i < board.length; i++) if (board[i] === 0) empties.push(i);
  if (empties.length === 0) return 0;
  const center = (N - 1) / 2;
  let bestIdx = empties[0];
  let bestScore = -Infinity;
  for (const idx of empties) {
    const r = Math.floor(idx / N);
    const c = idx % N;
    let score = 0;
    const own = board.slice();
    own[idx] = 2;
    const ownRun = maxRun(own, 2);
    score += ownRun >= G9.WIN_RUN ? 1000 : ownRun * 10;
    const opp = board.slice();
    opp[idx] = 1;
    const oppRun = maxRun(opp, 1);
    score += oppRun >= G9.WIN_RUN ? 500 : oppRun * 4;
    score -= Math.abs(r - center) + Math.abs(c - center); // density tiebreak favor
    score += Math.random() * 0.5; // fine tiebreak
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

// ---------------------------------------------------------------------------
// Render-only effects
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'place'; idx: number; player: number; auto: boolean; t: number }
  | { kind: 'glitch'; t: number };

interface WinLine {
  seg: number[];
  player: number;
  t: number;
}

// ---------------------------------------------------------------------------
// Canvas renderer (pure drawing — state is read-only)
// ---------------------------------------------------------------------------
function txt(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  glow = 0,
  align: CanvasTextAlign = 'center',
): void {
  ctx.save();
  ctx.font = `${size}px ${FONT_ARCADE}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillText(s, x, y);
  ctx.restore();
}

function drawStone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  player: number,
  strong: boolean,
  col: Palette,
): void {
  const color = player === 1 ? col.p1 : col.p2;
  const dim = player === 1 ? col.p1dim : col.p2dim;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = strong ? 16 : 6; // only the just-placed stone gets a strong glow (§ restrained glow)
  ctx.fillStyle = dim; // dim base (no large-area pure color)
  ctx.beginPath();
  ctx.arc(x, y, STONE_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color; // 2px player-colored ring
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = color; // core dot
  ctx.beginPath();
  ctx.arc(x, y, STONE_R * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Scanner reticle — a corner-bracket motif (§1.3) aiming at the current cursor intersection */
function drawReticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  now: number,
): void {
  const half = CELL * 0.46;
  const tick = 9;
  const pulse = 0.5 + 0.5 * Math.sin(now / 90);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 + pulse * 8;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'square';
  const corners: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [sx, sy] of corners) {
    const cxp = x + sx * half;
    const cyp = y + sy * half;
    ctx.beginPath();
    ctx.moveTo(cxp - sx * tick, cyp);
    ctx.lineTo(cxp, cyp);
    ctx.lineTo(cxp, cyp - sy * tick);
    ctx.stroke();
  }
  // small center crosshair
  ctx.globalAlpha = 0.4 + 0.4 * pulse;
  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.lineTo(x + 5, y);
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y + 5);
  ctx.stroke();
  ctx.restore();
}

function drawSidePanel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  player: number,
  board: number[],
  isTurn: boolean,
  isYou: boolean,
  now: number,
  col: Palette,
): void {
  const color = player === 1 ? col.p1 : col.p2;
  const label = player === 1 ? 'P1' : 'P2';
  const stones = countStones(board, player);
  const run = maxRun(board, player);
  const runHot = run >= 2; // holding 2-in-a-row = advantage on time-up
  // label (bright if it's the current turn)
  txt(ctx, label, cx, 172, 16, color, isTurn ? 10 : 3);
  if (isTurn) txt(ctx, 'TO PLAY', cx, 196, 8, color, 4);
  // stats
  txt(ctx, `STONES ${stones}`, cx, 226, 10, col.muted, 0);
  txt(ctx, `RUN ${run}`, cx, 252, 12, runHot ? color : col.muted, runHot ? 6 : 0);
  // 3 progress lamps (run count) — 3 = win imminent
  const lampY = 280;
  for (let i = 0; i < 3; i++) {
    const lx = cx - 26 + i * 26;
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, lampY, 6, 0, Math.PI * 2);
    if (i < run) {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fill();
    } else {
      ctx.fillStyle = col.field;
      ctx.fill();
      ctx.strokeStyle = 'rgba(211,0,197,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
  // YOU tag (online, my side) — hard blink
  if (isYou && Math.floor(now / 500) % 2 === 0) {
    txt(ctx, 'YOU', cx, 140, 10, color, 6);
  }
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game9State,
  now: number,
  fx: readonly Fx[],
  winLine: WinLine | null,
  meta: { p1IsYou: boolean; p2IsYou: boolean; reduced: boolean },
): void {
  // Colors are player-dependent (not role) — paint the P1/P2 functional entities with the actual player colors.
  //  If fc.p1==='red', swap the local COL so P1 entity=pink·P2 entity=cyan → COL.p1/p2 uses below reflect it automatically.
  //  (Both the online and offline draw paths go through this function, so swapping in this one place is enough.)
  const fc = functionColors();
  const COL: Palette =
    fc.p1 === 'red'
      ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
      : COL0;
  const playing = s.result === null;
  const turnColor = s.turn === 1 ? COL.p1 : COL.p2;

  // --- background ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // faint radial glow behind the board
  ctx.save();
  const glow = ctx.createRadialGradient(CW / 2, (BY + BB) / 2, 20, CW / 2, (BY + BB) / 2, BOARD * 0.9);
  glow.addColorStop(0, 'rgba(211,0,197,0.10)');
  glow.addColorStop(1, 'rgba(211,0,197,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(BX - 60, BY - 60, BOARD + 120, BOARD + 120);
  ctx.restore();

  // --- neon grid (intersection board) ---
  ctx.save();
  ctx.strokeStyle = 'rgba(211,0,197,0.45)';
  ctx.shadowColor = COL.grid;
  ctx.shadowBlur = 3;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < N; i++) {
    const gx = BX + i * CELL;
    ctx.beginPath();
    ctx.moveTo(gx, BY);
    ctx.lineTo(gx, BB);
    ctx.stroke();
    const gy = BY + i * CELL;
    ctx.beginPath();
    ctx.moveTo(BX, gy);
    ctx.lineTo(BR, gy);
    ctx.stroke();
  }
  ctx.restore();
  // center star point
  ctx.save();
  ctx.fillStyle = 'rgba(211,0,197,0.7)';
  const cpt = pt(3 * N + 3);
  ctx.beginPath();
  ctx.arc(cpt.x, cpt.y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- scan row band (highlights the current row the cursor is sweeping) ---
  if (playing) {
    const row = Math.floor(s.cursor / N);
    ctx.save();
    ctx.fillStyle = turnColor;
    ctx.globalAlpha = 0.05;
    ctx.fillRect(BX - 14, BY + row * CELL - CELL / 2, BOARD + 28, CELL);
    ctx.restore();
  }

  // --- stones ---
  for (let idx = 0; idx < s.board.length; idx++) {
    const p = s.board[idx];
    if (p === 0) continue;
    const { x, y } = pt(idx);
    drawStone(ctx, x, y, p, idx === s.lastPlaced, COL);
  }

  // --- placement pulse / AUTO tag ---
  for (const f of fx) {
    if (f.kind !== 'place') continue;
    const age = now - f.t;
    const { x, y } = pt(f.idx);
    const color = f.player === 1 ? COL.p1 : COL.p2;
    if (age < 520) {
      const prog = age / 520;
      ctx.save();
      ctx.globalAlpha = 1 - prog;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, STONE_R + prog * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (f.auto && age < 820) {
      // timeout auto-placement indicator
      txt(ctx, 'AUTO', x, y - STONE_R - 12, 10, COL.muted, 4);
    }
  }

  // --- scanner reticle (primary glow) ---
  if (playing) {
    const { x, y } = pt(s.cursor);
    drawReticle(ctx, x, y, turnColor, now);
  }

  // --- win line (3 in a row) ---
  if (winLine && winLine.seg.length >= 2) {
    const color = winLine.player === 1 ? COL.p1 : COL.p2;
    let a = pt(winLine.seg[0]);
    let b = a;
    let minI = winLine.seg[0];
    let maxI = winLine.seg[0];
    for (const i of winLine.seg) {
      if (i < minI) minI = i;
      if (i > maxI) maxI = i;
    }
    a = pt(minI);
    b = pt(maxI);
    const age = now - winLine.t;
    const grow = Math.min(1, age / 220);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + (b.x - a.x) * grow, a.y + (b.y - a.y) * grow);
    ctx.stroke();
    ctx.restore();
  }

  // --- flash (view disruption) — CRT interference over the board ---
  if (s.flash > 0) {
    const a = Math.min(1, s.flash / G9.FLASH_TIME);
    ctx.save();
    ctx.fillStyle = `rgba(244,240,255,${0.5 * a})`;
    ctx.fillRect(BX - 18, BY - 18, BOARD + 36, BOARD + 36);
    if (!meta.reduced) {
      // random scan-noise bars (static wash when reduced motion is on)
      for (let y = BY; y < BB; y += 6) {
        if (Math.random() < 0.5) {
          ctx.fillStyle = Math.random() < 0.5 ? 'rgba(5,217,232,0.5)' : 'rgba(255,42,109,0.5)';
          ctx.globalAlpha = 0.4 * a;
          ctx.fillRect(BX - 18, y, BOARD + 36, 3);
        }
      }
    }
    ctx.restore();
  }

  // --- top banner ---
  if (playing) {
    const arrow = s.turn === 1 ? '▶' : '◀';
    const label = s.turn === 1 ? `${arrow} P1 TURN` : `P2 TURN ${arrow}`;
    txt(ctx, label, CW / 2, 70, 16, turnColor, 10);
  } else {
    const win = winLine ? '3 IN A ROW!' : 'TIME UP';
    const wc = winLine ? (winLine.player === 1 ? COL.p1 : COL.p2) : COL.muted;
    txt(ctx, win, CW / 2, 70, 16, wc, winLine ? 12 : 4);
  }

  // --- turn-time bar (remaining placement time) ---
  const remain = Math.max(0, 1 - s.turnClock / G9.TURN_TIME);
  const barY = 480;
  ctx.save();
  ctx.fillStyle = COL.raised;
  ctx.fillRect(BX, barY, BOARD, 12);
  ctx.strokeStyle = 'rgba(211,0,197,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(BX, barY, BOARD, 12);
  if (playing) {
    const warn = remain < 0.16; // auto-placement imminent → hard blink in error color
    const barColor = warn && Math.floor(now / 90) % 2 === 0 ? COL.error : turnColor;
    ctx.fillStyle = barColor;
    ctx.shadowColor = barColor;
    ctx.shadowBlur = 8;
    ctx.fillRect(BX, barY, BOARD * remain, 12);
  }
  ctx.restore();
  txt(ctx, 'PLACE TIME', CW / 2, barY + 26, 10, COL.muted, 0);

  // --- left/right info columns ---
  drawSidePanel(ctx, 156, 1, s.board, playing && s.turn === 1, meta.p1IsYou, now, COL);
  drawSidePanel(ctx, 804, 2, s.board, playing && s.turn === 2, meta.p2IsYou, now, COL);

  // --- decision-moment glitch (only at the win/loss moment, once) ---
  const glitch = fx.find((f) => f.kind === 'glitch');
  if (glitch && !meta.reduced && now - glitch.t < 110) {
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
export default function Game9() {
  useDebugScreen('scr-game9');
  const flow = useFlow();
  const navigate = useNavigate();

  // Online render hook (performance standard) — selectively subscribes to active/role only (re-renders only at round boundaries),
  // server snapshot → stateRef mirroring subscribes to the store directly (without re-render). Per-snapshot HUD reflection via onSnapshot.
  //  · stateRef.current = latest server snapshot, snapAtRef.current = receive time (basis for local cursor derivation).
  //  · isOnline/myRole are stable primitives → putting them in the loop effect deps causes no churn (prevents starving the rAF).
  const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game9State>(9, (s) => {
    // per server snapshot: debug bridge + HUD remaining time (second-quantized). stateRef/snapAtRef are updated by the hook.
    setDebugGame(s);
    const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remainingMs / 1000) * 1000);
  });
  // ref that lets the keyboard handler (stable closure) see the latest 'is online active'.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const eventsRef = useRef<GameInputEvent[]>([]);
  const fxRef = useRef<Fx[]>([]);
  const winLineRef = useRef<WinLine | null>(null);
  // end effect: tracks the result transition (basic flash only — no explosion)
  const endRef = useRef<EndTracker>(createEndTracker());
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const prevPlacedRef = useRef(-1);
  const botRef = useRef<{ target: number | null; placed: boolean; flashAt: number }>({
    target: null,
    placed: false,
    flashAt: 0,
  });
  const reducedRef = useRef(false);
  // for local online cursor derivation: the cursor is time-deterministic (scan), so the server need not broadcast it (requirement).
  //   the reference points are the last snapshot's turnClock (=stateRef.current.turnClock) and receive time (snapAtRef.current) —
  //   the client rolls it smoothly with a local clock, and sends only the 'picked cell' at the moment of placement to the server (sendInput cell).
  const localCursorRef = useRef(0);

  /** HUD remaining time (second-quantized — saves re-renders) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();
  const lampRef = useRef({ flashQ, flashW, flashU, flashI });
  lampRef.current = { flashQ, flashW, flashU, flashI };

  // direct-URL recovery + prefers-reduced-motion cache + debug bridge cleanup
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 9) startOfflineGame(9);
    reducedRef.current =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => setDebugGame(null);
  }, []);

  // canvas resolution (dpr scale)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // (server state mirroring moved to useOnlineRender's onSnapshot callback — updates stateRef/HUD without re-render)

  // keyboard — collects the GameInputEvent queue + lights lamps. Online P2 (U/I) is absorbed since the bot handles it.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // ── server online active: no local queue/bot — send only my input to the server ──
        // online uses only the two keys U/I (requirement). U=place(slotA), I=disrupt(slotB). Q/W are ignored.
        // the server rewrites the slot to my role's physical key, so the connected player controls their own character.
        // placement (U) also sends the cell picked by the local cursor (localCursorRef) — the server does not manage the cursor.
        if (isOnlineRef.current) {
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          if (e.type === 'down') {
            if (e.code === 'KeyU') {
              lampRef.current.flashU();
              sfx('g9-place-stone'); // placement input
            } else lampRef.current.flashI();
          }
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          const cell = e.code === 'KeyU' ? localCursorRef.current : undefined;
          onlineSendInput(slot, e.type, e.t, cell);
          return;
        }
        // ── offline (local 2-player / if flow.mode==='online', P2 is a bot) — no regression ──
        const f = getFlow();
        const offlineBotMode = f.mode === 'online';
        const isP2 = e.code === 'KeyU' || e.code === 'KeyI';
        if (offlineBotMode && isP2) return; // offline bot mode: P2 = bot
        if (e.type === 'down') {
          if (e.code === 'KeyQ') {
            lampRef.current.flashQ();
            sfx('g9-place-stone'); // P1 placement input
          } else if (e.code === 'KeyW') lampRef.current.flashW();
          else if (e.code === 'KeyU') {
            lampRef.current.flashU();
            sfx('g9-place-stone'); // P2 placement input
          } else if (e.code === 'KeyI') lampRef.current.flashI();
        }
        if (f.phase === 'playing') eventsRef.current.push(e);
      },
    );
    return detach;
  }, []);

  // round lifecycle: create state → rAF loop (step + draw) → report result
  //   if server online is active: bypass into a draw-only loop that only draws server state, with no local sim/bot/result reporting.
  useEffect(() => {
    // ── server online: draw-only (no local step·bot·reportRoundEnd) ──
    if (isOnline) {
      // before the first snapshot, draw the initial create state (empty board). the hook's onSnapshot overwrites it with server state.
      if (!stateRef.current) stateRef.current = game9.create(Math.random);
      let oraf = 0;
      const oloop = (now: number) => {
        oraf = requestAnimationFrame(oloop);
        const s = stateRef.current;
        if (!s) return;
        // the cursor is derived locally instead of using a server broadcast (smoothly, no jitter).
        // updated every frame regardless of canvas readiness (octx) — placement input sends this value to the server as the 'picked cell'.
        let drawn = s;
        if (s.result === null) {
          // the last snapshot's turnClock (=s.turnClock, stateRef is now the latest snapshot) + elapsed since receipt (snapAtRef).
          const at = snapAtRef.current;
          const elapsedSinceSnap = at > 0 ? (now - at) / 1000 : 0;
          const localTurnClock = Math.min(G9.TURN_TIME, s.turnClock + elapsedSinceSnap);
          const localCursor = Math.min(
            G9.CELLS - 1,
            Math.max(0, Math.floor(localTurnClock / G9.CELL_TIME)),
          );
          localCursorRef.current = localCursor;
          drawn = { ...s, cursor: localCursor };
        }
        // octx is re-acquired every frame (recovers even if the canvas attaches late). if null, only drawing is skipped.
        const octx = canvasRef.current?.getContext('2d');
        if (!octx) return;
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
        const disp = getPlayerDisplays(getFlow());
        drawScene(octx, drawn, now, fxRef.current, winLineRef.current, {
          p1IsYou: disp.P1.isYou,
          p2IsYou: disp.P2.isYou,
          reduced: reducedRef.current,
        });
        endRef.current.update(s.result, now);
        drawEndFlash(octx, CW, CH, endRef.current.age(now));
      };
      oraf = requestAnimationFrame(oloop);
      return () => cancelAnimationFrame(oraf);
    }

    if (flow.gameId !== 9 || flow.phase !== 'playing') return;

    const st = game9.create(Math.random);
    stateRef.current = st;
    eventsRef.current = [];
    fxRef.current = [];
    winLineRef.current = null;
    reportedRef.current = false;
    resultAtRef.current = 0;
    prevPlacedRef.current = -1;
    botRef.current = { target: null, placed: false, flashAt: 0 };
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);

    const ctx = canvasRef.current?.getContext('2d') ?? null;
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (isRoundIntroActive()) { last = now; return; }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        const events = eventsRef.current;
        eventsRef.current = [];

        // online bot (P2) — synthesize KeyU when the cursor passes the target intersection, occasionally disrupt with KeyI on the opponent's turn
        if (getFlow().mode === 'online') {
          const bot = botRef.current;
          const tSec = now / 1000;
          if (s.turn === 1) {
            bot.target = null;
            bot.placed = false;
            if (bot.flashAt === 0) bot.flashAt = now + 2500 + Math.random() * 2500;
            if (now >= bot.flashAt) {
              events.push({ code: 'KeyI', type: 'down', t: tSec });
              lampRef.current.flashI();
              bot.flashAt = now + 3200 + Math.random() * 3200;
            }
          } else {
            if (bot.target === null) bot.target = pickBotMove(s.board);
            const predClock = s.turnClock + dt;
            const predCursor = Math.min(G9.CELLS - 1, Math.max(0, Math.floor(predClock / G9.CELL_TIME)));
            if (
              !bot.placed &&
              predClock < G9.TURN_TIME &&
              predCursor >= bot.target &&
              s.board[predCursor] === 0
            ) {
              events.push({ code: 'KeyU', type: 'down', t: tSec });
              lampRef.current.flashU();
              bot.placed = true;
            }
          }
        }

        // the core mutates the original then returns the same reference → prev-value comparison snapshots before the call
        s = game9.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);
        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);

        // derive placement effect (detect lastPlaced change)
        if (s.lastPlaced !== prevPlacedRef.current && s.lastPlaced >= 0) {
          prevPlacedRef.current = s.lastPlaced;
          fxRef.current.push({
            kind: 'place',
            idx: s.lastPlaced,
            player: s.board[s.lastPlaced],
            auto: s.lastAuto,
            t: now,
          });
        }

        // decision moment (once) — if a 3-in-a-row instant win, compute the win line + glitch
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          if (s.elapsed < GAME_DURATION && (s.result === 'P1' || s.result === 'P2') && s.lastPlaced >= 0) {
            const player = s.result === 'P1' ? 1 : 2;
            winLineRef.current = { seg: runSegment(s.board, s.lastPlaced, player), player, t: now };
          }
          fxRef.current.push({ kind: 'glitch', t: now });
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        if (isOnline) return; // online: the server drives round:end — the screen does not report (defensive guard)
        // after briefly showing the win line/glitch, report round end once → ResultOverlay
        reportedRef.current = true;
        reportRoundEnd(s.result === 'P1' ? 'P1_WIN' : s.result === 'P2' ? 'P2_WIN' : 'DRAW');
      }

      if (ctx) {
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
        const disp = getPlayerDisplays(getFlow());
        drawScene(ctx, s, now, fxRef.current, winLineRef.current, {
          p1IsYou: disp.P1.isYou,
          p2IsYou: disp.P2.isYou,
          reduced: reducedRef.current,
        });
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // gated by isOnline/myRole (stable primitives) — passing the online object would re-run every render and starve the rAF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  // my color (fixed per match, player-dependent) — paint the online keycaps with this color rather than by role. offline/unset=blue.
  const myColor: PlayerColor = onlineStore.get().myColor ?? 'blue';
  const urgent = flow.phase === 'playing' && hudMs <= 5000;

  return (
    <main data-testid="scr-game9" className="g9-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g9-topbar">
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
        <span className="g9-title font-display c-muted">Game 9 · Speed Gomoku</span>
      </div>

      <div className="g9-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g9-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g9-canvas" aria-label="Game 9 stage — Speed Gomoku" />

      </div>

      {/* on-screen keycaps — show the actual assigned keys (SPEC Q2), lamps light at the moment of input */}
      {isOnline ? (
        // online: uses only the two keys U/I → label my controls with 'my color' (myColor).
        // colors are player-dependent (role-agnostic); the action labels (place/disrupt) are common to both roles, so keep them.
        <div className="g9-keys g9-keys--online">
          <div className="g9-keys__group">
            <span className={`g9-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myColor === 'blue' ? 'BLUE' : 'RED'} · PLACE
            </span>
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="U" icon="●" lit={uLit} label="Place" />
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="I" icon="✦" lit={iLit} label="Disrupt" />
          </div>
          <span className="g9-keys__hint font-arcade c-muted">AIM SCANNER · FIRST 3-ROW WINS</span>
        </div>
      ) : (
        <div className="g9-keys">
          <div className="g9-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="●" lit={qLit} label="Place" />
            <KeyCap role="P1" keyChar="W" icon="✦" lit={wLit} label="Disrupt" />
            <span className="g9-keys__tag font-arcade c-p1">P1 · PLACE</span>
          </div>
          <span className="g9-keys__hint font-arcade c-muted">AIM SCANNER · FIRST 3-ROW WINS</span>
          <div className="g9-keys__group">
            <span className="g9-keys__tag font-arcade c-p2">P2 · PLACE</span>
            <KeyCap role="P2" keyChar="U" icon="●" lit={uLit} label="Place" />
            <KeyCap role="P2" keyChar="I" icon="✦" lit={iLit} label="Disrupt" />
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}
