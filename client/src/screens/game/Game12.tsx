/**
 * Game12 · RED LIGHT, GREEN LIGHT (무궁화 꽃이 피었습니다) — NEON COIN-OP screen.
 * Container testid: scr-game12 / parts: game-stage (CRT bezel), hud-* (HudFrame), btn-exit
 *
 * ── Principles ─────────────────────────────────────────────────────────
 *  · All logic/adjudication is driven 100% by @madpump/shared game12 core (create/step).
 *  · Rendering is a fresh neon canvas scene authored here (no game-lab renderer).
 *  · Zero design-lab imports — colors/fonts are hex constants copied from theme.css.
 *  · This screen is FULLY ENGLISH (requirement): title, canvas text, KeyCaps, hints.
 *
 * ── Core state (logic file) → screen derivation ───────────────────────
 *  · pos1/pos2 ∈ [0,1]: runner position. 0 = start line (left), 1 = finish/tagger (right).
 *  · v1/v2: speed. Q/U mash → +MASH impulse, W/I → hard stop (v=0). Coasting decays.
 *  · reds[]: flat red-interval array. isRed()/isTelegraph(reds, elapsed) → tagger phase.
 *    green (back turned · safe) → turning (0.2s telegraph · warning) → red (facing · danger).
 *  · caught1/caught2: adjudicated by core when a runner moves during red → that runner loses.
 *  · result 'P1'|'P2'|'DRAW' → finish reached, caught, or timeout (closer pos wins).
 *
 * ── Wiring (same pattern as Game10) ───────────────────────────────────
 *  mount → if idle / other game, startOfflineGame(12) (direct-URL recovery)
 *  per round game12.create(Math.random) → rAF loop game12.step(state, events, dt secs)
 *  online → draw server snapshot only (no step / bot / reportRoundEnd)
 *  offline → local sim + optional P2 bot (flow.mode==='online') + reportRoundEnd once
 *  result confirmed → hold RESULT_FX_MS then reportRoundEnd(mapped) once → <ResultOverlay />
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { game12, G12, isRed, isTelegraph, GAME_DURATION } from '@madpump/shared';
import type { Game12State, GameInputEvent } from '@madpump/shared';
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
import './game12.css';

// ---------------------------------------------------------------------------
// Canvas constants (logical 960×540 = 16:9, responsive via CSS · DPR separate).
// Core coords are normalized pos ∈ [0,1]; everything else is placed in canvas px.
// ---------------------------------------------------------------------------
const CW = 960;
const CH = 540;

const START_X = 104; // pos = 0 (start line)
const FINISH_X = 800; // pos = 1 (finish line, tagger side)
const SPAN = FINISH_X - START_X;
const LANE1_Y = 214; // P1 lane center
const LANE2_Y = 372; // P2 lane center
const TAGGER_X = 884; // the "it"/doll figure anchor
const TAGGER_Y = (LANE1_Y + LANE2_Y) / 2;

const ARCADE = '"Press Start 2P", monospace';

/**
 * theme.css token values copied (canvas cannot read CSS vars).
 * p1/p2 are PLAYER colors (not roles): p1=blue(cyan), p2=red(pink). Swapped via functionColors().
 */
const COL0 = {
  field: '#1a0b2e',
  deep: '#160a33',
  text: '#f4f0ff',
  muted: '#9d8fbf',
  accent: '#fdf500', // coin yellow (used for TURNING warning)
  accent2: '#d300c5',
  green: '#39ff8f', // GREEN LIGHT (safe)
  red: '#ff2a4d', // RED LIGHT (danger)
  p1: '#05d9e8', // blue base — cyan
  p1dim: '#0a3a4a',
  p2: '#ff2a6d', // red base — pink
  p2dim: '#4a0a26',
} as const;

type Palette = { [K in keyof typeof COL0]: string };

/** delay between core result and the round-end handoff (in-game slam) */
const RESULT_FX_MS = 620;

type Phase = 'green' | 'turning' | 'red';

const xOf = (pos: number) => START_X + Math.max(0, Math.min(1, pos)) * SPAN;

