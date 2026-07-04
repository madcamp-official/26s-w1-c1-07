/**
 * S10·S11 게임2 — 총알 피하기 "장난감 구슬 비" (game2 에이전트 소유)
 *
 * 컨테이너 testid: scr-game2 / 필요 testid: hud-profile-p1, hud-profile-p2,
 * hud-countdown, game-stage, btn-exit (+ ResultOverlay가 result-* 4종 담당)
 *
 * SPEC S10·S11 / PLAN §3.2:
 *  - 위 트랙 P1(딸기핑크, 자동 왕복 + q=방향 반전 / w=발사, 장전 게이지)
 *  - 아래 트랙 P2(민트, u/i 홀드 이동), 낙하 캡슐(속도 랜덤)
 *  - 피격=P1 승 / 시간 종료 생존=P2 승 — 판정은 전부 @shared tickGame2 (재구현 금지)
 *  - canvas 렌더(requestAnimationFrame + 고정 50ms 틱 어큐뮬레이터)
 *  - 온라인 mock: 상대(P2 회피자)는 봇 휴리스틱이 입력을 흘려 넣는다
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_KEYBOARD_MAP,
  GAME2_IDLE_INPUTS,
  GAME2_TICK_MS,
  attachKeyboardAdapter,
  createGame2State,
  reduceGame2Inputs,
  tickGame2,
} from '@shared';
import type { Game2Action, Game2Inputs, Game2State, KeyInputEvent } from '@shared';
import {
  exitMatch,
  getFlow,
  getPlayerDisplays,
  reportRoundEnd,
  startOfflineGame,
  useFlow,
} from '../../state/flow';
import { setDebugGame, useDebugScreen } from '../../debug';
import { Button, ClayBlob, CountdownPill, KeyCap, PlayerBadge } from '../../components';
import ResultOverlay from './ResultOverlay';
import './Game2.css';

// ---------------------------------------------------------------------------
// 캔버스 좌표계 (논리 크기 고정, CSS로 반응형 축소)
// ---------------------------------------------------------------------------

const CW = 960;
const CH = 560;
const PAD_X = 76; // 필드 x=0/1 이 닿는 좌우 여백
const TOP_Y = 128; // P1 트랙(구름 레일) 캔버스 y
const BOT_Y = 452; // P2 트랙(선반) 캔버스 y

/** PLAN §1.1 팔레트 (canvas는 CSS 변수를 못 읽으므로 hex 직접 사용) */
const C = {
  sky: '#E6F4FF',
  skyCloud: '#F4FAFF',
  surface: '#FFFBF7',
  sunken: '#F5E9DE',
  ink: '#4A3A52',
  inkMuted: '#9C8CAB',
  p1: '#FF6E8A',
  p1Tint: '#FFDEE6',
  p2: '#3FC49E',
  p2Tint: '#D6F4EA',
  lavender: '#B79CF0',
  pop: '#FFD447',
  error: '#E85D6F',
} as const;

function fieldX(ratio: number): number {
  return PAD_X + ratio * (CW - 2 * PAD_X);
}

/** 총알 yRatio(=y/fieldHeight)를 캔버스 y로. 트랙 y(0.1↔TOP_Y, 0.9↔BOT_Y) 기준 선형 */
function fieldY(yRatio: number, attackerYRatio: number, dodgerYRatio: number): number {
  const t = (yRatio - attackerYRatio) / (dodgerYRatio - attackerYRatio);
  return TOP_Y + t * (BOT_Y - TOP_Y);
}

// ---------------------------------------------------------------------------
// 연출(FX) 타임스탬프 — 로직과 무관한 렌더 전용
// ---------------------------------------------------------------------------

interface Fx {
  lastFireMs: number; // 발사 반동 squash
  lastTurnMs: number; // 방향 반전 뒤집기
  resultAtMs: number; // 라운드 결과 확정 시각 (피격 플래시 / 생존 세리머니)
  readyAtMs: number; // 장전 완료 통통 튀기
  prevReady: boolean;
  prevDir: 1 | -1;
  prevBulletCount: number; // nextBulletId 추적 (발사 감지)
}

function initFx(): Fx {
  return {
    lastFireMs: -1e9,
    lastTurnMs: -1e9,
    resultAtMs: -1e9,
    readyAtMs: -1e9,
    prevReady: true,
    prevDir: 1,
    prevBulletCount: 1,
  };
}

