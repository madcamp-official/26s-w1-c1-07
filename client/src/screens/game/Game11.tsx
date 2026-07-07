/**
 * Game 11 · HOT POTATO (bomb pass) — NEON COIN-OP screen. Owner: game11 agent.
 * Container testid: scr-game11 / parts: game-stage (CRT bezel), hud-* (HudFrame built in), btn-exit
 *
 * ── Principles (follows the Game10.tsx standard exactly) ────────────────────────────
 *  · Logic/judging is driven 100% by the @madpump/shared game11 core (create/step).
 *  · The screen/rendering is a neon canvas scene newly written in this file.
 *  · Zero design-lab imports — colors/fonts are used only as constants copied from theme.css token values.
 *  · All text on this game screen is English (requirement).
 *
 * ── Core state (logic.ts summary) → screen derivation ───────────────────────────
 *  · holder(1|2): who currently holds the bomb (1=P1 left, 2=P2 right). On explosion the holder loses (no draw).
 *  · elapsed: fuse elapsed (seconds). ratio=elapsed/GAME_DURATION → bomb color lerps black→orange.
 *  · passAt: time of the last pass → over 0.2s the bomb flies from the previous→current holder (interpolation; a different tint when autoPass).
 *  · fake1/fake2: a feint where that player pokes the bomb slightly toward the opponent and pulls it back (holder does not change).
 *  · rule 5: when the time left (10-elapsed) is 3s (G11.HIDE_UNDER) or less, hide the countdown number and show "???".
 *  · result decided → makeExplosion/drawExplosion at the losing (bomb-holding) side's position + screen shake.
 *
 * ── Wiring (same pattern as Game10) ───────────────────────────────────────
 *  online → draw only the server snapshot (stateRef). offline → game11.create + step + report result.
 *  offline online-mock → the P2 bot presses U (PASS, occasionally an I fake) at random 0.3~1.2s intervals.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { game11, G11, GAME_DURATION } from '@madpump/shared';
import type { Game11State, GameInputEvent } from '@madpump/shared';
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
import {
  createEndTracker,
  drawEndFlash,
  drawExplosion,
  makeExplosion,
  shakeOffset,
  type EndTracker,
  type Particle,
} from '../../game/endFx';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import './game11.css';

// ---------------------------------------------------------------------------
// Canvas constants (logical resolution 960×540 = 16:9, responsive scaling via CSS · DPR handled separately).
// The core coordinates are only holder(1|2)/elapsed, so everything else is placed directly in canvas px.
// ---------------------------------------------------------------------------
const CW = 960;
const CH = 540;

const CENTER_X = 480;
const P1_X = 262; // P1 (left) stand x
const P2_X = 698; // P2 (right) stand x
const GROUND_Y = 410; // footplate line y
const BOMB_Y = 236; // bomb hover height (at rest)

const ARCADE = '"Press Start 2P", monospace';

/** Pass flight animation time (seconds) = same as the receive cooldown */
const PASS_DUR = 0.2;
/** Fake feint animation time (seconds) */
const FAKE_DUR = 0.26;
/** Max px the bomb pokes toward the opponent on a fake */
const FAKE_POKE = 60;
/** Float text (PASS!/FAKE) exposure time (seconds) */
const FLOAT_DUR = 0.5;

/** In-game explosion animation time between judging → result overlay transition */
const RESULT_FX_MS = 620;

/**
 * Copied from theme.css token values (the canvas can't read CSS variables, so hex constants). Copied straight from Game10's COL0.
 * p1=blue (cyan), p2=red (pink). drawScene swaps in the actual player color via functionColors().
 */
const COL0 = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  text: '#f4f0ff', // --text
  muted: '#9d8fbf', // --text-muted
  accent: '#fdf500', // --accent (coin yellow)
  accent2: '#d300c5', // --accent2 (neon purple)
  p1: '#05d9e8', // blue base color — cyan
  p1dim: '#0a3a4a', // blue dim
  p2: '#ff2a6d', // red base color — pink
  p2dim: '#4a0a26', // red dim
} as const;

