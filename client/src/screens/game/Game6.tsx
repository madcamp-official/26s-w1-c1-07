/**
 * S? 게임4 — 공룡 달리기 (NEON COIN-OP). 담당: game6 에이전트.
 * 컨테이너 testid: scr-game6 / 부품: game-stage(CRT 베젤), hud-*(HudFrame 내장), btn-exit
 *
 * ── 원칙 ────────────────────────────────────────────────────────
 *  · 로직/판정은 @madpump/shared game6 코어(create/step) + G6 상수만 사용 — 재구현 금지.
 *  · 화면은 neon-coinop 컨셉으로 처음부터 새로 구성(canvas 직접 렌더). 실험 폴더 미참조.
 *
 * 게임 규칙(코어 주석 요약):
 *  · P1(공룡, 시안) = Q 점프 / W 숙이기(홀드). 10초를 버티면 P1 승.
 *  · P2(핑크) = U 선인장(지면 장애물, 점프로 회피) / I 새(머리높이, 숙여서 회피).
 *    공용 쿨타임(cooldown/cooldownMax)으로 연속 생성을 제한 — 무한 벽 쌓기 방지.
 *  · 한 번이라도 충돌하면 즉시 P2 승.
 *
 * 배선(게임1·2와 동일 계약):
 *  · direct-URL 진입: idle이거나 gameId!==6면 startOfflineGame(6)
 *  · 라운드마다 game6.create(Math.random) → rAF 루프 game6.step(state, events, dtSec)
 *  · attachLocalKeyboard: KeyQ/KeyW=P1, KeyU/KeyI=P2. 코어가 down/up(엣지·홀드) 판정.
 *  · step은 원본 mutate 후 동일 참조 반환 → 이전값 비교는 호출 전 스칼라 스냅샷.
 *  · result 확정 → (짧은 인게임 연출 후) reportRoundEnd 1회 → <ResultOverlay />
 *  · 매 틱 setDebugGame(state), 언마운트 setDebugGame(null)
 *  · online 모드: P2(장애물 생성)는 봇 — 쿨타임마다 무작위 장애물 투척(사람은 P1=q/w)
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { game6, G6, GAME_DURATION } from '@madpump/shared';
import type { Game6State, Obstacle, GameInputEvent } from '@madpump/shared';
import type { MatchResult } from '@/shell';
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
import { createEndTracker, drawEndFlash, type EndTracker } from '../../game/endFx';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import { sfx } from '@/audio';
import { getTheme } from '../../state/theme';
import { game6Draw } from './render/game6';
import type { Geom } from './render/game6/types';
import './game6.css';

// ---------------------------------------------------------------------------
// 캔버스 상수 — 논리 필드는 코어 G6.W/H(800×450). 캔버스는 1.2배(960×540)로 16:9 유지.
// SX=SY=1.2 균일 스케일이라 논리→캔버스 변환은 단순 곱.
// ---------------------------------------------------------------------------
const CW = 960;
const CH = 540;
const SC = CW / G6.W; // 1.2 (== CH / G6.H)

// 모듈 기본 팔레트(P1=시안/P2=핑크). 색은 '역할'이 아니라 '플레이어'를 따라야 하므로
// drawScene 맨 위에서 functionColors()로 로컬 COL을 shadow해 P1/P2 엔티티 색을 스왑한다.
const COL0 = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  p1: '#05d9e8', // --p1 (공룡 — 시안)
  p1dim: '#0a3a4a', // --p1-dim
  p2: '#ff2a6d', // --p2 (장애물 — 핑크)
  p2dim: '#4a0a26', // --p2-dim
  accent: '#fdf500', // 코인 옐로
  accent2: '#d300c5', // 네온 퍼플(그리드)
  muted: '#9d8fbf',
  win: '#39ff88',
} as const;

/** 스왑된 로컬 팔레트도 담을 수 있게 값 타입을 넓힌 팔레트(스프라이트 헬퍼 인자용) */
type ColPalette = { readonly [K in keyof typeof COL0]: string };

const ARCADE_FONT = '"Press Start 2P", monospace';

/** 판정 → 결과 오버레이 전환 사이 인게임 연출 시간(충돌 파편/생존 러쉬) */
const RESULT_FX_MS = 700;

