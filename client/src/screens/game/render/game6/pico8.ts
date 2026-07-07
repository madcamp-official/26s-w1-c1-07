/**
 * Game6 (Dino Run) — PICO-8 8-bit pixel-art theme renderer.
 *
 * Draws the "same elements, same coordinates" as the neon renderer (Game6.tsx), but a completely different concept:
 *  · Everything is a dot sprite made of chunky pixels (small filled rects) — no anti-aliasing/glow.
 *  · The dino, cactus and bird are string bitmaps blitted cell by cell. imageSmoothing off.
 *  · Color follows the "player", not the "role" (functionColors) — swaps identically to neon.
 *
 * Never invent coordinates/sizes/speeds — use only geom.* + the @madpump/shared G6 constants (crossplay fairness).
 */
import { G6, GAME_DURATION } from '@madpump/shared';
import { functionColors } from '../../../../net/online';
import type { Game6DrawScene } from './types';

// ── PICO-8 16-color palette (partial) ───────────────────────────────────────
const PAL = {
  bg: '#1d2b53', // dark indigo (sky/field)
  ground: '#000000', // ground body
  groundAlt: '#422136', // ground dither/speed dash
  blue: '#29adff', // P1 candidate color
  red: '#ff004d', // P2 candidate color
  accent: '#ffa300', // orange accent
  yellow: '#ffec27', // yellow
  text: '#fff1e8', // text (off-white)
  dim: '#5f574f', // shadow/dimming
  dark: '#00000088', // semi-transparent black (shadow)
} as const;

const FONT = "'Press Start 2P', monospace";

/** In-game FX duration between the verdict→result overlay transition (same as neon) */
const RESULT_FX_MS = 700;

// ── Dot sprites (string bitmaps, '#'=fill / ' '=transparent) ─────────────────
// Dino (facing right) — body (shared) + 2 leg frames.
const DINO_BODY: readonly string[] = [
  '        ###',
  '       ####',
  '       # ##', // eye = blank
  '       ####',
  '   ########',
  '  #########',
  ' ##########',
  '###########',
  '   ######  ',
  '   #####   ',
];
const DINO_LEGS_A: readonly string[] = [
  '   ##  ##  ',
  '   #    ## ',
];
const DINO_LEGS_B: readonly string[] = [
  '   ##  ##  ',
  '  ##    #  ',
];
// Ducking dino — low and long (head forward) + 2 leg frames.
const DUCK_BODY: readonly string[] = [
  '         ####',
  '  ###########', // near the eye position
  ' ############',
  '   ##########',
];
const DUCK_LEGS_A: readonly string[] = [
  '    ##   ##  ',
  '    #     #  ',
];
const DUCK_LEGS_B: readonly string[] = [
  '    ##   ##  ',
  '     #   #   ',
];
// Cactus (saguaro).
const CACTUS: readonly string[] = [
  '   #   ',
  '   #   ',
  '#  #   ',
  '#  #  #',
  '#  #  #',
  '####  #',
  '   ####',
  '   #   ',
  '   #   ',
  '   #   ',
  '   #   ',
  '   #   ',
];
// Bird — 2 wing up/down frames (left = travel direction, beak at col0).
const BIRD_UP: readonly string[] = [
  '     ##    ',
  '    ###    ',
  '   ####    ',
  '###########',
  '  #######  ',
  '           ',
  '           ',
];
const BIRD_DOWN: readonly string[] = [
  '           ',
  '           ',
  '###########',
  '  #######  ',
  '   ####    ',
  '    ###    ',
  '     ##    ',
];

/** Draw a sprite bitmap as chunky pixels of cell (cellW×cellH) size, with (ox,oy) as the top-left. */
function blit(
  ctx: CanvasRenderingContext2D,
  map: readonly string[],
  ox: number,
  oy: number,
  cellW: number,
  cellH: number,
  color: string,
): void {
  ctx.fillStyle = color;
  const w = Math.ceil(cellW) + 1;
  const h = Math.ceil(cellH) + 1;
  for (let r = 0; r < map.length; r++) {
    const row = map[r];
    const ry = Math.round(oy + r * cellH);
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== ' ') ctx.fillRect(Math.round(ox + c * cellW), ry, w, h);
    }
  }
}

