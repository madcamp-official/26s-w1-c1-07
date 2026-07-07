/**
 * Game6(공룡 달리기) — NEO-BRUTALISM 테마 렌더러.
 *
 * 디자인: 크림 필드 위에 FLAT BOLD 도형 + 3px 순수 검정 아웃라인 + 하드(블러 0) 드롭섀도.
 *  각 스프라이트는 "먼저 +5,+5 오프셋 검정 실루엣을 깔고 → 그 위에 컬러 도형 + 3px 잉크 스트로크".
 *  glow(shadowBlur) 절대 사용 안 함. 위험/임박은 45° 옐로/블랙 해저드 스트라이프 밴드.
 *
 * 기하/판정은 절대 만들지 않는다 — geom.* + @madpump/shared G6 상수만 사용(크로스플레이 불변).
 * 색은 '역할'이 아니라 '플레이어'를 따른다 → functionColors()로 P1/P2 엔티티 색을 정한다.
 */
import { G6, GAME_DURATION } from '@madpump/shared';
import { functionColors } from '@/net/online';
import type { Game6DrawScene, Fx, Geom } from './types';

// ── 팔레트 ───────────────────────────────────────────────────────────────
const INK = '#0a0a0a';
const CREAM = '#fdf6e3';
const BLUE = '#2b5bff';
const PINK = '#ff2e88';
const ORANGE = '#ff5c00';
const YELLOW = '#ffd600';
const WHITE = '#ffffff';
const FONT = "'Space Mono', monospace";

/** 하드 섀도 오프셋(px) — 블러 0, 순수 검정 */
const SO = 5;
/** 판정 확정 → 결과 오버레이 전환 사이 인게임 연출 시간(neon과 동일) */
const RESULT_FX_MS = 700;

type Pt = readonly [number, number];

/** 로컬 좌표(mx/my로 매핑) 폴리곤을 하드섀도 + 컬러 + 잉크 아웃라인으로 그린다 */
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
  // 하드 섀도(검정, +SO)
  ctx.save();
  ctx.translate(SO, SO);
  path();
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.restore();
  // 컬러 + 3px 잉크 스트로크
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineJoin = 'miter';
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

/** 로컬 좌표 사각형(하드섀도 + 컬러 + 잉크 아웃라인) */
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

/** 45° 옐로/블랙 해저드 스트라이프 밴드(위험/임박 표시) */
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
  const sw = 16; // 검정 스트라이프 폭
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

/** 공룡(P1) — 볼드 플랫 실루엣. leftPx=박스 좌측, bottomPx=박스 하단(지면-y) */
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
    // 다리(달리기 교대) — 몸통 뒤에 먼저
    const step = Math.floor(runPhase * 14) % 2 === 0;
    const frontH = grounded ? (step ? 10 : 4) : 5;
    const backH = grounded ? (step ? 4 : 10) : 5;
    box(ctx, 13, 40, 18, 40 + backH, mx, my, color, a);
    box(ctx, 21, 40, 26, 40 + frontH, mx, my, color, a);
    // 몸통 실루엣(오른쪽을 봄)
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
    // 눈(흰 바탕 + 잉크 점)
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

/** 선인장(P2 점프 장애물) — 볼드 플랫. 지면에 바닥을 붙임 */
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
  // 팔 먼저(몸통 뒤로 겹치도록), 그다음 몸통
  box(ctx, 2, 18, 8, 31, mx, my, color, 1); // 왼팔 세로
  box(ctx, 6, 24, 12, 30, mx, my, color, 1); // 왼팔 연결
  box(ctx, 19, 12, 25, 27, mx, my, color, 1); // 오른팔 세로
  box(ctx, 15, 20, 21, 26, mx, my, color, 1); // 오른팔 연결
  box(ctx, 9, 4, 18, 46, mx, my, color, 1); // 몸통
}

