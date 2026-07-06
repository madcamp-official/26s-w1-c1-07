/**
 * 게임8 · 마그마 총격 듀얼 (NEON COIN-OP). 담당: game7 에이전트.
 * 컨테이너 testid: scr-game7 / 부품: game-stage(CRT 베젤), hud-*(HudFrame 내장), btn-exit
 *
 * ── 게임(코어 game7) 요약 ─────────────────────────────────────────────
 *  · P1(왼쪽 시안)·P2(오른쪽 핑크)가 마주 보고 먼저 상대를 맞히면 승리.
 *  · 두 기체는 위에서 스폰돼 중력으로 낙하 — Q/U 살짝 점프(플래피), W/I 수평 발사(쿨다운).
 *  · 바닥 마그마가 10초간 상승(H→H/2), 닿으면 즉사. 천장 가시(0~SPIKE_H)에 닿아도 즉사.
 *  · 총알은 0.5초에 상대에 도달 → 발사 후 상대가 높이를 바꿔 회피 가능.
 *  · 명중=쏜 쪽 승 / 마그마·가시=닿은 쪽 패 / 10초 생존=DRAW.
 *
 * ── 화면(neon-coinop, 처음부터 새로) ─────────────────────────────────
 *  · 논리 800×450 캔버스(=G7.W/H, 좌표 1:1) + DPR 스케일, CSS 16:9 반응형.
 *  · 발광요소 절제: 마그마(옐로/열), P1(시안), P2(핑크) 3계열 글로우.
 *    천장 가시·그리드는 무발광 dim 라인. 순색 대면적 금지(dim 바탕 + 2px 보더).
 *  · 등장 sign-on 플리커(≈420ms), 승패 순간에만 크로마틱 글리치. reduced-motion 존중.
 *  · 스캔라인은 전역(App) — 여기서 중복 렌더 금지.
 *
 * ── 배선(게임1·2와 동일 envelope) ────────────────────────────────────
 *  · game7.create(Math.random) / game7.step(state, events, dtSec)
 *  · attachLocalKeyboard: KeyQ/KeyW=P1, KeyU/KeyI=P2. 코어는 'down'만 처리(엣지 발사/점프).
 *  · step은 원본 mutate 후 동일 참조 반환 → 이전값 비교는 호출 전 스칼라 스냅샷.
 *  · result 확정 → 짧은 FX(RESULT_FX_MS) 후 reportRoundEnd 1회 → <ResultOverlay />
 *  · online 모드 → P2는 봇(생존 호버 + 정렬 시 발사 + 탄 회피 휴리스틱).
 *  · 매 틱 setDebugGame(state), 언마운트 setDebugGame(null).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { game7, G7, GAME_DURATION, magmaSurfaceY } from '@madpump/shared';
import type { Game7State, GameInputEvent } from '@madpump/shared';
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
import './game7.css';

// ---------------------------------------------------------------------------
// 캔버스 = 코어 논리 해상도(800×450) 그대로 → 좌표 변환 불필요(1:1).
// ---------------------------------------------------------------------------
const CW = G7.W;
const CH = G7.H;

const COL0 = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  bg: '#0d0221', // --bg
  p1: '#05d9e8',
  p1dim: '#0a3a4a',
  p2: '#ff2a6d',
  p2dim: '#4a0a26',
  accent: '#fdf500',
  accent2: '#d300c5',
  error: '#ff3864',
  win: '#39ff88',
  muted: '#9d8fbf',
} as const;

const ARCADE_FONT = '"Press Start 2P", monospace';

/**
 * 색은 플레이어 종속(역할과 독립) — functionColors()에 따라 P1/P2 엔티티 색을 '플레이어 색'으로 스왑한 팔레트.
 * fc.p1==='red'면 P1엔티티=빨강(핑크)·P2엔티티=파랑(시안)이 되도록 p1/p2(및 dim) 교환.
 * 오프라인/색 정보 없으면 fc={p1:'blue',p2:'red'} → COL0 그대로(기존 룩 유지).
 */