// ---------------------------------------------------------------------------
// 입력 매핑 / 봇
// ---------------------------------------------------------------------------

/** @shared 키 이벤트 → Game2 액션 (P1 엣지 / P2 홀드) */
function keyEventToAction(ev: KeyInputEvent): Game2Action | null {
  if (ev.player === 'P1') {
    if (ev.phase !== 'down') return null; // P1은 엣지 트리거
    return { gameId: 2, player: 'P1', type: ev.key === 'key1' ? 'TURN' : 'FIRE' };
  }
  if (ev.key === 'key1') {
    return { gameId: 2, player: 'P2', type: ev.phase === 'down' ? 'LEFT_DOWN' : 'LEFT_UP' };
  }
  return { gameId: 2, player: 'P2', type: ev.phase === 'down' ? 'RIGHT_DOWN' : 'RIGHT_UP' };
}

/**
 * 온라인 mock 봇 (P2 회피자) 휴리스틱 — 판정 재구현이 아니라 "입력 생성"만.
 * 위협 총알(트랙 도달까지 1.4초 이내 + x 겹침 예상)에서 여유 있는 쪽으로 도망,
 * 위협이 없으면 공격자 바로 아래를 슬금슬금 벗어난다.
 */
function botDodgeDir(s: Game2State): -1 | 0 | 1 {
  const cfg = s.config;
  const x = s.dodger.x;
  const danger = cfg.dodgerHalfWidth + cfg.bulletRadius + 5;
  let threatX: number | null = null;
  let tMin = Infinity;
  for (const b of s.bullets) {
    if (b.y > cfg.dodgerY) continue;
    const t = (cfg.dodgerY - b.y) / b.vy; // 초
    if (t > 1.4) continue;
    if (Math.abs(b.x - x) < danger && t < tMin) {
      tMin = t;
      threatX = b.x;
    }
  }
  if (threatX !== null) {
    const roomL = x - cfg.dodgerHalfWidth;
    const roomR = cfg.fieldWidth - cfg.dodgerHalfWidth - x;
    if (threatX >= x) return roomL > 6 ? -1 : 1;
    return roomR > 6 ? 1 : -1;
  }
  const diff = s.attacker.x - x;
  if (Math.abs(diff) < 16) return diff > 0 ? -1 : 1;
  return 0;
}

interface BotState {
  nextDecisionMs: number; // 반응 지연 (사람 같은 굼뜸)
  left: boolean;
  right: boolean;
}

// ---------------------------------------------------------------------------
// 캔버스 드로잉 헬퍼 (전부 렌더 전용 — 순백/순흑 없음, 플럼 계열 그림자)
// ---------------------------------------------------------------------------

