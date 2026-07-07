/**
 * Game6 (Dino Run) — OBSIDIAN theme.
 * DARK MINIMAL HI-TECH: near-black field, thin neon wireframe sprites (1.5px stroke),
 * electric-cyan(P1) / magenta-red(P2) accents, corner-cut HUD panel, receding steel grid.
 *
 * Contract: implements the Game6DrawScene signature from types.ts exactly. Coords/judgment use only geom + @madpump/shared G6 constants.
 * Color follows the "player", not the "role" → functionColors() swaps the P1/P2 entity colors.
 */
import type { Game6DrawScene } from './types';
import { G6, GAME_DURATION } from '@madpump/shared';
import { functionColors } from '../../../../net/online';

// ── OBSIDIAN palette ─────────────────────────────────────────────
const FIELD = '#0a0c10'; // near-black field
const RAISED = '#0e1118'; // raised panel
const TEXT = '#eaf0f8'; // label text
const STEEL = '#232a38'; // steel line
const CYAN = '#00f0ff'; // P1 electric-cyan
const RED = '#ff3358'; // P2 magenta-red
const CYAN_RGB = '0,240,255';
const RED_RGB = '255,51,88';
const FONT = "'Orbitron', sans-serif";

/** In-game FX duration between judgment and the result overlay transition (crash/survive) — same as RESULT_FX_MS in Game6.tsx */
const RESULT_FX_MS = 700;

interface Neon {
  p1: string;
  p2: string;
  p1rgb: string;
  p2rgb: string;
}

/** Per-character letter-spacing text (does not rely on the browser letterSpacing property → TS strict safe) */
function spacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'center' | 'right',
): void {
  const chars = [...text];
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width;
  total += spacing * Math.max(0, chars.length - 1);
  let cx = align === 'left' ? x : align === 'center' ? x - total / 2 : x - total;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = prevAlign;
}

/** Thin neon wireframe polygon (1.5px stroke + thin glow + near-transparent dark fill) */
function wire(
  ctx: CanvasRenderingContext2D,
  pts: readonly (readonly [number, number])[],
  stroke: string,
  rgb: string,
  closed: boolean,
): void {
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  if (closed) ctx.closePath();
  ctx.fillStyle = `rgba(${rgb},0.07)`;
  ctx.strokeStyle = stroke;
  ctx.shadowColor = stroke;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 1.5;
  if (closed) ctx.fill();
  ctx.stroke();
}

