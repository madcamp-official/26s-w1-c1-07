/**
 * S10·S11 게임2 — 총알 피하기 (game2 에이전트 소유).
 * 컨테이너 testid: scr-game2 / 부품: game-stage, hud-*(HudFrame 내장), btn-exit
 *
 * 로직은 전부 @shared (createGame2State / tickGame2 / reduceGame2Inputs) — 재구현 없음.
 * 렌더는 canvas + requestAnimationFrame. 아트 디렉션은 PLAN §2-S10·11 + §3.2:
 *   상단 시안 P1 레일(포탑 + 탄약 램프 3개) / 하단 핑크 P2 레일(러너 + 잔상) /
 *   옐로 네온 트레이서 총알(속도 랜덤 ∝ 트레일 길이) / 피격 크로마틱+파편 / 생존 핑크 러쉬.
 *
 * 배선 (ARCHITECTURE §3.3):
 *   mount → idle이면 startOfflineGame(2) (direct-URL 복구)
 *   라운드마다 createGame2State({ roundDurationMs }, Math.random)
 *   rAF 루프 → tickGame2 → setDebugGame(state) 매 틱
 *   result 확정 → (650ms 피격/생존 연출 후) reportRoundEnd 1회 → <ResultOverlay />
 *   online 모드 → P2(회피자)는 봇 휴리스틱, 사람은 P1(q/w)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  attachKeyboardAdapter,
  createGame2State,
  DEFAULT_KEYBOARD_MAP,
  GAME2_IDLE_INPUTS,
  reduceGame2Inputs,
  tickGame2,
} from '@shared';
import type { Game2Action, Game2Inputs, Game2State } from '@shared';
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
import ResultOverlay from './ResultOverlay';
import './game2.css';

// ---------------------------------------------------------------------------
// 캔버스 상수 (논리 해상도 — CSS로 반응형 스케일)
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

/** 판정 → 결과 오버레이 전환 사이 인게임 연출 시간 (피격 파편/생존 러쉬) */
const RESULT_FX_MS = 650;

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
// 온라인 mock 봇 — P2(회피자) 휴리스틱. 판정 로직은 여전히 @shared 코어.
// ---------------------------------------------------------------------------

