/**
 * 게임7 — 스피드 오목 (NEON COIN-OP). 담당: game7 에이전트.
 * 컨테이너 testid: scr-game7 / 부품: game-stage(CRT 베젤), hud-*(HudFrame 내장), btn-exit
 *
 * ── 이 화면의 원칙 ──────────────────────────────────────────────
 *  · 로직/판정은 100% @madpump/shared game7 코어(create/step) + G7 상수 + maxRun 헬퍼만 재사용.
 *  · 렌더링(캔버스 네온 아트)은 처음부터 새로 작성 — game-lab 렌더러 비참조. design-lab import 0줄.
 *  · 색·폰트는 theme.css 토큰 값을 복사(캔버스는 CSS 변수를 못 읽으므로 hex 하드코딩).
 *
 * ── 게임(코어 로직 요약, shared/games/game7/logic.ts 주석 기준) ──
 *  · 7×7 교점 판(index=r*7+c). 스캐너 커서가 행 우선으로 판을 ~1s(=49×0.02s)에 한 바퀴 훑는다.
 *  · 턴제: 현재 턴 플레이어가 자기 배치키(P1=Q / P2=U)를 누르면 커서가 있는 교점에 돌을 놓고 즉시 턴 전환.
 *    제한시간(TURN_TIME) 안에 못 놓으면 시스템이 빈 교점에 랜덤 자동배치.
 *  · W(P1)/I(P2) = 턴 무관 FLASH_TIME(0.1s) 화면 플래시로 상대 시야 방해.
 *  · 먼저 가로/세로/대각 3목(WIN_RUN) → 즉시 승리. 시간 종료 시 2목 보유/밀집도로 판정(코어가 처리).
 *
 * ── 아트 디렉션: "스피드 오목 — 네온 그리드, 흐르는 스캐너"(PLAN §1 신스웨이브 시스템 파생) ──
 *  · 딥퍼블 판 위 퍼플 네온 그리드 + 플레이어색 스캐너 레티클(코너 브래킷)이 교점을 훑는다.
 *  · 돌 = dim 바탕 + 2px 플레이어색 링 + 절제된 글로우(순색 대면적 금지). 방금 놓인 돌만 강한 펄스.
 *  · 3목 완성 순간 승자색 발광 라인 + 짧은 글리치. 플래시는 판 위 CRT 간섭 노이즈로 표현.
 *  · 강한 발광요소는 스캐너 레티클 / 턴타임 바 / (일시적) 배치 펄스·승리 라인으로 3개 이하 유지.
 *
 * ── 배선(게임1·2 화면과 동일 패턴) ──
 *  mount → idle이거나 다른 게임이면 startOfflineGame(7) (direct-URL 복구)
 *  라운드마다 game7.create(Math.random) → rAF 루프에서 game7.step(state, events, dtSec) → 매 틱 setDebugGame
 *  입력: attachLocalKeyboard(GameInputEvent 큐) → step에 그대로 전달. KeyQ/KeyW=P1, KeyU/KeyI=P2.
 *  코어는 원본 mutate 후 동일 참조 반환 → 이전값 비교는 step 호출 전 스냅샷, HUD는 스칼라를 React state로.
 *  result 확정 → (RESULT_FX_MS 연출 후) reportRoundEnd 1회(reportedRef 가드) → <ResultOverlay />
 *  online 모드 → P2는 봇(maxRun 기반 휴리스틱으로 목표 교점 선택 후 커서가 지날 때 KeyU 합성, 가끔 KeyI 방해)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { game7, G7, GAME_DURATION, maxRun } from '@madpump/shared';
import type { Game7State, GameInputEvent } from '@madpump/shared';
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
import { useOnlineRender } from '../../net/useOnlineRender';
import { sendInput as onlineSendInput } from '../../net/online';
import { setDebugGame, useDebugScreen } from '../../debug';
import ResultOverlay from './ResultOverlay';
import './game7.css';

// ---------------------------------------------------------------------------
// 캔버스 논리 해상도 (CSS로 반응형 스케일). 16:9 유지 — 정사각 판을 중앙에 두고 양옆 정보 컬럼.
// ---------------------------------------------------------------------------
const CW = 960;
const CH = 540;

const N = G7.N; // 7
const CELL = 56; // 교점 간격(px)
const BOARD = CELL * (N - 1); // 336
const BX = (CW - BOARD) / 2; // 312 (판 좌상단 x)
const BY = 118; // 판 좌상단 y
const BR = BX + BOARD; // 648
const BB = BY + BOARD; // 454
const STONE_R = 20;

// theme.css 토큰 값 복사 (§1.1)
const COL = {
  field: '#160a33', // --surface-deep
  raised: '#1a0b2e', // --bg-raised
  grid: '#d300c5', // --accent2 (네온 퍼플 그리드/보더)
  p1: '#05d9e8', // --p1 (좌 시안 고정)
  p1dim: '#0a3a4a', // --p1-dim
  p2: '#ff2a6d', // --p2 (우 핑크 고정)
  p2dim: '#4a0a26', // --p2-dim
  accent: '#fdf500', // --accent (코인 옐로 — HUD 카운트다운이 이미 소유, 스테이지에선 미사용)
  muted: '#9d8fbf', // --text-muted
  text: '#f4f0ff', // --text
  error: '#ff3864', // --error (턴타임 임박 경고)
} as const;

const FONT_ARCADE = '"Press Start 2P", monospace';
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** 판정 순간 → 결과 오버레이 전환 사이 인게임 연출 시간(승리 라인 + 글리치) */
const RESULT_FX_MS = 620;

