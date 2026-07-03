/**
 * S10·S11. 게임2 인게임 — 총알 피하기 (scr-game2)
 * [OWNER: game2 에이전트] — 이 파일은 game2 에이전트만 수정한다.
 *
 * 구현 (SPEC S10·S11 / PLAN §2-S10·§3.2):
 *  - @shared: createGame2State({ roundDurationMs }, Math.random)
 *    + reduceGame2Inputs + tickGame2 — rAF 루프에서 tick만 호출 (로직 재구현 없음)
 *  - 입력: attachKeyboardAdapter (P1: q=TURN w=FIRE 엣지 / P2: u·i LEFT/RIGHT down·up 레벨)
 *    flow.mode==='online'이면 P2는 봇(총알 궤적 회피 휴리스틱 + 랜덤 배회)
 *  - 렌더: canvas (상단 1/5 P1 블루 레인 / 하단 1/5 P2 핑크 레인 + 해저드 피격 라인 /
 *    중간 크림 낙하 공간). state.view(xRatio 등)로 그린다.
 *  - 아트(§3.2): 캡슐 총알(흰 몸통+accent 팁+고스트 잔상), 포탑 반동+머즐 플래시,
 *    탄창 칩 3개(fireReadyRatio), 러너 기울임, CLOSE! 팝업, 피격 ink 반전+파편+HIT! 스탬프,
 *    생존 시 레인 점등+SURVIVED! 스탬프, 임박 5초 배경 상승
 *  - state.result 확정 → (0.9초 연출 후) reportRoundEnd → flow.phase 따라 <ResultOverlay>
 *  - 매 틱 setDebugGame(state), 언마운트 시 setDebugGame(null)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  attachKeyboardAdapter,
  createGame2State,
  DEFAULT_KEYBOARD_MAP,
  GAME2_IDLE_INPUTS,
  reduceGame2Inputs,
  tickGame2,
} from '@shared';
import type { Game2Action, Game2Inputs, Game2State, KeyInputEvent, PlayerRole } from '@shared';
import {
  exitMatch,
  getFlow,
  getPlayerDisplays,
  getRoundWins,
  nextRound,
  reportRoundEnd,
  useFlow,
} from '../../state/flow';
import { HudFrame, Stamp, Sticker } from '../../components';
import ResultOverlay from './ResultOverlay';
import { setDebugGame, useDebugScreen } from '../../debug';

// --- 팔레트 (theme.css 변수와 동일 hex — canvas는 CSS 변수를 못 읽음, PLAN §1.1) ---
const C = {
  bg: '#FDF6E3',
  bgUrgent: '#FAEDB4', // 임박 5초: 크림 → highlight 옅은 톤 (§3.2)
  surface: '#FFFFFF',
  ink: '#0A0A0A',
  muted: '#5C5C52',
  accent: '#FF5C00',
  highlight: '#FFD600',
  p1: '#2B5BFF',
  p1t: '#D9E2FF',
  p2: '#FF2E88',
  p2t: '#FFD9EA',
  error: '#E5142E',
} as const;

const INTRO_MS = 1500; // 라운드 시작 3·2·1 연출 (틱 정지)
const REPORT_DELAY_MS = 900; // HIT!/SURVIVED! 스탬프 감상 시간 후 reportRoundEnd

interface Popup {
  xr: number;
  bornAt: number;
}

interface Debris {
  xr: number;
  yr: number;
  vx: number; // ratio/sec
  vy: number; // ratio/sec
  rot: number;
  vr: number; // rad/sec
  size: number; // px
  bornAt: number;
}

/** 렌더 전용 연출 상태 (로직 비침범) + 봇 내부 상태 */
interface Fx {
  firedAt: number;
  hitAt: number;
  outcome: 'hit' | 'survived' | null;
  popups: Popup[];
  debris: Debris[];
  runnerLean: -1 | 0 | 1;
  botDir: -1 | 0 | 1;
  botNextThinkAt: number;
  botTargetX: number | null;
  botRetargetAt: number;
}

