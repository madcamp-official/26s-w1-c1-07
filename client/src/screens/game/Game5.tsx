/**
 * Game 10 · Light Cycle (Light Cycle / Tron) — NEON COIN-OP new screen.
 * Container testid: scr-game5 / parts: game-stage(CRT bezel), hud-*(HudFrame embedded), btn-exit
 *
 * ── Principles ────────────────────────────────────────────────────────────
 *  · Game logic/judgement/constants use 100% @madpump/shared game5 core(create/step) + G5 constants only.
 *  · Screen/rendering is written from scratch in this file (direct canvas drawing). No reference to the game-lab renderer.
 *  · 0 lines of design-lab import. Colors/fonts only copy theme.css tokens(hex).
 *
 * Game (derived from core state fields):
 *  · On a GX×GY(64×36) grid, two bikes advance one cell every STEP(0.05s), leaving a trail(wall) occ[] on cells passed.
 *  · P1 Q=turn left / W=turn right, P2 U=turn left / I=turn right (core does pend→turn judgement).
 *  · Death on wall/trail collision, last survivor wins. Head-on collision / simultaneous death / surviving 10s is a DRAW.
 *  · gx/gy=head cell, dir=direction(0 right 1 down 2 left 3 up), frac=progress to next cell(0~1, for interpolation), occ=wall map.
 *
 * Wiring (Game 1·2 pattern):
 *  · game5.create(Math.random) / game5.step(state, events, dtSec) — state is mutated in-place + same reference.
 *  · attachLocalKeyboard(now, push): KeyQ/KeyW=P1, KeyU/KeyI=P2 (down/up queuing, lamp lighting).
 *  · rAF loop + watchdog(interval) so it progresses to the result even in a background tab(QA handling).
 *  · result confirmed → short crash effect(RESULT_FX_MS) then reportRoundEnd once → <ResultOverlay />.
 *  · In online mode P2 is a bot(the Light Cycle survival AI synthesizes left/right turn keys).
 *  · Every tick setDebugGame(state), on unmount setDebugGame(null).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { game5, G5, GAME_DURATION } from '@madpump/shared';
import type { Game5State, GameInputEvent } from '@madpump/shared';
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
import { createEndTracker, drawEndFlash, type EndTracker } from '../../game/endFx';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import { sfx } from '@/audio';
import './game5.css';

// ---------------------------------------------------------------------------
// Canvas: core field(800×450) = grid 64×36 → cell 12.5px. Responsive via DPR scaling.
// ---------------------------------------------------------------------------
const CW = G5.W; // 800
const CH = G5.H; // 450
const GX = G5.GX; // 64
const GY = G5.GY; // 36
const CELL_W = CW / GX; // 12.5
const CELL_H = CH / GY; // 12.5

// Direction vectors(render/AI only — judgement is done by the core). 0=right 1=down 2=left 3=up
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

const COL0 = {
  bgTop: '#160a33', // --surface-deep
  bgBottom: '#0d0221', // --bg
  grid: 'rgba(211,0,197,0.07)', // --accent2 dim
  gridMajor: 'rgba(211,0,197,0.15)',
  gridU: 'rgba(255,42,109,0.10)', // imminent(pink)
  gridUMajor: 'rgba(255,42,109,0.20)',
  border: '#d300c5', // --accent2
  p1: '#05d9e8',
  p1body: 'rgba(5,217,232,0.22)',
  p2: '#ff2a6d',
  p2body: 'rgba(255,42,109,0.22)',
  accent: '#fdf500',
  accent2: '#d300c5',
  hot: '#f4f0ff', // --text
} as const;

/**
 * Color = player-bound (not role): the module default COL0 is P1 entity=cyan('blue') · P2 entity=pink('red').
 * If this round's actual player color(functionColors) has P1=red, give a local COL that swaps p1/p2(and body).
 * → The COL.p1/p2/p1body/p2body usages below automatically follow the 'player color'(common to online/offline draw).
 * If offline / no color info, functionColors gives the default so it stays the same as before(cyan P1 / pink P2).
 */
