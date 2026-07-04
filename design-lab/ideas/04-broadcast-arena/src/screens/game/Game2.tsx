/**
 * S10·S11 게임2 — 총알 피하기 (Broadcast Arena). game2 에이전트 구현.
 *
 * SPEC S10·S11: 상단 P1 트랙(자동 왕복 이동, q=방향 반전, w=발사) / 하단 P2 트랙(u=←, i=→) /
 * 총알 낙하 속도 랜덤 / 쿨다운(장전) 표시 / 피격=P1 라운드 승, 시간 종료 생존=P2 라운드 승.
 * PLAN §3.2: 듀오톤 동시 중계 — 블루/레드 트랙 헤어라인, 네이비 캡슐 총알 + 속도 비례 트레일,
 * 장전 게이지, 아슬 회피 CLOSE!, 피격 순간 화이트 플래시 + REPLAY 스큐 태그.
 *
 * 로직은 @shared game2 모듈만 사용(재구현 금지). 렌더는 canvas + requestAnimationFrame.
 * 온라인 mock: 사람=P1(공격, q/w), 봇=P2(회피 휴리스틱 — getPlayerDisplays 기준 P1=YOU).
 * 오프라인: 한 키보드 2인 (playerL q/w = P1, playerR u/i = P2).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  GAME2_IDLE_INPUTS,
  DEFAULT_KEYBOARD_MAP,
  attachKeyboardAdapter,
  createGame2State,
  reduceGame2Inputs,
  tickGame2,
} from '@shared';
import type { Game2Action, Game2Inputs, Game2State } from '@shared';
import {
  useFlow,
  reportRoundEnd,
  nextRound,
  exitMatch,
  getPlayerDisplays,
  getRoundWins,
} from '../../state/flow';
import type { FlowState } from '../../state/flow';
import { useDebugScreen, setDebugGame } from '../../debug';
import { Button, KeyCap, LiveBadge, ScoreBug } from '../../components';
import ResultOverlay from './ResultOverlay';
import './game2.css';

// 팀/스튜디오 컬러 (theme.css 토큰과 동일 hex — canvas는 CSS 변수 접근 불가)
const C = {
  ink: '#0E1E3C',
  p1: '#0B63E5',
  p1Tint: '#E3EEFD',
  p2: '#E0323E',
  p2Tint: '#FCE8E9',
  live: '#D7263D',
  bgTop: '#EEF2F7',
  bgBottom: '#E3EAF3',
  close: '#E4B33C', // 아슬 회피 하이라이트 (골드 토큰 아님 — PLAN §3.2)
} as const;

const FONT_DISPLAY = 'Archivo, "IBM Plex Sans KR", sans-serif';

type EndKind = 'hit' | 'timeout' | null;

interface HudSnap {
  secs: number;
  ready: number; // 발사 준비도 0~1 (장전 게이지)
  p2Left: boolean;
  p2Right: boolean;
}

interface NearMiss {
  xRatio: number;
  until: number;
}

interface RoundStats {
  survivedMs: number;
  dodged: number;
}

// ---------------------------------------------------------------------------
// 봇 (온라인 mock — P2 회피 휴리스틱. 판정 로직과 무관한 '입력 생성'만 담당)
// ---------------------------------------------------------------------------

function botDodge(s: Game2State): { p2Left: boolean; p2Right: boolean } {
  const cfg = s.config;
  const x = s.dodger.x;
  const hitW = cfg.dodgerHalfWidth + cfg.bulletRadius;
  // 가장 임박한 위협 총알 탐색 — 반응 지연(0.6초 이내만 인지)으로 사람 P1에게 승산을 남긴다
  let threatX: number | null = null;
  let bestT = Infinity;
  for (const b of s.bullets) {
    if (b.y > cfg.dodgerY) continue;
    const t = (cfg.dodgerY - b.y) / b.vy;
    if (t > 0.6) continue;
    if (Math.abs(b.x - x) < hitW * 3 && t < bestT) {
      bestT = t;
      threatX = b.x;
    }
  }
  if (threatX !== null) {
    const roomL = x - cfg.dodgerHalfWidth;
    const roomR = cfg.fieldWidth - cfg.dodgerHalfWidth - x;
    let goLeft = threatX >= x;
    // 벽에 몰리면 반대쪽으로 탈출
    if (goLeft && roomL < hitW * 2 && roomR > roomL) goLeft = false;
    else if (!goLeft && roomR < hitW * 2 && roomL > roomR) goLeft = true;
    return { p2Left: goLeft, p2Right: !goLeft };
  }
  // 위협 없음 — 중앙 부근으로 복귀 (여유 확보)
  const center = cfg.fieldWidth / 2;
  if (Math.abs(x - center) > 12) return { p2Left: x > center, p2Right: x < center };
  return { p2Left: false, p2Right: false };
}

// ---------------------------------------------------------------------------
// 아슬 회피(CLOSE!) 감지 — 이번 틱에 트랙을 통과했지만 명중하지 않은 근접 탄
// ---------------------------------------------------------------------------

function detectNearMiss(prev: Game2State, next: Game2State, now: number): NearMiss | null {
  const cfg = next.config;
  const hitW = cfg.dodgerHalfWidth + cfg.bulletRadius;
  for (const pb of prev.bullets) {
    if (pb.y > cfg.dodgerY) continue; // 이미 통과한 탄
    const nb = next.bullets.find((b) => b.id === pb.id);
    if (!nb || nb.y < cfg.dodgerY) continue; // 아직 통과 전
    const dx = Math.abs(nb.x - next.dodger.x);
    if (dx > hitW && dx <= hitW * 3) {
      return { xRatio: nb.x / cfg.fieldWidth, until: now + 500 };
    }
  }
  return null;
}

/** 이번 틱에 P2 트랙을 통과 완료한(=회피 성공) 탄 수 — MVP 스탯용 */
function countDodged(prev: Game2State, next: Game2State): number {
  if (next.result === 'P1_WIN') return 0;
  const dodgerY = next.config.dodgerY;
  let n = 0;
  for (const pb of prev.bullets) {
    if (pb.y > dodgerY) continue;
    const nb = next.bullets.find((b) => b.id === pb.id);
    if (nb && nb.y >= dodgerY) n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// canvas 렌더
// ---------------------------------------------------------------------------

function roundedRect(
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

function drawTrack(
  ctx: CanvasRenderingContext2D,
  w: number,
  y: number,
  tint: string,
  line: string,
): void {
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = tint;
  ctx.fillRect(0, y - 22, w, 44);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  isYou: boolean,
): void {
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `800 12px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 0.5);
  if (isYou) {
    const py = y - 32;
    ctx.fillStyle = color;
    roundedRect(ctx, x - 17, py - 8, 34, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 9px ${FONT_DISPLAY}`;
    ctx.fillText('YOU', x, py + 0.5);
  }
  ctx.textBaseline = 'alphabetic';
}

interface DrawExtras {
  reduced: boolean;
  you: { p1: boolean; p2: boolean };
  hitAt: number | null;
  nearMiss: NearMiss | null;
}

function drawStage(canvas: HTMLCanvasElement, s: Game2State, now: number, ex: DrawExtras): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cfg = s.config;
  const padX = 34;
  const padY = 30;
  const mapX = (r: number) => padX + r * (w - padX * 2);
  const mapY = (r: number) => padY + r * (h - padY * 2);
  const unitPx = (h - padY * 2) / cfg.fieldHeight; // 필드 세로 1 unit → px
  const aY = mapY(cfg.attackerY / cfg.fieldHeight);
  const dY = mapY(cfg.dodgerY / cfg.fieldHeight);
  const aX = mapX(s.view.attackerXRatio);
  const dX = mapX(s.view.dodgerXRatio);

  // 배경 — 주간 스튜디오 그라디언트 + 12분할 칼럼 헤어라인
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, C.bgTop);
  g.addColorStop(1, C.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(201, 212, 227, 0.45)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) {
    const x = (w / 12) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // 듀오톤 트랙: 상단 P1 블루 / 하단 P2 레드 (PLAN §3.2)
  drawTrack(ctx, w, aY, C.p1Tint, C.p1);
  drawTrack(ctx, w, dY, C.p2Tint, C.p2);
  ctx.font = `700 11px ${FONT_DISPLAY}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = C.p1;
  ctx.fillText('P1 — ATTACK', padX, aY - 28);
  ctx.fillStyle = C.p2;
  ctx.fillText('P2 — DODGE', padX, dY - 28);

  // 총알: 네이비 캡슐 + 속도 비례 블루 모션 트레일 (빠른 탄일수록 길게)
  const bw = 9;
  const bh = 16;
  for (const b of s.bullets) {
    const bx = mapX(b.x / cfg.fieldWidth);
    const by = mapY(b.y / cfg.fieldHeight);
    if (!ex.reduced) {
      const trail = b.vy * unitPx * 0.14; // 약 0.14초 잔상 길이
      for (let k = 1; k <= 3; k++) {
        ctx.globalAlpha = (0.16 * (4 - k)) / 3;
        ctx.fillStyle = C.p1;
        roundedRect(ctx, bx - bw / 2 + k * 0.9, by - bh / 2 - (trail * k) / 3, bw, bh, 4.5);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = C.ink;
    roundedRect(ctx, bx - bw / 2, by - bh / 2, bw, bh, 4.5);
    ctx.fill();
    ctx.fillStyle = C.live;
    ctx.beginPath();
    ctx.arc(bx, by + bh / 2 - 3, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // P1 진행 방향 화살표
  const dir = s.attacker.dir;
  ctx.fillStyle = C.p1;
  ctx.beginPath();
  ctx.moveTo(aX + dir * 22, aY - 5);
  ctx.lineTo(aX + dir * 22, aY + 5);
  ctx.lineTo(aX + dir * 31, aY);
  ctx.closePath();
  ctx.fill();

  // 장전 게이지 — 배지 옆 반투명 캡슐이 차오름 (진행 반대쪽에 배치, PLAN §3.2)
  const gw = 10;
  const gh = 20;
  const gx = aX - dir * 36 - gw / 2;
  const gy = aY - gh / 2;
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = C.p1;
  ctx.lineWidth = 1.5;
  roundedRect(ctx, gx, gy, gw, gh, 5);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const ready = s.view.fireReadyRatio;
  ctx.save();
  roundedRect(ctx, gx, gy, gw, gh, 5);
  ctx.clip();
  ctx.fillStyle = ready >= 1 ? C.p1 : 'rgba(11, 99, 229, 0.45)';
  ctx.fillRect(gx, gy + gh * (1 - ready), gw, gh * ready);
  ctx.restore();

  // 플레이어 배지 (P1 블루 / P2 레드 + YOU 플레이트)
  drawBadge(ctx, aX, aY, C.p1, 'P1', ex.you.p1);
  drawBadge(ctx, dX, dY, C.p2, 'P2', ex.you.p2);

  // 아슬 회피 CLOSE! (근접 통과 하이라이트)
  const nm = ex.nearMiss;
  if (nm && now < nm.until && !ex.reduced) {
    const nx = mapX(nm.xRatio);
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = C.close;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(nx, dY, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = C.close;
    ctx.font = `800 12px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText('CLOSE!', nx, dY - 32);
    ctx.globalAlpha = 1;
  }

  // 피격 순간: 임팩트 링 + 화이트 플래시 (→ 이후 ResultOverlay)
  if (ex.hitAt !== null && s.result === 'P1_WIN' && !ex.reduced) {
    const t = (now - ex.hitAt) / 550;
    if (t < 1) {
      ctx.strokeStyle = C.live;
      ctx.lineWidth = 3;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.beginPath();
      ctx.arc(dX, dY, 16 + t * 44, 0, Math.PI * 2);
      ctx.stroke();
      const flash = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 0.7);
      ctx.globalAlpha = flash * 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// 화면 컴포넌트
// ---------------------------------------------------------------------------

export default function Game2() {
  useDebugScreen('scr-game2');
  const flow = useFlow();
  // 가드: 매치 시작 없이 직접 URL 진입 시 게임 선택으로
  if (flow.gameId !== 2 || flow.phase === 'idle') return <Navigate to="/select" replace />;
  return <Game2Arena flow={flow} />;
}

function Game2Arena({ flow }: { flow: FlowState }) {
  const navigate = useNavigate();
  const isOnline = flow.mode === 'online';
  const roundDurationMs = flow.roundConfig.timePerRoundSec * 1000;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<Game2State | null>(null);
  const inputsRef = useRef<Game2Inputs>(GAME2_IDLE_INPUTS);
  const actionsRef = useRef<Game2Action[]>([]);
  const reportedRef = useRef(false);
  const endTimerRef = useRef<number | null>(null);
  const hitAtRef = useRef<number | null>(null);
  const nearMissRef = useRef<NearMiss | null>(null);
  const statsRef = useRef<RoundStats>({ survivedMs: 0, dodged: 0 });
  const youRef = useRef({ p1: false, p2: false });
  const hudRef = useRef<HudSnap>({
    secs: flow.roundConfig.timePerRoundSec,
    ready: 1,
    p2Left: false,
    p2Right: false,
  });

  const [hud, setHud] = useState<HudSnap>(hudRef.current);
  const [pressed, setPressed] = useState<{ q: boolean; w: boolean }>({ q: false, w: false });
  const [ended, setEnded] = useState<EndKind>(null);
  const [roundStats, setRoundStats] = useState<RoundStats | null>(null);

  if (stateRef.current === null) {
    stateRef.current = createGame2State({ roundDurationMs });
  }

  /** 새 라운드 state 생성 + 연출/입력 리셋 (nextRound() 직후 호출) */
  const startRound = useCallback(() => {
    stateRef.current = createGame2State({ roundDurationMs });
    inputsRef.current = GAME2_IDLE_INPUTS;
    actionsRef.current = [];
    reportedRef.current = false;
    hitAtRef.current = null;
    nearMissRef.current = null;
    statsRef.current = { survivedMs: 0, dodged: 0 };
    if (endTimerRef.current !== null) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    setEnded(null);
    setRoundStats(null);
  }, [roundDurationMs]);

  // 키보드 입력 → Game2Action (P1 엣지 / P2 레벨). 온라인에선 P2 물리 키 무시(봇이 조종)
  useEffect(() => {
    return attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      if (ev.player === 'P1') {
        const k: 'q' | 'w' = ev.key === 'key1' ? 'q' : 'w';
        const down = ev.phase === 'down';
        setPressed((p) => (p[k] === down ? p : { ...p, [k]: down }));
        if (!down) return;
        actionsRef.current.push({
          gameId: 2,
          player: 'P1',
          type: ev.key === 'key1' ? 'TURN' : 'FIRE',
        });
        return;
      }
      if (isOnline) return;
      const type: Game2Action['type'] =
        ev.key === 'key1'
          ? ev.phase === 'down'
            ? 'LEFT_DOWN'
            : 'LEFT_UP'
          : ev.phase === 'down'
            ? 'RIGHT_DOWN'
            : 'RIGHT_UP';
      actionsRef.current.push({ gameId: 2, player: 'P2', type });
    });
  }, [isOnline]);

  // rAF 게임 루프: 입력 접기 → tickGame2 → 디버그 브리지 → canvas 렌더 → HUD 동기화
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(100, now - last); // 탭 비활성 복귀 시 폭주 방지
      last = now;
      let s = stateRef.current;
      if (!s) return;

      if (s.result === null) {
        const acts = actionsRef.current;
        actionsRef.current = [];
        let inputs = reduceGame2Inputs(inputsRef.current, acts);
        if (isOnline) {
          const bot = botDodge(s);
          inputs = { ...inputs, p2Left: bot.p2Left, p2Right: bot.p2Right };
        }
        inputsRef.current = inputs;
        const prev = s;
        s = tickGame2(s, inputs, dt);
        stateRef.current = s;

        const nm = detectNearMiss(prev, s, now);
        if (nm) nearMissRef.current = nm;
        statsRef.current.dodged += countDodged(prev, s);
        statsRef.current.survivedMs = s.elapsedMs;

        if (s.result !== null && !reportedRef.current) {
          reportedRef.current = true;
          const res = s.result;
          const kind: EndKind = res === 'P1_WIN' ? 'hit' : 'timeout';
          hitAtRef.current = now;
          setEnded(kind);
          setRoundStats({ ...statsRef.current });
          // 화이트 플래시 + 리플레이 프레이밍 후 결과 보고 (PLAN §1.4 승부 순간)
          endTimerRef.current = window.setTimeout(
            () => reportRoundEnd(res),
            reduced ? 0 : kind === 'hit' ? 700 : 350,
          );
        }
      }

      setDebugGame(s); // QA 디버그 브리지 — 매 틱 갱신

      const canvas = canvasRef.current;
      if (canvas) {
        drawStage(canvas, s, now, {
          reduced,
          you: youRef.current,
          hitAt: hitAtRef.current,
          nearMiss: nearMissRef.current,
        });
      }

      // HUD(React)는 값이 바뀔 때만 setState
      const secs = Math.max(0, Math.ceil(s.view.remainingMs / 1000));
      const ready = Math.round(s.view.fireReadyRatio * 20) / 20;
      const i = inputsRef.current;
      const h0 = hudRef.current;
      if (
        secs !== h0.secs ||
        ready !== h0.ready ||
        i.p2Left !== h0.p2Left ||
        i.p2Right !== h0.p2Right
      ) {
        hudRef.current = { secs, ready, p2Left: i.p2Left, p2Right: i.p2Right };
        setHud(hudRef.current);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (endTimerRef.current !== null) clearTimeout(endTimerRef.current);
      setDebugGame(null);
    };
  }, [isOnline]);

  const handleNextRound = useCallback(() => {
    nextRound();
    startRound();
  }, [startRound]);

  const handleBackMain = useCallback(() => {
    exitMatch();
    navigate('/');
  }, [navigate]);

  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  youRef.current = { p1: players.P1.isYou, p2: players.P2.isYou };

  return (
    <div data-testid="scr-game2" className="g2-root">
      <header className="g2-topbar">
        <LiveBadge />
        <ScoreBug
          players={players}
          roundWins={wins}
          currentRound={flow.currentRound}
          roundCount={flow.roundConfig.roundCount}
          timeRemainingMs={hud.secs * 1000}
        />
        <Button testId="btn-exit" variant="text" onClick={handleBackMain}>
          나가기 ✕
        </Button>
      </header>

      <div data-testid="game-stage" className="g2-stage">
        <canvas ref={canvasRef} className="g2-canvas" aria-label="게임2 총알 피하기 스테이지" />
        {ended === 'hit' && (
          <span className="g2-replay-tag" aria-hidden="true">
            <span className="g2-replay-inner">
              <span className="g2-replay-dot" />
              REPLAY
            </span>
          </span>
        )}
      </div>

      <footer className="g2-pads">
        <div className="g2-pad g2-pad--p1">
          <span className="g2-pad-name" style={{ color: 'var(--p1)' }}>
            P1 · 공격{players.P1.isYou ? ' · YOU' : ''}
          </span>
          <KeyCap keyLabel="q" hint="⇄ 방향전환" team="p1" active={pressed.q} />
          <KeyCap keyLabel="w" hint="● 발사" team="p1" active={pressed.w} />
          <span className="g2-reload">
            <span className="g2-reload-label">{hud.ready >= 1 ? 'AMMO READY' : 'RELOADING…'}</span>
            <span className="g2-reload-track">
              <span className="g2-reload-fill" style={{ width: `${hud.ready * 100}%` }} />
            </span>
          </span>
        </div>
        <div className="g2-pad g2-pad--p2">
          <KeyCap keyLabel="u" hint="← 왼쪽" team="p2" active={hud.p2Left} />
          <KeyCap keyLabel="i" hint="→ 오른쪽" team="p2" active={hud.p2Right} />
          <span className="g2-pad-name" style={{ color: 'var(--p2)' }}>
            P2 · 회피{players.P2.isYou ? ' · YOU' : ''}
            {isOnline ? ' · BOT' : ''}
          </span>
        </div>
      </footer>

      {flow.phase !== 'playing' && (
        <ResultOverlay
          flow={flow}
          players={players}
          onNextRound={handleNextRound}
          onBackMain={handleBackMain}
          stats={
            roundStats && (
              <span className="tnum">
                생존 {(roundStats.survivedMs / 1000).toFixed(1)}s · 회피 {roundStats.dodged}회
              </span>
            )
          }
        />
      )}
    </div>
  );
}
