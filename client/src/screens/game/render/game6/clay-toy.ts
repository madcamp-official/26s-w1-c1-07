/**
 * Game6(공룡 달리기) — 테마: CLAY / SOFT TOY.
 * 씬 전체를 clay-toy 컨셉으로 처음부터 그린다(neon과 동일 요소·좌표, 아트만 교체).
 * 부드러운 몰딩 점토 인형 — 둥글둥글한 블롭, 말랑한 그림자 + 위쪽 하이라이트로 볼륨감.
 * 좌표/크기/속도는 절대 만들지 않는다 → geom.* + @madpump/shared G6 상수만 사용.
 */
import { G6, GAME_DURATION } from '@madpump/shared';
import { functionColors } from '../../../../net/online';
import type { Game6DrawScene } from './types';

// ── 팔레트 (아트 디렉션 고정) ──────────────────────────────────────────────
const FIELD = '#fff1e6'; // 피치 필드
const PANEL = '#f5e9de'; // 패널(지면)
const PANEL_EDGE = '#ecdccb'; // 지면 위 립(약간 진한 크림)
const INK = '#4a3a52'; // 잉크 플럼(텍스트/눈/그림자)
const CORAL = '#ff8a5c'; // 액센트 코랄
const BUTTER = '#ffd447'; // 버터
const CLOUD = '#fffaf4'; // 배경 구름

const SHADOW = 'rgba(74,58,82,0.24)'; // 말랑한 저채도 플럼 그림자
const FONT = "'Baloo 2', sans-serif";

/** 점토 색 3단(base/그늘/하이라이트) */
type Clay = { base: string; dark: string; light: string };
const PINK: Clay = { base: '#ff6e8a', dark: '#e0526f', light: '#ffb0c0' }; // 딸기핑크(P1)
const MINT: Clay = { base: '#3fc49e', dark: '#2ba183', light: '#8fe3cd' }; // 민트그린(P2)

/** 판정→결과 오버레이 사이 인게임 연출 시간(neon과 동일) */
const RESULT_FX_MS = 700;

