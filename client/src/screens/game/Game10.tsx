/**
 * 게임9 · 줄다리기 (Tug of War) — NEON COIN-OP 화면. 담당: game10 에이전트.
 * 컨테이너 testid: scr-game10 / 부품: game-stage(CRT 베젤), hud-*(HudFrame 내장), btn-exit
 *
 * ── 원칙 ────────────────────────────────────────────────────────────
 *  · 로직/판정은 100% @madpump/shared game10 코어(create/step)로만 구동.
 *  · 화면·렌더링은 이 파일에서 처음부터 새로 작성한 네온 캔버스 씬 (game-lab 렌더러 미참조).
 *  · design-lab import 0줄 — 색/폰트는 theme.css 토큰값을 복사한 상수로만 사용.
 *
 * ── 코어 상태(로직 파일 요약) → 화면 파생 ───────────────────────────
 *  · pos ∈ [-1,1]: 밧줄 매듭 위치. -1=P1 완승선(왼쪽·시안), +1=P2 완승선(오른쪽·핑크).
 *  · 각 팀은 두 키를 "교대"로 눌러 당긴다(P1 Q↔W, P2 U↔I). 같은 키 연타는 무효.
 *  · p1LastKey/p2LastKey → 다음에 눌러야 할 키(NEXT 힌트)로 시각화(순수 상태 파생).
 *  · p1Pulls/p2Pulls → 아케이드 스코어(당김 횟수), p1Flash/p2Flash → 당김 순간 야크 연출.
 *  · 완승선 도달 즉시 승리 / 10초 종료 시 매듭이 있는 쪽 승(정중앙 DRAW).
 *
 * ── 배선(게임1·2와 동일 패턴) ──────────────────────────────────────
 *  mount → idle이거나 다른 게임이면 startOfflineGame(10) (direct-URL 복구)
 *  라운드마다 game10.create(Math.random) → rAF 루프에서 game10.step(state, events, dt초)
 *  step은 원본 mutate 후 동일 참조 반환 → stateRef로 연속성 유지, 매 틱 setDebugGame(state)
 *  입력 attachLocalKeyboard(GameInputEvent 큐): KeyQ/KeyW=P1, KeyU/KeyI=P2
 *  online 모드 → P2는 봇(U↔I 교대 연타 합성), 사람은 P1(q/w)
 *  result 확정 → 슬램 연출(RESULT_FX_MS) 후 reportRoundEnd(매핑) 1회 → <ResultOverlay />
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { game10, G10, GAME_DURATION } from '@madpump/shared';
import type { Game10State, GameInputEvent } from '@madpump/shared';
import { attachLocalKeyboard } from '../../game/input/keyboard';
import { useOnlineRender } from '../../net/useOnlineRender';
import { sendInput as onlineSendInput } from '../../net/online';
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
import './game10.css';

// ---------------------------------------------------------------------------
// 캔버스 상수 (논리 해상도 960×540 = 16:9, CSS로 반응형 스케일 · DPR 별도).
// 코어의 유일한 좌표는 정규화된 pos(-1..1)뿐이라 나머지는 캔버스 px로 직접 배치.
// ---------------------------------------------------------------------------
const CW = 960;
const CH = 540;

const ROPE_Y = 292; // 밧줄 라인 y
const CENTER_X = 480; // pos=0
const HALF_SPAN = 348; // pos=±1 까지의 좌우 거리
const LEFT_GOAL_X = CENTER_X - HALF_SPAN; // 132 (pos=-1, P1 완승선)
const RIGHT_GOAL_X = CENTER_X + HALF_SPAN; // 828 (pos=+1, P2 완승선)
const LEFT_BASE_X = 66; // P1 앵커(팀 위치)
const RIGHT_BASE_X = 894; // P2 앵커
const FLOOR_Y = ROPE_Y + 60;

const ARCADE = '"Press Start 2P", monospace';

/** theme.css 토큰값 복사 (캔버스는 CSS 변수를 읽지 못하므로 hex 상수로) */
const COL = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  text: '#f4f0ff', // --text
  muted: '#9d8fbf', // --text-muted
  accent: '#fdf500', // --accent (코인옐로)
  accent2: '#d300c5', // --accent2 (네온퍼플)
  p1: '#05d9e8', // --p1 (시안, 왼쪽 고정)
  p1dim: '#0a3a4a', // --p1-dim
  p2: '#ff2a6d', // --p2 (핑크, 오른쪽 고정)
  p2dim: '#4a0a26', // --p2-dim
} as const;