function freshFx(): Fx {
  return {
    firedAt: -1e9,
    hitAt: 0,
    outcome: null,
    popups: [],
    debris: [],
    runnerLean: 0,
    botDir: 0,
    botNextThinkAt: 0,
    botTargetX: null,
    botRetargetAt: 0,
  };
}

/** 해저드 스트라이프 밴드 (45°, §1.3) */
function hazardBand(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = C.highlight;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.ink;
  for (let sx = x - h - 24; sx < x + w + h; sx += 24) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + 12, y + h);
    ctx.lineTo(sx + 12 + h, y);
    ctx.lineTo(sx + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function capsulePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - h / 2 + r);
  ctx.arc(cx, cy - h / 2 + r, r, Math.PI, 0);
  ctx.lineTo(cx + r, cy + h / 2 - r);
  ctx.arc(cx, cy + h / 2 - r, r, 0, Math.PI);
  ctx.closePath();
}

/** 알약 캡슐 총알: 흰 몸통 + 하단 accent 팁 + 2px 미니 섀도 (§3.2) */
function drawCapsule(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  // 미니 섀도 (blur 없는 오프셋)
  capsulePath(ctx, cx + 2, cy + 2, w, h);
  ctx.fillStyle = C.ink;
  ctx.fill();
  // 몸통
  capsulePath(ctx, cx, cy, w, h);
  ctx.fillStyle = C.surface;
  ctx.fill();
  // 하단 팁 (아래 절반만 accent)
  ctx.save();
  capsulePath(ctx, cx, cy, w, h);
  ctx.clip();
  ctx.fillStyle = C.accent;
  ctx.fillRect(cx - w / 2, cy + h * 0.12, w, h);
  ctx.restore();
  // 보더
  capsulePath(ctx, cx, cy, w, h);
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
}

function spawnDebris(fx: Fx, st: Game2State, now: number) {
  const xr = st.dodger.x / st.config.fieldWidth;
  for (let i = 0; i < 6; i++) {
    fx.debris.push({
      xr,
      yr: st.config.dodgerY / st.config.fieldHeight,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -(0.15 + Math.random() * 0.35),
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 8,
      size: 8 + Math.random() * 10,
      bornAt: now,
    });
  }
}

const GAME2_CSS = `
.g2-wrap { position: absolute; inset: 0; }
.g2-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.g2-intro {
  position: absolute; inset: 0; z-index: 40;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; background: rgba(253, 246, 227, 0.9); text-align: center;
}
.g2-intro__roles { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; justify-content: center; }
.g2-intro__vs { font-family: var(--font-display); font-size: 28px; }
.g2-intro__num {
  font-family: var(--font-display); font-size: 140px; line-height: 1;
  animation: g2-num-in 160ms var(--ease-snap);
}
@keyframes g2-num-in { from { transform: scale(1.6); } to { transform: scale(1); } }
.g2-stamp-layer {
  position: absolute; inset: 0; z-index: 30; pointer-events: none;
  display: flex; align-items: center; justify-content: center;
}
@media (prefers-reduced-motion: reduce) {
  .g2-intro__num { animation: none; }
}
`;

