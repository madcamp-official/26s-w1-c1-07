/**
 * GAME 13 · POT SHOT (burst the pot) — NEON COIN-OP screen. Owner: game13 agent.
 * Container testid: scr-game13 / parts: game-stage (CRT bezel), hud-* (HudFrame), btn-exit
 *
 * ── Principles ──────────────────────────────────────────────────────
 *  · All logic/judging driven 100% by @madcade/shared game13 core (create/step).
 *  · Screen/rendering authored from scratch here as a neon canvas scene.
 *  · design-lab import 0 — colors/fonts are hex constants copied from theme tokens.
 *
 * ── Core state → screen ─────────────────────────────────────────────
 *  · Center pot bobs up/down at potY (circle r=POT_R + gourd decoration/stripes).
 *  · P1 bottom-left (120,476), P2 bottom-right (840,476) cannons; barrels rotate to angle.
 *  · Q/U (aim) hold → angle sweeps 0↔90°, barrel follows live; release locks it.
 *  · W/I (power) hold → charge gauge fills 0..MAX; during reload (cd>0) gauge = "RELOAD".
 *  · Shots fly parabolic (glowing sphere + trail); pot hit = small explosion + score flash.
 *  · score1/score2 shown big in player colors; most hits at time-up wins (tie = DRAW).
 *
 * ── Wiring (same pattern as Game10) ─────────────────────────────────
 *  mount → idle or other game ⇒ startOfflineGame(13) (direct-URL recovery)
 *  each round game13.create(Math.random) → rAF loop game13.step(state, events, dtSec)
 *  online mode → P2 is a bot (aim to potY, hold I 0.5~0.9s, release to fire)
 *  result set → in-game slam (RESULT_FX_MS) then reportRoundEnd(map) once → <ResultOverlay />
 *  ★ ALL on-screen text is ENGLISH (requirement).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { game13, G13, GAME_DURATION } from '@madcade/shared';
import type { Game13State, GameInputEvent } from '@madcade/shared';
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
import { createEndTracker, drawEndFlash, makeExplosion, drawExplosion, type EndTracker, type Particle } from '../../game/endFx';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import './game13.css';

// ---------------------------------------------------------------------------
// Canvas logical resolution 960×540 (16:9). CSS scales responsively; DPR separate.
// ---------------------------------------------------------------------------
const CW = 960;
const CH = 540;
const FLOOR_Y = 500;
const ARCADE = '"Press Start 2P", monospace';

/**
 * theme.css token values copied (canvas can't read CSS vars → hex constants).
 * p1/p2 are *player color* references: p1=blue(cyan), p2=red(pink).
 * drawScene swaps them via functionColors() so functional entities wear the real player color.
 */
const COL0 = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  text: '#f4f0ff', // --text
  muted: '#9d8fbf', // --text-muted
  accent: '#fdf500', // --accent (coin yellow)
  accent2: '#d300c5', // --accent2 (neon purple)
  p1: '#05d9e8', // blue reference — cyan
  p1dim: '#0a3a4a',
  p2: '#ff2a6d', // red reference — pink
  p2dim: '#4a0a26',
  pot: '#57e08a', // gourd green
  potDark: '#2a7d4d',
  stem: '#b58a4a',
} as const;

type Palette = { [K in keyof typeof COL0]: string };

/** in-game slam window between judge and result overlay */
const RESULT_FX_MS = 620;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** core result → shell MatchResult */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): 'P1_WIN' | 'P2_WIN' | 'DRAW' {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

// ---------------------------------------------------------------------------
// Render-only FX (never touches logic)
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'hit'; owner: 1 | 2; x: number; y: number; parts: Particle[]; t: number }
  | { kind: 'win'; winner: 'P1' | 'P2' | 'DRAW'; t: number };

interface WhoYou {
  p1IsYou: boolean;
  p2IsYou: boolean;
}

// ---------------------------------------------------------------------------
// Render helpers (pure drawing — state read-only)
// ---------------------------------------------------------------------------