/** 판정 → 결과 오버레이 전환 사이 인게임 슬램 연출 시간 */
const RESULT_FX_MS = 620;

const clampPos = (v: number) => Math.max(-1.03, Math.min(1.03, v));
const clampLean = (v: number) => Math.max(-6, Math.min(30, v));
const markerXOf = (pos: number) => CENTER_X + clampPos(pos) * HALF_SPAN;

// ---------------------------------------------------------------------------
// 이펙트 (렌더 전용 — 로직 비침범)
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'shock'; side: 'P1' | 'P2'; t: number }
  | { kind: 'chroma'; t: number }
  | { kind: 'win'; winner: 'P1' | 'P2' | 'DRAW'; t: number };

interface Trail {
  x: number;
  t: number;
}

interface WhoYou {
  p1IsYou: boolean;
  p2IsYou: boolean;
}

/** 코어 result → 셸 MatchResult */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): 'P1_WIN' | 'P2_WIN' | 'DRAW' {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

// ---------------------------------------------------------------------------
// 렌더 헬퍼 (순수 그리기 — state는 읽기만)
// ---------------------------------------------------------------------------

/** 발광 밧줄 세그먼트(약간의 처짐 + 안쪽 하이라이트 심지) */
function drawRopeSeg(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  color: string,
): void {
  const mx = (x1 + x2) / 2;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, ROPE_Y);
  ctx.quadraticCurveTo(mx, ROPE_Y + 7, x2, ROPE_Y);
  ctx.stroke();
  // 심지 하이라이트
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(244,240,255,0.85)';
  ctx.beginPath();
  ctx.moveTo(x1, ROPE_Y);
  ctx.quadraticCurveTo(mx, ROPE_Y + 7, x2, ROPE_Y);
  ctx.stroke();
  ctx.restore();
}

