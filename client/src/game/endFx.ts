/**
 * Shared skeleton for game end effects — common to online/offline.
 *
 * Problem: when a round ends (state.result decided), the screen 'freezes' on the end frame and cuts off awkwardly.
 *          (online in particular, the server stops ticking and halts on the last snapshot)
 * Solution: each game's render loop detects the frame where 'result goes from null→win/loss' and enters the
 *           end-effect phase, during which it draws a per-game FX (explosion, etc.) or the default FX (flash) on
 *           the canvas. It fits comfortably within the server round interval (2.5s).
 *
 * Usage:
 *   const endRef = useRef(createEndTracker());
 *   // in the render loop, after drawScene:
 *   const started = endRef.current.update(state.result, now); // true if it just ended (trigger explosion spawn, etc.)
 *   drawEndFlash(ctx, CW, CH, endRef.current.age(now));       // the default effect (flash)
 */
import type { GameResult } from '@madcade/shared';

/** Default flash duration (ms) — at the decisive moment a white flash fades out quickly */
export const FLASH_MS = 320;
/** Full end-effect window (ms) — the lifetime of rich effects like explosion debris */
export const END_ANIM_MS = 900;

export interface EndTracker {
  /** Called every frame. True on the frame where result just went null→win/loss (to trigger the effect start). */
  update(result: GameResult, now: number): boolean;
  /** Elapsed time of the end effect (ms). Null if still in progress (result=null). */
  age(now: number): number | null;
  /** The currently decided result (win/loss while the effect is playing, otherwise null). */
  readonly result: GameResult;
  reset(): void;
}

/** One per game instance. Remembers when result transitioned and gives elapsed time. Auto-resets on a new round (result=null). */
export function createEndTracker(): EndTracker {
  let prev: GameResult = null;
  let at = 0;
  return {
    update(result, now) {
      if (result && !prev) {
        prev = result;
        at = now;
        return true; // transition frame
      }
      if (!result && prev) {
        prev = null;
        at = 0;
      }
      return false;
    },
    age(now) {
      return prev ? now - at : null;
    },
    get result() {
      return prev;
    },
    reset() {
      prev = null;
      at = 0;
    },
  };
}

/**
 * Default end flash (default for all games) — at the decisive moment a white flash fades out quickly.
 * No viewer perspective (win/loss) needed — signals the "decisive moment" on any screen. Call at the end of drawScene.
 * @param ageMs return value of createEndTracker.age(now) (null before it starts → draws nothing)
 */
export function drawEndFlash(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ageMs: number | null,
): void {
  if (ageMs === null || ageMs < 0 || ageMs > FLASH_MS) return;
  const a = 0.6 * (1 - ageMs / FLASH_MS); // 0.6 → 0
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ── Explosion effect (reusable helper for collision games like Game 5) ────────────────────────────
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Creates explosion debris radiating from center (cx,cy). `count` particles, spread in angle and speed (slightly randomized). */
export function makeExplosion(cx: number, cy: number, count = 20): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const spd = 140 + Math.random() * 220;
    out.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd });
  }
  return out;
}

/**
 * Draws the explosion — core white flash + radiating debris (falls under gravity) + fade. Disappears after END_ANIM_MS.
 * @param ageMs elapsed time since the explosion started (ms)
 */
export function drawExplosion(
  ctx: CanvasRenderingContext2D,
  particles: readonly Particle[],
  cx: number,
  cy: number,
  ageMs: number,
  color = '#ffb020',
): void {
  if (ageMs < 0 || ageMs > END_ANIM_MS) return;
  const t = ageMs / 1000;
  const fade = Math.max(0, 1 - ageMs / END_ANIM_MS);
  ctx.save();
  // core flash ring (first 220ms)
  const flash = Math.max(0, 1 - ageMs / 220);
  if (flash > 0) {
    ctx.globalAlpha = flash;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 10 + ageMs * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  // debris (radiating + weak gravity)
  ctx.globalAlpha = fade;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  for (const p of particles) {
    const px = p.x + p.vx * t;
    const py = p.y + p.vy * t + 240 * t * t;
    const sz = 5 * fade + 1;
    ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
  }
  ctx.restore();
}

/** Screen-shake offset for the end effect (decaying). Use with ctx.translate before drawScene. */
export function shakeOffset(ageMs: number | null, mag = 8): { x: number; y: number } {
  if (ageMs === null || ageMs > 260) return { x: 0, y: 0 };
  const decay = 1 - ageMs / 260;
  return { x: (Math.random() - 0.5) * 2 * mag * decay, y: (Math.random() - 0.5) * 2 * mag * decay };
}