/** Color palette type — also holds the swapped local COL */
type Palette = { [K in keyof typeof COL0]: string };

// Bomb fuse color: black → orange (a fixed signal color, independent of player color)
const BOMB_COLD = [26, 26, 26] as const; // #1a1a1a
const BOMB_HOT = [255, 123, 0] as const; // #ff7b00
const AUTO_TINT = '#fdf500'; // autoPass flight tint (coin yellow)
const SPARK = '#ffd23f';

interface WhoYou {
  p1IsYou: boolean;
  p2IsYou: boolean;
}

/** core result → shell MatchResult */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): 'P1_WIN' | 'P2_WIN' | 'DRAW' {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const holderX = (h: 1 | 2) => (h === 1 ? P1_X : P2_X);

/** bomb surface color rgb string for ratio(0..1) */
function bombColor(ratio: number): string {
  const r = Math.round(lerp(BOMB_COLD[0], BOMB_HOT[0], ratio));
  const g = Math.round(lerp(BOMB_COLD[1], BOMB_HOT[1], ratio));
  const b = Math.round(lerp(BOMB_COLD[2], BOMB_HOT[2], ratio));
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Render helpers (pure drawing — state is read-only)
// ---------------------------------------------------------------------------

/** Neon stick player + footplate. The holder raises arms toward the bomb with a glowing ring. */
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  side: 'P1' | 'P2',
  x: number,
  isHolder: boolean,
  isYou: boolean,
  now: number,
  reduce: boolean,
  col: Palette,
): void {
  const color = side === 'P1' ? col.p1 : col.p2;
  const feetY = GROUND_Y;
  const bob = isHolder && !reduce ? Math.sin(now / 70) * 2 : 0;
  const hipY = feetY - 34 + bob;
  const shoulderY = feetY - 64 + bob;
  const headY = feetY - 80 + bob;
  const armReach = isHolder ? -18 : -6; // the holder raises arms up (toward the bomb)

  // footplate (neon slab)
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = isHolder ? 14 : 7;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 34, feetY + 8);
  ctx.lineTo(x + 34, feetY + 8);
  ctx.stroke();
  ctx.restore();

  // holder danger ring
  if (isHolder) {
    const pulse = reduce ? 0.5 : (Math.sin(now / 120) + 1) / 2;
    ctx.save();
    ctx.globalAlpha = 0.3 + pulse * 0.4;
    ctx.strokeStyle = '#ff7b00';
    ctx.shadowColor = '#ff7b00';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, feetY + 8, 42, 12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2.6;
  // torso
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x, shoulderY);
  ctx.stroke();
  // arms (to both sides; the holder raises them to catch the bomb)
  ctx.beginPath();
  ctx.moveTo(x, shoulderY + 3);
  ctx.lineTo(x - 15, shoulderY + armReach);
  ctx.moveTo(x, shoulderY + 3);
  ctx.lineTo(x + 15, shoulderY + armReach);
  ctx.stroke();
  // legs
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x - 12, feetY);
  ctx.moveTo(x, hipY);
  ctx.lineTo(x + 12, feetY);
  ctx.stroke();
  // head
  ctx.beginPath();
  ctx.arc(x, headY, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // P1/P2 label
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `12px ${ARCADE}`;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.fillText(side, x, feetY + 34);
  ctx.restore();

  // YOU tag (my side, online) — steps blink
  if (isYou && Math.floor(now / 500) % 2 === 0) {
    ctx.save();
    ctx.font = `10px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = col.accent;
    ctx.shadowColor = col.accent;
    ctx.shadowBlur = 8;
    ctx.fillText('YOU', x, headY - 18);
    ctx.restore();
  }
}

/** Bomb body + fuse spark. When urgent, glow/tremble is emphasized. */
function drawBomb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ratio: number,
  urgent: boolean,
  now: number,
  reduce: boolean,
  tint: string | null,
): void {
  const surf = bombColor(ratio);
  const glow = urgent ? 14 + (reduce ? 0 : (Math.sin(now / 55) + 1) * 8) : 8;
  ctx.save();
  // glowing core (more orange glow toward the endgame)
  ctx.shadowColor = tint ?? '#ff7b00';
  ctx.shadowBlur = glow;
  ctx.fillStyle = surf;
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.fill();
  // outer ring (visibility)
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = tint ?? (urgent ? '#ff7b00' : '#43324f');
  ctx.stroke();
  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(x - 8, y - 9, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // fuse wick + spark
  const fuseX = x + 12;
  const fuseTopY = y - 30;
  ctx.save();
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 8, y - 20);
  ctx.quadraticCurveTo(fuseX + 6, y - 28, fuseX, fuseTopY);
  ctx.stroke();
  const spk = reduce ? 3 : 3 + Math.random() * 3;
  ctx.fillStyle = SPARK;
  ctx.shadowColor = SPARK;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(fuseX, fuseTopY, spk, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Float text (center-aligned, rises upward while fading) */
function drawFloat(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  t: number,
  color: string,
): void {
  const a = clamp01(1 - t);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.font = `16px ${ARCADE}`;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillText(text, x, y - t * 26);
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game11State,
  now: number,
  who: WhoYou,
  reduce: boolean,
): void {
  // Colors are player-dependent — swap in the actual player colors of the P1/P2 function entities.
  const fc = functionColors();
  const COL: Palette =
    fc.p1 === 'red'
      ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
      : COL0;

  const ratio = clamp01(s.elapsed / GAME_DURATION);
  const remaining = Math.max(0, GAME_DURATION - s.elapsed);
  const hidden = remaining <= G11.HIDE_UNDER; // rule 5: 3s or less remaining → hide the number
  const urgent = hidden && s.result === null;

  // --- background (filled with margin to spare for the shake translate) ---
  ctx.fillStyle = COL.field;
  ctx.fillRect(-40, -40, CW + 80, CH + 80);

  // "BOMB" watermark
  ctx.save();
  ctx.font = `bold 140px ${ARCADE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = urgent ? 'rgba(255,123,0,0.08)' : 'rgba(211,0,197,0.06)';
  ctx.strokeText('BOMB', CENTER_X, 250);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';

  // grid band
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,123,0,0.10)' : 'rgba(211,0,197,0.07)';
  ctx.lineWidth = 1;
  for (let gx = 96; gx <= CW - 96; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, 90);
    ctx.lineTo(gx, GROUND_Y + 20);
    ctx.stroke();
  }
  ctx.restore();

  // floor line
  ctx.save();
  ctx.strokeStyle = 'rgba(211,0,197,0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, GROUND_Y + 18);
  ctx.lineTo(CW - 40, GROUND_Y + 18);
  ctx.stroke();
  ctx.restore();

  // danger vignette (endgame)
  if (urgent) {
    const pulse = reduce ? 0.5 : (Math.sin(now / 90) + 1) / 2;
    ctx.save();
    ctx.globalAlpha = 0.1 + pulse * 0.14;
    const grad = ctx.createRadialGradient(CENTER_X, 260, 120, CENTER_X, 260, 560);
    grad.addColorStop(0, 'rgba(255,123,0,0)');
    grad.addColorStop(1, 'rgba(255,45,0,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, CH);
    ctx.restore();
  }

  // --- players (order doesn't matter for holder priority) ---
  drawPlayer(ctx, 'P1', P1_X, s.holder === 1, who.p1IsYou, now, reduce, COL);
  drawPlayer(ctx, 'P2', P2_X, s.holder === 2, who.p2IsYou, now, reduce, COL);

  // --- bomb position calculation ---
  // Pass flight: interpolate previous holder → current holder over 0.2s (parabolic); tint changes when autoPass.
  const sincePass = s.elapsed - s.passAt;
  const passing = s.passAt > 0 && sincePass >= 0 && sincePass < PASS_DUR && s.result === null;
  let bx: number;
  let by: number;
  let tint: string | null = null;
  if (passing) {
    const pt = clamp01(sincePass / PASS_DUR);
    const from = holderX(s.holder === 1 ? 2 : 1);
    bx = lerp(from, holderX(s.holder), pt);
    by = BOMB_Y - Math.sin(Math.PI * pt) * 74; // arc upward
    tint = s.autoPass ? AUTO_TINT : null;
  } else {
    // Fake feint: the current holder pokes slightly toward the opponent and returns (holder unchanged).
    const fakeT = s.holder === 1 ? s.fake1 : s.fake2;
    const sinceFake = s.elapsed - fakeT;
    const dir = s.holder === 1 ? 1 : -1; // opponent direction
    const fakeOff =
      fakeT > 0 && sinceFake >= 0 && sinceFake < FAKE_DUR
        ? Math.sin(Math.PI * (sinceFake / FAKE_DUR)) * FAKE_POKE * dir
        : 0;
    const tremble = urgent && !reduce ? (Math.random() - 0.5) * 4 : 0;
    bx = holderX(s.holder) + fakeOff;
    by = BOMB_Y + tremble;
  }

  // holder indicator arrow (above the bomb, pointing down)
  if (s.result === null) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `12px ${ARCADE}`;
    ctx.fillStyle = '#ff7b00';
    ctx.shadowColor = '#ff7b00';
    ctx.shadowBlur = 6;
    ctx.fillText('▼', holderX(s.holder), BOMB_Y - 40 + Math.sin(now / 160) * 3);
    ctx.restore();
  }

  drawBomb(ctx, bx, by, ratio, urgent, now, reduce, tint);

  // --- float text: PASS! / AUTO! / FAKE (state-derived — same online/offline) ---
  if (s.passAt > 0 && sincePass >= 0 && sincePass < FLOAT_DUR) {
    const label = s.autoPass ? 'AUTO!' : 'PASS!';
    drawFloat(
      ctx,
      label,
      holderX(s.holder),
      BOMB_Y - 60,
      sincePass / FLOAT_DUR,
      s.autoPass ? AUTO_TINT : COL.text,
    );
  }
  for (const side of [1, 2] as const) {
    const fk = side === 1 ? s.fake1 : s.fake2;
    const dt = s.elapsed - fk;
    if (fk > 0 && dt >= 0 && dt < FLOAT_DUR) {
      drawFloat(ctx, 'FAKE', holderX(side), BOMB_Y - 44, dt / FLOAT_DUR, COL.accent2);
    }
  }

  // --- countdown (rule 5) ---
  ctx.save();
  ctx.textAlign = 'center';
  if (hidden && s.result === null) {
    // 3s or less remaining → hide the number. "???" + warning.
    const flick = Math.floor(now / 100) % 2 === 0;
    ctx.font = `56px ${ARCADE}`;
    ctx.fillStyle = flick ? '#ff7b00' : '#ff2a6d';
    ctx.shadowColor = '#ff7b00';
    ctx.shadowBlur = 20;
    ctx.fillText('???', CENTER_X, 118);
    ctx.font = `14px ${ARCADE}`;
    ctx.fillStyle = COL.accent;
    ctx.shadowColor = COL.accent;
    ctx.shadowBlur = 10;
    ctx.fillText("DON'T HOLD IT!", CENTER_X, 150);
  } else if (s.result === null) {
    // more than 3s → show the remaining seconds large.
    ctx.font = `56px ${ARCADE}`;
    ctx.fillStyle = COL.text;
    ctx.shadowColor = COL.accent2;
    ctx.shadowBlur = 14;
    ctx.fillText(String(Math.ceil(remaining)), CENTER_X, 118);
    ctx.font = `10px ${ARCADE}`;
    ctx.fillStyle = COL.muted;
    ctx.shadowBlur = 0;
    ctx.fillText('FUSE', CENTER_X, 142);
  }
  ctx.restore();

  // --- result banner (win/loss moment) ---
  if (s.result) {
    const winColor =
      s.result === 'P1' ? COL.p1 : s.result === 'P2' ? COL.p2 : COL.accent2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `26px ${ARCADE}`;
    ctx.fillStyle = winColor;
    ctx.shadowColor = winColor;
    ctx.shadowBlur = 18;
    const banner = s.result === 'DRAW' ? 'DRAW' : `${s.result} WINS`;
    ctx.fillText(banner, CENTER_X, 96);
    ctx.font = `12px ${ARCADE}`;
    ctx.fillStyle = COL.accent;
    ctx.shadowColor = COL.accent;
    ctx.shadowBlur = 8;
    ctx.fillText('BOOM!', CENTER_X, 128);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Game11() {
  useDebugScreen('scr-game11');
  const flow = useFlow();
  const navigate = useNavigate();

  // Online render hook (performance standard). Selectively subscribes to active/role only → re-renders only at round boundaries.
  const { isOnline, myRole, stateRef } = useOnlineRender<Game11State>(11, (s) => {
    setDebugGame(s);
    const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remainingMs / 1000) * 1000);
  });
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const botRef = useRef<{ nextAt: number }>({ nextAt: 0 });
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  // End animation: track result transition → explosion
  const endRef = useRef<EndTracker>(createEndTracker());
  const explosionRef = useRef<{ spawned: boolean; particles: Particle[]; cx: number; cy: number }>({
    spawned: false,
    particles: [],
    cx: CENTER_X,
    cy: BOMB_Y,
  });

  /** Remaining time for the HUD display (quantized to seconds — saves re-renders) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);

  const [qLit, flashQ] = useKeyLamp(); // P1 PASS
  const [wLit, flashW] = useKeyLamp(); // P1 FAKE
  const [uLit, flashU] = useKeyLamp(); // P2 / online PASS
  const [iLit, flashI] = useKeyLamp(); // P2 / online FAKE
  const lampRef = useRef({ flashU, flashI });
  lampRef.current = { flashU, flashI };

  // direct-URL recovery + clean up the debug bridge on leave
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 11) startOfflineGame(11);
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

  // Keyboard — local adapter. Both down/up enqueue + light the lamp.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // True server online: only the two keys U/I. U=PASS(slotA), I=FAKE(slotB). Ignore Q/W.
        if (isOnlineRef.current) {
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          if (e.type === 'down') {
            if (e.code === 'KeyU') flashU();
            else flashI();
          }
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          return;
        }

        // --- offline (local 2-player / local online-mock bot) ---
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

    /** Shared frame render — includes explosion/shake. Used by both online and offline. */
    const paint = (ctx: CanvasRenderingContext2D, s: Game11State, now: number) => {
      // On a new round (result=null), reset the explosion state
      if (!s.result && explosionRef.current.spawned) explosionRef.current.spawned = false;

      const started = endRef.current.update(s.result, now);
      if (started && !explosionRef.current.spawned && s.result) {
        // The loser = the bomb holder. Explode at that position.
        const cx = holderX(s.holder);
        explosionRef.current = {
          spawned: true,
          particles: makeExplosion(cx, BOMB_Y, 26),
          cx,
          cy: BOMB_Y,
        };
      }
      const age = endRef.current.age(now);
      const shake = age !== null ? shakeOffset(age, reduce ? 0 : 9) : { x: 0, y: 0 };
      const disp = getPlayerDisplays(getFlow());

      ctx.save();
      ctx.translate(shake.x, shake.y);
      drawScene(ctx, s, now, { p1IsYou: disp.P1.isYou, p2IsYou: disp.P2.isYou }, reduce);
      if (explosionRef.current.spawned && age !== null) {
        drawExplosion(
          ctx,
          explosionRef.current.particles,
          explosionRef.current.cx,
          explosionRef.current.cy,
          age,
          '#ff7b00',
        );
      }
      ctx.restore();
      drawEndFlash(ctx, CW, CH, age);
    };

    // ── online: a draw-only loop that renders only the server state (no step/bot/result reporting) ──
    if (isOnline) {
      if (!stateRef.current) {
        stateRef.current = game11.create(Math.random);
        setDebugGame(stateRef.current);
      }
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const s = stateRef.current;
        const ctx = canvasRef.current?.getContext('2d');
        if (!s || !ctx) return;
        paint(ctx, s, now);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    // ── offline (local sim + bot + result reporting) ──
    if (flow.gameId !== 11 || flow.phase !== 'playing') return;

    const st = game11.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    botRef.current = { nextAt: 0 };
    reportedRef.current = false;
    resultAtRef.current = 0;
    explosionRef.current = { spawned: false, particles: [], cx: CENTER_X, cy: BOMB_Y };
    endRef.current.reset();
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (isRoundIntroActive()) {
        last = now;
        return;
      }
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        const events = actionsRef.current;
        actionsRef.current = [];

        // online-mock bot (P2): U (PASS) at random 0.3~1.2s intervals, occasionally I (FAKE).
        if (getFlow().mode === 'online' && now >= botRef.current.nextAt) {
          if (s.holder === 2) {
            const fake = Math.random() < 0.18;
            const code: 'KeyU' | 'KeyI' = fake ? 'KeyI' : 'KeyU';
            events.push({ code, type: 'down', t: now / 1000 });
            (fake ? lampRef.current.flashI : lampRef.current.flashU)();
          }
          botRef.current.nextAt = now + 300 + Math.random() * 900;
        }

        s = game11.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);
        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);

        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // Online has the server drive round:end — the screen doesn't report (only offline reaches here).
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) paint(ctx, s, now);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= G11.HIDE_UNDER * 1000;
  // My color (fixed for the match, independent of role) — keycap color.
  const myColor = isOnline ? (onlineStore.get().myColor ?? 'blue') : 'blue';

  return (
    <main data-testid="scr-game11" className="g11-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g11-topbar">
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
        <span className="g11-title font-arcade c-muted">GAME 11 · HOT POTATO</span>
      </div>

      <div className="g11-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
          hideTime={hudMs <= G11.HIDE_UNDER * 1000}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g11-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g11-canvas" aria-label="Game 11 stage — Hot Potato" />
      </div>

      {/* On-screen keycaps. Online shows only the two keys U/I (my color); offline shows both P1(Q/W)·P2(U/I). */}
      {isOnline ? (
        <div className="g11-keys g11-keys--online">
          <div className="g11-keys__group">
            <span
              className={`g11-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}
            >
              YOU
            </span>
            <KeyCap
              role={myColor === 'blue' ? 'P1' : 'P2'}
              keyChar="U"
              icon={myRole === 'P1' ? '▶' : '◀'}
              lit={uLit}
              label="PASS"
            />
            <KeyCap
              role={myColor === 'blue' ? 'P1' : 'P2'}
              keyChar="I"
              icon="≈"
              lit={iLit}
              label="FAKE"
            />
          </div>
          <span className="g11-keys__hint font-arcade c-muted">Pass before it blows!</span>
        </div>
      ) : (
        <div className="g11-keys">
          <div className="g11-keys__group">
            <span className="g11-keys__tag font-arcade c-p1">P1</span>
            <KeyCap role="P1" keyChar="Q" icon="▶" lit={qLit} label="PASS" />
            <KeyCap role="P1" keyChar="W" icon="≈" lit={wLit} label="FAKE" />
          </div>
          <span className="g11-keys__hint font-arcade c-muted">Pass before it blows!</span>
          <div className="g11-keys__group">
            <KeyCap role="P2" keyChar="U" icon="◀" lit={uLit} label="PASS" />
            <KeyCap role="P2" keyChar="I" icon="≈" lit={iLit} label="FAKE" />
            <span className="g11-keys__tag font-arcade c-p2">P2</span>
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}