// ---------------------------------------------------------------------------
// 순수 유틸 (렌더/봇 보조 — 코어 판정 비침범)
// ---------------------------------------------------------------------------

/** 교점 인덱스 → 캔버스 좌표/행열 */
function pt(idx: number): { x: number; y: number; r: number; c: number } {
  const r = Math.floor(idx / N);
  const c = idx % N;
  return { x: BX + c * CELL, y: BY + r * CELL, r, c };
}

function countStones(board: number[], player: number): number {
  let n = 0;
  for (let i = 0; i < board.length; i++) if (board[i] === player) n++;
  return n;
}

/** idx를 지나는 player 돌의 최장 연속 교점 목록(승리 라인 렌더용 기하) */
function runSegment(board: number[], idx: number, player: number): number[] {
  const r0 = Math.floor(idx / N);
  const c0 = idx % N;
  let best: number[] = [idx];
  for (const [dr, dc] of DIRS) {
    const line = [idx];
    for (const s of [1, -1]) {
      let r = r0 + dr * s;
      let c = c0 + dc * s;
      while (r >= 0 && r < N && c >= 0 && c < N && board[r * N + c] === player) {
        line.push(r * N + c);
        r += dr * s;
        c += dc * s;
      }
    }
    if (line.length > best.length) best = line;
  }
  return best;
}