// ── 저수준 그리기 헬퍼 ────────────────────────────────────────────────────
function pathRR(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function softShadow(ctx: CanvasRenderingContext2D, blur = 8, dy = 4): void {
  ctx.shadowColor = SHADOW;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = dy;
}
function noShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** 말랑한 점토 알약: 그림자 fill + 위쪽 밝은 하이라이트 */
function clayPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  c: Clay,
  shadow = true,
): void {
  ctx.save();
  if (shadow) softShadow(ctx);
  ctx.fillStyle = c.base;
  pathRR(ctx, x, y, w, h, r);
  ctx.fill();
  noShadow(ctx);
  // 위쪽 하이라이트(퍼피 볼륨)
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = c.light;
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.3, w * 0.34, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 말랑한 점토 원(공/머리 등) */
function clayBall(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: Clay,
  shadow = true,
): void {
  ctx.save();
  if (shadow) softShadow(ctx);
  ctx.fillStyle = c.base;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  noShadow(ctx);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = c.light;
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.18, cy - ry * 0.34, rx * 0.55, ry * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 단색 소프트 원 puff (이펙트용) */
function puff(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── 스프라이트 ────────────────────────────────────────────────────────────
/** 통통한 플러시 공룡(P1). leftPx=박스 좌측, bottomPx=박스 하단 */
function drawDino(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  bottomPx: number,
  SC: number,
  ducking: boolean,
  grounded: boolean,
  runPhase: number,
  blink: boolean,
  c: Clay,
): void {
  const boxH = ducking ? G6.DINO_DUCK_H : G6.DINO_H;
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => bottomPx - (boxH - y) * SC; // y:0=top..boxH=bottom
  const legC: Clay = { base: c.dark, dark: c.dark, light: c.base };

  ctx.save();
  if (blink) ctx.globalAlpha = 0.45;

  if (!ducking) {
    // 다리(뒤 → 앞) — runPhase로 교대, 공중이면 짧게 접음
    const step = Math.floor(runPhase * 14) % 2 === 0;
    const frontH = grounded ? (step ? 12 : 6) : 6;
    const backH = grounded ? (step ? 6 : 12) : 6;
    const legW = 10 * SC;
    // back leg
    clayPill(ctx, mx(11), my(40), legW, backH * SC, 5 * SC, legC);
    // front leg
    clayPill(ctx, mx(25), my(40), legW, frontH * SC, 5 * SC, legC);
    // 꼬리(왼쪽 볼록)
    clayBall(ctx, mx(5), my(26), 8 * SC, 7 * SC, c);
    // 몸통(둥근 알약)
    clayPill(ctx, mx(6), my(12), 30 * SC, 30 * SC, 13 * SC, c);
    // 등 위 코랄 뿔 3개
    ctx.save();
    ctx.fillStyle = CORAL;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(mx(14 + i * 7), my(13), 3.2 * SC, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // 머리(오른쪽 위)
    clayBall(ctx, mx(32), my(15), 11 * SC, 11 * SC, c);
    // 작은 팔
    clayPill(ctx, mx(26), my(26), 8 * SC, 5 * SC, 2.5 * SC, legC);
    // 눈(잉크 점 + 흰 반짝)
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(mx(36), my(12), 2 * SC, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(mx(36.6), my(11.4), 0.7 * SC, 0, Math.PI * 2);
    ctx.fill();
    // 볼터치
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = c.light;
    ctx.beginPath();
    ctx.arc(mx(30), my(18), 2.4 * SC, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // 숙인 자세 — 낮고 길게
    const step = Math.floor(runPhase * 16) % 2 === 0;
    const frontH = step ? 6 : 3;
    const backH = step ? 3 : 6;
    const legW = 9 * SC;
    clayPill(ctx, mx(12), my(22), legW, backH * SC, 4 * SC, legC);
    clayPill(ctx, mx(24), my(22), legW, frontH * SC, 4 * SC, legC);
    // 몸통(길쭉한 알약)
    clayPill(ctx, mx(2), my(6), 38 * SC, 18 * SC, 9 * SC, c);
    // 머리(앞쪽)
    clayBall(ctx, mx(36), my(12), 9 * SC, 9 * SC, c);
    // 눈
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(mx(39), my(10), 1.8 * SC, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(mx(39.5), my(9.5), 0.6 * SC, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 둥근 알약 선인장(P2 점프 장애물). 바닥을 지면에 붙임 */
function drawCactus(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  groundPx: number,
  SC: number,
  c: Clay,
): void {
  const H = G6.CACTUS_H;
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => groundPx - (H - y) * SC; // y:0=top..H=ground
  // 팔(뒤에 먼저)
  clayPill(ctx, mx(1), my(20), 7 * SC, 12 * SC, 3.5 * SC, c); // 왼팔 세로
  clayPill(ctx, mx(1), my(24), 9 * SC, 6 * SC, 3 * SC, c); // 왼팔 가로
  clayPill(ctx, mx(18), my(12), 7 * SC, 12 * SC, 3.5 * SC, c); // 오른팔 세로
  clayPill(ctx, mx(16), my(18), 9 * SC, 6 * SC, 3 * SC, c); // 오른팔 가로
  // 몸통(둥근 필)
  clayPill(ctx, mx(8), my(2), 12 * SC, 44 * SC, 6 * SC, c);
  // 버터색 꽃 점 두 개
  ctx.save();
  ctx.fillStyle = BUTTER;
  ctx.beginPath();
  ctx.arc(mx(14), my(10), 2.2 * SC, 0, Math.PI * 2);
  ctx.arc(mx(14), my(20), 1.8 * SC, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 동글동글 블롭 새(P2 숙이기 장애물). 머리높이 + 말랑 날갯짓(phase) */
function drawBird(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  topPx: number,
  SC: number,
  phase: number,
  c: Clay,
): void {
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => topPx + y * SC; // 박스 상단 기준(0..28)
  const flap = Math.sin(phase * 16); // -1..1
  // 날개(몸통 뒤) — 위/아래로 부드럽게
  ctx.save();
  softShadow(ctx, 6, 3);
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.ellipse(mx(24), my(14 - flap * 5), 10 * SC, 6 * SC, -flap * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 몸통(통통한 공)
  clayBall(ctx, mx(20), my(14), 15 * SC, 11 * SC, c);
  // 부리(왼쪽=진행 방향, 코랄)
  ctx.save();
  ctx.fillStyle = CORAL;
  ctx.beginPath();
  ctx.moveTo(mx(6), my(13));
  ctx.lineTo(mx(-1), my(15));
  ctx.lineTo(mx(6), my(17));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // 눈
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(mx(12), my(12), 1.9 * SC, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(mx(12.5), my(11.4), 0.6 * SC, 0, Math.PI * 2);
  ctx.fill();
}

// ── 장면 렌더러 ──────────────────────────────────────────────────────────
export const drawScene: Game6DrawScene = (ctx, s, fx, now, p1IsYou, p2IsYou, geom) => {
  const { CW, CH, SC, X, Y } = geom;

  // 색은 '플레이어' 종속(역할 아님). 공룡=P1엔티티, 장애물=P2엔티티.
  const fc = functionColors();
  const dinoClay = fc.p1 === 'blue' ? PINK : MINT;
  const obstClay = fc.p1 === 'blue' ? MINT : PINK;

  const horizon = Y(G6.GROUND_Y);
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const crashed = s.result === 'P2';
  const resultFx = fx.find((f) => f.kind === 'chroma' || f.kind === 'rush');
  const resultAge = resultFx ? now - resultFx.t : Infinity;

  // --- 피치 필드 배경 ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = FIELD;
  ctx.fillRect(0, 0, CW, CH);

  // --- 배경 구름 puff(패럴랙스, elapsed로 스크롤) ---
  ctx.save();
  for (const st of geom.STARS) {
    const sx = (st.x - s.elapsed * G6.OBST_SPEED * SC * st.z * 0.18) % CW;
    const x = sx < 0 ? sx + CW : sx;
    const y = st.y * 0.7 + 30;
    ctx.globalAlpha = 0.35 + st.z * 0.25;
    ctx.fillStyle = CLOUD;
    ctx.beginPath();
    ctx.ellipse(x, y, st.r * 7 + 9, st.r * 4 + 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 임박 5초: 하늘에 따뜻한 코랄 빛 오버레이
  if (urgent) {
    ctx.save();
    const pulse = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(now / 180));
    ctx.globalAlpha = pulse;
    ctx.fillStyle = CORAL;
    ctx.fillRect(0, 0, CW, horizon);
    ctx.restore();
  }

  // --- 지면: 말랑한 둥근 밴드 + 부드러운 top 립 ---
  ctx.save();
  softShadow(ctx, 10, -3);
  ctx.fillStyle = PANEL;
  pathRR(ctx, -20, horizon, CW + 40, CH - horizon + 20, 26 * SC);
  ctx.fill();
  noShadow(ctx);
  // top 립(약간 진한 크림)
  ctx.fillStyle = PANEL_EDGE;
  pathRR(ctx, -20, horizon, CW + 40, 10 * SC, 8 * SC);
  ctx.fill();
  ctx.restore();

  // --- 스피드: 지면 위 소프트 라운드 대시(왼쪽으로 흐름) ---
  ctx.save();
  ctx.fillStyle = PANEL_EDGE;
  const gap = 62;
  const off = (s.elapsed * G6.OBST_SPEED * SC) % gap;
  for (let x = -off; x < CW; x += gap) {
    pathRR(ctx, x, horizon + 22, 26, 7, 3.5);
    ctx.fill();
  }
  // 작은 점토 조약돌 몇 개(진행감)
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = obstClay.light;
  const off2 = (s.elapsed * G6.OBST_SPEED * SC * 0.6) % 140;
  for (let x = -off2; x < CW; x += 140) {
    ctx.beginPath();
    ctx.ellipse(x + 40, horizon + 48, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // --- 장애물(P2 색) ---
  for (const o of s.obstacles) {
    if (o.type === 'jump') drawCactus(ctx, X(o.x), horizon, SC, obstClay);
    else drawBird(ctx, X(o.x), Y(G6.BIRD_TOP), SC, o.phase, obstClay);
  }

  // --- P2 투척 섬광(spawnAnim) — 오른쪽 끝 소프트 puff ---
  if (s.spawnAnim > 0) {
    const a = Math.min(1, s.spawnAnim / G6.SPAWN_ANIM);
    ctx.save();
    ctx.globalAlpha = 0.4 * a;
    for (let i = 0; i < 3; i++) {
      puff(ctx, CW - 14 - i * 16, horizon - 70 + i * 18, (18 - i * 3) * a + 6, obstClay.light, 1);
    }
    ctx.restore();
  }

  // --- 공룡 그림자(지면 원형) ---
  if (s.result === null) {
    ctx.save();
    ctx.globalAlpha = s.grounded ? 0.22 : 0.12;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(X(G6.DINO_X + G6.DINO_W / 2), horizon + 6, X(22), 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- 공룡(P1 색) ---
  const dinoBottom = horizon - Y(s.y);
  const blink = crashed && resultAge < RESULT_FX_MS && Math.floor(now / 60) % 2 === 0;
  const showDino = !(crashed && resultAge > RESULT_FX_MS * 0.55); // 충돌 후 puff로 대체
  if (showDino) {
    drawDino(
      ctx,
      X(G6.DINO_X),
      dinoBottom,
      SC,
      s.ducking && s.grounded,
      s.grounded,
      s.runPhase,
      blink,
      dinoClay,
    );
  }

  // --- 플레이어 배지 ---
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `700 14px ${FONT}`;
  const badgeX = X(G6.DINO_X + G6.DINO_W / 2);
  const badgeY = dinoBottom - Y(G6.DINO_H) - 10;
  // 배지 알약
  const bw = 30;
  const bh = 18;
  ctx.save();
  softShadow(ctx, 6, 3);
  ctx.fillStyle = dinoClay.base;
  pathRR(ctx, badgeX - bw / 2, badgeY - bh + 3, bw, bh, bh / 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.fillText('P1', badgeX, badgeY + 1);
  if (p1IsYou && Math.floor(now / 500) % 2 === 0) {
    ctx.font = `800 12px ${FONT}`;
    ctx.fillStyle = CORAL;
    ctx.fillText('YOU', badgeX, badgeY - bh - 3);
  }
  ctx.restore();

  // --- P2 리로드 게이지(우상단, 광택 캡슐) ---
  {
    const ready = s.cooldown <= 0;
    const ratio = ready ? 1 : 1 - s.cooldown / Math.max(0.0001, s.cooldownMax);
    const gw = 150;
    const gh = 12;
    const gx = CW - gw - 20;
    const gy = 18;
    ctx.save();
    // 라벨
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.fillText(p2IsYou ? 'P2(YOU) RELOAD' : 'P2 RELOAD', gx + gw, gy - 5);
    // 트랙(패널 캡슐)
    ctx.save();
    softShadow(ctx, 6, 2);
    ctx.fillStyle = PANEL;
    pathRR(ctx, gx, gy, gw, gh, gh / 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = PANEL_EDGE;
    ctx.lineWidth = 1.5;
    pathRR(ctx, gx, gy, gw, gh, gh / 2);
    ctx.stroke();
    // 채움
    const fillW = Math.max(gh, (gw) * ratio);
    const blinkReady = ready && Math.floor(now / 220) % 2 === 0;
    ctx.save();
    ctx.beginPath();
    pathRR(ctx, gx, gy, gw, gh, gh / 2);
    ctx.clip();
    ctx.fillStyle = ready ? (blinkReady ? BUTTER : obstClay.base) : obstClay.base;
    pathRR(ctx, gx, gy, fillW, gh, gh / 2);
    ctx.fill();
    // 광택 하이라이트
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fff';
    pathRR(ctx, gx + 3, gy + 2, fillW - 6, gh * 0.34, gh * 0.17);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // --- 이펙트(소프트 round puff) ---
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'dust' && age < 320) {
      const alpha = Math.max(0, 0.5 - age / 640);
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 4; i++) {
        const d = 6 + age * 0.06 + i * 5;
        puff(ctx, cx - d, cy - (i % 2) * 4, 5 - i * 0.5, PANEL_EDGE, alpha);
      }
    } else if (f.kind === 'shards' && age < 640) {
      const alpha = Math.max(0, 1 - age / 640);
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 8; i++) {
        const ang = (Math.PI * 2 * i) / 8 + 0.4;
        const dist = 6 + age * 0.14;
        const col = i % 2 === 0 ? dinoClay.base : CORAL;
        puff(ctx, cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, 6 - age * 0.006, col, alpha);
      }
    } else if (f.kind === 'spawn' && age < 260) {
      const alpha = Math.max(0, 1 - age / 260);
      const mxs = X(f.x);
      const mys = Y(f.y);
      puff(ctx, mxs, mys, 8 + age * 0.05, obstClay.light, alpha * 0.9);
      puff(ctx, mxs, mys, 4, '#fff', alpha);
    } else if (f.kind === 'caption' && age < f.life) {
      const pop = Math.min(1, age / 120); // 살짝 튀어오르는 등장
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `800 ${16 + (1 - pop) * 6}px ${FONT}`;
      const cx = Math.min(CW - 60, Math.max(60, X(f.x)));
      const cy = Y(f.y);
      // 잉크 아웃라인으로 또렷하게
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.lineJoin = 'round';
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - f.life * 0.6) / (f.life * 0.4));
      ctx.strokeText(f.text, cx, cy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, cx, cy);
      ctx.restore();
    }
  }

  // --- 생존 승리 러쉬(지면 위 따뜻한 소프트 글로우) ---
  const rush = fx.find((f) => f.kind === 'rush');
  if (rush) {
    const a = Math.min(1, (now - rush.t) / 260);
    ctx.save();
    const grad = ctx.createLinearGradient(0, horizon - 70, 0, horizon);
    grad.addColorStop(0, 'rgba(255,212,71,0)');
    grad.addColorStop(1, `rgba(255,212,71,${0.32 * a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizon - 70, CW, 70);
    // 떠오르는 컨페티 puff
    ctx.globalAlpha = 0.8 * a;
    for (let i = 0; i < 8; i++) {
      const px = ((i * 137.5) % CW);
      const py = horizon - ((now - rush.t) * 0.12 + i * 30) % 160;
      ctx.fillStyle = i % 2 === 0 ? dinoClay.base : BUTTER;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- 충돌 순간 연출(부드러운 코랄 플래시) ---
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma) {
    const ca = now - chroma.t;
    if (ca < 220) {
      ctx.save();
      ctx.globalAlpha = 0.3 * (1 - ca / 220);
      ctx.fillStyle = obstClay.base;
      ctx.fillRect(0, 0, CW, CH);
      ctx.restore();
    }
  }
};