/** 코어 result('P1'|'P2'|'DRAW') → 셸 MatchResult 매핑 */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): MatchResult {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

// 배경 별(패럴랙스) — 결정론적 정적 배치, elapsed로 스크롤
const STARS: readonly { x: number; y: number; z: number; r: number }[] = Array.from(
  { length: 34 },
  (_, i) => ({
    x: (i * 137.5) % CW,
    y: (i * 71.3) % 300,
    z: 0.15 + ((i * 53) % 100) / 300, // 패럴랙스 속도 계수
    r: 0.6 + ((i * 29) % 10) / 8,
  }),
);

// ---------------------------------------------------------------------------
// 렌더 전용 이펙트 (로직 비침범)
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'dust'; x: number; y: number; t: number } // 착지/점프 먼지
  | { kind: 'shards'; x: number; y: number; t: number } // 충돌 파편
  | { kind: 'spawn'; x: number; y: number; t: number } // P2 투척 섬광
  | { kind: 'caption'; text: string; color: string; x: number; y: number; t: number; life: number }
  | { kind: 'chroma'; t: number } // 충돌 순간 크로마틱 어버레이션
  | { kind: 'rush'; t: number }; // 생존 승리 러쉬

// 좌표 변환
const X = (u: number) => u * SC;
const Y = (u: number) => u * SC;

// ---------------------------------------------------------------------------
// 스프라이트 (네온 아웃라인 — 채움은 dim, 스트로크는 플레이어색 + 글로우)
// ---------------------------------------------------------------------------