// ── Scene renderer ───────────────────────────────────────────────────────────
export const drawScene: Game6DrawScene = (ctx, s, fx, now, p1IsYou, p2IsYou, geom) => {
  const { CW, CH, SC, X, Y, STARS } = geom;

  // Color is player-dependent (not role) — P1 entity (dino) = fc.p1 color, P2 entity (obstacle) = fc.p2 color.
  const fc = functionColors();
  const dinoCol = fc.p1 === 'blue' ? PAL.blue : PAL.red;
  const obstCol = fc.p2 === 'blue' ? PAL.blue : PAL.red;

  const horizon = Y(G6.GROUND_Y);
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const crashed = s.result === 'P2';
  const resultFx = fx.find((f) => f.kind === 'chroma' || f.kind === 'rush');
  const resultAge = resultFx ? now - resultFx.t : Infinity;

  ctx.imageSmoothingEnabled = false;

  // ── Sky/field background ──
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, CW, CH);

  // ── Stars (single pixel, parallax scroll by elapsed) ──
  ctx.save();
  for (const st of STARS) {
    const sx = (st.x - s.elapsed * G6.OBST_SPEED * SC * st.z * 0.25) % CW;
    const x = sx < 0 ? sx + CW : sx;
    // Layer brightness/color by z — near stars are yellow, far stars use the text color
    ctx.fillStyle = st.z > 0.35 ? PAL.yellow : PAL.text;
    ctx.globalAlpha = 0.25 + st.z * 0.5;
    const px = st.r > 1.3 ? 3 : 2;
    ctx.fillRect(Math.round(x), Math.round(st.y), px, px);
  }
  ctx.restore();

  // ── Imminent (within 5s): red dither scan overlay (sky region) ──
  if (urgent) {
    ctx.save();
    ctx.fillStyle = PAL.red;
    ctx.globalAlpha = 0.08;
    const cell = Math.round(SC * 4);
    const wob = Math.floor(now / 120) % 2;
    for (let y = 0; y < horizon; y += cell * 2) {
      for (let x = ((Math.floor(y / cell) + wob) % 2) * cell; x < CW; x += cell * 2) {
        ctx.fillRect(x, y, cell, cell);
      }
    }
    ctx.restore();
  }

  // ── Ground: black band + dithered top edge + speed dashes ──
  ctx.save();
  ctx.fillStyle = PAL.ground;
  ctx.fillRect(0, horizon, CW, CH - horizon);
  // Top 1-cell dither checker (boundary emphasis, drifts slightly with scroll)
  const edge = Math.round(SC * 3);
  const eoff = Math.floor((s.elapsed * G6.OBST_SPEED * SC) / edge) % 2;
  ctx.fillStyle = PAL.groundAlt;
  for (let x = 0, i = 0; x < CW; x += edge, i++) {
    if ((i + eoff) % 2 === 0) ctx.fillRect(x, horizon, edge, edge);
  }
  // Speed dashes (flow left for a sense of forward motion) — bright pixel segments inside the ground band
  const gap = Math.round(60 * SC);
  const dashOff = (s.elapsed * G6.OBST_SPEED * SC) % gap;
  const dashW = Math.round(20 * SC);
  const dashH = Math.max(2, Math.round(SC * 2));
  ctx.fillStyle = PAL.dim;
  for (let x = -dashOff; x < CW; x += gap) {
    ctx.fillRect(Math.round(x), horizon + edge * 3, dashW, dashH);
    ctx.fillRect(Math.round(x + gap * 0.5), horizon + edge * 6, Math.round(dashW * 0.6), dashH);
  }
  ctx.restore();

  // ── Obstacles (P2 color) ──
  for (const o of s.obstacles) {
    if (o.type === 'jump') {
      // Cactus — sit its base on the ground
      const left = X(o.x);
      const wPx = G6.CACTUS_W * SC;
      const hPx = G6.CACTUS_H * SC;
      const cols = CACTUS[0].length;
      const rows = CACTUS.length;
      blit(ctx, CACTUS, left, horizon - hPx, wPx / cols, hPx / rows, obstCol);
    } else {
      // Bird — head height + wing flap (phase). Same timing as neon (sin(phase*16)).
      const left = X(o.x);
      const top = Y(G6.BIRD_TOP);
      const wPx = G6.BIRD_W * SC;
      const hPx = G6.BIRD_H * SC;
      const map = Math.sin(o.phase * 16) >= 0 ? BIRD_UP : BIRD_DOWN;
      const cols = map[0].length;
      const rows = map.length;
      blit(ctx, map, left, top, wPx / cols, hPx / rows, obstCol);
    }
  }

  // ── P2 throw flash (spawnAnim) — chunky pixel bar the moment an obstacle bursts in from the right edge ──
  if (s.spawnAnim > 0) {
    const a = Math.min(1, s.spawnAnim / G6.SPAWN_ANIM);
    ctx.save();
    ctx.fillStyle = obstCol;
    const barH = Math.round(SC * 6);
    const cols = 6;
    for (let i = 0; i < cols; i++) {
      ctx.globalAlpha = a * (0.85 - i * 0.13);
      const bx = CW - (i + 1) * Math.round(SC * 12);
      ctx.fillRect(bx, horizon - Math.round(150 * SC), Math.round(SC * 10), Math.round(150 * SC) + barH);
    }
    ctx.restore();
  }

  // ── Dino (P1 color) ──
  const ducking = s.ducking && s.grounded;
  const dinoBottom = horizon - Y(s.y);
  const blink = crashed && resultAge < RESULT_FX_MS && Math.floor(now / 60) % 2 === 0;
  const showDino = !(crashed && resultAge > RESULT_FX_MS * 0.55); // replaced by shards after a crash

  // Shadow (chunky dark pixel bar on the ground — darker when grounded)
  if (s.result === null) {
    ctx.save();
    ctx.fillStyle = PAL.dark;
    ctx.globalAlpha = s.grounded ? 0.5 : 0.25;
    const shW = Math.round(X(28));
    const shX = Math.round(X(G6.DINO_X + G6.DINO_W / 2) - shW / 2);
    ctx.fillRect(shX, horizon + 1, shW, Math.max(2, Math.round(SC * 2)));
    ctx.fillRect(shX + Math.round(SC * 3), horizon + 1 + Math.round(SC * 2), shW - Math.round(SC * 6), Math.max(2, Math.round(SC * 2)));
    ctx.restore();
  }

  if (showDino) {
    ctx.save();
    if (blink) ctx.globalAlpha = 0.4;
    const left = X(G6.DINO_X);
    const wPx = G6.DINO_W * SC;
    if (!ducking) {
      const legStep = Math.floor(s.runPhase * 14) % 2 === 0;
      const map = [...DINO_BODY, ...(legStep ? DINO_LEGS_A : DINO_LEGS_B)];
      const hPx = G6.DINO_H * SC;
      const cols = DINO_BODY[0].length;
      blit(ctx, map, left, dinoBottom - hPx, wPx / cols, hPx / map.length, dinoCol);
    } else {
      const legStep = Math.floor(s.runPhase * 16) % 2 === 0;
      const map = [...DUCK_BODY, ...(legStep ? DUCK_LEGS_A : DUCK_LEGS_B)];
      const hPx = G6.DINO_DUCK_H * SC;
      const cols = DUCK_BODY[0].length;
      blit(ctx, map, left, dinoBottom - hPx, wPx / cols, hPx / map.length, dinoCol);
    }
    ctx.restore();
  }

  // ── Player badge 'P1' + 'YOU' (blinks if p1IsYou) ──
  ctx.save();
  ctx.font = `10px ${FONT}`;
  ctx.textAlign = 'center';
  const badgeX = X(G6.DINO_X + G6.DINO_W / 2);
  ctx.fillStyle = dinoCol;
  ctx.fillText('P1', badgeX, dinoBottom - Y(G6.DINO_H) - 8);
  if (p1IsYou && Math.floor(now / 500) % 2 === 0) {
    ctx.fillStyle = PAL.yellow;
    ctx.fillText('YOU', badgeX, dinoBottom - Y(G6.DINO_H) - 22);
  }
  ctx.restore();

  // ── P2 reload gauge (top-right) — segmented pixel blocks ──
  {
    const ready = s.cooldown <= 0;
    const ratio = ready ? 1 : 1 - s.cooldown / Math.max(0.0001, s.cooldownMax);
    const gw = 150;
    const gh = 12;
    const gx = CW - gw - 20;
    const gy = 18;
    ctx.save();
    ctx.font = `9px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = obstCol;
    ctx.fillText(p2IsYou ? 'P2(YOU) RELOAD' : 'P2 RELOAD', gx + gw, gy - 6);
    // Pixel border (1px frame)
    ctx.fillStyle = PAL.dim;
    ctx.fillRect(gx - 2, gy - 2, gw + 4, 2);
    ctx.fillRect(gx - 2, gy + gh, gw + 4, 2);
    ctx.fillRect(gx - 2, gy, 2, gh);
    ctx.fillRect(gx + gw, gy, 2, gh);
    // Track (dark background)
    ctx.fillStyle = PAL.ground;
    ctx.fillRect(gx, gy, gw, gh);
    // Segment fill
    const segN = 10;
    const segGap = 2;
    const segW = (gw - segGap * (segN - 1)) / segN;
    const filled = ratio * segN;
    const blinkReady = ready && Math.floor(now / 200) % 2 === 0;
    for (let i = 0; i < segN; i++) {
      if (i + 1 <= filled + 0.001) {
        if (ready) ctx.fillStyle = blinkReady ? PAL.yellow : obstCol;
        else ctx.fillStyle = i > segN - 3 ? PAL.accent : obstCol;
        ctx.fillRect(Math.round(gx + i * (segW + segGap)), gy, Math.ceil(segW), gh);
      }
    }
    ctx.restore();
  }

  // ── Effects (pixel burst) ──
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'dust' && age < 320) {
      ctx.save();
      ctx.fillStyle = PAL.dim;
      ctx.globalAlpha = Math.max(0, 0.6 - age / 500);
      const cx = X(f.x);
      const cy = Y(f.y);
      const pxs = Math.max(2, Math.round(SC * 3));
      for (let i = 0; i < 5; i++) {
        const d = 4 + age * 0.06 + i * 4;
        ctx.fillRect(Math.round(cx - d), Math.round(cy - (i % 2) * 4), pxs, pxs);
      }
      ctx.restore();
    } else if (f.kind === 'shards' && age < 640) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 640);
      const cx = X(f.x);
      const cy = Y(f.y);
      const pxs = Math.max(3, Math.round(SC * 4));
      for (let i = 0; i < 8; i++) {
        const ang = (Math.PI * 2 * i) / 8 + 0.4;
        const dist = 8 + age * 0.14;
        ctx.fillStyle = i % 3 === 0 ? PAL.yellow : i % 3 === 1 ? PAL.accent : dinoCol;
        ctx.fillRect(
          Math.round(cx + Math.cos(ang) * dist),
          Math.round(cy + Math.sin(ang) * dist),
          pxs,
          pxs,
        );
      }
      ctx.restore();
    } else if (f.kind === 'spawn' && age < 260) {
      ctx.save();
      ctx.fillStyle = obstCol;
      ctx.globalAlpha = Math.max(0, 1 - age / 260);
      const mx = Math.round(X(f.x));
      const my = Math.round(Y(f.y));
      const pxs = Math.max(2, Math.round(SC * 3));
      const arm = Math.round(8 + age * 0.05);
      // Cross-shaped pixel burst
      ctx.fillRect(mx - arm, my, arm * 2, pxs);
      ctx.fillRect(mx, my - arm, pxs, arm * 2);
      ctx.restore();
    } else if (f.kind === 'caption' && age < f.life) {
      const on = Math.floor(age / 110) % 2 === 0 || age > 260; // hold after blinking
      if (on) {
        ctx.save();
        ctx.font = `13px ${FONT}`;
        ctx.textAlign = 'center';
        const tx = Math.min(CW - 60, Math.max(60, X(f.x)));
        const ty = Y(f.y);
        // Dotty hard shadow (1px offset)
        ctx.fillStyle = PAL.ground;
        ctx.fillText(f.text, tx + 2, ty + 2);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, tx, ty);
        ctx.restore();
      }
    }
  }

  // ── Survival-win rush (a P1-color pixel band fills up over the ground) ──
  const rush = fx.find((f) => f.kind === 'rush');
  if (rush) {
    const a = Math.min(1, (now - rush.t) / 260);
    ctx.save();
    ctx.fillStyle = dinoCol;
    const bandH = Math.round(60 * SC * a);
    const cell = Math.round(SC * 4);
    // Dither band that thins out toward the top
    for (let y = horizon - bandH; y < horizon; y += cell) {
      const t = (y - (horizon - bandH)) / Math.max(1, bandH);
      ctx.globalAlpha = 0.2 + t * 0.5;
      for (let x = (Math.floor(y / cell) % 2) * cell; x < CW; x += cell * 2) {
        ctx.fillRect(x, y, cell, cell);
      }
    }
    ctx.restore();
  }

  // ── Crash moment: pixel RGB-split glitch (part of the win/loss frame family) ──
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && now - chroma.t < 90) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const off = Math.round(SC * 5);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(ctx.canvas, -off, 0, CW, CH);
    ctx.globalAlpha = 0.28;
    ctx.drawImage(ctx.canvas, off, 0, CW, CH);
    ctx.restore();
  }
};