function phaseOf(reds: number[], elapsed: number): Phase {
  if (isTelegraph(reds, elapsed)) return 'turning';
  if (isRed(reds, elapsed)) return 'red';
  return 'green';
}

/** core result → shell MatchResult */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): 'P1_WIN' | 'P2_WIN' | 'DRAW' {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

// ---------------------------------------------------------------------------
// Effects (render-only — never touch logic)
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'float'; text: string; x: number; y: number; color: string; t: number }
  | { kind: 'win'; winner: 'P1' | 'P2' | 'DRAW'; t: number };

interface WhoYou {
  p1IsYou: boolean;
  p2IsYou: boolean;
}

// ---------------------------------------------------------------------------
// Render helpers (pure drawing — state read only)
// ---------------------------------------------------------------------------

/** the doll / "it" that turns around. Drawn very differently per phase. */
function drawTagger(
  ctx: CanvasRenderingContext2D,
  phase: Phase,
  reduce: boolean,
  col: Palette,
): void {
  const cx = TAGGER_X;
  const cy = TAGGER_Y;
  const tint = phase === 'red' ? col.red : phase === 'turning' ? col.accent : col.green;

  ctx.save();
  // turning trembles (0.2s telegraph)
  if (phase === 'turning' && !reduce) {
    ctx.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
  }

  // dress (trapezoid body) — same silhouette in all phases
  ctx.save();
  ctx.fillStyle = phase === 'green' ? col.deep : tint;
  ctx.globalAlpha = phase === 'green' ? 0.9 : 0.28;
  ctx.strokeStyle = tint;
  ctx.lineWidth = 3;
  ctx.shadowColor = tint;
  ctx.shadowBlur = phase === 'red' ? 22 : 12;
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy - 6);
  ctx.lineTo(cx + 20, cy - 6);
  ctx.lineTo(cx + 40, cy + 92);
  ctx.lineTo(cx - 40, cy + 92);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.stroke();
  ctx.restore();

  // head
  const headY = cy - 40;
  ctx.save();
  ctx.strokeStyle = tint;
  ctx.shadowColor = tint;
  ctx.shadowBlur = phase === 'red' ? 24 : 12;
  ctx.lineWidth = 3;
  ctx.fillStyle = col.deep;
  ctx.beginPath();
  ctx.arc(cx, headY, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // pigtails / buns (both sides)
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + sgn * 34, headY + 4, 12, 0, Math.PI * 2);
    ctx.fillStyle = tint;
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
  ctx.restore();

  if (phase === 'green') {
    // BACK TURNED — hair covers the head (no face), safe posture.
    ctx.save();
    ctx.fillStyle = col.green;
    ctx.globalAlpha = 0.55;
    ctx.shadowColor = col.green;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, headY, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.font = `10px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = col.green;
    ctx.fillText('SAFE', cx, cy + 118);
    ctx.restore();
  } else if (phase === 'turning') {
    // TURNING — quarter profile + big "!" warning.
    ctx.save();
    ctx.fillStyle = col.accent;
    ctx.shadowColor = col.accent;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx - 8, headY, 5, 0, Math.PI * 2); // one eye appearing
    ctx.fill();
    ctx.font = `28px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.fillText('!', cx, headY - 42);
    ctx.restore();
  } else {
    // RED — FACING, two glowing eyes + brows.
    ctx.save();
    ctx.shadowColor = col.red;
    ctx.shadowBlur = 20;
    ctx.fillStyle = col.red;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + sgn * 11, headY - 2, 6.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // pupils (bright)
    ctx.fillStyle = col.text;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + sgn * 11, headY - 2, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // brows (angry)
    ctx.strokeStyle = col.red;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 18, headY - 12);
    ctx.lineTo(cx - 4, headY - 7);
    ctx.moveTo(cx + 18, headY - 12);
    ctx.lineTo(cx + 4, headY - 7);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** neon running character. Motion blur from v, caught → dragged toward tagger. */