function computeBotDodger(s: Game2State): { left: boolean; right: boolean } {
  const cfg = s.config;
  const x = s.dodger.x;
  const danger = cfg.dodgerHalfWidth + cfg.bulletRadius;
  let threatX: number | null = null;
  let bestEta = Infinity;
  for (const b of s.bullets) {
    if (b.y > cfg.dodgerY) continue;
    const eta = (cfg.dodgerY - b.y) / b.vy; // sec
    if (eta > 1.3) continue; // 아직 여유 — 반응 지연으로 봇 난이도 완화
    if (Math.abs(b.x - x) < danger * 3 && eta < bestEta) {
      bestEta = eta;
      threatX = b.x;
    }
  }
  if (threatX !== null) {
    let dir: 1 | -1 = x <= threatX ? -1 : 1; // 총알 반대쪽으로
    const margin = cfg.dodgerHalfWidth + 2;
    // 벽에 몰리면 반대쪽으로 가로지른다
    if (dir === -1 && x - cfg.dodgerSpeed * Math.min(bestEta, 0.6) < margin) dir = 1;
    if (dir === 1 && x + cfg.dodgerSpeed * Math.min(bestEta, 0.6) > cfg.fieldWidth - margin)
      dir = -1;
    return { left: dir === -1, right: dir === 1 };
  }
  // 위협 없음 — 중앙 복귀 (데드존 ±8)
  const center = cfg.fieldWidth / 2;
  if (x < center - 8) return { left: false, right: true };
  if (x > center + 8) return { left: true, right: false };
  return { left: false, right: false };
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
  const cfg = s.config;
  const X = (u: number) => (u / cfg.fieldWidth) * CW;
  const Y = (u: number) => (u / cfg.fieldHeight) * CH;
  const railP1 = Y(cfg.attackerY);
  const railP2 = Y(cfg.dodgerY);
  const urgent = s.view.remainingMs <= 5000 && s.result === null;
  const hit = s.result === 'P1_WIN';
  const resultFx = fx.find((f) => f.kind === 'chroma' || f.kind === 'rush');
  const resultAge = resultFx ? now - resultFx.t : Infinity;

  // --- 필드 (딥퍼플 낙하 공간) ---
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  // 옅은 세로 그리드 — 임박 시 핑크 톤 + 상승 스캔 (PLAN §3.2)
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

  // --- 총알: 옐로 네온 트레이서 (속도 랜덤 ∝ 트레일 길이 — 행19 즉독) ---
  for (const b of s.bullets) {
    const bx = X(b.x);
    const by = Y(b.y);
    if (by < railP1 - 4) continue;
    const trailLen = Y(b.vy * 0.3); // 0.3초 분량의 낙하 거리
    const topY = Math.max(railP1, by - trailLen);
    ctx.save();
    const grad = ctx.createLinearGradient(bx, topY, bx, by);
    grad.addColorStop(0, 'rgba(253,245,0,0)');
    grad.addColorStop(1, 'rgba(253,245,0,0.75)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx, topY);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // 코어 도트 + 글로우
    ctx.shadowColor = COL.accent;
    ctx.shadowBlur = 12;
    ctx.fillStyle = COL.accent;
    ctx.beginPath();
    ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- P1 포탑 (시안, 자동 왕복 + 방향 즉독) ---
  const ax = X(s.attacker.x);
  const muzzle = fx.find((f) => f.kind === 'muzzle');
  const recoil = muzzle && now - muzzle.t < 90 ? -3 : 0; // 발사 1프레임 반동
  const tw = X(cfg.attackerHalfWidth); // 히트박스 반폭 그대로 — 정직한 크기
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
  ctx.fillText(s.attacker.dir === 1 ? '▶' : '◀', s.attacker.dir === 1 ? tw + 14 : -tw - 14, 2);
  // P1 배지 (+ 온라인이면 YOU 점멸)
  ctx.font = `10px ${ARCADE_FONT}`;
  ctx.fillText('P1', 0, -18);
  if (p1IsYou && Math.floor(now / 500) % 2 === 0) {
    ctx.fillStyle = COL.accent;
    ctx.fillText('YOU', 0, -32);
  }
  ctx.restore();

  // --- 탄약 램프 3개 (장전/쿨다운 표시 — PLAN §2-S10·11, SPEC QA-S10-06) ---
  const reload = fx.find((f) => f.kind === 'reload');
  const flicker = reload && now - reload.t < 160 && Math.floor(now / 40) % 2 === 0;
  const lit = flicker ? 0 : Math.floor(s.view.fireReadyRatio * 3 + 1e-6);
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

  // --- P2 러너 (핑크) + 이동 잔상 — 피격 직후에는 파편으로 대체 ---
  const dx = X(s.dodger.x);
  const rw = X(cfg.dodgerHalfWidth);
  if (!(hit && resultAge < RESULT_FX_MS + 400)) {
    ctx.save();
    for (const tr of trail) {
      const age = now - tr.t;
      if (age > 240) continue;
      ctx.globalAlpha = age < 120 ? 0.22 : 0.1; // 투명도 계단 잔상 (§3.2)
      ctx.fillStyle = COL.p2;
      ctx.fillRect(X(tr.x) - rw, railP2 - 7, rw * 2, 12);
    }
    ctx.restore();
    ctx.save();
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
      // 시안 머즐 스파크 (십자 광점, §3.2)
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
      // 픽셀 파편 6개 방사 (피격, §3.2)
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

  // --- 피격 순간 크로마틱 어버레이션 (승패 순간에만 — §1.4) ---
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
// 컴포넌트
// ---------------------------------------------------------------------------

export default function Game2() {
  useDebugScreen('scr-game2');
  const flow = useFlow();
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<Game2State | null>(null);
  const inputsRef = useRef<Game2Inputs>({ ...GAME2_IDLE_INPUTS });
  const pendingRef = useRef<Game2Action[]>([]);
  const fxRef = useRef<Fx[]>([]);
  const trailRef = useRef<Trail[]>([]);
  const reportedRef = useRef(false);
  const resultAtRef = useRef(0);

  /** HUD 표시용 남은 시간 (초 단위 양자화 — 리렌더 절약) */
  const [hudMs, setHudMs] = useState(flow.roundConfig.timePerRoundSec * 1000);

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

  // 캔버스 해상도 초기화 (dpr 스케일)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // 키보드 — @shared 어댑터 + 기본 키맵 (playerL q/w = P1, playerR u/i = P2)
  useEffect(() => {
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      const online = getFlow().mode === 'online';
      if (ev.player === 'P1') {
        if (ev.phase !== 'down') return; // P1은 엣지 트리거
        if (ev.key === 'key1') {
          pendingRef.current.push({ gameId: 2, player: 'P1', type: 'TURN' });
          flashQ();
        } else {
          pendingRef.current.push({ gameId: 2, player: 'P1', type: 'FIRE' });
          flashW();
        }
      } else {
        if (online) return; // 온라인 mock: P2(회피자)는 봇이 대행
        const down = ev.phase === 'down';
        if (ev.key === 'key1') {
          pendingRef.current.push({
            gameId: 2,
            player: 'P2',
            type: down ? 'LEFT_DOWN' : 'LEFT_UP',
          });
          if (down) flashU();
        } else {
          pendingRef.current.push({
            gameId: 2,
            player: 'P2',
            type: down ? 'RIGHT_DOWN' : 'RIGHT_UP',
          });
          if (down) flashI();
        }
      }
    });
    return detach;
  }, [flashQ, flashW, flashU, flashI]);

  // 라운드 수명주기: state 생성 → rAF 루프(tick+draw) → 결과 보고
  useEffect(() => {
    if (flow.gameId !== 2 || flow.phase !== 'playing') return;

    const st = createGame2State(
      { roundDurationMs: flow.roundConfig.timePerRoundSec * 1000 },
      Math.random,
    );
    stateRef.current = st;
    inputsRef.current = { ...GAME2_IDLE_INPUTS };
    pendingRef.current = [];
    fxRef.current = [];
    trailRef.current = [];
    reportedRef.current = false;
    resultAtRef.current = 0;
    setDebugGame(st);
    setHudMs(st.view.remainingMs);

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - last);
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        let inputs = reduceGame2Inputs(inputsRef.current, pendingRef.current);
        pendingRef.current = [];
        if (getFlow().mode === 'online') {
          const bot = computeBotDodger(s);
          inputs = { ...inputs, p2Left: bot.left, p2Right: bot.right };
        }
        inputsRef.current = inputs;
        const prev = s;
        s = tickGame2(prev, inputs, dt);
        stateRef.current = s;
        setDebugGame(s); // 디버그 브리지 — 매 틱 갱신
        setHudMs(Math.ceil(s.view.remainingMs / 1000) * 1000);

        // ---- 렌더 전용 이펙트 파생 (로직 비침범) ----
        // 발사: 쿨다운이 다시 차오른 순간
        if (s.attacker.cooldownMs > prev.attacker.cooldownMs) {
          fxRef.current.push({ kind: 'muzzle', x: s.attacker.x, y: s.config.attackerY, t: now });
        }
        // 장전 완료 순간 짧은 플리커 (§3.2)
        if (prev.view.fireReadyRatio < 1 && s.view.fireReadyRatio >= 1) {
          fxRef.current.push({ kind: 'reload', t: now });
        }
        // 러너 잔상
        if (s.dodger.x !== prev.dodger.x) {
          trailRef.current.push({ x: prev.dodger.x, t: now });
        }
        trailRef.current = trailRef.current.filter((tr) => now - tr.t < 260);
        // 근접 회피 "CLOSE!" — 이번 틱에 피격 라인을 스친 총알 (피격이면 생략)
        if (s.result === null) {
          const closeDist = (s.config.dodgerHalfWidth + s.config.bulletRadius) * 2.4;
          for (const b of s.bullets) {
            const pb = prev.bullets.find((x) => x.id === b.id);
            if (!pb) continue;
            if (pb.y < s.config.dodgerY && b.y >= s.config.dodgerY) {
              if (Math.abs(b.x - s.dodger.x) <= closeDist) {
                fxRef.current.push({
                  kind: 'caption',
                  text: 'CLOSE!',
                  color: COL.p1,
                  x: b.x,
                  y: s.config.dodgerY - 8,
                  t: now,
                  life: 400,
                });
              }
            }
          }
        }
        // 판정 순간 이펙트 (글리치는 승패 순간에만 — §1.4)
        if (s.result !== null && resultAtRef.current === 0) {
          resultAtRef.current = now;
          if (s.result === 'P1_WIN') {
            fxRef.current.push(
              { kind: 'chroma', t: now },
              { kind: 'shards', x: s.dodger.x, y: s.config.dodgerY, t: now },
              {
                kind: 'caption',
                text: 'HIT!',
                color: COL.p2,
                x: s.dodger.x,
                y: s.config.dodgerY - 10,
                t: now,
                life: RESULT_FX_MS,
              },
            );
          } else {
            fxRef.current.push(
              { kind: 'rush', t: now },
              {
                kind: 'caption',
                text: 'SURVIVED!',
                color: COL.p2,
                x: s.config.fieldWidth / 2,
                y: s.config.dodgerY - 12,
                t: now,
                life: RESULT_FX_MS,
              },
            );
          }
        }
      } else if (!reportedRef.current && now - resultAtRef.current >= RESULT_FX_MS) {
        // 피격/생존 연출을 짧게 보여준 뒤 라운드 종료 1회 보고 → ResultOverlay
        reportedRef.current = true;
        reportRoundEnd(s.result);
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        const p1IsYou = getPlayerDisplays(getFlow()).P1.isYou;
        fxRef.current = fxRef.current.filter((f) => now - f.t < 1200); // 만료 이펙트 정리
        drawScene(ctx, s, fxRef.current, trailRef.current, now, p1IsYou);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [flow.gameId, flow.phase, flow.currentRound, flow.roundConfig.timePerRoundSec]);

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
        <span className="g2-title font-arcade c-muted">GAME 2 — 총알 피하기</span>
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
        <canvas ref={canvasRef} className="g2-canvas" aria-label="게임2 스테이지 — 총알 피하기" />
        {flow.phase === 'playing' && flow.currentRound > 0 && (
          <div key={flow.currentRound} className="g2-round-intro" aria-hidden>
            <span className="font-arcade c-accent glow-text g2-round-intro__big">
              ROUND {flow.currentRound}
            </span>
            <span className="font-arcade c-muted g2-round-intro__sub">DODGE THE TRACERS</span>
          </div>
        )}
      </div>

      {/* 온스크린 키캡 — 실제 배정 키 표기 (SPEC Q2), 입력 순간 램프 점등 (§1.4) */}
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

      <ResultOverlay />
    </main>
  );
}
