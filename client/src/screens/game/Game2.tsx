/**
 * S10·S11 게임2 — 로켓 피하기 (neon-coinop 화면 유지 · 로직만 새 코어로 교체).
 * 컨테이너 testid: scr-game2 / 부품: game-stage, hud-*(HudFrame 내장), btn-exit
 *
 * ── 이번 교체의 원칙 ─────────────────────────────────────────────
 *  · UI·컴포넌트·CSS 클래스·캔버스 연출은 100% 그대로.
 *  · 게임 상태/판정만 @madpump/shared game2 코어(create/step)로 구동.
 *  · 새 메커니즘 HP(3) → 기존 화면에 없던 요소이므로 neon HP 셀 3개를 추가(--p2 색).
 *
 * 배선:
 *   mount → idle이면 startOfflineGame(2) (direct-URL 복구)
 *   라운드마다 game2.create(Math.random)
 *   rAF 루프 → game2.step(state, events, dtSec) → setDebugGame(state) 매 틱
 *   입력은 attachLocalKeyboard(GameInputEvent 큐) → step에 그대로 전달(엣지/홀드는 코어가 처리)
 *   result('P1'|'P2') 확정 → (RESULT_FX_MS 연출 후) reportRoundEnd(매핑) 1회 → <ResultOverlay />
 *   online 모드 → P2(회피자)는 봇 휴리스틱(KeyU/KeyI down/up 이벤트 합성), 사람은 P1(q/w)
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { game2, G2, GAME_DURATION } from '@madpump/shared';
import type { Game2State, GameInputEvent, Role } from '@madpump/shared';
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
import { onlineStore, sendInput as onlineSendInput } from '../../net/online';
import ResultOverlay from './ResultOverlay';
import './game2.css';

// ---------------------------------------------------------------------------
// 캔버스 상수 (논리 해상도 — CSS로 반응형 스케일). 필드 논리크기는 코어 G2.W/H(800×450).
// 캔버스는 그 1.2배(960×540)로 16:9 유지 — X/Y 스케일 균일.
// ---------------------------------------------------------------------------

const CW = 960;
const CH = 540;

const COL = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  p1: '#05d9e8',
  p1dim: '#0a3a4a',
  p2: '#ff2a6d',
  p2dim: '#4a0a26',
  accent: '#fdf500',
  accent2: '#d300c5',
  muted: '#9d8fbf',
} as const;

const ARCADE_FONT = '"Press Start 2P", monospace';

/** 발사대 몸통 반폭(렌더 전용 — 코어엔 발사대 히트박스가 없음) */
const LAUNCHER_HALF = 24;

/** 판정 → 결과 오버레이 전환 사이 인게임 연출 시간 (피격 파편/생존 러쉬) */
const RESULT_FX_MS = 650;

