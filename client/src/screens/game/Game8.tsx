/**
 * 게임5 — 몬스터 포격전 (NEON COIN-OP). 담당: game8 에이전트.
 * 컨테이너 testid: scr-game8 / 부품: game-stage(CRT 베젤), hud-*(HudFrame 내장), btn-exit
 *
 * ── 원칙 ────────────────────────────────────────────────────────────────
 *  · 로직/판정은 100% @madpump/shared game8 코어(create/step). 재구현·복제 없음.
 *  · 화면(캔버스 렌더·연출)은 neon-coinop 톤으로 새로 작성. game-lab/design-lab 미참조.
 *  · 색·폰트는 theme.css 토큰 값(PLAN §1)만 hex로 복사해 캔버스에 사용.
 *
 * ── 무엇을 그리나 (game8 상태 필드에서 파생) ─────────────────────────────
 *  · 중앙 좌우 두 대포: P1=(CX-GAP,CY) 시안 / P2=(CX+GAP,CY) 핑크.
 *      state.p1Angle/p2Angle = 포신 방향, p1Dir/p2Dir = 회전 방향(±1),
 *      p1Cooldown/p2Cooldown = 장전(쿨다운 링), p1Score/p2Score = 격추 수.
 *  · state.monsters[] : 가장자리→목표 대포 직선 침공. target(1|2)에 따라 코어 색.
 *  · state.shots[]    : owner(1|2) 색 네온 트레이서.
 *  · 승패 = 대포 피격(즉사) 또는 10초 생존 후 점수 판정 → state.result('P1'|'P2'|'DRAW').
 *
 * ── 배선 (게임1·2 패턴 동일) ─────────────────────────────────────────────
 *   mount → idle/다른게임이면 startOfflineGame(8) (direct-URL 복구)
 *   라운드마다 game8.create(Math.random)
 *   rAF 루프(+백그라운드 워치독) → game8.step(state, events, dtSec) → setDebugGame 매 틱
 *   입력 attachLocalKeyboard: KeyQ/KeyW=P1, KeyU/KeyI=P2 (코어가 엣지/쿨다운 처리)
 *   result 확정 → 인게임 연출(RESULT_FX_MS) 후 reportRoundEnd(매핑) 1회 → <ResultOverlay />
 *   online 모드 → P2 대포는 봇(가장 위협적인 몬스터로 조준·발사), 사람은 P1(q/w)
 *   ★코어는 원본 mutate 후 동일 참조 반환 → 이전값 비교는 step 호출 전에 스칼라 스냅샷.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { game8, G8, GAME_DURATION } from '@madpump/shared';
import type { Game8State, Monster, GameInputEvent } from '@madpump/shared';
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
import {
  createEndTracker,
  drawEndFlash,
  drawExplosion,
  makeExplosion,
  type EndTracker,
  type Particle,
} from '../../game/endFx';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import './game8.css';

// ---------------------------------------------------------------------------
// 캔버스 논리 해상도 = 코어 필드(800×450). 좌표를 1:1로 그린다(스케일 없음).
// 실제 픽셀은 DPR로 업스케일 → CSS aspect-ratio 16/9로 반응형.
// ---------------------------------------------------------------------------
const CW = G8.W; // 800
const CH = G8.H; // 450

const ARCADE = "'Press Start 2P', monospace";

/** theme.css §1 팔레트(값만 복사 — import 금지). 역할 기본색 = P1 시안 / P2 핑크. */
const COL0 = {
  field: '#1a0b2e', // --bg-raised
  deep: '#160a33', // --surface-deep
  p1: '#05d9e8',
  p1dim: '#0a3a4a',
  p2: '#ff2a6d',
  p2dim: '#4a0a26',
  accent: '#fdf500',
  accent2: '#d300c5',
  muted: '#9d8fbf',
  error: '#ff3864',
} as const;

type Pal = Record<keyof typeof COL0, string>;

/**
 * 색 = 플레이어 종속(역할 아님) 로컬 팔레트.
 * 이 라운드 P1/P2 '기능 엔티티'의 실제 플레이어 색으로 p1/p2(+dim)를 배치한다:
 *  functionColors().p1='red' 이면 P1엔티티=핑크·P2엔티티=시안이 되도록 p1↔p2를 스왑.
 *  나머지(field/deep/accent/accent2/error 등)는 플레이어와 무관하므로 불변.
 *  오프라인·색 정보 없음 → functionColors 기본값({p1:'blue',p2:'red'}) → COL0 그대로(기존 동작 동일).
 */