function themedCols() {
  const fc = functionColors();
  return fc.p1 === 'red'
    ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
    : COL0;
}

/** 판정 → 결과 오버레이 사이 인게임 연출(피격 파편/글리치) 시간 */
const RESULT_FX_MS = 620;

/** 코어 result → 셸 MatchResult */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): MatchResult {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** sign-on 플리커 off 창(등장 시 프레임 blank). f = age/420 ∈ [0,1) */
function signOffWindow(f: number): boolean {
  return f < 0.29 || (f >= 0.45 && f < 0.59) || (f >= 0.75 && f < 0.84);
}

// ---------------------------------------------------------------------------
// 렌더 전용 이펙트 (state는 읽기만 — 로직 비침범)
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'muzzle'; x: number; y: number; color: string; dir: 1 | -1; t: number }
  | { kind: 'shards'; x: number; y: number; color: string; t: number }
  | { kind: 'caption'; text: string; color: string; x: number; y: number; t: number; life: number }
  | { kind: 'chroma'; t: number };

interface DrawUi {
  p1IsYou: boolean;
  p2IsYou: boolean;
  mountAt: number;
  reduce: boolean;
}

// ---------------------------------------------------------------------------
// 온라인 mock 봇 — P2(핑크) 조종. 코어는 'down' 이벤트만 반응하므로 down만 합성.
//   ① 생존: 천장 가시 ↔ 상승 마그마 사이 안전대에서 플래피 호버.
//   ② 회피: 접근 중인 P1 탄(owner 1)과 y가 겹치면 반대편으로 목표 이동.
//   ③ 발사: 상대와 y 정렬 + 쿨다운 준비 시 발사.
// 반환: 이번 프레임에 합성한 이벤트 배열.
// ---------------------------------------------------------------------------
interface BotRefs {
  jumpAt: number;
  fireAt: number;
}
function computeBotEvents(
  s: Game7State,
  now: number,
  bot: BotRefs,
  onJump: () => void,
  onFire: () => void,
): GameInputEvent[] {
  const events: GameInputEvent[] = [];
  const t = now / 1000;
  const surf = magmaSurfaceY(s.elapsed);
  const safeTop = G7.SPIKE_H + G7.PH / 2 + 6; // 최소 p2Y (천장 회피)
  const safeBottom = surf - G7.PH / 2 - 8; // 최대 p2Y (마그마 회피)

  // 기본 목표: 상대 높이에 맞춰 정렬(안전대 내 클램프)
  let targetY = clamp(s.p1Y, safeTop + 8, safeBottom - 10);

  // 회피: 접근 중인 P1 탄과 y가 겹치면 안전대 반대편으로
  for (const b of s.bullets) {
    if (b.owner !== 1) continue;
    const dist = G7.P2_X - b.x;
    if (dist > 4 && dist < 280 && Math.abs(b.y - s.p2Y) < 42) {
      const mid = (safeTop + safeBottom) / 2;
      targetY = b.y > mid ? safeTop + 10 : safeBottom - 12;
    }
  }

  // 플래피 호버: 목표보다 아래(y 큼)이고 상승 중이 아니면 점프(쓰로틀)
  if (s.p2Y > targetY + 4 && s.p2Vy > -30 && now >= bot.jumpAt) {
    events.push({ code: 'KeyU', type: 'down', t });
    bot.jumpAt = now + 110 + Math.random() * 70;
    onJump();
  }

  // 발사: y 정렬 + 쿨다운 준비
  if (Math.abs(s.p1Y - s.p2Y) < 22 && s.p2Cd === 0 && now >= bot.fireAt) {
    events.push({ code: 'KeyI', type: 'down', t });
    bot.fireAt = now + 240 + Math.random() * 240;
    onFire();
  }
  return events;
}