/** Center pot (gourd): big lower bulb + small top bulb + vertical stripes + stem. */
function drawPot(ctx: CanvasRenderingContext2D, potY: number, now: number, col: Palette): void {
  const x = G13.POT_X;
  const R = G13.POT_R;
  const wob = Math.sin(now / 220) * 1.5;
  ctx.save();
  ctx.translate(x, potY);
  // stem
  ctx.strokeStyle = col.stem;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -R - 20);
  ctx.quadraticCurveTo(6, -R - 30, 12, -R - 26);
  ctx.stroke();
  // body glow
  ctx.shadowColor = col.pot;
  ctx.shadowBlur = 18;
  // lower bulb
  ctx.fillStyle = col.pot;
  ctx.beginPath();
  ctx.arc(0, wob, R, 0, Math.PI * 2);
  ctx.fill();
  // upper (smaller) bulb → gourd silhouette
  ctx.beginPath();
  ctx.arc(0, -R + 4 + wob, R * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // vertical stripes (clip to lower bulb)
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, wob, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = col.potDark;
  ctx.lineWidth = 3;
  for (let sx = -R; sx <= R; sx += 12) {
    ctx.beginPath();
    ctx.moveTo(sx, -R + wob);
    ctx.lineTo(sx, R + wob);
    ctx.stroke();
  }
  ctx.restore();
  // rim highlight
  ctx.strokeStyle = 'rgba(244,240,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, wob, R, Math.PI * 1.15, Math.PI * 1.75);
  ctx.stroke();
  ctx.restore();
}

/** A cannon: base mound + barrel rotated to `angleDeg`, plus aim ray + angle text. */
function drawCannon(
  ctx: CanvasRenderingContext2D,
  owner: 1 | 2,
  angleDeg: number,
  aiming: boolean,
  charging: boolean,
  isYou: boolean,
  now: number,
  col: Palette,
): void {
  const isP1 = owner === 1;
  const color = isP1 ? col.p1 : col.p2;
  const px = isP1 ? G13.P1X : G13.P2X;
  const py = G13.CANNON_Y;
  const a = angleDeg * (Math.PI / 180);
  const dx = (isP1 ? 1 : -1) * Math.cos(a);
  const dy = -Math.sin(a);
  const L = 46;
  const tipX = px + dx * L;
  const tipY = py + dy * L;

  ctx.save();
  // base mound (wheel)
  ctx.fillStyle = isP1 ? col.p1dim : col.p2dim;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, 16, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // barrel
  ctx.lineCap = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = color;
  ctx.shadowBlur = charging ? 16 : 10;
  ctx.beginPath();
  ctx.moveTo(px, py - 4);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  // muzzle
  ctx.fillStyle = col.text;
  ctx.shadowBlur = charging ? 18 : 10;
  ctx.beginPath();
  ctx.arc(tipX, tipY, 4.5, 0, Math.PI * 2);
  ctx.fill();
  // aim ray (dashed) — brighter while aiming
  ctx.shadowBlur = 0;
  ctx.globalAlpha = aiming ? 0.5 : 0.2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX + dx * 70, tipY + dy * 70);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.restore();

  // angle text (0°=horizontal, 90°=vertical)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `12px ${ARCADE}`;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.fillText(`${Math.round(angleDeg)}°`, px, py + 34);
  ctx.restore();

  // YOU tag (online / local's cannon) — blink
  if (isYou && Math.floor(now / 500) % 2 === 0) {
    ctx.save();
    ctx.font = `10px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = col.accent;
    ctx.shadowColor = col.accent;
    ctx.shadowBlur = 8;
    ctx.fillText('YOU', px, py + 50);
    ctx.restore();
  }
}

/** Vertical power gauge on the outer side of a cannon. cd>0 → gray "RELOAD". */
function drawGauge(
  ctx: CanvasRenderingContext2D,
  owner: 1 | 2,
  power: number,
  cd: number,
  charging: boolean,
  col: Palette,
): void {
  const isP1 = owner === 1;
  const color = isP1 ? col.p1 : col.p2;
  const gx = isP1 ? 60 : CW - 60 - 14;
  const gy = G13.CANNON_Y - 96;
  const gw = 14;
  const gh = 96;
  const reloading = cd > 0;
  ctx.save();
  // frame
  ctx.strokeStyle = reloading ? col.muted : color;
  ctx.lineWidth = 2;
  ctx.strokeRect(gx, gy, gw, gh);
  // fill
  if (reloading) {
    // reload progress fills back up as cd drains
    const f = 1 - clamp(cd / G13.RELOAD, 0, 1);
    ctx.fillStyle = 'rgba(157,143,191,0.55)';
    ctx.fillRect(gx + 2, gy + gh - f * (gh - 4), gw - 4, f * (gh - 4));
  } else {
    const f = clamp(power / G13.MAX_POWER, 0, 1);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = charging ? 12 : 6;
    ctx.fillRect(gx + 2, gy + gh - f * (gh - 4), gw - 4, f * (gh - 4));
  }
  ctx.shadowBlur = 0;
  // label
  ctx.font = `10px ${ARCADE}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = reloading ? col.muted : color;
  ctx.fillText(reloading ? 'RELOAD' : 'PWR', gx + gw / 2, gy - 8);
  ctx.restore();
}

