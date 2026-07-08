/**
 * Coin Farm (scr-coin-farm) — earn coins with a solo Pump mission (docs/COINS.md).
 * Container testid: scr-coin-farm / parts: btn-farm-start, btn-farm-retry, btn-farm-exit, farm-stage
 *
 * ── Rules (shared/src/coins.ts FARM_*) ───────────────────────────
 *  · For a single logged-in user only. Uses only the U/I keys (P2 lane grammar of Game 6 Pump).
 *  · Land 30 correct hits (FARM_TARGET) within the 10s time limit (FARM_DURATION) → MISSION COMPLETE,
 *    the server (/api/farm/claim) draws a reward from a probability table (expected value ~5 coins, 1~100).
 *  · Time out → MISSION FAILED (no reward).
 *  · A single wrong key → instant MISSION FAILED.
 *
 * ── Screen ──────────────────────────────────────────────────────
 *  Condenses Game 6's note-highway visual into a single lane (canvas). Built-in score jackpot / timer.
 *  ready → (Start) → playing → success (shows reward) | fail (shows reason) → Play again.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FARM_CLAIM_COOLDOWN_MS, FARM_DURATION, FARM_TARGET } from '@madcade/shared';
import type { GameInputEvent } from '@madcade/shared';
import { attachLocalKeyboard } from '../game/input/keyboard';
import { Button, KeyCap, useKeyLamp } from '../components';
import { claimFarmReward, restoreSession, useSession } from '../state/session';
import { openLoginModal } from '../modals/Login';
import { setDebugGame, useDebugScreen } from '../debug';
import './coin-farm.css';

// ── Solo Pump logic (Game 6 P2 lane rules + mission judging) ─────────────
const FLASH = 0.12;
/** Sequence length — target 30 hits + preview headroom */
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
    if (e.code !== 'KeyU' && e.code !== 'KeyI') continue; // farming is U/I only (Q/W ignored)
    const got = e.code === 'KeyU' ? 0 : 1;
    if (got === s.seq[s.idx]) {
      s.score += 1;
      s.idx += 1;
      s.flash = FLASH;
      if (s.score >= FARM_TARGET) {
        s.outcome = 'success'; // target reached — early exit
        return s;
      }
    } else {
      s.wrong = FLASH;
      s.outcome = 'wrong'; // one wrong answer = instant fail
      return s;
    }
  }

  if (s.elapsed >= FARM_DURATION) s.outcome = 'timeout';
  return s;
}

// ── Canvas render (single-lane condensation of Game 6 lane grammar) ──────────────────
const CW = 480;
const CH = 450;
/** Display scale — keeps logical coords (480×450) but bumps canvas resolution and CSS size by 1.5× (preserves sharpness) */
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

  // Lane panel
  ctx.save();
  ctx.fillStyle = COL.deep;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(LANE_X - LANE_HALF, 96, LANE_HALF * 2, 312);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = urgent ? 'rgba(255,56,100,0.4)' : 'rgba(253,245,0,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(LANE_X - LANE_HALF, 96, LANE_HALF * 2, 312);
  ctx.restore();

  // Tile highway
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
    // Direction + letter (0=U=◀, 1=I=▶)
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

  // Hit line
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

  // Score jackpot (SCORE n / 30)
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

  // Timer (top-left)
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

  // Time gauge (bottom)
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

// ── Component ────────────────────────────────────────────────────
type Phase = 'ready' | 'playing' | 'success' | 'fail';

