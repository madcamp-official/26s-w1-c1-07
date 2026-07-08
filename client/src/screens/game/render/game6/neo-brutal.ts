/**
 * Game6 (Dino Run) — NEO-BRUTALISM theme renderer.
 *
 * Design: FLAT BOLD shapes on a cream field + 3px pure-black outline + hard (blur 0) drop shadow.
 *  Each sprite first lays down a +5,+5 offset black silhouette, then a color shape + 3px ink stroke on top.
 *  Never uses glow (shadowBlur). Danger/imminent = 45° yellow/black hazard stripe band.
 *
 * Never invents geometry/judgment — uses only geom.* + @madcade/shared G6 constants (crossplay invariant).
 * Color follows the "player", not the "role" → functionColors() decides the P1/P2 entity colors.
 */
import { G6, GAME_DURATION } from '@madcade/shared';
import { functionColors } from '@/net/online';
import type { Game6DrawScene, Fx, Geom } from './types';

// ── Palette ───────────────────────────────────────────────────────────────
const INK = '#0a0a0a';
const CREAM = '#fdf6e3';
const BLUE = '#2b5bff';
const PINK = '#ff2e88';
const ORANGE = '#ff5c00';
const YELLOW = '#ffd600';
const WHITE = '#ffffff';
const FONT = "'Space Mono', monospace";

/** Hard shadow offset (px) — blur 0, pure black */
const SO = 5;
/** In-game FX duration between judgment lock-in and the result overlay transition (same as neon) */
const RESULT_FX_MS = 700;

type Pt = readonly [number, number];

/** Draws a local-coordinate polygon (mapped via mx/my) with hard shadow + color + ink outline */
function poly(
  ctx: CanvasRenderingContext2D,
  pts: readonly Pt[],
  mx: (x: number) => number,
  my: (y: number) => number,
  fill: string,
  alpha: number,
): void {
  const path = () => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(mx(x), my(y)) : ctx.moveTo(mx(x), my(y))));
    ctx.closePath();
  };
  ctx.save();
  ctx.globalAlpha = alpha;
  // Hard shadow (black, +SO)
  ctx.save();
  ctx.translate(SO, SO);
  path();
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.restore();
  // Color + 3px ink stroke
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineJoin = 'miter';
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

/** Local-coordinate rectangle (hard shadow + color + ink outline) */
function box(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mx: (x: number) => number,
  my: (y: number) => number,
  fill: string,
  alpha: number,
): void {
  poly(
    ctx,
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
    mx,
    my,
    fill,
    alpha,
  );
}

