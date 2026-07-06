/**
 * 코인 노가다 (scr-coin-farm) — 솔로 펌프 미션으로 코인 벌기 (docs/COINS.md).
 * 컨테이너 testid: scr-coin-farm / 부품: btn-farm-start, btn-farm-retry, btn-farm-exit, farm-stage
 *
 * ── 규칙 (shared/src/coins.ts FARM_*) ───────────────────────────
 *  · 로그인 유저 1인 전용. U/I 키만 사용 (게임6 펌프의 P2 레인 문법).
 *  · 제한시간 10초(FARM_DURATION) 안에 정답 30타(FARM_TARGET) → MISSION COMPLETE,
 *    서버(/api/farm/claim)가 확률표로 보상 추첨(기댓값 ~5코인, 1~100).
 *  · 시간 초과 → MISSION FAILED (보상 없음).
 *  · 틀린 키 단 1회 → 그 즉시 MISSION FAILED.
 *
 * ── 화면 ────────────────────────────────────────────────────────
 *  게임6의 노트 하이웨이 비주얼을 1레인으로 축약(캔버스). 점수 잭팟/타이머 내장.
 *  ready → (시작하기) → playing → success(보상 표시) | fail(사유 표시) → 다시 도전.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FARM_CLAIM_COOLDOWN_MS, FARM_DURATION, FARM_TARGET } from '@madpump/shared';
import type { GameInputEvent } from '@madpump/shared';
import { attachLocalKeyboard } from '../game/input/keyboard';
import { Button, KeyCap, useKeyLamp } from '../components';
import { claimFarmReward, restoreSession, useSession } from '../state/session';
import { openLoginModal } from '../modals/Login';
import { setDebugGame, useDebugScreen } from '../debug';
import './coin-farm.css';

// ── 솔로 펌프 로직 (게임6 P2 레인 규칙 + 미션 판정) ─────────────
const FLASH = 0.12;
/** 시퀀스 길이 — 목표 30타 + 미리보기 여유 */
const SEQ_LEN = FARM_TARGET + 10;

type Outcome = null | 'success' | 'wrong' | 'timeout';

interface FarmState {
  elapsed: number;
  seq: number[]; // 0 = U, 1 = I
  idx: number;
  score: number;
  flash: number;
  wrong: number;
  outcome: Outcome;
}

function createFarm(): FarmState {
  const seq: number[] = [];
  for (let i = 0; i < SEQ_LEN; i++) seq.push(Math.random() < 0.5 ? 0 : 1);
  return { elapsed: 0, seq, idx: 0, score: 0, flash: 0, wrong: 0, outcome: null };
}

function stepFarm(s: FarmState, events: GameInputEvent[], dt: number): FarmState {
  if (s.outcome) return s;
  s.elapsed += dt;
  s.flash = Math.max(0, s.flash - dt);
  s.wrong = Math.max(0, s.wrong - dt);

  for (const e of events) {
    if (e.type !== 'down') continue;
    if (e.code !== 'KeyU' && e.code !== 'KeyI') continue; // 노가다는 U/I 전용 (Q/W 무시)
    const got = e.code === 'KeyU' ? 0 : 1;
    if (got === s.seq[s.idx]) {
      s.score += 1;
      s.idx += 1;
      s.flash = FLASH;
      if (s.score >= FARM_TARGET) {
        s.outcome = 'success'; // 목표 달성 — 조기 종료
        return s;
      }
    } else {
      s.wrong = FLASH;
      s.outcome = 'wrong'; // 오답 1회 = 즉시 실패
      return s;
    }
  }

  if (s.elapsed >= FARM_DURATION) s.outcome = 'timeout';
  return s;
}

// ── 캔버스 렌더 (게임6 레인 문법의 1레인 축약) ──────────────────
const CW = 480;
const CH = 450;
/** 표시 배율 — 논리 좌표(480×450)는 유지하고 캔버스 해상도·CSS 크기만 1.5배 (선명도 유지) */
const DISPLAY_SCALE = 1.5;
const LANE_X = CW / 2;
const HIT_Y = 330;
const SPACING = 62;
const TILE = 76;
const LANE_HALF = 130;
const AHEAD = 4.2;
const BEHIND = -1.4;
const ARCADE = '"Press Start 2P", monospace';
const COL = {
  field: '#1a0b2e',
  deep: '#160a33',
  gold: '#fdf500',
  golddim: '#4a4206',
  error: '#ff3864',
  muted: '#9d8fbf',
  text: '#f4f0ff',
} as const;