/** 코어 result('P1'|'P2'|'DRAW') → 셸 MatchResult 매핑 */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): MatchResult {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

// ---------------------------------------------------------------------------
// 이펙트 (렌더 전용 — 로직 비침범)
// ---------------------------------------------------------------------------

type Fx =
  | { kind: 'muzzle'; x: number; y: number; t: number }
  | { kind: 'reload'; t: number }
  | { kind: 'shards'; x: number; y: number; t: number }
  | { kind: 'caption'; text: string; color: string; x: number; y: number; t: number; life: number }
  | { kind: 'chroma'; t: number }
  | { kind: 'rush'; t: number };

interface Trail {
  x: number;
  t: number;
}

// ---------------------------------------------------------------------------
// 온라인 mock 봇 — P2(회피자) 휴리스틱. 판정 로직은 여전히 코어(game2.step).
// 반환: 이동 방향 (-1 왼쪽 / 0 정지 / 1 오른쪽)
// ---------------------------------------------------------------------------

function computeBotDir(s: Game2State): -1 | 0 | 1 {
  const x = s.p2X;
  const danger = G2.P2_W / 2 + G2.ROCKET_W / 2;
  let threatX: number | null = null;
  let bestEta = Infinity;
  for (const r of s.rockets) {
    if (r.vy <= 0) continue;
    if (r.y > G2.P2_Y) continue;
    const eta = (G2.P2_Y - r.y) / r.vy; // sec
    if (eta > 0.55) continue; // 아직 여유 — 반응 지연으로 봇 난이도 완화
    const bx = r.x + r.vx * eta; // 도달 예상 x
    if (Math.abs(bx - x) < danger * 2.2 && eta < bestEta) {
      bestEta = eta;
      threatX = bx;
    }
  }
  if (threatX !== null) {
    let dir: 1 | -1 = x <= threatX ? -1 : 1; // 총알 반대쪽으로
    const margin = G2.MARGIN + G2.P2_W / 2;
    const reach = s.p2Speed * Math.min(bestEta, 0.4);
    // 벽에 몰리면 반대쪽으로 가로지른다
    if (dir === -1 && x - reach < margin) dir = 1;
    if (dir === 1 && x + reach > G2.W - margin) dir = -1;
    return dir;
  }
  // 위협 없음 — 중앙 복귀 (데드존 ±12)
  const center = G2.W / 2;
  if (x < center - 12) return 1;
  if (x > center + 12) return -1;
  return 0;
}

// ---------------------------------------------------------------------------
// 로켓 스프라이트 (한 번만 구움) — 매 프레임 shadowBlur+gradient 대신 blit.
//  · head: 코어+글로우를 radial gradient로 구운 고정 스프라이트(shadowBlur 대체).
//  · tracer: 세로 그라디언트 스트립(머리 밝음→꼬리 투명). 로켓마다 속도방향으로
//    회전 + 꼬리길이만큼 stretch해서 그린다(속도비례 잔광 유지).
// 로켓 N개여도 gradient 할당/ shadowBlur = 0 → 발사체 많아도 프레임 비용 일정.
// ---------------------------------------------------------------------------

let rocketSprites: { head: HTMLCanvasElement; tracer: HTMLCanvasElement } | null = null;
function getRocketSprites(): { head: HTMLCanvasElement; tracer: HTMLCanvasElement } {
  if (rocketSprites) return rocketSprites;
  const HR = 18; // head 스프라이트 반경(코어+글로우 여유)
  const head = document.createElement('canvas');
  head.width = HR * 2;
  head.height = HR * 2;
  const TW = 6;
  const TH = 64;
  const tracer = document.createElement('canvas');
  tracer.width = TW;
  tracer.height = TH;
  const hc = head.getContext('2d');
  const tc = tracer.getContext('2d');
  if (hc && tc) {
    // head: 중심 밝은 코어 → 바깥 글로우 페이드 (shadowBlur=12 룩을 구움)
    const hg = hc.createRadialGradient(HR, HR, 0, HR, HR, HR);
    hg.addColorStop(0, 'rgba(253,245,0,1)');
    hg.addColorStop(0.22, 'rgba(253,245,0,0.95)');
    hg.addColorStop(0.5, 'rgba(253,245,0,0.35)');
    hg.addColorStop(1, 'rgba(253,245,0,0)');
    hc.fillStyle = hg;
    hc.beginPath();
    hc.arc(HR, HR, HR, 0, Math.PI * 2);
    hc.fill();
    // tracer: y=0(머리, 밝음) → y=TH(꼬리, 투명). 폭 3 중앙.
    const tg = tc.createLinearGradient(0, 0, 0, TH);
    tg.addColorStop(0, 'rgba(253,245,0,0.75)');
    tg.addColorStop(1, 'rgba(253,245,0,0)');
    tc.fillStyle = tg;
    tc.fillRect(TW / 2 - 1.5, 0, 3, TH);
  }
  rocketSprites = { head, tracer };
  return rocketSprites;
}

// ---------------------------------------------------------------------------
// 캔버스 렌더러 (순수 그리기 — state는 읽기만)
// ---------------------------------------------------------------------------

function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game2State,
  fx: readonly Fx[],
  trail: readonly Trail[],
  now: number,
  p1IsYou: boolean,
): void {
  const X = (u: number) => (u / G2.W) * CW;
  const Y = (u: number) => (u / G2.H) * CH;
  const railP1 = Y(G2.LAUNCHER_Y);
  const railP2 = Y(G2.P2_Y);
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;
  const hit = s.result === 'P1'; // 발사자 승 = P2 피격사
  const resultFx = fx.find((f) => f.kind === 'chroma' || f.kind === 'rush');
  const resultAge = resultFx ? now - resultFx.t : Infinity;

  // --- 필드 (딥퍼플 낙하 공간) ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // 옅은 세로 그리드 — 임박 시 핑크 톤 + 상승 스캔
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,42,109,0.14)' : 'rgba(211,0,197,0.09)';
  ctx.lineWidth = 1;
  for (let gx = 48; gx < CW; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, railP1 + 14);
    ctx.lineTo(gx, railP2 - 8);
    ctx.stroke();
  }
  if (urgent) {
    const off = 36 - ((now / 9) % 36); // 위로 흐르는 가로줄
    ctx.strokeStyle = 'rgba(255,42,109,0.10)';
    for (let gy = railP1 + 20 + off; gy < railP2 - 8; gy += 36) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(CW, gy);
      ctx.stroke();
    }
  }
  ctx.restore();

  // --- P1 레일 (시안) ---
  ctx.save();
  ctx.strokeStyle = COL.p1;
  ctx.globalAlpha = 0.75;
  ctx.shadowColor = COL.p1;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, railP1);
  ctx.lineTo(CW, railP1);
  ctx.stroke();
  ctx.restore();

  // --- P2 레일 (핑크 = 피격 라인) — 생존 승리 시 러쉬 점등 ---
  const rush = fx.find((f) => f.kind === 'rush');
  ctx.save();
  ctx.strokeStyle = COL.p2;
  ctx.shadowColor = COL.p2;
  if (rush) {
    const a = Math.min(1, (now - rush.t) / 250);
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 22;
    ctx.lineWidth = 4;
    const grad = ctx.createLinearGradient(0, railP2 - 46, 0, railP2);
    grad.addColorStop(0, 'rgba(255,42,109,0)');
    grad.addColorStop(1, `rgba(255,42,109,${0.28 * a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, railP2 - 46, CW, 46);
  } else {
    ctx.globalAlpha = 0.85;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
  }
  ctx.beginPath();
  ctx.moveTo(0, railP2);
  ctx.lineTo(CW, railP2);
  ctx.stroke();
  ctx.restore();

  // --- 로켓: 옐로 네온 트레이서 (스프라이트 blit — shadowBlur/gradient 할당 없음) ---
  const { head: headSprite, tracer: tracerSprite } = getRocketSprites();
  const uToCanvas = CW / G2.W; // 논리→캔버스 스케일(꼬리 길이 환산)
  for (const r of s.rockets) {
    const bx = X(r.x);
    const by = Y(r.y);
    if (by < railP1 - 20) continue;
    const speed = Math.hypot(r.vx, r.vy);
    // 꼬리 = 0.28초 이동거리(캔버스px). 로컬 +Y(머리→꼬리)를 -속도 방향에 맞춤: θ=atan2(vx,-vy)
    const tailLen = Math.max(6, speed * 0.28 * uToCanvas);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(Math.atan2(r.vx, -r.vy));
    ctx.drawImage(tracerSprite, -tracerSprite.width / 2, 0, tracerSprite.width, tailLen);
    ctx.restore();
    // 머리 글로우(고정 크기, 회전 무관) — shadowBlur 대체 스프라이트
    ctx.drawImage(headSprite, bx - headSprite.width / 2, by - headSprite.height / 2);
  }

  // --- P1 발사대 (시안, 자동 왕복 + 방향 즉독) ---
  const ax = X(s.launcherX);
  const muzzle = fx.find((f) => f.kind === 'muzzle');
  const recoil = muzzle && now - muzzle.t < 90 ? -3 : 0; // 발사 1프레임 반동
  const tw = X(LAUNCHER_HALF);
  ctx.save();
  ctx.translate(ax, railP1 + recoil);
  ctx.strokeStyle = COL.p1;
  ctx.fillStyle = COL.p1dim;
  ctx.shadowColor = COL.p1;
  ctx.shadowBlur = 9;
  ctx.lineWidth = 2;
  ctx.fillRect(-tw, -8, tw * 2, 14);
  ctx.strokeRect(-tw, -8, tw * 2, 14);
  ctx.fillRect(-4, 6, 8, 9); // 총구 (아래로)
  ctx.strokeRect(-4, 6, 8, 9);
  // 이동 방향 셰브런
  ctx.shadowBlur = 0;
  ctx.fillStyle = COL.p1;
  ctx.font = `9px ${ARCADE_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(s.launcherDir === 1 ? '▶' : '◀', s.launcherDir === 1 ? tw + 14 : -tw - 14, 2);
  // P1 배지 (+ 온라인이면 YOU 점멸)
  ctx.font = `10px ${ARCADE_FONT}`;
  ctx.fillText('P1', 0, -18);
  if (p1IsYou && Math.floor(now / 500) % 2 === 0) {
    ctx.fillStyle = COL.accent;
    ctx.fillText('YOU', 0, -32);
  }
  ctx.restore();

  // --- 탄약 램프 3개 (쿨다운 → 장전 표시) ---
  const readyRatio = 1 - Math.min(1, Math.max(0, s.cooldown / G2.FIRE_COOLDOWN));
  const reload = fx.find((f) => f.kind === 'reload');
  const flicker = reload && now - reload.t < 160 && Math.floor(now / 40) % 2 === 0;
  const lit = flicker ? 0 : Math.floor(readyRatio * 3 + 1e-6);
  const lampBaseX = ax + tw + 16 + 2 * 13 > CW - 8 ? ax - tw - 16 - 2 * 13 : ax + tw + 16;
  for (let i = 0; i < 3; i++) {
    const lx = lampBaseX + i * 13;
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, railP1 - 14, 4, 0, Math.PI * 2);
    if (i < lit) {
      ctx.fillStyle = COL.p1;
      ctx.shadowColor = COL.p1;
      ctx.shadowBlur = 7;
      ctx.fill();
    } else {
      ctx.fillStyle = COL.deep;
      ctx.fill();
      ctx.strokeStyle = 'rgba(211,0,197,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- P2 러너 (핑크) + 이동 잔상. 무적(iframes) 중엔 점멸. 피격사 직후엔 파편으로 대체 ---
  const dx = X(s.p2X);
  const rw = X(G2.P2_W / 2);
  const invulnBlink = s.iframes > 0 && Math.floor(now / 60) % 2 === 0;
  if (!(hit && resultAge < RESULT_FX_MS + 400)) {
    ctx.save();
    for (const tr of trail) {
      const age = now - tr.t;
      if (age > 240) continue;
      ctx.globalAlpha = age < 120 ? 0.22 : 0.1; // 투명도 계단 잔상
      ctx.fillStyle = COL.p2;
      ctx.fillRect(X(tr.x) - rw, railP2 - 7, rw * 2, 12);
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = invulnBlink ? 0.35 : 1;
    ctx.translate(dx, railP2);
    ctx.strokeStyle = COL.p2;
    ctx.fillStyle = COL.p2dim;
    ctx.shadowColor = COL.p2;
    ctx.shadowBlur = 9;
    ctx.lineWidth = 2;
    ctx.fillRect(-rw, -7, rw * 2, 12);
    ctx.strokeRect(-rw, -7, rw * 2, 12);
    ctx.shadowBlur = 0;
    ctx.fillStyle = COL.p2;
    ctx.beginPath();
    ctx.arc(0, -1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `10px ${ARCADE_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('P2', 0, 24);
    ctx.restore();
  }

  // --- 이펙트: 머즐 스파크 / 파편 / 캡션 ---
  for (const f of fx) {
    const age = now - f.t;
    if (f.kind === 'muzzle' && age < 90) {
      // 시안 머즐 스파크 (십자 광점)
      ctx.save();
      ctx.strokeStyle = COL.p1;
      ctx.shadowColor = COL.p1;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      const mx = X(f.x);
      const my = Y(f.y) + 18;
      ctx.beginPath();
      ctx.moveTo(mx - 8, my);
      ctx.lineTo(mx + 8, my);
      ctx.moveTo(mx, my - 8);
      ctx.lineTo(mx, my + 8);
      ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'shards' && age < 620) {
      // 픽셀 파편 6개 방사 (피격)
      ctx.save();
      ctx.fillStyle = COL.p2;
      ctx.globalAlpha = Math.max(0, 1 - age / 620);
      const cx = X(f.x);
      const cy = Y(f.y);
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI * 2 * i) / 6 + 0.5;
        const dist = 8 + age * 0.11;
        ctx.fillRect(cx + Math.cos(ang) * dist - 3, cy + Math.sin(ang) * dist - 3, 6, 6);
      }
      ctx.restore();
    } else if (f.kind === 'caption' && age < f.life) {
      const blinkOn = Math.floor(age / 120) % 2 === 0 || age > 240; // steps 점멸 후 유지
      if (blinkOn) {
        ctx.save();
        ctx.font = `13px ${ARCADE_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 10;
        ctx.fillText(f.text, Math.min(CW - 70, Math.max(70, X(f.x))), Y(f.y));
        ctx.restore();
      }
    }
  }

  // --- 피격 순간 크로마틱 어버레이션 (승패 순간에만) ---
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && now - chroma.t < 90) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(ctx.canvas, -4, 0, CW, CH); // 시안/핑크 오프셋 잔상 (자기 복제)
    ctx.globalAlpha = 0.22;
    ctx.drawImage(ctx.canvas, 4, 0, CW, CH);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// JIT/페인트 프리워밍 — 라운드 시작 전에 step·drawScene를 최적화 티어까지 올린다.
// (초반 콜드스타트 렉 완화. V8은 강제 컴파일 API가 없어 '미리 여러 번 실행'이 유일한 방법.)
//
// shape 일치가 생명 — 워밍과 실제 플레이의 객체 구조가 다르면 deopt로 워밍이 무효가 된다.
// 그래서 손으로 상태를 짓지 않고 '진짜' 경로만 쓴다: game2.create로 state 생성,
// game2.step에 실제 KeyW 이벤트를 먹여 로켓을 진짜 스폰(vx/vy가 Double로 실전과 동일),
// drawScene도 실제 시그니처로 호출. 오프스크린 캔버스라 화면 깜빡임 없음.
// 청크(프레임당 소량)로 나눠 워밍 자체가 spike가 되지 않게 한다.
// 반환값 = 취소 함수(언마운트 시 rAF 정리).
// ---------------------------------------------------------------------------

function prewarmGame2(): () => void {
  const scratch = document.createElement('canvas');
  scratch.width = CW;
  scratch.height = CH;
  const sctx = scratch.getContext('2d');
  if (!sctx) return () => {};

  let s = game2.create(Math.random);
  const fire: GameInputEvent[] = [{ code: 'KeyW', type: 'down', t: 0 }];
  const noEvents: GameInputEvent[] = [];
  const TOTAL = 300; // step·drawScene 300회면 최적화 티어 진입에 충분
  const PER_FRAME = 6; // 청크: 프레임당 6회(≈50프레임/0.8s, 카운트다운 3s 안에 넉넉)

  let i = 0;
  let raf = 0;
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    for (let k = 0; k < PER_FRAME && i < TOTAL; k++, i += 1) {
      // 주기적 KeyW → step이 로켓을 실제 방식으로 스폰(쿨다운은 코어가 처리)
      s = game2.step(s, i % 8 === 0 ? fire : noEvents, 1 / 60);
      if (s.result) s = game2.create(Math.random); // 라운드 끝나면 리셋
      drawScene(sctx, s, [], [], i * 16, true);
    }
    if (i < TOTAL) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (raf) cancelAnimationFrame(raf);
  };
}

// ---------------------------------------------------------------------------
// 스냅샷 사이 보간(외삽) — 서버 스냅샷을 dt초만큼 각 오브젝트 '자기 속도'로 전진시킨
// 표시용 상태를 만든다. 스냅샷에 vx/vy·p2Speed·launcherDir이 이미 있어 ID 매칭이 불필요하고
// 추가 지연도 0. 방향전환(바운스/반전) 순간만 미세 오차이며 다음 스냅샷이 즉시 교정한다.
// 30/60Hz 스냅샷을 60fps 렌더로 부드럽게 잇는 게 목적(로켓 순간이동 제거).
// ---------------------------------------------------------------------------

const clampField = (v: number): number => Math.min(G2.W - G2.MARGIN, Math.max(G2.MARGIN, v));

function extrapolate(s: Game2State, dt: number): Game2State {
  const p2dir = (s.rightHeld ? 1 : 0) - (s.leftHeld ? 1 : 0);
  return {
    ...s,
    p2X: clampField(s.p2X + p2dir * s.p2Speed * dt),
    launcherX: clampField(s.launcherX + s.launcherDir * G2.SCAN_SPEED * dt),
    rockets: s.rockets.map((r) => ({ ...r, x: r.x + r.vx * dt, y: r.y + r.vy * dt })),
  };
}

// ---------------------------------------------------------------------------
// 성능 계측 오버레이 (튜닝용) — 캔버스에 직접 그림(React 리렌더 없음).
//  · ` (백틱) 키로 토글, ?fps 쿼리로도 켜짐, localStorage에 상태 유지.
//  · FPS = 최근 0.5s 평균, max = 최근 1s 내 최악 프레임시간(spike 탐지), rockets = 현재 탄 수.
//  · 판독법: 초반 max가 한 번만 크게 튀면 마운트/콜드 spike, FPS가 계속 ~30이면 보간 문제,
//    로켓 수 늘수록 max 상승이면 렌더(shadowBlur/gradient) 비용.
// ---------------------------------------------------------------------------

const perf = {
  show: (() => {
    try {
      return localStorage.getItem('mp_fps') === '1' || /[?&]fps\b/.test(location.search);
    } catch {
      return false;
    }
  })(),
  last: 0,
  maxMs: 0,
  maxAt: 0,
  frames: 0,
  accum: 0,
  fps: 0,
};

function drawPerfHud(ctx: CanvasRenderingContext2D, now: number, rocketCount: number): void {
  if (perf.last) {
    const ms = now - perf.last;
    perf.frames += 1;
    perf.accum += ms;
    if (ms > perf.maxMs || now - perf.maxAt > 1000) {
      perf.maxMs = ms;
      perf.maxAt = now;
    } // 1초 롤링 최대(오래된 피크는 교체)
    if (perf.accum >= 500) {
      perf.fps = Math.round((perf.frames / perf.accum) * 1000);
      perf.frames = 0;
      perf.accum = 0;
    }
  }
  perf.last = now;
  if (!perf.show) return;
  ctx.save();
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(6, 6, 210, 20);
  ctx.fillStyle = perf.maxMs > 32 ? '#ff5b5b' : perf.maxMs > 20 ? '#ffd24a' : '#7cfc00';
  ctx.fillText(`FPS ${perf.fps}  max ${perf.maxMs.toFixed(1)}ms  rockets ${rocketCount}`, 12, 20);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

export default function Game2() {
  useDebugScreen('scr-game2');
  const flow = useFlow();
  const navigate = useNavigate();

  // 온라인 활성/역할만 '선택 구독' — 스냅샷(60Hz)마다가 아니라 이 값이 바뀌는
  // 라운드 경계에서만 리렌더. (기존 useOnlineGame은 스토어 전체 구독이라 60Hz 리렌더 유발했음)
  //  · sig = 원시 문자열 → useSyncExternalStore가 값(Object.is)으로 비교 → 안 바뀌면 리렌더 안 함
  const readOnlineSig = () => {
    const o = onlineStore.get();
    const active =
      o.gameId === 2 &&
      o.role != null &&
      (o.phase === 'countdown' || o.phase === 'playing' || o.phase === 'round-result');
    return active ? `1:${o.role}` : '0';
  };
  const onlineSig = useSyncExternalStore(onlineStore.subscribe, readOnlineSig, readOnlineSig);
  const isOnline = onlineSig !== '0';
  const myRole: Role | null = isOnline ? (onlineSig.slice(2) as Role) : null;
  // 키보드 핸들러(안정 클로저)가 최신 '온라인 활성 여부'를 보게 하는 ref.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<Game2State | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const botHeldRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const fxRef = useRef<Fx[]>([]);
  const trailRef = useRef<Trail[]>([]);
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const lastCloseRef = useRef(0);
  /** 마지막 서버 스냅샷 수신 시각(performance.now) — 렌더 외삽 dt 계산용 */
  const snapAtRef = useRef(0);
  /** 온라인 로컬 예측용: 내 닷지 키 홀드(U=왼쪽/I=오른쪽) */
  const localHeldRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  /** 온라인 로컬 예측된 내 패들 x (null=아직 스냅샷 전) */
  const predP2XRef = useRef<number | null>(null);
  /** 예측 적분용 직전 렌더 프레임 시각(performance.now) */
  const lastFrameRef = useRef(0);

  /** HUD 표시용 남은 시간 (초 단위 양자화 — 리렌더 절약) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);
  /** P2 HP (새 메커니즘 — neon HP 셀에 반영) */
  const [hp, setHp] = useState<number>(G2.MAX_HP);

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();

  // direct-URL 복구 + 이탈 시 디버그 브리지 정리
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 2) startOfflineGame(2);
    return () => setDebugGame(null);
  }, []);

  // 서버 스냅샷 → ref 미러링을 '직접 스토어 구독'으로 처리(리렌더 없이).
  // 스냅샷마다 refs만 갱신하고, hp/남은시간은 '실제로 바뀔 때만' setState → 60Hz 리렌더 제거.
  useEffect(() => {
    const sync = () => {
      const o = onlineStore.get();
      const activeNow =
        o.gameId === 2 &&
        o.role != null &&
        (o.phase === 'countdown' || o.phase === 'playing' || o.phase === 'round-result');
      if (!activeNow || !o.serverState) return;
      const s = o.serverState as Game2State;
      stateRef.current = s;
      snapAtRef.current = performance.now(); // 외삽 dt 기준점
      setDebugGame(s);
      setHp(s.hp); // 값 동일하면 React가 리렌더 생략
      const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
      setHudMs(Math.ceil(remainingMs / 1000) * 1000); // 초 양자화 → ~1/s만 리렌더
    };
    sync(); // 초기 1회
    return onlineStore.subscribe(sync); // 스냅샷마다 호출되지만 리렌더는 유발 안 함
  }, []);

  // 캔버스 해상도 초기화 (dpr 스케일)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // JIT/페인트 프리워밍 — 마운트 직후 1회. 카운트다운(3s) 유휴시간에 겹쳐 돌아
  // step·drawScene가 실제 첫 프레임 전에 최적화된 기계어로 준비된다. 반환=언마운트 정리.
  useEffect(() => prewarmGame2(), []);

  // 성능 오버레이 토글 — ` (백틱). 상태는 localStorage 유지.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Backquote') return;
      perf.show = !perf.show;
      try {
        localStorage.setItem('mp_fps', perf.show ? '1' : '0');
      } catch {
        /* localStorage 불가 — 무시 */
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 키보드 — 로컬 어댑터. GameInputEvent를 큐에 쌓고, 램프 점등.
  // (playerL Q/W = P1, playerR U/I = P2 — 코어가 엣지/홀드 판정)
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // 진짜 서버 온라인: 로컬 큐/봇을 쓰지 않고 서버로만 전송.
        // (KeyQ·KeyU=슬롯A, KeyW·KeyI=슬롯B. 서버가 내 role로 재기입하므로 4키 아무거나 내 슬롯으로 간다.)
        if (isOnlineRef.current) {
          // 온라인은 U/I 두 키만(요구사항). U=주키(slotA=왼쪽), I=보조키(slotB=오른쪽). Q/W는 무시.
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          // 로컬 예측용 홀드 상태(내가 닷지 P2일 때 p2X 예측에 사용). 어태커면 세팅돼도 안 읽음.
          if (e.code === 'KeyU') localHeldRef.current.left = e.type === 'down';
          else localHeldRef.current.right = e.type === 'down';
          if (e.type === 'down') {
            if (e.code === 'KeyU') flashU();
            else flashI();
          }
          const slot = e.code === 'KeyU' ? 'A' : 'B';
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          return;
        }

        const f = getFlow();
        const online = f.mode === 'online';
        // 램프 점등 (down 순간) + P2 online 키는 봇이 대행하므로 흡수하지 않음
        if (e.code === 'KeyQ') {
          if (e.type === 'down') flashQ();
        } else if (e.code === 'KeyW') {
          if (e.type === 'down') flashW();
        } else if (e.code === 'KeyU') {
          if (online) return; // 온라인 mock: P2(회피자)는 봇
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

  // 라운드 수명주기: state 생성 → rAF 루프(step+draw) → 결과 보고
  useEffect(() => {
    // ── 온라인(서버 권위): 로컬 시뮬/봇/결과보고 없이 서버 state만 그린다(draw-only) ──
    if (isOnline) {
      // 첫 스냅샷 전이면 초기 create 상태를 렌더용으로만 세팅(판정 아님 — 미러 effect가 곧 덮어씀).
      if (!stateRef.current) {
        const seed = game2.create(Math.random);
        stateRef.current = seed;
        setDebugGame(seed);
        setHp(seed.hp);
        setHudMs(GAME_DURATION * 1000);
      }
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const ctx = canvasRef.current?.getContext('2d');
        const s = stateRef.current;
        if (ctx && s) {
          const p1IsYou = getPlayerDisplays(getFlow()).P1.isYou;
          fxRef.current = fxRef.current.filter((f) => now - f.t < 1200);
          const gs = s as Game2State;
          // (남의 것) 스냅샷 사이 외삽: 마지막 스냅샷을 경과 dt만큼 속도로 전진(최대 50ms 캡).
          const extraDt = Math.min(0.05, Math.max(0, (now - snapAtRef.current) / 1000));
          let view = extraDt > 0 && gs.result === null ? extrapolate(gs, extraDt) : gs;
          // (내 캐릭터) 닷지(P2)면 내 패들은 live 입력으로 로컬 예측 → 즉각 반응·롤백 제거.
          //  화해: 정지 시 서버값으로 부드럽게 수렴 + 큰 어긋남(라운드리셋 등)만 스냅.
          if (myRole === 'P2' && gs.result === null) {
            const frameDt = lastFrameRef.current
              ? Math.min(0.05, (now - lastFrameRef.current) / 1000)
              : 0;
            const held = localHeldRef.current;
            const dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
            let px = predP2XRef.current;
            if (px === null || Math.abs(gs.p2X - px) > 150) px = gs.p2X; // 초기/라운드리셋/큰 desync 스냅
            px = clampField(px + dir * gs.p2Speed * frameDt); // 예측 전진(서버와 동일 공식)
            if (dir === 0) px += (gs.p2X - px) * 0.15; // 정지 시 서버로 수렴
            predP2XRef.current = px;
            view = { ...view, p2X: px };
          }
          lastFrameRef.current = now;
          drawScene(ctx, view, fxRef.current, trailRef.current, now, p1IsYou);
          drawPerfHud(ctx, now, view.rockets.length);
        }
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    if (flow.gameId !== 2 || flow.phase !== 'playing') return;

    const st = game2.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    botHeldRef.current = { left: false, right: false };
    fxRef.current = [];
    trailRef.current = [];
    reportedRef.current = false;
    resultAtRef.current = 0;
    lastCloseRef.current = 0;
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);
    setHp(st.hp);

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); // 초 단위, 100ms 클램프
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        // 이번 프레임 입력 = 드레인한 키 이벤트 + (온라인) 봇 이벤트
        const events = actionsRef.current;
        actionsRef.current = [];
        if (getFlow().mode === 'online') {
          const dir = computeBotDir(s);
          const wantLeft = dir === -1;
          const wantRight = dir === 1;
          const bh = botHeldRef.current;
          const tSec = now / 1000;
          if (wantLeft !== bh.left) {
            events.push({ code: 'KeyU', type: wantLeft ? 'down' : 'up', t: tSec });
            bh.left = wantLeft;
          }
          if (wantRight !== bh.right) {
            events.push({ code: 'KeyI', type: wantRight ? 'down' : 'up', t: tSec });
            bh.right = wantRight;
          }
        }

        // game2.step은 원본 state를 in-place mutate 후 동일 참조를 반환한다.
        // 따라서 이전값 비교는 step 호출 "전에" 스칼라를 값으로 스냅샷해야 한다(참조 alias 금지).
        const prevHp = s.hp;
        const prevCooldown = s.cooldown;
        const prevP2X = s.p2X;
        s = game2.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s); // 디버그 브리지 — 매 틱 갱신
        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000); // 초 단위 양자화
        if (s.hp !== prevHp) setHp(s.hp);

        // ---- 렌더 전용 이펙트 파생 (로직 비침범) ----
        // 발사: 쿨다운이 0→FIRE_COOLDOWN으로 오른 순간
        if (s.cooldown > prevCooldown) {
          fxRef.current.push({ kind: 'muzzle', x: s.launcherX, y: G2.LAUNCHER_Y, t: now });
        }
        // 장전 완료 순간 짧은 플리커 (쿨다운이 0으로 소진된 프레임)
        if (prevCooldown > 0 && s.cooldown === 0) {
          fxRef.current.push({ kind: 'reload', t: now });
        }
        // 러너 잔상
        if (s.p2X !== prevP2X) {
          trailRef.current.push({ x: prevP2X, t: now });
        }
        trailRef.current = trailRef.current.filter((tr) => now - tr.t < 260);
        // 비치명 피격(HP 감소, 아직 생존) — 파편 + 짧은 캡션
        if (s.hp < prevHp && s.hp > 0) {
          fxRef.current.push(
            { kind: 'shards', x: s.p2X, y: G2.P2_Y, t: now },
            {
              kind: 'caption',
              text: `HP ${s.hp}`,
              color: COL.p2,
              x: s.p2X,
              y: G2.P2_Y - 10,
              t: now,
              life: 500,
            },
          );
        }
        // 근접 회피 "CLOSE!" — 피격 라인을 갓 지난 로켓이 러너 근처(빗맞음)일 때 (throttle)
        if (s.result === null) {
          const danger = G2.P2_W / 2 + G2.ROCKET_W / 2;
          let nearX: number | null = null;
          let nd = Infinity;
          for (const r of s.rockets) {
            if (r.vy <= 0) continue;
            if (r.y >= G2.P2_Y && r.y <= G2.P2_Y + 46) {
              const d = Math.abs(r.x - s.p2X);
              if (d < nd) {
                nd = d;
                nearX = r.x;
              }
            }
          }
          if (nearX !== null && nd <= danger * 2.4 && nd > danger && now - lastCloseRef.current > 350) {
            lastCloseRef.current = now;
            fxRef.current.push({
              kind: 'caption',
              text: 'CLOSE!',
              color: COL.p1,
              x: nearX,
              y: G2.P2_Y - 8,
              t: now,
              life: 400,
            });
          }
        }
        // 판정 순간 이펙트 (글리치는 승패 순간에만)
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          if (s.result === 'P1') {
            // 발사자 승 = P2 피격사
            fxRef.current.push(
              { kind: 'chroma', t: now },
              { kind: 'shards', x: s.p2X, y: G2.P2_Y, t: now },
              {
                kind: 'caption',
                text: 'HIT!',
                color: COL.p2,
                x: s.p2X,
                y: G2.P2_Y - 10,
                t: now,
                life: RESULT_FX_MS,
              },
            );
          } else {
            // 회피자 생존 승
            fxRef.current.push(
              { kind: 'rush', t: now },
              {
                kind: 'caption',
                text: 'SURVIVED!',
                color: COL.p2,
                x: G2.W / 2,
                y: G2.P2_Y - 12,
                t: now,
                life: RESULT_FX_MS,
              },
            );
          }
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // 온라인은 라운드/매치 전환을 서버(round:end)와 OnlineController가 구동 — 화면은 보고하지 않는다.
        if (isOnline) return;
        // 피격/생존 연출을 짧게 보여준 뒤 라운드 종료 1회 보고 → ResultOverlay
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        const p1IsYou = getPlayerDisplays(getFlow()).P1.isYou;
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1200); // 만료 이펙트 정리
        drawScene(ctx, s, fxRef.current, trailRef.current, now, p1IsYou);
        drawPerfHud(ctx, now, s.rockets.length);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= 5000;

  return (
    <main data-testid="scr-game2" className="g2-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g2-topbar">
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
        <span className="g2-title font-arcade c-muted">GAME 2 — 로켓 피하기</span>
      </div>

      <div className="g2-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g2-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g2-canvas" aria-label="게임2 스테이지 — 로켓 피하기" />

        {/* 새 메커니즘 HP(3) — neon HP 셀. P2(회피자)의 잔여 체력 */}
        <div className="g2-hp" aria-label={`P2 체력 ${hp}/${G2.MAX_HP}`}>
          <span className="g2-hp__label font-arcade">P2 HP</span>
          <div className="g2-hp__cells">
            {Array.from({ length: G2.MAX_HP }, (_, i) => (
              <span key={i} className={`g2-hp__cell ${i < hp ? 'on' : ''}`} aria-hidden />
            ))}
          </div>
        </div>

        {flow.phase === 'playing' && flow.currentRound > 0 && (
          <div key={flow.currentRound} className="g2-round-intro" aria-hidden>
            <span className="font-arcade c-accent glow-text g2-round-intro__big">
              ROUND {flow.currentRound}
            </span>
            <span className="font-arcade c-muted g2-round-intro__sub">DODGE THE TRACERS</span>
          </div>
        )}
      </div>

      {/* 온스크린 키캡 — 실제 배정 키 표기 (SPEC Q2), 입력 순간 램프 점등 */}
      {isOnline ? (
        // 온라인: U/I 두 키만 사용. 내 역할의 동작을 내 색으로만 표시(비대칭 게임 — 역할 조건부).
        <div className="g2-keys g2-keys--online">
          <div className="g2-keys__group">
            <span className={`g2-keys__tag font-arcade ${myRole === 'P1' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myRole === 'P1' ? '파랑 · ATTACK' : '빨강 · DODGE'}
            </span>
            <KeyCap
              role={myRole ?? 'P2'}
              keyChar="U"
              icon={myRole === 'P1' ? '⇄' : '◀'}
              lit={uLit}
              label={myRole === 'P1' ? '방향전환' : '왼쪽'}
            />
            <KeyCap
              role={myRole ?? 'P2'}
              keyChar="I"
              icon={myRole === 'P1' ? '◉' : '▶'}
              lit={iLit}
              label={myRole === 'P1' ? '발사' : '오른쪽'}
            />
          </div>
        </div>
      ) : (
        <div className="g2-keys">
          <div className="g2-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="⇄" lit={qLit} label="방향전환" />
            <KeyCap role="P1" keyChar="W" icon="◉" lit={wLit} label="발사" />
            <span className="g2-keys__tag font-arcade c-p1">P1 · ATTACK</span>
          </div>
          <div className="g2-keys__group">
            <span className="g2-keys__tag font-arcade c-p2">P2 · DODGE</span>
            <KeyCap role="P2" keyChar="U" icon="◀" lit={uLit} label="왼쪽" />
            <KeyCap role="P2" keyChar="I" icon="▶" lit={iLit} label="오른쪽" />
          </div>
        </div>
      )}

      <ResultOverlay />
    </main>
  );
}