// ---------------------------------------------------------------------------
// 캔버스 렌더러 (순수 그리기)
// ---------------------------------------------------------------------------
function drawScene(ctx: CanvasRenderingContext2D, s: Game7State, fx: readonly Fx[], now: number, ui: DrawUi): void {
  // 색은 플레이어 종속 — 로컬 COL이 아래 COL.p1/p2 사용부(총알·기체·FX)를 플레이어 색으로 덮는다.
  const COL = themedCols();
  const surf = magmaSurfaceY(s.elapsed);
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const step120 = Math.floor(now / 120); // 아케이드 스텝 위상

  // ---- 배경 필드 ----
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // 무발광 세로 그리드 + 중앙 분리선 (P1 | P2)
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,42,109,0.10)' : 'rgba(211,0,197,0.08)';
  ctx.lineWidth = 1;
  for (let gx = 100; gx < CW; gx += 100) {
    ctx.beginPath();
    ctx.moveTo(gx, G7.SPIKE_H + 6);
    ctx.lineTo(gx, surf - 4);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(211,0,197,0.14)';
  ctx.beginPath();
  ctx.moveTo(CW / 2, G7.SPIKE_H + 6);
  ctx.lineTo(CW / 2, surf - 4);
  ctx.stroke();
  ctx.restore();

  // 배경 워터마크 "VS" (퍼플, 무발광 아웃라인 — 발광요소 아님)
  ctx.save();
  ctx.font = `bold 150px ${ARCADE_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(211,0,197,0.05)';
  ctx.strokeText('VS', CW / 2, CH / 2 - 20);
  ctx.restore();

  // ---- 천장 가시(무발광 dim) ----
  ctx.save();
  ctx.fillStyle = COL.deep;
  ctx.fillRect(0, 0, CW, G7.SPIKE_H);
  ctx.fillStyle = 'rgba(255,56,100,0.35)';
  ctx.strokeStyle = 'rgba(255,56,100,0.6)';
  ctx.lineWidth = 1;
  const sw = 20;
  for (let x = 0; x < CW; x += sw) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + sw / 2, G7.SPIKE_H);
    ctx.lineTo(x + sw, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // ---- 마그마(상승 위협, 옐로/열 글로우 = 발광요소 1) ----
  ctx.save();
  const mg = ctx.createLinearGradient(0, surf - 4, 0, CH);
  mg.addColorStop(0, 'rgba(253,245,0,0.85)');
  mg.addColorStop(0.14, 'rgba(255,56,100,0.85)');
  mg.addColorStop(1, 'rgba(74,10,38,0.96)');
  ctx.fillStyle = mg;
  ctx.fillRect(0, surf, CW, CH - surf);
  // 표면 라인(스텝 웨이브 + 글로우)
  ctx.shadowColor = COL.accent;
  ctx.shadowBlur = urgent ? 22 : 15;
  ctx.strokeStyle = COL.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= CW; x += 16) {
    const wob = ui.reduce ? 0 : Math.sin(x * 0.05 + step120) * 3;
    const y = surf + wob;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // ---- 총알(트레일 + 코어 도트, owner 색 = P1/P2 글로우에 포함) ----
  for (const b of s.bullets) {
    const col = b.owner === 1 ? COL.p1 : COL.p2;
    const tx = b.x - b.vx * 0.1;
    ctx.save();
    const g = ctx.createLinearGradient(tx, b.y, b.x, b.y);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, col);
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, b.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(b.x, b.y, G7.BULLET_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- 플레이어 기체 ----
  const drawShip = (
    cx: number,
    cy: number,
    color: string,
    dim: string,
    dir: 1 | -1,
    vy: number,
    cdReady: boolean,
    isYou: boolean,
    label: string,
    hidden: boolean,
  ) => {
    if (hidden) return;
    const halfW = G7.PW / 2;
    const halfH = G7.PH / 2;
    const inDanger = cy + halfH > surf - 22 || cy - halfH < G7.SPIKE_H + 16;
    ctx.save();
    // 점프 분사 화염(플래피 상승 중)
    if (!ui.reduce && vy < -30) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      const fh = 6 + (step120 % 2) * 4;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy + halfH);
      ctx.lineTo(cx + 5, cy + halfH);
      ctx.lineTo(cx, cy + halfH + fh);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.translate(cx, cy);
    ctx.fillStyle = dim;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillRect(-halfW, -halfH, G7.PW, G7.PH);
    ctx.strokeRect(-halfW, -halfH, G7.PW, G7.PH);
    // 포신(상대 방향)
    const bx = dir > 0 ? halfW : -halfW - 8;
    ctx.fillRect(bx, -3, 8, 6);
    ctx.strokeRect(bx, -3, 8, 6);
    // 콕핏 도트
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(dir * 4, -2, 3, 0, Math.PI * 2);
    ctx.fill();
    // 장전 완료 표시(총구 광점)
    if (cdReady) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(dir > 0 ? halfW + 10 : -halfW - 10, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // 위험 경고 테(마그마/가시 근접 시 스텝 점멸)
    if (inDanger && (ui.reduce || step120 % 2 === 0)) {
      ctx.strokeStyle = COL.error;
      ctx.lineWidth = 2;
      ctx.shadowColor = COL.error;
      ctx.shadowBlur = 10;
      ctx.strokeRect(-halfW - 3, -halfH - 3, G7.PW + 6, G7.PH + 6);
      ctx.shadowBlur = 0;
    }
    // 라벨
    ctx.font = `10px ${ARCADE_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.shadowBlur = 0;
    ctx.fillText(label, 0, -halfH - 8);
    if (isYou && (ui.reduce || Math.floor(now / 500) % 2 === 0)) {
      ctx.fillStyle = COL.accent;
      ctx.fillText('YOU', 0, -halfH - 22);
    }
    ctx.restore();
  };

  const loserHidden = (owner: 1 | 2) => {
    // 피격/사망 연출 중엔 해당 기체를 파편으로 대체
    const chroma = fx.find((f) => f.kind === 'chroma');
    if (!chroma) return false;
    if (s.result === 'P1' && owner === 2) return now - chroma.t > 60;
    if (s.result === 'P2' && owner === 1) return now - chroma.t > 60;
    return false;
  };

  drawShip(G7.P1_X, s.p1Y, COL.p1, COL.p1dim, 1, s.p1Vy, s.p1Cd === 0, ui.p1IsYou, 'P1', loserHidden(1));
  drawShip(G7.P2_X, s.p2Y, COL.p2, COL.p2dim, -1, s.p2Vy, s.p2Cd === 0, ui.p2IsYou, 'P2', loserHidden(2));

  // ---- 이펙트(머즐/파편/캡션) ----
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'muzzle' && age < 90) {
      ctx.save();
      ctx.strokeStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      const mx = f.x;
      const my = f.y;
      ctx.beginPath();
      ctx.moveTo(mx - 8, my);
      ctx.lineTo(mx + 8, my);
      ctx.moveTo(mx, my - 8);
      ctx.lineTo(mx, my + 8);
      ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'shards' && age < 640) {
      ctx.save();
      ctx.fillStyle = f.color;
      ctx.globalAlpha = Math.max(0, 1 - age / 640);
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 8;
      for (let i = 0; i < 7; i++) {
        const ang = (Math.PI * 2 * i) / 7 + 0.4;
        const d = 8 + age * 0.14;
        ctx.fillRect(f.x + Math.cos(ang) * d - 3, f.y + Math.sin(ang) * d - 3, 6, 6);
      }
      ctx.restore();
    } else if (f.kind === 'caption' && age < f.life) {
      const on = ui.reduce || Math.floor(age / 110) % 2 === 0 || age > 240;
      if (on) {
        ctx.save();
        ctx.font = `16px ${ARCADE_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 12;
        ctx.fillText(f.text, clamp(f.x, 80, CW - 80), f.y);
        ctx.restore();
      }
    }
  }

  // ---- 승패 크로마틱 글리치(승패 순간에만) ----
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && !ui.reduce && now - chroma.t < 90) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(ctx.canvas, -5, 0, CW, CH);
    ctx.globalAlpha = 0.22;
    ctx.drawImage(ctx.canvas, 5, 0, CW, CH);
    ctx.restore();
  }

  // ---- 등장 sign-on 플리커(프레임 blank) ----
  if (!ui.reduce) {
    const age = now - ui.mountAt;
    if (age < 420 && signOffWindow(age / 420)) {
      ctx.fillStyle = COL.bg;
      ctx.fillRect(0, 0, CW, CH);
    }
  }
}

// ---------------------------------------------------------------------------
// 스냅샷 사이 외삽(보간) — 서버 스냅샷을 dt초만큼 각 오브젝트 '자기 물리'로 전진시킨 표시용 복사본.
//  · 탄: 수평 등속(x += vx·dt). 기체: 중력 적분(vy += G·dt, y += vy·dt) — 코어 step과 동일 공식.
//  · vx/vy가 스냅샷에 이미 있어 ID 매칭 불필요·추가지연 0. 점프/반전 순간만 미세오차이며
//    다음 스냅샷이 즉시 교정. 30/60Hz 스냅샷을 60fps로 부드럽게 잇는다(탄·기체 순간이동 제거).
//  · result 확정 시엔 호출하지 않는다(승패 위치는 서버값 그대로).
// ---------------------------------------------------------------------------
function extrapolate(s: Game7State, dt: number): Game7State {
  const p1Vy = Math.min(G7.MAX_FALL, s.p1Vy + G7.GRAVITY * dt);
  const p2Vy = Math.min(G7.MAX_FALL, s.p2Vy + G7.GRAVITY * dt);
  return {
    ...s,
    p1Vy,
    p1Y: s.p1Y + p1Vy * dt,
    p2Vy,
    p2Y: s.p2Y + p2Vy * dt,
    bullets: s.bullets.map((b) => ({ ...b, x: b.x + b.vx * dt })),
  };
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------
export default function Game7() {
  useDebugScreen('scr-game7');
  const flow = useFlow();
  const navigate = useNavigate();

  // ── 온라인 렌더 훅(성능 표준): 활성/역할만 선택 구독 → 값이 바뀌는 라운드 경계에서만 리렌더.
  //   스냅샷은 stateRef/snapAtRef로 미러(리렌더 유발 안 함), per-snapshot 작업은 onSnapshot에 위임.
  const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game7State>(7, (s) => {
    setDebugGame(s); // 디버그 브리지 — 스냅샷마다 갱신(기존 미러 effect 본문)
  });
  // 입력 핸들러(장수 리스너)가 항상 최신 '온라인 활성 여부'를 보게 하는 stale-closure 방지 ref
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  // 내 색(매치 고정, 역할과 독립). 키캡/YOU 표기는 이 색으로 — 값이 바뀔 때만 리렌더(스냅샷마다 X).
  const myColor = useSyncExternalStore(
    onlineStore.subscribe,
    () => onlineStore.get().myColor ?? 'blue',
    () => onlineStore.get().myColor ?? 'blue',
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const botRef = useRef<BotRefs>({ jumpAt: 0, fireAt: 0 });
  const fxRef = useRef<Fx[]>([]);
  const endRef = useRef<EndTracker>(createEndTracker());
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const mountAtRef = useRef(0);
  const reduceRef = useRef(false);
  /** 온라인 로컬 예측: 내 기체의 점프 입력 대기 플래그(KeyU down에서 set, 루프에서 소비) */
  const jumpPendingRef = useRef(false);
  /** 온라인 로컬 예측된 내 기체 y (null=아직 스냅샷 전/스냅 필요) */
  const predYRef = useRef<number | null>(null);
  /** 온라인 로컬 예측된 내 기체 vy(중력 적분 상태) */
  const predVyRef = useRef(0);
  /** 예측 적분용 직전 렌더 프레임 시각(performance.now) */
  const lastFrameRef = useRef(0);

  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();
  const lampRef = useRef({ flashU, flashI });
  lampRef.current = { flashU, flashI };

  // direct-URL 복구 + 디버그 브리지 정리
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 7) startOfflineGame(7);
    reduceRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => setDebugGame(null);
  }, []);

  // 캔버스 해상도 초기화(DPR 스케일)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // 키보드 — 로컬 어댑터. GameInputEvent 큐 적재 + 램프 점등.
  // (P1 Q/W, P2 U/I. online이면 P2 키는 봇이 대행하므로 흡수하지 않음)
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // 진짜 서버 온라인: 로컬 큐/봇 안 씀 → 서버로만 전송. 내 역할은 서버가 role로 재기입하므로
        // 4키(Q/W/U/I) 아무거나 눌러도 내 슬롯으로 간다(A=주키 Q·U / B=보조키 W·I).
        if (isOnlineRef.current) {
          // 온라인은 U/I 두 키만(요구사항). U=주키(slotA=점프), I=보조키(slotB=발사). Q/W는 무시.
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          if (e.code === 'KeyU') {
            // U=내 기체 점프. down 엣지를 로컬 예측(즉시 상승)에도 반영 — 어느 역할이든 U=내 점프.
            if (e.type === 'down') {
              jumpPendingRef.current = true;
              flashU();
            }
          } else if (e.type === 'down') {
            flashI();
          }
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          return;
        }
        // ── 오프라인 경로(그대로) — f.mode==='online'은 로컬 봇 대전(P2 키 흡수) ──
        const f = getFlow();
        const online = f.mode === 'online';
        if (e.code === 'KeyQ') {
          if (e.type === 'down') flashQ();
        } else if (e.code === 'KeyW') {
          if (e.type === 'down') flashW();
        } else if (e.code === 'KeyU') {
          if (online) return;
          if (e.type === 'down') flashU();
        } else if (e.code === 'KeyI') {
          if (online) return;
          if (e.type === 'down') flashI();
        }
        if (f.phase === 'playing') actionsRef.current.push(e);
      },
    );
    return detach;
  }, [flashQ, flashW, flashU, flashI]);

  // 라운드 수명주기: state 생성 → rAF 루프(step+draw) → 결과 보고.
  // 탭 백그라운드로 rAF가 멈춰도 워치독 interval이 타이머(10초→DRAW)를 진행시킨다.
  useEffect(() => {
    if (isOnline) {
      // 온라인: 서버 권위 상태만 그린다(step·봇·판정보고 없음).
      // 첫 스냅샷 전(state=null)에는 초기 create 상태를 그려 빈 캔버스를 피한다.
      if (!stateRef.current) stateRef.current = game7.create(Math.random);
      mountAtRef.current = performance.now();
      predYRef.current = null; // 입장/재진입 경계 — 다음 스냅샷에서 내 기체 예측을 다시 스냅
      jumpPendingRef.current = false;
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const ctx = canvasRef.current?.getContext('2d');
        const s = stateRef.current;
        if (!ctx || !s) return;
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1200);
        const players = getPlayerDisplays(getFlow());

        // (남의 것) 스냅샷 사이 외삽: 마지막 스냅샷을 경과 dt만큼 각 오브젝트 물리로 전진(최대 50ms 캡).
        //  탄=수평 등속(vx), 기체=중력 적분. 종료(result) 시엔 외삽하지 않는다(서버 위치 그대로).
        const extraDt = Math.min(0.05, Math.max(0, (now - snapAtRef.current) / 1000));
        let view = extraDt > 0 && s.result === null ? extrapolate(s, extraDt) : s;

        // (내 캐릭터) 내 기체는 live 입력으로 로컬 예측 → 점프 즉각 반응·롤백 제거.
        //  화해: 매 프레임 서버값으로 약하게 수렴 + 큰 어긋남(라운드리셋/사망)만 스냅.
        if (myRole && s.result === null) {
          const frameDt = lastFrameRef.current ? Math.min(0.05, (now - lastFrameRef.current) / 1000) : 0;
          const myY = myRole === 'P1' ? s.p1Y : s.p2Y;
          const myVy = myRole === 'P1' ? s.p1Vy : s.p2Vy;
          let py = predYRef.current;
          let pvy = predVyRef.current;
          if (py === null || Math.abs(myY - py) > 80) {
            py = myY; // 초기/라운드리셋/큰 desync 스냅
            pvy = myVy;
          }
          if (jumpPendingRef.current) {
            pvy = -G7.JUMP_V; // 점프 즉시 반영(코어와 동일한 임펄스)
            jumpPendingRef.current = false;
          }
          pvy = Math.min(G7.MAX_FALL, pvy + G7.GRAVITY * frameDt); // 중력 적분(서버와 동일 공식)
          py = py + pvy * frameDt;
          py += (myY - py) * 0.08; // 서버로 약하게 수렴(지연·적분 드리프트 보정)
          predYRef.current = py;
          predVyRef.current = pvy;
          view = myRole === 'P1' ? { ...view, p1Y: py, p1Vy: pvy } : { ...view, p2Y: py, p2Vy: pvy };
        }
        lastFrameRef.current = now;

        drawScene(ctx, view, fxRef.current, now, {
          p1IsYou: players.P1.isYou,
          p2IsYou: players.P2.isYou,
          mountAt: mountAtRef.current,
          reduce: reduceRef.current,
        });
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    if (flow.gameId !== 7 || flow.phase !== 'playing') return;

    const st = game7.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    botRef.current = { jumpAt: 0, fireAt: 0 };
    fxRef.current = [];
    reportedRef.current = false;
    resultAtRef.current = 0;
    mountAtRef.current = performance.now();
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      // 라운드 인트로 중엔 시뮬 정지(코어 step 스킵) + last 갱신으로 재개 시 dt 점프 방지
      if (isRoundIntroActive()) {
        last = now;
        return;
      }
      const dt = Math.min(0.1, (now - last) / 1000); // 초 단위, 100ms 클램프(중력 폭주 방지)
      if (dt <= 0) return;
      last = now;
      let s = stateRef.current;
      if (!s) return;
      // FX(머즐/파편/캡션) 색도 플레이어 종속 팔레트로 — 오프라인은 기본 role 색과 동일.
      const COL = themedCols();

      if (s.result === null) {
        const events = actionsRef.current;
        actionsRef.current = [];
        if (getFlow().mode === 'online') {
          const botEvents = computeBotEvents(
            s,
            now,
            botRef.current,
            () => lampRef.current.flashU(),
            () => lampRef.current.flashI(),
          );
          for (const e of botEvents) events.push(e);
        }

        // step은 원본을 in-place mutate 후 동일 참조 반환 → 이전값은 호출 전 스냅샷
        const prevP1Cd = s.p1Cd;
        const prevP2Cd = s.p2Cd;
        const prevP1Y = s.p1Y;
        const prevP2Y = s.p2Y;
        s = game7.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);
        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);

        // 발사 순간(쿨다운 0→FIRE_COOLDOWN 상승) → 머즐 스파크
        if (s.p1Cd > prevP1Cd) {
          fxRef.current.push({ kind: 'muzzle', x: G7.P1_X + G7.PW / 2 + 8, y: prevP1Y, color: COL.p1, dir: 1, t: now });
        }
        if (s.p2Cd > prevP2Cd) {
          fxRef.current.push({ kind: 'muzzle', x: G7.P2_X - G7.PW / 2 - 8, y: prevP2Y, color: COL.p2, dir: -1, t: now });
        }

        // 판정 순간 이펙트(글리치는 승패 순간에만)
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          fxRef.current.push({ kind: 'chroma', t: now });
          if (s.result === 'P1') {
            fxRef.current.push(
              { kind: 'shards', x: G7.P2_X, y: s.p2Y, color: COL.p2, t: now },
              { kind: 'caption', text: 'K.O!', color: COL.p1, x: G7.P2_X, y: s.p2Y - 26, t: now, life: RESULT_FX_MS },
            );
          } else if (s.result === 'P2') {
            fxRef.current.push(
              { kind: 'shards', x: G7.P1_X, y: s.p1Y, color: COL.p1, t: now },
              { kind: 'caption', text: 'K.O!', color: COL.p2, x: G7.P1_X, y: s.p1Y - 26, t: now, life: RESULT_FX_MS },
            );
          } else {
            fxRef.current.push({
              kind: 'caption',
              text: 'TIME UP',
              color: COL.accent2,
              x: CW / 2,
              y: CH / 2 - 40,
              t: now,
              life: RESULT_FX_MS,
            });
          }
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // 온라인은 서버가 round:end를 구동 → 화면은 결과 보고에 관여하지 않는다.
        if (isOnline) return;
        // 피격/사망 연출을 짧게 보여준 뒤 1회 보고 → ResultOverlay(phase 전환 → 이 effect cleanup)
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1200);
        const players = getPlayerDisplays(getFlow());
        drawScene(ctx, s, fxRef.current, now, {
          p1IsYou: players.P1.isYou,
          p2IsYou: players.P2.isYou,
          mountAt: mountAtRef.current,
          reduce: reduceRef.current,
        });
        endRef.current.update(s.result, now);
        drawEndFlash(ctx, CW, CH, endRef.current.age(now));
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      frame(now);
    };
    raf = requestAnimationFrame(loop);
    // rAF가 스로틀되면(백그라운드 탭) interval이 타이머를 진행시킨다 — rAF 생존 시 개입 안 함
    const watchdog = setInterval(() => {
      const now = performance.now();
      if (now - last > 280) frame(now);
    }, 250);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(watchdog);
    };
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
        <span className="g7-title font-arcade c-muted">게임7 · 이카루스 매치</span>
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
        <canvas ref={canvasRef} className="g7-canvas" aria-label="게임7 스테이지 — 이카루스 매치" />

        {/* 위험 안내 배지 — 마그마 상승/천장 가시 (좌상단, 무발광 캡션) */}
        <div className="g7-hazard" aria-hidden>
          <span className="g7-hazard__row g7-hazard__row--spike font-arcade">▲ SPIKES</span>
          <span className="g7-hazard__row g7-hazard__row--magma font-arcade">MAGMA ▲</span>
        </div>
      </div>

      {/* 온스크린 키캡 — 실제 배정 키(SPEC Q2), 입력 순간 램프 점등 */}
      {isOnline ? (
        // 온라인: 로컬 플레이어 컨트롤만(U=점프 / I=발사), 내 색으로 표기
        <div className="g7-keys g7-keys--online">
          <div className="g7-keys__group">
            <span className={`g7-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myColor === 'blue' ? '파랑' : '빨강'} · HOVER · FIRE
            </span>
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="U" icon="▲" lit={uLit} label="점프" />
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="I" icon="◉" lit={iLit} label="발사" />
          </div>
        </div>
      ) : (
        <div className="g7-keys">
          <div className="g7-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="▲" lit={qLit} label="점프" />
            <KeyCap role="P1" keyChar="W" icon="◉" lit={wLit} label="발사" />
            <span className="g7-keys__tag font-arcade c-p1">P1 · CYAN</span>
          </div>
          <div className="g7-keys__group">
            <span className="g7-keys__tag font-arcade c-p2">P2 · PINK</span>
            <KeyCap role="P2" keyChar="U" icon="▲" lit={uLit} label="점프" />
            <KeyCap role="P2" keyChar="I" icon="◉" lit={iLit} label="발사" />
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}