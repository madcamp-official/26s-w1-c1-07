/**
 * 게임11 · HOT POTATO (폭탄 돌리기) — NEON COIN-OP 화면. 담당: game11 에이전트.
 * 컨테이너 testid: scr-game11 / 부품: game-stage(CRT 베젤), hud-*(HudFrame 내장), btn-exit
 *
 * ── 원칙 (Game10.tsx 표준을 그대로 따름) ────────────────────────────
 *  · 로직/판정은 100% @madpump/shared game11 코어(create/step)로만 구동.
 *  · 화면·렌더링은 이 파일에서 새로 작성한 네온 캔버스 씬.
 *  · design-lab import 0줄 — 색/폰트는 theme.css 토큰값을 복사한 상수로만 사용.
 *  · 이 게임 화면의 모든 텍스트는 English (요구사항).
 *
 * ── 코어 상태(logic.ts 요약) → 화면 파생 ───────────────────────────
 *  · holder(1|2): 현재 폭탄 든 사람(1=P1 왼쪽, 2=P2 오른쪽). 폭발 시 든 쪽 패배(무승부 없음).
 *  · elapsed: 퓨즈 경과(초). ratio=elapsed/GAME_DURATION → 폭탄 색 검정→주황 lerp.
 *  · passAt: 마지막 패스 시각 → 0.2s 동안 폭탄이 이전→현재 holder로 날아가는 보간(autoPass면 다른 색조).
 *  · fake1/fake2: 그 플레이어가 상대쪽으로 폭탄을 살짝 튕겼다 되돌리는 페인트 연출(holder는 안 바뀜).
 *  · 규칙5: 남은 시간(10-elapsed)이 3초(G11.HIDE_UNDER) 이하면 카운트다운 숫자를 가리고 "???" 표시.
 *  · result 확정 → 진 쪽(폭탄 든 쪽) 위치에서 makeExplosion/drawExplosion 폭발 + 화면 흔들림.
 *
 * ── 배선(Game10과 동일 패턴) ───────────────────────────────────────
 *  online → 서버 스냅샷(stateRef)만 draw. offline → game11.create + step + 결과 보고.
 *  offline online-mock → P2 봇이 0.3~1.2s 랜덤 간격으로 U(PASS, 가끔 I 페이크).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { game11, G11, GAME_DURATION } from '@madpump/shared';
import type { Game11State, GameInputEvent } from '@madpump/shared';
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
import {
  createEndTracker,
  drawEndFlash,
  drawExplosion,
  makeExplosion,
  shakeOffset,
  type EndTracker,
  type Particle,
} from '../../game/endFx';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import './game11.css';

// ---------------------------------------------------------------------------
// 캔버스 상수 (논리 해상도 960×540 = 16:9, CSS로 반응형 스케일 · DPR 별도).
// 코어 좌표는 holder(1|2)/elapsed뿐이라 나머지는 캔버스 px로 직접 배치.
// ---------------------------------------------------------------------------
const CW = 960;
const CH = 540;

const CENTER_X = 480;
const P1_X = 262; // P1(왼쪽) 스탠드 x
const P2_X = 698; // P2(오른쪽) 스탠드 x
const GROUND_Y = 410; // 발판 라인 y
const BOMB_Y = 236; // 폭탄 부양 높이(정지 시)

const ARCADE = '"Press Start 2P", monospace';

/** 패스 비행 연출 시간(초) = 수신 쿨다운과 동일 */
const PASS_DUR = 0.2;
/** 페이크 페인트 연출 시간(초) */
const FAKE_DUR = 0.26;
/** 페이크 시 폭탄이 상대쪽으로 튀는 최대 px */
const FAKE_POKE = 60;
/** 플로트 텍스트(PASS!/FAKE) 노출 시간(초) */
const FLOAT_DUR = 0.5;

/** 판정 → 결과 오버레이 전환 사이 인게임 폭발 연출 시간 */
const RESULT_FX_MS = 620;

/**
 * theme.css 토큰값 복사 (캔버스는 CSS 변수를 못 읽으므로 hex 상수로). Game10의 COL0 그대로 복사.
 * p1=파랑(blue,시안), p2=빨강(red,핑크). drawScene에서 functionColors()로 실제 플레이어 색을 스왑.
 */
