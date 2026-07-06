/**
 * 게임6 · 펌프 (scr-game6) — NEON COIN-OP 아케이드 화면 (신규 제작).
 * 컨테이너 testid: scr-game6 / 부품: game-stage(CRT 베젤), hud-*(HudFrame 내장), btn-exit
 *
 * ── 게임(코어 game6) ────────────────────────────────────────────
 *  · P1에게는 Q/W, P2에게는 U/I로 이루어진 100칸 연타 스트링(제한 10초 × 10).
 *  · "지금 눌러야 할 키"를 맞히면 +1 & 다음 칸으로. 틀리면 −1(제자리).
 *  · 종료 시 점수 높은 쪽 승(동점 무승부).
 *  키 인코딩: 0 = 첫 키(Q/U), 1 = 둘째 키(W/I).
 *
 * ── 화면(처음부터 새로 그린 neon-coinop 비주얼) ─────────────────
 *  "두 개의 연타 레인, 하나의 스코어 잭팟" — DDR식 노트 하이웨이 대전.
 *   · 좌 P1(시안)/우 P2(핑크) 미러 레인. 각 레인에 히트라인(NOW)으로 내려오는
 *     키 타일이 원근으로 수렴(멀수록 작고 흐림). 현재 칸 타일이 히트라인에서 발광.
 *   · 정답 = 타일 팝 + "+1" 상승 + 히트 링 / 오답 = 붉은 플래시 + 레인 셰이크 + "-1".
 *   · 점수 = 아케이드 잭팟 카운터(하드 스텝 + 변경 순간 글로우 버스트).
 *   · 외곽 PUMP 게이지(진행도 idx/100) — 누가 더 펌핑했나 레이스.
 *   · 승패 순간에만 크로마틱 글리치 1프레임. 임박 5초 = 옐로 스캔 스윕(유일 accent).
 *   · CRT 베젤/스캔라인은 theme.css·App 전역 — 여기서 중복 렌더 금지.
 *
 * ── 배선(게임1·2 화면과 동일 패턴) ─────────────────────────────
 *   mount → idle이거나 다른 게임이면 startOfflineGame(6) (direct-URL 복구)
 *   라운드마다 game6.create(Math.random)
 *   rAF 루프 → game6.step(state, events, dtSec) → setDebugGame(state) 매 틱
 *   입력 attachLocalKeyboard(GameInputEvent 큐) → step에 그대로 전달(코어가 down만 판정)
 *   result 확정 → (RESULT_FX_MS 글리치 후) reportRoundEnd(매핑) 1회 → <ResultOverlay />
 *   online 모드 → P2는 봇(정답 키를 인간 페이스로 연타, 소량 미스). 사람은 P1(q/w).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { game6, G6, SEQ_LEN, GAME_DURATION } from '@madpump/shared';
import type { Game6State, GameInputEvent } from '@madpump/shared';
import type { MatchResult, PlayerRole } from '@/shell';
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
import { sendInput as onlineSendInput } from '../../net/online';
import { createEndTracker, drawEndFlash, type EndTracker } from '../../game/endFx';
import ResultOverlay from './ResultOverlay';
import './game6.css';

// ---------------------------------------------------------------------------
// 캔버스 상수 (논리 800×450 — CSS로 반응형 스케일, 16:9)
// ---------------------------------------------------------------------------
const CW = 800;
const CH = 450;

const COL = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  surface: '#241640', // --surface
  p1: '#05d9e8',
  p1dim: '#0a3a4a',
  p2: '#ff2a6d',
  p2dim: '#4a0a26',
  accent: '#fdf500',
  accent2: '#d300c5',
  error: '#ff3864',
  muted: '#9d8fbf',
  text: '#f4f0ff',
} as const;

const ARCADE = '"Press Start 2P", monospace';

// 레인/타일 지오메트리 (논리 좌표)
const HIT_Y = 318;
const SPACING = 60;
const TILE = 72; // NOW 타일 한 변
const LANE_HALF = 116;
const P1_X = 206;
const P2_X = 594;
const SCORE_Y = 66;
const AHEAD = 4.6; // 히트라인 위로 보여줄 최대 오프셋
const BEHIND = -1.4; // 히트라인 아래(소비된 타일)
const PUMP_TOP = 150;
const PUMP_BOT = 356;

/** 판정 → 결과 오버레이 전환 사이 인게임 글리치 연출 시간 */
const RESULT_FX_MS = 620;

