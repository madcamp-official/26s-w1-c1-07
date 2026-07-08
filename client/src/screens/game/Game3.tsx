/**
 * Game 6 · Pump (scr-game3) — NEON COIN-OP arcade screen (newly built).
 * Container testid: scr-game3 / parts: game-stage(CRT bezel), hud-*(HudFrame built-in), btn-exit
 *
 * ── Game (core game3) ────────────────────────────────────────────
 *  · A 100-cell rapid-tap string of Q/W for P1 and U/I for P2 (limit 10s × 10).
 *  · Hit "the key you must press now" for +1 & advance to the next cell. Miss = −1 (stay put).
 *  · At the end, the higher score wins (a tie is a Draw).
 *  Key encoding: 0 = first key (Q/U), 1 = second key (W/I).
 *
 * ── Screen (neon-coinop visuals drawn fresh from scratch) ─────────────────
 *  "Two rapid-tap lanes, one score jackpot" — DDR-style note-highway duel.
 *   · Left P1 (cyan) / right P2 (pink) mirrored lanes. In each lane the key tiles descend
 *     toward the hit line (NOW), converging in perspective (smaller and fainter with distance).
 *     The current-cell tile glows at the hit line.
 *   · Correct = tile pop + "+1" rising + hit ring / wrong = red flash + lane shake + "-1".
 *   · Score = arcade jackpot counter (hard step + glow burst at the moment of change).
 *   · Outer PUMP gauge (progress idx/100) — a race for who pumped more.
 *   · A 1-frame chromatic glitch only at the win/loss moment. Final 5s = yellow scan sweep (the only accent).
 *   · CRT bezel/scanlines are global in theme.css · App — do not re-render them here.
 *
 * ── Wiring (same pattern as the Game 1 · 2 screens) ─────────────────────────────
 *   mount → if idle or a different game, startOfflineGame(3) (direct-URL recovery)
 *   each round game3.create(Math.random)
 *   rAF loop → game3.step(state, events, dtSec) → setDebugGame(state) every tick
 *   input attachLocalKeyboard(GameInputEvent queue) → passed straight to step (core judges down only)
 *   result confirmed → (after RESULT_FX_MS glitch) reportRoundEnd(mapping) once → <ResultOverlay />
 *   online mode → P2 is a bot (taps the correct key at a human pace, small miss rate). The human is P1 (q/w).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { game3, G3, SEQ_LEN, GAME_DURATION } from '@madcade/shared';
import type { Game3State, GameInputEvent, PlayerColor } from '@madcade/shared';
import type { MatchResult, PlayerRole } from '@/shell';
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
import { createEndTracker, drawEndFlash, type EndTracker } from '../../game/endFx';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import { sfx } from '@/audio';
import './game3.css';

// ---------------------------------------------------------------------------
// Canvas constants (logical 800×450 — responsive scaling via CSS, 16:9)
// ---------------------------------------------------------------------------
const CW = 800;
const CH = 450;

const COL0 = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  surface: '#241640', // --surface
  p1: '#05d9e8',
  p1dim: '#0a3a4a',
  p2: '#ff2a6d',
  p2dim: '#4a0a26',
  accent: '#fdf500',
  accent2: '#d300c5',
  error: '#ff3864',
  muted: '#9d8fbf',
  text: '#f4f0ff',
} as const;

/**
 * Local palette that binds color to the 'player', not the 'role'.
 * If the P1 function-entity color is blue, keep COL0 as-is (P1=cyan/P2=pink); if red, swap the p1/p2 (and dim) pairs.
 * Offline / no color info = functionColors default {p1:'blue',p2:'red'} → returns COL0 (preserves existing behavior).
 */
type Pal = Record<keyof typeof COL0, string>; // avoid the as const literal type (allow swap assignment)
function palette(): Pal {
  const fc = functionColors();
  return fc.p1 === 'red'
    ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
    : COL0;
}

const ARCADE = '"Press Start 2P", monospace';

