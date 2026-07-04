/**
 * S10·S11 게임2 — 총알 피하기 (scr-game2, 로컬 한 화면). 소유: game2 에이전트.
 * SPEC S10·S11 + PLAN §2.S10/§3.2 "빛의 그물" 참조.
 *
 * 로직: @shared의 createGame2State / tickGame2 / reduceGame2Inputs — 재구현 금지.
 *   roundDurationMs = settings.timePerRoundSec * 1000 (QA-S4-06).
 * 렌더: canvas + requestAnimationFrame (고정 50ms 틱 accumulator).
 * 역할: P1(시안)=상단 트랙 공격자(자동 왕복, q반전/w발사) /
 *       P2(마젠타)=하단 트랙 회피자(u←/i→). 피격=P1 승, 시간 종료 생존=P2 승.
 * 온라인(mock): 매치 시작 시 코인토스로 내가 P1 또는 P2 — 남은 역할은 봇이 조종.
 * 필요 testid: hud-countdown, hud-profile-p1, hud-profile-p2, game-stage,
 *              result-overlay, result-text, btn-next-round, btn-back-main, btn-exit
 * 마운트: ensureMatch(2). 매 틱 reportGame(state), 언마운트 reportGame(null).
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
  type Game2Action,
  type Game2Inputs,
  type Game2State,
  type MatchResult,
  type PlayerRole,
} from '@shared';
import { reportGame, useScreenBridge } from '../../debug';
import {
  beginNextRound,
  ensureMatch,
  getFlow,
  getScore,
  reportRoundResult,
  resetFlow,
  useFlow,
} from '../../state/flow';
import { useSession } from '../../state/session';
import { Button, KeyCap, PlayerBadge } from '../../components';
import { ResultOverlay } from './ResultOverlay';

// 진영색 (theme.css --p1/--p2와 동일 hex — canvas는 CSS 변수를 못 읽는다)
const P1C = '#00f0ff';
const P2C = '#ff3358';

type Phase = 'countdown' | 'playing' | 'hitfx' | 'result';

/** 실제 배정 키 표기 (SPEC Q2 — 키맵에서 유도) */
const KEY_LABEL = {
  P1: {
    key1: DEFAULT_KEYBOARD_MAP.playerL.key1.toUpperCase(), // Q = 방향 반전
    key2: DEFAULT_KEYBOARD_MAP.playerL.key2.toUpperCase(), // W = 발사
  },
  P2: {
    key1: DEFAULT_KEYBOARD_MAP.playerR.key1.toUpperCase(), // U = ←
    key2: DEFAULT_KEYBOARD_MAP.playerR.key2.toUpperCase(), // I = →
  },
} as const;

const act = (player: PlayerRole, type: Game2Action['type']): Game2Action => ({
  gameId: 2,
  player,
  type,
});

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

interface OverlayInfo {
  roundWinner: PlayerRole | null;
  matchResult: MatchResult | null;
}