function playerCol(): Pal {
  const fc = functionColors();
  return fc.p1 === 'red'
    ? { ...COL0, p1: COL0.p2, p1dim: COL0.p2dim, p2: COL0.p1, p2dim: COL0.p1dim }
    : COL0;
}

/** 대포 고정 위치 (코어 규약과 동일) */
const P1 = { x: G8.CX - G8.GAP, y: G8.CY };
const P2 = { x: G8.CX + G8.GAP, y: G8.CY };

/** 판정 → 결과 오버레이 전환 사이 인게임 연출 시간(폭발/생존 러쉬) */
const RESULT_FX_MS = 650;

/** 대포 위협 감지 반경(렌더 전용 경고 링) */
const DANGER_R = 96;

/** 코어 result → 셸 MatchResult */
function toMatchResult(r: 'P1' | 'P2' | 'DRAW'): MatchResult {
  return r === 'P1' ? 'P1_WIN' : r === 'P2' ? 'P2_WIN' : 'DRAW';
}

/** 각도를 (-π, π] 로 정규화 */
function normAngle(a: number): number {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x <= -Math.PI) x += Math.PI * 2;
  return x;
}

// ---------------------------------------------------------------------------
// 렌더 전용 이펙트 (로직 비침범)
// ---------------------------------------------------------------------------
type Fx =
  | { kind: 'muzzle'; x: number; y: number; color: string; t: number }
  | { kind: 'shards'; x: number; y: number; color: string; t: number }
  | { kind: 'boom'; x: number; y: number; color: string; t: number }
  | { kind: 'rush'; owner: 1 | 2; t: number }
  | { kind: 'chroma'; t: number }
  | { kind: 'caption'; text: string; color: string; x: number; y: number; t: number; life: number };

function nearestMonsterDist(monsters: readonly Monster[], p: { x: number; y: number }): number {
  let d = Infinity;
  for (const m of monsters) {
    const dd = Math.hypot(m.x - p.x, m.y - p.y);
    if (dd < d) d = dd;
  }
  return d;
}