// Lane/tile geometry (logical coordinates)
const HIT_Y = 318;
const SPACING = 60;
const TILE = 72; // one side of the NOW tile
const LANE_HALF = 116;
const P1_X = 206;
const P2_X = 594;
const SCORE_Y = 66;
const AHEAD = 4.6; // max offset shown above the hit line
const BEHIND = -1.4; // below the hit line (consumed tiles)
const PUMP_TOP = 150;
const PUMP_BOT = 356;

/** In-game glitch effect duration between the ruling → result-overlay transition */
const RESULT_FX_MS = 620;

/** core result('P1'|'P2'|'DRAW') → shell MatchResult */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): MatchResult {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

/** key value(0/1) → direction icon (left/right pump pad) */
function arrowFor(v: number): string {
  return v === 0 ? '◀' : '▶'; // ◀ / ▶
}

// ---------------------------------------------------------------------------
// Render-only effects (does not touch logic)
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'float'; side: PlayerRole; x: number; y: number; t: number; text: string; color: string }
  | { kind: 'ring'; side: PlayerRole; x: number; y: number; t: number }
  | { kind: 'chroma'; t: number };

interface RenderBundle {
  p1Scroll: number;
  p2Scroll: number;
  fx: readonly Fx[];
  scoreFx: Record<PlayerRole, number>;
  now: number;
  urgent: boolean;
  reduceMotion: boolean;
  p1IsYou: boolean;
  p2IsYou: boolean;
  /** player-bound color palette (not role) — drawScene/drawLane paint the P1/P2 entities with these colors. */
  col: Pal;
}

