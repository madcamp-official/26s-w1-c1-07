/**
 * S12 게임3 — 펜싱 (scr-game3). 담당: game3 에이전트.
 *
 * PLAN §2-S12 + §3.3 "그리드 피스트와 와이어프레임 바다":
 *   발광 그리드 플랫폼 + 양끝 와이어프레임 바다, 좌=시안/우=핑크 네온 스틱 검객,
 *   매 1초 틱마다 머리 위 픽셀 칩(⚔/🛡/·)으로 행동 동시 공개,
 *   밀림=하드 스텝 후퇴+발밑 스파크+"TOUCHÉ!", 동일행동="CLASH"+셰이크,
 *   링아웃=회전 낙하+스플래시+글리치+"RING OUT!", 남은 칸 램프 병기.
 *
 * 배선 (ARCHITECTURE §3.3 표준):
 *   - @shared createGame3State({ roundDurationMs }) / tickGame3 — 판정 재구현 금지
 *   - attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, …)  q/u=ATTACK, w/i=DODGE
 *   - 매 틱 setDebugGame(state), 언마운트 시 setDebugGame(null)
 *   - state.result 확정 → (링아웃/타임업 연출 후) reportRoundEnd → <ResultOverlay />
 *   - 온라인 모드: P2는 봇 — 틱 윈도우마다 랜덤 행동(공/회/무), 키보드 P2 입력 무시
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_KEYBOARD_MAP,
  attachKeyboardAdapter,
  createGame3State,
  tickGame3,
} from '@shared';
import type { Game3Action, Game3Move, Game3State, PlayerRole } from '@shared';
import { setDebugGame, useDebugScreen } from '../../debug';
import {
  exitMatch,
  getFlow,
  getPlayerDisplays,
  getRoundWins,
  reportRoundEnd,
  startOfflineGame,
  useFlow,
} from '../../state/flow';
import { Button, HudFrame, KeyCap, useKeyLamp } from '../../components';
import ResultOverlay from './ResultOverlay';
import './game3.css';

// 연출 상수 (로직 비침범 — 판정은 전부 @shared)
const POSE_MS = 900; // 틱 판정 직후 포즈/칩 공개 시간
const RINGOUT_FX_MS = 1400; // 낙하+스플래시 연출 후 결과 오버레이
const TIMEUP_FX_MS = 1000; // TIME UP! 캡션 후 결과 오버레이
const METER_SEGS = 5;

type Pose = 'NEUTRAL' | 'ATTACK' | 'DODGE';

const MOVE_ICON: Record<Game3Move, string> = { ATTACK: '⚔', DODGE: '🛡', NONE: '·' };

// ---------------------------------------------------------------------------
// 네온 스틱 검객 (2px 스트로크 아웃라인 — §3.3)
// ---------------------------------------------------------------------------

function FencerSvg({ pose }: { pose: Pose }) {
  return (
    <svg viewBox="0 0 110 120" className={`g3-fencer g3-fencer--${pose.toLowerCase()}`} aria-hidden>
      {pose === 'ATTACK' && (
        <g>
          {/* 런지: 전방 기울임 + 검 수평 돌출 + 검끝 광점 */}
          <circle cx="52" cy="30" r="9" />
          <line x1="52" y1="39" x2="42" y2="74" />
          <line x1="42" y1="74" x2="62" y2="100" />
          <line x1="62" y1="100" x2="71" y2="100" />
          <line x1="42" y1="74" x2="24" y2="100" />
          <line x1="50" y1="48" x2="72" y2="46" />
          <line x1="72" y1="46" x2="100" y2="46" />
          <circle cx="102" cy="46" r="3" className="g3-swordtip" />
          <line x1="50" y1="48" x2="36" y2="60" />
        </g>
      )}
      {pose === 'DODGE' && (
        <g>
          {/* 상체 후퇴 + 방패 원호 전개 */}
          <circle cx="34" cy="34" r="9" />
          <line x1="34" y1="43" x2="42" y2="78" />
          <line x1="42" y1="78" x2="30" y2="102" />
          <line x1="42" y1="78" x2="54" y2="102" />
          <line x1="36" y1="54" x2="54" y2="58" />
          <path d="M 60 40 A 20 20 0 0 1 60 78" />
          <line x1="36" y1="54" x2="26" y2="70" />
          <line x1="26" y1="70" x2="32" y2="84" />
        </g>
      )}
      {pose === 'NEUTRAL' && (
        <g>
          {/* 중립 겨눔 */}
          <circle cx="42" cy="26" r="9" />
          <line x1="42" y1="35" x2="40" y2="72" />
          <line x1="40" y1="72" x2="30" y2="100" />
          <line x1="40" y1="72" x2="50" y2="100" />
          <line x1="41" y1="46" x2="30" y2="58" />
          <line x1="41" y1="46" x2="58" y2="52" />
          <line x1="58" y1="52" x2="82" y2="42" />
          <circle cx="84" cy="41" r="2.2" className="g3-swordtip" />
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 와이어프레임 바다 (시안 지그재그 2~3겹, steps 출렁 — §3.3)
// ---------------------------------------------------------------------------

function zigzag(y: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 12; i++) pts.push(`${i * 10},${y + (i % 2 === 0 ? 5 : -5)}`);
  return pts.join(' ');
}

function Sea({ side, splashKey }: { side: 'left' | 'right'; splashKey: number | null }) {
  return (
    <div className={`g3-sea g3-sea--${side}`} aria-hidden>
      <svg viewBox="0 0 120 60" preserveAspectRatio="none">
        <polyline points={zigzag(12)} className="g3-wave g3-wave--1" />
        <polyline points={zigzag(30)} className="g3-wave g3-wave--2" />
        <polyline points={zigzag(48)} className="g3-wave g3-wave--3" />
      </svg>
      {splashKey !== null && (
        <div className="g3-splash" key={splashKey}>
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 화면
// ---------------------------------------------------------------------------

export default function Game3() {
  useDebugScreen('scr-game3');
  const flow = useFlow();
  const navigate = useNavigate();

  const [game, setGame] = useState<Game3State | null>(null);
  const gameRef = useRef<Game3State | null>(null);
  const queueRef = useRef<Game3Action[]>([]);
  const reportedRef = useRef(false);
  const reportTimerRef = useRef<number | null>(null);
  const botRef = useRef<{ window: number; atMs: number; move: Game3Move; done: boolean } | null>(
    null,
  );

  // 키캡 램프 (입력 순간 80ms 점등 — §1.4)
  const [litP1Atk, flashP1Atk] = useKeyLamp();
  const [litP1Dod, flashP1Dod] = useKeyLamp();
  const [litP2Atk, flashP2Atk] = useKeyLamp();
  const [litP2Dod, flashP2Dod] = useKeyLamp();
  const flashRef = useRef({
    P1: { key1: flashP1Atk, key2: flashP1Dod },
    P2: { key1: flashP2Atk, key2: flashP2Dod },
  });
  flashRef.current = {
    P1: { key1: flashP1Atk, key2: flashP1Dod },
    P2: { key1: flashP2Atk, key2: flashP2Dod },
  };

  // direct-URL 복구: 매치 컨텍스트가 없으면 오프라인 게임3으로 (§3.3)
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 3) startOfflineGame(3);
  }, []);

  // 라운드 (재)시작 — currentRound 변화마다 새 @shared state 생성
  useEffect(() => {
    const f = getFlow();
    if (f.gameId !== 3 || f.currentRound < 1) return;
    const st = createGame3State({ roundDurationMs: f.roundConfig.timePerRoundSec * 1000 });
    gameRef.current = st;
    queueRef.current = [];
    reportedRef.current = false;
    botRef.current = null;
    setGame(st);
    setDebugGame(st);
  }, [flow.gameId, flow.currentRound]);

  // 키보드: q/u=ATTACK(key1), w/i=DODGE(key2) — 마지막 입력 채택은 @shared 코어 담당
  useEffect(() => {
    const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
      if (ev.phase !== 'down') return;
      const f = getFlow();
      if (f.phase !== 'playing') return;
      // 온라인 모드에선 P2 자리(u/i)는 봇 전용 — 로컬 키 입력 무시
      if (f.mode === 'online' && ev.player === 'P2') return;
      const type: Game3Action['type'] = ev.key === 'key1' ? 'ATTACK' : 'DODGE';
      queueRef.current.push({ gameId: 3, player: ev.player, type });
      flashRef.current[ev.player][ev.key]();
    });
    return detach;
  }, []);

  // 게임 루프 — rAF(전경 60fps) + interval 워치독(백그라운드 탭에서 rAF 정지 대비).
  // 두 드라이버가 같은 시계(last)를 공유하므로 이중 진행은 없다.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.max(0, Math.min(1000, now - last));
      last = now;
      const st = gameRef.current;
      if (!st || st.result !== null) return;

      // 봇(온라인 mock): 틱 윈도우마다 랜덤 행동을 윈도우 내 랜덤 시점에 주입
      if (getFlow().mode === 'online') {
        if (!botRef.current || botRef.current.window !== st.tickCount) {
          const r = Math.random();
          const move: Game3Move = r < 1 / 3 ? 'ATTACK' : r < 2 / 3 ? 'DODGE' : 'NONE';
          botRef.current = {
            window: st.tickCount,
            atMs: 120 + Math.random() * Math.max(0, st.config.tickIntervalMs - 320),
            move,
            done: false,
          };
        }
        const bot = botRef.current;
        if (!bot.done && st.windowElapsedMs >= bot.atMs) {
          bot.done = true;
          if (bot.move !== 'NONE') {
            queueRef.current.push({ gameId: 3, player: 'P2', type: bot.move });
          }
        }
      }

      const inputs = queueRef.current;
      queueRef.current = [];
      const next = tickGame3(st, inputs, dt);
      gameRef.current = next;
      setGame(next);
      setDebugGame(next);

      // 승패 확정 → 링아웃/타임업 연출 후 라운드 결과 보고 (라운드당 1회)
      if (next.result !== null && !reportedRef.current) {
        reportedRef.current = true;
        const delay = next.resultReason === 'RING_OUT' ? RINGOUT_FX_MS : TIMEUP_FX_MS;
        const result = next.result;
        reportTimerRef.current = window.setTimeout(() => reportRoundEnd(result), delay);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      step(now);
    };
    raf = requestAnimationFrame(loop);
    const iv = window.setInterval(() => step(performance.now()), 250);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
    };
  }, []);

  // 언마운트 정리
  useEffect(
    () => () => {
      if (reportTimerRef.current !== null) clearTimeout(reportTimerRef.current);
      setDebugGame(null);
    },
    [],
  );

  // ------------------------------------------------------------------ 파생값
  const online = flow.mode === 'online';
  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const keys = DEFAULT_KEYBOARD_MAP;

  const trackLength = game?.view.trackLength ?? 8;
  const lt = game?.lastTick ?? null;
  // 틱 판정 직후 POSE_MS 동안 포즈/칩 공개 (결과 확정 후엔 유지)
  const reveal =
    game !== null &&
    game.tickCount > 0 &&
    lt !== null &&
    (game.result !== null || game.windowElapsedMs < POSE_MS);

  const poseOf = (role: PlayerRole): Pose => {
    if (!reveal || !lt) return 'NEUTRAL';
    const m = lt.moves[role];
    return m === 'NONE' ? 'NEUTRAL' : m;
  };

  const p1Cell = game?.view.p1Cell ?? 3;
  const p2Cell = game?.view.p2Cell ?? 4;
  const p1Fell = game !== null && p1Cell < 0;
  const p2Fell = game !== null && p2Cell > trackLength - 1;
  const leftPct = (cell: number) => `${14 + ((cell + 0.5) / trackLength) * 72}%`;

  const urgent = game !== null && game.result === null && game.view.timeRemainingMs <= 5000;
  const meterLit = game
    ? Math.min(
        METER_SEGS,
        Math.floor((game.windowElapsedMs / game.config.tickIntervalMs) * METER_SEGS),
      )
    : 0;
  const startDist = game?.config.startDistanceFromEdge ?? 3;

  const ringOut = game !== null && game.result !== null && game.resultReason === 'RING_OUT';
  const endcapColor =
    game?.result === 'P1_WIN'
      ? 'var(--p1)'
      : game?.result === 'P2_WIN'
        ? 'var(--p2)'
        : 'var(--accent2)';

  // 판정 캡션: 밀림(TOUCHÉ!, 승자색) / 동일행동(CLASH — 무·무는 무연출)
  const callout =
    reveal && lt && !lt.fell
      ? lt.pushed
        ? {
            text: 'TOUCHÉ!',
            color: lt.pushed === 'P1' ? 'var(--p2)' : 'var(--p1)',
            clash: false,
          }
        : lt.clash && lt.moves.P1 !== 'NONE'
          ? { text: '✦ CLASH ✦', color: 'var(--text)', clash: true }
          : null
      : null;

  const stanceIcon = (role: PlayerRole) => {
    if (!game) return '·';
    if (online && role === 'P2') return '?'; // 봇의 선택은 판정 전까지 비공개
    return MOVE_ICON[game.pending[role]];
  };

  const fighterFx = (role: PlayerRole) => {
    const fell = role === 'P1' ? p1Fell : p2Fell;
    return (
      <>
        {reveal && lt && (
          <span
            key={lt.tickIndex}
            className={`g3-chip font-arcade ${game?.result !== null ? 'g3-chip--hold' : ''}`}
          >
            {MOVE_ICON[lt.moves[role]]}
          </span>
        )}
        {reveal && lt && lt.pushed === role && !fell && (
          <span key={`sp-${lt.tickIndex}`} className="g3-sparks" aria-hidden>
            <i />
            <i />
          </span>
        )}
      </>
    );
  };

  // ------------------------------------------------------------------ 렌더
  return (
    <main data-testid="scr-game3" className="g3-root">
      <div className="vanish-grid dim" aria-hidden />
      <div className="g3-inner">
        <header className="g3-topbar">
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
          <div className="g3-hud">
            <HudFrame
              p1={players.P1}
              p2={players.P2}
              roundWins={wins}
              roundCount={flow.roundConfig.roundCount}
              currentRound={Math.max(1, flow.currentRound)}
              timeRemainingMs={game?.view.timeRemainingMs ?? flow.roundConfig.timePerRoundSec * 1000}
            />
          </div>
        </header>

        <section data-testid="game-stage" className={`g3-stage crt-bezel ${urgent ? 'urgent' : ''}`}>
          <div className={`g3-arena ${game?.result !== null && game ? 'g3-arena--glitch' : ''}`}>
            {/* 틱 진행 미터 — 1초 판정 리듬 표시 */}
            <div className="g3-tickmeter" aria-hidden>
              <span className="g3-tickmeter__label font-arcade">TICK {game?.tickCount ?? 0}</span>
              <span className="g3-tickmeter__segs">
                {Array.from({ length: METER_SEGS }, (_, i) => (
                  <span key={i} className={`g3-tickmeter__seg ${i < meterLit ? 'lit' : ''}`} />
                ))}
              </span>
            </div>

            {/* 남은 칸 램프 (밀릴 때마다 소등 + 플리커 — §3.3) */}
            <div className="g3-safe g3-safe--p1" key={`safe1-${game?.players.P1.pushedCount ?? 0}`}>
              <span className="g3-safe__label font-arcade c-p1">P1 SAFE</span>
              <span className="lamps">
                {Array.from({ length: startDist }, (_, i) => (
                  <span
                    key={i}
                    className={`lamp ${i < Math.max(0, game?.players.P1.distanceFromEdge ?? startDist) ? 'lit' : ''}`}
                    style={{ '--lamp-color': 'var(--p1)' } as CSSProperties}
                  />
                ))}
              </span>
            </div>
            <div className="g3-safe g3-safe--p2" key={`safe2-${game?.players.P2.pushedCount ?? 0}`}>
              <span className="g3-safe__label font-arcade c-p2">P2 SAFE</span>
              <span className="lamps">
                {Array.from({ length: startDist }, (_, i) => (
                  <span
                    key={i}
                    className={`lamp ${i < Math.max(0, game?.players.P2.distanceFromEdge ?? startDist) ? 'lit' : ''}`}
                    style={{ '--lamp-color': 'var(--p2)' } as CSSProperties}
                  />
                ))}
              </span>
            </div>

            {/* 바다 (양끝 낭떠러지 밖) */}
            <Sea side="left" splashKey={ringOut && lt?.fell === 'P1' ? lt.tickIndex : null} />
            <Sea side="right" splashKey={ringOut && lt?.fell === 'P2' ? lt.tickIndex : null} />

            {/* 플랫폼: 그리드 상판(칸 경계 눈금 + 칸 램프 + 끝단 경고) + #000 옆면 */}
            <div className="g3-deck" aria-hidden>
              <div
                className={`g3-deck-top ${callout?.clash ? 'g3-deck-top--shake' : ''}`}
                key={callout?.clash && lt ? `shake-${lt.tickIndex}` : 'deck'}
              >
                {Array.from({ length: trackLength }, (_, i) => (
                  <div
                    key={i}
                    className={`g3-cell ${i === 0 || i === trackLength - 1 ? 'g3-cell--edge' : ''}`}
                  >
                    <span
                      className={`g3-cell-lamp ${
                        i === p1Cell ? 'g3-cell-lamp--p1' : i === p2Cell ? 'g3-cell-lamp--p2' : ''
                      }`}
                    />
                  </div>
                ))}
              </div>
              <div className="g3-deck-face" />
            </div>

            {/* 검객 — 좌=P1 시안 / 우=P2 핑크 (색 구분 절대 고정) */}
            <div
              className={`g3-fighter g3-fighter--p1 ${p1Fell ? 'g3-fighter--fall' : ''}`}
              style={{ left: leftPct(p1Cell) }}
              aria-label={`P1 위치: 낭떠러지까지 ${Math.max(0, game?.players.P1.distanceFromEdge ?? startDist)}칸`}
            >
              <FencerSvg pose={poseOf('P1')} />
              {fighterFx('P1')}
            </div>
            <div
              className={`g3-fighter g3-fighter--p2 ${p2Fell ? 'g3-fighter--fall' : ''}`}
              style={{ left: leftPct(p2Cell) }}
              aria-label={`P2 위치: 낭떠러지까지 ${Math.max(0, game?.players.P2.distanceFromEdge ?? startDist)}칸`}
            >
              <FencerSvg pose={poseOf('P2')} />
              {fighterFx('P2')}
            </div>

            {/* 판정 캡션 */}
            {callout && lt && (
              <div
                key={`co-${lt.tickIndex}`}
                className={`g3-callout font-arcade glow-text ${callout.clash ? 'g3-callout--clash' : ''}`}
                style={{ color: callout.color }}
              >
                {callout.text}
              </div>
            )}

            {/* 라운드 종료 캡션: 링아웃 승패 / 시간 종료 판정 (오버레이 직전 연출) */}
            {game !== null && game.result !== null && flow.phase === 'playing' && (
              <div
                className="g3-endcap font-arcade glow-text anim-sign-on"
                style={{ color: endcapColor }}
              >
                {game.resultReason === 'RING_OUT' ? 'RING OUT!' : 'TIME UP!'}
              </div>
            )}

            {/* 라운드 시작 사인 (비차단) */}
            <div key={`intro-${flow.currentRound}`} className="g3-intro font-arcade">
              ROUND {Math.max(1, flow.currentRound)} — FIGHT!
            </div>
          </div>
        </section>

        {/* 하단: 온스크린 키캡(실제 배정 키 표기 — SPEC Q2) + 스탠스 피드백 */}
        <footer className="g3-controls">
          <div className="g3-pad g3-pad--p1">
            <KeyCap
              role="P1"
              keyChar={keys.playerL.key1.toUpperCase()}
              icon="⚔"
              label="공격"
              lit={litP1Atk}
            />
            <KeyCap
              role="P1"
              keyChar={keys.playerL.key2.toUpperCase()}
              icon="🛡"
              label="회피"
              lit={litP1Dod}
            />
            <div className="g3-stance c-p1">
              <span className="g3-stance__label">STANCE</span>
              <span className="g3-stance__icon">{stanceIcon('P1')}</span>
            </div>
          </div>
          <div className="g3-hint c-muted">
            1초 틱 동시 판정 — 틱 안 마지막 입력 채택 · 회피는 공격을, 공격은 무행동을,
            무행동은 회피를 밀어낸다
          </div>
          <div className="g3-pad g3-pad--p2">
            <div className="g3-stance c-p2">
              <span className="g3-stance__label">{online ? 'CPU' : 'STANCE'}</span>
              <span className="g3-stance__icon">{stanceIcon('P2')}</span>
            </div>
            <KeyCap
              role="P2"
              keyChar={keys.playerR.key1.toUpperCase()}
              icon="⚔"
              label="공격"
              lit={litP2Atk}
            />
            <KeyCap
              role="P2"
              keyChar={keys.playerR.key2.toUpperCase()}
              icon="🛡"
              label="회피"
              lit={litP2Dod}
            />
          </div>
        </footer>
      </div>

      {/* 라운드/매치 결과 오버레이 (game1 소유 공용 — import만) */}
      <ResultOverlay />
    </main>
  );
}
