/**
 * Game6(공룡 달리기) — PICO-8 8비트 픽셀아트 테마 렌더러.
 *
 * neon 렌더러(Game6.tsx)와 "같은 요소·같은 좌표"를 그리되, 컨셉만 완전히 다르다:
 *  · 모든 것이 청키한 픽셀(작은 채움 rect)로 구성된 도트 스프라이트 — 안티에일리어싱/글로우 없음.
 *  · 공룡·선인장·새는 문자열 비트맵을 셀 단위로 blit. imageSmoothing 끔.
 *  · 색은 '역할'이 아니라 '플레이어'를 따른다(functionColors) — neon과 동일하게 스왑.
 *
 * 좌표/크기/속도는 절대 만들지 않는다 — geom.* + @madpump/shared G6 상수만 사용(크로스플레이 공정성).
 */
import { G6, GAME_DURATION } from '@madpump/shared';
import { functionColors } from '../../../../net/online';
import type { Game6DrawScene } from './types';

// ── PICO-8 16색 팔레트(부분) ────────────────────────────────────────────────
const PAL = {
  bg: '#1d2b53', // 다크 인디고 (하늘/필드)
  ground: '#000000', // 지면 본체
  groundAlt: '#422136', // 지면 디더/속도 대시
  blue: '#29adff', // P1 후보색
  red: '#ff004d', // P2 후보색
  accent: '#ffa300', // 오렌지 액센트
  yellow: '#ffec27', // 옐로
  text: '#fff1e8', // 텍스트(오프화이트)
  dim: '#5f574f', // 그림자/디밍
  dark: '#00000088', // 반투명 검정(그림자)
} as const;

const FONT = "'Press Start 2P', monospace";

/** 판정→결과 오버레이 전환 사이 인게임 연출 시간(neon과 동일) */
const RESULT_FX_MS = 700;

