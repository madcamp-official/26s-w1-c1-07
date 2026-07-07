/**
 * Game6(공룡 달리기) — 테마: BROADCAST ARENA (esports 방송 그래픽).
 * 라이브 매치 오버레이 컨셉으로 씬 전체를 처음부터 그린다. 좌표/판정은 neon과 동일(공정성) —
 * geom.* + @madpump/shared G6 상수만 기준. 여기 있는 건 '그리기'뿐.
 *
 * 아트: CLEAN FLAT VECTOR. 팔레트 = 쿨 라이트 필드/네이비/팀블루/팀레드/골드. 폰트 Archivo.
 *  · 공룡(P1엔티티) = 팀 컬러의 깔끔한 플랫 마스코트 러너.
 *  · 장애물(P2엔티티) = 팀 컬러의 깔끔한 플랫 도형.
 *  · 지면 = 라이트 필드 그라디언트 위 수렴 그리드 + 얇은 대시 스피드 텍스처.
 *  · 리로드 게이지 = 방송 로어서드 바(네이비 라운드렉트 + 화이트 라벨 + 팀 컬러 채움).
 *  · 배지 = 스코어보드 'bug'(네이비 필 + 팀 컬러). 이펙트 = 클린 플랫 팝.
 * 그림자는 은은한 소프트 드롭섀도우 1겹(shadowBlur ~6, 낮은 알파 네이비) — 네온 글로우 아님.
 */
import { G6, GAME_DURATION } from '@madpump/shared';
import { functionColors } from '../../../../net/online';
import type { Game6DrawScene } from './types';

// ── 방송 팔레트 (테마 고정) ──────────────────────────────────────────────
const PAL = {
  field: '#eef2f7', // 쿨 라이트 필드
  panel: '#e3eaf3', // 필드 패널(지면 아래 살짝 진한 톤)
  navy: '#0e1e3c', // 네이비(텍스트/외곽/필/그림자 베이스)
  blue: '#0b63e5', // 팀 블루 (기본 P1)
  red: '#e0323e', // 팀 레드 (기본 P2)
  gold: '#c99312', // 골드(강조/YOU/생존)
  line: '#c3cedd', // 그리드/트랙 라인
  white: '#ffffff',
} as const;

const FONT = "'Archivo', sans-serif";
/** 판정 → 결과 오버레이 전환 사이 인게임 연출 시간(neon과 동일) */
const RESULT_FX_MS = 700;
/** 은은한 소프트 드롭섀도우 색(낮은 알파 네이비) */
const SHADOW = 'rgba(14,30,60,0.22)';