/** 새(P2 숙이기 장애물) — 볼드 플랫 + 날갯짓(phase). 부리는 왼쪽(진행 방향) */
function drawBird(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  topPx: number,
  phase: number,
  color: string,
  SC: number,
): void {
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => topPx + y * SC; // 박스 상단 기준 (0..28)
  // 날개(위/아래로 퍼덕) — 몸통 뒤
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
  // 몸통
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
  // 눈
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

/** 잉크 아웃라인 텍스트(하드 섀도) — 라벨/캡션 공용 */
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

  // 색은 플레이어 종속 — dino(P1엔티티)=fc.p1색, 장애물(P2엔티티)=fc.p2색.
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

  // ── 하늘 필드(플랫 크림) ──
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, CW, CH);

  // ── 포스터 태양(볼드 옐로 원 + 잉크 아웃라인 + 하드섀도) ──
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

  // ── 볼드 잉크 점(패럴랙스 스크롤) ──
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

  // ── 지면: 두꺼운 잉크 라인 + 스크롤 스피드 텍스처(대시) ──
  ctx.save();
  // 지면 밴드(살짝 어두운 크림톤으로 구획)
  ctx.fillStyle = '#efe6c9';
  ctx.fillRect(0, horizon, CW, CH - horizon);
  // 두꺼운 잉크 지면선
  ctx.fillStyle = INK;
  ctx.fillRect(0, horizon - 3, CW, 6);
  // 스피드 대시(왼쪽으로 흐름)
  const gap = 56;
  const off = scroll % gap;
  for (let x = -off; x < CW; x += gap) {
    ctx.fillRect(x, horizon + 16, 26, 5);
  }
  ctx.restore();

  // ── 임박(≤5s): 45° 해저드 스트라이프 밴드(지면선 바로 아래) ──
  if (urgent) {
    hazardBand(ctx, 0, horizon + 30, CW, 22, scroll);
  }

  // ── 장애물(P2 색) ──
  for (const o of s.obstacles) {
    if (o.type === 'jump') drawCactus(ctx, X(o.x), horizon, P2C, SC);
    else drawBird(ctx, X(o.x), Y(G6.BIRD_TOP), o.phase, P2C, SC);
  }

  // ── P2 투척 섬광(spawnAnim 파생) — 오른쪽 끝 볼드 오렌지 웨지 ──
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

  // ── 공룡(P1 색) ──
  const dinoBottom = horizon - Y(s.y);
  const blink = crashed && resultAge < RESULT_FX_MS && Math.floor(now / 60) % 2 === 0;
  const showDino = !(crashed && resultAge > RESULT_FX_MS * 0.55); // 충돌 후 파편으로 대체

  // 공룡 그림자(지면 타원 — 플랫 잉크)
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

  // ── 플레이어 배지(P1 / YOU) ──
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

  // ── P2 리로드 게이지(우상단) — 흰 박스 + 3px 잉크 테두리 + 하드섀도, 오렌지 채움 ──
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
    // 하드 섀도
    ctx.fillStyle = INK;
    ctx.fillRect(gx + SO, gy + SO, gw, gh);
    // 흰 트랙 박스
    ctx.fillStyle = WHITE;
    ctx.fillRect(gx, gy, gw, gh);
    // 오렌지 채움
    ctx.fillStyle = ORANGE;
    ctx.fillRect(gx, gy, gw * ratio, gh);
    // 3px 잉크 테두리
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.strokeRect(gx + 1.5, gy + 1.5, gw - 3, gh - 3);
    // 준비 완료 = 옐로 'READY' 태그(점멸)
    if (ready && Math.floor(now / 220) % 2 === 0) {
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'left';
      inkText(ctx, '● READY', gx, gy + gh + 13, YELLOW);
    }
    ctx.restore();
  }

  // ── 이펙트 ──
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'dust' && age < 320) {
      // 볼드 잉크 먼지 조각
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
      // 충돌 파편 — 컬러 사각 + 잉크 아웃라인이 사방으로
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
      // 볼드 오렌지 다이아몬드 임팩트
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
      // 볼드 캡션 — 흰 플레이트 + 잉크 테두리 + 하드섀도 + 컬러 텍스트
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

  // ── 생존 승리 러쉬 — 지면 위 볼드 P1 색 밴드(잉크 테두리) ──
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

  // ── 충돌 순간 하드 오프셋 더블비전(짧게) ──
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