function drawRunner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  v: number,
  caught: boolean,
  isYou: boolean,
  now: number,
  reduce: boolean,
  col: Palette,
): void {
  const speedN = Math.max(0, Math.min(1, v / G12.V_MAX));

  // motion-blur afterimages (behind, i.e. to the left)
  if (!reduce && speedN > 0.06 && !caught) {
    for (let g = 1; g <= 3; g++) {
      ctx.save();
      ctx.globalAlpha = 0.16 * speedN * (1 - g / 4);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillRect(x - g * 10 * speedN - 6, y - 22, 12, 40);
      ctx.restore();
    }
  }

  ctx.save();
  if (caught && !reduce) {
    // struggling shake while being eaten
    ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = caught ? 4 : 9;
  ctx.lineWidth = 3;

  const headY = y - 26;
  // head
  ctx.beginPath();
  ctx.arc(x, headY, 8, 0, Math.PI * 2);
  ctx.stroke();
  // torso (lean forward toward tagger)
  const lean = 4 + speedN * 5;
  ctx.beginPath();
  ctx.moveTo(x - lean * 0.4, y - 18);
  ctx.lineTo(x + lean, y + 6);
  ctx.stroke();
  // legs — swing faster with speed; freeze (spread stance) when stopped
  const cadence = caught ? 0 : 6 + speedN * 22;
  const swing = caught ? 0.7 : Math.sin(now / (200 - cadence * 6)) * (0.4 + speedN * 0.7);
  ctx.beginPath();
  ctx.moveTo(x + lean, y + 6);
  ctx.lineTo(x + lean + Math.sin(swing) * 14, y + 24);
  ctx.moveTo(x + lean, y + 6);
  ctx.lineTo(x + lean - Math.sin(swing) * 14, y + 24);
  ctx.stroke();
  // arms
  const arm = caught ? 1.1 : Math.cos(swing) * (0.5 + speedN);
  ctx.beginPath();
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x + 12, y - 12 - arm * 12);
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x - 10, y - 12 + arm * 10);
  ctx.stroke();
  ctx.restore();

  // YOU tag (blinking)
  if (isYou && Math.floor(now / 500) % 2 === 0) {
    ctx.save();
    ctx.font = `10px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = col.accent;
    ctx.shadowColor = col.accent;
    ctx.shadowBlur = 8;
    ctx.fillText('YOU', x, headY - 16);
    ctx.restore();
  }
}

function drawLane(
  ctx: CanvasRenderingContext2D,
  y: number,
  color: string,
  dim: string,
  label: string,
): void {
  ctx.save();
  ctx.fillStyle = dim;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(START_X - 20, y - 40, SPAN + 60, 80);
  ctx.restore();
  // lane border
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.strokeRect(START_X - 20, y - 40, SPAN + 60, 80);
  ctx.restore();
  // dashed center guide
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.18;
  ctx.setLineDash([6, 10]);
  ctx.beginPath();
  ctx.moveTo(START_X, y);
  ctx.lineTo(FINISH_X, y);
  ctx.stroke();
  ctx.restore();
  // label
  ctx.save();
  ctx.font = `10px ${ARCADE}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  ctx.fillText(label, START_X - 16, y - 26);
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game12State,
  fx: readonly Fx[],
  now: number,
  who: WhoYou,
  resultAt: number,
  reduce: boolean,
): void {
  // player-dependent colors: swap p1/p2 if this client's P1 entity is red.
  const fc = functionColors();
  const COL: Palette =
    fc.p1 === 'red'
      ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
      : COL0;

  const phase = phaseOf(s.reds, s.elapsed);
  const winFx = fx.find((f): f is Extract<Fx, { kind: 'win' }> => f.kind === 'win');
  const winAge = winFx ? now - winFx.t : Infinity;

  // --- background ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // giant watermark
  ctx.save();
  ctx.font = `bold 120px ${ARCADE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(211,0,197,0.05)';
  ctx.strokeText('RUN', CW / 2 - 40, CH / 2);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';

  // --- lanes ---
  drawLane(ctx, LANE1_Y, COL.p1, COL.p1dim, 'P1');
  drawLane(ctx, LANE2_Y, COL.p2, COL.p2dim, 'P2');

  // --- start line ---
  ctx.save();
  ctx.strokeStyle = COL.text;
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(START_X, LANE1_Y - 60);
  ctx.lineTo(START_X, LANE2_Y + 60);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.font = `10px ${ARCADE}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = COL.muted;
  ctx.fillText('START', START_X, LANE1_Y - 72);
  ctx.restore();

  // --- finish line (hot in green = safe to reach) ---
  ctx.save();
  const finishHot = phase === 'green';
  ctx.strokeStyle = finishHot ? COL.green : COL.muted;
  ctx.shadowColor = finishHot ? COL.green : 'transparent';
  ctx.shadowBlur = finishHot ? 14 : 0;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(FINISH_X, LANE1_Y - 60);
  ctx.lineTo(FINISH_X, LANE2_Y + 60);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.font = `10px ${ARCADE}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = finishHot ? COL.green : COL.muted;
  ctx.fillText('FINISH', FINISH_X, LANE1_Y - 72);
  ctx.restore();

  // --- tagger / doll ---
  drawTagger(ctx, phase, reduce, COL);

  // --- runners (with caught drag toward tagger) ---
  const dragAge = resultAt > 0 ? Math.min(1, (now - resultAt) / 520) : 0;
  const p1x = s.caught1 ? xOf(s.pos1) + (TAGGER_X - xOf(s.pos1)) * dragAge * 0.9 : xOf(s.pos1);
  const p2x = s.caught2 ? xOf(s.pos2) + (TAGGER_X - xOf(s.pos2)) * dragAge * 0.9 : xOf(s.pos2);
  const p1y = s.caught1 ? LANE1_Y + (TAGGER_Y - LANE1_Y) * dragAge * 0.9 : LANE1_Y;
  const p2y = s.caught2 ? LANE2_Y + (TAGGER_Y - LANE2_Y) * dragAge * 0.9 : LANE2_Y;
  drawRunner(ctx, p1x, p1y, COL.p1, s.v1, s.caught1, who.p1IsYou, now, reduce, COL);
  drawRunner(ctx, p2x, p2y, COL.p2, s.v2, s.caught2, who.p2IsYou, now, reduce, COL);

  // --- RED overlay (danger vignette, pulsing) ---
  if (phase === 'red' && s.result === null) {
    const pulse = reduce ? 0.16 : 0.12 + (Math.sin(now / 110) + 1) * 0.05;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = COL.red;
    ctx.fillRect(0, 0, CW, CH);
    ctx.restore();
    // frame border blink
    ctx.save();
    ctx.strokeStyle = COL.red;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, CW - 8, CH - 8);
    ctx.restore();
  }

  // --- big top signal ---
  ctx.save();
  ctx.textAlign = 'center';
  if (phase === 'red') {
    const blink = Math.floor(now / 130) % 2 === 0;
    if (blink) {
      ctx.font = `30px ${ARCADE}`;
      ctx.fillStyle = COL.red;
      ctx.shadowColor = COL.red;
      ctx.shadowBlur = 20;
      ctx.fillText('RED LIGHT!', CW / 2, 62);
    }
  } else if (phase === 'turning') {
    ctx.font = `30px ${ARCADE}`;
    ctx.fillStyle = COL.accent;
    ctx.shadowColor = COL.accent;
    ctx.shadowBlur = 16;
    ctx.fillText('. . .', CW / 2, 62);
  } else {
    ctx.font = `26px ${ARCADE}`;
    ctx.fillStyle = COL.green;
    ctx.shadowColor = COL.green;
    ctx.shadowBlur = 14;
    ctx.fillText('GREEN LIGHT', CW / 2, 60);
  }
  ctx.restore();

  // --- floating callouts (GO! / FREEZE! / CAUGHT!) ---
  for (const f of fx) {
    if (f.kind !== 'float') continue;
    const age = now - f.t;
    if (age > 780) continue;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age / 780);
    ctx.font = `20px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 12;
    ctx.fillText(f.text, f.x, f.y - age * 0.03);
    ctx.restore();
  }

  // --- win slam overlay ---
  if (winFx && winAge < RESULT_FX_MS + 300) {
    const color =
      winFx.winner === 'P1' ? COL.p1 : winFx.winner === 'P2' ? COL.p2 : COL.accent2;
    const a = Math.max(0, 1 - winAge / (RESULT_FX_MS + 300));
    ctx.save();
    ctx.globalAlpha = 0.2 * a;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, CW, CH);
    ctx.restore();
    if (Math.floor(winAge / 120) % 2 === 0 || winAge > 360) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `24px ${ARCADE}`;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillText(
        winFx.winner === 'DRAW' ? 'DRAW' : `${winFx.winner} WINS`,
        CW / 2,
        CH / 2,
      );
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Game12() {
  useDebugScreen('scr-game12');
  const flow = useFlow();
  const navigate = useNavigate();

  const { isOnline, myRole, stateRef } = useOnlineRender<Game12State>(12, (s) => {
    setDebugGame(s);
    const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remainingMs / 1000) * 1000);
  });
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const botRef = useRef<{ nextAt: number; reactAt: number; stopped: boolean }>({
    nextAt: 0,
    reactAt: 0,
    stopped: false,
  });
  const fxRef = useRef<Fx[]>([]);
  const phaseRef = useRef<{ phase: Phase; caught1: boolean; caught2: boolean; resulted: boolean }>(
    { phase: 'green', caught1: false, caught2: false, resulted: false },
  );
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const endRef = useRef<EndTracker>(createEndTracker());

  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();
  const lampRef = useRef({ flashU, flashI });
  lampRef.current = { flashU, flashI };

  // Emit render-only floats/win fx from phase & caught transitions (used by both loops).
  const emitFx = (s: Game12State, now: number) => {
    const ph = phaseOf(s.reds, s.elapsed);
    const prev = phaseRef.current;
    if (ph !== prev.phase) {
      if (ph === 'green') {
        fxRef.current.push({ kind: 'float', text: 'GO!', x: CW / 2, y: 130, color: COL0.green, t: now });
      } else if (ph === 'red') {
        fxRef.current.push({ kind: 'float', text: 'FREEZE!', x: CW / 2, y: 130, color: COL0.red, t: now });
      }
    }
    if (s.caught1 && !prev.caught1) {
      fxRef.current.push({ kind: 'float', text: 'CAUGHT!', x: xOf(s.pos1), y: LANE1_Y - 44, color: COL0.red, t: now });
    }
    if (s.caught2 && !prev.caught2) {
      fxRef.current.push({ kind: 'float', text: 'CAUGHT!', x: xOf(s.pos2), y: LANE2_Y - 44, color: COL0.red, t: now });
    }
    if (s.result !== null && !prev.resulted) {
      fxRef.current.push({ kind: 'win', winner: s.result, t: now });
      resultAtRef.current = now;
    }
    phaseRef.current = {
      phase: ph,
      caught1: s.caught1,
      caught2: s.caught2,
      resulted: s.result !== null,
    };
  };

  // direct-URL recovery + debug bridge cleanup
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 12) startOfflineGame(12);
    return () => setDebugGame(null);
  }, []);

  // canvas resolution (DPR scale)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // keyboard — local adapter. Online: only U/I → my slot. Offline: P1 Q/W, P2 U/I.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        if (isOnlineRef.current) {
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return; // U/I only online
          if (e.type === 'down') {
            if (e.code === 'KeyU') flashU();
            else flashI();
          }
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B'; // U=RUN(slotA), I=STOP(slotB)
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          return;
        }

        // --- offline (local 2P / local online-mock bot) ---
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
        if (f.phase === 'playing') actionsRef.current.push(e); // push both down & up
      },
    );
    return detach;
  }, [flashQ, flashW, flashU, flashI]);

  // round lifecycle: create state → rAF loop (step + draw) → report result
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // ── online: draw server snapshot only (no step / bot / report) ──
    if (isOnline) {
      if (!stateRef.current) {
        stateRef.current = game12.create(Math.random);
        setDebugGame(stateRef.current);
      }
      phaseRef.current = { phase: 'green', caught1: false, caught2: false, resulted: false };
      resultAtRef.current = 0;
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const s = stateRef.current;
        const ctx = canvasRef.current?.getContext('2d');
        if (!s || !ctx) return;
        emitFx(s, now);
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
        const disp = getPlayerDisplays(getFlow());
        drawScene(
          ctx,
          s,
          fxRef.current,
          now,
          { p1IsYou: disp.P1.isYou, p2IsYou: disp.P2.isYou },
          resultAtRef.current,
          reduce,
        );
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    // ── offline (local sim + bot + result report) ──
    if (flow.gameId !== 12 || flow.phase !== 'playing') return;

    const st = game12.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    botRef.current = { nextAt: 0, reactAt: 0, stopped: false };
    fxRef.current = [];
    phaseRef.current = { phase: 'green', caught1: false, caught2: false, resulted: false };
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

        // online mock bot (P2): RUN (U) on green, STOP (I) on the telegraph+red danger window
        // (freeze on 'turning' too — a human brakes on the warning, not after red already hit;
        //  keep an occasional late reaction so P1 still lands some catch-wins). — 리뷰 #2
        if (getFlow().mode === 'online') {
          const ph = phaseOf(s.reds, s.elapsed);
          const bot = botRef.current;
          if (ph === 'red' || ph === 'turning') {
            if (!bot.stopped) {
              if (bot.reactAt === 0) {
                // usually stops instantly; sometimes a beat late (gets caught)
                bot.reactAt = now + (Math.random() < 0.22 ? 90 + Math.random() * 180 : 0);
              }
              if (now >= bot.reactAt) {
                events.push({ code: 'KeyI', type: 'down', t: now / 1000 });
                lampRef.current.flashI();
                bot.stopped = true;
              }
            }
          } else {
            bot.stopped = false;
            bot.reactAt = 0;
            if (now >= bot.nextAt) {
              events.push({ code: 'KeyU', type: 'down', t: now / 1000 });
              lampRef.current.flashU();
              bot.nextAt = now + 110 + Math.random() * 80;
            }
          }
        }

        s = game12.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);
        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);
        emitFx(s, now);
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        if (isOnline) return; // server drives round:end online
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
          now,
          { p1IsYou: disp.P1.isYou, p2IsYou: disp.P2.isYou },
          resultAtRef.current,
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
  const myColor = isOnline ? (onlineStore.get().myColor ?? 'blue') : 'blue';

  return (
    <main data-testid="scr-game12" className="g12-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g12-topbar">
        <Button
          variant="tertiary"
          data-testid="btn-exit"
          onClick={() => {
            exitMatch();
            navigate('/');
          }}
        >
          ◀ EXIT
        </Button>
        <span className="g12-title font-arcade c-muted">GAME 12 · RED LIGHT, GREEN LIGHT</span>
      </div>

      <div className="g12-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g12-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g12-canvas" aria-label="Game 12 stage — Red Light, Green Light" />
      </div>

      {/* On-screen keycaps. Online: only my U(RUN)/I(STOP). Offline: both P1(Q/W) and P2(U/I). */}
      {isOnline ? (
        <div className="g12-keys g12-keys--online">
          <div className="g12-keys__group">
            <span className={`g12-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myColor === 'blue' ? 'BLUE' : 'RED'}
            </span>
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="U" icon="▶" lit={uLit} label="RUN" />
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="I" icon="■" lit={iLit} label="STOP" />
          </div>
          <span className="g12-keys__hint font-arcade c-muted">Mash RUN · Freeze on RED!</span>
        </div>
      ) : (
        <div className="g12-keys">
          <div className="g12-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="▶" lit={qLit} label="RUN" />
            <KeyCap role="P1" keyChar="W" icon="■" lit={wLit} label="STOP" />
            <span className="g12-keys__tag font-arcade c-p1">P1</span>
          </div>
          <span className="g12-keys__hint font-arcade c-muted">Freeze on RED!</span>
          <div className="g12-keys__group">
            <span className="g12-keys__tag font-arcade c-p2">P2</span>
            <KeyCap role="P2" keyChar="U" icon="▶" lit={uLit} label="RUN" />
            <KeyCap role="P2" keyChar="I" icon="■" lit={iLit} label="STOP" />
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}