export default function CoinFarm() {
  useDebugScreen('scr-coin-farm');
  const navigate = useNavigate();
  const session = useSession();

  const [phase, setPhase] = useState<Phase>('ready');
  const [failReason, setFailReason] = useState<'wrong' | 'timeout'>('timeout');
  /** Reward: null = claiming, number = coins earned */
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

  // Sync the session with the server on entry — if the session died (e.g. server restart),
  // the client state drops to logged-out so the login prompt appears before playing (prevents wasted clears)
  useEffect(() => {
    void restoreSession();
  }, []);

  /**
   * Reward claim — recovery per failure type:
   *  · COOLDOWN (back-to-back clears): waits out the remaining time given by the server, then auto-retries once
   *  · UNAUTHENTICATED: claimFarmReward drops the session to logged-out → shows the login panel,
   *    after re-logging in, calling this function again via [Claim reward again] collects it
   *  · Network error: shows the error + [Claim reward again]
   */
  const doClaim = useCallback(async () => {
    setReward(null);
    setClaimError(null);
    let r = await claimFarmReward();
    if (r.code === 'COOLDOWN') {
      // If the server didn't provide the remaining time, wait the full cooldown (conservative fallback)
      const waitMs = (r.retryAfterMs ?? FARM_CLAIM_COOLDOWN_MS) + 300;
      await new Promise((res) => setTimeout(res, waitMs));
      r = await claimFarmReward();
    }
    if (r.reward !== undefined) setReward(r.reward);
    else setClaimError(r.error ?? 'Reward claim failed');
  }, []);

  // Canvas dpr × display-scale scaling (drawing code stays logical 480×450)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * DISPLAY_SCALE;
    c.width = CW * dpr;
    c.height = CH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
  }, []);

  // Key input — queued only while playing (lights the U/I lamps)
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

  // Game loop — rAF while playing (step + draw)
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
          // Judging — overlay after a short beat (the last frame still draws)
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

  // Not logged in (or server session gone) — a login prompt panel instead of a redirect.
  // Even when logged out by a 401 after clearing the mission, re-logging in via this panel
  // keeps the component state (phase='success') alive, so [Claim reward again] is possible.
  if (!session.loggedIn) {
    return (
      <main data-testid="scr-coin-farm" className="cf-root">
        <div className="vanish-grid dim" aria-hidden />
        <div className="cf-topbar">
          <Button variant="tertiary" data-testid="btn-farm-exit" onClick={() => navigate('/select')}>
            ◀ Exit
          </Button>
          <span className="cf-title font-arcade c-muted">COIN FARM</span>
          <span className="cf-topbar-spacer" aria-hidden />
        </div>
        <div className="cf-login-req" data-testid="farm-login-required">
          <span className="font-arcade c-accent glow-text cf-overlay__big">COIN FARM</span>
          <p className="font-display cf-overlay__rules">
            Coins are account currency, so you need to <strong className="c-accent">log in</strong>.
          </p>
          <div className="cf-overlay__actions">
            <Button variant="primary" data-testid="btn-farm-login" onClick={() => openLoginModal()}>
              Log in
            </Button>
            <Button variant="tertiary" onClick={() => navigate('/select')}>
              Go back
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
          ◀ Exit
        </Button>
        <span className="cf-title font-arcade c-muted">COIN FARM</span>
        <span className="cf-coins font-arcade c-accent glow-text" data-testid="coin-balance">
          🪙 {session.coins}
        </span>
      </div>

      <div data-testid="farm-stage" className="crt-bezel cf-stage">
        <canvas ref={canvasRef} className="cf-canvas" aria-label="Coin Farm stage — solo Pump" />

        {phase === 'ready' && (
          <div className="cf-overlay" data-testid="farm-ready">
            <span className="font-arcade c-accent glow-text cf-overlay__big">COIN MISSION</span>
            <p className="font-display cf-overlay__rules">
              Reach <strong className="c-accent">{FARM_TARGET} points</strong> within {FARM_DURATION}s to earn coins!
              <br />
              Press the wrong key and you <strong className="c-error">fail instantly</strong>.
            </p>
            <Button variant="primary" coin data-testid="btn-farm-start" onClick={() => setPhase('playing')}>
              Start
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
                {/* Prevents lost rewards — a failed claim (network/cooldown/just after re-login) can be retried */}
                <Button variant="secondary" data-testid="btn-farm-reclaim" onClick={() => void doClaim()}>
                  Claim reward again
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
                Play again
              </Button>
              <Button variant="tertiary" onClick={() => navigate('/select')}>
                Exit
              </Button>
            </div>
          </div>
        )}

        {phase === 'fail' && (
          <div className="cf-overlay" data-testid="farm-fail">
            <span className="font-arcade cf-overlay__big cf-lose glow-text">MISSION FAILED</span>
            <span className="font-display c-muted">
              {failReason === 'wrong' ? 'You pressed the wrong key!' : `Didn't reach ${FARM_TARGET} points in time`}
            </span>
            <div className="cf-overlay__actions">
              <Button variant="primary" data-testid="btn-farm-retry" onClick={() => setPhase('ready')}>
                Play again
              </Button>
              <Button variant="tertiary" onClick={() => navigate('/select')}>
                Exit
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* On-screen keycaps — U/I only */}
      <div className="cf-keys">
        <KeyCap role="P2" keyChar="U" icon="◀" lit={uLit} label="Left" />
        <KeyCap role="P2" keyChar="I" icon="▶" lit={iLit} label="Right" />
        <span className="cf-keys__hint font-arcade c-muted">HIT THE GLOWING PAD</span>
      </div>
    </main>
  );
}
