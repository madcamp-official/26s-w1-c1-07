/**
 * 게임10 · 라이트 사이클 (Light Cycle / Tron) — NEON COIN-OP 신규 화면.
 * 컨테이너 testid: scr-game5 / 부품: game-stage(CRT 베젤), hud-*(HudFrame 내장), btn-exit
 *
 * ── 원칙 ────────────────────────────────────────────────────────────
 *  · 게임 로직/판정/상수는 100% @madpump/shared game5 코어(create/step) + G5 상수만 사용.
 *  · 화면·렌더링은 이 파일에서 처음부터 새로 작성(캔버스 직접 그리기). game-lab 렌더러 미참조.
 *  · design-lab import 0줄. 색/폰트는 theme.css 토큰(hex)만 복사해 씀.
 *
 * 게임(코어 상태 필드에서 파생):
 *  · 격자 GX×GY(64×36)에서 두 바이크가 STEP(0.05s)마다 한 칸 전진, 지나온 칸에 궤적(벽) occ[].
 *  · P1 Q=좌회전 / W=우회전, P2 U=좌회전 / I=우회전 (코어가 pend→turn 판정).
 *  · 벽/궤적 충돌 시 사망, 마지막 생존자 승. 정면충돌·동시사망·10초 생존은 DRAW.
 *  · gx/gy=머리칸, dir=방향(0우1하2좌3상), frac=다음칸 진행률(0~1, 보간용), occ=벽 맵.
 *
 * 배선(게임1·2 패턴):
 *  · game5.create(Math.random) / game5.step(state, events, dtSec) — state는 in-place mutate + 동일 참조.
 *  · attachLocalKeyboard(now, push): KeyQ/KeyW=P1, KeyU/KeyI=P2 (down/up 큐잉, 램프 점등).
 *  · rAF 루프 + 워치독(interval)으로 백그라운드 탭에서도 결과까지 진행(QA 대응).
 *  · result 확정 → 짧은 크래시 연출(RESULT_FX_MS) 후 reportRoundEnd 1회 → <ResultOverlay />.
 *  · online 모드면 P2는 봇(라이트 사이클 생존 AI가 좌/우 회전키를 합성).
 *  · 매 틱 setDebugGame(state), 언마운트 setDebugGame(null).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { game5, G5, GAME_DURATION } from '@madpump/shared';
import type { Game5State, GameInputEvent } from '@madpump/shared';
import type { MatchResult } from '@/shell';
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
import { setDebugGame, useDebugScreen } from '../../debug';
import { useOnlineRender } from '../../net/useOnlineRender';
import { functionColors, onlineStore, sendInput as onlineSendInput } from '../../net/online';
import { createEndTracker, drawEndFlash, type EndTracker } from '../../game/endFx';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import './game5.css';

// ---------------------------------------------------------------------------
// 캔버스: 코어 필드(800×450) = 격자 64×36 → 셀 12.5px. DPR 스케일로 반응형.
// ---------------------------------------------------------------------------
const CW = G5.W; // 800
const CH = G5.H; // 450
const GX = G5.GX; // 64
const GY = G5.GY; // 36
const CELL_W = CW / GX; // 12.5
const CELL_H = CH / GY; // 12.5

// 방향 벡터(렌더/AI 전용 — 판정은 코어가 함). 0=우 1=하 2=좌 3=상
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

const COL0 = {
  bgTop: '#160a33', // --surface-deep
  bgBottom: '#0d0221', // --bg
  grid: 'rgba(211,0,197,0.07)', // --accent2 dim
  gridMajor: 'rgba(211,0,197,0.15)',
  gridU: 'rgba(255,42,109,0.10)', // 임박(핑크)
  gridUMajor: 'rgba(255,42,109,0.20)',
  border: '#d300c5', // --accent2
  p1: '#05d9e8',
  p1body: 'rgba(5,217,232,0.22)',
  p2: '#ff2a6d',
  p2body: 'rgba(255,42,109,0.22)',
  accent: '#fdf500',
  accent2: '#d300c5',
  hot: '#f4f0ff', // --text
} as const;

/**
 * 색=플레이어 종속(역할 아님): 모듈 기본 COL0은 P1엔티티=시안('blue')·P2엔티티=핑크('red').
 * 이 라운드 실제 플레이어 색(functionColors)이 P1=빨강이면 p1/p2(그리고 body)를 스왑한 로컬 COL을 준다.
 * → 아래 COL.p1/p2/p1body/p2body 사용부가 자동으로 '플레이어 색'을 따른다(온라인/오프라인 draw 공통).
 * 오프라인/색 정보 없음이면 functionColors가 기본을 줘서 기존과 동일(시안 P1 / 핑크 P2).
 */