// ---------------------------------------------------------------------------
// Canvas renderer (pure drawing — state is read-only)
// ---------------------------------------------------------------------------
function drawScene(ctx: CanvasRenderingContext2D, s: Game3State, r: RenderBundle): void {
  const { now, urgent, reduceMotion, col: COL } = r;

  // --- field ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // faint vertical grid (purple) — pink tone when time is running out
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,42,109,0.10)' : 'rgba(211,0,197,0.07)';
  ctx.lineWidth = 1;
  for (let gx = 40; gx < CW; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, 96);
    ctx.lineTo(gx, 404);
    ctx.stroke();
  }
  ctx.restore();

  // --- center divider (purple neon) ---
  ctx.save();
  ctx.strokeStyle = COL.accent2;
  ctx.shadowColor = COL.accent2;
  ctx.shadowBlur = 10;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CW / 2, 92);
  ctx.lineTo(CW / 2, 408);
  ctx.stroke();
  // top VS tick
  ctx.globalAlpha = 0.9;
  ctx.shadowBlur = 6;
  ctx.fillStyle = COL.muted;
  ctx.font = `10px ${ARCADE}`;
  ctx.textAlign = 'center';
  ctx.fillText('VS', CW / 2, 88);
  ctx.restore();

  // --- final-seconds scan sweep (uses the only accent) ---
  if (urgent && !reduceMotion) {
    ctx.save();
    ctx.strokeStyle = 'rgba(253,245,0,0.12)';
    ctx.lineWidth = 1;
    const off = 34 - ((now / 9) % 34);
    for (let gy = 100 + off; gy < 404; gy += 34) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(CW, gy);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawLane(ctx, 'P1', s, r);
  drawLane(ctx, 'P2', s, r);

  // --- floating effects (+1 / -1) ---
  for (const f of r.fx) {
    if (f.kind !== 'float') continue;
    const age = now - f.t;
    if (age > 600) continue;
    const p = age / 600;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 10;
    ctx.font = `13px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y - p * 34);
    ctx.restore();
  }

  // --- 1-frame chromatic glitch at the win/loss moment (respects reduce-motion) ---
  if (!reduceMotion) {
    const chroma = r.fx.find((f) => f.kind === 'chroma');
    if (chroma && now - chroma.t < 90) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.28;
      ctx.drawImage(ctx.canvas, -4, 0, CW, CH);
      ctx.globalAlpha = 0.2;
      ctx.drawImage(ctx.canvas, 4, 0, CW, CH);
      ctx.restore();
    }
  }
}

/** Draw one lane (player) */
function drawLane(ctx: CanvasRenderingContext2D, side: PlayerRole, s: Game3State, r: RenderBundle): void {
  const isP1 = side === 'P1';
  const { now, reduceMotion, col: COL } = r; // local COL (player color-swapped version) — declared before use
  const laneX = isP1 ? P1_X : P2_X;
  const color = isP1 ? COL.p1 : COL.p2;
  const dim = isP1 ? COL.p1dim : COL.p2dim;
  const seq = isP1 ? s.p1Seq : s.p2Seq;
  const idx = isP1 ? s.p1Idx : s.p2Idx;
  const score = isP1 ? s.p1Score : s.p2Score;
  const flash = isP1 ? s.p1Flash : s.p2Flash;
  const wrong = isP1 ? s.p1Wrong : s.p2Wrong;
  const scroll = isP1 ? r.p1Scroll : r.p2Scroll;
  const scoreFxT = r.scoreFx[side];
  const isYou = isP1 ? r.p1IsYou : r.p2IsYou;

  // wrong-answer shake (on the lane tile group only)
  const shakeX =
    wrong > 0 && !reduceMotion ? (Math.random() * 2 - 1) * 4 * (wrong / G3.FLASH) : 0;

  // --- lane background panel (dim base + purple hairline) ---
  ctx.save();
  ctx.fillStyle = COL.deep;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(laneX - LANE_HALF, 100, LANE_HALF * 2, 300);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(211,0,197,0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(laneX - LANE_HALF, 100, LANE_HALF * 2, 300);
  ctx.restore();

  // --- PUMP progress gauge (outer) ---
  const pumpX = isP1 ? 44 : CW - 44 - 12;
  const ratio = Math.max(0, Math.min(1, idx / SEQ_LEN));
  ctx.save();
  ctx.fillStyle = COL.deep;
  ctx.fillRect(pumpX, PUMP_TOP, 12, PUMP_BOT - PUMP_TOP);
  ctx.strokeStyle = 'rgba(211,0,197,0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pumpX, PUMP_TOP, 12, PUMP_BOT - PUMP_TOP);
  const fillH = (PUMP_BOT - PUMP_TOP) * ratio;
  if (fillH > 0) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillRect(pumpX + 1, PUMP_BOT - fillH, 10, fillH);
  }
  ctx.restore();

  // --- note highway (tiles) ---
  const lo = Math.floor(scroll) - 2;
  const hi = Math.floor(scroll) + 6;
  // draw far tiles (large offset) first, near/consumed tiles later so they layer on top
  for (let j = hi; j >= lo; j--) {
    if (j < 0 || j >= SEQ_LEN) continue;
    const offset = j - scroll;
    if (offset > AHEAD || offset < BEHIND) continue;
    const isNow = j === idx;
    const y = HIT_Y - offset * SPACING;

    let scale: number;
    let alpha: number;
    if (offset >= 0) {
      scale = Math.max(0.44, 1 - offset * 0.12);
      alpha = Math.max(0.14, 1 - offset * 0.17);
    } else {
      const tt = -offset; // consumed tile grows toward the viewer and fades out
      scale = 1 + tt * 0.18;
      alpha = Math.max(0, 1 - tt * 1.5);
    }
    if (alpha <= 0.02) continue;

    // correct pop: the current (NOW) tile grows slightly at the hit moment
    const pop = isNow && flash > 0 ? 1 + (flash / G3.FLASH) * 0.14 : 1;
    const sz = TILE * scale * pop;
    const cx = laneX + (offset >= -0.2 ? shakeX : 0);
    const v = seq[j];

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, y);

    // tile body
    ctx.fillStyle = dim;
    ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
    if (isNow) {
      ctx.strokeStyle = wrong > 0 ? COL.error : color;
      ctx.shadowColor = wrong > 0 ? COL.error : color;
      ctx.shadowBlur = wrong > 0 ? 16 : 14;
      ctx.lineWidth = 2.5;
    } else {
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.lineWidth = 1.5;
    }
    ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);

    // direction icon — show a large ◀/▶ (left/right) instead of the Q/W/U/I letters
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = isNow ? (wrong > 0 ? COL.error : color) : color;
    ctx.shadowColor = isNow ? (wrong > 0 ? COL.error : color) : color;
    ctx.shadowBlur = isNow ? 12 : 0;
    ctx.font = `${Math.max(14, Math.round(32 * scale))}px ${ARCADE}`;
    ctx.fillText(arrowFor(v), 0, 0);
    ctx.restore();
  }

  // --- hit line (NOW frame) ---
  ctx.save();
  ctx.strokeStyle = flash > 0 ? COL.text : color;
  ctx.shadowColor = color;
  ctx.shadowBlur = flash > 0 ? 18 : 10;
  ctx.lineWidth = flash > 0 ? 3 : 2;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(laneX - LANE_HALF + 6, HIT_Y + TILE / 2 + 6);
  ctx.lineTo(laneX + LANE_HALF - 6, HIT_Y + TILE / 2 + 6);
  ctx.stroke();
  // left/right bracket ticks
  const bx = laneX - TILE / 2 - 8;
  const bx2 = laneX + TILE / 2 + 8;
  const by = HIT_Y + TILE / 2 + 6;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx, by - 12);
  ctx.moveTo(bx2, by);
  ctx.lineTo(bx2, by - 12);
  ctx.stroke();
  // NOW tag
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color;
  ctx.font = `10px ${ARCADE}`;
  ctx.textAlign = isP1 ? 'left' : 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('NOW', isP1 ? laneX - LANE_HALF + 4 : laneX + LANE_HALF - 4, HIT_Y + TILE / 2 + 26);
  ctx.restore();

  // string exhausted (emergency): no NOW → show MAX
  if (idx >= SEQ_LEN) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.font = `16px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MAX!', laneX, HIT_Y);
    ctx.restore();
  }

  // --- hit ring effect ---
  for (const f of r.fx) {
    if (f.kind !== 'ring' || f.side !== side) continue;
    const age = now - f.t;
    if (age > 260) continue;
    const p = age / 260;
    ctx.save();
    ctx.globalAlpha = (1 - p) * 0.9;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    const rs = TILE * (1 + p * 0.5);
    ctx.strokeRect(laneX - rs / 2, HIT_Y - rs / 2, rs, rs);
    ctx.restore();
  }

  // --- score jackpot counter (hard step + glow burst at the moment of change) ---
  const burst = scoreFxT > 0 && now - scoreFxT < 100;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // caption
  ctx.fillStyle = COL.muted;
  ctx.font = `10px ${ARCADE}`;
  ctx.fillText('SCORE', laneX, SCORE_Y - 30);
  // number
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = burst ? 22 : 12;
  const fs = burst ? 44 : 40;
  ctx.font = `${fs}px ${ARCADE}`;
  ctx.fillText(String(score), laneX, SCORE_Y + 8);
  // YOU on my side
  if (isYou && Math.floor(now / 500) % 2 === 0) {
    ctx.fillStyle = COL.accent;
    ctx.shadowColor = COL.accent;
    ctx.shadowBlur = 6;
    ctx.font = `10px ${ARCADE}`;
    ctx.fillText('YOU', laneX, SCORE_Y - 44);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Game3() {
  useDebugScreen('scr-game3');
  const flow = useFlow();
  const navigate = useNavigate();

  // Online render hook (performance standard) — 'select-subscribe' to active/role only so it re-renders
  // only at round boundaries, and mirror the server snapshot directly into stateRef (no re-render).
  // Per-snapshot HUD/debug updates are delegated to onSnapshot → removes the churn where a 60Hz snapshot
  // bled into 60Hz re-renders.
  // When isOnline, turn off local sim/bot/ruling and render only the server-authoritative state + send only my input to the server.
  const { isOnline, myRole, stateRef } = useOnlineRender<Game3State>(3, (s) => {
    setDebugGame(s); // debug bridge — updated every snapshot
    // HUD time remaining (based on server elapsed, quantized to seconds — no re-render for same-value snapshots)
    setHudMs(Math.ceil(Math.max(0, (GAME_DURATION - s.elapsed) * 1000) / 1000) * 1000);
  });
  // ref that lets the keyboard handler (registered once on mount) see the latest 'is online active' — prevents a stale closure.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  // Color is player-bound (independent of role) — keycap/YOU display uses my color. Select-subscribe so it
  // re-renders only when the color changes (no 60Hz snapshot churn). Offline / no color info defaults to 'blue'.
  const myColor = useSyncExternalStore(
    onlineStore.subscribe,
    () => onlineStore.get().myColor ?? 'blue',
    () => 'blue',
  ) as PlayerColor;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const eventsRef = useRef<GameInputEvent[]>([]);
  const p1ScrollRef = useRef(0);
  const p2ScrollRef = useRef(0);
  const fxRef = useRef<Fx[]>([]);
  const scoreFxRef = useRef<Record<PlayerRole, number>>({ P1: -1, P2: -1 });
  const endRef = useRef<EndTracker>(createEndTracker());
  const prevRef = useRef({ p1Score: 0, p2Score: 0, p1Idx: 0, p2Idx: 0 });
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const botNextRef = useRef(0);
  const reduceMotionRef = useRef(false);

  /** time remaining for HUD display (quantized to seconds — saves re-renders) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();
  const lampRef = useRef({ flashQ, flashW, flashU, flashI });
  lampRef.current = { flashQ, flashW, flashU, flashI };

  // direct-URL recovery
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 3) startOfflineGame(3);
  }, []);

  // reduced-motion snapshot
  useEffect(() => {
    reduceMotionRef.current =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
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

  // (Mirroring server state → stateRef/debug/HUD is handled by useOnlineRender + the onSnapshot callback above.
  //  It updates stateRef.current without a re-render, so no separate mirror effect is needed.)

  // Keyboard — collect the GameInputEvent queue + light lamps. Online P2 (u/i) is handled by the bot.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // ── Server online: U/I keys only (requirement). U=main key (slotA), I=secondary key (slotB). Q/W ignored ──
        if (isOnlineRef.current) {
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          if (e.type === 'down') {
            if (e.code === 'KeyU') lampRef.current.flashU();
            else lampRef.current.flashI();
          }
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t);
          return;
        }
        // ── Offline (unchanged) — if mock-online, P2 (u/i) is handled by the bot ──
        const f = getFlow();
        const mockOnline = f.mode === 'online';
        const isP2 = e.code === 'KeyU' || e.code === 'KeyI';
        if (mockOnline && isP2) return; // online (mock) P2 = bot
        if (e.type === 'down') {
          if (e.code === 'KeyQ') lampRef.current.flashQ();
          else if (e.code === 'KeyW') lampRef.current.flashW();
          else if (e.code === 'KeyU') lampRef.current.flashU();
          else if (e.code === 'KeyI') lampRef.current.flashI();
        }
        if (f.phase === 'playing') eventsRef.current.push(e);
      },
    );
    return () => {
      detach();
      setDebugGame(null);
    };
  }, []);

  // Round lifecycle: create state → rAF loop (step + draw) → report result
  useEffect(() => {
    // ── Server online: draw-only loop that renders only the server state, without step/bot/result-reporting ──
    if (isOnline) {
      // Before the first snapshot, draw a neutral initial state as a placeholder (onSnapshot overwrites it once a snapshot arrives).
      if (!stateRef.current) {
        const init = game3.create(Math.random);
        stateRef.current = init;
        setDebugGame(init);
      }
      let raf = 0;
      let last = performance.now();
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const s = stateRef.current;
        const ctx = canvasRef.current?.getContext('2d');
        if (!s || !ctx) return;
        const dt = Math.min(0.5, (now - last) / 1000);
        last = now;

        // scroll easing (pure render) — converge to server idx
        const ease = Math.min(1, dt * 18);
        p1ScrollRef.current += (s.p1Idx - p1ScrollRef.current) * ease;
        p2ScrollRef.current += (s.p2Idx - p2ScrollRef.current) * ease;

        // (HUD time remaining is updated per snapshot in onSnapshot — do not setState in the render loop.)
        fxRef.current = fxRef.current.filter((f) => now - f.t < 900);
        const displays = getPlayerDisplays(getFlow());
        drawScene(ctx, s, {
          p1Scroll: p1ScrollRef.current,
          p2Scroll: p2ScrollRef.current,
          fx: fxRef.current,
          scoreFx: scoreFxRef.current,
          now,
          urgent: Math.max(0, (GAME_DURATION - s.elapsed) * 1000) <= 5000 && s.result === null,
          reduceMotion: reduceMotionRef.current,
          p1IsYou: displays.P1.isYou,
          p2IsYou: displays.P2.isYou,
          col: palette(),
        });
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    if (flow.gameId !== 3 || flow.phase !== 'playing') return;

    const st = game3.create(Math.random);
    stateRef.current = st;
    eventsRef.current = [];
    fxRef.current = [];
    p1ScrollRef.current = 0;
    p2ScrollRef.current = 0;
    scoreFxRef.current = { P1: -1, P2: -1 };
    prevRef.current = { p1Score: 0, p2Score: 0, p1Idx: 0, p2Idx: 0 };
    reportedRef.current = false;
    resultAtRef.current = 0;
    botNextRef.current = 0;
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
      // Color is player-bound (not role) — the P1/P2 entity color palette for this frame. Offline = COL0 (existing behavior).
      const COL = palette();

      if (s.result === null) {
        const events = eventsRef.current;
        eventsRef.current = [];

        // Online bot (P2): taps the correct key at a human pace, with a small miss rate to leave room for a contest
        if (getFlow().mode === 'online' && s.p2Idx < SEQ_LEN && now >= botNextRef.current) {
          const correctV = s.p2Seq[s.p2Idx];
          const miss = Math.random() < 0.09;
          const pressV = miss ? (correctV === 0 ? 1 : 0) : correctV;
          const code = pressV === 0 ? 'KeyU' : 'KeyI';
          events.push({ code, type: 'down', t: now / 1000 });
          (pressV === 0 ? lampRef.current.flashU : lampRef.current.flashI)();
          botNextRef.current = now + 95 + Math.random() * 55;
        }

        const prev = prevRef.current;
        s = game3.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);

        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);

        // ---- Derive render-only effects (does not touch logic) ----
        // correct (idx increases) → hit ring + "+1"
        if (s.p1Idx > prev.p1Idx) {
          sfx('g3-hit-correct'); // moment of score +1 (correct hit)
          if (s.p1Idx >= SEQ_LEN && prev.p1Idx < SEQ_LEN) sfx('g3-sequence-clear'); // string completed (mid-game)
          fxRef.current.push(
            { kind: 'ring', side: 'P1', x: P1_X, y: HIT_Y, t: now },
            { kind: 'float', side: 'P1', x: P1_X, y: HIT_Y - 44, t: now, text: '+1', color: COL.p1 },
          );
        }
        if (s.p2Idx > prev.p2Idx) {
          sfx('g3-hit-correct'); // moment of score +1 (correct hit)
          if (s.p2Idx >= SEQ_LEN && prev.p2Idx < SEQ_LEN) sfx('g3-sequence-clear'); // string completed (mid-game)
          fxRef.current.push(
            { kind: 'ring', side: 'P2', x: P2_X, y: HIT_Y, t: now },
            { kind: 'float', side: 'P2', x: P2_X, y: HIT_Y - 44, t: now, text: '+1', color: COL.p2 },
          );
        }
        // wrong (score drops, idx held) → "-1"
        if (s.p1Score < prev.p1Score && s.p1Idx === prev.p1Idx) {
          sfx('g3-hit-wrong'); // moment of score -1 (wrong hit)
          fxRef.current.push({ kind: 'float', side: 'P1', x: P1_X, y: HIT_Y - 44, t: now, text: '-1', color: COL.error });
        }
        if (s.p2Score < prev.p2Score && s.p2Idx === prev.p2Idx) {
          sfx('g3-hit-wrong'); // moment of score -1 (wrong hit)
          fxRef.current.push({ kind: 'float', side: 'P2', x: P2_X, y: HIT_Y - 44, t: now, text: '-1', color: COL.error });
        }
        // glow-burst timestamp at the moment the score changes
        if (s.p1Score !== prev.p1Score) scoreFxRef.current.P1 = now;
        if (s.p2Score !== prev.p2Score) scoreFxRef.current.P2 = now;

        prevRef.current = {
          p1Score: s.p1Score,
          p2Score: s.p2Score,
          p1Idx: s.p1Idx,
          p2Idx: s.p2Idx,
        };

        // one glitch at the ruling moment
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          fxRef.current.push({ kind: 'chroma', t: now });
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        if (isOnline) return; // online: the server drives round:end — the screen does not report the result
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      // scroll easing (tile slide) — converge to idx
      const ease = Math.min(1, dt * 18);
      p1ScrollRef.current += (s.p1Idx - p1ScrollRef.current) * ease;
      p2ScrollRef.current += (s.p2Idx - p2ScrollRef.current) * ease;

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        fxRef.current = fxRef.current.filter((f) => now - f.t < 900);
        const displays = getPlayerDisplays(getFlow());
        drawScene(ctx, s, {
          p1Scroll: p1ScrollRef.current,
          p2Scroll: p2ScrollRef.current,
          fx: fxRef.current,
          scoreFx: scoreFxRef.current,
          now,
          urgent: Math.max(0, (GAME_DURATION - s.elapsed) * 1000) <= 5000 && s.result === null,
          reduceMotion: reduceMotionRef.current,
          p1IsYou: displays.P1.isYou,
          p2IsYou: displays.P2.isYou,
          col: COL,
        });
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
    <main data-testid="scr-game3" className="g3-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g3-topbar">
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
        <span className="g3-title font-arcade c-muted">Game 3 · Pump</span>
      </div>

      <div className="g3-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g3-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g3-canvas" aria-label="Game 3 stage — Pump" />

      </div>

      {/* On-screen keycaps — show the actual assigned keys (SPEC Q2), lamps light on input */}
      {isOnline ? (
        // Online: local player (U/I) only, in my color. U=left pad, I=right pad.
        <div className="g3-keys g3-keys--online">
          <div className="g3-keys__group">
            <span className={`g3-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myColor === 'blue' ? 'BLUE' : 'RED'} · PUMP
            </span>
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="U" icon="◀" lit={uLit} label="Left" />
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="I" icon="▶" lit={iLit} label="Right" />
          </div>
          <span className="g3-keys__hint font-arcade c-muted">HIT THE GLOWING PAD</span>
        </div>
      ) : (
        <div className="g3-keys">
          <div className="g3-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="◀" lit={qLit} label="Left" />
            <KeyCap role="P1" keyChar="W" icon="▶" lit={wLit} label="Right" />
            <span className="g3-keys__tag font-arcade c-p1">P1 · PUMP</span>
          </div>
          <span className="g3-keys__hint font-arcade c-muted">HIT THE GLOWING PAD</span>
          <div className="g3-keys__group">
            <span className="g3-keys__tag font-arcade c-p2">P2 · PUMP</span>
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