/** 온라인 봇 착수 선택 — maxRun(공유 헬퍼) 기반. 내 3목>차단>연장>중앙 밀집 순 */
function pickBotMove(board: number[]): number {
  const empties: number[] = [];
  for (let i = 0; i < board.length; i++) if (board[i] === 0) empties.push(i);
  if (empties.length === 0) return 0;
  const center = (N - 1) / 2;
  let bestIdx = empties[0];
  let bestScore = -Infinity;
  for (const idx of empties) {
    const r = Math.floor(idx / N);
    const c = idx % N;
    let score = 0;
    const own = board.slice();
    own[idx] = 2;
    const ownRun = maxRun(own, 2);
    score += ownRun >= G7.WIN_RUN ? 1000 : ownRun * 10;
    const opp = board.slice();
    opp[idx] = 1;
    const oppRun = maxRun(opp, 1);
    score += oppRun >= G7.WIN_RUN ? 500 : oppRun * 4;
    score -= Math.abs(r - center) + Math.abs(c - center); // 밀집도 tiebreak 유리
    score += Math.random() * 0.5; // 미세 tiebreak
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

// ---------------------------------------------------------------------------
// 렌더 전용 이펙트
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'place'; idx: number; player: number; auto: boolean; t: number }
  | { kind: 'glitch'; t: number };

interface WinLine {
  seg: number[];
  player: number;
  t: number;
}

// ---------------------------------------------------------------------------
// 캔버스 렌더러 (순수 그리기 — state는 읽기만)
// ---------------------------------------------------------------------------
function txt(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  glow = 0,
  align: CanvasTextAlign = 'center',
): void {
  ctx.save();
  ctx.font = `${size}px ${FONT_ARCADE}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillText(s, x, y);
  ctx.restore();
}

function drawStone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  player: number,
  strong: boolean,
): void {
  const color = player === 1 ? COL.p1 : COL.p2;
  const dim = player === 1 ? COL.p1dim : COL.p2dim;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = strong ? 16 : 6; // 방금 놓인 돌만 강한 글로우 (§ 발광 절제)
  ctx.fillStyle = dim; // dim 바탕 (순색 대면적 금지)
  ctx.beginPath();
  ctx.arc(x, y, STONE_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color; // 2px 플레이어색 링
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = color; // 코어 도트
  ctx.beginPath();
  ctx.arc(x, y, STONE_R * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 스캐너 레티클 — 코너 브래킷 모티프(§1.3)로 현재 커서 교점을 조준 */
function drawReticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  now: number,
): void {
  const half = CELL * 0.46;
  const tick = 9;
  const pulse = 0.5 + 0.5 * Math.sin(now / 90);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 + pulse * 8;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'square';
  const corners: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [sx, sy] of corners) {
    const cxp = x + sx * half;
    const cyp = y + sy * half;
    ctx.beginPath();
    ctx.moveTo(cxp - sx * tick, cyp);
    ctx.lineTo(cxp, cyp);
    ctx.lineTo(cxp, cyp - sy * tick);
    ctx.stroke();
  }
  // 중앙 미세 십자
  ctx.globalAlpha = 0.4 + 0.4 * pulse;
  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.lineTo(x + 5, y);
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y + 5);
  ctx.stroke();
  ctx.restore();
}

function drawSidePanel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  player: number,
  board: number[],
  isTurn: boolean,
  isYou: boolean,
  now: number,
): void {
  const color = player === 1 ? COL.p1 : COL.p2;
  const label = player === 1 ? 'P1' : 'P2';
  const stones = countStones(board, player);
  const run = maxRun(board, player);
  const runHot = run >= 2; // 2목 보유 = 시간종료 시 유리
  // 라벨 (현재 턴이면 밝게)
  txt(ctx, label, cx, 172, 16, color, isTurn ? 10 : 3);
  if (isTurn) txt(ctx, 'TO PLAY', cx, 196, 8, color, 4);
  // 통계
  txt(ctx, `STONES ${stones}`, cx, 226, 10, COL.muted, 0);
  txt(ctx, `RUN ${run}`, cx, 252, 12, runHot ? color : COL.muted, runHot ? 6 : 0);
  // 진행 램프 3개(연속 목 수) — 3 = 승리 임박
  const lampY = 280;
  for (let i = 0; i < 3; i++) {
    const lx = cx - 26 + i * 26;
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, lampY, 6, 0, Math.PI * 2);
    if (i < run) {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fill();
    } else {
      ctx.fillStyle = COL.field;
      ctx.fill();
      ctx.strokeStyle = 'rgba(211,0,197,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
  // YOU 태그(온라인 내 쪽) — 하드 점멸
  if (isYou && Math.floor(now / 500) % 2 === 0) {
    txt(ctx, 'YOU', cx, 140, 10, color, 6);
  }
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game7State,
  now: number,
  fx: readonly Fx[],
  winLine: WinLine | null,
  meta: { p1IsYou: boolean; p2IsYou: boolean; reduced: boolean },
): void {
  const playing = s.result === null;
  const turnColor = s.turn === 1 ? COL.p1 : COL.p2;

  // --- 배경 ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // 판 뒤 옅은 방사광
  ctx.save();
  const glow = ctx.createRadialGradient(CW / 2, (BY + BB) / 2, 20, CW / 2, (BY + BB) / 2, BOARD * 0.9);
  glow.addColorStop(0, 'rgba(211,0,197,0.10)');
  glow.addColorStop(1, 'rgba(211,0,197,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(BX - 60, BY - 60, BOARD + 120, BOARD + 120);
  ctx.restore();

  // --- 네온 그리드 (교점 판) ---
  ctx.save();
  ctx.strokeStyle = 'rgba(211,0,197,0.45)';
  ctx.shadowColor = COL.grid;
  ctx.shadowBlur = 3;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < N; i++) {
    const gx = BX + i * CELL;
    ctx.beginPath();
    ctx.moveTo(gx, BY);
    ctx.lineTo(gx, BB);
    ctx.stroke();
    const gy = BY + i * CELL;
    ctx.beginPath();
    ctx.moveTo(BX, gy);
    ctx.lineTo(BR, gy);
    ctx.stroke();
  }
  ctx.restore();
  // 중앙 화점
  ctx.save();
  ctx.fillStyle = 'rgba(211,0,197,0.7)';
  const cpt = pt(3 * N + 3);
  ctx.beginPath();
  ctx.arc(cpt.x, cpt.y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- 스캔 행 밴드 (커서가 도는 현재 행 강조) ---
  if (playing) {
    const row = Math.floor(s.cursor / N);
    ctx.save();
    ctx.fillStyle = turnColor;
    ctx.globalAlpha = 0.05;
    ctx.fillRect(BX - 14, BY + row * CELL - CELL / 2, BOARD + 28, CELL);
    ctx.restore();
  }

  // --- 돌 ---
  for (let idx = 0; idx < s.board.length; idx++) {
    const p = s.board[idx];
    if (p === 0) continue;
    const { x, y } = pt(idx);
    drawStone(ctx, x, y, p, idx === s.lastPlaced);
  }

  // --- 배치 펄스 / AUTO 태그 ---
  for (const f of fx) {
    if (f.kind !== 'place') continue;
    const age = now - f.t;
    const { x, y } = pt(f.idx);
    const color = f.player === 1 ? COL.p1 : COL.p2;
    if (age < 520) {
      const prog = age / 520;
      ctx.save();
      ctx.globalAlpha = 1 - prog;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, STONE_R + prog * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (f.auto && age < 820) {
      // 시간초과 자동배치 표시
      txt(ctx, 'AUTO', x, y - STONE_R - 12, 10, COL.muted, 4);
    }
  }

  // --- 스캐너 레티클 (주 발광) ---
  if (playing) {
    const { x, y } = pt(s.cursor);
    drawReticle(ctx, x, y, turnColor, now);
  }

  // --- 승리 라인 (3목) ---
  if (winLine && winLine.seg.length >= 2) {
    const color = winLine.player === 1 ? COL.p1 : COL.p2;
    let a = pt(winLine.seg[0]);
    let b = a;
    let minI = winLine.seg[0];
    let maxI = winLine.seg[0];
    for (const i of winLine.seg) {
      if (i < minI) minI = i;
      if (i > maxI) maxI = i;
    }
    a = pt(minI);
    b = pt(maxI);
    const age = now - winLine.t;
    const grow = Math.min(1, age / 220);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + (b.x - a.x) * grow, a.y + (b.y - a.y) * grow);
    ctx.stroke();
    ctx.restore();
  }

  // --- 플래시 (시야 방해) — 판 위 CRT 간섭 ---
  if (s.flash > 0) {
    const a = Math.min(1, s.flash / G7.FLASH_TIME);
    ctx.save();
    ctx.fillStyle = `rgba(244,240,255,${0.5 * a})`;
    ctx.fillRect(BX - 18, BY - 18, BOARD + 36, BOARD + 36);
    if (!meta.reduced) {
      // 랜덤 스캔 노이즈 바 (감쇠운동 미사용 시 정적 워시)
      for (let y = BY; y < BB; y += 6) {
        if (Math.random() < 0.5) {
          ctx.fillStyle = Math.random() < 0.5 ? 'rgba(5,217,232,0.5)' : 'rgba(255,42,109,0.5)';
          ctx.globalAlpha = 0.4 * a;
          ctx.fillRect(BX - 18, y, BOARD + 36, 3);
        }
      }
    }
    ctx.restore();
  }

  // --- 상단 배너 ---
  if (playing) {
    const arrow = s.turn === 1 ? '▶' : '◀';
    const label = s.turn === 1 ? `${arrow} P1 TURN` : `P2 TURN ${arrow}`;
    txt(ctx, label, CW / 2, 70, 16, turnColor, 10);
  } else {
    const win = winLine ? '3 IN A ROW!' : 'TIME UP';
    const wc = winLine ? (winLine.player === 1 ? COL.p1 : COL.p2) : COL.muted;
    txt(ctx, win, CW / 2, 70, 16, wc, winLine ? 12 : 4);
  }

  // --- 턴타임 바 (남은 배치 시간) ---
  const remain = Math.max(0, 1 - s.turnClock / G7.TURN_TIME);
  const barY = 480;
  ctx.save();
  ctx.fillStyle = COL.raised;
  ctx.fillRect(BX, barY, BOARD, 12);
  ctx.strokeStyle = 'rgba(211,0,197,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(BX, barY, BOARD, 12);
  if (playing) {
    const warn = remain < 0.16; // 자동배치 임박 → error 색 하드 점멸
    const barColor = warn && Math.floor(now / 90) % 2 === 0 ? COL.error : turnColor;
    ctx.fillStyle = barColor;
    ctx.shadowColor = barColor;
    ctx.shadowBlur = 8;
    ctx.fillRect(BX, barY, BOARD * remain, 12);
  }
  ctx.restore();
  txt(ctx, 'PLACE TIME', CW / 2, barY + 26, 10, COL.muted, 0);

  // --- 좌/우 정보 컬럼 ---
  drawSidePanel(ctx, 156, 1, s.board, playing && s.turn === 1, meta.p1IsYou, now);
  drawSidePanel(ctx, 804, 2, s.board, playing && s.turn === 2, meta.p2IsYou, now);

  // --- 판정 순간 글리치 (승패 순간에만, 1회) ---
  const glitch = fx.find((f) => f.kind === 'glitch');
  if (glitch && !meta.reduced && now - glitch.t < 110) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.28;
    ctx.drawImage(ctx.canvas, -5, 0, CW, CH);
    ctx.globalAlpha = 0.2;
    ctx.drawImage(ctx.canvas, 5, 0, CW, CH);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------
export default function Game7() {
  useDebugScreen('scr-game7');
  const flow = useFlow();
  const navigate = useNavigate();

  // 온라인 렌더 훅(성능 표준) — 활성/역할만 선택 구독(라운드 경계에서만 리렌더),
  // 서버 스냅샷 → stateRef 미러링은 직접 스토어 구독(리렌더 없이). per-snapshot HUD 반영은 onSnapshot으로.
  //  · stateRef.current = 최신 서버 스냅샷, snapAtRef.current = 수신시각(로컬 커서 파생 기준).
  //  · isOnline/myRole은 안정 원시값 → 루프 effect deps에 넣어도 churn 없음(rAF 굶음 방지).
  const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game7State>(7, (s) => {
    // 서버 스냅샷마다: 디버그 브리지 + HUD 남은시간(초 양자화). stateRef/snapAtRef는 훅이 갱신.
    setDebugGame(s);
    const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remainingMs / 1000) * 1000);
  });
  // 키보드 핸들러(안정 클로저)가 최신 '온라인 활성 여부'를 보게 하는 ref.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const eventsRef = useRef<GameInputEvent[]>([]);
  const fxRef = useRef<Fx[]>([]);
  const winLineRef = useRef<WinLine | null>(null);
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const prevPlacedRef = useRef(-1);
  const botRef = useRef<{ target: number | null; placed: boolean; flashAt: number }>({
    target: null,
    placed: false,
    flashAt: 0,
  });
  const reducedRef = useRef(false);
  // 온라인 커서 로컬 파생용: 커서는 시간-결정적(스캔)이라 서버가 브로드캐스트할 필요 없음(요구사항).
  //   기준점은 마지막 스냅샷의 turnClock(=stateRef.current.turnClock)과 수신시각(snapAtRef.current) —
  //   클라가 로컬 클럭으로 부드럽게 굴리고, 놓는 순간의 '고른 칸'만 서버로 보낸다(sendInput cell).
  const localCursorRef = useRef(0);

  /** HUD 남은 시간(초 단위 양자화 — 리렌더 절약) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();
  const lampRef = useRef({ flashQ, flashW, flashU, flashI });
  lampRef.current = { flashQ, flashW, flashU, flashI };

  // direct-URL 복구 + prefers-reduced-motion 캐시 + 디버그 브리지 정리
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 7) startOfflineGame(7);
    reducedRef.current =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => setDebugGame(null);
  }, []);

  // 캔버스 해상도 (dpr 스케일)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // (서버 상태 미러링은 useOnlineRender의 onSnapshot 콜백으로 이동 — 리렌더 없이 stateRef/HUD 갱신)

  // 키보드 — GameInputEvent 큐 수집 + 램프 점등. 온라인 P2(U/I)는 봇이 대행하므로 흡수.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // ── 서버 온라인 활성: 로컬 큐/봇 안 씀 — 내 입력만 서버로 전송 ──
        // 온라인은 U/I 두 키만 사용(요구사항). U=놓기(slotA), I=방해(slotB). Q/W는 무시.
        // 서버가 슬롯을 내 role의 물리키로 재기입하므로 접속자는 자기 캐릭터를 조종한다.
        // 놓기(U)는 로컬 커서로 고른 칸(localCursorRef)을 함께 보낸다 — 서버가 커서를 관리하지 않는다.
        if (isOnlineRef.current) {
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          if (e.type === 'down') {
            if (e.code === 'KeyU') lampRef.current.flashU();
            else lampRef.current.flashI();
          }
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          const cell = e.code === 'KeyU' ? localCursorRef.current : undefined;
          onlineSendInput(slot, e.type, e.t, cell);
          return;
        }
        // ── 오프라인(로컬 2인 / flow.mode==='online'이면 P2 봇) — 회귀 금지 ──
        const f = getFlow();
        const offlineBotMode = f.mode === 'online';
        const isP2 = e.code === 'KeyU' || e.code === 'KeyI';
        if (offlineBotMode && isP2) return; // 오프라인 봇 모드: P2 = 봇
        if (e.type === 'down') {
          if (e.code === 'KeyQ') lampRef.current.flashQ();
          else if (e.code === 'KeyW') lampRef.current.flashW();
          else if (e.code === 'KeyU') lampRef.current.flashU();
          else if (e.code === 'KeyI') lampRef.current.flashI();
        }
        if (f.phase === 'playing') eventsRef.current.push(e);
      },
    );
    return detach;
  }, []);

  // 라운드 수명주기: state 생성 → rAF 루프(step + draw) → 결과 보고
  //   서버 온라인이 활성이면: 로컬 시뮬/봇/결과보고 없이 서버 상태만 그리는 draw-only 루프로 우회.
  useEffect(() => {
    // ── 서버 온라인: draw-only (로컬 step·봇·reportRoundEnd 없음) ──
    if (isOnline) {
      // 첫 스냅샷 전에는 초기 create 상태(빈 판)를 그린다. 훅의 onSnapshot이 서버 state로 덮어쓴다.
      if (!stateRef.current) stateRef.current = game7.create(Math.random);
      let oraf = 0;
      const oloop = (now: number) => {
        oraf = requestAnimationFrame(oloop);
        const s = stateRef.current;
        if (!s) return;
        // 커서는 서버 브로드캐스트를 쓰지 않고 로컬로 파생(부드럽게, 지터 없음).
        // 캔버스 준비(octx)와 무관하게 매 프레임 갱신 — 놓기 입력이 이 값을 '고른 칸'으로 서버에 보낸다.
        let drawn = s;
        if (s.result === null) {
          // 마지막 스냅샷의 turnClock(=s.turnClock, stateRef가 곧 최신 스냅샷) + 수신 후 경과(snapAtRef).
          const at = snapAtRef.current;
          const elapsedSinceSnap = at > 0 ? (now - at) / 1000 : 0;
          const localTurnClock = Math.min(G7.TURN_TIME, s.turnClock + elapsedSinceSnap);
          const localCursor = Math.min(
            G7.CELLS - 1,
            Math.max(0, Math.floor(localTurnClock / G7.CELL_TIME)),
          );
          localCursorRef.current = localCursor;
          drawn = { ...s, cursor: localCursor };
        }
        // octx는 매 프레임 새로 획득(캔버스가 늦게 붙어도 복구). null이면 그리기만 건너뛴다.
        const octx = canvasRef.current?.getContext('2d');
        if (!octx) return;
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
        const disp = getPlayerDisplays(getFlow());
        drawScene(octx, drawn, now, fxRef.current, winLineRef.current, {
          p1IsYou: disp.P1.isYou,
          p2IsYou: disp.P2.isYou,
          reduced: reducedRef.current,
        });
      };
      oraf = requestAnimationFrame(oloop);
      return () => cancelAnimationFrame(oraf);
    }

    if (flow.gameId !== 7 || flow.phase !== 'playing') return;

    const st = game7.create(Math.random);
    stateRef.current = st;
    eventsRef.current = [];
    fxRef.current = [];
    winLineRef.current = null;
    reportedRef.current = false;
    resultAtRef.current = 0;
    prevPlacedRef.current = -1;
    botRef.current = { target: null, placed: false, flashAt: 0 };
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);

    const ctx = canvasRef.current?.getContext('2d') ?? null;
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        const events = eventsRef.current;
        eventsRef.current = [];

        // 온라인 봇(P2) — 목표 교점을 커서가 지날 때 KeyU 합성, 상대 턴엔 가끔 KeyI로 방해
        if (getFlow().mode === 'online') {
          const bot = botRef.current;
          const tSec = now / 1000;
          if (s.turn === 1) {
            bot.target = null;
            bot.placed = false;
            if (bot.flashAt === 0) bot.flashAt = now + 2500 + Math.random() * 2500;
            if (now >= bot.flashAt) {
              events.push({ code: 'KeyI', type: 'down', t: tSec });
              lampRef.current.flashI();
              bot.flashAt = now + 3200 + Math.random() * 3200;
            }
          } else {
            if (bot.target === null) bot.target = pickBotMove(s.board);
            const predClock = s.turnClock + dt;
            const predCursor = Math.min(G7.CELLS - 1, Math.max(0, Math.floor(predClock / G7.CELL_TIME)));
            if (
              !bot.placed &&
              predClock < G7.TURN_TIME &&
              predCursor >= bot.target &&
              s.board[predCursor] === 0
            ) {
              events.push({ code: 'KeyU', type: 'down', t: tSec });
              lampRef.current.flashU();
              bot.placed = true;
            }
          }
        }

        // 코어는 원본 mutate 후 동일 참조 반환 → 이전값 비교는 호출 전 스냅샷
        s = game7.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);
        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);

        // 배치 이펙트 파생 (lastPlaced 변화 감지)
        if (s.lastPlaced !== prevPlacedRef.current && s.lastPlaced >= 0) {
          prevPlacedRef.current = s.lastPlaced;
          fxRef.current.push({
            kind: 'place',
            idx: s.lastPlaced,
            player: s.board[s.lastPlaced],
            auto: s.lastAuto,
            t: now,
          });
        }

        // 판정 순간 (1회) — 3목 즉시승이면 승리 라인 계산 + 글리치
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          if (s.elapsed < GAME_DURATION && (s.result === 'P1' || s.result === 'P2') && s.lastPlaced >= 0) {
            const player = s.result === 'P1' ? 1 : 2;
            winLineRef.current = { seg: runSegment(s.board, s.lastPlaced, player), player, t: now };
          }
          fxRef.current.push({ kind: 'glitch', t: now });
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        if (isOnline) return; // 온라인은 서버가 round:end 구동 — 화면은 보고하지 않음(방어적 가드)
        // 승리 라인/글리치를 짧게 보여준 뒤 라운드 종료 1회 보고 → ResultOverlay
        reportedRef.current = true;
        reportRoundEnd(s.result === 'P1' ? 'P1_WIN' : s.result === 'P2' ? 'P2_WIN' : 'DRAW');
      }

      if (ctx) {
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
        const disp = getPlayerDisplays(getFlow());
        drawScene(ctx, s, now, fxRef.current, winLineRef.current, {
          p1IsYou: disp.P1.isYou,
          p2IsYou: disp.P2.isYou,
          reduced: reducedRef.current,
        });
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // isOnline/myRole(안정 원시값)로 게이팅 — online 객체를 넣으면 매 렌더 재실행되어 rAF가 굶는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= 5000;

  return (
    <main data-testid="scr-game7" className="g7-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g7-topbar">
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
        <span className="g7-title font-display c-muted">게임7 · 스피드 오목</span>
      </div>

      <div className="g7-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g7-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g7-canvas" aria-label="게임7 스테이지 — 스피드 오목" />

        {flow.phase === 'playing' && flow.currentRound > 0 && (
          <div key={flow.currentRound} className="g7-round-intro" aria-hidden>
            <span className="font-arcade c-accent glow-text g7-round-intro__big">
              ROUND {flow.currentRound}
            </span>
            <span className="font-display c-p1 g7-round-intro__sub">먼저 3목을 만들어라</span>
          </div>
        )}
      </div>

      {/* 온스크린 키캡 — 실제 배정 키 표기(SPEC Q2), 입력 순간 램프 점등 */}
      {isOnline ? (
        // 온라인: U/I 두 키만 사용 → 로컬 플레이어(내 role)의 컨트롤만 내 색으로 표기.
        <div className="g7-keys g7-keys--online">
          <div className="g7-keys__group">
            <span className={`g7-keys__tag font-arcade ${myRole === 'P1' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myRole === 'P1' ? '파랑' : '빨강'} · PLACE
            </span>
            <KeyCap role={myRole ?? 'P2'} keyChar="U" icon="●" lit={uLit} label="놓기" />
            <KeyCap role={myRole ?? 'P2'} keyChar="I" icon="✦" lit={iLit} label="방해" />
          </div>
          <span className="g7-keys__hint font-arcade c-muted">AIM SCANNER · FIRST 3-ROW WINS</span>
        </div>
      ) : (
        <div className="g7-keys">
          <div className="g7-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="●" lit={qLit} label="놓기" />
            <KeyCap role="P1" keyChar="W" icon="✦" lit={wLit} label="방해" />
            <span className="g7-keys__tag font-arcade c-p1">P1 · PLACE</span>
          </div>
          <span className="g7-keys__hint font-arcade c-muted">AIM SCANNER · FIRST 3-ROW WINS</span>
          <div className="g7-keys__group">
            <span className="g7-keys__tag font-arcade c-p2">P2 · PLACE</span>
            <KeyCap role="P2" keyChar="U" icon="●" lit={uLit} label="놓기" />
            <KeyCap role="P2" keyChar="I" icon="✦" lit={iLit} label="방해" />
          </div>
        </div>
      )}

      <ResultOverlay />
    </main>
  );
}