function playerCol() {
  const fc = functionColors();
  return fc.p1 === 'red'
    ? { ...COL0, p1: COL0.p2, p1body: COL0.p2body, p2: COL0.p1, p2body: COL0.p1body }
    : COL0;
}

const ARCADE_FONT = '"Press Start 2P", monospace';

/** 궤적 hot-glow로 표시할 최근 칸 수(머리 부근 발광 그라데이션) */
const HOT_MAX = 44;
/** 판정 → 결과 오버레이 전환 사이 인게임 크래시 연출 시간 */
const RESULT_FX_MS = 750;

// ---------------------------------------------------------------------------
// 렌더 전용 이펙트/구조
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'shards'; x: number; y: number; color: string; t: number }
  | { kind: 'caption'; text: string; color: string; x: number; y: number; t: number; life: number }
  | { kind: 'flash'; color: string; t: number }
  | { kind: 'chroma'; t: number };

interface Cell {
  x: number;
  y: number;
}

/** 코어 result → 셸 MatchResult 매핑 */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): MatchResult {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

// ---------------------------------------------------------------------------
// 온라인 mock 봇 — P2(라이트 사이클) 생존 AI. 판정은 여전히 코어.
// occ를 읽어 전방/좌/우 여유 칸을 재고 좌/우 회전을 반환('L'|'R'|null).
// ---------------------------------------------------------------------------
function free(occ: readonly number[], x: number, y: number): boolean {
  return x >= 0 && x < GX && y >= 0 && y < GY && occ[y * GX + x] === 0;
}

/** dir 방향으로 막힐 때까지 연속 빈 칸 수(cap) */
function rayFree(occ: readonly number[], x: number, y: number, dir: number, cap = 18): number {
  let n = 0;
  let cx = x;
  let cy = y;
  while (n < cap) {
    cx += DX[dir];
    cy += DY[dir];
    if (!free(occ, cx, cy)) break;
    n += 1;
  }
  return n;
}

function chooseBotTurn(s: Game5State): 'L' | 'R' | null {
  const { dir2: dir, gx2: x, gy2: y, occ } = s;
  const leftDir = (dir + 3) % 4;
  const rightDir = (dir + 1) % 4;
  const straight = rayFree(occ, x, y, dir);
  const left = rayFree(occ, x, y, leftDir);
  const right = rayFree(occ, x, y, rightDir);

  // 임박: 바로 앞칸이 막힘 → 이번 스텝에 반드시 꺾는다
  if (straight === 0) {
    if (left === 0 && right === 0) return null; // 궁지 — 직진(사망)
    return left >= right ? 'L' : 'R';
  }
  // 선제 회피: 전방 여유가 짧고 옆이 훨씬 넓으면 미리 꺾는다
  if (straight <= 3 && (left > straight + 2 || right > straight + 2)) {
    return left >= right ? 'L' : 'R';
  }
  // 완만한 방황(자기 궤적에 갇히지 않도록) — 확률적으로 넓은 쪽으로
  if (straight <= 7 && Math.abs(left - right) > 3 && Math.random() < 0.14) {
    return left > right ? 'L' : 'R';
  }
  return null;
}

// ---------------------------------------------------------------------------
// 캔버스 렌더러 (순수 그리기 — state는 읽기만)
// ---------------------------------------------------------------------------
function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game5State,
  fx: readonly Fx[],
  hot1: readonly Cell[],
  hot2: readonly Cell[],
  dead: { p1: boolean; p2: boolean },
  now: number,
  p1IsYou: boolean,
  p2IsYou: boolean,
): void {
  // 색=플레이어 종속: 모듈 COL을 이 라운드 실제 플레이어 색으로 스왑한 로컬 COL로 그림자화.
  // 아래 COL.p1/p2/p1body/p2body(궤적·hot·바이크)가 자동으로 P1/P2 기능 엔티티의 플레이어 색을 따른다.
  const COL = playerCol();
  const remMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remMs <= 5000 && s.result === null;

  // --- 배경(딥퍼플 그라디언트) ---
  ctx.clearRect(0, 0, CW, CH);
  const bg = ctx.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, COL.bgTop);
  bg.addColorStop(1, COL.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CW, CH);

  // --- 아케이드 그리드(임박 시 핑크 틴트) ---
  ctx.save();
  ctx.lineWidth = 1;
  const minor = urgent ? COL.gridU : COL.grid;
  const major = urgent ? COL.gridUMajor : COL.gridMajor;
  for (let i = 0; i <= GX; i += 1) {
    ctx.strokeStyle = i % 8 === 0 ? major : minor;
    const gx = i * CELL_W;
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, CH);
    ctx.stroke();
  }
  for (let j = 0; j <= GY; j += 1) {
    ctx.strokeStyle = j % 6 === 0 ? major : minor;
    const gy = j * CELL_H;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(CW, gy);
    ctx.stroke();
  }
  ctx.restore();

  // --- 아레나 경계(퍼플 네온 프레임) ---
  ctx.save();
  ctx.strokeStyle = COL.border;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.shadowColor = COL.border;
  ctx.shadowBlur = 5;
  ctx.strokeRect(1, 1, CW - 2, CH - 2);
  ctx.restore();

  // --- 궤적 몸통(occ 정본 — 연속 벽, 반투명 색·글로우 없음) ---
  const occ = s.occ;
  for (let j = 0; j < GY; j += 1) {
    for (let i = 0; i < GX; i += 1) {
      const v = occ[j * GX + i];
      if (v === 0) continue;
      ctx.fillStyle = v === 1 ? COL.p1body : COL.p2body;
      ctx.fillRect(i * CELL_W + 0.5, j * CELL_H + 0.5, CELL_W - 1, CELL_H - 1);
    }
  }

  // --- 궤적 hot-glow(최근 칸일수록 밝게 — 바이크의 광벽 발광) ---
  drawHot(ctx, hot1, COL.p1, now);
  drawHot(ctx, hot2, COL.p2, now);

  // --- 바이크 머리 + 방향 노즈(발광 초점) ---
  const youBlink = Math.floor(now / 450) % 2 === 0;
  drawBike(ctx, s.gx1, s.gy1, s.dir1, s.frac, COL.p1, 'P1', p1IsYou && youBlink, dead.p1);
  drawBike(ctx, s.gx2, s.gy2, s.dir2, s.frac, COL.p2, 'P2', p2IsYou && youBlink, dead.p2);

  // --- 이펙트: 파편 / 캡션 / 플래시 ---
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'shards' && age < 700) {
      ctx.save();
      ctx.fillStyle = f.color;
      ctx.globalAlpha = Math.max(0, 1 - age / 700);
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 8;
      for (let i = 0; i < 8; i += 1) {
        const ang = (Math.PI * 2 * i) / 8 + 0.4;
        const d = 6 + age * 0.12;
        ctx.fillRect(f.x + Math.cos(ang) * d - 2, f.y + Math.sin(ang) * d - 2, 4, 4);
      }
      ctx.restore();
    } else if (f.kind === 'caption' && age < f.life) {
      const blinkOn = Math.floor(age / 110) % 2 === 0 || age > 220; // steps 점멸 후 유지
      if (blinkOn) {
        ctx.save();
        ctx.font = `14px ${ARCADE_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 12;
        ctx.fillText(
          f.text,
          Math.min(CW - 60, Math.max(60, f.x)),
          Math.min(CH - 20, Math.max(26, f.y)),
        );
        ctx.restore();
      }
    } else if (f.kind === 'flash' && age < 160) {
      ctx.save();
      ctx.globalAlpha = 0.25 * (1 - age / 160);
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, CW, CH);
      ctx.restore();
    }
  }

  // --- 크래시 순간 크로마틱 어버레이션(승패 순간에만 1회, ~90ms) ---
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && now - chroma.t < 90) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(ctx.canvas, -4, 0, CW, CH);
    ctx.globalAlpha = 0.22;
    ctx.drawImage(ctx.canvas, 4, 0, CW, CH);
    ctx.restore();
  }
}

function drawHot(ctx: CanvasRenderingContext2D, hot: readonly Cell[], color: string, _now: number): void {
  const n = hot.length;
  if (n === 0) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  const denom = n - 1 || 1;
  for (let k = 0; k < n; k += 1) {
    const rec = k / denom; // 0 오래됨 .. 1 최신
    ctx.globalAlpha = 0.12 + 0.5 * rec;
    const c = hot[k];
    ctx.fillRect(c.x * CELL_W + 2, c.y * CELL_H + 2, CELL_W - 4, CELL_H - 4);
  }
  ctx.restore();
}

function drawBike(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  dir: number,
  frac: number,
  color: string,
  label: string,
  showYou: boolean,
  dead: boolean,
): void {
  if (dead) return; // 사망 바이크는 파편(shards)으로 대체
  const cx = gx * CELL_W + CELL_W / 2;
  const cy = gy * CELL_H + CELL_H / 2;

  // 방향 노즈(진행 방향으로 frac만큼 늘어나는 발광 선 → 속도감)
  const lead = 0.5 + 0.7 * frac;
  const nx = cx + DX[dir] * lead * CELL_W;
  const ny = cy + DY[dir] * lead * CELL_H;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(nx, ny);
  ctx.stroke();
  // 머리 사각(밝은 코어)
  ctx.fillStyle = color;
  ctx.fillRect(cx - CELL_W / 2 + 1.5, cy - CELL_H / 2 + 1.5, CELL_W - 3, CELL_H - 3);
  ctx.shadowBlur = 0;
  ctx.fillStyle = COL0.hot;
  ctx.fillRect(cx - 2, cy - 2, 4, 4);
  ctx.restore();

  // 머리 위 P1/P2 태그(+ 내 바이크면 YOU 점멸)
  ctx.save();
  ctx.font = `10px ${ARCADE_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  const ly = Math.max(12, cy - CELL_H / 2 - 3);
  ctx.fillText(label, cx, ly);
  if (showYou) {
    ctx.fillStyle = COL0.accent;
    ctx.shadowColor = COL0.accent;
    ctx.fillText('YOU', cx, Math.max(24, ly - 12));
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------
export default function Game5() {
  useDebugScreen('scr-game5');
  const flow = useFlow();
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const eventsRef = useRef<GameInputEvent[]>([]);
  const fxRef = useRef<Fx[]>([]);
  const hot1Ref = useRef<Cell[]>([]);
  const hot2Ref = useRef<Cell[]>([]);
  const lastHead1Ref = useRef<Cell>({ x: -1, y: -1 });
  const lastHead2Ref = useRef<Cell>({ x: -1, y: -1 });
  const deadRef = useRef<{ p1: boolean; p2: boolean }>({ p1: false, p2: false });
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const botNextAtRef = useRef(0);
  // 종료 연출: result 전환 추적(기본 플래시 전용 — 폭발 없음)
  const endRef = useRef<EndTracker>(createEndTracker());

  /** HUD 남은 시간(초 단위 양자화 — 리렌더 절약) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);

  // 서버 온라인(권위) 렌더 훅 — 활성/역할만 선택 구독(값 바뀌는 라운드 경계에서만 리렌더).
  //  · 스냅샷 → stateRef/snapAtRef 미러링은 훅이 리렌더 없이 처리.
  //  · per-snapshot HUD/디버그 반영만 onSnapshot으로 위임 → 값이 실제 바뀔 때만 리렌더(초 양자화).
  const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game5State>(5, (s) => {
    setDebugGame(s);
    const remMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remMs / 1000) * 1000);
  });
  // 입력 핸들러(안정 클로저)가 최신 '온라인 활성 여부'를 보게 하는 ref(stale-closure 방지)
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  // 내 색(플레이어 종속, 역할과 독립) — 원시값만 선택 구독 → 색 배정(매치 시작)에서만 리렌더.
  // 키캡/HUD 표식 색을 역할이 아니라 이 색으로 준다.
  const myColor = useSyncExternalStore(
    onlineStore.subscribe,
    () => onlineStore.get().myColor ?? 'blue',
    () => onlineStore.get().myColor ?? 'blue',
  );

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();

  // direct-URL 복구 + 이탈 시 디버그 브리지 정리
  // (온라인 매치가 활성이면 flow는 OnlineController가 세팅하므로 오프라인 복구를 걸지 않는다)
  useEffect(() => {
    const f = getFlow();
    if (!isOnline && (f.phase === 'idle' || f.gameId !== 5)) startOfflineGame(5);
    return () => setDebugGame(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (서버 스냅샷 → stateRef/snapAtRef 미러링 + per-snapshot HUD/디버그 반영은 useOnlineRender가 처리)

  // 캔버스 해상도 초기화(dpr 스케일)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // 키보드 — 로컬 어댑터. GameInputEvent 큐잉 + 램프 점등.
  // P1 Q/W, P2 U/I. 온라인이면 P2 키는 봇이 대행하므로 흡수하지 않는다.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // 서버 온라인 활성: 로컬 큐/봇 대신 서버로만 전송.
        // 슬롯 A=좌회전(Q·U) / B=우회전(W·I) — 내 역할은 서버가 role로 재기입하므로
        // 4키 아무거나 눌러도 내 슬롯으로 간다. 램프 점등은 눌린 물리 키 기준으로 유지.
        if (isOnlineRef.current) {
          // 온라인은 U/I 두 키만(요구사항). U=주키(slotA), I=보조키(slotB). Q/W는 무시.
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          if (e.type === 'down') {
            if (e.code === 'KeyU') flashU();
            else flashI();
          }
          return;
        }

        const f = getFlow();
        const online = f.mode === 'online';
        if (e.code === 'KeyQ') {
          if (e.type === 'down') flashQ();
        } else if (e.code === 'KeyW') {
          if (e.type === 'down') flashW();
        } else if (e.code === 'KeyU') {
          if (online) return; // 온라인 mock: P2 = 봇
          if (e.type === 'down') flashU();
        } else if (e.code === 'KeyI') {
          if (online) return;
          if (e.type === 'down') flashI();
        }
        if (f.phase === 'playing') eventsRef.current.push(e);
      },
    );
    return detach;
  }, [flashQ, flashW, flashU, flashI]);

  // 라운드 수명주기: state 생성 → rAF 루프(step + draw) → 결과 보고.
  // 백그라운드/오클루전 탭에서 rAF가 멈춰도 워치독 interval이 대신 스텝을 밟는다(QA 자동화 대응).
  useEffect(() => {
    // ── 온라인(서버 권위): step·봇·판정·결과보고 없이 서버 state만 그린다 ──
    // 기존 오프라인 루프가 매 프레임 호출하던 drawScene()을 그대로 재사용한다.
    if (isOnline) {
      let raf = 0;
      const recordHot = (arr: Cell[], lastRef: { current: Cell }, x: number, y: number) => {
        const l = lastRef.current;
        if (l.x !== x || l.y !== y) {
          arr.push({ x, y });
          if (arr.length > HOT_MAX) arr.shift();
          lastRef.current = { x, y };
        }
      };
      const loop = () => {
        const ctx = canvasRef.current?.getContext('2d');
        const s = stateRef.current;
        if (ctx && s) {
          const now = performance.now();
          recordHot(hot1Ref.current, lastHead1Ref, s.gx1, s.gy1);
          recordHot(hot2Ref.current, lastHead2Ref, s.gx2, s.gy2);
          fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
          const disp = getPlayerDisplays(getFlow());
          // 스냅샷 사이 외삽: 머리칸(gx/gy)·궤적(occ)은 충돌 정본이라 절대 전진시키지 않고,
          // 렌더 보간용 frac(다음칸 진행률, 노즈 길이)만 자기 속도(1칸/STEP)로 채운다.
          // 코어가 매 프레임 frac를 갱신하던 오프라인 노즈 램프를 온라인에서도 재현(0~1 캡).
          const extraDt = Math.min(G5.STEP, Math.max(0, (now - snapAtRef.current) / 1000));
          const view =
            extraDt > 0 && s.result === null
              ? { ...s, frac: Math.min(1, s.frac + extraDt / G5.STEP) }
              : s;
          drawScene(
            ctx,
            view,
            fxRef.current,
            hot1Ref.current,
            hot2Ref.current,
            deadRef.current,
            now,
            disp.P1.isYou,
            disp.P2.isYou,
          );
          endRef.current.update(s.result, now); // 기본 종료 플래시
          drawEndFlash(ctx, CW, CH, endRef.current.age(now));
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    if (flow.gameId !== 5 || flow.phase !== 'playing') return;

    const st = game5.create(Math.random);
    stateRef.current = st;
    eventsRef.current = [];
    fxRef.current = [];
    hot1Ref.current = [{ x: st.gx1, y: st.gy1 }];
    hot2Ref.current = [{ x: st.gx2, y: st.gy2 }];
    lastHead1Ref.current = { x: st.gx1, y: st.gy1 };
    lastHead2Ref.current = { x: st.gx2, y: st.gy2 };
    deadRef.current = { p1: false, p2: false };
    reportedRef.current = false;
    resultAtRef.current = 0;
    botNextAtRef.current = 0;
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);

    let raf = 0;
    let stopped = false;
    let last = performance.now();

    const recordHot = (arr: Cell[], lastRef: { current: Cell }, x: number, y: number) => {
      const l = lastRef.current;
      if (l.x !== x || l.y !== y) {
        arr.push({ x, y });
        if (arr.length > HOT_MAX) arr.shift();
        lastRef.current = { x, y };
      }
    };

    // 판정 순간 크래시 연출 산출(승패 순간에만 글리치)
    const onResult = (s: Game5State, now: number) => {
      // 크래시 파편/플래시/캡션 색도 플레이어 종속(바이크와 동일 색): 로컬 COL 그림자화.
      const COL = playerCol();
      const timeout = s.elapsed >= GAME_DURATION - 1e-6;
      let dead1 = false;
      let dead2 = false;
      if (s.result === 'P1') dead2 = true;
      else if (s.result === 'P2') dead1 = true;
      else if (s.result === 'DRAW' && !timeout) {
        dead1 = true;
        dead2 = true;
      }
      deadRef.current = { p1: dead1, p2: dead2 };

      const cellPx = (gx: number, gy: number, dir: number) => {
        const cx = Math.min(GX - 1, Math.max(0, gx + DX[dir]));
        const cy = Math.min(GY - 1, Math.max(0, gy + DY[dir]));
        return { x: cx * CELL_W + CELL_W / 2, y: cy * CELL_H + CELL_H / 2 };
      };
      if (dead1) {
        const p = cellPx(s.gx1, s.gy1, s.dir1);
        fxRef.current.push({ kind: 'shards', x: p.x, y: p.y, color: COL.p1, t: now });
      }
      if (dead2) {
        const p = cellPx(s.gx2, s.gy2, s.dir2);
        fxRef.current.push({ kind: 'shards', x: p.x, y: p.y, color: COL.p2, t: now });
      }
      fxRef.current.push({ kind: 'chroma', t: now });
      fxRef.current.push({
        kind: 'flash',
        color: dead1 && dead2 ? COL.accent2 : dead1 ? COL.p1 : dead2 ? COL.p2 : COL.accent,
        t: now,
      });

      let text: string;
      let color: string;
      let x: number;
      let y: number;
      if (timeout && s.result === 'DRAW') {
        text = 'TIME UP';
        color = COL.accent;
        x = CW / 2;
        y = CH / 2;
      } else if (dead1 && dead2) {
        text = 'DOUBLE KO';
        color = COL.accent2;
        x = CW / 2;
        y = CH / 2;
      } else {
        text = 'CRASH!';
        color = dead1 ? COL.p1 : COL.p2;
        const gx = dead1 ? s.gx1 : s.gx2;
        const gy = dead1 ? s.gy1 : s.gy2;
        x = gx * CELL_W + CELL_W / 2;
        y = gy * CELL_H - 6;
      }
      fxRef.current.push({ kind: 'caption', text, color, x, y, t: now, life: RESULT_FX_MS });
    };

    const frame = (now: number) => {
      if (stopped) return;
      // 라운드 인트로 중엔 시뮬 정지(코어 step 스킵) + last 갱신으로 재개 시 dt 점프 방지.
      // frame이 자기-스케줄 rAF 콜백이므로 다음 프레임은 계속 요청(체인 유지, Game1 loop 구조와 동일).
      if (isRoundIntroActive()) {
        last = now;
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min(0.1, (now - last) / 1000); // 초 단위, 100ms 클램프(격자 순간이동 방지)
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        const events = eventsRef.current;
        eventsRef.current = [];

        // 온라인 봇(P2): 생존 AI가 좌/우 회전키를 합성(스로틀 40ms)
        if (getFlow().mode === 'online' && now >= botNextAtRef.current) {
          const t = chooseBotTurn(s);
          if (t) {
            events.push({ code: t === 'L' ? 'KeyU' : 'KeyI', type: 'down', t: now / 1000 });
            (t === 'L' ? flashU : flashI)();
          }
          botNextAtRef.current = now + 40;
        }

        s = game5.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s); // 디버그 브리지 — 매 틱
        const remMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remMs / 1000) * 1000);

        recordHot(hot1Ref.current, lastHead1Ref, s.gx1, s.gy1);
        recordHot(hot2Ref.current, lastHead2Ref, s.gx2, s.gy2);

        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          onResult(s, now);
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // 크래시 연출을 짧게 보여준 뒤 라운드 종료 1회 보고 → ResultOverlay
        reportedRef.current = true;
        stopped = true;
        if (isOnline) return; // 온라인은 서버가 round:end 구동 — 화면은 보고하지 않음
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
          hot1Ref.current,
          hot2Ref.current,
          deadRef.current,
          now,
          disp.P1.isYou,
          disp.P2.isYou,
        );
        endRef.current.update(s.result, now); // 기본 종료 플래시
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      }

      if (!stopped) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    const watchdog = setInterval(() => {
      const now = performance.now();
      if (!stopped && now - last > 280) frame(now); // rAF가 살아있으면 개입하지 않음
    }, 250);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearInterval(watchdog);
    };
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound, flashU, flashI]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= 5000;
  // 라이더 표식 색=플레이어 종속: P1 기능 엔티티가 빨강이면 칩 색을 스왑(캔버스 바이크 색과 일치).
  const colorSwap = functionColors().p1 === 'red';

  return (
    <main data-testid="scr-game5" className="g5-root">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g5-topbar">
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
        <span className="g5-title font-display c-muted">게임10 · 라이트 사이클</span>
      </div>

      <div className="g5-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g5-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g5-canvas anim-sign-on" aria-label="게임10 스테이지 — 라이트 사이클" />

        {/* 좌상단 라이더 표식 — 색=플레이어 종속(P1/P2 기능 엔티티의 실제 플레이어 색) */}
        <div className="g5-riders" aria-hidden>
          <span className={`g5-rider ${colorSwap ? 'g5-rider--p2' : 'g5-rider--p1'} font-arcade`}>
            P1 CYCLE
          </span>
          <span className={`g5-rider ${colorSwap ? 'g5-rider--p1' : 'g5-rider--p2'} font-arcade`}>
            P2 CYCLE
          </span>
        </div>
      </div>

      {/* 온스크린 키캡 — 실제 배정 키(SPEC Q2) + 입력 순간 램프 점등 */}
      {isOnline ? (
        <div className="g5-keys g5-keys--online">
          <div className="g5-keys__group">
            <span className={`g5-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myColor === 'blue' ? '파랑' : '빨강'} · CYCLE
            </span>
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="U" icon="↺" lit={uLit} label="좌회전" />
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="I" icon="↻" lit={iLit} label="우회전" />
          </div>
          <span className="g5-keys__hint font-arcade">U 좌회전 · I 우회전 — TURN TO SURVIVE</span>
        </div>
      ) : (
        <div className="g5-keys">
          <div className="g5-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="↺" lit={qLit} label="좌회전" />
            <KeyCap role="P1" keyChar="W" icon="↻" lit={wLit} label="우회전" />
            <span className="g5-keys__tag font-arcade c-p1">P1 · CYCLE</span>
          </div>
          <span className="g5-keys__hint font-arcade">TURN TO SURVIVE</span>
          <div className="g5-keys__group">
            <span className="g5-keys__tag font-arcade c-p2">P2 · CYCLE</span>
            <KeyCap role="P2" keyChar="U" icon="↺" lit={uLit} label="좌회전" />
            <KeyCap role="P2" keyChar="I" icon="↻" lit={iLit} label="우회전" />
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}