/** Angular wireframe raptor (P1). leftPx=box left, bottomPx=box bottom, sc=geom.SC */
function drawRaptor(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  bottomPx: number,
  ducking: boolean,
  grounded: boolean,
  runPhase: number,
  blink: boolean,
  col: string,
  rgb: string,
  sc: number,
): void {
  const boxH = ducking ? G6.DINO_DUCK_H : G6.DINO_H;
  const mx = (x: number) => leftPx + x * sc;
  const my = (y: number) => bottomPx - (boxH - y) * sc; // y: 0=top .. boxH=bottom
  const P = (x: number, y: number): readonly [number, number] => [mx(x), my(y)];

  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'round';
  if (blink) ctx.globalAlpha = 0.35;

  if (!ducking) {
    // Standing raptor (facing right) — sharp angular silhouette
    wire(
      ctx,
      [
        P(2, 30),
        P(11, 22),
        P(14, 12),
        P(22, 5),
        P(41, 8),
        P(32, 15),
        P(27, 17),
        P(28, 30),
        P(24, 41),
        P(13, 41),
        P(13, 33),
      ],
      col,
      rgb,
      true,
    );
    // Forelimb (short arm)
    ctx.beginPath();
    ctx.moveTo(mx(27), my(24));
    ctx.lineTo(mx(33), my(28));
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Legs (running — runPhase alternation). Tucked when airborne.
    const step = Math.floor(runPhase * 14) % 2 === 0;
    const frontH = grounded ? (step ? 41 + 8 : 41 + 2) : 41 + 4;
    const backH = grounded ? (step ? 41 + 2 : 41 + 8) : 41 + 4;
    const leg = (bx: number, toY: number) => {
      ctx.beginPath();
      ctx.moveTo(mx(bx), my(40));
      ctx.lineTo(mx(bx), my(toY));
      ctx.stroke();
    };
    leg(15, backH);
    leg(22, frontH);
    // Eye (glowing dot)
    ctx.shadowBlur = 0;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(mx(33), my(10), 1.5 * sc, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Ducking pose — low and long, head forward
    wire(
      ctx,
      [
        P(0, 10),
        P(12, 5),
        P(24, 3),
        P(44, 4),
        P(35, 12),
        P(16, 14),
        P(8, 18),
        P(1, 18),
      ],
      col,
      rgb,
      true,
    );
    const step = Math.floor(runPhase * 16) % 2 === 0;
    const frontH = step ? 18 + 7 : 18 + 3;
    const backH = step ? 18 + 3 : 18 + 7;
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.5;
    const leg = (bx: number, toY: number) => {
      ctx.beginPath();
      ctx.moveTo(mx(bx), my(18));
      ctx.lineTo(mx(bx), my(toY));
      ctx.stroke();
    };
    leg(14, backH);
    leg(24, frontH);
    ctx.shadowBlur = 0;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(mx(39), my(7), 1.4 * sc, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Cactus (P2 jump obstacle) — sharp red outline. Bottom pinned to the ground */
function drawCactus(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  groundPx: number,
  col: string,
  rgb: string,
  sc: number,
): void {
  const H = G6.CACTUS_H;
  const mx = (x: number) => leftPx + x * sc;
  const my = (y: number) => groundPx - (H - y) * sc; // y: 0=top .. H=bottom(ground)
  const P = (x: number, y: number): readonly [number, number] => [mx(x), my(y)];
  ctx.save();
  ctx.lineJoin = 'miter';
  // Angular single outline (body + left/right arms) — one silhouette
  wire(
    ctx,
    [
      P(10, 4),
      P(17, 4),
      P(17, 12),
      P(24, 12),
      P(24, 26),
      P(17, 26),
      P(17, 46),
      P(10, 46),
      P(10, 30),
      P(3, 30),
      P(3, 18),
      P(10, 18),
    ],
    col,
    rgb,
    true,
  );
  ctx.restore();
}

/** Bird (P2 duck obstacle) — red outline + wing flap (phase) */
function drawBird(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  topPx: number,
  phase: number,
  col: string,
  rgb: string,
  sc: number,
): void {
  const mx = (x: number) => leftPx + x * sc;
  const my = (y: number) => topPx + y * sc; // relative to box top (0..28)
  const P = (x: number, y: number): readonly [number, number] => [mx(x), my(y)];
  ctx.save();
  ctx.lineJoin = 'miter';
  // Body (beak points left = travel direction)
  wire(
    ctx,
    [P(2, 14), P(10, 9), P(24, 8), P(34, 10), P(38, 15), P(28, 19), P(12, 19), P(7, 16)],
    col,
    rgb,
    true,
  );
  // Wing — flap up/down
  const flap = Math.sin(phase * 16);
  wire(ctx, [P(15, 12), P(30, 12), P(22, 12 - 9 * flap)], col, rgb, true);
  // Eye
  ctx.shadowBlur = 0;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(mx(12), my(12), 1.3 * sc, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Scene renderer ─────────────────────────────────────────────────
export const drawScene: Game6DrawScene = (ctx, s, fx, now, p1IsYou, p2IsYou, geom) => {
  const { CW, CH, SC } = geom;
  const X = geom.X;
  const Y = geom.Y;

  // Color is player-dependent: P1 entity = CYAN if fc.p1 is blue, RED if red. P2 is the opposite.
  const fc = functionColors();
  const swap = fc.p1 === 'red';
  const col: Neon = swap
    ? { p1: RED, p2: CYAN, p1rgb: RED_RGB, p2rgb: CYAN_RGB }
    : { p1: CYAN, p2: RED, p1rgb: CYAN_RGB, p2rgb: RED_RGB };

  const horizon = Y(G6.GROUND_Y);
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const crashed = s.result === 'P2';
  const resultFx = fx.find((f) => f.kind === 'chroma' || f.kind === 'rush');
  const resultAge = resultFx ? now - resultFx.t : Infinity;

  // --- Background (near-black) ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = FIELD;
  ctx.fillRect(0, 0, CW, CH);

  // --- Parallax stars (faint steel dots, scrolled by elapsed) ---
  ctx.save();
  for (const st of geom.STARS) {
    const sx = (st.x - s.elapsed * G6.OBST_SPEED * SC * st.z * 0.18) % CW;
    const x = sx < 0 ? sx + CW : sx;
    ctx.globalAlpha = 0.1 + st.z * 0.22;
    ctx.fillStyle = STEEL;
    ctx.fillRect(x, st.y, st.r, st.r);
  }
  ctx.restore();

  // --- Perspective steel grid below the ground (receding) ---
  ctx.save();
  const vpx = CW / 2;
  ctx.strokeStyle = urgent ? `rgba(${col.p2rgb},0.14)` : 'rgba(35,42,56,0.55)';
  ctx.lineWidth = 1;
  for (let k = -7; k <= 7; k++) {
    ctx.beginPath();
    ctx.moveTo(vpx, horizon);
    ctx.lineTo(vpx + k * 96, CH);
    ctx.stroke();
  }
  const gscroll = (s.elapsed * 0.7) % 1;
  const N = 9;
  for (let j = 0; j < N; j++) {
    const t = (j + gscroll) / N;
    const y = horizon + (CH - horizon) * t * t;
    ctx.globalAlpha = 0.1 + t * 0.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CW, y);
    ctx.stroke();
  }
  ctx.restore();

  // --- Ground line (cyan horizon) + speed dash scroll (cyan, leftward) ---
  ctx.save();
  ctx.strokeStyle = CYAN;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(CW, horizon);
  ctx.stroke();
  ctx.shadowBlur = 4;
  ctx.globalAlpha = 0.65;
  const gap = 60;
  const off = (s.elapsed * G6.OBST_SPEED * SC) % gap;
  ctx.lineWidth = 1;
  for (let x = -off; x < CW; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x, horizon + 8);
    ctx.lineTo(x + 20, horizon + 8);
    ctx.stroke();
  }
  ctx.restore();

  // --- Obstacles (red outline) ---
  for (const o of s.obstacles) {
    if (o.type === 'jump') drawCactus(ctx, X(o.x), horizon, col.p2, col.p2rgb, SC);
    else drawBird(ctx, X(o.x), Y(G6.BIRD_TOP), o.phase, col.p2, col.p2rgb, SC);
  }

  // --- P2 throw flash (derived from spawnAnim, right edge) ---
  if (s.spawnAnim > 0) {
    const a = Math.min(1, s.spawnAnim / G6.SPAWN_ANIM);
    ctx.save();
    ctx.globalAlpha = 0.45 * a;
    const grad = ctx.createLinearGradient(CW, 0, CW - 90, 0);
    grad.addColorStop(0, `rgba(${col.p2rgb},0.9)`);
    grad.addColorStop(1, `rgba(${col.p2rgb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(CW - 90, horizon - 150, 90, 170);
    ctx.restore();
  }

  // --- Raptor (P1) ---
  const dinoBottom = horizon - Y(s.y);
  const blink = crashed && resultAge < RESULT_FX_MS && Math.floor(now / 60) % 2 === 0;
  const showDino = !(crashed && resultAge > RESULT_FX_MS * 0.55);
  if (showDino) {
    drawRaptor(
      ctx,
      X(G6.DINO_X),
      dinoBottom,
      s.ducking && s.grounded,
      s.grounded,
      s.runPhase,
      blink,
      col.p1,
      col.p1rgb,
      SC,
    );
  }
  // Ground shadow (circular)
  if (s.result === null) {
    ctx.save();
    ctx.globalAlpha = s.grounded ? 0.4 : 0.2;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(X(G6.DINO_X + G6.DINO_W / 2), horizon + 3, X(22), 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- Player badge (P1 / YOU) ---
  ctx.save();
  ctx.font = `9px ${FONT}`;
  ctx.fillStyle = col.p1;
  ctx.shadowColor = col.p1;
  ctx.shadowBlur = 6;
  const badgeX = X(G6.DINO_X + G6.DINO_W / 2);
  spacedText(ctx, 'P1', badgeX, dinoBottom - Y(G6.DINO_H) - 8, 3, 'center');
  if (p1IsYou && Math.floor(now / 500) % 2 === 0) {
    ctx.fillStyle = TEXT;
    ctx.shadowColor = col.p1;
    spacedText(ctx, 'YOU', badgeX, dinoBottom - Y(G6.DINO_H) - 21, 3, 'center');
  }
  ctx.restore();

  // --- P2 reload gauge (top-right, corner-cut panel) ---
  {
    const ready = s.cooldown <= 0;
    const ratio = ready ? 1 : 1 - s.cooldown / Math.max(0.0001, s.cooldownMax);
    const gw = 150;
    const gh = 12;
    const gx = CW - 170;
    const gy = 18;
    const notch = 9;
    // Polygon path with 45° notches applied to the top-left / bottom-right corners
    const panel = (): void => {
      ctx.beginPath();
      ctx.moveTo(gx + notch, gy);
      ctx.lineTo(gx + gw, gy);
      ctx.lineTo(gx + gw, gy + gh - notch);
      ctx.lineTo(gx + gw - notch, gy + gh);
      ctx.lineTo(gx, gy + gh);
      ctx.lineTo(gx, gy + notch);
      ctx.closePath();
    };

    ctx.save();
    // Label
    ctx.font = `8px ${FONT}`;
    ctx.fillStyle = TEXT;
    ctx.shadowColor = col.p2;
    ctx.shadowBlur = ready ? 6 : 0;
    spacedText(ctx, p2IsYou ? 'P2(YOU) RELOAD' : 'P2 RELOAD', gx + gw, gy - 5, 2, 'right');
    ctx.shadowBlur = 0;

    // Panel background + fill (clip) + frame
    panel();
    ctx.fillStyle = RAISED;
    ctx.fill();

    ctx.save();
    panel();
    ctx.clip();
    const blinkReady = ready && Math.floor(now / 200) % 2 === 0;
    ctx.fillStyle = col.p2;
    ctx.globalAlpha = ready ? (blinkReady ? 0.95 : 0.7) : 0.85;
    ctx.shadowColor = col.p2;
    ctx.shadowBlur = ready ? 8 : 3;
    ctx.fillRect(gx, gy, gw * ratio, gh);
    ctx.restore();

    // Thin cyan frame
    panel();
    ctx.strokeStyle = `rgba(${CYAN_RGB},0.7)`;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 4;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // --- Effects ---
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'dust' && age < 320) {
      ctx.save();
      ctx.fillStyle = STEEL;
      ctx.globalAlpha = Math.max(0, 0.5 - age / 640);
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 4; i++) {
        const d = 4 + age * 0.06 + i * 3;
        ctx.fillRect(cx - d, cy - (i % 2) * 3, 2.5, 2.5);
      }
      ctx.restore();
    } else if (f.kind === 'shards' && age < 640) {
      ctx.save();
      ctx.strokeStyle = col.p1;
      ctx.shadowColor = col.p1;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = Math.max(0, 1 - age / 640);
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 7; i++) {
        const ang = (Math.PI * 2 * i) / 7 + 0.4;
        const d0 = 6 + age * 0.08;
        const d1 = 12 + age * 0.15;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * d0, cy + Math.sin(ang) * d0);
        ctx.lineTo(cx + Math.cos(ang) * d1, cy + Math.sin(ang) * d1);
        ctx.stroke();
      }
      ctx.restore();
    } else if (f.kind === 'spawn' && age < 260) {
      ctx.save();
      ctx.strokeStyle = col.p2;
      ctx.shadowColor = col.p2;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = Math.max(0, 1 - age / 260);
      const mxv = X(f.x);
      const myv = Y(f.y);
      ctx.beginPath();
      ctx.moveTo(mxv - 10, myv);
      ctx.lineTo(mxv + 10, myv);
      ctx.moveTo(mxv, myv - 10);
      ctx.lineTo(mxv, myv + 10);
      ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'caption' && age < f.life) {
      const on = Math.floor(age / 110) % 2 === 0 || age > 260;
      if (on) {
        ctx.save();
        ctx.font = `12px ${FONT}`;
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 8;
        spacedText(ctx, f.text, Math.min(CW - 60, Math.max(60, X(f.x))), Y(f.y), 2, 'center');
        ctx.restore();
      }
    }
  }

  // --- Survival-win rush (cyan glow on the ground line) ---
  const rush = fx.find((f) => f.kind === 'rush');
  if (rush) {
    const a = Math.min(1, (now - rush.t) / 260);
    ctx.save();
    const grad = ctx.createLinearGradient(0, horizon - 60, 0, horizon);
    grad.addColorStop(0, `rgba(${CYAN_RGB},0)`);
    grad.addColorStop(1, `rgba(${CYAN_RGB},${0.3 * a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizon - 60, CW, 60);
    ctx.restore();
  }

  // --- Subtle vignette ---
  ctx.save();
  const vg = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.3, CW / 2, CH / 2, CH * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, CW, CH);
  ctx.restore();

  // --- Chromatic at crash moment (only at the win/loss instant) ---
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && now - chroma.t < 90) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.28;
    ctx.drawImage(ctx.canvas, -5, 0, CW, CH);
    ctx.globalAlpha = 0.2;
    ctx.drawImage(ctx.canvas, 5, 0, CW, CH);
    ctx.restore();
  }
};