function drawFarm(ctx: CanvasRenderingContext2D, s: FarmState, scroll: number, now: number): void {
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, CW, CH);

  const remain = Math.max(0, FARM_DURATION - s.elapsed);
  const urgent = remain <= 3 && s.outcome === null;

  // 레인 패널
  ctx.save();
  ctx.fillStyle = COL.deep;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(LANE_X - LANE_HALF, 96, LANE_HALF * 2, 312);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = urgent ? 'rgba(255,56,100,0.4)' : 'rgba(253,245,0,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(LANE_X - LANE_HALF, 96, LANE_HALF * 2, 312);
  ctx.restore();

  // 타일 하이웨이
  const lo = Math.floor(scroll) - 2;
  const hi = Math.floor(scroll) + 6;
  for (let j = hi; j >= lo; j--) {
    if (j < 0 || j >= SEQ_LEN) continue;
    const offset = j - scroll;
    if (offset > AHEAD || offset < BEHIND) continue;
    const isNow = j === s.idx;
    const y = HIT_Y - offset * SPACING;
    let scale: number;
    let alpha: number;
    if (offset >= 0) {
      scale = Math.max(0.44, 1 - offset * 0.12);
      alpha = Math.max(0.14, 1 - offset * 0.17);
    } else {
      const tt = -offset;
      scale = 1 + tt * 0.18;
      alpha = Math.max(0, 1 - tt * 1.5);
    }
    if (alpha <= 0.02) continue;

    const pop = isNow && s.flash > 0 ? 1 + (s.flash / FLASH) * 0.14 : 1;
    const sz = TILE * scale * pop;
    const shakeX = isNow && s.wrong > 0 ? (Math.random() * 2 - 1) * 5 : 0;
    const v = s.seq[j];

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(LANE_X + shakeX, y);
    ctx.fillStyle = COL.golddim;
    ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
    ctx.strokeStyle = isNow ? (s.wrong > 0 ? COL.error : COL.gold) : COL.gold;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = isNow ? 14 : 4;
    ctx.lineWidth = isNow ? 2.5 : 1.5;
    ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
    // 방향 + 글자 (0=U=◀, 1=I=▶)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isNow ? COL.text : COL.gold;
    ctx.font = `${Math.max(9, Math.round(11 * scale))}px ${ARCADE}`;
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillText(v === 0 ? '◀' : '▶', 0, -sz * 0.26);
    ctx.globalAlpha = alpha;
    ctx.font = `${Math.max(12, Math.round(30 * scale))}px ${ARCADE}`;
    ctx.fillText(v === 0 ? 'U' : 'I', 0, sz * 0.12);
    ctx.restore();
  }

  // 히트라인
  ctx.save();
  ctx.strokeStyle = s.flash > 0 ? COL.text : COL.gold;
  ctx.shadowColor = COL.gold;
  ctx.shadowBlur = s.flash > 0 ? 18 : 10;
  ctx.lineWidth = s.flash > 0 ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(LANE_X - LANE_HALF + 6, HIT_Y + TILE / 2 + 6);
  ctx.lineTo(LANE_X + LANE_HALF - 6, HIT_Y + TILE / 2 + 6);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = COL.gold;
  ctx.font = `10px ${ARCADE}`;
  ctx.textAlign = 'left';
  ctx.fillText('NOW', LANE_X - LANE_HALF + 4, HIT_Y + TILE / 2 + 26);
  ctx.restore();

  // 점수 잭팟 (SCORE n / 30)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = COL.muted;
  ctx.font = `10px ${ARCADE}`;
  ctx.fillText('SCORE', LANE_X, 34);
  ctx.fillStyle = COL.gold;
  ctx.shadowColor = COL.gold;
  ctx.shadowBlur = s.flash > 0 ? 22 : 12;
  ctx.font = `40px ${ARCADE}`;
  ctx.fillText(String(s.score), LANE_X - 26, 74);
  ctx.shadowBlur = 0;
  ctx.fillStyle = COL.muted;
  ctx.font = `14px ${ARCADE}`;
  ctx.textAlign = 'left';
  ctx.fillText(`/${FARM_TARGET}`, LANE_X + 4, 74);
  ctx.restore();

  // 타이머 (좌상단)
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = COL.muted;
  ctx.font = `10px ${ARCADE}`;
  ctx.fillText('TIME', 20, 34);
  ctx.fillStyle = urgent ? COL.error : COL.text;
  ctx.shadowColor = urgent ? COL.error : COL.text;
  ctx.shadowBlur = urgent ? 14 : 4;
  ctx.font = `24px ${ARCADE}`;
  ctx.fillText(remain.toFixed(1), 20, 66);
  ctx.restore();

  // 타임 게이지 (하단)
  ctx.save();
  const ratio = remain / FARM_DURATION;
  ctx.fillStyle = COL.deep;
  ctx.fillRect(20, CH - 26, CW - 40, 10);
  ctx.fillStyle = urgent ? COL.error : COL.gold;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(20, CH - 26, (CW - 40) * ratio, 10);
  ctx.restore();

  void now;
}