export default function Game2() {
  useScreenBridge('scr-game2');
  const navigate = useNavigate();
  const flow = useFlow();
  const session = useSession();

  // --- 매치 컨텍스트 -------------------------------------------------------
  const online = flow.mode === 'online';
  /** 온라인 코인토스: 내가 P1(공격) 또는 P2(회피) — 매치(마운트) 단위 고정 */
  const humanRoleRef = useRef<PlayerRole>(Math.random() < 0.5 ? 'P1' : 'P2');
  const humanRole = humanRoleRef.current;
  const botRole: PlayerRole | null = online ? (humanRole === 'P1' ? 'P2' : 'P1') : null;
  const botRoleRef = useRef<PlayerRole | null>(botRole);
  botRoleRef.current = botRole;

  const myName = session.user?.nickname ?? 'PLAYER';
  const botName = flow.opponent?.nickname ?? 'BOT';
  const p1Name = online ? (humanRole === 'P1' ? myName : botName) : 'PLAYER 1';
  const p2Name = online ? (humanRole === 'P2' ? myName : botName) : 'PLAYER 2';

  const settings = flow.settings;
  const roundIndex = flow.roundIndex;
  const score = getScore(flow.roundResults);

  // --- 라운드/연출 상태 ----------------------------------------------------
  const [phase, setPhase] = useState<Phase>('countdown');
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const [count, setCount] = useState(3);
  const [secondsLeft, setSecondsLeft] = useState(settings.timePerRoundSec);
  const secondsRef = useRef(secondsLeft);
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const [overlay, setOverlay] = useState<OverlayInfo | null>(null);

  // --- 시뮬레이션/연출 refs -------------------------------------------------
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gaugeRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<Game2State | null>(null);
  const inputsRef = useRef<Game2Inputs>({ ...GAME2_IDLE_INPUTS });
  const pendingRef = useRef<Game2Action[]>([]);
  const trailsRef = useRef<Map<number, { x: number; y: number }[]>>(new Map());
  const dodgerTrailRef = useRef<{ x: number; t: number }[]>([]);
  const muzzleRef = useRef<{ x: number; t: number } | null>(null);
  const hitRef = useRef<{ x: number; start: number } | null>(null);
  const closeCallsRef = useRef<{ x: number; t: number }[]>([]);
  const closeCallSeenRef = useRef<Set<number>>(new Set());
  const botHoldRef = useRef<-1 | 0 | 1>(0);
  const reportedRef = useRef(false);
  const hitTimeoutRef = useRef<number | null>(null);

  // --- 라운드 시작 ----------------------------------------------------------
  const startRound = useCallback(() => {
    const cfg = getFlow().settings;
    stateRef.current = createGame2State(
      { roundDurationMs: cfg.timePerRoundSec * 1000 },
      Math.random,
    );
    reportGame(stateRef.current);
    inputsRef.current = { ...GAME2_IDLE_INPUTS };
    pendingRef.current = [];
    trailsRef.current = new Map();
    dodgerTrailRef.current = [];
    muzzleRef.current = null;
    hitRef.current = null;
    closeCallsRef.current = [];
    closeCallSeenRef.current = new Set();
    botHoldRef.current = 0;
    reportedRef.current = false;
    secondsRef.current = cfg.timePerRoundSec;
    setSecondsLeft(cfg.timePerRoundSec);
    setOverlay(null);
    setCount(3);
    setPhase('countdown');
  }, []);

  // --- 이탈 -----------------------------------------------------------------
  const exit = useCallback(() => {
    if (hitTimeoutRef.current !== null) {
      window.clearTimeout(hitTimeoutRef.current);
      hitTimeoutRef.current = null;
    }
    resetFlow();
    navigate('/');
  }, [navigate]);

  // --- 마운트: 매치 가드 + 첫 라운드 ----------------------------------------
  useEffect(() => {
    ensureMatch(2);
    startRound();
    return () => {
      if (hitTimeoutRef.current !== null) window.clearTimeout(hitTimeoutRef.current);
      reportGame(null);
    };
  }, [startRound]);

  // --- 시작 카운트다운 3·2·1 -------------------------------------------------
  useEffect(() => {
    if (phase !== 'countdown') return;
    const t = window.setTimeout(() => {
      if (count > 1) setCount(count - 1);
      else setPhase('playing');
    }, 800);
    return () => window.clearTimeout(t);
  }, [phase, count]);

  // --- 키보드 (q/w vs u/i) ----------------------------------------------------
  useEffect(() => {
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      const label = KEY_LABEL[ev.player][ev.key];
      setPressed((p) => (p[label] === (ev.phase === 'down') ? p : { ...p, [label]: ev.phase === 'down' }));
      if (botRoleRef.current === ev.player) return; // 봇 소유 역할 — 사람 입력 무시
      if (phaseRef.current !== 'playing') return;
      if (ev.player === 'P1') {
        if (ev.phase === 'down') pendingRef.current.push(act('P1', ev.key === 'key1' ? 'TURN' : 'FIRE'));
      } else if (ev.key === 'key1') {
        pendingRef.current.push(act('P2', ev.phase === 'down' ? 'LEFT_DOWN' : 'LEFT_UP'));
      } else {
        pendingRef.current.push(act('P2', ev.phase === 'down' ? 'RIGHT_DOWN' : 'RIGHT_UP'));
      }
    });
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exit();
    };
    window.addEventListener('keydown', onEsc);
    return () => {
      detach();
      window.removeEventListener('keydown', onEsc);
    };
  }, [exit]);

  // --- 봇 (온라인 mock 상대) --------------------------------------------------
  useEffect(() => {
    if (phase !== 'playing' || botRole === null) return;

    const setBotHold = (desired: -1 | 0 | 1) => {
      const cur = botHoldRef.current;
      if (cur === desired) return;
      if (cur === -1) pendingRef.current.push(act('P2', 'LEFT_UP'));
      if (cur === 1) pendingRef.current.push(act('P2', 'RIGHT_UP'));
      if (desired === -1) pendingRef.current.push(act('P2', 'LEFT_DOWN'));
      if (desired === 1) pendingRef.current.push(act('P2', 'RIGHT_DOWN'));
      botHoldRef.current = desired;
      setPressed((p) => ({
        ...p,
        [KEY_LABEL.P2.key1]: desired === -1,
        [KEY_LABEL.P2.key2]: desired === 1,
      }));
    };
    const flash = (label: string) => {
      setPressed((p) => ({ ...p, [label]: true }));
      window.setTimeout(() => setPressed((p) => ({ ...p, [label]: false })), 140);
    };

    const iv = window.setInterval(() => {
      const s = stateRef.current;
      if (!s || s.result !== null) return;
      const cfg = s.config;
      if (botRole === 'P2') {
        // 회피 봇: 위협 총알에서 멀어지고, 평시엔 공격자 바로 아래를 피한다
        let desired: -1 | 0 | 1 = 0;
        let threatX: number | null = null;
        let bestT = Infinity;
        const dangerW = cfg.dodgerHalfWidth + cfg.bulletRadius + 7;
        for (const b of s.bullets) {
          if (b.y > cfg.dodgerY) continue;
          const t = (cfg.dodgerY - b.y) / b.vy;
          if (t > 1.2) continue;
          if (Math.abs(b.x - s.dodger.x) < dangerW && t < bestT) {
            bestT = t;
            threatX = b.x;
          }
        }
        if (threatX !== null) {
          desired = s.dodger.x >= threatX ? 1 : -1;
        } else {
          const dx = s.dodger.x - s.attacker.x;
          if (Math.abs(dx) < 18) desired = dx >= 0 ? 1 : -1;
        }
        if (desired === 1 && s.dodger.x > cfg.fieldWidth - cfg.dodgerHalfWidth - 4) desired = -1;
        else if (desired === -1 && s.dodger.x < cfg.dodgerHalfWidth + 4) desired = 1;
        setBotHold(desired);
      } else {
        // 공격 봇: 회피자 위에서 발사, 멀어지면 가끔 방향 반전
        const dx = s.attacker.x - s.dodger.x;
        const ready = s.attacker.cooldownMs <= 0;
        if (ready && Math.abs(dx) < 12 && Math.random() < 0.75) {
          pendingRef.current.push(act('P1', 'FIRE'));
          flash(KEY_LABEL.P1.key2);
        } else if (Math.abs(dx) > 30) {
          const movingToward = (s.dodger.x - s.attacker.x) * s.attacker.dir > 0;
          if (!movingToward && Math.random() < 0.4) {
            pendingRef.current.push(act('P1', 'TURN'));
            flash(KEY_LABEL.P1.key1);
          }
        } else if (ready && Math.random() < 0.08) {
          pendingRef.current.push(act('P1', 'FIRE')); // 견제 사격
          flash(KEY_LABEL.P1.key2);
        }
      }
    }, 120);
    return () => window.clearInterval(iv);
  }, [phase, botRole]);

  // --- 라운드 종료 처리 --------------------------------------------------------
  const finishRound = useCallback((winner: PlayerRole | null) => {
    hitTimeoutRef.current = null;
    const report = reportRoundResult(winner);
    setOverlay({ roundWinner: winner, matchResult: report.matchResult });
    setPhase('result');
  }, []);

  // --- 메인 루프: 고정 50ms 틱 + canvas 렌더 -----------------------------------
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'hitfx') return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const afterTick = (prev: Game2State, next: Game2State, now: number) => {
      const cfg = next.config;
      // 총알 트레일 (6~8프레임 잔상)
      const alive = new Set<number>();
      for (const b of next.bullets) {
        alive.add(b.id);
        const hist = trailsRef.current.get(b.id) ?? [];
        hist.push({ x: b.x, y: b.y });
        if (hist.length > 8) hist.shift();
        trailsRef.current.set(b.id, hist);
      }
      for (const id of trailsRef.current.keys()) if (!alive.has(id)) trailsRef.current.delete(id);
      // 발사 감지 → 머즐 글로우 + 레일 반동
      if (next.nextBulletId > prev.nextBulletId) muzzleRef.current = { x: next.attacker.x, t: now };
      // 회피자 대시 트레일
      if (next.dodger.x !== prev.dodger.x) {
        dodgerTrailRef.current.push({ x: prev.dodger.x, t: now });
        if (dodgerTrailRef.current.length > 12) dodgerTrailRef.current.shift();
      }
      // CLOSE CALL — 트랙을 스쳤지만 빗나간 총알 (연출 전용, 점수 개입 없음)
      if (next.result === null) {
        const hitW = cfg.dodgerHalfWidth + cfg.bulletRadius;
        for (const b of prev.bullets) {
          if (closeCallSeenRef.current.has(b.id)) continue;
          const nb = next.bullets.find((n) => n.id === b.id);
          if (!nb) continue;
          const crossed =
            b.y - cfg.bulletRadius <= cfg.dodgerY && nb.y + cfg.bulletRadius >= cfg.dodgerY;
          if (!crossed) continue;
          closeCallSeenRef.current.add(b.id);
          const dx = Math.abs(nb.x - next.dodger.x);
          if (dx > hitW && dx <= hitW + 7) closeCallsRef.current.push({ x: nb.x, t: now });
        }
      }
    };

    const syncHud = (s: Game2State) => {
      const sec = Math.ceil(s.view.remainingMs / 1000);
      if (sec !== secondsRef.current) {
        secondsRef.current = sec;
        setSecondsLeft(sec);
      }
      const g = gaugeRef.current;
      if (g) {
        g.style.width = `${Math.round(s.view.fireReadyRatio * 100)}%`;
        g.style.opacity = s.view.fireReadyRatio >= 1 ? '1' : '0.45';
      }
    };

    const draw = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const s = stateRef.current;
      if (!s) return;
      const cfg = s.config;
      const padX = 30;
      const padTop = 46;
      const padBot = 52;
      const sx = (w - padX * 2) / cfg.fieldWidth;
      const X = (u: number) => padX + u * sx;
      const Y = (v: number) => padTop + (v / cfg.fieldHeight) * (h - padTop - padBot);

      const muzzleAge = muzzleRef.current ? now - muzzleRef.current.t : Infinity;
      // 트랙 레일 (발사 반동 시 1px 흔들림)
      const jitter = muzzleAge < 120 ? (Math.random() - 0.5) * 2 : 0;
      const y1 = Y(cfg.attackerY) + jitter;
      const y2 = Y(cfg.dodgerY);
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,240,255,.5)';
      ctx.shadowColor = P1C;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(padX, y1);
      ctx.lineTo(w - padX, y1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,51,88,.5)';
      ctx.shadowColor = P2C;
      ctx.beginPath();
      ctx.moveTo(padX, y2);
      ctx.lineTo(w - padX, y2);
      ctx.stroke();
      ctx.restore();

      // 회피자 대시 트레일
      dodgerTrailRef.current = dodgerTrailRef.current.filter((d) => now - d.t <= 280);
      for (const d of dodgerTrailRef.current) {
        const age = now - d.t;
        ctx.save();
        ctx.globalAlpha = 0.22 * (1 - age / 280);
        ctx.fillStyle = P2C;
        ctx.beginPath();
        ctx.roundRect(X(d.x) - cfg.dodgerHalfWidth * sx, y2 - 5, cfg.dodgerHalfWidth * 2 * sx, 10, 5);
        ctx.fill();
        ctx.restore();
      }

      // 총알: 광선 궤적 트레일 + 광탄(백색 코어 + 진영색 외광)
      for (const b of s.bullets) {
        const hist = trailsRef.current.get(b.id) ?? [];
        ctx.save();
        ctx.strokeStyle = P1C;
        ctx.lineCap = 'round';
        for (let i = 1; i < hist.length; i++) {
          ctx.globalAlpha = 0.28 * (i / hist.length);
          ctx.lineWidth = 1 + 2 * (i / hist.length);
          ctx.beginPath();
          ctx.moveTo(X(hist[i - 1].x), Y(hist[i - 1].y));
          ctx.lineTo(X(hist[i].x), Y(hist[i].y));
          ctx.stroke();
        }
        ctx.restore();
        ctx.save();
        ctx.shadowColor = P1C;
        ctx.shadowBlur = 12;
        ctx.fillStyle = P1C;
        ctx.beginPath();
        ctx.roundRect(X(b.x) - 2.5, Y(b.y) - 7, 5, 14, 2.5);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(X(b.x), Y(b.y) + 3, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // P1 공격자 — 헥사곤 코어 + 글로우 + 방향 셰브론 + 장전 핍
      const ax = X(s.attacker.x);
      ctx.save();
      ctx.shadowColor = P1C;
      ctx.shadowBlur = 18;
      ctx.fillStyle = P1C;
      hexPath(ctx, ax, y1, 11);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ax, y1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,240,255,.8)';
      ctx.lineWidth = 1.5;
      const dir = s.attacker.dir;
      ctx.beginPath();
      ctx.moveTo(ax + dir * 17, y1 - 5);
      ctx.lineTo(ax + dir * 23, y1);
      ctx.lineTo(ax + dir * 17, y1 + 5);
      ctx.stroke();
      // 장전(쿨다운) 핍: dim → 발광으로 차오름
      const ready = s.view.fireReadyRatio;
      ctx.strokeStyle = 'rgba(0,240,255,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(ax - 3.5, y1 - 32, 7, 14, 3.5);
      ctx.stroke();
      const fh = 14 * ready;
      if (fh > 0.5) {
        ctx.fillStyle = P1C;
        ctx.shadowColor = P1C;
        ctx.shadowBlur = ready >= 1 ? 8 : 0;
        ctx.globalAlpha = 0.35 + 0.65 * ready;
        ctx.beginPath();
        ctx.roundRect(ax - 3.5, y1 - 32 + (14 - fh), 7, fh, 3);
        ctx.fill();
      }
      ctx.restore();

      // 머즐 글로우
      if (muzzleRef.current && muzzleAge < 160) {
        const p = muzzleAge / 160;
        ctx.save();
        ctx.globalAlpha = 0.8 * (1 - p);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = P1C;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(X(muzzleRef.current.x), y1 + 9, 4 + p * 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // P2 회피자 — 마젠타 광점 캡슐 (실제 히트박스 폭)
      const dxp = X(s.dodger.x);
      const dw = cfg.dodgerHalfWidth * 2 * sx;
      ctx.save();
      ctx.shadowColor = P2C;
      ctx.shadowBlur = 16;
      ctx.fillStyle = P2C;
      ctx.beginPath();
      ctx.roundRect(dxp - dw / 2, y2 - 6, dw, 12, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(dxp, y2, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // CLOSE CALL 라벨 (근접 회피 연출)
      closeCallsRef.current = closeCallsRef.current.filter((c) => now - c.t <= 800);
      for (const c of closeCallsRef.current) {
        const age = now - c.t;
        ctx.save();
        ctx.globalAlpha = 1 - age / 800;
        ctx.font = 'italic 700 11px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#eaf0f8';
        ctx.shadowColor = P1C;
        ctx.shadowBlur = 8;
        ctx.fillText('CLOSE CALL', X(c.x), y2 - 20 - age / 50);
        ctx.restore();
      }

      // 피격 링 확산 + 마젠타 워시 (hitfx)
      if (hitRef.current) {
        const p = Math.min(1, (now - hitRef.current.start) / 700);
        const hx = X(hitRef.current.x);
        ctx.save();
        ctx.globalAlpha = 0.1 * p;
        ctx.fillStyle = P2C;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = P2C;
        ctx.lineWidth = 2;
        ctx.shadowColor = P2C;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(hx, y2, 8 + p * 90, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.7 * (1 - p);
        ctx.strokeStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(hx, y2, (8 + p * 90) * 0.62, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    };

    const loop = (now: number) => {
      if (phaseRef.current === 'playing') {
        acc += Math.min(200, now - last);
        let s = stateRef.current;
        if (s) {
          while (acc >= GAME2_TICK_MS) {
            const actions = pendingRef.current;
            pendingRef.current = [];
            const inputs = reduceGame2Inputs(inputsRef.current, actions);
            inputsRef.current = inputs;
            const prev = s;
            s = tickGame2(s, inputs, GAME2_TICK_MS);
            acc -= GAME2_TICK_MS;
            afterTick(prev, s, now);
            if (s.result !== null) break;
          }
          stateRef.current = s;
          reportGame(s);
          syncHud(s);
          if (s.result !== null && !reportedRef.current) {
            reportedRef.current = true;
            const winner: PlayerRole | null =
              s.result === 'P1_WIN' ? 'P1' : s.result === 'P2_WIN' ? 'P2' : null;
            if (s.result === 'P1_WIN') {
              // 피격: 링 확산 연출 후 결과 오버레이 (PLAN §3.2 슬로모션 컨셉)
              hitRef.current = { x: s.dodger.x, start: now };
              setPhase('hitfx');
              hitTimeoutRef.current = window.setTimeout(() => finishRound(winner), 700);
            } else {
              finishRound(winner);
            }
          }
        }
      }
      last = now;
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, finishRound]);

  // --- 파생 표시값 -------------------------------------------------------------
  const danger = phase === 'playing' && secondsLeft <= 5;
  const youChip = (role: PlayerRole) =>
    online ? (
      humanRole === role ? (
        <span className={`chip chip--${role === 'P1' ? 'p1' : 'p2'}`}>YOU</span>
      ) : (
        <span className="chip">BOT</span>
      )
    ) : null;

  return (
    <div className="screen" data-testid="scr-game2">
      {/* 상단 HUD 바 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 16,
          padding: '12px 24px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ justifySelf: 'start' }}>
          <PlayerBadge
            side="p1"
            name={p1Name}
            you={online && humanRole === 'P1'}
            wins={score.p1Wins}
            totalRounds={settings.roundCount}
            testId="hud-profile-p1"
          />
        </div>
        <div style={{ textAlign: 'center', minWidth: 140 }}>
          <div className="overline">
            ROUND {roundIndex + 1} / {settings.roundCount}
          </div>
          <div
            key={secondsLeft}
            data-testid="hud-countdown"
            className="num count-pop"
            style={{
              fontSize: 38,
              fontWeight: 800,
              lineHeight: 1.15,
              color: danger ? 'var(--p2)' : 'var(--text-hi)',
            }}
          >
            {secondsLeft}
          </div>
        </div>
        <div style={{ justifySelf: 'end' }}>
          <PlayerBadge
            side="p2"
            name={p2Name}
            you={online && humanRole === 'P2'}
            wins={score.p2Wins}
            totalRounds={settings.roundCount}
            testId="hud-profile-p2"
          />
        </div>
      </div>

      {/* HUD 아래 우측: 나가기 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 24px 0' }}>
        <Button variant="ghost" testId="btn-exit" onClick={exit}>
          [ESC] 나가기
        </Button>
      </div>

      {/* 아레나 스테이지 */}
      <div style={{ flex: 1, display: 'flex', padding: '8px 24px 0', minHeight: 320 }}>
        <div
          data-testid="game-stage"
          className={`brackets${danger ? ' heartbeat' : ''}`}
          style={{
            position: 'relative',
            flex: 1,
            background: 'var(--bg-1)',
            border: '1px solid var(--line)',
            overflow: 'hidden',
          }}
        >
          {/* 진영색 사이드라인 (좌 시안 / 우 마젠타) */}
          <div
            style={{
              position: 'absolute',
              top: 12,
              bottom: 12,
              left: 0,
              width: 1,
              background: 'var(--p1)',
              opacity: 0.5,
              boxShadow: '0 0 8px var(--p1)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 12,
              bottom: 12,
              right: 0,
              width: 1,
              background: 'var(--p2)',
              opacity: 0.5,
              boxShadow: '0 0 8px var(--p2)',
            }}
          />
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          />
          {/* 트랙 라벨 */}
          <div className="overline" style={{ position: 'absolute', top: 10, left: 16, color: 'var(--p1)', opacity: 0.75 }}>
            P1 // OFFENSE — {p1Name}
          </div>
          <div className="overline" style={{ position: 'absolute', bottom: 10, right: 16, color: 'var(--p2)', opacity: 0.75 }}>
            P2 // DEFENSE — {p2Name}
          </div>
          {/* 시작 카운트다운 3·2·1 */}
          {phase === 'countdown' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                background: 'rgba(10,12,16,.45)',
              }}
            >
              <div className="overline">LIGHT GRID // ROUND {roundIndex + 1}</div>
              <div
                key={count}
                className="display num count-pop"
                style={{ fontSize: 96, textShadow: '0 0 32px rgba(0,240,255,.45)' }}
              >
                {count}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-md)' }}>
                피격 시 P1 승리 · 시간 종료까지 생존 시 P2 승리
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 하단 키패드 (SPEC Q2: 실제 배정 키 표기 + 실입력 점등) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          padding: '14px 24px 18px',
        }}
      >
        <div>
          <div className="overline" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--p1)' }}>
            OFFENSE {youChip('P1')}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <KeyCap label={KEY_LABEL.P1.key1} desc="반전" side="p1" active={!!pressed[KEY_LABEL.P1.key1]} />
            <KeyCap label={KEY_LABEL.P1.key2} desc="발사" side="p1" active={!!pressed[KEY_LABEL.P1.key2]} />
          </div>
          {/* 장전/쿨다운 게이지 (QA-S10-06) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <span className="overline" style={{ fontSize: 9 }}>
              RELOAD
            </span>
            <div style={{ width: 76, height: 4, background: 'var(--line-dim)', border: '1px solid var(--line)' }}>
              <div
                ref={gaugeRef}
                style={{
                  height: '100%',
                  width: '100%',
                  background: 'var(--p1)',
                  boxShadow: '0 0 6px var(--p1)',
                  transition: 'opacity 120ms linear',
                }}
              />
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            className="overline"
            style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', color: 'var(--p2)' }}
          >
            DEFENSE {youChip('P2')}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <KeyCap label={KEY_LABEL.P2.key1} desc="←" side="p2" active={!!pressed[KEY_LABEL.P2.key1]} />
            <KeyCap label={KEY_LABEL.P2.key2} desc="→" side="p2" active={!!pressed[KEY_LABEL.P2.key2]} />
          </div>
        </div>
      </div>

      {/* 라운드/매치 결과 */}
      <ResultOverlay
        open={phase === 'result'}
        roundWinner={overlay?.roundWinner ?? null}
        matchResult={overlay?.matchResult ?? null}
        roundNumber={roundIndex + 1}
        p1Name={p1Name}
        p2Name={p2Name}
        onNextRound={() => {
          beginNextRound();
          startRound();
        }}
        onBackMain={exit}
      />
    </div>
  );
}