/** 공룡(P1, 시안). leftPx=박스 좌측 px, bottomPx=박스 하단 px */
function drawDino(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  bottomPx: number,
  ducking: boolean,
  grounded: boolean,
  runPhase: number,
  blink: boolean,
  col: ColPalette,
): void {
  const boxH = ducking ? G6.DINO_DUCK_H : G6.DINO_H;
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => bottomPx - (boxH - y) * SC; // y: 0=top .. boxH=bottom

  ctx.save();
  ctx.strokeStyle = col.p1;
  ctx.fillStyle = col.p1dim;
  ctx.shadowColor = col.p1;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  if (blink) ctx.globalAlpha = 0.4;

  const poly = (pts: readonly (readonly [number, number])[]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(mx(x), my(y)) : ctx.moveTo(mx(x), my(y))));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  if (!ducking) {
    // 서 있는 티라노(오른쪽을 봄) 실루엣
    poly([
      [4, 32], [12, 24], [12, 14], [19, 14], [19, 4], [40, 4],
      [41, 16], [30, 16], [30, 21], [27, 21], [27, 40], [13, 40], [13, 32],
    ]);
    // 팔
    ctx.beginPath();
    ctx.moveTo(mx(28), my(23));
    ctx.lineTo(mx(33), my(27));
    ctx.stroke();
    // 다리(달리기 — runPhase로 교대). 공중이면 짧게 접음.
    const step = Math.floor(runPhase * 14) % 2 === 0;
    const frontH = grounded ? (step ? 10 : 4) : 5;
    const backH = grounded ? (step ? 4 : 10) : 5;
    const leg = (bx: number, h: number) => {
      ctx.beginPath();
      ctx.rect(mx(bx), my(40), 5 * SC, h * SC);
      ctx.fill();
      ctx.stroke();
    };
    leg(13, backH);
    leg(21, frontH);
    // 눈
    ctx.shadowBlur = 0;
    ctx.fillStyle = col.p1;
    ctx.beginPath();
    ctx.arc(mx(34), my(9), 1.6 * SC, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 숙인 자세 — 낮고 길게(머리 앞으로)
    poly([
      [0, 12], [10, 6], [22, 3], [44, 3], [44, 11], [33, 13], [14, 15], [8, 20], [2, 20],
    ]);
    const step = Math.floor(runPhase * 16) % 2 === 0;
    const frontH = step ? 8 : 4;
    const backH = step ? 4 : 8;
    const leg = (bx: number, h: number) => {
      ctx.beginPath();
      ctx.rect(mx(bx), my(20), 4.5 * SC, h * SC);
      ctx.fill();
      ctx.stroke();
    };
    leg(12, backH);
    leg(23, frontH);
    ctx.shadowBlur = 0;
    ctx.fillStyle = col.p1;
    ctx.beginPath();
    ctx.arc(mx(39), my(7), 1.5 * SC, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 선인장(P2 점프 장애물, 핑크). 지면(ground)에 바닥을 붙임 */
function drawCactus(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  groundPx: number,
  col: ColPalette,
): void {
  const H = G6.CACTUS_H;
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => groundPx - (H - y) * SC; // y: 0=top .. H=bottom(ground)
  ctx.save();
  ctx.strokeStyle = col.p2;
  ctx.fillStyle = col.p2dim;
  ctx.shadowColor = col.p2;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.beginPath();
    ctx.rect(mx(x0), my(y1), (x1 - x0) * SC, (y1 - y0) * SC);
    ctx.fill();
    ctx.stroke();
  };
  seg(10, 4, 17, 46); // 몸통
  seg(3, 18, 8, 30); // 왼팔 세로
  seg(6, 24, 11, 30); // 왼팔 연결
  seg(19, 12, 24, 26); // 오른팔 세로
  seg(16, 20, 21, 26); // 오른팔 연결
  ctx.restore();
}

/** 새(P2 숙이기 장애물, 핑크). 머리 높이로 날아옴 + 날갯짓(phase) */
function drawBird(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  topPx: number,
  phase: number,
  col: ColPalette,
): void {
  const mx = (x: number) => leftPx + x * SC;
  const my = (y: number) => topPx + y * SC; // 박스 상단 기준 (0..28)
  ctx.save();
  ctx.strokeStyle = col.p2;
  ctx.fillStyle = col.p2dim;
  ctx.shadowColor = col.p2;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  // 몸통(부리는 왼쪽 = 진행 방향)
  ctx.beginPath();
  const body: readonly [number, number][] = [
    [2, 14], [10, 9], [24, 8], [34, 10], [38, 15], [28, 19], [12, 19], [7, 16],
  ];
  body.forEach(([x, y], i) => (i ? ctx.lineTo(mx(x), my(y)) : ctx.moveTo(mx(x), my(y))));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 날개 — 위/아래로 퍼덕
  const flap = Math.sin(phase * 16);
  ctx.beginPath();
  ctx.moveTo(mx(15), my(12));
  ctx.lineTo(mx(30), my(12));
  ctx.lineTo(mx(22), my(12 - 9 * flap));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 눈
  ctx.shadowBlur = 0;
  ctx.fillStyle = col.p2;
  ctx.beginPath();
  ctx.arc(mx(12), my(12), 1.4 * SC, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 장면 렌더러 (순수 그리기 — state는 읽기만)
// ---------------------------------------------------------------------------
function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game6State,
  fx: readonly Fx[],
  now: number,
  p1IsYou: boolean,
  p2IsYou: boolean,
): void {
  // 색은 플레이어 종속(역할 아님) — P1/P2 기능 엔티티를 실제 플레이어 색으로 칠한다.
  //  P1엔티티가 파랑이면 COL0 그대로, 빨강이면 p1/p2 색 스왑. 로컬 COL을 shadow → 아래 COL.p1/p2·헬퍼가 자동 반영.
  const fc = functionColors();
  const COL: ColPalette =
    fc.p1 === 'red'
      ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
      : COL0;
  // 상태 구동 P2 글로우(스폰 섬광·리로드 게이지 외곽)용 rgb — 하드코딩 핑크가 아니라 P2 플레이어 색을 따른다.
  const p2rgb = fc.p2 === 'red' ? '255,42,109' : '5,217,232';
  const horizon = Y(G6.GROUND_Y);
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const crashed = s.result === 'P2';
  const resultFx = fx.find((f) => f.kind === 'chroma' || f.kind === 'rush');
  const resultAge = resultFx ? now - resultFx.t : Infinity;
  const gridCol = urgent ? 'rgba(255,42,109,0.16)' : 'rgba(211,0,197,0.13)';

  // --- 하늘 필드 ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // --- 별(패럴랙스) ---
  ctx.save();
  ctx.fillStyle = COL.muted;
  for (const st of STARS) {
    const sx = (st.x - s.elapsed * G6.OBST_SPEED * SC * st.z * 0.25) % CW;
    const x = sx < 0 ? sx + CW : sx;
    ctx.globalAlpha = 0.15 + st.z * 0.3;
    ctx.fillRect(x, st.y, st.r, st.r);
  }
  ctx.restore();

  // --- 지면 아래 신스웨이브 원근 그리드 ---
  ctx.save();
  const vpx = CW / 2;
  // 수렴하는 세로줄
  ctx.strokeStyle = gridCol;
  ctx.lineWidth = 1;
  for (let k = -7; k <= 7; k++) {
    ctx.beginPath();
    ctx.moveTo(vpx, horizon);
    ctx.lineTo(vpx + k * 96, CH);
    ctx.stroke();
  }
  // 다가오는 가로줄(아래로 흐름 = 전진감)
  const gscroll = (s.elapsed * 0.7) % 1;
  const N = 9;
  for (let j = 0; j < N; j++) {
    const t = (j + gscroll) / N;
    const y = horizon + (CH - horizon) * t * t;
    ctx.globalAlpha = 0.15 + t * 0.55;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CW, y);
    ctx.stroke();
  }
  ctx.restore();

  // --- 지면선(시안) + 스피드 대시 스크롤 ---
  ctx.save();
  ctx.strokeStyle = COL.p1;
  ctx.shadowColor = COL.p1;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(CW, horizon);
  ctx.stroke();
  // 지면 위 짧은 대시(왼쪽으로 흘러 속도감)
  ctx.shadowBlur = 6;
  ctx.globalAlpha = 0.7;
  const gap = 60;
  const off = (s.elapsed * G6.OBST_SPEED * SC) % gap;
  ctx.lineWidth = 1.5;
  for (let x = -off; x < CW; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x, horizon + 8);
    ctx.lineTo(x + 22, horizon + 8);
    ctx.stroke();
  }
  ctx.restore();

  // 임박 5초: 상승 스캔라인(핑크)
  if (urgent) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,42,109,0.10)';
    ctx.lineWidth = 1;
    const so = 40 - ((now / 8) % 40);
    for (let y = so; y < horizon; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CW, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- 장애물(핑크) ---
  for (const o of s.obstacles) {
    if (o.type === 'jump') drawCactus(ctx, X(o.x), horizon, COL);
    else drawBird(ctx, X(o.x), Y(G6.BIRD_TOP), o.phase, COL);
  }

  // --- P2 투척 섬광(spawnAnim 파생) — 오른쪽 끝에서 장애물이 튀어나오는 순간 ---
  if (s.spawnAnim > 0) {
    const a = Math.min(1, s.spawnAnim / G6.SPAWN_ANIM);
    ctx.save();
    ctx.globalAlpha = 0.5 * a;
    const grad = ctx.createLinearGradient(CW, 0, CW - 90, 0);
    grad.addColorStop(0, `rgba(${p2rgb},0.9)`);
    grad.addColorStop(1, `rgba(${p2rgb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(CW - 90, horizon - 150, 90, 170);
    ctx.restore();
  }

  // --- 공룡(P1, 시안) ---
  const dinoBottom = horizon - Y(s.y);
  const blink = crashed && resultAge < RESULT_FX_MS && Math.floor(now / 60) % 2 === 0;
  const showDino = !(crashed && resultAge > RESULT_FX_MS * 0.55); // 충돌 후 파편으로 대체
  if (showDino) {
    drawDino(
      ctx,
      X(G6.DINO_X),
      dinoBottom,
      s.ducking && s.grounded,
      s.grounded,
      s.runPhase,
      blink,
      COL,
    );
  }
  // 공룡 그림자(지면 원형)
  if (s.result === null) {
    ctx.save();
    ctx.globalAlpha = s.grounded ? 0.35 : 0.18;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(X(G6.DINO_X + G6.DINO_W / 2), horizon + 3, X(22), 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- 플레이어 배지 ---
  ctx.save();
  ctx.font = `10px ${ARCADE_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = COL.p1;
  ctx.shadowColor = COL.p1;
  ctx.shadowBlur = 6;
  ctx.fillText('P1', X(G6.DINO_X + G6.DINO_W / 2), dinoBottom - Y(G6.DINO_H) - 8);
  if (p1IsYou && Math.floor(now / 500) % 2 === 0) {
    ctx.fillStyle = COL.accent;
    ctx.shadowColor = COL.accent;
    ctx.fillText('YOU', X(G6.DINO_X + G6.DINO_W / 2), dinoBottom - Y(G6.DINO_H) - 22);
  }
  ctx.restore();

  // --- P2 리로드 게이지(우상단) — 코어 cooldown/cooldownMax 노출 ---
  {
    const ready = s.cooldown <= 0;
    const ratio = ready ? 1 : 1 - s.cooldown / Math.max(0.0001, s.cooldownMax);
    const gw = 150;
    const gh = 12;
    const gx = CW - gw - 20;
    const gy = 18;
    ctx.save();
    ctx.font = `9px ${ARCADE_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = COL.p2;
    ctx.shadowColor = COL.p2;
    ctx.shadowBlur = ready ? 8 : 0;
    ctx.fillText(p2IsYou ? 'P2(YOU) RELOAD' : 'P2 RELOAD', gx + gw, gy - 4);
    ctx.shadowBlur = 0;
    // 트랙
    ctx.strokeStyle = `rgba(${p2rgb},0.4)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.fillStyle = COL.p2dim;
    ctx.fillRect(gx, gy, gw, gh);
    // 채움
    const blinkReady = ready && Math.floor(now / 200) % 2 === 0;
    ctx.fillStyle = COL.p2;
    ctx.globalAlpha = ready ? (blinkReady ? 1 : 0.75) : 0.9;
    ctx.shadowColor = COL.p2;
    ctx.shadowBlur = ready ? 10 : 4;
    ctx.fillRect(gx + 1, gy + 1, (gw - 2) * ratio, gh - 2);
    ctx.restore();
  }

  // --- 이펙트 ---
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'dust' && age < 320) {
      ctx.save();
      ctx.fillStyle = COL.muted;
      ctx.globalAlpha = Math.max(0, 0.5 - age / 640);
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 4; i++) {
        const d = 4 + age * 0.06 + i * 3;
        ctx.fillRect(cx - d, cy - (i % 2) * 3, 3, 3);
      }
      ctx.restore();
    } else if (f.kind === 'shards' && age < 640) {
      ctx.save();
      ctx.fillStyle = COL.p1;
      ctx.shadowColor = COL.p1;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = Math.max(0, 1 - age / 640);
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 7; i++) {
        const ang = (Math.PI * 2 * i) / 7 + 0.4;
        const dist = 8 + age * 0.13;
        ctx.fillRect(cx + Math.cos(ang) * dist - 3, cy + Math.sin(ang) * dist - 3, 6, 6);
      }
      ctx.restore();
    } else if (f.kind === 'spawn' && age < 260) {
      ctx.save();
      ctx.strokeStyle = COL.p2;
      ctx.shadowColor = COL.p2;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.globalAlpha = Math.max(0, 1 - age / 260);
      const mx = X(f.x);
      const myv = Y(f.y);
      ctx.beginPath();
      ctx.moveTo(mx - 10, myv);
      ctx.lineTo(mx + 10, myv);
      ctx.moveTo(mx, myv - 10);
      ctx.lineTo(mx, myv + 10);
      ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'caption' && age < f.life) {
      const on = Math.floor(age / 110) % 2 === 0 || age > 260; // steps 점멸 후 유지
      if (on) {
        ctx.save();
        ctx.font = `13px ${ARCADE_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 10;
        ctx.fillText(f.text, Math.min(CW - 60, Math.max(60, X(f.x))), Y(f.y));
        ctx.restore();
      }
    }
  }

  // --- 생존 승리 러쉬(지면선 시안 글로우 러쉬) ---
  const rush = fx.find((f) => f.kind === 'rush');
  if (rush) {
    const a = Math.min(1, (now - rush.t) / 260);
    ctx.save();
    const grad = ctx.createLinearGradient(0, horizon - 60, 0, horizon);
    grad.addColorStop(0, 'rgba(5,217,232,0)');
    grad.addColorStop(1, `rgba(5,217,232,${0.3 * a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizon - 60, CW, 60);
    ctx.restore();
  }

  // --- 충돌 순간 크로마틱 어버레이션(승패 순간에만 1프레임 계열) ---
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && now - chroma.t < 90) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(ctx.canvas, -5, 0, CW, CH);
    ctx.globalAlpha = 0.22;
    ctx.drawImage(ctx.canvas, 5, 0, CW, CH);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 테마별 렌더 디스패치 — 현재 테마의 bespoke drawScene을 고른다(없으면 neon 기본).
// 좌표/스케일은 GEOM으로 고정 전달 → 어떤 테마 조합이어도 동일 좌표계(크로스플레이 불변).
// getTheme()을 매 프레임 읽으므로 테마 전환은 다음 프레임에 즉시 반영.
// ---------------------------------------------------------------------------
const GEOM: Geom = { CW, CH, SC, X, Y, STARS };

function renderScene(
  ctx: CanvasRenderingContext2D,
  s: Game6State,
  fx: readonly Fx[],
  now: number,
  p1IsYou: boolean,
  p2IsYou: boolean,
): void {
  const draw = game6Draw[getTheme()];
  if (draw) draw(ctx, s, fx, now, p1IsYou, p2IsYou, GEOM);
  else drawScene(ctx, s, fx, now, p1IsYou, p2IsYou); // neon-coinop = 기본(로컬)
}

// ---------------------------------------------------------------------------
// 스냅샷 사이 보간(외삽) — 서버 스냅샷을 dt초만큼 각 오브젝트 '자기 속도'로 전진시킨
// 표시용 상태를 만든다. 스냅샷에 vy·grounded·obstacles가 이미 있어 ID 매칭이 불필요하고
// 추가 지연도 0. 착지/방향전환 순간만 미세 오차이며 다음 스냅샷이 즉시 교정한다.
// 30/60Hz 스냅샷을 60fps 렌더로 부드럽게 잇는 게 목적(장애물 순간이동·점프 계단 제거).
//  · 장애물: x -= OBST_SPEED·dt (좌진행).
//  · 공룡: 코어와 동일한 반암시적 오일러로 점프 아크(중력·패스트폴)를 전진.
//  · elapsed: 지면 대시·별·그리드 스크롤을 장애물과 같은 속도로 유지(백그라운드 저더 방지).
// ---------------------------------------------------------------------------
function extrapolate(s: Game6State, dt: number): Game6State {
  let y = s.y;
  let vy = s.vy;
  let grounded = s.grounded;
  if (!grounded) {
    const g = G6.GRAVITY * (s.ducking ? G6.FASTFALL_MULT : 1);
    vy -= g * dt;
    y += vy * dt;
    if (y <= 0) {
      y = 0;
      vy = 0;
      grounded = true;
    }
  }
  return {
    ...s,
    elapsed: s.elapsed + dt,
    y,
    vy,
    grounded,
    runPhase: s.runPhase + dt,
    obstacles: s.obstacles.map((o) => ({ ...o, x: o.x - G6.OBST_SPEED * dt, phase: o.phase + dt })),
  };
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------
export default function Game6() {
  useDebugScreen('scr-game6');
  const flow = useFlow();
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const fxRef = useRef<Fx[]>([]);
  // 종료 연출: result 전환 추적 → 기본 플래시(폭발 없음)
  const endRef = useRef<EndTracker>(createEndTracker());
  const passedRef = useRef<WeakSet<Obstacle>>(new WeakSet());
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const botNextAtRef = useRef(0);
  const duckRef = useRef(false);

  /** HUD 표시용 남은 시간(초 단위 양자화 — 리렌더 절약) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);
  /** W(숙이기)는 홀드 — 키캡을 점등 유지하기 위해 ducking 상태를 반영 */
  const [ducking, setDucking] = useState(false);

  const [qLit, flashQ] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();

  // 온라인 렌더 훅(성능 구조 표준) — 이 게임(id 4)이 현재 서버 매치의 라운드면 isOnline.
  //  · isOnline=false → 오프라인/직접진입(기존 로컬 시뮬·mock 봇 경로 100% 유지).
  //  · isOnline=true  → 로컬 시뮬/봇/판정을 끄고 서버 state를 렌더 + 내 입력만 서버로 전송.
  // 활성/역할만 '선택 구독'(라운드 경계에서만 리렌더), 서버 스냅샷(60Hz)은 stateRef/snapAtRef로
  // 미러(리렌더 없음). per-snapshot 작업(디버그 브리지·HUD 시간)은 onSnapshot으로 위임.
  const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game6State>(6, (s) => {
    setDebugGame(s); // 디버그 브리지 — 스냅샷마다 갱신(리렌더 유발 안 함)
    const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remainingMs / 1000) * 1000); // 초 양자화 → ~1/s만 리렌더
  });
  // 키보드 핸들러(안정 클로저)가 최신 '온라인 활성 여부'를 보게 하는 ref.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  // 온라인 입력 액션음은 역할에 따라 의미가 달라짐(P1=주자→점프/숙이기, P2=스포너→장애물 생성).
  // 키 핸들러 안정 클로저가 최신 역할을 보게 하는 ref.
  const myRoleRef = useRef(myRole);
  myRoleRef.current = myRole;

  // 내 색(매치 고정, 역할과 독립) — 키캡/HUD 색은 이 값으로. match:start에서만 바뀌므로
  // 원시값 선택 구독이라 60Hz 스냅샷엔 리렌더 없음(값 동일 시 useSyncExternalStore가 생략).
  const myColor = useSyncExternalStore(
    onlineStore.subscribe,
    () => onlineStore.get().myColor ?? 'blue',
    () => onlineStore.get().myColor ?? 'blue',
  );

  // direct-URL 복구 + 이탈 시 디버그 브리지 정리
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 6) startOfflineGame(6);
    return () => setDebugGame(null);
  }, []);

  // 캔버스 해상도 초기화(dpr 스케일)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // 키보드 — 로컬 어댑터. GameInputEvent 큐 + 램프 점등.
  // P1 Q=점프 / W=숙이기(홀드), P2 U=선인장 / I=새. 온라인이면 P2는 봇이 대행.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // 진짜 서버 온라인이 활성이면: 내 입력만 서버로 전송(로컬 큐/봇 미사용).
        // 어느 역할이든 서버가 role로 재기입하므로 4키 아무거나 눌러도 내 슬롯으로 감.
        if (isOnlineRef.current) {
          // 온라인은 U/I 두 키만(요구사항). U=주키(slotA=점프), I=보조키(slotB=숙이기). Q/W는 무시.
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          if (e.type === 'down') {
            if (e.code === 'KeyU') flashU();
            else flashI();
            // 역할별 액션음: P1(주자)=U 점프/I 숙이기, P2(스포너)=U/I 장애물 생성
            if (myRoleRef.current === 'P1') sfx(e.code === 'KeyU' ? 'g6-jump' : 'g6-duck');
            else sfx('g6-obstacle-spawn');
          }
          // I(보조키=숙이기)는 홀드 — 로컬 시각용 ducking 반영
          if (e.code === 'KeyI') setDucking(e.type === 'down');
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t);
          return;
        }
        // ── 오프라인(+ mock-online 봇) 경로 — 기존 동작 그대로 ──
        const f = getFlow();
        const mockOnline = f.mode === 'online';
        // KeyW(숙이기)는 홀드 — 램프는 ducking state가 담당(코어 판정 반영)하므로 flash 없음
        if (e.code === 'KeyQ') {
          if (e.type === 'down') {
            flashQ();
            sfx('g6-jump');
          }
        } else if (e.code === 'KeyW') {
          // 숙이기(홀드) — 램프는 ducking state가 담당하지만 진입 keydown에 액션음
          if (e.type === 'down') sfx('g6-duck');
        } else if (e.code === 'KeyU') {
          if (mockOnline) return; // 온라인 mock: P2(장애물)는 봇
          if (e.type === 'down') {
            flashU();
            sfx('g6-obstacle-spawn');
          }
        } else if (e.code === 'KeyI') {
          if (mockOnline) return;
          if (e.type === 'down') {
            flashI();
            sfx('g6-obstacle-spawn');
          }
        }
        if (f.phase === 'playing') actionsRef.current.push(e);
      },
    );
    return detach;
  }, [flashQ, flashU, flashI]);

  // 라운드 수명주기: state 생성 → rAF 루프(step + draw) → 결과 보고
  useEffect(() => {
    // ── 온라인(서버 권위): 로컬 시뮬/봇/판정 없이 서버 상태만 그린다(draw-only) ──
    if (isOnline) {
      // 첫 스냅샷 전이면 초기 create 상태를 렌더용으로만 세팅(판정 아님 — onSnapshot이 곧 덮어씀).
      if (!stateRef.current) {
        const seed = game6.create(Math.random);
        stateRef.current = seed;
        setDebugGame(seed);
        setHudMs(GAME_DURATION * 1000);
      }
      let raf = 0;
      // 온라인은 서버 스냅샷 구동 — 충돌 임팩트음을 result 전이(null→P2) 첫 프레임에 1회.
      let crashPlayed = false;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const ctx = canvasRef.current?.getContext('2d');
        const s = stateRef.current;
        if (ctx && s) {
          if (!crashPlayed && s.result === 'P2') {
            crashPlayed = true;
            sfx('g6-crash');
          }
          const disp = getPlayerDisplays(getFlow());
          fxRef.current = fxRef.current.filter((f) => now - f.t < 1200);
          // 스냅샷 사이 외삽: 마지막 스냅샷을 경과 dt만큼 자기 속도로 전진(최대 50ms 캡).
          // 종료(result) 시엔 외삽하지 않는다(파편/러쉬 연출을 서버 최종 상태 그대로 유지).
          const extraDt = Math.min(0.05, Math.max(0, (now - snapAtRef.current) / 1000));
          const view = extraDt > 0 && s.result === null ? extrapolate(s, extraDt) : s;
          renderScene(ctx, view, fxRef.current, now, disp.P1.isYou, disp.P2.isYou);
          endRef.current.update(s.result, now);
          drawEndFlash(ctx, CW, CH, endRef.current.age(now));
        }
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    if (flow.gameId !== 6 || flow.phase !== 'playing') return;

    const st = game6.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    fxRef.current = [];
    passedRef.current = new WeakSet();
    reportedRef.current = false;
    resultAtRef.current = 0;
    botNextAtRef.current = 0;
    duckRef.current = false;
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);
    setDucking(false);

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (isRoundIntroActive()) { last = now; return; }
      // 초 단위 dt, 물리 안정성을 위해 100ms 클램프(대형 dt 시 점프/충돌 튀는 것 방지)
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        const events = actionsRef.current;
        actionsRef.current = [];

        // 온라인 봇(P2, 장애물 생성): 쿨타임마다 무작위 장애물 투척 — 사람(P1)이 회피 가능하도록 딜레이
        if (getFlow().mode === 'online' && s.cooldown <= 0 && now >= botNextAtRef.current) {
          const code: 'KeyU' | 'KeyI' = Math.random() < 0.5 ? 'KeyU' : 'KeyI';
          const tSec = now / 1000;
          events.push({ code, type: 'down', t: tSec });
          events.push({ code, type: 'up', t: tSec });
          botNextAtRef.current = now + 220 + Math.random() * 380;
        }

        // step은 원본을 in-place mutate 후 동일 참조 반환 → 비교값은 호출 전에 스냅샷.
        const prevGrounded = s.grounded;
        const prevSpawnAnim = s.spawnAnim;

        s = game6.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s); // 디버그 브리지 — 매 틱

        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000); // 초 단위 양자화
        if (s.ducking !== duckRef.current) {
          duckRef.current = s.ducking;
          setDucking(s.ducking);
        }

        // ---- 렌더 전용 이펙트 파생 ----
        // 점프 이륙 순간 먼지 / 착지 순간 먼지
        if (prevGrounded && !s.grounded) {
          fxRef.current.push({ kind: 'dust', x: G6.DINO_X, y: G6.GROUND_Y, t: now });
        } else if (!prevGrounded && s.grounded) {
          fxRef.current.push({ kind: 'dust', x: G6.DINO_X, y: G6.GROUND_Y, t: now });
        }
        // P2 투척 순간(spawnAnim이 튀어오른 프레임) — 방금 생성된 장애물 레인에 섬광
        if (s.spawnAnim > prevSpawnAnim) {
          const newest = s.obstacles[s.obstacles.length - 1];
          const y =
            newest && newest.type === 'duck' ? G6.BIRD_TOP + G6.BIRD_H / 2 : G6.GROUND_Y - 24;
          fxRef.current.push({ kind: 'spawn', x: G6.W - 12, y, t: now });
        }
        // 근접 통과 "SAFE!" — 장애물이 공룡을 완전히 지나친 순간(1회)
        if (s.result === null) {
          for (const o of s.obstacles) {
            const w = o.type === 'jump' ? G6.CACTUS_W : G6.BIRD_W;
            if (o.x + w < G6.DINO_X && !passedRef.current.has(o)) {
              passedRef.current.add(o);
              fxRef.current.push({
                kind: 'caption',
                text: 'SAFE!',
                color: COL0.p1,
                x: G6.DINO_X + 4,
                y: G6.GROUND_Y - G6.DINO_H - 30,
                t: now,
                life: 420,
              });
            }
          }
        }
        // 판정 순간 연출(글리치는 승패 순간에만)
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          if (s.result === 'P2') {
            // 공룡 충돌 = P2 승 (패자 임팩트음 — 승리 팡파레는 전역 레이어)
            sfx('g6-crash');
            fxRef.current.push(
              { kind: 'chroma', t: now },
              { kind: 'shards', x: G6.DINO_X + G6.DINO_W / 2, y: G6.GROUND_Y - 24, t: now },
              {
                kind: 'caption',
                text: 'CRASH!',
                color: COL0.p2,
                x: G6.DINO_X + 12,
                y: G6.GROUND_Y - G6.DINO_H - 26,
                t: now,
                life: RESULT_FX_MS,
              },
            );
          } else {
            // 10초 생존 = P1 승
            fxRef.current.push(
              { kind: 'rush', t: now },
              {
                kind: 'caption',
                text: 'SURVIVED!',
                color: COL0.p1,
                x: G6.W / 2,
                y: G6.GROUND_Y - G6.DINO_H - 30,
                t: now,
                life: RESULT_FX_MS,
              },
            );
          }
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // 충돌/생존 연출을 짧게 보여준 뒤 라운드 종료 1회 보고 → ResultOverlay
        if (isOnline) return; // 온라인은 서버가 round:end 구동 — 화면은 관여 안 함
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        const disp = getPlayerDisplays(getFlow());
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1200);
        renderScene(ctx, s, fxRef.current, now, disp.P1.isYou, disp.P2.isYou);
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= 5000;

  return (
    <main data-testid="scr-game6" className="g6-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g6-topbar">
        <Button
          variant="tertiary"
          data-testid="btn-exit"
          onClick={() => {
            exitMatch();
            navigate('/');
          }}
        >
          ◀ 나가기
        </Button>
        <span className="g6-title font-display c-muted">게임6 · 공룡 달리기</span>
      </div>

      <div className="g6-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g6-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g6-canvas" aria-label="게임6 스테이지 — 공룡 달리기" />
      </div>

      {/* 온스크린 키캡 — 실제 배정 키 표기(SPEC Q2), 입력 순간 램프 점등. W는 홀드라 ducking 반영 */}
      {isOnline ? (
        // 온라인: U/I 두 키만 쓰고 내 역할만 조작. 색은 내 플레이어색(myColor)으로,
        // 동작 라벨/아이콘은 역할(myRole) 유지 — 비대칭 게임(P1=주자, P2=스포너).
        <div className="g6-keys g6-keys--online">
          <div className="g6-keys__group">
            <span
              className={`g6-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}
            >
              YOU · {myColor === 'blue' ? '파랑' : '빨강'} · {myRole === 'P1' ? 'RUN' : 'SPAWN'}
            </span>
            <KeyCap
              role={myColor === 'blue' ? 'P1' : 'P2'}
              keyChar="U"
              icon={myRole === 'P1' ? '▲' : '▂'}
              lit={uLit}
              label={myRole === 'P1' ? '점프' : '선인장'}
            />
            <KeyCap
              role={myColor === 'blue' ? 'P1' : 'P2'}
              keyChar="I"
              icon={myRole === 'P1' ? '▼' : '▔'}
              lit={iLit}
              label={myRole === 'P1' ? '숙이기' : '새'}
            />
          </div>
        </div>
      ) : (
        <div className="g6-keys">
          <div className="g6-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="▲" lit={qLit} label="점프" />
            <KeyCap role="P1" keyChar="W" icon="▼" lit={ducking} label="숙이기" />
            <span className="g6-keys__tag font-arcade c-p1">P1 · RUN</span>
          </div>
          <div className="g6-keys__group">
            <span className="g6-keys__tag font-arcade c-p2">P2 · SPAWN</span>
            <KeyCap role="P2" keyChar="U" icon="▂" lit={uLit} label="선인장" />
            <KeyCap role="P2" keyChar="I" icon="▔" lit={iLit} label="새" />
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}