/** 코어 result('P1'|'P2'|'DRAW') → 셸 MatchResult */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): MatchResult {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

/** 키 값(0/1) → 방향 아이콘(좌/우 펌프 패드) */
function arrowFor(v: number): string {
  return v === 0 ? '◀' : '▶'; // ◀ / ▶
}

// ---------------------------------------------------------------------------
// 렌더 전용 이펙트 (로직 비침범)
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'float'; side: PlayerRole; x: number; y: number; t: number; text: string; color: string }
  | { kind: 'ring'; side: PlayerRole; x: number; y: number; t: number }
  | { kind: 'chroma'; t: number };

interface RenderBundle {
  p1Scroll: number;
  p2Scroll: number;
  fx: readonly Fx[];
  scoreFx: Record<PlayerRole, number>;
  now: number;
  urgent: boolean;
  reduceMotion: boolean;
  p1IsYou: boolean;
  p2IsYou: boolean;
}

// ---------------------------------------------------------------------------
// 캔버스 렌더러 (순수 그리기 — state는 읽기만)
// ---------------------------------------------------------------------------
function drawScene(ctx: CanvasRenderingContext2D, s: Game6State, r: RenderBundle): void {
  const { now, urgent, reduceMotion } = r;

  // --- 필드 ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // 옅은 세로 그리드 (퍼플) — 임박 시 핑크 톤
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,42,109,0.10)' : 'rgba(211,0,197,0.07)';
  ctx.lineWidth = 1;
  for (let gx = 40; gx < CW; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, 96);
    ctx.lineTo(gx, 404);
    ctx.stroke();
  }
  ctx.restore();

  // --- 중앙 디바이더 (퍼플 네온) ---
  ctx.save();
  ctx.strokeStyle = COL.accent2;
  ctx.shadowColor = COL.accent2;
  ctx.shadowBlur = 10;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CW / 2, 92);
  ctx.lineTo(CW / 2, 408);
  ctx.stroke();
  // 상단 VS 눈금
  ctx.globalAlpha = 0.9;
  ctx.shadowBlur = 6;
  ctx.fillStyle = COL.muted;
  ctx.font = `10px ${ARCADE}`;
  ctx.textAlign = 'center';
  ctx.fillText('VS', CW / 2, 88);
  ctx.restore();

  // --- 임박 스캔 스윕 (유일 accent 사용) ---
  if (urgent && !reduceMotion) {
    ctx.save();
    ctx.strokeStyle = 'rgba(253,245,0,0.12)';
    ctx.lineWidth = 1;
    const off = 34 - ((now / 9) % 34);
    for (let gy = 100 + off; gy < 404; gy += 34) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(CW, gy);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawLane(ctx, 'P1', s, r);
  drawLane(ctx, 'P2', s, r);

  // --- 부유 이펙트 (+1 / -1) ---
  for (const f of r.fx) {
    if (f.kind !== 'float') continue;
    const age = now - f.t;
    if (age > 600) continue;
    const p = age / 600;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 10;
    ctx.font = `13px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y - p * 34);
    ctx.restore();
  }

  // --- 승패 순간 크로마틱 글리치 1프레임 (reduce-motion 존중) ---
  if (!reduceMotion) {
    const chroma = r.fx.find((f) => f.kind === 'chroma');
    if (chroma && now - chroma.t < 90) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.28;
      ctx.drawImage(ctx.canvas, -4, 0, CW, CH);
      ctx.globalAlpha = 0.2;
      ctx.drawImage(ctx.canvas, 4, 0, CW, CH);
      ctx.restore();
    }
  }
}

/** 한 레인(플레이어) 그리기 */
function drawLane(ctx: CanvasRenderingContext2D, side: PlayerRole, s: Game6State, r: RenderBundle): void {
  const isP1 = side === 'P1';
  const laneX = isP1 ? P1_X : P2_X;
  const color = isP1 ? COL.p1 : COL.p2;
  const dim = isP1 ? COL.p1dim : COL.p2dim;
  const seq = isP1 ? s.p1Seq : s.p2Seq;
  const idx = isP1 ? s.p1Idx : s.p2Idx;
  const score = isP1 ? s.p1Score : s.p2Score;
  const flash = isP1 ? s.p1Flash : s.p2Flash;
  const wrong = isP1 ? s.p1Wrong : s.p2Wrong;
  const scroll = isP1 ? r.p1Scroll : r.p2Scroll;
  const scoreFxT = r.scoreFx[side];
  const isYou = isP1 ? r.p1IsYou : r.p2IsYou;
  const { now, reduceMotion } = r;

  // 오답 셰이크 (레인 타일 그룹에만)
  const shakeX =
    wrong > 0 && !reduceMotion ? (Math.random() * 2 - 1) * 4 * (wrong / G6.FLASH) : 0;

  // --- 레인 배경 패널 (dim 바탕 + 퍼플 헤어라인) ---
  ctx.save();
  ctx.fillStyle = COL.deep;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(laneX - LANE_HALF, 100, LANE_HALF * 2, 300);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(211,0,197,0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(laneX - LANE_HALF, 100, LANE_HALF * 2, 300);
  ctx.restore();

  // --- PUMP 진행 게이지 (외곽) ---
  const pumpX = isP1 ? 44 : CW - 44 - 12;
  const ratio = Math.max(0, Math.min(1, idx / SEQ_LEN));
  ctx.save();
  ctx.fillStyle = COL.deep;
  ctx.fillRect(pumpX, PUMP_TOP, 12, PUMP_BOT - PUMP_TOP);
  ctx.strokeStyle = 'rgba(211,0,197,0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pumpX, PUMP_TOP, 12, PUMP_BOT - PUMP_TOP);
  const fillH = (PUMP_BOT - PUMP_TOP) * ratio;
  if (fillH > 0) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillRect(pumpX + 1, PUMP_BOT - fillH, 10, fillH);
  }
  ctx.restore();

  // --- 노트 하이웨이 (타일) ---
  const lo = Math.floor(scroll) - 2;
  const hi = Math.floor(scroll) + 6;
  // 먼 타일(큰 offset) 먼저, 가까운/소비 타일 나중에 그려 위로 겹치게
  for (let j = hi; j >= lo; j--) {
    if (j < 0 || j >= SEQ_LEN) continue;
    const offset = j - scroll;
    if (offset > AHEAD || offset < BEHIND) continue;
    const isNow = j === idx;
    const y = HIT_Y - offset * SPACING;

    let scale: number;
    let alpha: number;
    if (offset >= 0) {
      scale = Math.max(0.44, 1 - offset * 0.12);
      alpha = Math.max(0.14, 1 - offset * 0.17);
    } else {
      const tt = -offset; // 소비된 타일이 시청자 쪽으로 커지며 소멸
      scale = 1 + tt * 0.18;
      alpha = Math.max(0, 1 - tt * 1.5);
    }
    if (alpha <= 0.02) continue;

    // 정답 팝: 현재(NOW) 타일이 히트 순간 살짝 커짐
    const pop = isNow && flash > 0 ? 1 + (flash / G6.FLASH) * 0.14 : 1;
    const sz = TILE * scale * pop;
    const cx = laneX + (offset >= -0.2 ? shakeX : 0);
    const v = seq[j];

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, y);

    // 타일 몸통
    ctx.fillStyle = dim;
    ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
    if (isNow) {
      ctx.strokeStyle = wrong > 0 ? COL.error : color;
      ctx.shadowColor = wrong > 0 ? COL.error : color;
      ctx.shadowBlur = wrong > 0 ? 16 : 14;
      ctx.lineWidth = 2.5;
    } else {
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.lineWidth = 1.5;
    }
    ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);

    // 방향 아이콘 — Q/W/U/I 글자 대신 ◀/▶(왼쪽/오른쪽)를 크게 표시
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = isNow ? (wrong > 0 ? COL.error : color) : color;
    ctx.shadowColor = isNow ? (wrong > 0 ? COL.error : color) : color;
    ctx.shadowBlur = isNow ? 12 : 0;
    ctx.font = `${Math.max(14, Math.round(32 * scale))}px ${ARCADE}`;
    ctx.fillText(arrowFor(v), 0, 0);
    ctx.restore();
  }

  // --- 히트라인 (NOW 프레임) ---
  ctx.save();
  ctx.strokeStyle = flash > 0 ? COL.text : color;
  ctx.shadowColor = color;
  ctx.shadowBlur = flash > 0 ? 18 : 10;
  ctx.lineWidth = flash > 0 ? 3 : 2;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(laneX - LANE_HALF + 6, HIT_Y + TILE / 2 + 6);
  ctx.lineTo(laneX + LANE_HALF - 6, HIT_Y + TILE / 2 + 6);
  ctx.stroke();
  // 좌우 브래킷 틱
  const bx = laneX - TILE / 2 - 8;
  const bx2 = laneX + TILE / 2 + 8;
  const by = HIT_Y + TILE / 2 + 6;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx, by - 12);
  ctx.moveTo(bx2, by);
  ctx.lineTo(bx2, by - 12);
  ctx.stroke();
  // NOW 태그
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color;
  ctx.font = `10px ${ARCADE}`;
  ctx.textAlign = isP1 ? 'left' : 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('NOW', isP1 ? laneX - LANE_HALF + 4 : laneX + LANE_HALF - 4, HIT_Y + TILE / 2 + 26);
  ctx.restore();

  // 스트링 소진(비상): NOW 없음 → MAX 표기
  if (idx >= SEQ_LEN) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.font = `16px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MAX!', laneX, HIT_Y);
    ctx.restore();
  }

  // --- 히트 링 이펙트 ---
  for (const f of r.fx) {
    if (f.kind !== 'ring' || f.side !== side) continue;
    const age = now - f.t;
    if (age > 260) continue;
    const p = age / 260;
    ctx.save();
    ctx.globalAlpha = (1 - p) * 0.9;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    const rs = TILE * (1 + p * 0.5);
    ctx.strokeRect(laneX - rs / 2, HIT_Y - rs / 2, rs, rs);
    ctx.restore();
  }

  // --- 점수 잭팟 카운터 (하드 스텝 + 변경 순간 글로우 버스트) ---
  const burst = scoreFxT > 0 && now - scoreFxT < 100;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // 캡션
  ctx.fillStyle = COL.muted;
  ctx.font = `10px ${ARCADE}`;
  ctx.fillText('SCORE', laneX, SCORE_Y - 30);
  // 숫자
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = burst ? 22 : 12;
  const fs = burst ? 44 : 40;
  ctx.font = `${fs}px ${ARCADE}`;
  ctx.fillText(String(score), laneX, SCORE_Y + 8);
  // 내 쪽 YOU
  if (isYou && Math.floor(now / 500) % 2 === 0) {
    ctx.fillStyle = COL.accent;
    ctx.shadowColor = COL.accent;
    ctx.shadowBlur = 6;
    ctx.font = `10px ${ARCADE}`;
    ctx.fillText('YOU', laneX, SCORE_Y - 44);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------
export default function Game6() {
  useDebugScreen('scr-game6');
  const flow = useFlow();
  const navigate = useNavigate();

  // 온라인 렌더 훅(성능 표준) — 활성/역할만 '선택 구독'해서 라운드 경계에서만 리렌더하고,
  // 서버 스냅샷은 stateRef에 직접 미러(리렌더 유발 안 함). per-snapshot HUD/디버그 반영은
  // onSnapshot으로 위임 → 60Hz 스냅샷이 60Hz 리렌더로 번지던 churn 제거.
  // isOnline이면 로컬 시뮬/봇/판정을 끄고 서버 권위 상태만 렌더 + 내 입력만 서버로 전송한다.
  const { isOnline, myRole, stateRef } = useOnlineRender<Game6State>(6, (s) => {
    setDebugGame(s); // 디버그 브리지 — 스냅샷마다 갱신
    // HUD 남은 시간(서버 elapsed 기반, 초 단위 양자화 — 값 동일 스냅샷은 리렌더 없음)
    setHudMs(Math.ceil(Math.max(0, (GAME_DURATION - s.elapsed) * 1000) / 1000) * 1000);
  });
  // 키보드 핸들러(마운트 시 1회 등록)가 최신 '온라인 활성 여부'를 보게 하는 ref — stale closure 방지.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const eventsRef = useRef<GameInputEvent[]>([]);
  const p1ScrollRef = useRef(0);
  const p2ScrollRef = useRef(0);
  const fxRef = useRef<Fx[]>([]);
  const scoreFxRef = useRef<Record<PlayerRole, number>>({ P1: -1, P2: -1 });
  const endRef = useRef<EndTracker>(createEndTracker());
  const prevRef = useRef({ p1Score: 0, p2Score: 0, p1Idx: 0, p2Idx: 0 });
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const botNextRef = useRef(0);
  const reduceMotionRef = useRef(false);

  /** HUD 표시용 남은 시간 (초 단위 양자화 — 리렌더 절약) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();
  const lampRef = useRef({ flashQ, flashW, flashU, flashI });
  lampRef.current = { flashQ, flashW, flashU, flashI };

  // direct-URL 복구
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 6) startOfflineGame(6);
  }, []);

  // reduced-motion 스냅샷
  useEffect(() => {
    reduceMotionRef.current =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
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

  // (서버 상태 → stateRef/디버그/HUD 미러링은 useOnlineRender + 위 onSnapshot 콜백이 담당.
  //  리렌더 없이 stateRef.current를 갱신하므로 별도 미러 effect가 필요없다.)

  // 키보드 — GameInputEvent 큐 수집 + 램프 점등. 온라인 P2(u/i)는 봇이 대행.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // ── 서버 온라인: U/I 두 키만(요구사항). U=주키(slotA), I=보조키(slotB). Q/W는 무시 ──
        if (isOnlineRef.current) {
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          if (e.type === 'down') {
            if (e.code === 'KeyU') lampRef.current.flashU();
            else lampRef.current.flashI();
          }
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t);
          return;
        }
        // ── 오프라인(기존 그대로) — mock-online이면 P2(u/i)는 봇이 대행 ──
        const f = getFlow();
        const mockOnline = f.mode === 'online';
        const isP2 = e.code === 'KeyU' || e.code === 'KeyI';
        if (mockOnline && isP2) return; // 온라인(mock) P2 = 봇
        if (e.type === 'down') {
          if (e.code === 'KeyQ') lampRef.current.flashQ();
          else if (e.code === 'KeyW') lampRef.current.flashW();
          else if (e.code === 'KeyU') lampRef.current.flashU();
          else if (e.code === 'KeyI') lampRef.current.flashI();
        }
        if (f.phase === 'playing') eventsRef.current.push(e);
      },
    );
    return () => {
      detach();
      setDebugGame(null);
    };
  }, []);

  // 라운드 수명주기: state 생성 → rAF 루프(step + draw) → 결과 보고
  useEffect(() => {
    // ── 서버 온라인: step·봇·결과보고 없이 서버 상태만 그리는 draw-only 루프 ──
    if (isOnline) {
      // 첫 스냅샷 전이면 중립 초기 상태를 placeholder로 그린다(스냅샷 오면 onSnapshot이 덮어씀).
      if (!stateRef.current) {
        const init = game6.create(Math.random);
        stateRef.current = init;
        setDebugGame(init);
      }
      let raf = 0;
      let last = performance.now();
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const s = stateRef.current;
        const ctx = canvasRef.current?.getContext('2d');
        if (!s || !ctx) return;
        const dt = Math.min(0.5, (now - last) / 1000);
        last = now;

        // 스크롤 이징(순수 렌더) — 서버 idx로 수렴
        const ease = Math.min(1, dt * 18);
        p1ScrollRef.current += (s.p1Idx - p1ScrollRef.current) * ease;
        p2ScrollRef.current += (s.p2Idx - p2ScrollRef.current) * ease;

        // (HUD 남은 시간은 onSnapshot에서 스냅샷마다 갱신 — 렌더 루프에서 setState 하지 않는다.)
        fxRef.current = fxRef.current.filter((f) => now - f.t < 900);
        const displays = getPlayerDisplays(getFlow());
        drawScene(ctx, s, {
          p1Scroll: p1ScrollRef.current,
          p2Scroll: p2ScrollRef.current,
          fx: fxRef.current,
          scoreFx: scoreFxRef.current,
          now,
          urgent: Math.max(0, (GAME_DURATION - s.elapsed) * 1000) <= 5000 && s.result === null,
          reduceMotion: reduceMotionRef.current,
          p1IsYou: displays.P1.isYou,
          p2IsYou: displays.P2.isYou,
        });
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    if (flow.gameId !== 6 || flow.phase !== 'playing') return;

    const st = game6.create(Math.random);
    stateRef.current = st;
    eventsRef.current = [];
    fxRef.current = [];
    p1ScrollRef.current = 0;
    p2ScrollRef.current = 0;
    scoreFxRef.current = { P1: -1, P2: -1 };
    prevRef.current = { p1Score: 0, p2Score: 0, p1Idx: 0, p2Idx: 0 };
    reportedRef.current = false;
    resultAtRef.current = 0;
    botNextRef.current = 0;
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
        const events = eventsRef.current;
        eventsRef.current = [];

        // 온라인 봇(P2): 정답 키를 인간 페이스로 연타, 소량 미스로 승부 여지
        if (getFlow().mode === 'online' && s.p2Idx < SEQ_LEN && now >= botNextRef.current) {
          const correctV = s.p2Seq[s.p2Idx];
          const miss = Math.random() < 0.09;
          const pressV = miss ? (correctV === 0 ? 1 : 0) : correctV;
          const code = pressV === 0 ? 'KeyU' : 'KeyI';
          events.push({ code, type: 'down', t: now / 1000 });
          (pressV === 0 ? lampRef.current.flashU : lampRef.current.flashI)();
          botNextRef.current = now + 95 + Math.random() * 55;
        }

        const prev = prevRef.current;
        s = game6.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);

        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);

        // ---- 렌더 전용 이펙트 파생 (로직 비침범) ----
        // 정답(idx 증가) → 히트 링 + "+1"
        if (s.p1Idx > prev.p1Idx) {
          fxRef.current.push(
            { kind: 'ring', side: 'P1', x: P1_X, y: HIT_Y, t: now },
            { kind: 'float', side: 'P1', x: P1_X, y: HIT_Y - 44, t: now, text: '+1', color: COL.p1 },
          );
        }
        if (s.p2Idx > prev.p2Idx) {
          fxRef.current.push(
            { kind: 'ring', side: 'P2', x: P2_X, y: HIT_Y, t: now },
            { kind: 'float', side: 'P2', x: P2_X, y: HIT_Y - 44, t: now, text: '+1', color: COL.p2 },
          );
        }
        // 오답(점수 감소, idx 유지) → "-1"
        if (s.p1Score < prev.p1Score && s.p1Idx === prev.p1Idx) {
          fxRef.current.push({ kind: 'float', side: 'P1', x: P1_X, y: HIT_Y - 44, t: now, text: '-1', color: COL.error });
        }
        if (s.p2Score < prev.p2Score && s.p2Idx === prev.p2Idx) {
          fxRef.current.push({ kind: 'float', side: 'P2', x: P2_X, y: HIT_Y - 44, t: now, text: '-1', color: COL.error });
        }
        // 점수 변경 순간 글로우 버스트 타임스탬프
        if (s.p1Score !== prev.p1Score) scoreFxRef.current.P1 = now;
        if (s.p2Score !== prev.p2Score) scoreFxRef.current.P2 = now;

        prevRef.current = {
          p1Score: s.p1Score,
          p2Score: s.p2Score,
          p1Idx: s.p1Idx,
          p2Idx: s.p2Idx,
        };

        // 판정 순간 글리치 1회
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          fxRef.current.push({ kind: 'chroma', t: now });
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        if (isOnline) return; // 온라인은 서버가 round:end 구동 — 화면은 결과 보고 안 함
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      // 스크롤 이징(타일 슬라이드) — idx로 수렴
      const ease = Math.min(1, dt * 18);
      p1ScrollRef.current += (s.p1Idx - p1ScrollRef.current) * ease;
      p2ScrollRef.current += (s.p2Idx - p2ScrollRef.current) * ease;

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        fxRef.current = fxRef.current.filter((f) => now - f.t < 900);
        const displays = getPlayerDisplays(getFlow());
        drawScene(ctx, s, {
          p1Scroll: p1ScrollRef.current,
          p2Scroll: p2ScrollRef.current,
          fx: fxRef.current,
          scoreFx: scoreFxRef.current,
          now,
          urgent: Math.max(0, (GAME_DURATION - s.elapsed) * 1000) <= 5000 && s.result === null,
          reduceMotion: reduceMotionRef.current,
          p1IsYou: displays.P1.isYou,
          p2IsYou: displays.P2.isYou,
        });
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
        <span className="g6-title font-arcade c-muted">게임6 · 펌프</span>
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
        <canvas ref={canvasRef} className="g6-canvas" aria-label="게임6 스테이지 — 펌프 연타 대전" />

        {flow.phase === 'playing' && flow.currentRound > 0 && (
          <div key={flow.currentRound} className="g6-round-intro" aria-hidden>
            <span className="font-arcade c-accent glow-text g6-round-intro__big">
              ROUND {flow.currentRound}
            </span>
            <span className="font-arcade c-muted g6-round-intro__sub">MASH THE PADS!</span>
          </div>
        )}
      </div>

      {/* 온스크린 키캡 — 실제 배정 키 표기 (SPEC Q2), 입력 순간 램프 점등 */}
      {isOnline ? (
        // 온라인: 로컬 플레이어(U/I)만, 내 색으로. U=왼쪽 패드, I=오른쪽 패드.
        <div className="g6-keys g6-keys--online">
          <div className="g6-keys__group">
            <span className={`g6-keys__tag font-arcade ${myRole === 'P1' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myRole === 'P1' ? '파랑' : '빨강'} · PUMP
            </span>
            <KeyCap role={myRole ?? 'P2'} keyChar="U" icon="◀" lit={uLit} label="왼쪽" />
            <KeyCap role={myRole ?? 'P2'} keyChar="I" icon="▶" lit={iLit} label="오른쪽" />
          </div>
          <span className="g6-keys__hint font-arcade c-muted">HIT THE GLOWING PAD</span>
        </div>
      ) : (
        <div className="g6-keys">
          <div className="g6-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="◀" lit={qLit} label="왼쪽" />
            <KeyCap role="P1" keyChar="W" icon="▶" lit={wLit} label="오른쪽" />
            <span className="g6-keys__tag font-arcade c-p1">P1 · PUMP</span>
          </div>
          <span className="g6-keys__hint font-arcade c-muted">HIT THE GLOWING PAD</span>
          <div className="g6-keys__group">
            <span className="g6-keys__tag font-arcade c-p2">P2 · PUMP</span>
            <KeyCap role="P2" keyChar="U" icon="◀" lit={uLit} label="왼쪽" />
            <KeyCap role="P2" keyChar="I" icon="▶" lit={iLit} label="오른쪽" />
          </div>
        </div>
      )}

      <ResultOverlay />
    </main>
  );
}