/** 네온 스틱 파이터(줄다리기 자세: 몸은 바깥으로 젖히고 팔은 밧줄로) */
function drawPuller(
  ctx: CanvasRenderingContext2D,
  side: 'P1' | 'P2',
  baseX: number,
  lean: number,
  isYou: boolean,
  now: number,
): void {
  const isP1 = side === 'P1';
  const color = isP1 ? COL.p1 : COL.p2;
  const dir = isP1 ? -1 : 1; // 바깥(당기는) 방향
  const hipY = ROPE_Y + 30;
  const shoulderX = baseX + dir * lean;
  const shoulderY = ROPE_Y + 2;
  const headX = shoulderX + dir * 4;
  const headY = ROPE_Y - 16;
  const gripX = baseX - dir * 24; // 손은 밧줄(중앙쪽)으로
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2.6;
  // 몸통
  ctx.beginPath();
  ctx.moveTo(baseX, hipY);
  ctx.lineTo(shoulderX, shoulderY);
  ctx.stroke();
  // 팔 → 밧줄 그립
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(gripX, ROPE_Y);
  ctx.stroke();
  // 다리 (바깥 버팀 + 안쪽 지지)
  ctx.beginPath();
  ctx.moveTo(baseX, hipY);
  ctx.lineTo(baseX + dir * 16, FLOOR_Y);
  ctx.moveTo(baseX, hipY);
  ctx.lineTo(baseX - dir * 10, FLOOR_Y);
  ctx.stroke();
  // 머리
  ctx.beginPath();
  ctx.arc(headX, headY, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // YOU 태그(온라인 내 쪽) — steps 점멸
  if (isYou && Math.floor(now / 500) % 2 === 0) {
    ctx.save();
    ctx.font = `10px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = COL.accent;
    ctx.shadowColor = COL.accent;
    ctx.shadowBlur = 8;
    ctx.fillText('YOU', headX, headY - 16);
    ctx.restore();
  }
}

/** 밧줄 매듭 + 펜넌트 깃발 */
function drawKnot(
  ctx: CanvasRenderingContext2D,
  markerX: number,
  pos: number,
  now: number,
  reduce: boolean,
): void {
  const color = pos < -0.02 ? COL.p1 : pos > 0.02 ? COL.p2 : COL.text;
  // 매듭 (마름모)
  ctx.save();
  ctx.translate(markerX, ROPE_Y);
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-9, -9, 18, 18);
  ctx.restore();
  // 밝은 중심
  ctx.save();
  ctx.fillStyle = COL.text;
  ctx.beginPath();
  ctx.arc(markerX, ROPE_Y, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 깃대 + 펜넌트(이기는 쪽을 향함)
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(markerX, ROPE_Y - 10);
  ctx.lineTo(markerX, ROPE_Y - 52);
  ctx.stroke();
  const flutter = reduce ? 0 : Math.sin(now / 90) * 3;
  const dirSign = pos < 0 ? -1 : 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(markerX, ROPE_Y - 52);
  ctx.lineTo(markerX + dirSign * 26, ROPE_Y - 46 + flutter);
  ctx.lineTo(markerX, ROPE_Y - 40);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game10State,
  fx: readonly Fx[],
  trail: readonly Trail[],
  now: number,
  who: WhoYou,
  reduce: boolean,
): void {
  const pos = clampPos(s.pos);
  const markerX = markerXOf(s.pos);
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const winFx = fx.find((f): f is Extract<Fx, { kind: 'win' }> => f.kind === 'win');
  const winAge = winFx ? now - winFx.t : Infinity;

  // --- 배경 ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // 초대형 워터마크 "PULL" (비발광, 아주 옅게)
  ctx.save();
  ctx.font = `bold 150px ${ARCADE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(211,0,197,0.06)';
  ctx.strokeText('PULL', CENTER_X, ROPE_Y - 20);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';

  // 그리드 밴드
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,42,109,0.10)' : 'rgba(211,0,197,0.08)';
  ctx.lineWidth = 1;
  for (let gx = LEFT_GOAL_X; gx <= RIGHT_GOAL_X; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, ROPE_Y - 150);
    ctx.lineTo(gx, FLOOR_Y);
    ctx.stroke();
  }
  for (let gy = ROPE_Y - 120; gy < FLOOR_Y; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(LEFT_GOAL_X, gy);
    ctx.lineTo(RIGHT_GOAL_X, gy);
    ctx.stroke();
  }
  ctx.restore();

  // 바닥 라인
  ctx.save();
  ctx.strokeStyle = 'rgba(211,0,197,0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, FLOOR_Y);
  ctx.lineTo(CW - 40, FLOOR_Y);
  ctx.stroke();
  ctx.restore();

  // --- 완승선 존 (양쪽) ---
  for (const side of ['P1', 'P2'] as const) {
    const isP1 = side === 'P1';
    const color = isP1 ? COL.p1 : COL.p2;
    const dim = isP1 ? COL.p1dim : COL.p2dim;
    const goalX = isP1 ? LEFT_GOAL_X : RIGHT_GOAL_X;
    const zoneX = isP1 ? 0 : RIGHT_GOAL_X;
    const zoneW = isP1 ? LEFT_GOAL_X : CW - RIGHT_GOAL_X;
    const near = Math.max(0, isP1 ? -pos : pos); // 이 완승선에 얼마나 근접(0..1)
    // dim 바탕(근접할수록 진해짐)
    ctx.save();
    ctx.fillStyle = dim;
    ctx.globalAlpha = 0.4 + near * 0.4;
    ctx.fillRect(zoneX, 0, zoneW, CH);
    ctx.restore();
    // 완승선(근접/승리 시 굵고 명멸)
    const hot = near > 0.72 || (winFx && winFx.winner === side);
    const blur = hot ? (reduce ? 16 : 12 + (Math.sin(now / 80) + 1) * 6) : 8;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.lineWidth = hot ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(goalX, 0);
    ctx.lineTo(goalX, CH);
    ctx.stroke();
    ctx.restore();
  }

  // --- 중앙 배틀라인 ---
  ctx.save();
  ctx.strokeStyle = 'rgba(211,0,197,0.55)';
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CENTER_X, ROPE_Y - 140);
  ctx.lineTo(CENTER_X, FLOOR_Y);
  ctx.stroke();
  ctx.restore();

  // --- 매듭 잔상 ---
  ctx.save();
  for (const tr of trail) {
    const age = now - tr.t;
    if (age > 220) continue;
    ctx.globalAlpha = 0.18 * (1 - age / 220);
    ctx.fillStyle = pos < 0 ? COL.p1 : COL.p2;
    ctx.fillRect(tr.x - 3, ROPE_Y - 3, 6, 6);
  }
  ctx.restore();

  // --- 밧줄 (매듭 기준 좌=시안 / 우=핑크) ---
  drawRopeSeg(ctx, LEFT_BASE_X + 16, markerX, COL.p1);
  drawRopeSeg(ctx, markerX, RIGHT_BASE_X - 16, COL.p2);

  // --- 파이터 (당김 순간 야크 + 우세 시 젖힘) ---
  const p1Lean = 8 + Math.max(0, -pos) * 16 + (s.p1Flash > 0 ? (s.p1Flash / G10.FLASH) * 6 : 0);
  const p2Lean = 8 + Math.max(0, pos) * 16 + (s.p2Flash > 0 ? (s.p2Flash / G10.FLASH) * 6 : 0);
  drawPuller(ctx, 'P1', LEFT_BASE_X, clampLean(p1Lean), who.p1IsYou, now);
  drawPuller(ctx, 'P2', RIGHT_BASE_X, clampLean(p2Lean), who.p2IsYou, now);

  // --- 매듭 + 깃발 ---
  drawKnot(ctx, markerX, pos, now, reduce);

  // --- 당김 충격파 링 ---
  for (const f of fx) {
    if (f.kind !== 'shock') continue;
    const age = now - f.t;
    if (age > 320) continue;
    const color = f.side === 'P1' ? COL.p1 : COL.p2;
    const ox = f.side === 'P1' ? LEFT_BASE_X + 30 : RIGHT_BASE_X - 30;
    ctx.save();
    ctx.globalAlpha = 0.5 * (1 - age / 320);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ox, ROPE_Y, 6 + age * 0.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // --- 캔버스 라벨: 완승선 / NEXT 힌트 / 당김 스코어 (Press Start 2P ≥10px) ---
  ctx.save();
  ctx.textAlign = 'center';
  // 완승선 캡션
  ctx.font = `12px ${ARCADE}`;
  ctx.fillStyle = COL.p1;
  ctx.fillText('P1 WIN', LEFT_GOAL_X / 2 + 8, 32);
  ctx.fillStyle = COL.p2;
  ctx.fillText('P2 WIN', (RIGHT_GOAL_X + CW) / 2 - 8, 32);
  // NEXT 키 힌트(교대 강제 시각화 — p1/p2LastKey 파생)
  const p1Next = s.p1LastKey === 'KeyQ' ? 'W' : s.p1LastKey === 'KeyW' ? 'Q' : 'Q W';
  const p2Next = s.p2LastKey === 'KeyU' ? 'I' : s.p2LastKey === 'KeyI' ? 'U' : 'U I';
  ctx.font = `10px ${ARCADE}`;
  ctx.fillStyle = COL.muted;
  ctx.fillText('NEXT', LEFT_BASE_X + 34, ROPE_Y - 104);
  ctx.fillText('NEXT', RIGHT_BASE_X - 34, ROPE_Y - 104);
  ctx.font = `16px ${ARCADE}`;
  ctx.fillStyle = COL.p1;
  ctx.shadowColor = COL.p1;
  ctx.shadowBlur = 8;
  ctx.fillText(p1Next, LEFT_BASE_X + 34, ROPE_Y - 82);
  ctx.fillStyle = COL.p2;
  ctx.shadowColor = COL.p2;
  ctx.fillText(p2Next, RIGHT_BASE_X - 34, ROPE_Y - 82);
  ctx.shadowBlur = 0;
  // 당김 스코어
  ctx.font = `10px ${ARCADE}`;
  ctx.fillStyle = COL.muted;
  ctx.fillText('PULLS', LEFT_BASE_X + 34, CH - 40);
  ctx.fillText('PULLS', RIGHT_BASE_X - 34, CH - 40);
  ctx.font = `16px ${ARCADE}`;
  ctx.fillStyle = COL.p1;
  ctx.fillText(String(s.p1Pulls), LEFT_BASE_X + 34, CH - 20);
  ctx.fillStyle = COL.p2;
  ctx.fillText(String(s.p2Pulls), RIGHT_BASE_X - 34, CH - 20);
  ctx.restore();

  // --- 승리 슬램 오버레이 (승패 순간에만) ---
  if (winFx && winAge < RESULT_FX_MS + 300) {
    const color =
      winFx.winner === 'P1' ? COL.p1 : winFx.winner === 'P2' ? COL.p2 : COL.accent2;
    const a = Math.max(0, 1 - winAge / (RESULT_FX_MS + 300));
    ctx.save();
    ctx.globalAlpha = 0.22 * a;
    ctx.fillStyle = color;
    if (winFx.winner === 'P1') ctx.fillRect(0, 0, CENTER_X, CH);
    else if (winFx.winner === 'P2') ctx.fillRect(CENTER_X, 0, CW - CENTER_X, CH);
    else ctx.fillRect(0, 0, CW, CH);
    ctx.restore();
    if (Math.floor(winAge / 120) % 2 === 0 || winAge > 360) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `24px ${ARCADE}`;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillText(winFx.winner === 'DRAW' ? 'DRAW' : `${winFx.winner} WINS`, CENTER_X, 92);
      ctx.restore();
    }
  }

  // --- 크로마틱 글리치 1프레임 (승패 순간, reduced-motion 존중) ---
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (!reduce && chroma && now - chroma.t < 90) {
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
export default function Game10() {
  useDebugScreen('scr-game10');
  const flow = useFlow();
  const navigate = useNavigate();

  // 온라인 렌더 훅(성능 표준). 활성/역할만 선택 구독 → 라운드 경계에서만 리렌더.
  // 서버 스냅샷은 stateRef로 미러(리렌더 없이)하고, per-snapshot HUD/디버그 반영만 onSnapshot에서.
  const { isOnline, myRole, stateRef } = useOnlineRender<Game10State>(10, (s) => {
    setDebugGame(s);
    const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remainingMs / 1000) * 1000);
  });
  // stale closure 방지: 키보드 콜백이 항상 최신 '온라인 활성 여부'를 보게 ref 미러.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const botRef = useRef<{ last: 'KeyU' | 'KeyI' | null; nextAt: number }>({ last: null, nextAt: 0 });
  const fxRef = useRef<Fx[]>([]);
  const trailRef = useRef<Trail[]>([]);
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  // 종료 연출: result 전환 추적 → 기본 플래시(폭발 없음)
  const endRef = useRef<EndTracker>(createEndTracker());

  /** HUD 표시용 남은 시간 (초 단위 양자화 — 리렌더 절약) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();
  const lampRef = useRef({ flashU, flashI });
  lampRef.current = { flashU, flashI };

  // direct-URL 복구 + 이탈 시 디버그 브리지 정리
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 10) startOfflineGame(10);
    return () => setDebugGame(null);
  }, []);

  // 캔버스 해상도 초기화 (DPR 스케일)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // 키보드 — 로컬 어댑터. GameInputEvent 큐 적재 + 램프 점등.
  // 온라인이면 P2 키는 봇이 대행하므로 흡수하지 않는다.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // 진짜 서버 온라인: 로컬 큐/봇 미사용 — 내 입력만 서버로 전송.
        // 4키 아무거나 눌러도 내 슬롯으로 감(서버가 role로 슬롯을 재기입).
        //   슬롯A = 주키(KeyQ/KeyU), 슬롯B = 보조키(KeyW/KeyI).
        if (isOnlineRef.current) {
          // 온라인은 U/I 두 키만(요구사항). U=주키(slotA), I=보조키(slotB). Q/W는 무시.
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          if (e.type === 'down') {
            if (e.code === 'KeyU') flashU();
            else flashI();
          }
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          return;
        }

        // --- 오프라인(로컬 2인 / 로컬 online mock 봇) : 기존 그대로 ---
        const f = getFlow();
        const localOnline = f.mode === 'online';
        const isP2 = e.code === 'KeyU' || e.code === 'KeyI';
        if (localOnline && isP2) return; // 온라인 P2 = 봇
        if (e.type === 'down') {
          if (e.code === 'KeyQ') flashQ();
          else if (e.code === 'KeyW') flashW();
          else if (e.code === 'KeyU') flashU();
          else if (e.code === 'KeyI') flashI();
        }
        if (f.phase === 'playing') actionsRef.current.push(e);
      },
    );
    return detach;
  }, [flashQ, flashW, flashU, flashI]);

  // 라운드 수명주기: state 생성 → rAF 루프(step + draw) → 결과 보고
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // ── 온라인: 서버 상태만 그리는 draw-only 루프(step·봇·result보고 없음) ──
    if (isOnline) {
      // 첫 스냅샷 전에도 그릴 게 있도록 중립 초기 상태를 준비(렌더 전용, step 안 함)
      if (!stateRef.current) {
        stateRef.current = game10.create(Math.random);
        setDebugGame(stateRef.current);
      }
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const s = stateRef.current;
        const ctx = canvasRef.current?.getContext('2d');
        if (!s || !ctx) return;
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
        const disp = getPlayerDisplays(getFlow());
        drawScene(
          ctx,
          s,
          fxRef.current,
          trailRef.current,
          now,
          { p1IsYou: disp.P1.isYou, p2IsYou: disp.P2.isYou },
          reduce,
        );
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    // ── 오프라인(로컬 시뮬 + 봇 + 결과 보고) : 기존 그대로 ──
    if (flow.gameId !== 10 || flow.phase !== 'playing') return;

    const st = game10.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    botRef.current = { last: null, nextAt: 0 };
    fxRef.current = [];
    trailRef.current = [];
    reportedRef.current = false;
    resultAtRef.current = 0;
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        const events = actionsRef.current;
        actionsRef.current = [];

        // 온라인 봇(P2): U↔I 교대 연타 합성 (사람 P1이 이길 여지가 있게 중간 템포)
        if (getFlow().mode === 'online' && now >= botRef.current.nextAt) {
          const nk: 'KeyU' | 'KeyI' = botRef.current.last === 'KeyU' ? 'KeyI' : 'KeyU';
          events.push({ code: nk, type: 'down', t: now / 1000 });
          botRef.current.last = nk;
          (nk === 'KeyU' ? lampRef.current.flashU : lampRef.current.flashI)();
          botRef.current.nextAt = now + 120 + Math.random() * 70;
        }

        // step은 원본 mutate 후 동일 참조 반환 → 비교값은 호출 전에 스칼라로 스냅샷
        const prevP1Pulls = s.p1Pulls;
        const prevP2Pulls = s.p2Pulls;
        const prevPos = s.pos;
        s = game10.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);
        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);

        // ---- 렌더 전용 파생 ----
        if (s.p1Pulls > prevP1Pulls) fxRef.current.push({ kind: 'shock', side: 'P1', t: now });
        if (s.p2Pulls > prevP2Pulls) fxRef.current.push({ kind: 'shock', side: 'P2', t: now });
        const mxPrev = markerXOf(prevPos);
        const mxNow = markerXOf(s.pos);
        if (Math.abs(mxNow - mxPrev) > 0.3) trailRef.current.push({ x: mxPrev, t: now });
        trailRef.current = trailRef.current.filter((tr) => now - tr.t < 220);

        // 판정 순간 (글리치는 승패 순간에만)
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          fxRef.current.push({ kind: 'win', winner: s.result, t: now });
          if (!reduce) fxRef.current.push({ kind: 'chroma', t: now });
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // 온라인은 서버가 round:end를 구동하므로 화면은 보고하지 않는다.
        if (isOnline) return;
        // 슬램 연출을 짧게 보여준 뒤 라운드 종료 1회 보고 → ResultOverlay
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
        const disp = getPlayerDisplays(getFlow());
        drawScene(
          ctx,
          s,
          fxRef.current,
          trailRef.current,
          now,
          { p1IsYou: disp.P1.isYou, p2IsYou: disp.P2.isYou },
          reduce,
        );
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= 5000;

  return (
    <main data-testid="scr-game10" className="g10-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g10-topbar">
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
        <span className="g10-title font-arcade c-muted">게임9 · 줄다리기</span>
      </div>

      <div className="g10-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g10-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g10-canvas" aria-label="게임9 스테이지 — 줄다리기" />

        {flow.phase === 'playing' && flow.currentRound > 0 && (
          <div key={flow.currentRound} className="g10-round-intro" aria-hidden>
            <span className="font-arcade c-accent glow-text g10-round-intro__big">
              ROUND {flow.currentRound}
            </span>
            <span className="font-arcade c-muted g10-round-intro__sub">ALT-MASH TO PULL!</span>
          </div>
        )}
      </div>

      {/* 온스크린 키캡. 온라인은 U/I 두 키만 쓰므로, 내 역할(색) 쪽 컨트롤만 표기·점등한다.
          오프라인은 기존 2인 레이아웃(Q/W ↔ U/I) 유지. */}
      {isOnline ? (
        <div className="g10-keys g10-keys--online">
          <div className="g10-keys__group">
            <span
              className={`g10-keys__tag font-arcade ${myRole === 'P1' ? 'c-p1' : 'c-p2'}`}
            >
              YOU · {myRole === 'P1' ? '파랑' : '빨강'} · 번갈아 당기기
            </span>
            <KeyCap
              role={myRole ?? 'P2'}
              keyChar="U"
              icon={myRole === 'P1' ? '◀' : '▶'}
              lit={uLit}
              label="당기기"
            />
            <KeyCap
              role={myRole ?? 'P2'}
              keyChar="I"
              icon={myRole === 'P1' ? '◀' : '▶'}
              lit={iLit}
              label="당기기"
            />
          </div>
          <span className="g10-keys__hint font-arcade c-muted">U↔I 교대 연타!</span>
        </div>
      ) : (
        <div className="g10-keys">
          <div className="g10-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="◀" lit={qLit} label="당기기" />
            <KeyCap role="P1" keyChar="W" icon="◀" lit={wLit} label="당기기" />
            <span className="g10-keys__tag font-arcade c-p1">P1 · 번갈아 당기기</span>
          </div>
          <span className="g10-keys__hint font-arcade c-muted">Q↔W · U↔I 교대 연타!</span>
          <div className="g10-keys__group">
            <span className="g10-keys__tag font-arcade c-p2">P2 · 번갈아 당기기</span>
            <KeyCap role="P2" keyChar="U" icon="▶" lit={uLit} label="당기기" />
            <KeyCap role="P2" keyChar="I" icon="▶" lit={iLit} label="당기기" />
          </div>
        </div>
      )}

      <ResultOverlay />
    </main>
  );
}