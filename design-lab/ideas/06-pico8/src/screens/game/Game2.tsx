/**
 * S10·S11. 게임2 인게임 — 총알 피하기 (scr-game2)
 * [소유: game2 에이전트]
 *
 * - 로직은 @shared game2 (createGame2State/tickGame2/reduceGame2Inputs) — 재구현 없음.
 * - P1(상단 UFO): 자동 왕복, q=방향 반전 / w=발사(쿨다운). P2(하단 러너): u=← / i=→.
 * - 캔버스 렌더(requestAnimationFrame + 고정 50ms 틱), PLAN §3.2 아트 디렉션.
 * - 온라인 mock: 봇이 P2(회피자) 조작 — 간단한 위협 회피 휴리스틱.
 * - 라운드 종료 → recordRoundResult → ResultOverlay(game1 소유, import만).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  attachKeyboardAdapter,
  createGame2State,
  DEFAULT_KEYBOARD_MAP,
  GAME2_IDLE_INPUTS,
  GAME2_TICK_MS,
  reduceGame2Inputs,
  tickGame2,
} from '@shared';
import type {
  Game2Action,
  Game2Inputs,
  Game2State,
  MatchResult,
  PlayerRole,
} from '@shared';
import { getFlow, recordRoundResult, resetFlow, startMatch, useFlow } from '../../state/flow';
import { setDebugGame, useDebugScreen } from '../../debug';
import { Keycap, PlayerBadge } from '../../components';
import ResultOverlay from './ResultOverlay';
import './Game2.css';

// ---------------------------------------------------------------------------
// 캔버스 상수 + PICO-8 팔레트 (PLAN §1.1 — 16색 밖 사용 금지)
// ---------------------------------------------------------------------------

const CANVAS = 320; // 논리 해상도 (정사각 스크린)
const SC = CANVAS / 100; // 필드 단위(0~100) → 캔버스 px
const AP = 4; // 캐릭터 아트 픽셀 한 변

const PAL = {
  black: '#000000',
  white: '#FFF1E8',
  ltgray: '#C2C3C7',
  gray: '#5F574F',
  lav: '#83769C',
  blue: '#29ADFF',
  red: '#FF004D',
  orange: '#FFA300',
  yellow: '#FFEC27',
  green: '#00E436',
  pink: '#FF77A8',
  flesh: '#FFCCAA',
} as const;

type ColorMap = Record<string, string>;

/** 픽셀맵 스프라이트 드로잉 (cx = 수평 중심, topY = 상단) */
function drawMap(
  ctx: CanvasRenderingContext2D,
  map: readonly string[],
  colors: ColorMap,
  cx: number,
  topY: number,
  px: number,
): void {
  const w = map[0].length;
  const left = Math.round(cx - (w * px) / 2);
  for (let r = 0; r < map.length; r++) {
    const row = map[r];
    for (let c = 0; c < w; c++) {
      const color = colors[row[c]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(left + c * px, Math.round(topY) + r * px, px, px);
    }
  }
}

/** 라벤더 점선 트랙 (2px, PLAN §3.2) */
function dashLine(ctx: CanvasRenderingContext2D, y: number, color: string): void {
  ctx.fillStyle = color;
  for (let x = 4; x < CANVAS; x += 16) ctx.fillRect(x, y, 8, 2);
}

// P1 UFO (하향 포신, 9x7 아트픽셀)
const UFO_MAP = [
  '...WWW...',
  '..WCCCW..',
  '.BBBBBBB.',
  'BBYBBBYBB',
  '.BBBBBBB.',
  '...GGG...',
  '....G....',
] as const;

// P2 러너 (7x7, 2프레임 발구름)
const RUNNER_A = [
  '..RRR..',
  '..FFF..',
  '.RRRRR.',
  'R.RRR.R',
  '..RRR..',
  '..R.R..',
  '.R...R.',
] as const;
const RUNNER_B = [
  '..RRR..',
  '..FFF..',
  '.RRRRR.',
  'R.RRR.R',
  '..RRR..',
  '..R.R..',
  '..R.R..',
] as const;

// P2 피격 후 고스트 (팔레트 스왑, PLAN §3.2)
const GHOST_MAP = [
  '..LLL..',
  '..LWL..',
  '.LLLLL.',
  'L.LLL.L',
  '..LLL..',
  '..L.L..',
  '.L...L.',
] as const;

// 총알 캡슐 4x6 (화이트 몸통 + 옐로 머리, 아트픽셀 2px)
const BULLET_MAP = [
  '.WW.',
  'WWWW',
  'WWWW',
  'WWWW',
  'YYYY',
  '.YY.',
] as const;

const SPRITE_COLORS: ColorMap = {
  W: PAL.white,
  C: PAL.ltgray,
  B: PAL.blue,
  Y: PAL.yellow,
  G: PAL.gray,
  R: PAL.red,
  F: PAL.flesh,
  L: PAL.lav,
};
const PINK_COLORS: ColorMap = { ...SPRITE_COLORS, R: PAL.pink, F: PAL.pink }; // 피격 1프레임 플래시
const BULLET_COLORS: ColorMap = { W: PAL.white, Y: PAL.yellow };
const CAPSULE_COOL: ColorMap = { W: PAL.gray, Y: PAL.gray }; // 쿨다운 중 그레이
const CAPSULE_READY: ColorMap = { W: PAL.white, Y: PAL.yellow }; // 장전 완료(흐림)
const CAPSULE_FLASH: ColorMap = { W: PAL.yellow, Y: PAL.yellow }; // 완료 순간 옐로 플래시

// ---------------------------------------------------------------------------
// 온라인 mock 봇 (P2 회피자) — 간단한 위협 회피 휴리스틱
// ---------------------------------------------------------------------------

function applyDodgerBot(s: Game2State, inputs: Game2Inputs): Game2Inputs {
  const cfg = s.config;
  const x = s.dodger.x;
  let threat: { x: number; t: number } | null = null;
  for (const b of s.bullets) {
    if (b.y > cfg.dodgerY) continue;
    const t = (cfg.dodgerY - b.y) / b.vy; // 트랙 도달까지 남은 시간(초)
    if (t < (threat?.t ?? Infinity)) threat = { x: b.x, t };
  }
  let dir = 0;
  const dangerW = cfg.dodgerHalfWidth + cfg.bulletRadius + 5;
  if (threat && threat.t < 1.1 && Math.abs(threat.x - x) < dangerW) {
    dir = threat.x >= x ? -1 : 1; // 위협 반대쪽으로 회피
    // 벽에 몰리면 반대쪽으로 (봇의 헛발질 — P1의 승기 지점)
    if (dir === -1 && x <= cfg.dodgerHalfWidth + 3) dir = 1;
    if (dir === 1 && x >= cfg.fieldWidth - cfg.dodgerHalfWidth - 3) dir = -1;
  } else if (!threat || threat.t > 1.6) {
    const center = cfg.fieldWidth / 2;
    if (Math.abs(x - center) > 24) dir = x > center ? -1 : 1; // 평시엔 중앙 복귀
  }
  return { ...inputs, p2Left: dir < 0, p2Right: dir > 0 };
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

type Phase = 'intro' | 'play' | 'over';

interface OverInfo {
  winner: PlayerRole | null;
  matchOver: boolean;
  matchResult: MatchResult | null;
}

interface Star {
  x: number;
  y: number;
  spd: number;
  dim: boolean;
}

interface Fx {
  explosion: { x: number; y: number; t: number } | null;
  shakeUntil: number;
  turnT: number;
  fireT: number;
  readyT: number;
}

const INTRO_DURATIONS = [900, 700, 700, 700, 500]; // ROUND N → 3 → 2 → 1 → GO!

export default function Game2() {
  useDebugScreen('scr-game2');
  const navigate = useNavigate();
  const flow = useFlow();

  const [phase, setPhaseState] = useState<Phase>('intro');
  const [introStep, setIntroStep] = useState(0);
  const [secLeft, setSecLeft] = useState(() => getFlow().roundConfig.timePerRoundSec);
  const [held, setHeld] = useState({ q: false, w: false, u: false, i: false });
  const [over, setOver] = useState<OverInfo | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<Phase>('intro');
  const stateRef = useRef<Game2State | null>(null);
  const inputsRef = useRef<Game2Inputs>(GAME2_IDLE_INPUTS);
  const actionsRef = useRef<Game2Action[]>([]);
  const overRef = useRef<OverInfo | null>(null);
  const overlayTimerRef = useRef<number | null>(null);
  const fxRef = useRef<Fx>({ explosion: null, shakeUntil: 0, turnT: -1e9, fireT: -1e9, readyT: -1e9 });
  const starsRef = useRef<Star[]>(
    Array.from({ length: 44 }, () => ({
      x: Math.floor(Math.random() * (CANVAS / 2)) * 2,
      y: Math.floor(Math.random() * (CANVAS / 2)) * 2,
      spd: 6 + Math.random() * 14, // 느린 세로 스크롤 (px/sec)
      dim: Math.random() < 0.5,
    })),
  );

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  /** 새 라운드 state 생성 (마운트 + ResultOverlay onNextRound) */
  const startRound = useCallback(() => {
    const cfg = getFlow().roundConfig;
    const st = createGame2State({ roundDurationMs: cfg.timePerRoundSec * 1000 }, Math.random);
    stateRef.current = st;
    inputsRef.current = GAME2_IDLE_INPUTS;
    actionsRef.current = [];
    fxRef.current = { explosion: null, shakeUntil: 0, turnT: -1e9, fireT: -1e9, readyT: -1e9 };
    overRef.current = null;
    if (overlayTimerRef.current !== null) window.clearTimeout(overlayTimerRef.current);
    setOver(null);
    setOverlayVisible(false);
    setSecLeft(Math.ceil(st.view.remainingMs / 1000));
    setIntroStep(0);
    setPhase('intro');
    setDebugGame(st);
  }, [setPhase]);

  const onExit = useCallback(() => {
    resetFlow();
    navigate('/');
  }, [navigate]);

  // 딥링크(직접 /game/2 진입) 대비: 매치 컨텍스트가 없으면 오프라인 2인으로 시작
  useEffect(() => {
    if (getFlow().currentRound === 0 || getFlow().gameId !== 2) {
      startMatch('offline', 2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 마운트: 첫 라운드 생성 / 언마운트: 디버그 브리지 정리
  useEffect(() => {
    startRound();
    return () => {
      if (overlayTimerRef.current !== null) window.clearTimeout(overlayTimerRef.current);
      setDebugGame(null);
    };
  }, [startRound]);

  // 라운드 인트로 시퀀스 (ROUND N → 3·2·1·GO!)
  useEffect(() => {
    if (phase !== 'intro') return;
    const t = window.setTimeout(() => {
      if (introStep >= 4) setPhase('play');
      else setIntroStep(introStep + 1);
    }, INTRO_DURATIONS[introStep]);
    return () => window.clearTimeout(t);
  }, [phase, introStep, setPhase]);

  // 키보드 입력 (q/w = P1, u/i = P2 — @shared 키맵/어댑터)
  useEffect(() => {
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      const online = getFlow().mode === 'online';
      if (online && ev.player === 'P2') return; // 온라인: P2는 봇 소유
      const heldKey =
        ev.player === 'P1' ? (ev.key === 'key1' ? 'q' : 'w') : ev.key === 'key1' ? 'u' : 'i';
      setHeld((h) =>
        h[heldKey] === (ev.phase === 'down') ? h : { ...h, [heldKey]: ev.phase === 'down' },
      );
      if (ev.player === 'P1') {
        // 엣지 트리거 — 누르는 순간만, 플레이 중에만
        if (ev.phase !== 'down' || phaseRef.current !== 'play') return;
        actionsRef.current.push({
          gameId: 2,
          player: 'P1',
          type: ev.key === 'key1' ? 'TURN' : 'FIRE',
        });
      } else {
        // 레벨 트리거 — up은 언제든 처리(키 고착 방지), down은 플레이 중에만
        if (ev.phase === 'down' && phaseRef.current !== 'play') return;
        const type =
          ev.key === 'key1'
            ? ev.phase === 'down'
              ? 'LEFT_DOWN'
              : 'LEFT_UP'
            : ev.phase === 'down'
              ? 'RIGHT_DOWN'
              : 'RIGHT_UP';
        actionsRef.current.push({ gameId: 2, player: 'P2', type });
      }
    });
    return detach;
  }, []);

  // 게임 루프: 고정 50ms 틱 + rAF 렌더
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const stepTick = () => {
      const prev = stateRef.current;
      if (!prev) return;
      let inputs = reduceGame2Inputs(inputsRef.current, actionsRef.current);
      actionsRef.current = [];
      const online = getFlow().mode === 'online';
      if (online) {
        inputs = applyDodgerBot(prev, inputs);
        // 봇의 좌우 입력을 온스크린 키캡에 동기화
        setHeld((h) =>
          h.u === inputs.p2Left && h.i === inputs.p2Right
            ? h
            : { ...h, u: inputs.p2Left, i: inputs.p2Right },
        );
      }
      const next = tickGame2(prev, inputs, GAME2_TICK_MS);
      inputsRef.current = inputs;
      const now = performance.now();
      const fx = fxRef.current;
      if (inputs.p1Turn) fx.turnT = now; // '!' 말풍선
      if (next.nextBulletId !== prev.nextBulletId) fx.fireT = now; // 머즐 플래시
      if (prev.view.fireReadyRatio < 1 && next.view.fireReadyRatio >= 1) fx.readyT = now; // 장전 완료
      stateRef.current = next;
      setDebugGame(next);
      setSecLeft(Math.ceil(next.view.remainingMs / 1000));

      if (next.result !== null && phaseRef.current === 'play') {
        setPhase('over');
        const winner: PlayerRole = next.result === 'P1_WIN' ? 'P1' : 'P2';
        if (winner === 'P1') {
          // 피격: 3프레임 픽셀 폭발 + 1프레임 화면 셰이크
          fx.explosion = {
            x: Math.round(next.dodger.x * SC),
            y: Math.round(next.config.dodgerY * SC),
            t: now,
          };
          fx.shakeUntil = now + 200;
        }
        const outcome = recordRoundResult(winner);
        const info: OverInfo = {
          winner,
          matchOver: outcome.matchOver,
          matchResult: outcome.matchResult,
        };
        overRef.current = info;
        setOver(info);
        overlayTimerRef.current = window.setTimeout(() => setOverlayVisible(true), 1000);
      }
    };

    const draw = (now: number, dt: number) => {
      const cv = canvasRef.current;
      const st = stateRef.current;
      if (!cv || !st) return;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const cfg = st.config;
      const fx = fxRef.current;

      // 우주 배경 + 라벤더 별 스크롤 (PLAN §3.2)
      ctx.fillStyle = PAL.black;
      ctx.fillRect(0, 0, CANVAS, CANVAS);
      for (const s of starsRef.current) {
        s.y = (s.y + (s.spd * dt) / 1000) % CANVAS;
        ctx.fillStyle = s.dim ? 'rgba(131,118,156,0.4)' : PAL.lav;
        ctx.fillRect(s.x, Math.floor(s.y / 2) * 2, 2, 2);
      }

      ctx.save();
      if (now < fx.shakeUntil) ctx.translate(Math.floor(now / 50) % 2 === 0 ? 4 : -4, 0);

      const y1 = Math.round(cfg.attackerY * SC);
      const y2 = Math.round(cfg.dodgerY * SC);
      const ax = Math.round(st.attacker.x * SC);
      const dx = Math.round(st.dodger.x * SC);

      // 남은 시간 픽셀 블록 바 (8px 칸 단위 소멸)
      const sec = Math.ceil(st.view.remainingMs / 1000);
      ctx.fillStyle = sec <= 3 ? PAL.red : sec <= 10 ? PAL.yellow : PAL.white;
      const bw = Math.floor(((CANVAS - 16) * (st.view.remainingMs / cfg.roundDurationMs)) / 8) * 8;
      if (bw > 0) ctx.fillRect(8, 4, bw, 4);

      // 트랙: 라벤더 점선 + 진영색 엣지 마커 (상=P1 블루 존 / 하=P2 레드 존)
      dashLine(ctx, y1 + 14, PAL.lav);
      dashLine(ctx, y2 + 16, PAL.lav);
      ctx.fillStyle = PAL.blue;
      ctx.fillRect(0, y1 + 14, 12, 2);
      ctx.fillRect(CANVAS - 12, y1 + 14, 12, 2);
      ctx.fillStyle = PAL.red;
      ctx.fillRect(0, y2 + 16, 12, 2);
      ctx.fillRect(CANVAS - 12, y2 + 16, 12, 2);

      // 장전/쿨다운 캡슐 (포신 아래 반투명 다음 탄 — 쿨다운 그레이 → 완료 옐로 플래시)
      const flashing = now - fx.readyT < 150;
      const ready = st.view.fireReadyRatio >= 1;
      ctx.globalAlpha = flashing ? 1 : ready ? 0.45 : 0.3;
      drawMap(
        ctx,
        BULLET_MAP,
        flashing ? CAPSULE_FLASH : ready ? CAPSULE_READY : CAPSULE_COOL,
        ax,
        y1 + 22,
        2,
      );
      ctx.globalAlpha = 1;

      // 총알 (4x6 캡슐 + 잔상 — 빠른 탄은 잔상 2개로 속도 암시)
      const speedMid = (cfg.bulletSpeedMin + cfg.bulletSpeedMax) / 2;
      for (const b of st.bullets) {
        const bx = Math.round(b.x * SC);
        const by = Math.round(b.y * SC);
        drawMap(ctx, BULLET_MAP, BULLET_COLORS, bx, by - 6, 2);
        ctx.fillStyle = 'rgba(255,241,232,0.5)';
        ctx.fillRect(bx - 1, by - 16, 2, 2);
        if (b.vy > speedMid) ctx.fillRect(bx - 1, by - 22, 2, 2);
      }

      // P1 UFO + 부스터(진행 반대쪽 2프레임) — 방향이 읽히는 트레일
      drawMap(ctx, UFO_MAP, SPRITE_COLORS, ax, y1 - 14, AP);
      if (phaseRef.current === 'play') {
        const bf = Math.floor(now / 120) % 2;
        const flameX = ax - st.attacker.dir * 22;
        ctx.fillStyle = bf === 0 ? PAL.orange : PAL.yellow;
        ctx.fillRect(flameX - 2, y1 - 4, 4, 4);
        if (bf === 0) {
          ctx.fillStyle = PAL.lav;
          ctx.fillRect(flameX - 2 - st.attacker.dir * 6, y1 - 2, 2, 2);
        }
      }
      // 방향 반전 '!' 말풍선 (1프레임 감성)
      if (now - fx.turnT < 220) {
        ctx.fillStyle = PAL.white;
        ctx.fillRect(ax + 14, y1 - 38, 12, 16);
        ctx.fillStyle = PAL.black;
        ctx.fillRect(ax + 19, y1 - 35, 2, 8);
        ctx.fillRect(ax + 19, y1 - 25, 2, 2);
      }
      // 발사 머즐 플래시
      if (now - fx.fireT < 90) {
        ctx.fillStyle = PAL.yellow;
        ctx.fillRect(ax - 3, y1 + 12, 6, 6);
      }

      // P2 러너 (이동 시 2프레임 발구름 / 피격 시 핑크 1프레임 → 고스트 스왑)
      const o = overRef.current;
      const hitAge = fx.explosion ? now - fx.explosion.t : -1;
      let runnerMap: readonly string[] = RUNNER_A;
      let runnerColors = SPRITE_COLORS;
      if (o?.winner === 'P1' && hitAge >= 0) {
        if (hitAge <= 100) runnerColors = PINK_COLORS;
        else runnerMap = GHOST_MAP;
      } else if (
        (inputsRef.current.p2Left || inputsRef.current.p2Right) &&
        Math.floor(now / 140) % 2 === 0
      ) {
        runnerMap = RUNNER_B;
      }
      drawMap(ctx, runnerMap, runnerColors, dx, y2 - 14, AP);

      // 피격 폭발 3프레임 (레드 → 오렌지 파편 → 옐로 파편)
      if (fx.explosion) {
        const t = now - fx.explosion.t;
        const ex = fx.explosion.x;
        const ey = fx.explosion.y;
        if (t < 70) {
          ctx.fillStyle = PAL.red;
          ctx.fillRect(ex - 6, ey - 6, 12, 12);
          ctx.fillStyle = PAL.white;
          ctx.fillRect(ex - 2, ey - 2, 4, 4);
        } else if (t < 140) {
          ctx.fillStyle = PAL.orange;
          ctx.fillRect(ex - 4, ey - 4, 8, 8);
          ctx.fillRect(ex - 14, ey - 2, 6, 4);
          ctx.fillRect(ex + 8, ey - 2, 6, 4);
          ctx.fillRect(ex - 2, ey - 14, 4, 6);
          ctx.fillRect(ex - 2, ey + 8, 4, 6);
        } else if (t < 320) {
          ctx.fillStyle = PAL.yellow;
          for (let k = 0; k < 8; k++) {
            const ang = (Math.PI / 4) * k;
            ctx.fillRect(
              Math.round(ex + Math.cos(ang) * 16) - 2,
              Math.round(ey + Math.sin(ang) * 16) - 2,
              4,
              4,
            );
          }
        }
      }

      // 생존 승리: P2 주위 그린 별 궤도
      if (o?.winner === 'P2') {
        ctx.fillStyle = PAL.green;
        for (let k = 0; k < 3; k++) {
          const ang = now / 260 + (k * Math.PI * 2) / 3;
          const sx = Math.round(dx + Math.cos(ang) * 26);
          const sy = Math.round(y2 - 4 + Math.sin(ang) * 18);
          ctx.fillRect(sx - 2, sy - 2, 4, 4);
        }
      }

      ctx.restore();
    };

    const loop = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (phaseRef.current === 'play') {
        acc += dt;
        while (acc >= GAME2_TICK_MS && phaseRef.current === 'play') {
          acc -= GAME2_TICK_MS;
          stepTick();
        }
      } else {
        acc = 0;
      }
      draw(now, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [setPhase]);

  // --- 렌더 ---
  const roundLabel = `ROUND ${Math.max(1, flow.currentRound)}/${flow.roundConfig.roundCount}`;
  const cdClass =
    secLeft <= 3
      ? 'px-font g2-countdown is-danger px-pulse'
      : secLeft <= 10
        ? 'px-font g2-countdown is-warn'
        : 'px-font g2-countdown';
  const introText =
    introStep === 0
      ? `ROUND ${Math.max(1, flow.currentRound)}`
      : introStep === 4
        ? 'GO!'
        : String(4 - introStep);
  const introColor =
    introStep === 0
      ? 'var(--accent-2)'
      : introStep === 1
        ? 'var(--text)'
        : introStep === 2
          ? 'var(--accent-2)'
          : introStep === 3
            ? 'var(--p2)'
            : 'var(--ok)';

  return (
    <div data-testid="scr-game2" className="g2-root px-snap-in">
      {/* HUD: 프로필 / 라운드·카운트다운 / 나가기 */}
      <div className="g2-hud">
        <div className="g2-hud-side">
          <PlayerBadge
            role="P1"
            nickname={flow.playerNames.P1}
            isYou={flow.mode === 'online'}
            data-testid="hud-profile-p1"
          />
          <span className="px-font g2-role-tag is-p1">ATTACKER · Q/W</span>
        </div>
        <div className="g2-hud-center">
          <span className="px-font g2-round-label">{roundLabel}</span>
          <span className={cdClass} data-testid="hud-countdown">
            {secLeft}
          </span>
        </div>
        <div className="g2-hud-right-row">
          <div className="g2-hud-side is-right">
            <PlayerBadge role="P2" nickname={flow.playerNames.P2} data-testid="hud-profile-p2" />
            <span className="px-font g2-role-tag is-p2">DODGER · U/I</span>
          </div>
          <Keycap keyLabel="X" aria-label="나가기" title="나가기" data-testid="btn-exit" onClick={onExit} />
        </div>
      </div>

      {/* 콘솔 스크린 + 온스크린 키패드 */}
      <div className="g2-stage" data-testid="game-stage">
        <div className="g2-screen">
          <canvas ref={canvasRef} className="g2-canvas" width={CANVAS} height={CANVAS} />
          {phase === 'intro' ? (
            <div className="g2-intro">
              <span
                key={introStep}
                className="px-font g2-intro-text px-pop"
                style={{ color: introColor }}
              >
                {introText}
              </span>
            </div>
          ) : null}
          <span className="px-font g2-engrave">MADPUMP-8</span>
        </div>
        <div className="g2-pads">
          <div className="g2-pad-group">
            <Keycap keyLabel="Q" icon="⇄" owner="P1" pressed={held.q} />
            <Keycap keyLabel="W" icon="●" owner="P1" pressed={held.w} />
          </div>
          <div className="g2-pad-group">
            <Keycap keyLabel="U" icon="←" owner="P2" pressed={held.u} />
            <Keycap keyLabel="I" icon="→" owner="P2" pressed={held.i} />
          </div>
        </div>
      </div>

      {over && overlayVisible ? (
        <ResultOverlay
          winner={over.winner}
          matchOver={over.matchOver}
          matchResult={over.matchResult}
          onNextRound={startRound}
        />
      ) : null}
    </div>
  );
}