/** 라운드렉트 경로 (반경 r) */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 소프트 드롭섀도우 1겹 ON */
function softShadow(ctx: CanvasRenderingContext2D, blur = 6, dy = 2): void {
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

export const drawScene: Game6DrawScene = (ctx, s, fx, now, p1IsYou, p2IsYou, geom) => {
  const { CW, CH, SC, X, Y, STARS } = geom;

  // 색은 '역할'이 아니라 '플레이어'를 따른다 — P1엔티티(공룡)/P2엔티티(장애물) 팀 컬러 결정.
  const fc = functionColors();
  const dinoCol = fc.p1 === 'blue' ? PAL.blue : PAL.red; // 공룡 = P1엔티티 색
  const obstCol = fc.p2 === 'blue' ? PAL.blue : PAL.red; // 장애물 = P2엔티티 색

  const horizon = Y(G6.GROUND_Y);
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const crashed = s.result === 'P2';
  const resultFx = fx.find((f) => f.kind === 'chroma' || f.kind === 'rush');
  const resultAge = resultFx ? now - resultFx.t : Infinity;

  // ── 배경: 스튜디오 라이트 필드 ─────────────────────────────────────────
  ctx.clearRect(0, 0, CW, CH);
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#f6f9fc');
  sky.addColorStop(1, PAL.field);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CW, horizon);
  // 지면 아래 필드 패널
  const panel = ctx.createLinearGradient(0, horizon, 0, CH);
  panel.addColorStop(0, PAL.panel);
  panel.addColorStop(1, '#d7e0ec');
  ctx.fillStyle = panel;
  ctx.fillRect(0, horizon, CW, CH - horizon);

  // ── 상단 방송 프레임 라인(얇은 골드 헤어라인 — 스튜디오 룩) ─────────────
  ctx.save();
  ctx.strokeStyle = 'rgba(201,147,18,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 8.5);
  ctx.lineTo(CW, 8.5);
  ctx.stroke();
  ctx.restore();

  // ── 하늘 도트(패럴랙스) — 방송용 은은한 앰비언트, elapsed로 스크롤 ───────
  ctx.save();
  ctx.fillStyle = 'rgba(14,30,60,0.10)';
  for (const st of STARS) {
    const sx = (st.x - s.elapsed * G6.OBST_SPEED * SC * st.z * 0.18) % CW;
    const x = sx < 0 ? sx + CW : sx;
    ctx.globalAlpha = 0.05 + st.z * 0.14;
    ctx.beginPath();
    ctx.arc(x, st.y * 0.9 + 6, st.r * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ── 수렴 그리드(원근) — 소실점에서 필드로 퍼지는 얇은 라인 ─────────────
  ctx.save();
  const vpx = CW / 2;
  ctx.strokeStyle = urgent ? 'rgba(224,50,62,0.16)' : 'rgba(195,206,221,0.55)';
  ctx.lineWidth = 1;
  for (let k = -8; k <= 8; k++) {
    ctx.beginPath();
    ctx.moveTo(vpx, horizon);
    ctx.lineTo(vpx + k * 92, CH);
    ctx.stroke();
  }
  // 다가오는 가로 라인(전진감)
  const gscroll = (s.elapsed * 0.7) % 1;
  const N = 8;
  for (let j = 0; j < N; j++) {
    const t = (j + gscroll) / N;
    const y = horizon + (CH - horizon) * t * t;
    ctx.globalAlpha = 0.08 + t * 0.32;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CW, y);
    ctx.stroke();
  }
  ctx.restore();

  // ── 지평선(클린 네이비) + 스피드 대시 ─────────────────────────────────
  ctx.save();
  ctx.strokeStyle = PAL.navy;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, horizon + 0.5);
  ctx.lineTo(CW, horizon + 0.5);
  ctx.stroke();
  // 얇은 대시(왼쪽으로 흘러 속도감)
  ctx.strokeStyle = 'rgba(14,30,60,0.30)';
  ctx.lineWidth = 2;
  const gap = 58;
  const off = (s.elapsed * G6.OBST_SPEED * SC) % gap;
  ctx.beginPath();
  for (let x = -off; x < CW; x += gap) {
    ctx.moveTo(x, horizon + 9);
    ctx.lineTo(x + 24, horizon + 9);
  }
  ctx.stroke();
  ctx.restore();

  // 임박 5초: 상단 레드 텔롭 스트립
  if (urgent) {
    const pulse = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(now / 130));
    ctx.save();
    ctx.fillStyle = `rgba(224,50,62,${pulse})`;
    ctx.fillRect(0, 0, CW, 4);
    ctx.restore();
  }

  // ── 장애물(팀 컬러 플랫 도형) ─────────────────────────────────────────
  for (const o of s.obstacles) {
    if (o.type === 'jump') drawCactus(ctx, X(o.x), horizon, SC, obstCol);
    else drawBird(ctx, X(o.x), Y(G6.BIRD_TOP), o.phase, SC, obstCol);
  }

  // ── P2 투척 섬광(spawnAnim) — 오른쪽 끝에서 장애물 투입 순간 ───────────
  if (s.spawnAnim > 0) {
    const a = Math.min(1, s.spawnAnim / G6.SPAWN_ANIM);
    const rgb = obstCol === PAL.red ? '224,50,62' : '11,99,229';
    ctx.save();
    ctx.globalAlpha = 0.4 * a;
    const grad = ctx.createLinearGradient(CW, 0, CW - 96, 0);
    grad.addColorStop(0, `rgba(${rgb},0.85)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(CW - 96, horizon - 150, 96, 168);
    ctx.restore();
  }

  // ── 공룡(P1엔티티, 팀 컬러 플랫 마스코트) ─────────────────────────────
  const dinoBottom = horizon - Y(s.y);
  const blink = crashed && resultAge < RESULT_FX_MS && Math.floor(now / 60) % 2 === 0;
  const showDino = !(crashed && resultAge > RESULT_FX_MS * 0.55);

  // 공룡 그림자(지면 소프트 엘립스)
  if (s.result === null) {
    ctx.save();
    ctx.globalAlpha = s.grounded ? 0.22 : 0.12;
    ctx.fillStyle = PAL.navy;
    ctx.beginPath();
    ctx.ellipse(X(G6.DINO_X + G6.DINO_W / 2), horizon + 4, X(22), 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

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
      dinoCol,
    );
  }

  // ── 플레이어 배지 (스코어보드 'bug' — 네이비 필 + 팀 컬러 탭) ──────────
  {
    const cx = X(G6.DINO_X + G6.DINO_W / 2);
    const topY = dinoBottom - Y(G6.DINO_H) - 26;
    ctx.save();
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const label = 'P1';
    const tw = ctx.measureText(label).width;
    const padL = 16;
    const padR = 8;
    const pillW = padL + tw + padR;
    const pillH = 18;
    const px = cx - pillW / 2;
    const py = topY;
    softShadow(ctx, 6, 2);
    ctx.fillStyle = PAL.navy;
    roundRect(ctx, px, py, pillW, pillH, pillH / 2);
    ctx.fill();
    noShadow(ctx);
    // 팀 컬러 탭(왼쪽 원형)
    ctx.fillStyle = dinoCol;
    ctx.beginPath();
    ctx.arc(px + 9, py + pillH / 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    // 라벨
    ctx.fillStyle = PAL.white;
    ctx.fillText(label, px + padL, py + pillH / 2 + 0.5);
    ctx.restore();

    // 'YOU' 점멸(골드)
    if (p1IsYou && Math.floor(now / 500) % 2 === 0) {
      ctx.save();
      ctx.font = `800 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = PAL.gold;
      ctx.fillText('YOU', cx, topY - 6);
      ctx.restore();
    }
  }

  // ── P2 리로드 게이지 = 방송 로어서드 바 ───────────────────────────────
  {
    const ready = s.cooldown <= 0;
    const ratio = ready ? 1 : 1 - s.cooldown / Math.max(0.0001, s.cooldownMax);
    const gw = 150;
    const gh = 12;
    const gx = CW - gw - 20;
    const gy = 18;
    // 로어서드 셸(네이비 라운드렉트 + 소프트 섀도우), 라벨 영역까지 감싸는 넓은 판
    const shellPadX = 10;
    const shellY = gy - 20;
    const shellH = 20 + gh + 8;
    const shellX = gx - shellPadX;
    const shellW = gw + shellPadX * 2;
    ctx.save();
    softShadow(ctx, 6, 2);
    ctx.fillStyle = PAL.navy;
    roundRect(ctx, shellX, shellY, shellW, shellH, 6);
    ctx.fill();
    noShadow(ctx);

    // 라벨(화이트 Archivo) + 준비 상태(골드) + 탭 피겨
    ctx.font = `700 9px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.white;
    ctx.fillText(p2IsYou ? 'P2 (YOU) · RELOAD' : 'P2 · RELOAD', gx, gy - 6);
    // 우측 탭 피겨(퍼센트) — 태뷸러 느낌
    ctx.textAlign = 'right';
    const pct = Math.round(ratio * 100);
    ctx.fillStyle = ready ? PAL.gold : 'rgba(255,255,255,0.75)';
    ctx.fillText(ready ? 'READY' : `${pct < 10 ? '0' : ''}${pct}%`, gx + gw, gy - 6);

    // 트랙(어두운 네이비 홈)
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(ctx, gx, gy, gw, gh, gh / 2);
    ctx.fill();
    // 채움(팀 레드 = P2엔티티 색), ready면 골드 점멸
    const fillW = Math.max(0, (gw - 2) * ratio);
    if (fillW > 0) {
      const blinkReady = ready && Math.floor(now / 200) % 2 === 0;
      ctx.fillStyle = ready ? (blinkReady ? PAL.gold : obstCol) : obstCol;
      roundRect(ctx, gx + 1, gy + 1, fillW, gh - 2, (gh - 2) / 2);
      ctx.fill();
      // 상단 하이라이트 헤어라인
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      roundRect(ctx, gx + 1, gy + 1, fillW, (gh - 2) / 2, (gh - 2) / 4);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── 이펙트 (클린 플랫 팝) ──────────────────────────────────────────────
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'dust' && age < 320) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 0.4 - age / 800);
      ctx.fillStyle = 'rgba(14,30,60,0.5)';
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 4; i++) {
        const d = 5 + age * 0.07 + i * 3;
        ctx.beginPath();
        ctx.arc(cx - d, cy - (i % 2) * 3, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (f.kind === 'shards' && age < 640) {
      ctx.save();
      const a = Math.max(0, 1 - age / 640);
      ctx.globalAlpha = a;
      ctx.fillStyle = dinoCol;
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 8; i++) {
        const ang = (Math.PI * 2 * i) / 8 + 0.3;
        const dist = 8 + age * 0.14;
        const sx = cx + Math.cos(ang) * dist;
        const sy = cy + Math.sin(ang) * dist;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(ang + age * 0.01);
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      }
      ctx.restore();
    } else if (f.kind === 'spawn' && age < 260) {
      ctx.save();
      const a = Math.max(0, 1 - age / 260);
      ctx.globalAlpha = a;
      ctx.strokeStyle = obstCol;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      const mx = X(f.x);
      const my = Y(f.y);
      const r = 6 + age * 0.05;
      ctx.beginPath();
      ctx.moveTo(mx - r, my);
      ctx.lineTo(mx + r, my);
      ctx.moveTo(mx, my - r);
      ctx.lineTo(mx, my + r);
      ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'caption' && age < f.life) {
      const on = Math.floor(age / 110) % 2 === 0 || age > 260;
      if (on) {
        // 방송 캡션 칩(네이비 필 + 컬러 라벨)
        const cap = f.text;
        ctx.save();
        ctx.font = `800 13px ${FONT}`;
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(cap).width;
        const padX = 12;
        const chW = tw + padX * 2;
        const chH = 22;
        const cx = Math.min(CW - 60, Math.max(60, X(f.x)));
        const cy = Y(f.y);
        softShadow(ctx, 6, 2);
        ctx.fillStyle = PAL.navy;
        roundRect(ctx, cx - chW / 2, cy - chH / 2, chW, chH, 5);
        ctx.fill();
        noShadow(ctx);
        // 좌측 컬러 액센트 바
        ctx.fillStyle = f.color === '#05d9e8' || f.color === '#0b63e5' ? dinoCol : f.color;
        roundRect(ctx, cx - chW / 2, cy - chH / 2, 4, chH, 2);
        ctx.fill();
        ctx.fillStyle = PAL.white;
        ctx.textAlign = 'center';
        ctx.fillText(cap, cx + 2, cy + 0.5);
        ctx.restore();
      }
    }
  }

  // ── 생존 승리 러쉬(지면 위 팀 컬러 밴드 라이즈) ────────────────────────
  const rush = fx.find((f) => f.kind === 'rush');
  if (rush) {
    const a = Math.min(1, (now - rush.t) / 260);
    const rgb = dinoCol === PAL.blue ? '11,99,229' : '224,50,62';
    ctx.save();
    const grad = ctx.createLinearGradient(0, horizon - 64, 0, horizon);
    grad.addColorStop(0, `rgba(${rgb},0)`);
    grad.addColorStop(1, `rgba(${rgb},${0.26 * a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizon - 64, CW, 64);
    ctx.restore();
  }

  // ── 충돌 순간 플랫 플래시(레드 비네트 팝, 짧게) ────────────────────────
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && now - chroma.t < 120) {
    const a = Math.max(0, 1 - (now - chroma.t) / 120);
    ctx.save();
    const g = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.25, CW / 2, CH / 2, CH * 0.72);
    g.addColorStop(0, 'rgba(224,50,62,0)');
    g.addColorStop(1, `rgba(224,50,62,${0.35 * a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
    ctx.restore();
  }
};

// ───────────────────────────────────────────────────────────────────────────
// 스프라이트 (CLEAN FLAT VECTOR — 채움=팀 컬러, 소프트 드롭섀도우 1겹)
// ───────────────────────────────────────────────────────────────────────────

/** 공룡(P1엔티티) — 깔끔한 플랫 마스코트 러너. leftPx=박스 좌측, bottomPx=박스 하단 */
function drawDino(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  bottomPx: number,
  SC: number,
  ducking: boolean,
  grounded: boolean,
  runPhase: number,
  blink: boolean,
  col: string,
): void {
  const boxH = ducking ? G6.DINO_DUCK_H : G6.DINO_H;
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => bottomPx - (boxH - y) * SC; // y:0=top .. boxH=bottom

  const poly = (pts: readonly (readonly [number, number])[]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(mx(x), my(y)) : ctx.moveTo(mx(x), my(y))));
    ctx.closePath();
    ctx.fill();
  };

  ctx.save();
  if (blink) ctx.globalAlpha = 0.45;
  ctx.fillStyle = col;
  ctx.lineJoin = 'round';

  if (!ducking) {
    // 다리(달리기 — runPhase로 교대). 공중이면 짧게 접음. (몸통 뒤에 먼저)
    const step = Math.floor(runPhase * 14) % 2 === 0;
    const frontH = grounded ? (step ? 10 : 4) : 5;
    const backH = grounded ? (step ? 4 : 10) : 5;
    const leg = (bx: number, h: number) => {
      roundRect(ctx, mx(bx), my(40), 5 * SC, h * SC, 1.5);
      ctx.fill();
    };
    softShadow(ctx, 6, 3);
    leg(13, backH);
    leg(21, frontH);
    // 몸통 실루엣(소프트 섀도우 1겹)
    poly([
      [4, 32], [12, 24], [12, 14], [19, 14], [19, 4], [40, 4],
      [41, 16], [30, 16], [30, 21], [27, 21], [27, 40], [13, 40], [13, 32],
    ]);
    noShadow(ctx);
    // 팔(플랫 스터브)
    ctx.lineWidth = 2.4 * SC * 0.83;
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mx(28), my(23));
    ctx.lineTo(mx(33), my(27));
    ctx.stroke();
    // 눈(화이트 스클레라 + 네이비 동공)
    ctx.fillStyle = PAL.white;
    ctx.beginPath();
    ctx.arc(mx(34), my(9), 2.2 * SC, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.navy;
    ctx.beginPath();
    ctx.arc(mx(34.6), my(9), 1.1 * SC, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 숙인 자세 — 낮고 길게(머리 앞으로)
    const step = Math.floor(runPhase * 16) % 2 === 0;
    const frontH = step ? 8 : 4;
    const backH = step ? 4 : 8;
    const leg = (bx: number, h: number) => {
      roundRect(ctx, mx(bx), my(20), 4.5 * SC, h * SC, 1.5);
      ctx.fill();
    };
    softShadow(ctx, 6, 3);
    leg(12, backH);
    leg(23, frontH);
    poly([
      [0, 12], [10, 6], [22, 3], [44, 3], [44, 11], [33, 13], [14, 15], [8, 20], [2, 20],
    ]);
    noShadow(ctx);
    ctx.fillStyle = PAL.white;
    ctx.beginPath();
    ctx.arc(mx(39), my(7), 2 * SC, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.navy;
    ctx.beginPath();
    ctx.arc(mx(39.5), my(7), 1 * SC, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 선인장(P2 점프 장애물) — 깔끔한 플랫 레드 블록. 지면(ground)에 바닥 붙임 */
function drawCactus(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  groundPx: number,
  SC: number,
  col: string,
): void {
  const H = G6.CACTUS_H;
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => groundPx - (H - y) * SC; // y:0=top .. H=bottom(ground)
  ctx.save();
  ctx.fillStyle = col;
  softShadow(ctx, 6, 3);
  const seg = (x0: number, y0: number, x1: number, y1: number, r: number) => {
    roundRect(ctx, mx(x0), my(y1), (x1 - x0) * SC, (y1 - y0) * SC, r);
    ctx.fill();
  };
  seg(10, 4, 17, 46, 3); // 몸통
  noShadow(ctx); // 팔은 그림자 없이(겹침 방지, 클린)
  seg(3, 18, 8, 30, 2.5); // 왼팔 세로
  seg(6, 24, 11, 30, 2.5); // 왼팔 연결
  seg(19, 12, 24, 26, 2.5); // 오른팔 세로
  seg(16, 20, 21, 26, 2.5); // 오른팔 연결
  ctx.restore();
}

/** 새(P2 숙이기 장애물) — 깔끔한 플랫 레드 실루엣 + 날갯짓(phase) */
function drawBird(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  topPx: number,
  phase: number,
  SC: number,
  col: string,
): void {
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => topPx + y * SC; // 박스 상단 기준 (0..28)
  ctx.save();
  ctx.fillStyle = col;
  ctx.lineJoin = 'round';
  softShadow(ctx, 6, 3);
  // 몸통(부리는 왼쪽 = 진행 방향)
  ctx.beginPath();
  const body: readonly [number, number][] = [
    [2, 14], [10, 9], [24, 8], [34, 10], [38, 15], [28, 19], [12, 19], [7, 16],
  ];
  body.forEach(([x, y], i) => (i ? ctx.lineTo(mx(x), my(y)) : ctx.moveTo(mx(x), my(y))));
  ctx.closePath();
  ctx.fill();
  noShadow(ctx);
  // 날개 — 위/아래로 퍼덕(플랫 삼각)
  const flap = Math.sin(phase * 16);
  ctx.beginPath();
  ctx.moveTo(mx(15), my(12));
  ctx.lineTo(mx(30), my(12));
  ctx.lineTo(mx(22), my(12 - 9 * flap));
  ctx.closePath();
  ctx.fill();
  // 눈(화이트 + 네이비)
  ctx.fillStyle = PAL.white;
  ctx.beginPath();
  ctx.arc(mx(12), my(12), 2 * SC, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.navy;
  ctx.beginPath();
  ctx.arc(mx(11.5), my(12), 1 * SC, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