/** Projectile: glowing core + short motion trail along velocity. */
function drawShot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  vy: number,
  owner: 1 | 2,
  col: Palette,
): void {
  const color = owner === 1 ? col.p1 : col.p2;
  const sp = Math.hypot(vx, vy) || 1;
  const ux = vx / sp;
  const uy = vy / sp;
  ctx.save();
  // trail
  for (let i = 1; i <= 4; i++) {
    ctx.globalAlpha = 0.16 * (4 - i + 1);
    ctx.fillStyle = color;
    const tx = x - ux * i * 6;
    const ty = y - uy * i * 6;
    ctx.beginPath();
    ctx.arc(tx, ty, G13.PROJ_R - i * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // core
  ctx.fillStyle = col.text;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(x, y, G13.PROJ_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game13State,
  fx: readonly Fx[],
  now: number,
  who: WhoYou,
  reduce: boolean,
): void {
  // player-dependent colors: swap p1/p2 if the P1 functional entity is red.
  const fc = functionColors();
  const COL: Palette =
    fc.p1 === 'red'
      ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
      : COL0;
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const winFx = fx.find((f): f is Extract<Fx, { kind: 'win' }> => f.kind === 'win');
  const winAge = winFx ? now - winFx.t : Infinity;

  // --- background ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // giant watermark "POT" (very faint)
  ctx.save();
  ctx.font = `bold 150px ${ARCADE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(211,0,197,0.06)';
  ctx.strokeText('POT', CW / 2, 240);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';

  // grid
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,42,109,0.10)' : 'rgba(211,0,197,0.08)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= CW; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, FLOOR_Y);
    ctx.stroke();
  }
  for (let gy = 40; gy < FLOOR_Y; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(CW, gy);
    ctx.stroke();
  }
  ctx.restore();

  // pot travel guide (dashed vertical band)
  ctx.save();
  ctx.strokeStyle = 'rgba(87,224,138,0.22)';
  ctx.setLineDash([4, 8]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(G13.POT_X, G13.POT_BASE_Y - G13.POT_AMP - 10);
  ctx.lineTo(G13.POT_X, G13.POT_BASE_Y + G13.POT_AMP + 10);
  ctx.stroke();
  ctx.restore();

  // floor line
  ctx.save();
  ctx.strokeStyle = 'rgba(211,0,197,0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, FLOOR_Y);
  ctx.lineTo(CW - 30, FLOOR_Y);
  ctx.stroke();
  ctx.restore();

  // --- pot ---
  drawPot(ctx, s.potY, now, COL);

  // --- shots ---
  for (const sh of s.shots) drawShot(ctx, sh.x, sh.y, sh.vx, sh.vy, sh.owner, COL);

  // --- cannons + gauges ---
  drawCannon(ctx, 1, s.angle1, s.aiming1, s.charging1, who.p1IsYou, now, COL);
  drawCannon(ctx, 2, s.angle2, s.aiming2, s.charging2, who.p2IsYou, now, COL);
  drawGauge(ctx, 1, s.power1, s.cd1, s.charging1, COL);
  drawGauge(ctx, 2, s.power2, s.cd2, s.charging2, COL);

  // --- hit explosions + "HIT!" floats ---
  for (const f of fx) {
    if (f.kind !== 'hit') continue;
    const age = now - f.t;
    const color = f.owner === 1 ? COL.p1 : COL.p2;
    drawExplosion(ctx, f.parts, f.x, f.y, age, color);
    if (age < 720) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 720);
      ctx.textAlign = 'center';
      ctx.font = `16px ${ARCADE}`;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillText('HIT!', f.x, f.y - 30 - age * 0.03);
      ctx.restore();
    }
  }

  // --- scores (HI-SCORE counters, player colors) ---
  const recentHit = (owner: 1 | 2) =>
    fx.some((f) => f.kind === 'hit' && f.owner === owner && now - f.t < 260);
  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = `10px ${ARCADE}`;
  ctx.fillStyle = COL.muted;
  ctx.fillText('P1 HITS', 30, 34);
  ctx.textAlign = 'right';
  ctx.fillText('P2 HITS', CW - 30, 34);
  ctx.textAlign = 'left';
  ctx.font = `${recentHit(1) ? 30 : 24}px ${ARCADE}`;
  ctx.fillStyle = COL.p1;
  ctx.shadowColor = COL.p1;
  ctx.shadowBlur = 10;
  ctx.fillText(String(s.score1), 30, 66);
  ctx.textAlign = 'right';
  ctx.font = `${recentHit(2) ? 30 : 24}px ${ARCADE}`;
  ctx.fillStyle = COL.p2;
  ctx.shadowColor = COL.p2;
  ctx.fillText(String(s.score2), CW - 30, 66);
  ctx.restore();

  // --- win slam overlay ---
  if (winFx && winAge < RESULT_FX_MS + 300) {
    const color =
      winFx.winner === 'P1' ? COL.p1 : winFx.winner === 'P2' ? COL.p2 : COL.accent2;
    const a = Math.max(0, 1 - winAge / (RESULT_FX_MS + 300));
    ctx.save();
    ctx.globalAlpha = 0.22 * a;
    ctx.fillStyle = color;
    if (winFx.winner === 'P1') ctx.fillRect(0, 0, CW / 2, CH);
    else if (winFx.winner === 'P2') ctx.fillRect(CW / 2, 0, CW / 2, CH);
    else ctx.fillRect(0, 0, CW, CH);
    ctx.restore();
    if (reduce || Math.floor(winAge / 120) % 2 === 0 || winAge > 360) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `24px ${ARCADE}`;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillText(winFx.winner === 'DRAW' ? 'DRAW' : `${winFx.winner} WINS`, CW / 2, 108);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
type BotPhase = 'idle' | 'aim' | 'charge';

export default function Game13() {
  useDebugScreen('scr-game13');
  const flow = useFlow();
  const navigate = useNavigate();

  const { isOnline, myRole, stateRef } = useOnlineRender<Game13State>(13, (s) => {
    setDebugGame(s);
    const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remainingMs / 1000) * 1000);
  });
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const botRef = useRef<{ phase: BotPhase; target: number; releaseAt: number; nextAt: number }>({
    phase: 'idle',
    target: 45,
    releaseAt: 0,
    nextAt: 0,
  });
  const fxRef = useRef<Fx[]>([]);
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

  // direct-URL recovery + debug bridge cleanup
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 13) startOfflineGame(13);
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

  // keyboard — local adapter. Push both down AND up (hold/keyup matters for aim/charge).
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // real server online: only local player's U/I → U=AIM(slotA→KeyQ), I=POWER(slotB→KeyW).
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

        // offline (local 2P / local online-mock bot) — P1 Q/W, P2 U/I.
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

  // round lifecycle: create state → rAF loop (step + draw) → report result
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // ── online: draw server snapshots only (no step/bot/report) ──
    if (isOnline) {
      if (!stateRef.current) {
        stateRef.current = game13.create(Math.random);
        setDebugGame(stateRef.current);
      }
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const s = stateRef.current;
        const ctx = canvasRef.current?.getContext('2d');
        if (!s || !ctx) return;
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
        const disp = getPlayerDisplays(getFlow());
        drawScene(ctx, s, fxRef.current, now, { p1IsYou: disp.P1.isYou, p2IsYou: disp.P2.isYou }, reduce);
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    // ── offline (local sim + bot + result report) ──
    if (flow.gameId !== 13 || flow.phase !== 'playing') return;

    const st = game13.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    botRef.current = { phase: 'idle', target: 45, releaseAt: 0, nextAt: 0 };
    fxRef.current = [];
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

        // online-mock bot (P2): aim toward potY, hold I 0.5~0.9s, release to fire.
        if (getFlow().mode === 'online') {
          const bot = botRef.current;
          if (bot.phase === 'idle') {
            if (s.cd2 === 0 && now >= bot.nextAt) {
              // pot high on screen (small potY) → larger angle; low (large potY) → smaller.
              const norm = clamp((s.potY - (G13.POT_BASE_Y - G13.POT_AMP)) / (G13.POT_AMP * 2), 0, 1);
              bot.target = 60 - norm * 30; // [30,60]
              bot.phase = 'aim';
              events.push({ code: 'KeyU', type: 'down', t: now / 1000 });
              lampRef.current.flashU();
            }
          } else if (bot.phase === 'aim') {
            if (Math.abs(s.angle2 - bot.target) <= 5) {
              events.push({ code: 'KeyU', type: 'up', t: now / 1000 });
              events.push({ code: 'KeyI', type: 'down', t: now / 1000 });
              lampRef.current.flashI();
              bot.phase = 'charge';
              bot.releaseAt = now + 500 + Math.random() * 400; // 0.5~0.9s
            }
          } else if (bot.phase === 'charge') {
            if (now >= bot.releaseAt) {
              events.push({ code: 'KeyI', type: 'up', t: now / 1000 });
              bot.phase = 'idle';
              bot.nextAt = now + 250 + Math.random() * 350;
            }
          }
        }

        const prevScore1 = s.score1;
        const prevScore2 = s.score2;
        s = game13.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);
        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);

        // render-only derivations: spawn explosion where a hit just scored
        if (s.score1 > prevScore1)
          fxRef.current.push({ kind: 'hit', owner: 1, x: G13.POT_X, y: s.potY, parts: makeExplosion(G13.POT_X, s.potY, 18), t: now });
        if (s.score2 > prevScore2)
          fxRef.current.push({ kind: 'hit', owner: 2, x: G13.POT_X, y: s.potY, parts: makeExplosion(G13.POT_X, s.potY, 18), t: now });

        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          fxRef.current.push({ kind: 'win', winner: s.result, t: now });
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        if (isOnline) return;
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
        const disp = getPlayerDisplays(getFlow());
        drawScene(ctx, s, fxRef.current, now, { p1IsYou: disp.P1.isYou, p2IsYou: disp.P2.isYou }, reduce);
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
    <main data-testid="scr-game13" className="g13-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g13-topbar">
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
        <span className="g13-title font-arcade c-muted">GAME 13 · POT SHOT</span>
      </div>

      <div className="g13-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g13-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g13-canvas" aria-label="Game 13 stage — Pot Shot" />
      </div>

      {/* On-screen keycaps. Online: only my U(AIM)/I(POWER). Offline: P1 Q/W + P2 U/I. */}
      {isOnline ? (
        <div className="g13-keys g13-keys--online">
          <div className="g13-keys__group">
            <span className={`g13-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myColor === 'blue' ? 'BLUE' : 'RED'}
            </span>
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="U" icon="∠" lit={uLit} label="AIM" />
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="I" icon="⚡" lit={iLit} label="POWER" />
          </div>
          <span className="g13-keys__hint font-arcade c-muted">Aim &amp; charge — hit the pot!</span>
        </div>
      ) : (
        <div className="g13-keys">
          <div className="g13-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="∠" lit={qLit} label="AIM" />
            <KeyCap role="P1" keyChar="W" icon="⚡" lit={wLit} label="POWER" />
            <span className="g13-keys__tag font-arcade c-p1">P1</span>
          </div>
          <span className="g13-keys__hint font-arcade c-muted">Aim &amp; charge — hit the pot!</span>
          <div className="g13-keys__group">
            <span className="g13-keys__tag font-arcade c-p2">P2</span>
            <KeyCap role="P2" keyChar="U" icon="∠" lit={uLit} label="AIM" />
            <KeyCap role="P2" keyChar="I" icon="⚡" lit={iLit} label="POWER" />
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}