// ── 도트 스프라이트(문자열 비트맵, '#'=채움 / ' '=투명) ──────────────────────
// 공룡(오른쪽을 봄) — 몸통(공유) + 다리 2프레임.
const DINO_BODY: readonly string[] = [
  '        ###',
  '       ####',
  '       # ##', // 눈 = 빈칸
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
// 숙인 공룡 — 낮고 길게(머리 앞으로) + 다리 2프레임.
const DUCK_BODY: readonly string[] = [
  '         ####',
  '  ###########', // 눈 자리 근처
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
// 선인장(사구아로).
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
// 새 — 날개 위/아래 2프레임(왼쪽=진행방향, 부리 col0).
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

/** 스프라이트 비트맵을 (ox,oy) 좌상단에 셀(cellW×cellH) 단위 청키 픽셀로 그린다. */
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

// ── 씬 렌더러 ────────────────────────────────────────────────────────────────
export const drawScene: Game6DrawScene = (ctx, s, fx, now, p1IsYou, p2IsYou, geom) => {
  const { CW, CH, SC, X, Y, STARS } = geom;

  // 색은 플레이어 종속(역할 아님) — P1엔티티(공룡)=fc.p1 색, P2엔티티(장애물)=fc.p2 색.
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

  // ── 하늘/필드 배경 ──
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, CW, CH);

  // ── 별(단일 픽셀, elapsed로 패럴랙스 스크롤) ──
  ctx.save();
  for (const st of STARS) {
    const sx = (st.x - s.elapsed * G6.OBST_SPEED * SC * st.z * 0.25) % CW;
    const x = sx < 0 ? sx + CW : sx;
    // 밝기/색을 z로 계층화 — 가까운 별은 옐로, 먼 별은 텍스트색
    ctx.fillStyle = st.z > 0.35 ? PAL.yellow : PAL.text;
    ctx.globalAlpha = 0.25 + st.z * 0.5;
    const px = st.r > 1.3 ? 3 : 2;
    ctx.fillRect(Math.round(x), Math.round(st.y), px, px);
  }
  ctx.restore();

  // ── 임박(5초 이내): 붉은 디더 스캔 오버레이(하늘 영역) ──
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

  // ── 지면: 검은 밴드 + 디더 상단 엣지 + 속도 대시 ──
  ctx.save();
  ctx.fillStyle = PAL.ground;
  ctx.fillRect(0, horizon, CW, CH - horizon);
  // 상단 1셀 디더 체커(경계 강조, 스크롤로 미세 이동)
  const edge = Math.round(SC * 3);
  const eoff = Math.floor((s.elapsed * G6.OBST_SPEED * SC) / edge) % 2;
  ctx.fillStyle = PAL.groundAlt;
  for (let x = 0, i = 0; x < CW; x += edge, i++) {
    if ((i + eoff) % 2 === 0) ctx.fillRect(x, horizon, edge, edge);
  }
  // 속도 대시(왼쪽으로 흘러 전진감) — 지면 밴드 안 밝은 픽셀 세그먼트
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

  // ── 장애물(P2 색) ──
  for (const o of s.obstacles) {
    if (o.type === 'jump') {
      // 선인장 — 바닥을 지면에 붙임
      const left = X(o.x);
      const wPx = G6.CACTUS_W * SC;
      const hPx = G6.CACTUS_H * SC;
      const cols = CACTUS[0].length;
      const rows = CACTUS.length;
      blit(ctx, CACTUS, left, horizon - hPx, wPx / cols, hPx / rows, obstCol);
    } else {
      // 새 — 머리 높이 + 날갯짓(phase). neon과 동일 타이밍(sin(phase*16)).
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

  // ── P2 투척 섬광(spawnAnim) — 오른쪽 끝에서 장애물이 튀어나오는 순간 청키 픽셀 바 ──
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

  // ── 공룡(P1 색) ──
  const ducking = s.ducking && s.grounded;
  const dinoBottom = horizon - Y(s.y);
  const blink = crashed && resultAge < RESULT_FX_MS && Math.floor(now / 60) % 2 === 0;
  const showDino = !(crashed && resultAge > RESULT_FX_MS * 0.55); // 충돌 후 파편으로 대체

  // 그림자(지면 위 청키 다크 픽셀 바 — grounded면 진하게)
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

  // ── 플레이어 배지 'P1' + 'YOU'(p1IsYou면 점멸) ──
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

  // ── P2 리로드 게이지(우상단) — 세그먼트 픽셀 블록 ──
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
    // 픽셀 테두리(1px 프레임)
    ctx.fillStyle = PAL.dim;
    ctx.fillRect(gx - 2, gy - 2, gw + 4, 2);
    ctx.fillRect(gx - 2, gy + gh, gw + 4, 2);
    ctx.fillRect(gx - 2, gy, 2, gh);
    ctx.fillRect(gx + gw, gy, 2, gh);
    // 트랙(어두운 바탕)
    ctx.fillStyle = PAL.ground;
    ctx.fillRect(gx, gy, gw, gh);
    // 세그먼트 채움
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

  // ── 이펙트(픽셀 버스트) ──
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
      // 십자 픽셀 버스트
      ctx.fillRect(mx - arm, my, arm * 2, pxs);
      ctx.fillRect(mx, my - arm, pxs, arm * 2);
      ctx.restore();
    } else if (f.kind === 'caption' && age < f.life) {
      const on = Math.floor(age / 110) % 2 === 0 || age > 260; // 점멸 후 유지
      if (on) {
        ctx.save();
        ctx.font = `13px ${FONT}`;
        ctx.textAlign = 'center';
        const tx = Math.min(CW - 60, Math.max(60, X(f.x)));
        const ty = Y(f.y);
        // 도트 느낌의 하드 섀도(1px 오프셋)
        ctx.fillStyle = PAL.ground;
        ctx.fillText(f.text, tx + 2, ty + 2);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, tx, ty);
        ctx.restore();
      }
    }
  }

  // ── 생존 승리 러쉬(지면 위 P1색 픽셀 밴드가 차오름) ──
  const rush = fx.find((f) => f.kind === 'rush');
  if (rush) {
    const a = Math.min(1, (now - rush.t) / 260);
    ctx.save();
    ctx.fillStyle = dinoCol;
    const bandH = Math.round(60 * SC * a);
    const cell = Math.round(SC * 4);
    // 위로 갈수록 성겨지는 디더 밴드
    for (let y = horizon - bandH; y < horizon; y += cell) {
      const t = (y - (horizon - bandH)) / Math.max(1, bandH);
      ctx.globalAlpha = 0.2 + t * 0.5;
      for (let x = (Math.floor(y / cell) % 2) * cell; x < CW; x += cell * 2) {
        ctx.fillRect(x, y, cell, cell);
      }
    }
    ctx.restore();
  }

  // ── 충돌 순간: 픽셀 RGB 스플릿 글리치(승패 프레임 계열) ──
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