const COL0 = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  text: '#f4f0ff', // --text
  muted: '#9d8fbf', // --text-muted
  accent: '#fdf500', // --accent (코인옐로)
  accent2: '#d300c5', // --accent2 (네온퍼플)
  p1: '#05d9e8', // 파랑(blue) 기준색 — 시안
  p1dim: '#0a3a4a', // 파랑 dim
  p2: '#ff2a6d', // 빨강(red) 기준색 — 핑크
  p2dim: '#4a0a26', // 빨강 dim
} as const;

/** 색 팔레트 타입 — 스왑된 로컬 COL도 담기 위함 */
type Palette = { [K in keyof typeof COL0]: string };

// 폭탄 퓨즈 색: 검정 → 주황 (플레이어색과 무관한 고정 신호색)
const BOMB_COLD = [26, 26, 26] as const; // #1a1a1a
const BOMB_HOT = [255, 123, 0] as const; // #ff7b00
const AUTO_TINT = '#fdf500'; // autoPass 비행 색조 (코인옐로)
const SPARK = '#ffd23f';

interface WhoYou {
  p1IsYou: boolean;
  p2IsYou: boolean;
}

/** 코어 result → 셸 MatchResult */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): 'P1_WIN' | 'P2_WIN' | 'DRAW' {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const holderX = (h: 1 | 2) => (h === 1 ? P1_X : P2_X);

/** ratio(0..1)에 따른 폭탄 표면 색 rgb 문자열 */
function bombColor(ratio: number): string {
  const r = Math.round(lerp(BOMB_COLD[0], BOMB_HOT[0], ratio));
  const g = Math.round(lerp(BOMB_COLD[1], BOMB_HOT[1], ratio));
  const b = Math.round(lerp(BOMB_COLD[2], BOMB_HOT[2], ratio));
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// 렌더 헬퍼 (순수 그리기 — state는 읽기만)
// ---------------------------------------------------------------------------

/** 네온 스틱 플레이어 + 발판. holder면 폭탄을 향해 팔을 들고 발광 링. */
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  side: 'P1' | 'P2',
  x: number,
  isHolder: boolean,
  isYou: boolean,
  now: number,
  reduce: boolean,
  col: Palette,
): void {
  const color = side === 'P1' ? col.p1 : col.p2;
  const feetY = GROUND_Y;
  const bob = isHolder && !reduce ? Math.sin(now / 70) * 2 : 0;
  const hipY = feetY - 34 + bob;
  const shoulderY = feetY - 64 + bob;
  const headY = feetY - 80 + bob;
  const armReach = isHolder ? -18 : -6; // holder는 팔을 위로(폭탄쪽)

  // 발판(네온 슬래브)
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = isHolder ? 14 : 7;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 34, feetY + 8);
  ctx.lineTo(x + 34, feetY + 8);
  ctx.stroke();
  ctx.restore();

  // holder 위험 링
  if (isHolder) {
    const pulse = reduce ? 0.5 : (Math.sin(now / 120) + 1) / 2;
    ctx.save();
    ctx.globalAlpha = 0.3 + pulse * 0.4;
    ctx.strokeStyle = '#ff7b00';
    ctx.shadowColor = '#ff7b00';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, feetY + 8, 42, 12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2.6;
  // 몸통
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x, shoulderY);
  ctx.stroke();
  // 팔 (양쪽으로, holder면 위로 들어 폭탄 받기)
  ctx.beginPath();
  ctx.moveTo(x, shoulderY + 3);
  ctx.lineTo(x - 15, shoulderY + armReach);
  ctx.moveTo(x, shoulderY + 3);
  ctx.lineTo(x + 15, shoulderY + armReach);
  ctx.stroke();
  // 다리
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x - 12, feetY);
  ctx.moveTo(x, hipY);
  ctx.lineTo(x + 12, feetY);
  ctx.stroke();
  // 머리
  ctx.beginPath();
  ctx.arc(x, headY, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 라벨 P1/P2
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `12px ${ARCADE}`;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.fillText(side, x, feetY + 34);
  ctx.restore();

  // YOU 태그(온라인 내 쪽) — steps 점멸
  if (isYou && Math.floor(now / 500) % 2 === 0) {
    ctx.save();
    ctx.font = `10px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = col.accent;
    ctx.shadowColor = col.accent;
    ctx.shadowBlur = 8;
    ctx.fillText('YOU', x, headY - 18);
    ctx.restore();
  }
}

/** 폭탄 본체 + 퓨즈 스파크. urgent면 발광/떨림 강조. */
function drawBomb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ratio: number,
  urgent: boolean,
  now: number,
  reduce: boolean,
  tint: string | null,
): void {
  const surf = bombColor(ratio);
  const glow = urgent ? 14 + (reduce ? 0 : (Math.sin(now / 55) + 1) * 8) : 8;
  ctx.save();
  // 발광 코어(막판일수록 주황 발광)
  ctx.shadowColor = tint ?? '#ff7b00';
  ctx.shadowBlur = glow;
  ctx.fillStyle = surf;
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.fill();
  // 외곽 링(가시성)
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = tint ?? (urgent ? '#ff7b00' : '#43324f');
  ctx.stroke();
  // 하이라이트
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(x - 8, y - 9, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 퓨즈 심지 + 스파크
  const fuseX = x + 12;
  const fuseTopY = y - 30;
  ctx.save();
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 8, y - 20);
  ctx.quadraticCurveTo(fuseX + 6, y - 28, fuseX, fuseTopY);
  ctx.stroke();
  const spk = reduce ? 3 : 3 + Math.random() * 3;
  ctx.fillStyle = SPARK;
  ctx.shadowColor = SPARK;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(fuseX, fuseTopY, spk, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 플로트 텍스트(중앙 정렬, 위로 떠오르며 페이드) */
function drawFloat(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  t: number,
  color: string,
): void {
  const a = clamp01(1 - t);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.font = `16px ${ARCADE}`;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillText(text, x, y - t * 26);
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game11State,
  now: number,
  who: WhoYou,
  reduce: boolean,
): void {
  // 색은 플레이어 종속 — P1/P2 기능 엔티티의 실제 플레이어 색으로 스왑.
  const fc = functionColors();
  const COL: Palette =
    fc.p1 === 'red'
      ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
      : COL0;

  const ratio = clamp01(s.elapsed / GAME_DURATION);
  const remaining = Math.max(0, GAME_DURATION - s.elapsed);
  const hidden = remaining <= G11.HIDE_UNDER; // 규칙5: 남은 3초 이하 → 숫자 가림
  const urgent = hidden && s.result === null;

  // --- 배경 (shake translate 대비 여유 있게 채움) ---
  ctx.fillStyle = COL.field;
  ctx.fillRect(-40, -40, CW + 80, CH + 80);

  // 워터마크 "BOMB"
  ctx.save();
  ctx.font = `bold 140px ${ARCADE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = urgent ? 'rgba(255,123,0,0.08)' : 'rgba(211,0,197,0.06)';
  ctx.strokeText('BOMB', CENTER_X, 250);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';

  // 그리드 밴드
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,123,0,0.10)' : 'rgba(211,0,197,0.07)';
  ctx.lineWidth = 1;
  for (let gx = 96; gx <= CW - 96; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, 90);
    ctx.lineTo(gx, GROUND_Y + 20);
    ctx.stroke();
  }
  ctx.restore();

  // 바닥 라인
  ctx.save();
  ctx.strokeStyle = 'rgba(211,0,197,0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, GROUND_Y + 18);
  ctx.lineTo(CW - 40, GROUND_Y + 18);
  ctx.stroke();
  ctx.restore();

  // 위험 비네트(막판)
  if (urgent) {
    const pulse = reduce ? 0.5 : (Math.sin(now / 90) + 1) / 2;
    ctx.save();
    ctx.globalAlpha = 0.1 + pulse * 0.14;
    const grad = ctx.createRadialGradient(CENTER_X, 260, 120, CENTER_X, 260, 560);
    grad.addColorStop(0, 'rgba(255,123,0,0)');
    grad.addColorStop(1, 'rgba(255,45,0,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, CH);
    ctx.restore();
  }

  // --- 플레이어 (holder 우선순위 위해 순서 무관) ---
  drawPlayer(ctx, 'P1', P1_X, s.holder === 1, who.p1IsYou, now, reduce, COL);
  drawPlayer(ctx, 'P2', P2_X, s.holder === 2, who.p2IsYou, now, reduce, COL);

  // --- 폭탄 위치 계산 ---
  // 패스 비행: 이전 holder → 현재 holder 로 0.2s 보간(포물선), autoPass면 색조 변경.
  const sincePass = s.elapsed - s.passAt;
  const passing = s.passAt > 0 && sincePass >= 0 && sincePass < PASS_DUR && s.result === null;
  let bx: number;
  let by: number;
  let tint: string | null = null;
  if (passing) {
    const pt = clamp01(sincePass / PASS_DUR);
    const from = holderX(s.holder === 1 ? 2 : 1);
    bx = lerp(from, holderX(s.holder), pt);
    by = BOMB_Y - Math.sin(Math.PI * pt) * 74; // 위로 아치
    tint = s.autoPass ? AUTO_TINT : null;
  } else {
    // 페이크 페인트: 현재 holder가 상대쪽으로 살짝 튀었다 돌아옴(holder 불변).
    const fakeT = s.holder === 1 ? s.fake1 : s.fake2;
    const sinceFake = s.elapsed - fakeT;
    const dir = s.holder === 1 ? 1 : -1; // 상대 방향
    const fakeOff =
      fakeT > 0 && sinceFake >= 0 && sinceFake < FAKE_DUR
        ? Math.sin(Math.PI * (sinceFake / FAKE_DUR)) * FAKE_POKE * dir
        : 0;
    const tremble = urgent && !reduce ? (Math.random() - 0.5) * 4 : 0;
    bx = holderX(s.holder) + fakeOff;
    by = BOMB_Y + tremble;
  }

  // holder 지시 화살표(폭탄 위, 아래로)
  if (s.result === null) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `12px ${ARCADE}`;
    ctx.fillStyle = '#ff7b00';
    ctx.shadowColor = '#ff7b00';
    ctx.shadowBlur = 6;
    ctx.fillText('▼', holderX(s.holder), BOMB_Y - 40 + Math.sin(now / 160) * 3);
    ctx.restore();
  }

  drawBomb(ctx, bx, by, ratio, urgent, now, reduce, tint);

  // --- 플로트 텍스트: PASS! / AUTO! / FAKE (상태 파생 — 온·오프 동일) ---
  if (s.passAt > 0 && sincePass >= 0 && sincePass < FLOAT_DUR) {
    const label = s.autoPass ? 'AUTO!' : 'PASS!';
    drawFloat(
      ctx,
      label,
      holderX(s.holder),
      BOMB_Y - 60,
      sincePass / FLOAT_DUR,
      s.autoPass ? AUTO_TINT : COL.text,
    );
  }
  for (const side of [1, 2] as const) {
    const fk = side === 1 ? s.fake1 : s.fake2;
    const dt = s.elapsed - fk;
    if (fk > 0 && dt >= 0 && dt < FLOAT_DUR) {
      drawFloat(ctx, 'FAKE', holderX(side), BOMB_Y - 44, dt / FLOAT_DUR, COL.accent2);
    }
  }

  // --- 카운트다운 (규칙5) ---
  ctx.save();
  ctx.textAlign = 'center';
  if (hidden && s.result === null) {
    // 남은 3초 이하 → 숫자 가림. "???" + 경고.
    const flick = Math.floor(now / 100) % 2 === 0;
    ctx.font = `56px ${ARCADE}`;
    ctx.fillStyle = flick ? '#ff7b00' : '#ff2a6d';
    ctx.shadowColor = '#ff7b00';
    ctx.shadowBlur = 20;
    ctx.fillText('???', CENTER_X, 118);
    ctx.font = `14px ${ARCADE}`;
    ctx.fillStyle = COL.accent;
    ctx.shadowColor = COL.accent;
    ctx.shadowBlur = 10;
    ctx.fillText("DON'T HOLD IT!", CENTER_X, 150);
  } else if (s.result === null) {
    // 3초 초과 → 남은 초를 크게.
    ctx.font = `56px ${ARCADE}`;
    ctx.fillStyle = COL.text;
    ctx.shadowColor = COL.accent2;
    ctx.shadowBlur = 14;
    ctx.fillText(String(Math.ceil(remaining)), CENTER_X, 118);
    ctx.font = `10px ${ARCADE}`;
    ctx.fillStyle = COL.muted;
    ctx.shadowBlur = 0;
    ctx.fillText('FUSE', CENTER_X, 142);
  }
  ctx.restore();

  // --- 결과 배너 (승패 순간) ---
  if (s.result) {
    const winColor =
      s.result === 'P1' ? COL.p1 : s.result === 'P2' ? COL.p2 : COL.accent2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `26px ${ARCADE}`;
    ctx.fillStyle = winColor;
    ctx.shadowColor = winColor;
    ctx.shadowBlur = 18;
    const banner = s.result === 'DRAW' ? 'DRAW' : `${s.result} WINS`;
    ctx.fillText(banner, CENTER_X, 96);
    ctx.font = `12px ${ARCADE}`;
    ctx.fillStyle = COL.accent;
    ctx.shadowColor = COL.accent;
    ctx.shadowBlur = 8;
    ctx.fillText('BOOM!', CENTER_X, 128);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------
export default function Game11() {
  useDebugScreen('scr-game11');
  const flow = useFlow();
  const navigate = useNavigate();

  // 온라인 렌더 훅(성능 표준). 활성/역할만 선택 구독 → 라운드 경계에서만 리렌더.
  const { isOnline, myRole, stateRef } = useOnlineRender<Game11State>(11, (s) => {
    setDebugGame(s);
    const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remainingMs / 1000) * 1000);
  });
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const botRef = useRef<{ nextAt: number }>({ nextAt: 0 });
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  // 종료 연출: result 전환 추적 → 폭발
  const endRef = useRef<EndTracker>(createEndTracker());
  const explosionRef = useRef<{ spawned: boolean; particles: Particle[]; cx: number; cy: number }>({
    spawned: false,
    particles: [],
    cx: CENTER_X,
    cy: BOMB_Y,
  });

  /** HUD 표시용 남은 시간 (초 단위 양자화 — 리렌더 절약) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);

  const [qLit, flashQ] = useKeyLamp(); // P1 PASS
  const [wLit, flashW] = useKeyLamp(); // P1 FAKE
  const [uLit, flashU] = useKeyLamp(); // P2 / online PASS
  const [iLit, flashI] = useKeyLamp(); // P2 / online FAKE
  const lampRef = useRef({ flashU, flashI });
  lampRef.current = { flashU, flashI };

  // direct-URL 복구 + 이탈 시 디버그 브리지 정리
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 11) startOfflineGame(11);
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

  // 키보드 — 로컬 어댑터. down/up 둘 다 큐 적재 + 램프 점등.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // 진짜 서버 온라인: U/I 두 키만. U=PASS(slotA), I=FAKE(slotB). Q/W는 무시.
        if (isOnlineRef.current) {
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          if (e.type === 'down') {
            if (e.code === 'KeyU') flashU();
            else flashI();
          }
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          return;
        }

        // --- 오프라인(로컬 2인 / 로컬 online mock 봇) ---
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

    /** 공용 프레임 렌더 — 폭발/흔들림 포함. 온·오프라인 둘 다 사용. */
    const paint = (ctx: CanvasRenderingContext2D, s: Game11State, now: number) => {
      // 새 라운드(result=null)면 폭발 상태 리셋
      if (!s.result && explosionRef.current.spawned) explosionRef.current.spawned = false;

      const started = endRef.current.update(s.result, now);
      if (started && !explosionRef.current.spawned && s.result) {
        // 진 쪽 = 폭탄 든 쪽(holder). 그 위치에서 폭발.
        const cx = holderX(s.holder);
        explosionRef.current = {
          spawned: true,
          particles: makeExplosion(cx, BOMB_Y, 26),
          cx,
          cy: BOMB_Y,
        };
      }
      const age = endRef.current.age(now);
      const shake = age !== null ? shakeOffset(age, reduce ? 0 : 9) : { x: 0, y: 0 };
      const disp = getPlayerDisplays(getFlow());

      ctx.save();
      ctx.translate(shake.x, shake.y);
      drawScene(ctx, s, now, { p1IsYou: disp.P1.isYou, p2IsYou: disp.P2.isYou }, reduce);
      if (explosionRef.current.spawned && age !== null) {
        drawExplosion(
          ctx,
          explosionRef.current.particles,
          explosionRef.current.cx,
          explosionRef.current.cy,
          age,
          '#ff7b00',
        );
      }
      ctx.restore();
      drawEndFlash(ctx, CW, CH, age);
    };

    // ── 온라인: 서버 상태만 그리는 draw-only 루프(step·봇·result보고 없음) ──
    if (isOnline) {
      if (!stateRef.current) {
        stateRef.current = game11.create(Math.random);
        setDebugGame(stateRef.current);
      }
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const s = stateRef.current;
        const ctx = canvasRef.current?.getContext('2d');
        if (!s || !ctx) return;
        paint(ctx, s, now);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    // ── 오프라인(로컬 시뮬 + 봇 + 결과 보고) ──
    if (flow.gameId !== 11 || flow.phase !== 'playing') return;

    const st = game11.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    botRef.current = { nextAt: 0 };
    reportedRef.current = false;
    resultAtRef.current = 0;
    explosionRef.current = { spawned: false, particles: [], cx: CENTER_X, cy: BOMB_Y };
    endRef.current.reset();
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (isRoundIntroActive()) {
        last = now;
        return;
      }
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        const events = actionsRef.current;
        actionsRef.current = [];

        // 온라인 mock 봇(P2): 0.3~1.2s 랜덤 간격으로 U(PASS), 가끔 I(FAKE).
        if (getFlow().mode === 'online' && now >= botRef.current.nextAt) {
          if (s.holder === 2) {
            const fake = Math.random() < 0.18;
            const code: 'KeyU' | 'KeyI' = fake ? 'KeyI' : 'KeyU';
            events.push({ code, type: 'down', t: now / 1000 });
            (fake ? lampRef.current.flashI : lampRef.current.flashU)();
          }
          botRef.current.nextAt = now + 300 + Math.random() * 900;
        }

        s = game11.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);
        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);

        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // 온라인은 서버가 round:end를 구동 — 화면은 보고하지 않음(여기 도달은 오프라인뿐).
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) paint(ctx, s, now);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= G11.HIDE_UNDER * 1000;
  // 내 색(매치 고정, 역할과 독립) — 키캡 색.
  const myColor = isOnline ? (onlineStore.get().myColor ?? 'blue') : 'blue';

  return (
    <main data-testid="scr-game11" className="g11-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g11-topbar">
        <Button
          variant="tertiary"
          data-testid="btn-exit"
          onClick={() => {
            exitMatch();
            navigate('/');
          }}
        >
          ◀ EXIT
        </Button>
        <span className="g11-title font-arcade c-muted">GAME 11 · HOT POTATO</span>
      </div>

      <div className="g11-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
          hideTime={hudMs <= G11.HIDE_UNDER * 1000}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g11-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g11-canvas" aria-label="Game 11 stage — Hot Potato" />
      </div>

      {/* 온스크린 키캡. 온라인은 U/I 두 키만(내 색), 오프라인은 P1(Q/W)·P2(U/I) 양쪽. */}
      {isOnline ? (
        <div className="g11-keys g11-keys--online">
          <div className="g11-keys__group">
            <span
              className={`g11-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}
            >
              YOU
            </span>
            <KeyCap
              role={myColor === 'blue' ? 'P1' : 'P2'}
              keyChar="U"
              icon={myRole === 'P1' ? '▶' : '◀'}
              lit={uLit}
              label="PASS"
            />
            <KeyCap
              role={myColor === 'blue' ? 'P1' : 'P2'}
              keyChar="I"
              icon="≈"
              lit={iLit}
              label="FAKE"
            />
          </div>
          <span className="g11-keys__hint font-arcade c-muted">Pass before it blows!</span>
        </div>
      ) : (
        <div className="g11-keys">
          <div className="g11-keys__group">
            <span className="g11-keys__tag font-arcade c-p1">P1</span>
            <KeyCap role="P1" keyChar="Q" icon="▶" lit={qLit} label="PASS" />
            <KeyCap role="P1" keyChar="W" icon="≈" lit={wLit} label="FAKE" />
          </div>
          <span className="g11-keys__hint font-arcade c-muted">Pass before it blows!</span>
          <div className="g11-keys__group">
            <KeyCap role="P2" keyChar="U" icon="◀" lit={uLit} label="PASS" />
            <KeyCap role="P2" keyChar="I" icon="≈" lit={iLit} label="FAKE" />
            <span className="g11-keys__tag font-arcade c-p2">P2</span>
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}