function pathRoundRect(
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

/** 클레이 볼륨: 소프트 드롭 섀도 + 상단 하이라이트 */
function fillClay(
  ctx: CanvasRenderingContext2D,
  draw: () => void,
  color: string,
  highlight = true,
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(74, 58, 82, 0.18)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = color;
  draw();
  ctx.fill();
  ctx.restore();
  if (highlight) {
    // 위 안쪽 하이라이트 — 원본 path로 clip한 뒤, 위로 6px 밀린 path를 밝게 채운다
    ctx.save();
    draw();
    ctx.clip();
    ctx.translate(0, -6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    draw();
    ctx.fill();
    ctx.restore();
  }
}

/** 통통한 클레이 인형 (눈사람 몸통 + 얼굴). squashX/Y로 젤리 변형 */
function drawDoll(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  tint: string,
  opts: {
    squashX?: number;
    squashY?: number;
    faceDir?: 1 | -1;
    mood?: 'idle' | 'flat' | 'win';
    label: string;
  },
): void {
  const { squashX = 1, squashY = 1, faceDir = 1, mood = 'idle', label } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(squashX, squashY);

  const r = 26;
  // 몸통
  ctx.save();
  ctx.shadowColor = 'rgba(74, 58, 82, 0.2)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.94, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 배 하이라이트 (무광 광택)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.22, -r * 0.34, r * 0.5, r * 0.32, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // 배 tint
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.34, r * 0.52, r * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();

  // 얼굴
  ctx.fillStyle = C.ink;
  const ex = faceDir * 6;
  if (mood === 'flat') {
    // 납작 짜부 — X 눈
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = C.ink;
    for (const sx of [-8, 8]) {
      ctx.beginPath();
      ctx.moveTo(sx - 3, -6);
      ctx.lineTo(sx + 3, 0);
      ctx.moveTo(sx + 3, -6);
      ctx.lineTo(sx - 3, 0);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 8, 4.5, Math.PI, 0); // 삐진 입 (뒤집힌 호)
    ctx.stroke();
  } else if (mood === 'win') {
    // 브이 승리 — 초승달 눈 + 함박 웃음
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = C.ink;
    for (const sx of [-8, 8]) {
      ctx.beginPath();
      ctx.arc(sx, -4, 4, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 4, 7, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(ex - 7, -4, 2.8, 0, Math.PI * 2);
    ctx.arc(ex + 7, -4, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = C.ink;
    ctx.beginPath();
    ctx.arc(ex, 3, 5, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();

  // P1/P2 라벨 (색 + 라벨 병기 — 주석 16:1713)
  ctx.save();
  ctx.font = '800 15px "Baloo 2", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ly = y - 40 * squashY;
  ctx.fillStyle = C.surface;
  pathRoundRect(ctx, x - 17, ly - 11, 34, 22, 11);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(label, x, ly + 1);
  ctx.restore();
}

/** 알약 캡슐 (라벤더+아이보리) — 총알/장전 게이지 공용 */
function drawCapsule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rot: number,
  alpha = 1,
  fillRatio = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(74, 58, 82, 0.2)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  // 아래쪽 절반 — 아이보리
  pathRoundRect(ctx, -w / 2, -h / 2, w, h, w / 2);
  ctx.fillStyle = C.surface;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // 위쪽 — 라벤더 (fillRatio만큼 위에서 차오름 = 장전 게이지 겸용)
  ctx.save();
  pathRoundRect(ctx, -w / 2, -h / 2, w, h, w / 2);
  ctx.clip();
  ctx.fillStyle = C.lavender;
  ctx.fillRect(-w / 2, -h / 2, w, h * 0.5 * fillRatio);
  ctx.restore();
  // 하이라이트
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.16, -h * 0.28, w * 0.16, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = C.pop;
  ctx.fill();
  ctx.restore();
}

/** 생존 승리 세리머니 별 (결정적 배치 — 렌더 전용) */
const WIN_STARS = Array.from({ length: 7 }, (_, i) => ({
  x: 120 + ((i * 127) % (CW - 240)),
  drift: ((i * 53) % 40) - 20,
  size: 10 + ((i * 37) % 9),
  delay: (i * 90) % 400,
}));

// ---------------------------------------------------------------------------
// 메인 드로잉
// ---------------------------------------------------------------------------

function drawStage(ctx: CanvasRenderingContext2D, s: Game2State, fx: Fx, now: number): void {
  const cfg = s.config;
  const aYr = cfg.attackerY / cfg.fieldHeight;
  const dYr = cfg.dodgerY / cfg.fieldHeight;

  // 하늘 배경 + 구름 블롭
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = C.sky;
  ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = C.skyCloud;
  for (const [cx, cy, cr] of [
    [140, 260, 56],
    [200, 280, 42],
    [790, 220, 60],
    [850, 245, 44],
    [480, 320, 38],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, cr, cr * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- 상단 구름 레일 (P1 트랙) ----
  fillClay(ctx, () => pathRoundRect(ctx, PAD_X - 46, TOP_Y + 26, CW - 2 * PAD_X + 92, 22, 11), C.surface);
  // 구름 봉우리
  ctx.fillStyle = C.surface;
  for (let i = 0; i < 9; i++) {
    const bx = PAD_X - 20 + (i * (CW - 2 * PAD_X + 40)) / 8;
    ctx.beginPath();
    ctx.ellipse(bx, TOP_Y + 28, 20, 10, 0, Math.PI, 0);
    ctx.fill();
  }

  // ---- 하단 선반 (P2 트랙) ----
  fillClay(ctx, () => pathRoundRect(ctx, PAD_X - 46, BOT_Y + 26, CW - 2 * PAD_X + 92, 26, 13), C.sunken);

  const p1x = fieldX(s.view.attackerXRatio);
  const p2x = fieldX(s.view.dodgerXRatio);

  // ---- 장전 게이지 (P1 머리 위 반투명 캡슐 실루엣) ----
  const ready = s.view.fireReadyRatio >= 1;
  const readyBounce = ready && now - fx.readyAtMs < 260 ? 1 + 0.18 * Math.sin(((now - fx.readyAtMs) / 260) * Math.PI) : 1;
  drawCapsule(
    ctx,
    p1x,
    TOP_Y - 66,
    15 * readyBounce,
    27 * readyBounce,
    0,
    ready ? 0.95 : 0.4,
    Math.min(1, s.view.fireReadyRatio) * 2, // 위 절반 채움 게이지
  );

  // ---- P1 인형 (대포 장난감 안고 왕복) ----
  const sinceFire = now - fx.lastFireMs;
  const sinceTurn = now - fx.lastTurnMs;
  const fireSquash = sinceFire < 200 ? Math.sin((sinceFire / 200) * Math.PI) : 0;
  const turnWob = sinceTurn < 240 ? Math.sin((sinceTurn / 240) * Math.PI) : 0;
  // 대포 (몸 아래, 아래로 발사)
  ctx.save();
  ctx.translate(p1x, TOP_Y + 10);
  ctx.shadowColor = 'rgba(74, 58, 82, 0.18)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = C.lavender;
  pathRoundRect(ctx, -9, 0 + fireSquash * -4, 18, 22 + fireSquash * 6, 9);
  ctx.fill();
  ctx.restore();
  drawDoll(ctx, p1x, TOP_Y - 4 - fireSquash * 3, C.p1, C.p1Tint, {
    squashX: 1 + 0.14 * fireSquash + 0.1 * turnWob,
    squashY: 1 - 0.14 * fireSquash - 0.08 * turnWob,
    faceDir: s.attacker.dir,
    label: 'P1',
  });
  // 이동 방향 화살표 (방향 반전 즉시 피드백)
  ctx.save();
  ctx.fillStyle = C.p1;
  ctx.globalAlpha = 0.8;
  ctx.font = '800 20px "Baloo 2", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(s.attacker.dir === 1 ? '→' : '←', p1x + s.attacker.dir * 46, TOP_Y + 2);
  ctx.restore();

  // ---- 총알 (알약 캡슐, 낙하 중 출렁) ----
  for (const b of s.view.bullets) {
    const wob = Math.sin(s.elapsedMs / 130 + b.id * 1.7) * 0.12;
    drawCapsule(ctx, fieldX(b.xRatio), fieldY(b.yRatio, aYr, dYr), 15, 28, wob, 1, 2);
  }

  // ---- P2 인형 ----
  const isHit = s.result === 'P1_WIN';
  const isSurvive = s.result === 'P2_WIN';
  const sinceResult = now - fx.resultAtMs;
  if (isHit) {
    // 찰흙 팬케이크
    drawDoll(ctx, p2x, BOT_Y + 16, C.p2, C.p2Tint, {
      squashX: 1.65,
      squashY: 0.34,
      mood: 'flat',
      label: 'P2',
    });
  } else if (isSurvive) {
    const bounce = Math.abs(Math.sin(sinceResult / 240));
    drawDoll(ctx, p2x, BOT_Y + 2 - bounce * 12, C.p2, C.p2Tint, {
      squashX: 1 - bounce * 0.08,
      squashY: 1 + bounce * 0.1,
      mood: 'win',
      label: 'P2',
    });
    // 버터옐로 별 컨페티 낙하
    for (const st of WIN_STARS) {
      const t = (sinceResult - st.delay) / 900;
      if (t < 0 || t > 1.4) continue;
      drawStar(ctx, st.x + st.drift * t, 40 + t * (BOT_Y - 60), st.size, t * 3 + st.x);
    }
  } else {
    const breath = 1 + 0.02 * Math.sin(now / 480);
    drawDoll(ctx, p2x, BOT_Y - 2, C.p2, C.p2Tint, {
      squashX: breath,
      squashY: 2 - breath,
      label: 'P2',
    });
  }

  // ---- 피격 플래시 (--error 오버레이 120ms 1회) ----
  if (isHit && sinceResult < 120) {
    ctx.fillStyle = 'rgba(232, 93, 111, 0.32)';
    ctx.fillRect(0, 0, CW, CH);
  }
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

/** W 키캡용 미니 캡슐 아이콘 (발사) */
function FireIcon() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 13,
        height: 24,
        borderRadius: 7,
        background: 'linear-gradient(to bottom, var(--lavender) 50%, var(--surface) 50%)',
        boxShadow: '0 2px 4px rgba(74,58,82,0.2)',
      }}
    />
  );
}

export default function Game2() {
  useDebugScreen('scr-game2');
  const flow = useFlow();
  const navigate = useNavigate();
  const isOnline = flow.mode === 'online';

  // 딥링크/새로고침 등 매치 없이 도달한 경우 — 오프라인 매치로 보정 (게임 화면은 항상 유효한 매치 위에서 동작)
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 2) startOfflineGame(2);
  }, []);

  const makeState = useCallback(
    () =>
      createGame2State(
        { roundDurationMs: getFlow().roundConfig.timePerRoundSec * 1000 }, // QA-S4-06
        Math.random,
      ),
    [],
  );

  const [game, setGame] = useState<Game2State>(makeState);
  const gameRef = useRef<Game2State>(game);
  const inputsRef = useRef<Game2Inputs>({ ...GAME2_IDLE_INPUTS });
  const actionsRef = useRef<Game2Action[]>([]);
  const reportedRef = useRef(false);
  const reportTimerRef = useRef<number | null>(null);
  const fxRef = useRef<Fx>(initFx());
  const botRef = useRef<BotState>({ nextDecisionMs: 0, left: false, right: false });
  const onlineRef = useRef(isOnline);
  onlineRef.current = isOnline;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 온스크린 키캡 눌림 표시 (실키 1:1)
  const [pressed, setPressed] = useState({ q: false, w: false, u: false, i: false });

  const resetRound = useCallback(() => {
    if (reportTimerRef.current !== null) {
      clearTimeout(reportTimerRef.current);
      reportTimerRef.current = null;
    }
    reportedRef.current = false;
    inputsRef.current = { ...GAME2_IDLE_INPUTS };
    actionsRef.current = [];
    fxRef.current = initFx();
    botRef.current = { nextDecisionMs: 0, left: false, right: false };
    const s = makeState();
    gameRef.current = s;
    setGame(s);
    setDebugGame(s);
  }, [makeState]);

  // "다음 라운드" 이후 flow.currentRound 변화 감지 → 새 라운드 state (onNextRound와 이중 안전망)
  const lastRoundRef = useRef(flow.currentRound);
  useEffect(() => {
    if (flow.currentRound !== lastRoundRef.current) {
      lastRoundRef.current = flow.currentRound;
      if (flow.phase === 'playing') resetRound();
    }
  }, [flow.currentRound, flow.phase, resetRound]);

  // 키보드 (q/w = P1, u/i = P2 — @shared 키맵. 온라인에선 P2 키 무시: 상대는 봇)
  useEffect(() => {
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev: KeyInputEvent) => {
      const down = ev.phase === 'down';
      setPressed((p) => {
        if (ev.player === 'P1') return ev.key === 'key1' ? { ...p, q: down } : { ...p, w: down };
        return ev.key === 'key1' ? { ...p, u: down } : { ...p, i: down };
      });
      if (isOnline && ev.player === 'P2') return;
      const action = keyEventToAction(ev);
      if (action) actionsRef.current.push(action);
    });
    return detach;
  }, [isOnline]);

  // 메인 루프: rAF + 고정 50ms 틱 어큐뮬레이터. 렌더는 매 프레임 canvas에.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    setDebugGame(gameRef.current);

    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      acc += now - last;
      last = now;
      if (acc > 500) acc = 500; // 탭 복귀 스파이크 클램프

      let s = gameRef.current;
      let ticked = false;
      while (acc >= GAME2_TICK_MS) {
        acc -= GAME2_TICK_MS;
        if (s.result !== null) {
          actionsRef.current = [];
          continue; // 코어가 상태 동결 — 틱 스킵
        }
        // 온라인 봇 (P2 회피자): 반응 지연 130ms 두고 홀드 액션을 흘려 넣는다
        if (onlineRef.current) {
          const bot = botRef.current;
          if (now >= bot.nextDecisionMs) {
            bot.nextDecisionMs = now + 130;
            const dir = botDodgeDir(s);
            const wantLeft = dir === -1;
            const wantRight = dir === 1;
            if (wantLeft !== bot.left) {
              actionsRef.current.push({ gameId: 2, player: 'P2', type: wantLeft ? 'LEFT_DOWN' : 'LEFT_UP' });
              bot.left = wantLeft;
            }
            if (wantRight !== bot.right) {
              actionsRef.current.push({ gameId: 2, player: 'P2', type: wantRight ? 'RIGHT_DOWN' : 'RIGHT_UP' });
              bot.right = wantRight;
            }
          }
        }
        inputsRef.current = reduceGame2Inputs(inputsRef.current, actionsRef.current);
        actionsRef.current = [];
        const next = tickGame2(s, inputsRef.current, GAME2_TICK_MS);
        // FX 감지 (렌더 전용 — 판정과 무관)
        const fx = fxRef.current;
        if (next.nextBulletId !== s.nextBulletId) fx.lastFireMs = now;
        if (next.attacker.dir !== s.attacker.dir && inputsRef.current.p1Turn) fx.lastTurnMs = now;
        const nowReady = next.view.fireReadyRatio >= 1;
        if (nowReady && !fx.prevReady) fx.readyAtMs = now;
        fx.prevReady = nowReady;
        if (next.result !== null && s.result === null) fx.resultAtMs = now;
        s = next;
        ticked = true;
      }

      if (ticked) {
        gameRef.current = s;
        setGame(s);
        setDebugGame(s); // QA 브리지 — 매 틱 갱신
        if (s.result !== null && !reportedRef.current) {
          reportedRef.current = true;
          const r = s.result;
          // 피격 팬케이크/생존 세리머니 잠깐 보여준 뒤 오버레이 (PLAN §3.2, ≤600ms 규칙)
          reportTimerRef.current = window.setTimeout(() => reportRoundEnd(r), 600);
        }
      }
      drawStage(ctx, s, fxRef.current, now);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (reportTimerRef.current !== null) clearTimeout(reportTimerRef.current);
      setDebugGame(null); // 게임 이탈
    };
  }, []);

  const displays = getPlayerDisplays(flow);
  const wPressed = pressed.w;
  const p2Left = isOnline ? inputsRef.current.p2Left : pressed.u;
  const p2Right = isOnline ? inputsRef.current.p2Right : pressed.i;

  return (
    <main data-testid="scr-game2" className="screen g2-root">
      <ClayBlob shape="drop" size={200} style={{ top: -70, left: -70 }} />
      <ClayBlob shape="star" size={150} style={{ bottom: -46, right: -34 }} />

      {/* ---- HUD: 나가기 + P1 — 타이머(R칩) — P2 ---- */}
      <header className="g2-hud">
        <div className="g2-hud-side">
          <Button
            variant="cancel"
            size="sm"
            data-testid="btn-exit"
            onClick={() => {
              exitMatch();
              navigate('/');
            }}
          >
            ← 나가기
          </Button>
          <PlayerBadge
            role="P1"
            name={displays.P1.name}
            isYou={displays.P1.isYou}
            data-testid="hud-profile-p1"
          />
        </div>
        <div className="g2-hud-center">
          <CountdownPill
            remainingMs={game.view.remainingMs}
            round={flow.currentRound || 1}
            totalRounds={flow.roundConfig.roundCount}
            data-testid="hud-countdown"
          />
        </div>
        <PlayerBadge
          role="P2"
          name={displays.P2.name}
          isYou={displays.P2.isYou}
          align="right"
          data-testid="hud-profile-p2"
        />
      </header>

      {/* ---- 스테이지 (canvas) ---- */}
      <section data-testid="game-stage" className="g2-stage" aria-label="게임2 총알 피하기 무대">
        <canvas ref={canvasRef} style={{ aspectRatio: `${CW} / ${CH}` }} />
      </section>

      {/* ---- 온스크린 패드 (실키 각인 + 젤리 눌림 연동) ---- */}
      <footer className="g2-pads">
        <div className="g2-pad-group">
          <div className="g2-pad-keys">
            <KeyCap role="P1" keyLabel="Q" icon="⟲" pressed={pressed.q} />
            <KeyCap role="P1" keyLabel="W" icon={<FireIcon />} pressed={wPressed} />
          </div>
          <span className="g2-pad-label">P1 · 방향 반전 / 발사</span>
        </div>
        <div className="g2-pad-group">
          <div className="g2-pad-keys">
            <KeyCap role="P2" keyLabel="U" icon="←" pressed={p2Left} />
            <KeyCap role="P2" keyLabel="I" icon="→" pressed={p2Right} />
          </div>
          <span className="g2-pad-label">{isOnline ? 'P2 · 봇이 조작 중' : 'P2 · 왼쪽 / 오른쪽'}</span>
        </div>
      </footer>

      <ResultOverlay onNextRound={resetRound} />
    </main>
  );
}