// ── 컴포넌트 ────────────────────────────────────────────────────
type Phase = 'ready' | 'playing' | 'success' | 'fail';

export default function CoinFarm() {
  useDebugScreen('scr-coin-farm');
  const navigate = useNavigate();
  const session = useSession();

  const [phase, setPhase] = useState<Phase>('ready');
  const [failReason, setFailReason] = useState<'wrong' | 'timeout'>('timeout');
  /** 보상: null = 수령 중, 숫자 = 획득 코인 */
  const [reward, setReward] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<FarmState | null>(null);
  const eventsRef = useRef<GameInputEvent[]>([]);
  const scrollRef = useRef(0);
  const phaseRef = useRef<Phase>('ready');
  phaseRef.current = phase;

  const [uLit, flashU] = useKeyLamp();
  const [iLit, flashI] = useKeyLamp();
  const lampRef = useRef({ flashU, flashI });
  lampRef.current = { flashU, flashI };

  // 진입 시 서버와 세션 동기화 — 서버 재시작 등으로 세션이 죽었으면
  // 클라 상태가 로그아웃으로 내려가 플레이 전에 로그인 안내가 뜬다 (헛 클리어 방지)
  useEffect(() => {
    void restoreSession();
  }, []);

  /**
   * 보상 수령 — 실패 유형별 복구:
   *  · COOLDOWN(연속 클리어): 서버가 준 남은 시간만큼 기다렸다 1회 자동 재시도
   *  · UNAUTHENTICATED: claimFarmReward가 세션을 로그아웃으로 내림 → 로그인 패널 표시,
   *    재로그인 후 [보상 다시 받기]로 이 함수를 다시 호출하면 수령된다
   *  · 네트워크 오류: 에러 표시 + [보상 다시 받기]
   */
  const doClaim = useCallback(async () => {
    setReward(null);
    setClaimError(null);
    let r = await claimFarmReward();
    if (r.code === 'COOLDOWN') {
      // 서버가 남은 시간을 안 줬으면 쿨다운 전체만큼 대기 (보수적 fallback)
      const waitMs = (r.retryAfterMs ?? FARM_CLAIM_COOLDOWN_MS) + 300;
      await new Promise((res) => setTimeout(res, waitMs));
      r = await claimFarmReward();
    }
    if (r.reward !== undefined) setReward(r.reward);
    else setClaimError(r.error ?? '보상 수령 실패');
  }, []);

  // 캔버스 dpr × 표시 배율 스케일 (그리기 코드는 논리 480×450 그대로)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * DISPLAY_SCALE;
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // 키 입력 — playing 중에만 큐에 수집 (U/I 램프 점등)
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => performance.now() / 1000,
      (e) => {
        if (e.type === 'down') {
          if (e.code === 'KeyU') lampRef.current.flashU();
          else if (e.code === 'KeyI') lampRef.current.flashI();
        }
        if (phaseRef.current === 'playing') eventsRef.current.push(e);
      },
    );
    return () => {
      detach();
      setDebugGame(null);
    };
  }, []);

  // 게임 루프 — playing 동안 rAF (step + draw)
  useEffect(() => {
    if (phase !== 'playing') return;

    const st = createFarm();
    stateRef.current = st;
    eventsRef.current = [];
    scrollRef.current = 0;
    setDebugGame(st);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = stateRef.current;
      const ctx = canvasRef.current?.getContext('2d');
      if (!s) return;
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;

      if (s.outcome === null) {
        const events = eventsRef.current;
        eventsRef.current = [];
        stepFarm(s, events, dt);
        setDebugGame(s);

        if (s.outcome !== null) {
          // 판정 — 짧은 여운 후 오버레이 (마지막 프레임은 그려짐)
          const out: Outcome = s.outcome;
          window.setTimeout(() => {
            if (out === 'success') {
              setPhase('success');
              void doClaim();
            } else {
              setFailReason(out === 'wrong' ? 'wrong' : 'timeout');
              setPhase('fail');
            }
          }, 450);
        }
      }

      const ease = Math.min(1, dt * 18);
      scrollRef.current += (s.idx - scrollRef.current) * ease;
      if (ctx) drawFarm(ctx, s, scrollRef.current, now);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, doClaim]);

  // 비로그인(또는 서버 세션 소멸) — 리다이렉트 대신 로그인 안내 패널.
  // 미션 클리어 후 401로 로그아웃된 경우에도 이 패널로 재로그인하면
  // 컴포넌트 state(phase='success')가 살아 있어 [보상 다시 받기]가 가능하다.
  if (!session.loggedIn) {
    return (
      <main data-testid="scr-coin-farm" className="cf-root">
        <div className="vanish-grid dim" aria-hidden />
        <div className="cf-topbar">
          <Button variant="tertiary" data-testid="btn-farm-exit" onClick={() => navigate('/select')}>
            ◀ 나가기
          </Button>
          <span className="cf-title font-arcade c-muted">COIN FARM</span>
          <span className="cf-topbar-spacer" aria-hidden />
        </div>
        <div className="cf-login-req" data-testid="farm-login-required">
          <span className="font-arcade c-accent glow-text cf-overlay__big">COIN FARM</span>
          <p className="font-display cf-overlay__rules">
            코인은 계정 재화라서 <strong className="c-accent">로그인</strong>이 필요합니다.
          </p>
          <div className="cf-overlay__actions">
            <Button variant="primary" data-testid="btn-farm-login" onClick={() => openLoginModal()}>
              로그인
            </Button>
            <Button variant="tertiary" onClick={() => navigate('/select')}>
              돌아가기
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main data-testid="scr-coin-farm" className="cf-root">
      <div className="vanish-grid dim" aria-hidden />

      <div className="cf-topbar">
        <Button variant="tertiary" data-testid="btn-farm-exit" onClick={() => navigate('/select')}>
          ◀ 나가기
        </Button>
        <span className="cf-title font-arcade c-muted">COIN FARM</span>
        <span className="cf-coins font-arcade c-accent glow-text" data-testid="coin-balance">
          🪙 {session.coins}
        </span>
      </div>

      <div data-testid="farm-stage" className="crt-bezel cf-stage">
        <canvas ref={canvasRef} className="cf-canvas" aria-label="코인 노가다 스테이지 — 솔로 펌프" />

        {phase === 'ready' && (
          <div className="cf-overlay" data-testid="farm-ready">
            <span className="font-arcade c-accent glow-text cf-overlay__big">COIN MISSION</span>
            <p className="font-display cf-overlay__rules">
              {FARM_DURATION}초 안에 <strong className="c-accent">{FARM_TARGET}점</strong>을 달성하면 코인 획득!
              <br />
              틀린 키를 누르면 <strong className="c-error">그 즉시 실패</strong>합니다.
            </p>
            <Button variant="primary" coin data-testid="btn-farm-start" onClick={() => setPhase('playing')}>
              시작하기
            </Button>
          </div>
        )}

        {phase === 'success' && (
          <div className="cf-overlay" data-testid="farm-success">
            <span className="font-arcade cf-overlay__big cf-win glow-text">MISSION COMPLETE!</span>
            {reward !== null ? (
              <span className="font-arcade cf-reward c-accent glow-text" data-testid="farm-reward">
                +{reward} COIN
              </span>
            ) : claimError ? (
              <>
                <span className="font-display c-error">{claimError}</span>
                {/* 보상 유실 방지 — 수령 실패(네트워크/쿨다운/재로그인 직후)는 재시도 가능 */}
                <Button variant="secondary" data-testid="btn-farm-reclaim" onClick={() => void doClaim()}>
                  보상 다시 받기
                </Button>
              </>
            ) : (
              <span className="font-arcade c-muted cf-rolling">ROLLING…</span>
            )}
            <div className="cf-overlay__actions">
              <Button
                variant="primary"
                data-testid="btn-farm-retry"
                onClick={() => setPhase('ready')}
                disabled={reward === null && !claimError}
              >
                다시 도전
              </Button>
              <Button variant="tertiary" onClick={() => navigate('/select')}>
                나가기
              </Button>
            </div>
          </div>
        )}

        {phase === 'fail' && (
          <div className="cf-overlay" data-testid="farm-fail">
            <span className="font-arcade cf-overlay__big cf-lose glow-text">MISSION FAILED</span>
            <span className="font-display c-muted">
              {failReason === 'wrong' ? '틀린 키를 눌렀습니다!' : `시간 안에 ${FARM_TARGET}점을 못 채웠습니다`}
            </span>
            <div className="cf-overlay__actions">
              <Button variant="primary" data-testid="btn-farm-retry" onClick={() => setPhase('ready')}>
                다시 도전
              </Button>
              <Button variant="tertiary" onClick={() => navigate('/select')}>
                나가기
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 온스크린 키캡 — U/I 전용 */}
      <div className="cf-keys">
        <KeyCap role="P2" keyChar="U" icon="◀" lit={uLit} label="왼쪽" />
        <KeyCap role="P2" keyChar="I" icon="▶" lit={iLit} label="오른쪽" />
        <span className="cf-keys__hint font-arcade c-muted">HIT THE GLOWING PAD</span>
      </div>
    </main>
  );
}