export default function Game2() {
  useDebugScreen('scr-game2');
  const navigate = useNavigate();
  const flow = useFlow();

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  const stateRef = useRef<Game2State | null>(null);
  const inputsRef = useRef<Game2Inputs>(GAME2_IDLE_INPUTS);
  const queueRef = useRef<Game2Action[]>([]);
  const fxRef = useRef<Fx>(freshFx());
  const introStartRef = useRef(0);
  const lastTsRef = useRef(0);
  const reportedRef = useRef(false);
  const reportTimerRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);

  const [hudMs, setHudMs] = useState(() => getFlow().roundConfig.timePerRoundSec * 1000);
  const [pressed, setPressed] = useState<ReadonlySet<string>>(new Set());
  const [introCount, setIntroCount] = useState<number | null>(3);
  const [outcome, setOutcome] = useState<'hit' | 'survived' | null>(null);

  const active = flow.gameId === 2 && flow.phase !== 'idle';

  /** 라운드(재)시작 — 새 @shared state + 연출 리셋 + 3·2·1 인트로 */
  const startRound = useCallback(() => {
    const durationMs = getFlow().roundConfig.timePerRoundSec * 1000;
    stateRef.current = createGame2State({ roundDurationMs: durationMs }, Math.random);
    inputsRef.current = GAME2_IDLE_INPUTS;
    queueRef.current = [];
    fxRef.current = freshFx();
    reportedRef.current = false;
    introStartRef.current = performance.now();
    setIntroCount(3);
    setOutcome(null);
    setPressed(new Set());
    setHudMs(durationMs);
    setDebugGame(stateRef.current);
  }, []);

  // startOfflineGame/matchFound 없이 직접 URL 진입 → 메인으로
  useEffect(() => {
    if (!active) navigate('/', { replace: true });
  }, [active, navigate]);

  // 캔버스 리사이즈 (dpr 대응)
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      sizeRef.current = { w: r.width, h: r.height, dpr };
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // 키보드: playerL q/w → P1(TURN/FIRE 엣지), playerR u/i → P2(LEFT/RIGHT 레벨)
  useEffect(() => {
    if (getFlow().gameId !== 2 || getFlow().phase === 'idle') return;
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev: KeyInputEvent) => {
      const online = getFlow().mode === 'online';
      if (online && ev.player === 'P2') return; // 온라인: P2는 봇 소유
      const phys =
        ev.player === 'P1' ? (ev.key === 'key1' ? 'q' : 'w') : (ev.key === 'key1' ? 'u' : 'i');
      setPressed((prev) => {
        const n = new Set(prev);
        if (ev.phase === 'down') n.add(phys);
        else n.delete(phys);
        return n;
      });
      if (ev.player === 'P1') {
        if (ev.phase !== 'down') return; // P1은 엣지만
        queueRef.current.push({
          gameId: 2,
          player: 'P1',
          type: ev.key === 'key1' ? 'TURN' : 'FIRE',
        });
      } else {
        const type: Game2Action['type'] =
          ev.key === 'key1'
            ? ev.phase === 'down'
              ? 'LEFT_DOWN'
              : 'LEFT_UP'
            : ev.phase === 'down'
              ? 'RIGHT_DOWN'
              : 'RIGHT_UP';
        queueRef.current.push({ gameId: 2, player: 'P2', type });
      }
    });
    return detach;
  }, []);

  // 봇 (온라인 mock): 낙하 궤적 회피 + 랜덤 배회 — P2 액션을 큐에 밀어넣는다 (ARCHITECTURE §2.3)
  const botThink = useCallback((now: number, st: Game2State) => {
    const fx = fxRef.current;
    if (now < fx.botNextThinkAt) return; // 반응속도 ~90ms
    fx.botNextThinkAt = now + 90;
    const cfg = st.config;
    const d = st.dodger.x;
    let threat: { x: number; t: number } | null = null;
    for (const b of st.bullets) {
      if (b.vy <= 0) continue;
      const t = (cfg.dodgerY - b.y) / b.vy;
      if (t < 0 || t > 1.15) continue;
      const danger = cfg.dodgerHalfWidth + cfg.bulletRadius + 9;
      if (Math.abs(b.x - d) < danger && (threat === null || t < threat.t)) {
        threat = { x: b.x, t };
      }
    }
    let dir: -1 | 0 | 1;
    if (threat) {
      dir = d >= threat.x ? 1 : -1;
      if (dir === 1 && d > cfg.fieldWidth - 12) dir = -1; // 벽에 몰리면 반대로
      else if (dir === -1 && d < 12) dir = 1;
    } else {
      if (fx.botTargetX === null || now > fx.botRetargetAt || Math.abs(fx.botTargetX - d) < 2) {
        fx.botTargetX = 15 + Math.random() * (cfg.fieldWidth - 30);
        fx.botRetargetAt = now + 700 + Math.random() * 900;
      }
      dir = Math.abs(fx.botTargetX - d) < 2 ? 0 : fx.botTargetX > d ? 1 : -1;
    }
    if (dir !== fx.botDir) {
      const q = queueRef.current;
      if (fx.botDir === -1) q.push({ gameId: 2, player: 'P2', type: 'LEFT_UP' });
      if (fx.botDir === 1) q.push({ gameId: 2, player: 'P2', type: 'RIGHT_UP' });
      if (dir === -1) q.push({ gameId: 2, player: 'P2', type: 'LEFT_DOWN' });
      if (dir === 1) q.push({ gameId: 2, player: 'P2', type: 'RIGHT_DOWN' });
      fx.botDir = dir;
      setPressed((prev) => {
        const n = new Set(prev);
        if (dir === -1) n.add('u');
        else n.delete('u');
        if (dir === 1) n.add('i');
        else n.delete('i');
        return n;
      });
    }
  }, []);

  // 틱 간 연출 감지 (발사 반동 / CLOSE! / 라운드 확정)
  const detectFx = useCallback((prev: Game2State, next: Game2State, now: number) => {
    const fx = fxRef.current;
    if (next.nextBulletId > prev.nextBulletId) fx.firedAt = now; // 발사 → 반동+머즐
    const move = (inputsRef.current.p2Right ? 1 : 0) - (inputsRef.current.p2Left ? 1 : 0);
    fx.runnerLean = move as -1 | 0 | 1;

    if (next.result === null) {
      // CLOSE!: 피격 라인을 스친 비충돌 근접 총알 (§3.2)
      const cfg = next.config;
      const nearW = cfg.dodgerHalfWidth + cfg.bulletRadius;
      const byId = new Map(next.bullets.map((b) => [b.id, b]));
      for (const b of prev.bullets) {
        const nb = byId.get(b.id);
        if (!nb) continue;
        if (b.y < cfg.dodgerY && nb.y >= cfg.dodgerY) {
          const dist = Math.abs(nb.x - next.dodger.x);
          if (dist > nearW && dist < nearW + 9) fx.popups.push({ xr: nb.x / cfg.fieldWidth, bornAt: now });
        }
      }
      return;
    }

    // 라운드 확정 (충돌=P1_WIN / 타임아웃 생존=P2_WIN — 판정은 @shared)
    if (prev.result === null && !reportedRef.current) {
      reportedRef.current = true;
      if (next.result === 'P1_WIN') {
        fx.hitAt = now;
        fx.outcome = 'hit';
        setOutcome('hit');
        spawnDebris(fx, next, now);
      } else {
        fx.outcome = 'survived';
        setOutcome('survived');
      }
      const result = next.result;
      reportTimerRef.current = window.setTimeout(() => reportRoundEnd(result), REPORT_DELAY_MS);
    }
  }, []);

  // 캔버스 렌더 (매 프레임)
  const draw = useCallback((now: number) => {
    const canvas = canvasRef.current;
    const st = stateRef.current;
    if (!canvas || !st) return;
    const { w, h, dpr } = sizeRef.current;
    if (w < 2 || h < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fx = fxRef.current;
    const cfg = st.config;
    const px = (x: number) => (x / cfg.fieldWidth) * w;
    const py = (y: number) => (y / cfg.fieldHeight) * h;
    const laneH = h * 0.2; // 상단 1/5 P1 레인 (PLAN §2-S10)
    const hitLineY = h * 0.8; // 하단 1/5 P2 레인 시작 = 피격 라인

    // --- 배경: 중간 낙하 공간 (임박 5초 = highlight 옅은 톤 상승, §3.2) ---
    const urgent = st.result === null && st.view.remainingMs <= 5000;
    ctx.fillStyle = urgent ? C.bgUrgent : C.bg;
    ctx.fillRect(0, 0, w, h);

    // --- P1 레인 (블루 tint 띠 + 3px 하단 보더) ---
    ctx.fillStyle = C.p1t;
    ctx.fillRect(0, 0, w, laneH);
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, laneH - 3, w, 3);

    // --- P2 레인 (핑크 tint 띠, 생존 승리 시 핑크 점등) + 상단 해저드 피격 라인 ---
    ctx.fillStyle = fx.outcome === 'survived' ? C.p2 : C.p2t;
    ctx.fillRect(0, hitLineY, w, h - hitLineY);
    hazardBand(ctx, 0, hitLineY - 5, w, 10);

    // --- 레인 라벨 (장식) ---
    ctx.font = '700 10px "Space Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = C.p1;
    ctx.fillText('P1 TURRET LANE', 10, 8);
    ctx.fillStyle = fx.outcome === 'survived' ? C.surface : C.p2;
    ctx.fillText('P2 RUNNER LANE', 10, hitLineY + 10);

    // --- 총알 (캡슐 + 속도 비례 고스트 잔상, §3.2) ---
    const bw = Math.max(12, px(cfg.bulletRadius * 2));
    const bh = bw * 1.7;
    for (const b of st.bullets) {
      const bx = px(b.x);
      const by = py(b.y);
      const speedNorm = (b.vy - cfg.bulletSpeedMin) / Math.max(1, cfg.bulletSpeedMax - cfg.bulletSpeedMin);
      const ghosts = speedNorm > 0.66 ? 3 : speedNorm > 0.33 ? 2 : 1;
      for (let g = 1; g <= ghosts; g++) {
        ctx.globalAlpha = 0.18 / g;
        ctx.fillStyle = C.ink;
        ctx.fillRect(bx - bw / 2 + 2, by - g * (bh * 0.8) - bh * 0.25, bw - 4, bh * 0.5);
      }
      ctx.globalAlpha = 1;
      drawCapsule(ctx, bx, by, bw, bh);
    }

    // --- P1 포탑 (블루 사각 배지 + 총구 + 방향 + 반동/머즐 + 탄창 칩) ---
    {
      const ax = px(st.attacker.x);
      const aw = Math.max(48, px(cfg.attackerHalfWidth * 2));
      const th = 34;
      const recoil = !reducedMotionRef.current && now - fx.firedAt < 90 ? 4 : 0;
      const ty = py(cfg.attackerY) - recoil;
      ctx.fillStyle = C.ink;
      ctx.fillRect(ax - aw / 2 + 4, ty - th / 2 + 4, aw, th); // 하드섀도
      ctx.fillStyle = C.p1;
      ctx.fillRect(ax - aw / 2, ty - th / 2, aw, th);
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.ink;
      ctx.strokeRect(ax - aw / 2, ty - th / 2, aw, th);
      // 총구
      ctx.fillStyle = C.surface;
      ctx.fillRect(ax - 6, ty + th / 2, 12, 10);
      ctx.strokeRect(ax - 6, ty + th / 2, 12, 10);
      // 배지 텍스트 + 이동 방향
      ctx.fillStyle = C.surface;
      ctx.font = '700 14px "Space Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.attacker.dir === 1 ? 'P1 ▶' : '◀ P1', ax, ty + 1);
      // 머즐 플래시 (1~3프레임, 옐로 사각)
      if (now - fx.firedAt < 50) {
        ctx.fillStyle = C.highlight;
        ctx.fillRect(ax - 8, ty + th / 2 + 10, 16, 14);
        ctx.strokeRect(ax - 8, ty + th / 2 + 10, 16, 14);
      }
      // 탄창 칩 3개 (쿨다운 재장전 — 빈 보더→채움)
      const filled = Math.floor(st.view.fireReadyRatio * 3 + 1e-6);
      const chipsRight = ax + aw / 2 + 58 <= w;
      for (let i = 0; i < 3; i++) {
        const cx0 = chipsRight ? ax + aw / 2 + 10 + i * 16 : ax - aw / 2 - 22 - i * 16;
        ctx.fillStyle = i < filled ? C.accent : C.surface;
        ctx.fillRect(cx0, ty - 6, 12, 12);
        ctx.lineWidth = 2;
        ctx.strokeStyle = C.ink;
        ctx.strokeRect(cx0, ty - 6, 12, 12);
      }
      ctx.lineWidth = 3;
    }

    // --- P2 러너 (핑크 사각 배지, 이동 방향 기울임 §3.2 / 피격 시 파편으로 대체) ---
    if (fx.outcome !== 'hit') {
      const dx = px(st.dodger.x);
      const dw = Math.max(48, px(cfg.dodgerHalfWidth * 2));
      const dh = 30;
      const dy = py(cfg.dodgerY);
      ctx.save();
      ctx.translate(dx, dy);
      if (!reducedMotionRef.current) ctx.rotate(fx.runnerLean * 0.105); // ~6° 기울임
      ctx.fillStyle = C.ink;
      ctx.fillRect(-dw / 2 + 4, -dh / 2 + 4, dw, dh);
      ctx.fillStyle = C.p2;
      ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.ink;
      ctx.strokeRect(-dw / 2, -dh / 2, dw, dh);
      ctx.fillStyle = C.surface;
      ctx.font = '700 14px "Space Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('P2', 0, 1);
      ctx.restore();
      // 스피드 라인
      if (fx.runnerLean !== 0) {
        ctx.fillStyle = C.ink;
        const sx = dx - fx.runnerLean * (dw / 2 + 8);
        ctx.fillRect(sx - 10, dy - 8, 12, 3);
        ctx.fillRect(sx - 16, dy + 2, 18, 3);
      }
    }

    // --- CLOSE! 팝업 (0.4초, §3.2) ---
    fx.popups = fx.popups.filter((p) => now - p.bornAt < 400);
    for (const p of fx.popups) {
      ctx.save();
      ctx.translate(p.xr * w, hitLineY - 30);
      ctx.rotate(-0.14);
      ctx.fillStyle = C.surface;
      ctx.fillRect(-32, -12, 64, 22);
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.ink;
      ctx.strokeRect(-32, -12, 64, 22);
      ctx.fillStyle = C.error;
      ctx.font = '700 12px "Space Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CLOSE!', 0, 0);
      ctx.restore();
    }

    // --- 피격 파편 (사각 4~6개 + 하드섀도, §3.2) ---
    fx.debris = fx.debris.filter((d) => now - d.bornAt < 700);
    for (const d of fx.debris) {
      const t = (now - d.bornAt) / 1000;
      const x = (d.xr + d.vx * t) * w;
      const y = (d.yr + d.vy * t + 0.6 * t * t) * h;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(d.rot + d.vr * t);
      ctx.fillStyle = C.ink;
      ctx.fillRect(-d.size / 2 + 3, -d.size / 2 + 3, d.size, d.size);
      ctx.fillStyle = C.p2;
      ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.ink;
      ctx.strokeRect(-d.size / 2, -d.size / 2, d.size, d.size);
      ctx.restore();
    }

    // --- 피격 순간 1~2프레임 ink 반전 (§3.2, reduced-motion 시 생략) ---
    if (!reducedMotionRef.current && fx.hitAt > 0 && now - fx.hitAt < 60) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
    }
  }, []);

  // 메인 rAF 루프: 인트로 → (봇) → reduceGame2Inputs → tickGame2 → fx/debug/draw
  useEffect(() => {
    if (getFlow().gameId !== 2 || getFlow().phase === 'idle') return;
    startRound();
    let raf = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const st = stateRef.current;
      if (!st) return;
      const now = performance.now();
      const introElapsed = now - introStartRef.current;
      if (introElapsed < INTRO_MS) {
        setIntroCount(Math.max(1, 3 - Math.floor(introElapsed / 500)));
        lastTsRef.current = ts;
        draw(now);
        return;
      }
      setIntroCount(null);
      const dt = Math.min(100, Math.max(0, ts - lastTsRef.current));
      lastTsRef.current = ts;
      if (getFlow().mode === 'online' && st.result === null) botThink(now, st);
      const inputs = reduceGame2Inputs(inputsRef.current, queueRef.current);
      queueRef.current = [];
      inputsRef.current = inputs;
      const next = tickGame2(st, inputs, dt);
      detectFx(st, next, now);
      stateRef.current = next;
      setDebugGame(next); // 디버그 브리지 — 매 틱 갱신
      setHudMs(Math.ceil(next.view.remainingMs / 100) * 100);
      draw(now);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (reportTimerRef.current !== null) window.clearTimeout(reportTimerRef.current);
      setDebugGame(null);
    };
  }, [startRound, botThink, detectFx, draw]);

  if (!active) {
    return <div className="screen" data-testid="scr-game2" />;
  }

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const totalMs = flow.roundConfig.timePerRoundSec * 1000;
  const lastRound = flow.roundResults[flow.roundResults.length - 1];
  const matchWinner: PlayerRole | null =
    flow.matchResult === 'P1_WIN' ? 'P1' : flow.matchResult === 'P2_WIN' ? 'P2' : null;
  const backToMain = () => {
    exitMatch();
    navigate('/');
  };
  const isOnline = flow.mode === 'online';

  return (
    <div className="screen" data-testid="scr-game2">
      <style>{GAME2_CSS}</style>
      <HudFrame
        p1={players.P1}
        p2={players.P2}
        timeRemainingMs={hudMs}
        timeTotalMs={totalMs}
        roundWins={wins}
        roundCount={flow.roundConfig.roundCount}
        currentRound={flow.currentRound}
        onExit={backToMain}
        keyIcons={{ p1: ['⇄', '●'], p2: ['←', '→'] }}
        pressedKeys={pressed}
      >
        <div ref={wrapRef} className="g2-wrap">
          <canvas ref={canvasRef} className="g2-canvas" />
        </div>

        {/* 라운드 시작 3·2·1 + 역할 공개(코인토스 연출 대체) */}
        {introCount !== null && (
          <div className="g2-intro">
            <span className="label-caps">
              ROUND {flow.currentRound}/{flow.roundConfig.roundCount} — 총알 피하기
            </span>
            <div className="g2-intro__roles">
              <Sticker tilt={-4} bg="var(--p1-tint)">
                {players.P1.name} = 포탑 (Q ⇄ / W 발사)
              </Sticker>
              <span className="g2-intro__vs">VS</span>
              <Sticker tilt={4} bg="var(--p2-tint)">
                {players.P2.name} = 러너 {isOnline ? '(BOT)' : '(U ← / I →)'}
              </Sticker>
            </div>
            <span key={introCount} className="g2-intro__num">
              {introCount}
            </span>
          </div>
        )}

        {/* 판정 스탬프 (reportRoundEnd 지연 900ms 동안) */}
        {outcome !== null && flow.phase === 'playing' && (
          <div className="g2-stamp-layer">
            {outcome === 'hit' ? (
              <Stamp tone="error" tilt={-12}>
                HIT!
              </Stamp>
            ) : (
              <Stamp tone="p2" tilt={-8}>
                SURVIVED!
              </Stamp>
            )}
          </div>
        )}

        {flow.phase === 'round-result' && (
          <ResultOverlay
            kind="round"
            winner={lastRound?.winner ?? null}
            p1Name={players.P1.name}
            p2Name={players.P2.name}
            onNextRound={() => {
              nextRound();
              startRound();
            }}
            onBackToMain={backToMain}
          />
        )}
        {flow.phase === 'match-result' && (
          <ResultOverlay
            kind="match"
            winner={matchWinner}
            p1Name={players.P1.name}
            p2Name={players.P2.name}
            onBackToMain={backToMain}
          />
        )}
      </HudFrame>
    </div>
  );
}