function playerCol() {
  const fc = functionColors();
  return fc.p1 === 'red'
    ? { ...COL0, p1: COL0.p2, p1body: COL0.p2body, p2: COL0.p1, p2body: COL0.p1body }
    : COL0;
}

const ARCADE_FONT = '"Press Start 2P", monospace';

/** Number of recent cells to show as trail hot-glow(glow gradient near the head) */
const HOT_MAX = 44;
/** In-game crash effect duration between judgement → result overlay transition */
const RESULT_FX_MS = 750;

// ---------------------------------------------------------------------------
// Render-only effects/structures
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'shards'; x: number; y: number; color: string; t: number }
  | { kind: 'caption'; text: string; color: string; x: number; y: number; t: number; life: number }
  | { kind: 'flash'; color: string; t: number }
  | { kind: 'chroma'; t: number };

interface Cell {
  x: number;
  y: number;
}

/** core result → shell MatchResult mapping */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): MatchResult {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

// ---------------------------------------------------------------------------
// Online mock bot — P2(Light Cycle) survival AI. Judgement is still the core.
// Reads occ to measure the free cells ahead/left/right and returns a left/right turn('L'|'R'|null).
// ---------------------------------------------------------------------------
function free(occ: readonly number[], x: number, y: number): boolean {
  return x >= 0 && x < GX && y >= 0 && y < GY && occ[y * GX + x] === 0;
}

/** Number of consecutive empty cells in the dir direction until blocked(cap) */
function rayFree(occ: readonly number[], x: number, y: number, dir: number, cap = 18): number {
  let n = 0;
  let cx = x;
  let cy = y;
  while (n < cap) {
    cx += DX[dir];
    cy += DY[dir];
    if (!free(occ, cx, cy)) break;
    n += 1;
  }
  return n;
}

function chooseBotTurn(s: Game5State): 'L' | 'R' | null {
  const { dir2: dir, gx2: x, gy2: y, occ } = s;
  const leftDir = (dir + 3) % 4;
  const rightDir = (dir + 1) % 4;
  const straight = rayFree(occ, x, y, dir);
  const left = rayFree(occ, x, y, leftDir);
  const right = rayFree(occ, x, y, rightDir);

  // Imminent: the cell right ahead is blocked → must turn this step
  if (straight === 0) {
    if (left === 0 && right === 0) return null; // cornered — go straight(death)
    return left >= right ? 'L' : 'R';
  }
  // Preemptive avoidance: if room ahead is short and a side is much wider, turn early
  if (straight <= 3 && (left > straight + 2 || right > straight + 2)) {
    return left >= right ? 'L' : 'R';
  }
  // Gentle wandering(so as not to get trapped in own trail) — probabilistically toward the wider side
  if (straight <= 7 && Math.abs(left - right) > 3 && Math.random() < 0.14) {
    return left > right ? 'L' : 'R';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Canvas renderer (pure drawing — state is read-only)
// ---------------------------------------------------------------------------
function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game5State,
  fx: readonly Fx[],
  hot1: readonly Cell[],
  hot2: readonly Cell[],
  dead: { p1: boolean; p2: boolean },
  now: number,
  p1IsYou: boolean,
  p2IsYou: boolean,
): void {
  // Color = player-bound: shadow the module COL with a local COL swapped to this round's actual player color.
  // The COL.p1/p2/p1body/p2body below(trail·hot·bike) automatically follow the P1/P2 functional entity's player color.
  const COL = playerCol();
  const remMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remMs <= 5000 && s.result === null;

  // --- Background(deep purple gradient) ---
  ctx.clearRect(0, 0, CW, CH);
  const bg = ctx.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, COL.bgTop);
  bg.addColorStop(1, COL.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CW, CH);

  // --- Arcade grid(pink tint when imminent) ---
  ctx.save();
  ctx.lineWidth = 1;
  const minor = urgent ? COL.gridU : COL.grid;
  const major = urgent ? COL.gridUMajor : COL.gridMajor;
  for (let i = 0; i <= GX; i += 1) {
    ctx.strokeStyle = i % 8 === 0 ? major : minor;
    const gx = i * CELL_W;
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, CH);
    ctx.stroke();
  }
  for (let j = 0; j <= GY; j += 1) {
    ctx.strokeStyle = j % 6 === 0 ? major : minor;
    const gy = j * CELL_H;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(CW, gy);
    ctx.stroke();
  }
  ctx.restore();

  // --- Arena border(purple neon frame) ---
  ctx.save();
  ctx.strokeStyle = COL.border;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.shadowColor = COL.border;
  ctx.shadowBlur = 5;
  ctx.strokeRect(1, 1, CW - 2, CH - 2);
  ctx.restore();

  // --- Trail body(occ source of truth — continuous wall, semi-transparent color, no glow) ---
  const occ = s.occ;
  for (let j = 0; j < GY; j += 1) {
    for (let i = 0; i < GX; i += 1) {
      const v = occ[j * GX + i];
      if (v === 0) continue;
      ctx.fillStyle = v === 1 ? COL.p1body : COL.p2body;
      ctx.fillRect(i * CELL_W + 0.5, j * CELL_H + 0.5, CELL_W - 1, CELL_H - 1);
    }
  }

  // --- Trail hot-glow(more recent cells brighter — the bike's light-wall glow) ---
  drawHot(ctx, hot1, COL.p1, now);
  drawHot(ctx, hot2, COL.p2, now);

  // --- Bike head + direction nose(glow focus) ---
  const youBlink = Math.floor(now / 450) % 2 === 0;
  drawBike(ctx, s.gx1, s.gy1, s.dir1, s.frac, COL.p1, 'P1', p1IsYou && youBlink, dead.p1);
  drawBike(ctx, s.gx2, s.gy2, s.dir2, s.frac, COL.p2, 'P2', p2IsYou && youBlink, dead.p2);

  // --- Effects: shards / caption / flash ---
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'shards' && age < 700) {
      ctx.save();
      ctx.fillStyle = f.color;
      ctx.globalAlpha = Math.max(0, 1 - age / 700);
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 8;
      for (let i = 0; i < 8; i += 1) {
        const ang = (Math.PI * 2 * i) / 8 + 0.4;
        const d = 6 + age * 0.12;
        ctx.fillRect(f.x + Math.cos(ang) * d - 2, f.y + Math.sin(ang) * d - 2, 4, 4);
      }
      ctx.restore();
    } else if (f.kind === 'caption' && age < f.life) {
      const blinkOn = Math.floor(age / 110) % 2 === 0 || age > 220; // blinks then stays lit
      if (blinkOn) {
        ctx.save();
        ctx.font = `14px ${ARCADE_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 12;
        ctx.fillText(
          f.text,
          Math.min(CW - 60, Math.max(60, f.x)),
          Math.min(CH - 20, Math.max(26, f.y)),
        );
        ctx.restore();
      }
    } else if (f.kind === 'flash' && age < 160) {
      ctx.save();
      ctx.globalAlpha = 0.25 * (1 - age / 160);
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, CW, CH);
      ctx.restore();
    }
  }

  // --- Chromatic aberration at crash moment(once only at the win/loss moment, ~90ms) ---
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && now - chroma.t < 90) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(ctx.canvas, -4, 0, CW, CH);
    ctx.globalAlpha = 0.22;
    ctx.drawImage(ctx.canvas, 4, 0, CW, CH);
    ctx.restore();
  }
}

function drawHot(ctx: CanvasRenderingContext2D, hot: readonly Cell[], color: string, _now: number): void {
  const n = hot.length;
  if (n === 0) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  const denom = n - 1 || 1;
  for (let k = 0; k < n; k += 1) {
    const rec = k / denom; // 0 oldest .. 1 newest
    ctx.globalAlpha = 0.12 + 0.5 * rec;
    const c = hot[k];
    ctx.fillRect(c.x * CELL_W + 2, c.y * CELL_H + 2, CELL_W - 4, CELL_H - 4);
  }
  ctx.restore();
}

function drawBike(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  dir: number,
  frac: number,
  color: string,
  label: string,
  showYou: boolean,
  dead: boolean,
): void {
  if (dead) return; // dead bike is replaced by shards
  const cx = gx * CELL_W + CELL_W / 2;
  const cy = gy * CELL_H + CELL_H / 2;

  // Direction nose(glow line that extends by frac in the travel direction → sense of speed)
  const lead = 0.5 + 0.7 * frac;
  const nx = cx + DX[dir] * lead * CELL_W;
  const ny = cy + DY[dir] * lead * CELL_H;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(nx, ny);
  ctx.stroke();
  // Head square(bright core)
  ctx.fillStyle = color;
  ctx.fillRect(cx - CELL_W / 2 + 1.5, cy - CELL_H / 2 + 1.5, CELL_W - 3, CELL_H - 3);
  ctx.shadowBlur = 0;
  ctx.fillStyle = COL0.hot;
  ctx.fillRect(cx - 2, cy - 2, 4, 4);
  ctx.restore();

  // P1/P2 tag above the head(+ YOU blinking if it's my bike)
  ctx.save();
  ctx.font = `10px ${ARCADE_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  const ly = Math.max(12, cy - CELL_H / 2 - 3);
  ctx.fillText(label, cx, ly);
  if (showYou) {
    ctx.fillStyle = COL0.accent;
    ctx.shadowColor = COL0.accent;
    ctx.fillText('YOU', cx, Math.max(24, ly - 12));
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Game5() {
  useDebugScreen('scr-game5');
  const flow = useFlow();
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const eventsRef = useRef<GameInputEvent[]>([]);
  const fxRef = useRef<Fx[]>([]);
  const hot1Ref = useRef<Cell[]>([]);
  const hot2Ref = useRef<Cell[]>([]);
  const lastHead1Ref = useRef<Cell>({ x: -1, y: -1 });
  const lastHead2Ref = useRef<Cell>({ x: -1, y: -1 });
  const deadRef = useRef<{ p1: boolean; p2: boolean }>({ p1: false, p2: false });
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const botNextAtRef = useRef(0);
  // End effect: track result transition(basic flash only — no explosion)
  const endRef = useRef<EndTracker>(createEndTracker());

  /** HUD remaining time(quantized to seconds — saves re-renders) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);

  // Server-online(authoritative) render hook — selectively subscribes only to active/role(re-render only at round boundaries where the value changes).
  //  · Snapshot → stateRef/snapAtRef mirroring is handled by the hook without re-render.
  //  · Only per-snapshot HUD/debug reflection is delegated to onSnapshot → re-render only when the value actually changes(second quantization).
  const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game5State>(5, (s) => {
    setDebugGame(s);
    const remMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remMs / 1000) * 1000);
  });
  // ref that lets the input handler(stable closure) see the latest 'whether online is active'(prevents stale-closure)
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  // My color(player-bound, independent of role) — selectively subscribe only to the primitive value → re-render only on color assignment(match start).
  // Give keycap/HUD marker colors from this color, not from the role.
  const myColor = useSyncExternalStore(
    onlineStore.subscribe,
    () => onlineStore.get().myColor ?? 'blue',
    () => onlineStore.get().myColor ?? 'blue',
  );

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();

  // direct-URL recovery + clean up the debug bridge on leaving
  // (if an online match is active, flow is set by OnlineController, so don't trigger offline recovery)
  useEffect(() => {
    const f = getFlow();
    if (!isOnline && (f.phase === 'idle' || f.gameId !== 5)) startOfflineGame(5);
    return () => setDebugGame(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (server snapshot → stateRef/snapAtRef mirroring + per-snapshot HUD/debug reflection are handled by useOnlineRender)

  // Initialize canvas resolution(dpr scale)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // Keyboard — local adapter. GameInputEvent queuing + lamp lighting.
  // P1 Q/W, P2 U/I. In online, the P2 keys are handled by the bot, so don't absorb them.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // Server-online active: send only to the server instead of the local queue/bot.
        // Slot A=turn left(Q·U) / B=turn right(W·I) — since the server rewrites my role,
        // pressing any of the 4 keys goes to my slot. Lamp lighting stays based on the physical key pressed.
        if (isOnlineRef.current) {
          // Online uses only the two keys U/I(requirement). U=main key(slotA), I=secondary key(slotB). Q/W are ignored.
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          if (e.type === 'down') {
            sfx('g5-turn');
            if (e.code === 'KeyU') flashU();
            else flashI();
          }
          return;
        }

        const f = getFlow();
        const online = f.mode === 'online';
        if (e.code === 'KeyQ') {
          if (e.type === 'down') {
            sfx('g5-turn');
            flashQ();
          }
        } else if (e.code === 'KeyW') {
          if (e.type === 'down') {
            sfx('g5-turn');
            flashW();
          }
        } else if (e.code === 'KeyU') {
          if (online) return; // online mock: P2 = bot
          if (e.type === 'down') {
            sfx('g5-turn');
            flashU();
          }
        } else if (e.code === 'KeyI') {
          if (online) return;
          if (e.type === 'down') {
            sfx('g5-turn');
            flashI();
          }
        }
        if (f.phase === 'playing') eventsRef.current.push(e);
      },
    );
    return detach;
  }, [flashQ, flashW, flashU, flashI]);

  // Round lifecycle: create state → rAF loop(step + draw) → report result.
  // Even if rAF stalls in a background/occluded tab, the watchdog interval steps in its place(QA automation handling).
  useEffect(() => {
    // ── Online(server-authoritative): draw only the server state, with no step·bot·judgement·result-report ──
    // Reuse the drawScene() that the existing offline loop called every frame, as-is.
    if (isOnline) {
      let raf = 0;
      const recordHot = (arr: Cell[], lastRef: { current: Cell }, x: number, y: number) => {
        const l = lastRef.current;
        if (l.x !== x || l.y !== y) {
          arr.push({ x, y });
          if (arr.length > HOT_MAX) arr.shift();
          lastRef.current = { x, y };
        }
      };
      const loop = () => {
        const ctx = canvasRef.current?.getContext('2d');
        const s = stateRef.current;
        if (ctx && s) {
          const now = performance.now();
          recordHot(hot1Ref.current, lastHead1Ref, s.gx1, s.gy1);
          recordHot(hot2Ref.current, lastHead2Ref, s.gx2, s.gy2);
          fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
          const disp = getPlayerDisplays(getFlow());
          // Extrapolation between snapshots: never advance the head cell(gx/gy)·trail(occ) since they are the collision source of truth,
          // only fill the render-interpolation frac(progress to next cell, nose length) at its own speed(1 cell/STEP).
          // Reproduces online too the offline nose ramp where the core updated frac every frame(capped 0~1).
          const extraDt = Math.min(G5.STEP, Math.max(0, (now - snapAtRef.current) / 1000));
          const view =
            extraDt > 0 && s.result === null
              ? { ...s, frac: Math.min(1, s.frac + extraDt / G5.STEP) }
              : s;
          drawScene(
            ctx,
            view,
            fxRef.current,
            hot1Ref.current,
            hot2Ref.current,
            deadRef.current,
            now,
            disp.P1.isYou,
            disp.P2.isYou,
          );
          endRef.current.update(s.result, now); // basic end flash
          drawEndFlash(ctx, CW, CH, endRef.current.age(now));
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    if (flow.gameId !== 5 || flow.phase !== 'playing') return;

    const st = game5.create(Math.random);
    stateRef.current = st;
    eventsRef.current = [];
    fxRef.current = [];
    hot1Ref.current = [{ x: st.gx1, y: st.gy1 }];
    hot2Ref.current = [{ x: st.gx2, y: st.gy2 }];
    lastHead1Ref.current = { x: st.gx1, y: st.gy1 };
    lastHead2Ref.current = { x: st.gx2, y: st.gy2 };
    deadRef.current = { p1: false, p2: false };
    reportedRef.current = false;
    resultAtRef.current = 0;
    botNextAtRef.current = 0;
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);

    let raf = 0;
    let stopped = false;
    let last = performance.now();

    const recordHot = (arr: Cell[], lastRef: { current: Cell }, x: number, y: number) => {
      const l = lastRef.current;
      if (l.x !== x || l.y !== y) {
        arr.push({ x, y });
        if (arr.length > HOT_MAX) arr.shift();
        lastRef.current = { x, y };
      }
    };

    // Produce the crash effect at the judgement moment(glitch only at the win/loss moment)
    const onResult = (s: Game5State, now: number) => {
      // The crash shards/flash/caption colors are also player-bound(same color as the bike): shadow the local COL.
      const COL = playerCol();
      const timeout = s.elapsed >= GAME_DURATION - 1e-6;
      let dead1 = false;
      let dead2 = false;
      if (s.result === 'P1') dead2 = true;
      else if (s.result === 'P2') dead1 = true;
      else if (s.result === 'DRAW' && !timeout) {
        dead1 = true;
        dead2 = true;
      }
      deadRef.current = { p1: dead1, p2: dead2 };
      // Crash(death sound) impact — once only when there's an actual death(excluding timeout draw).
      if (dead1 || dead2) sfx('g5-crash');

      const cellPx = (gx: number, gy: number, dir: number) => {
        const cx = Math.min(GX - 1, Math.max(0, gx + DX[dir]));
        const cy = Math.min(GY - 1, Math.max(0, gy + DY[dir]));
        return { x: cx * CELL_W + CELL_W / 2, y: cy * CELL_H + CELL_H / 2 };
      };
      if (dead1) {
        const p = cellPx(s.gx1, s.gy1, s.dir1);
        fxRef.current.push({ kind: 'shards', x: p.x, y: p.y, color: COL.p1, t: now });
      }
      if (dead2) {
        const p = cellPx(s.gx2, s.gy2, s.dir2);
        fxRef.current.push({ kind: 'shards', x: p.x, y: p.y, color: COL.p2, t: now });
      }
      fxRef.current.push({ kind: 'chroma', t: now });
      fxRef.current.push({
        kind: 'flash',
        color: dead1 && dead2 ? COL.accent2 : dead1 ? COL.p1 : dead2 ? COL.p2 : COL.accent,
        t: now,
      });

      let text: string;
      let color: string;
      let x: number;
      let y: number;
      if (timeout && s.result === 'DRAW') {
        text = 'TIME UP';
        color = COL.accent;
        x = CW / 2;
        y = CH / 2;
      } else if (dead1 && dead2) {
        text = 'DOUBLE KO';
        color = COL.accent2;
        x = CW / 2;
        y = CH / 2;
      } else {
        text = 'CRASH!';
        color = dead1 ? COL.p1 : COL.p2;
        const gx = dead1 ? s.gx1 : s.gx2;
        const gy = dead1 ? s.gy1 : s.gy2;
        x = gx * CELL_W + CELL_W / 2;
        y = gy * CELL_H - 6;
      }
      fxRef.current.push({ kind: 'caption', text, color, x, y, t: now, life: RESULT_FX_MS });
    };

    const frame = (now: number) => {
      if (stopped) return;
      // During the round intro, pause the sim(skip core step) + update last to avoid a dt jump on resume.
      // Since frame is a self-scheduling rAF callback, keep requesting the next frame(maintains the chain, same as the Game1 loop structure).
      if (isRoundIntroActive()) {
        last = now;
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min(0.1, (now - last) / 1000); // in seconds, 100ms clamp(prevents grid teleport)
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        const events = eventsRef.current;
        eventsRef.current = [];

        // Online bot(P2): the survival AI synthesizes left/right turn keys(throttle 40ms)
        if (getFlow().mode === 'online' && now >= botNextAtRef.current) {
          const t = chooseBotTurn(s);
          if (t) {
            events.push({ code: t === 'L' ? 'KeyU' : 'KeyI', type: 'down', t: now / 1000 });
            (t === 'L' ? flashU : flashI)();
          }
          botNextAtRef.current = now + 40;
        }

        s = game5.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s); // debug bridge — every tick
        const remMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remMs / 1000) * 1000);

        recordHot(hot1Ref.current, lastHead1Ref, s.gx1, s.gy1);
        recordHot(hot2Ref.current, lastHead2Ref, s.gx2, s.gy2);

        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          onResult(s, now);
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // After briefly showing the crash effect, report round end once → ResultOverlay
        reportedRef.current = true;
        stopped = true;
        if (isOnline) return; // online: the server drives round:end — the screen does not report
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
          hot1Ref.current,
          hot2Ref.current,
          deadRef.current,
          now,
          disp.P1.isYou,
          disp.P2.isYou,
        );
        endRef.current.update(s.result, now); // basic end flash
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      }

      if (!stopped) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    const watchdog = setInterval(() => {
      const now = performance.now();
      if (!stopped && now - last > 280) frame(now); // don't intervene if rAF is alive
    }, 250);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearInterval(watchdog);
    };
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound, flashU, flashI]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= 5000;
  // Rider marker color = player-bound: if the P1 functional entity is red, swap the chip color(matches the canvas bike color).
  const colorSwap = functionColors().p1 === 'red';

  return (
    <main data-testid="scr-game5" className="g5-root">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g5-topbar">
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
        <span className="g5-title font-display c-muted">Game 5 · Light Cycle</span>
      </div>

      <div className="g5-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g5-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g5-canvas anim-sign-on" aria-label="Game 5 stage — Light Cycle" />

        {/* Top-left rider markers — color = player-bound(the P1/P2 functional entity's actual player color) */}
        <div className="g5-riders" aria-hidden>
          <span className={`g5-rider ${colorSwap ? 'g5-rider--p2' : 'g5-rider--p1'} font-arcade`}>
            P1 CYCLE
          </span>
          <span className={`g5-rider ${colorSwap ? 'g5-rider--p1' : 'g5-rider--p2'} font-arcade`}>
            P2 CYCLE
          </span>
        </div>
      </div>

      {/* On-screen keycaps — the actual assigned keys(SPEC Q2) + lamp lights at input moment */}
      {isOnline ? (
        <div className="g5-keys g5-keys--online">
          <div className="g5-keys__group">
            <span className={`g5-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myColor === 'blue' ? 'BLUE' : 'RED'} · CYCLE
            </span>
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="U" icon="↺" lit={uLit} label="Turn left" />
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="I" icon="↻" lit={iLit} label="Turn right" />
          </div>
          <span className="g5-keys__hint font-arcade">U turn left · I turn right — TURN TO SURVIVE</span>
        </div>
      ) : (
        <div className="g5-keys">
          <div className="g5-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="↺" lit={qLit} label="Turn left" />
            <KeyCap role="P1" keyChar="W" icon="↻" lit={wLit} label="Turn right" />
            <span className="g5-keys__tag font-arcade c-p1">P1 · CYCLE</span>
          </div>
          <span className="g5-keys__hint font-arcade">TURN TO SURVIVE</span>
          <div className="g5-keys__group">
            <span className="g5-keys__tag font-arcade c-p2">P2 · CYCLE</span>
            <KeyCap role="P2" keyChar="U" icon="↺" lit={uLit} label="Turn left" />
            <KeyCap role="P2" keyChar="I" icon="↻" lit={iLit} label="Turn right" />
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}