/** 45° yellow/black hazard stripe band (danger/imminent indicator) */
function hazardBand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  shift: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = YELLOW;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = INK;
  const sw = 16; // black stripe width
  const period = sw * 2;
  const s = ((shift % period) + period) % period;
  for (let i = -h - period; i < w + h + period; i += period) {
    const ox = i - s;
    ctx.beginPath();
    ctx.moveTo(x + ox, y + h);
    ctx.lineTo(x + ox + h, y);
    ctx.lineTo(x + ox + h + sw, y);
    ctx.lineTo(x + ox + sw, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  ctx.restore();
}

/** Dino (P1) — bold flat silhouette. leftPx=box left, bottomPx=box bottom (ground-y) */
function drawDino(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  bottomPx: number,
  ducking: boolean,
  grounded: boolean,
  runPhase: number,
  blink: boolean,
  color: string,
  SC: number,
): void {
  const boxH = ducking ? G6.DINO_DUCK_H : G6.DINO_H;
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => bottomPx - (boxH - y) * SC; // y:0=top .. boxH=bottom(ground)
  const a = blink ? 0.35 : 1;

  if (!ducking) {
    // Legs (running alternation) — behind the body first
    const step = Math.floor(runPhase * 14) % 2 === 0;
    const frontH = grounded ? (step ? 10 : 4) : 5;
    const backH = grounded ? (step ? 4 : 10) : 5;
    box(ctx, 13, 40, 18, 40 + backH, mx, my, color, a);
    box(ctx, 21, 40, 26, 40 + frontH, mx, my, color, a);
    // Body silhouette (facing right)
    poly(
      ctx,
      [
        [4, 32],
        [12, 24],
        [12, 14],
        [19, 14],
        [19, 4],
        [40, 4],
        [41, 16],
        [30, 16],
        [30, 21],
        [27, 21],
        [27, 40],
        [13, 40],
        [13, 32],
      ],
      mx,
      my,
      color,
      a,
    );
    // Eye (white base + ink dot)
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.arc(mx(34), my(9), 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(mx(34.5), my(9), 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    const step = Math.floor(runPhase * 16) % 2 === 0;
    const frontH = step ? 8 : 4;
    const backH = step ? 4 : 8;
    box(ctx, 12, 20, 16.5, 20 + backH, mx, my, color, a);
    box(ctx, 23, 20, 27.5, 20 + frontH, mx, my, color, a);
    poly(
      ctx,
      [
        [0, 12],
        [10, 6],
        [22, 3],
        [44, 3],
        [44, 11],
        [33, 13],
        [14, 15],
        [8, 20],
        [2, 20],
      ],
      mx,
      my,
      color,
      a,
    );
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.arc(mx(39), my(7), 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(mx(39.4), my(7), 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Cactus (P2 jump obstacle) — bold flat. Bottom pinned to the ground */
function drawCactus(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  groundPx: number,
  color: string,
  SC: number,
): void {
  const H = G6.CACTUS_H;
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => groundPx - (H - y) * SC;
  // Arms first (so they overlap behind the body), then the body
  box(ctx, 2, 18, 8, 31, mx, my, color, 1); // left arm vertical
  box(ctx, 6, 24, 12, 30, mx, my, color, 1); // left arm connector
  box(ctx, 19, 12, 25, 27, mx, my, color, 1); // right arm vertical
  box(ctx, 15, 20, 21, 26, mx, my, color, 1); // right arm connector
  box(ctx, 9, 4, 18, 46, mx, my, color, 1); // body
}

/** Bird (P2 duck obstacle) — bold flat + wing flap (phase). Beak points left (travel direction) */
function drawBird(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  topPx: number,
  phase: number,
  color: string,
  SC: number,
): void {
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => topPx + y * SC; // relative to box top (0..28)
  // Wings (flap up/down) — behind the body
  const flap = Math.sin(phase * 16);
  poly(
    ctx,
    [
      [15, 12],
      [30, 12],
      [22, 12 - 10 * flap],
    ],
    mx,
    my,
    color,
    1,
  );
  // Body
  poly(
    ctx,
    [
      [2, 14],
      [10, 9],
      [24, 8],
      [34, 10],
      [38, 15],
      [28, 19],
      [12, 19],
      [7, 16],
    ],
    mx,
    my,
    color,
    1,
  );
  // Eye
  ctx.save();
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.arc(mx(12), my(12), 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(mx(11.4), my(12), 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Ink-outline text (hard shadow) — shared by labels/captions */
function inkText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  shadow = INK,
): void {
  ctx.fillStyle = shadow;
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

// ───────────────────────────────────────────────────────────────────────────
export const drawScene: Game6DrawScene = (
  ctx: CanvasRenderingContext2D,
  s,
  fx: readonly Fx[],
  now,
  p1IsYou,
  p2IsYou,
  geom: Geom,
) => {
  const { CW, CH, SC, X, Y } = geom;

  // Color is player-dependent — dino (P1 entity)=fc.p1 color, obstacle (P2 entity)=fc.p2 color.
  const fc = functionColors();
  const P1C = fc.p1 === 'blue' ? BLUE : PINK;
  const P2C = fc.p2 === 'blue' ? BLUE : PINK;

  const horizon = Y(G6.GROUND_Y);
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const crashed = s.result === 'P2';
  const scroll = s.elapsed * G6.OBST_SPEED * SC;

  const resultFx = fx.find((f) => f.kind === 'chroma' || f.kind === 'rush');
  const resultAge = resultFx ? now - resultFx.t : Infinity;

  // ── Sky field (flat cream) ──
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, CW, CH);

  // ── Poster sun (bold yellow circle + ink outline + hard shadow) ──
  ctx.save();
  const sunX = CW * 0.16;
  const sunY = CH * 0.22;
  const sunR = 34;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(sunX + SO, sunY + SO, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();

  // ── Bold ink dots (parallax scroll) ──
  ctx.save();
  ctx.fillStyle = INK;
  for (let i = 0; i < geom.STARS.length; i += 6) {
    const st = geom.STARS[i];
    const sx = (st.x - scroll * st.z * 0.18) % CW;
    const x = sx < 0 ? sx + CW : sx;
    ctx.beginPath();
    ctx.arc(x, st.y * 0.6 + 30, 3 + st.z * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ── Ground: thick ink line + scrolling speed texture (dashes) ──
  ctx.save();
  // Ground band (partitioned with a slightly darker cream tone)
  ctx.fillStyle = '#efe6c9';
  ctx.fillRect(0, horizon, CW, CH - horizon);
  // Thick ink ground line
  ctx.fillStyle = INK;
  ctx.fillRect(0, horizon - 3, CW, 6);
  // Speed dashes (flowing left)
  const gap = 56;
  const off = scroll % gap;
  for (let x = -off; x < CW; x += gap) {
    ctx.fillRect(x, horizon + 16, 26, 5);
  }
  ctx.restore();

  // ── Imminent (≤5s): 45° hazard stripe band (just below the ground line) ──
  if (urgent) {
    hazardBand(ctx, 0, horizon + 30, CW, 22, scroll);
  }

  // ── Obstacles (P2 color) ──
  for (const o of s.obstacles) {
    if (o.type === 'jump') drawCactus(ctx, X(o.x), horizon, P2C, SC);
    else drawBird(ctx, X(o.x), Y(G6.BIRD_TOP), o.phase, P2C, SC);
  }

  // ── P2 throw flash (derived from spawnAnim) — bold orange wedge at the right edge ──
  if (s.spawnAnim > 0) {
    const p = Math.min(1, s.spawnAnim / G6.SPAWN_ANIM);
    ctx.save();
    ctx.globalAlpha = p;
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.moveTo(CW, horizon - 150);
    ctx.lineTo(CW, horizon + 20);
    ctx.lineTo(CW - 70 * p, horizon - 65);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }

  // ── Dino (P1 color) ──
  const dinoBottom = horizon - Y(s.y);
  const blink = crashed && resultAge < RESULT_FX_MS && Math.floor(now / 60) % 2 === 0;
  const showDino = !(crashed && resultAge > RESULT_FX_MS * 0.55); // replaced by shards after crash

  // Dino shadow (ground ellipse — flat ink)
  if (s.result === null) {
    ctx.save();
    ctx.globalAlpha = s.grounded ? 0.9 : 0.4;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(X(G6.DINO_X + G6.DINO_W / 2), horizon + 10, X(22), 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (showDino) {
    drawDino(
      ctx,
      X(G6.DINO_X),
      dinoBottom,
      s.ducking && s.grounded,
      s.grounded,
      s.runPhase,
      blink,
      P1C,
      SC,
    );
  }

  // ── Player badge (P1 / YOU) ──
  ctx.save();
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'center';
  const badgeX = X(G6.DINO_X + G6.DINO_W / 2);
  inkText(ctx, 'P1', badgeX, dinoBottom - Y(G6.DINO_H) - 10, P1C);
  if (p1IsYou && Math.floor(now / 500) % 2 === 0) {
    ctx.font = `bold 12px ${FONT}`;
    inkText(ctx, 'YOU', badgeX, dinoBottom - Y(G6.DINO_H) - 28, ORANGE);
  }
  ctx.restore();

  // ── P2 reload gauge (top-right) — white box + 3px ink border + hard shadow, orange fill ──
  {
    const ready = s.cooldown <= 0;
    const ratio = ready ? 1 : 1 - s.cooldown / Math.max(0.0001, s.cooldownMax);
    const gw = 150;
    const gh = 12;
    const gx = CW - gw - 20;
    const gy = 18;
    ctx.save();
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'right';
    inkText(ctx, p2IsYou ? 'P2(YOU) RELOAD' : 'P2 RELOAD', gx + gw, gy - 6, P2C);
    // Hard shadow
    ctx.fillStyle = INK;
    ctx.fillRect(gx + SO, gy + SO, gw, gh);
    // White track box
    ctx.fillStyle = WHITE;
    ctx.fillRect(gx, gy, gw, gh);
    // Orange fill
    ctx.fillStyle = ORANGE;
    ctx.fillRect(gx, gy, gw * ratio, gh);
    // 3px ink border
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.strokeRect(gx + 1.5, gy + 1.5, gw - 3, gh - 3);
    // Ready = yellow 'READY' tag (blinking)
    if (ready && Math.floor(now / 220) % 2 === 0) {
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'left';
      inkText(ctx, '● READY', gx, gy + gh + 13, YELLOW);
    }
    ctx.restore();
  }

  // ── Effects ──
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'dust' && age < 320) {
      // Bold ink dust bits
      ctx.save();
      ctx.globalAlpha = Math.max(0, 0.8 - age / 400);
      ctx.fillStyle = INK;
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 5; i++) {
        const d = 4 + age * 0.07 + i * 4;
        const sz = 5 - i * 0.6;
        ctx.fillRect(cx - d, cy - (i % 2) * 5 - 2, sz, sz);
      }
      ctx.restore();
    } else if (f.kind === 'shards' && age < 640) {
      // Crash shards — color squares + ink outline flying in all directions
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 640);
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 8; i++) {
        const ang = (Math.PI * 2 * i) / 8 + 0.3;
        const dist = 8 + age * 0.14;
        const px = cx + Math.cos(ang) * dist;
        const py = cy + Math.sin(ang) * dist;
        ctx.fillStyle = INK;
        ctx.fillRect(px - 4 + 2, py - 4 + 2, 9, 9);
        ctx.fillStyle = i % 2 === 0 ? P1C : YELLOW;
        ctx.fillRect(px - 4, py - 4, 9, 9);
        ctx.lineWidth = 2;
        ctx.strokeStyle = INK;
        ctx.strokeRect(px - 4, py - 4, 9, 9);
      }
      ctx.restore();
    } else if (f.kind === 'spawn' && age < 260) {
      // Bold orange diamond impact
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 260);
      const cx = X(f.x);
      const cy = Y(f.y);
      const r = 8 + age * 0.05;
      const dia = () => {
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r, cy);
        ctx.closePath();
      };
      ctx.translate(SO * 0.6, SO * 0.6);
      dia();
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.translate(-SO * 0.6, -SO * 0.6);
      dia();
      ctx.fillStyle = ORANGE;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'caption' && age < f.life) {
      // Bold caption — white plate + ink border + hard shadow + color text
      const on = Math.floor(age / 110) % 2 === 0 || age > 260;
      if (on) {
        ctx.save();
        ctx.font = `bold 18px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tx = Math.min(CW - 70, Math.max(70, X(f.x)));
        const ty = Y(f.y);
        const tw = ctx.measureText(f.text).width;
        const pw = tw + 18;
        const ph = 26;
        ctx.fillStyle = INK;
        ctx.fillRect(tx - pw / 2 + SO, ty - ph / 2 + SO, pw, ph);
        ctx.fillStyle = WHITE;
        ctx.fillRect(tx - pw / 2, ty - ph / 2, pw, ph);
        ctx.lineWidth = 3;
        ctx.strokeStyle = INK;
        ctx.strokeRect(tx - pw / 2 + 1.5, ty - ph / 2 + 1.5, pw - 3, ph - 3);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, tx, ty + 1);
        ctx.restore();
      }
    }
  }

  // ── Survival-win rush — bold P1-color band above the ground (ink border) ──
  const rush = fx.find((f) => f.kind === 'rush');
  if (rush) {
    const p = Math.min(1, (now - rush.t) / 260);
    const bh = 54 * p;
    ctx.save();
    ctx.fillStyle = INK;
    ctx.fillRect(0, horizon - bh + SO, CW, bh);
    ctx.fillStyle = P1C;
    ctx.fillRect(0, horizon - bh, CW, bh);
    ctx.restore();
  }

  // ── Hard-offset double vision at crash moment (brief) ──
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && now - chroma.t < 90) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(ctx.canvas, -6, 0, CW, CH);
    ctx.globalAlpha = 0.28;
    ctx.drawImage(ctx.canvas, 6, 0, CW, CH);
    ctx.restore();
  }
};