// ---------------------------------------------------------------------------
// 캔버스 렌더러 (순수 그리기 — state는 읽기만)
// ---------------------------------------------------------------------------
function drawBaseRing(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, col: string): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, G8.CANNON_R + 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMonster(ctx: CanvasRenderingContext2D, m: Monster, COL: Pal, reduce: boolean): void {
  const target = m.target === 1 ? P1 : P2;
  const coreCol = m.target === 1 ? COL.p1 : COL.p2;

  // 조준선 — 이 몬스터가 노리는 대포 색으로 희미하게 (위협 배정 즉독)
  ctx.save();
  ctx.strokeStyle = coreCol;
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(m.x, m.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.restore();

  // 몸통 — 퍼플 네온 스파이크(외계 침공체)
  const pulse = reduce ? 1 : 1 + 0.1 * Math.sin(m.anim * 6);
  const R = G8.MONSTER_R * pulse;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(reduce ? 0 : m.anim * 1.4);
  ctx.beginPath();
  const spikes = 8;
  for (let i = 0; i < spikes * 2; i++) {
    const rr = i % 2 === 0 ? R : R * 0.58;
    const a = (Math.PI * i) / spikes;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = COL.deep;
  ctx.fill();
  ctx.strokeStyle = COL.accent2;
  ctx.lineWidth = 2;
  ctx.shadowColor = COL.accent2;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();

  // 코어(목표 색 눈알)
  ctx.save();
  ctx.fillStyle = coreCol;
  ctx.shadowColor = coreCol;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShot(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number, owner: 1 | 2, COL: Pal): void {
  const col = owner === 1 ? COL.p1 : COL.p2;
  // rgb는 트레이서 그라디언트용 — 해석된 색(시안/핑크)에서 역산해 스왑에도 정확히 따른다.
  const rgb = col === COL0.p1 ? '5,217,232' : '255,42,109';
  const tx = x - vx * 0.05;
  const ty = y - vy * 0.05;
  ctx.save();
  const grad = ctx.createLinearGradient(tx, ty, x, y);
  grad.addColorStop(0, `rgba(${rgb},0)`);
  grad.addColorStop(1, `rgba(${rgb},0.85)`);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x, y, G8.BULLET_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCannon(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  angle: number,
  cooldown: number,
  col: string,
  dim: string,
  nearestDist: number,
  label: string,
  isYou: boolean,
  now: number,
  reduce: boolean,
): void {
  // 위협 경고 링 (몬스터 근접 시 — 긴장 피드백)
  if (nearestDist < DANGER_R) {
    const prox = 1 - nearestDist / DANGER_R;
    const pulse = reduce ? 0.6 : 0.45 + 0.45 * Math.sin(now / 70);
    ctx.save();
    ctx.strokeStyle = COL0.error;
    ctx.globalAlpha = Math.min(0.85, prox * pulse + 0.15);
    ctx.lineWidth = 2;
    ctx.shadowColor = COL0.error;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, G8.CANNON_R + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 포신
  const tipx = p.x + Math.cos(angle) * G8.BARREL_LEN;
  const tipy = p.y + Math.sin(angle) * G8.BARREL_LEN;
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.shadowColor = col;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(tipx, tipy);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(tipx, tipy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 몸통(dim 바탕 + 2px 플레이어색 보더 + 글로우)
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, G8.CANNON_R, 0, Math.PI * 2);
  ctx.fillStyle = dim;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();

  // 장전 링(쿨다운 회복 = 원호 채움, 준비 완료면 글로우)
  const ready = 1 - Math.min(1, Math.max(0, cooldown / G8.FIRE_COOLDOWN));
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, G8.CANNON_R + 4, -Math.PI / 2, -Math.PI / 2 + ready * Math.PI * 2);
  ctx.strokeStyle = col;
  ctx.globalAlpha = ready >= 1 ? 0.9 : 0.5;
  ctx.lineWidth = 2;
  if (ready >= 1) {
    ctx.shadowColor = col;
    ctx.shadowBlur = 6;
  }
  ctx.stroke();
  ctx.restore();

  // 라벨 + YOU
  ctx.save();
  ctx.font = `10px ${ARCADE}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 6;
  ctx.fillText(label, p.x, p.y + G8.CANNON_R + 18);
  if (isYou && (reduce || Math.floor(now / 500) % 2 === 0)) {
    ctx.fillStyle = COL0.accent;
    ctx.shadowColor = COL0.accent;
    ctx.fillText('YOU', p.x, p.y - G8.CANNON_R - 12);
  }
  ctx.restore();
}

function drawFx(ctx: CanvasRenderingContext2D, f: Fx, COL: Pal, now: number, reduce: boolean): void {
  const age = now - f.t;
  if (f.kind === 'muzzle') {
    if (age >= 110) return;
    ctx.save();
    ctx.strokeStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    const r = 6 + age * 0.06;
    ctx.beginPath();
    ctx.moveTo(f.x - r, f.y);
    ctx.lineTo(f.x + r, f.y);
    ctx.moveTo(f.x, f.y - r);
    ctx.lineTo(f.x, f.y + r);
    ctx.stroke();
    ctx.restore();
  } else if (f.kind === 'shards') {
    if (age >= 520) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age / 520);
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 6;
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * 2 * i) / 7 + 0.4;
      const dist = 6 + age * 0.12;
      ctx.fillRect(f.x + Math.cos(a) * dist - 2.5, f.y + Math.sin(a) * dist - 2.5, 5, 5);
    }
    ctx.restore();
  } else if (f.kind === 'boom') {
    if (age >= RESULT_FX_MS + 200) return;
    ctx.save();
    const t = age / (RESULT_FX_MS + 200);
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.strokeStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 10 + age * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = f.color;
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10;
      const dist = 8 + age * 0.14;
      ctx.fillRect(f.x + Math.cos(a) * dist - 3, f.y + Math.sin(a) * dist - 3, 6, 6);
    }
    ctx.restore();
  } else if (f.kind === 'rush') {
    if (age >= RESULT_FX_MS + 200) return;
    const pos = f.owner === 1 ? P1 : P2;
    const col = f.owner === 1 ? COL.p1 : COL.p2;
    const pulse = reduce ? 0.6 : 0.4 + 0.4 * Math.sin(age / 60);
    ctx.save();
    ctx.globalAlpha = 0.5 * pulse + 0.3;
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, G8.CANNON_R + 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (f.kind === 'caption') {
    if (age >= f.life) return;
    const blinkOn = reduce || Math.floor(age / 120) % 2 === 0 || age > 300;
    if (!blinkOn) return;
    ctx.save();
    ctx.font = `14px ${ARCADE}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 12;
    ctx.fillText(f.text, Math.min(CW - 60, Math.max(60, f.x)), f.y);
    ctx.restore();
  }
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  s: Game8State,
  fx: readonly Fx[],
  now: number,
  p1IsYou: boolean,
  p2IsYou: boolean,
  reduce: boolean,
): void {
  // 색 = 플레이어 종속(역할 아님) — P1/P2 기능 엔티티를 실제 플레이어 색으로 칠한다.
  // 로컬 COL이 모듈 COL0를 shadow → 아래 COL.p1/p2 사용부가 자동으로 플레이어 색을 따른다.
  const COL = playerCol();
  const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
  const urgent = remainingMs <= 5000 && s.result === null;

  // 필드
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // 옅은 네온 그리드 (임박 시 핑크 톤)
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,42,109,0.10)' : 'rgba(211,0,197,0.07)';
  ctx.lineWidth = 1;
  for (let gx = 40; gx < CW; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, CH);
    ctx.stroke();
  }
  for (let gy = 40; gy < CH; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(CW, gy);
    ctx.stroke();
  }
  ctx.restore();

  // 대포 베이스 링
  drawBaseRing(ctx, P1, COL.p1);
  drawBaseRing(ctx, P2, COL.p2);

  // 몬스터
  for (const m of s.monsters) drawMonster(ctx, m, COL, reduce);

  // 총알
  for (const sh of s.shots) drawShot(ctx, sh.x, sh.y, sh.vx, sh.vy, sh.owner, COL);

  // 대포
  const near1 = nearestMonsterDist(s.monsters, P1);
  const near2 = nearestMonsterDist(s.monsters, P2);
  drawCannon(ctx, P1, s.p1Angle, s.p1Cooldown, COL.p1, COL.p1dim, near1, 'P1', p1IsYou, now, reduce);
  drawCannon(ctx, P2, s.p2Angle, s.p2Cooldown, COL.p2, COL.p2dim, near2, 'P2', p2IsYou, now, reduce);

  // 이펙트
  for (const f of fx) drawFx(ctx, f, COL, now, reduce);

  // 승패 순간 크로마틱 어버레이션 1프레임
  const chroma = fx.find((f) => f.kind === 'chroma');
  if (chroma && now - chroma.t < 110) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(ctx.canvas, -4, 0, CW, CH);
    ctx.globalAlpha = 0.22;
    ctx.drawImage(ctx.canvas, 4, 0, CW, CH);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 온라인 mock 봇 — P2 대포. 판정은 여전히 코어(game8.step).
// 가장 위협적인(자신을 노리는·가까운) 몬스터로 조준하고, 정렬되면 발사.
// 반환: 이번 프레임 합성 입력 이벤트 (KeyU=방향전환 / KeyI=발사)
// ---------------------------------------------------------------------------
interface BotMemory {
  lastToggleAt: number;
  lastFireAt: number;
}

function botEvents(s: Game8State, now: number, mem: BotMemory): GameInputEvent[] {
  const out: GameInputEvent[] = [];
  // 1) 표적 선정 — P2를 노리는 몬스터 우선(위협), 없으면 아무 몬스터(득점)
  let target: Monster | null = null;
  let best = Infinity;
  for (const m of s.monsters) {
    const threat = m.target === 2 ? 0 : 100000; // 위협 몬스터에 강한 가산점
    const d = Math.hypot(m.x - P2.x, m.y - P2.y) + threat;
    if (d < best) {
      best = d;
      target = m;
    }
  }
  if (!target) return out;

  const desired = Math.atan2(target.y - P2.y, target.x - P2.x);
  const diff = normAngle(desired - s.p2Angle);
  const tSec = now / 1000;

  // 2) 회전 방향 정렬 — angle += ROT_SPEED*dir*dt 이므로 diff>0 이면 dir=+1 이 최단
  const wantDir: 1 | -1 = diff >= 0 ? 1 : -1;
  if (Math.abs(diff) > 0.25 && s.p2Dir !== wantDir && now - mem.lastToggleAt > 150) {
    out.push({ code: 'KeyU', type: 'down', t: tSec });
    mem.lastToggleAt = now;
  }

  // 3) 발사 — 대략 정렬 + 쿨다운 준비 (코어가 쿨다운 재확인하므로 안전)
  if (Math.abs(diff) < 0.16 && s.p2Cooldown === 0 && now - mem.lastFireAt > G8.FIRE_COOLDOWN * 1000 * 0.85) {
    out.push({ code: 'KeyI', type: 'down', t: tSec });
    mem.lastFireAt = now;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 스냅샷 사이 보간(외삽) — 서버 스냅샷을 dt초만큼 각 오브젝트 '자기 속도'로 전진시킨
// 표시용 상태를 만든다. 총알·몬스터는 vx/vy로, 대포는 ROT_SPEED·dir로 회전 전진.
// 스냅샷에 속도/방향이 이미 있어 ID 매칭 불필요하고 추가 지연 0. 방향전환(토글) 순간만
// 미세 오차이며 다음 스냅샷이 즉시 교정한다. 30/60Hz 스냅샷을 60fps 렌더로 부드럽게 잇는 게 목적.
// (표시용 얕은 복사 — 원본 state는 읽기만, 판정 비침범)
// ---------------------------------------------------------------------------
function extrapolate(s: Game8State, dt: number): Game8State {
  return {
    ...s,
    p1Angle: s.p1Angle + G8.ROT_SPEED * s.p1Dir * dt,
    p2Angle: s.p2Angle + G8.ROT_SPEED * s.p2Dir * dt,
    shots: s.shots.map((sh) => ({ ...sh, x: sh.x + sh.vx * dt, y: sh.y + sh.vy * dt })),
    monsters: s.monsters.map((m) => ({
      ...m,
      x: m.x + m.vx * dt,
      y: m.y + m.vy * dt,
      anim: m.anim + dt,
    })),
  };
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------
/**
 * 종료 연출 — result가 null→승패로 바뀌는 순간 '진 쪽 대포'에서 폭발을 스폰하고,
 * 이후 매 프레임 폭발 파편 + 기본 플래시를 그린다. 온라인/오프라인 루프 공용.
 */
function runEndFx(
  ctx: CanvasRenderingContext2D,
  endRef: React.MutableRefObject<EndTracker>,
  exRef: React.MutableRefObject<{ parts: Particle[]; cx: number; cy: number } | null>,
  result: Game8State['result'],
  now: number,
): void {
  const started = endRef.current.update(result, now);
  if (started && result && result !== 'DRAW') {
    // result='P1'이면 P2 패배 → P2 대포 폭발, 'P2'이면 P1 대포 폭발.
    const loser = result === 'P1' ? P2 : P1;
    exRef.current = { parts: makeExplosion(loser.x, loser.y), cx: loser.x, cy: loser.y };
  }
  if (!result) exRef.current = null; // 새 라운드 정리
  const age = endRef.current.age(now);
  if (exRef.current && age !== null) {
    drawExplosion(ctx, exRef.current.parts, exRef.current.cx, exRef.current.cy, age);
  }
  drawEndFlash(ctx, CW, CH, age);
}

export default function Game8() {
  useDebugScreen('scr-game8');
  const flow = useFlow();
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const actionsRef = useRef<GameInputEvent[]>([]);
  const fxRef = useRef<Fx[]>([]);
  // 종료 연출: result 전환 추적 + 진 쪽 대포 폭발 파편 보관
  const endRef = useRef<EndTracker>(createEndTracker());
  const explosionRef = useRef<{ parts: Particle[]; cx: number; cy: number } | null>(null);
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);
  const botRef = useRef<BotMemory>({ lastToggleAt: 0, lastFireAt: 0 });
  const reduceRef = useRef(false);

  /** HUD 남은 시간(초 단위 양자화 — 리렌더 절약) */
  const [hudMs, setHudMs] = useState(GAME_DURATION * 1000);
  /** 격추 점수(새 메커니즘 — neon 스코어 셀) */
  const [scores, setScores] = useState<{ p1: number; p2: number }>({ p1: 0, p2: 0 });

  const [qLit, flashQ] = useKeyLamp();
  const [wLit, flashW] = useKeyLamp();
  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();
  const lampRef = useRef({ flashU, flashI });
  lampRef.current = { flashU, flashI };

  // ── 온라인 렌더 훅(성능 표준): 활성/역할만 선택 구독 → 라운드 경계에서만 리렌더.
  //    서버 스냅샷은 stateRef/snapAtRef에 직접 미러(리렌더 없음), per-snapshot HUD 반영은 onSnapshot.
  //    isOnline=false면 오프라인(로컬 2인/봇) 100% 기존 동작.
  const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game8State>(8, (s) => {
    setDebugGame(s);
    // 오프라인 루프의 setHudMs/setScores를 서버 상태로 대체(HUD 라이브 유지) — 값 바뀔 때만 리렌더.
    const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
    setHudMs(Math.ceil(remainingMs / 1000) * 1000);
    setScores({ p1: s.p1Score, p2: s.p2Score });
  });
  // 키보드 핸들러(안정 클로저)가 최신 '온라인 활성 여부'를 보게 하는 ref.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  // 색 = 플레이어 종속(역할과 독립). 키캡/YOU 태그를 이 색으로 칠한다.
  // 색은 매치 경계에서만 바뀌는 원시값 → 선택 구독으로 60Hz 리렌더 없이 반응.
  const myColor = useSyncExternalStore(
    onlineStore.subscribe,
    () => onlineStore.get().myColor ?? 'blue',
    () => onlineStore.get().myColor ?? 'blue',
  );

  // direct-URL 복구 + prefers-reduced-motion 기록 + 디버그 브리지 정리
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 8) startOfflineGame(8);
    reduceRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    return () => setDebugGame(null);
  }, []);

  // 캔버스 해상도(dpr 스케일) — 좌표는 800×450 논리계 그대로 사용
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // 키보드 — GameInputEvent 큐 수집 + 램프 점등.
  // P1 q/w, P2 u/i. 온라인이면 P2 키는 봇 대행이므로 흡수하지 않는다.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        // ── 서버 온라인: 로컬 큐/봇 없이 서버로만 전송 ──
        // 내가 어느 role이든 서버가 role로 재기입하므로 4키 아무거나 내 슬롯으로 감.
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

        // ── 오프라인(로컬 2인 + 봇) 기존 처리 그대로 ──
        const f = getFlow();
        const botMode = f.mode === 'online'; // 옛 online = P2 mock 봇 모드
        if (e.code === 'KeyQ') {
          if (e.type === 'down') flashQ();
        } else if (e.code === 'KeyW') {
          if (e.type === 'down') flashW();
        } else if (e.code === 'KeyU') {
          if (botMode) return; // 온라인(봇) P2 = 봇 대행
          if (e.type === 'down') flashU();
        } else if (e.code === 'KeyI') {
          if (botMode) return;
          if (e.type === 'down') flashI();
        }
        if (f.phase === 'playing') actionsRef.current.push(e);
      },
    );
    return detach;
  }, [flashQ, flashW, flashU, flashI]);

  // 라운드 수명주기: state 생성 → rAF 루프(step+draw) → 결과 보고
  useEffect(() => {
    // ── 온라인: 서버 상태만 그리는 draw-only 루프 (step·봇·result보고 없음) ──
    if (isOnline) {
      // 첫 스냅샷 전엔 빈 캔버스 대신 정적 create 상태를 렌더(절대 step하지 않음)
      if (!stateRef.current) stateRef.current = game8.create(Math.random);
      let raf = 0;
      let stopped = false;
      const loop = () => {
        if (stopped) return;
        const ctx = canvasRef.current?.getContext('2d');
        const s = stateRef.current;
        if (ctx && s) {
          const now = performance.now();
          fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
          const disp = getPlayerDisplays(getFlow());
          // 스냅샷 사이 외삽: 마지막 스냅샷을 경과 dt만큼 각 오브젝트 자기 속도로 전진(최대 50ms 캡).
          // 종료(result) 후엔 외삽하지 않는다(총알/몬스터가 판정 위치를 지나쳐 보이지 않게).
          const extraDt = Math.min(0.05, Math.max(0, (now - snapAtRef.current) / 1000));
          const view = extraDt > 0 && s.result === null ? extrapolate(s, extraDt) : s;
          drawScene(ctx, view, fxRef.current, now, disp.P1.isYou, disp.P2.isYou, reduceRef.current);
          runEndFx(ctx, endRef, explosionRef, s.result, now); // 진 쪽 대포 폭발 + 플래시
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => {
        stopped = true;
        cancelAnimationFrame(raf);
      };
    }

    if (flow.gameId !== 8 || flow.phase !== 'playing') return;

    const st = game8.create(Math.random);
    stateRef.current = st;
    actionsRef.current = [];
    fxRef.current = [];
    reportedRef.current = false;
    resultAtRef.current = 0;
    botRef.current = { lastToggleAt: 0, lastFireAt: 0 };
    setDebugGame(st);
    setHudMs(GAME_DURATION * 1000);
    setScores({ p1: 0, p2: 0 });

    let raf = 0;
    let stopped = false;
    let last = performance.now();

    const step = (now: number) => {
      if (stopped) return;
      if (isRoundIntroActive()) { last = now; return; }
      const dt = Math.min(0.5, (now - last) / 1000);
      if (dt <= 0) return;
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        const events = actionsRef.current;
        actionsRef.current = [];

        // 온라인 봇(P2) 합성 입력
        if (getFlow().mode === 'online') {
          const bev = botEvents(s, now, botRef.current);
          for (const e of bev) {
            events.push(e);
            if (e.code === 'KeyU') lampRef.current.flashU();
            else if (e.code === 'KeyI') lampRef.current.flashI();
          }
        }

        // ★step은 원본 mutate 후 동일 참조 반환 → 이전값은 호출 전에 값/참조로 스냅샷
        const prevP1Cd = s.p1Cooldown;
        const prevP2Cd = s.p2Cooldown;
        const prevP1Score = s.p1Score;
        const prevP2Score = s.p2Score;
        const prevMonsters = s.monsters; // 격추 감지용(참조 diff)

        s = game8.step(s, events, dt);
        stateRef.current = s;
        setDebugGame(s);

        const remainingMs = Math.max(0, (GAME_DURATION - s.elapsed) * 1000);
        setHudMs(Math.ceil(remainingMs / 1000) * 1000);
        if (s.p1Score !== prevP1Score || s.p2Score !== prevP2Score) {
          setScores({ p1: s.p1Score, p2: s.p2Score });
        }

        // 색 = 플레이어 종속(역할 아님) — fx 색도 P1/P2 엔티티의 실제 플레이어 색으로.
        const COL = playerCol();

        // ── 렌더 전용 이펙트 파생 (로직 비침범) ──
        // 발사: 쿨다운이 0→FIRE_COOLDOWN 으로 오른 순간(포신 끝에 머즐 스파크)
        if (s.p1Cooldown > prevP1Cd) {
          fxRef.current.push({
            kind: 'muzzle',
            x: P1.x + Math.cos(s.p1Angle) * G8.BARREL_LEN,
            y: P1.y + Math.sin(s.p1Angle) * G8.BARREL_LEN,
            color: COL.p1,
            t: now,
          });
        }
        if (s.p2Cooldown > prevP2Cd) {
          fxRef.current.push({
            kind: 'muzzle',
            x: P2.x + Math.cos(s.p2Angle) * G8.BARREL_LEN,
            y: P2.y + Math.sin(s.p2Angle) * G8.BARREL_LEN,
            color: COL.p2,
            t: now,
          });
        }

        // 격추: 이번 step 전 배열엔 있으나 후 배열엔 없는 몬스터 = 총알에 맞아 소멸
        if (prevMonsters !== s.monsters) {
          for (const m of prevMonsters) {
            if (!s.monsters.includes(m)) {
              fxRef.current.push({ kind: 'shards', x: m.x, y: m.y, color: COL.accent2, t: now });
            }
          }
        }

        // 판정 순간(1회) — 대포 피격(즉사) vs 시간초과(점수) 구분
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          const touchR = G8.MONSTER_R + G8.CANNON_R + 0.5;
          let loser: 1 | 2 | null = null;
          for (const m of s.monsters) {
            if (Math.hypot(m.x - P1.x, m.y - P1.y) <= touchR) loser = 1;
            else if (Math.hypot(m.x - P2.x, m.y - P2.y) <= touchR) loser = 2;
          }
          if (loser !== null) {
            // 대포 파괴 — 폭발 + 글리치
            const pos = loser === 1 ? P1 : P2;
            const col = loser === 1 ? COL.p1 : COL.p2;
            fxRef.current.push(
              { kind: 'chroma', t: now },
              { kind: 'boom', x: pos.x, y: pos.y, color: col, t: now },
              { kind: 'caption', text: 'CANNON DOWN', color: col, x: pos.x, y: pos.y - 34, t: now, life: RESULT_FX_MS },
            );
          } else if (s.result === 'DRAW') {
            fxRef.current.push({
              kind: 'caption',
              text: 'DRAW',
              color: COL.accent2,
              x: G8.CX,
              y: G8.CY - 40,
              t: now,
              life: RESULT_FX_MS,
            });
          } else {
            // 시간초과 생존 — 점수 높은 대포가 방어 성공
            const owner: 1 | 2 = s.result === 'P1' ? 1 : 2;
            const pos = owner === 1 ? P1 : P2;
            const col = owner === 1 ? COL.p1 : COL.p2;
            fxRef.current.push(
              { kind: 'rush', owner, t: now },
              { kind: 'caption', text: 'DEFENDED!', color: col, x: pos.x, y: pos.y - 34, t: now, life: RESULT_FX_MS },
            );
          }
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // 온라인은 서버가 round:end를 구동하므로 화면은 보고하지 않는다
        if (isOnline) return;
        // 폭발/생존 연출을 짧게 보여준 뒤 라운드 종료 1회 보고 → ResultOverlay
        reportedRef.current = true;
        if (s.result) reportRoundEnd(toMatchResult(s.result));
      }

      // 렌더
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1400);
        const disp = getPlayerDisplays(getFlow());
        drawScene(ctx, s, fxRef.current, now, disp.P1.isYou, disp.P2.isYou, reduceRef.current);
        runEndFx(ctx, endRef, explosionRef, s.result, now); // 진 쪽 대포 폭발 + 플래시
      }
    };

    const loop = (now: number) => {
      step(now);
      if (!stopped) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // 백그라운드 탭에서 rAF가 멈추면 인터벌 워치독이 대신 스텝(QA 자동화 대응)
    const watchdog = setInterval(() => {
      const now = performance.now();
      if (!stopped && now - last > 280) step(now);
    }, 250);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearInterval(watchdog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, myRole, flow.gameId, flow.phase, flow.currentRound]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const urgent = flow.phase === 'playing' && hudMs <= 5000;
  // 색 = 플레이어 종속 — 스코어 셀도 P1/P2 엔티티의 실제 플레이어 색으로(blue→--p1 시안 / red→--p2 핑크).
  const fc = functionColors();
  const p1KillCls = fc.p1 === 'blue' ? 'g8-score--p1' : 'g8-score--p2';
  const p2KillCls = fc.p2 === 'blue' ? 'g8-score--p1' : 'g8-score--p2';

  return (
    <main data-testid="scr-game8" className="g8-screen">
      <div className="vanish-grid dim" aria-hidden />

      <div className="g8-topbar">
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
        <span className="g8-title font-arcade c-muted">게임5 · 몬스터 포격전</span>
      </div>

      <div className="g8-hudwrap">
        <HudFrame
          p1={players.P1}
          p2={players.P2}
          roundWins={wins}
          roundCount={flow.roundConfig.roundCount}
          currentRound={Math.max(1, flow.currentRound)}
          timeRemainingMs={hudMs}
        />
      </div>

      <div data-testid="game-stage" className={`crt-bezel g8-stage ${urgent ? 'urgent' : ''}`}>
        <canvas ref={canvasRef} className="g8-canvas" aria-label="게임5 스테이지 — 몬스터 포격전" />

        {/* 새 메커니즘: 격추 점수 — neon 스코어 셀 (P1 좌상 / P2 우상) */}
        <div className={`g8-score ${p1KillCls}`} aria-label={`P1 격추 ${scores.p1}`}>
          <span className="g8-score__label font-arcade">P1 KILLS</span>
          <span key={scores.p1} className="g8-score__num font-arcade">
            {scores.p1}
          </span>
        </div>
        <div className={`g8-score ${p2KillCls}`} aria-label={`P2 격추 ${scores.p2}`}>
          <span className="g8-score__label font-arcade">P2 KILLS</span>
          <span key={scores.p2} className="g8-score__num font-arcade">
            {scores.p2}
          </span>
        </div>

      </div>

      {/* 온스크린 키캡 — 실제 배정 키(SPEC Q2) + 입력 순간 램프 점등 */}
      {isOnline ? (
        // 온라인: 로컬 플레이어(U/I)만. 색=내 플레이어 색(역할 아님). U=방향전환(slotA) / I=발사(slotB).
        <div className="g8-keys g8-keys--online">
          <div className="g8-keys__group">
            <span className={`g8-keys__tag font-arcade ${myColor === 'blue' ? 'c-p1' : 'c-p2'}`}>
              YOU · {myColor === 'blue' ? '파랑' : '빨강'}
            </span>
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="U" icon="⇄" lit={uLit} label="방향전환" />
            <KeyCap role={myColor === 'blue' ? 'P1' : 'P2'} keyChar="I" icon="◉" lit={iLit} label="발사" />
          </div>
          <span className="g8-keys__hint font-arcade">SHOOT THE INVADERS</span>
        </div>
      ) : (
        <div className="g8-keys">
          <div className="g8-keys__group">
            <KeyCap role="P1" keyChar="Q" icon="⇄" lit={qLit} label="방향전환" />
            <KeyCap role="P1" keyChar="W" icon="◉" lit={wLit} label="발사" />
            <span className="g8-keys__tag font-arcade c-p1">P1</span>
          </div>
          <span className="g8-keys__hint font-arcade">SHOOT THE INVADERS</span>
          <div className="g8-keys__group">
            <span className="g8-keys__tag font-arcade c-p2">P2</span>
            <KeyCap role="P2" keyChar="U" icon="⇄" lit={uLit} label="방향전환" />
            <KeyCap role="P2" keyChar="I" icon="◉" lit={iLit} label="발사" />
          </div>
        </div>
      )}

      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}