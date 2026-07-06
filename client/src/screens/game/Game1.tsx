/**
 * S9 게임1 — 숫자 맞추기 (NEON COIN-OP). 담당: game1 에이전트.
 * 컨테이너 testid: scr-game1 / 부품: game-stage(CRT 베젤), hud-*(HudFrame 내장), btn-exit
 *
 * 화면(UI·컴포넌트·CSS 클래스·연출)은 100% 유지하고, 게임 로직만 @madpump/shared game1 코어로 구동한다.
 *
 * PLAN §2-S9 + §3.1 "세 개의 스코어보드, 하나의 잭팟":
 *   - 중앙 타겟 스코어보드(#000 박스 + 옐로 초대형 숫자 + TARGET 캡션)
 *   - 좌 P1 시안 / 우 P2 핑크 현재숫자 패널(dim 바탕 + 2px 플레이어색 보더)
 *   - 값 변경 = 하드 스텝 + 80ms 글로우 버스트, ▲/▼ 램프 1프레임 점등
 *   - 근접 피드백: |diff|≤5 옐로 보더, ≤2 보더 글로우 맥동(300ms steps)
 *
 * 새 코어 매핑(설계 지시):
 *   - value  = state.p1 | state.p2 (float) → 표시/판정은 Math.round(value)
 *   - matched = |round(value)-target| < G1.MATCH_TOL
 *   - hold(초) = state.p1Hold | p2Hold, 승리 유지시간 = G1.HOLD_TO_WIN(=1초)
 *   - timeRemainingMs = (GAME_DURATION - state.elapsed) * 1000
 *   - 새 메커니즘 "누적 속도 게이지(0~100)" → 각 패널에 네온 게이지 바 추가(--p1/--p2)
 *   - "1초 락인"을 기존 3-램프 연출로 재해석(진행을 3분할). 하단 힌트 "HOLD 1 SEC"
 *
 * 배선(설계 지시):
 *   - game1.create(Math.random) / game1.step(state, events, dt초)
 *   - attachLocalKeyboard(now, push): KeyQ/KeyW=P1, KeyU/KeyI=P2 (down/up 모두 큐에 push)
 *   - step은 원본을 mutate 후 반환 → 반환값을 state로 교체 + setState는 새 참조(clone)로 강제 리렌더
 *   - state.result 확정 → reportRoundEnd(map) 1회 → <ResultOverlay />
 *   - 온라인 모드(flow.mode==='online')면 P2는 봇: 타겟으로 서서히 수렴하는 휴리스틱
 *   - 매 틱 setDebugGame(state), 언마운트 시 setDebugGame(null)
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { game1, GAME_DURATION, G1 } from '@madpump/shared';
import type { Game1State, GameInputEvent } from '@madpump/shared';
import type { PlayerRole } from '@/shell';
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
import { attachLocalKeyboard } from '../../game/input/keyboard';
import { useOnlineRender } from '../../net/useOnlineRender';
import { sendInput as onlineSendInput } from '../../net/online';
import { EndFlash } from '../../game/EndFlash';
import ResultOverlay from './ResultOverlay';
import './game1.css';

interface ValuePulse {
  dir: 'up' | 'down';
  until: number;
}

// ---------------------------------------------------------------------------
// 스냅샷 사이 보간(외삽) — 서버 스냅샷을 dt초만큼 각 플레이어 값을 '자기 속도'로 전진시킨
// 표시용 상태를 만든다. 속도=rate×(gauge/GAUGE_REF)·방향=up−down (코어 advance와 동일 공식).
// 스냅샷에 rate/gauge/down/up이 모두 있어 ID 매칭 불필요·추가 지연 0. 다음 스냅샷이 즉시 교정한다.
// 30/60Hz 스냅샷을 60fps 렌더로 부드럽게 잇는 게 목적(빠른 카운트업의 계단 제거 → 오프라인 캐던스와 일치).
// ---------------------------------------------------------------------------

const clampValue = (v: number): number => Math.min(G1.RANGE_MAX, Math.max(G1.RANGE_MIN, v));

function extrapolate(s: Game1State, dt: number): Game1State {
  const p1Dir = (s.p1Up ? 1 : 0) - (s.p1Down ? 1 : 0);
  const p2Dir = (s.p2Up ? 1 : 0) - (s.p2Down ? 1 : 0);
  const p1Speed = s.p1Rate * (s.p1Gauge / G1.GAUGE_REF);
  const p2Speed = s.p2Rate * (s.p2Gauge / G1.GAUGE_REF);
  return {
    ...s,
    p1: clampValue(s.p1 + p1Dir * p1Speed * dt),
    p2: clampValue(s.p2 + p2Dir * p2Speed * dt),
  };
}

export default function Game1() {
  useDebugScreen('scr-game1');
  const flow = useFlow();
  const navigate = useNavigate();

  // 온라인 렌더 훅(성능 표준): 활성/역할만 선택 구독(라운드 경계에서만 리렌더) +
  // 서버 스냅샷을 stateRef에 미러(리렌더 없이). per-snapshot 작업(디버그 브리지)은 콜백으로 위임.
  const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game1State>(1, (s) => {
    setDebugGame(s);
  });
  // 입력 핸들러(빈 deps effect)가 항상 최신 '온라인 활성 여부'를 보게 하는 stale-closure 방지 ref.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const [game, setGame] = useState<Game1State>(() => game1.create(Math.random));
  const gameRef = useRef(game);
  const eventsRef = useRef<GameInputEvent[]>([]);
  const reportedRef = useRef(false);
  const pulseRef = useRef<Record<PlayerRole, ValuePulse | null>>({ P1: null, P2: null });
  const botNextAtRef = useRef(0);
  const botHeldRef = useRef<'up' | 'down' | null>(null);

  // 온스크린 키캡 램프 4개 (즉발 점등 → 80ms 소등, PLAN §1.4)
  const [p1DownLit, flashP1Down] = useKeyLamp();
  const [p1UpLit, flashP1Up] = useKeyLamp();
  const [p2DownLit, flashP2Down] = useKeyLamp();
  const [p2UpLit, flashP2Up] = useKeyLamp();
  const lampRef = useRef({ flashP1Down, flashP1Up, flashP2Down, flashP2Up });
  lampRef.current = { flashP1Down, flashP1Up, flashP2Down, flashP2Up };

  // direct-URL 진입 복구 (idle이거나 다른 게임이면 오프라인 매치로 시작)
  useEffect(() => {
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 1) startOfflineGame(1);
  }, []);

  // 키보드 입력 (P1 q/w, P2 u/i). down/up 모두 큐에 push해 코어가 방향 상태를 갱신하게 한다.
  // 온라인이면 P2 입력은 봇 대행이므로 무시. 램프는 down 순간에만 점등.
  useEffect(() => {
    const push = (e: GameInputEvent) => {
      // 서버 온라인 활성: 로컬 큐/봇 없이 서버로만 전송. 램프는 시각 피드백으로 유지.
      if (isOnlineRef.current) {
        // 온라인은 U/I 두 키만(요구사항). U=주키(slotA), I=보조키(slotB). Q/W는 무시.
        // 서버가 슬롯을 내 role의 물리키로 재기입하므로 접속자는 자기 캐릭터를 조종한다.
        if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
        if (e.type === 'down') {
          if (e.code === 'KeyU') lampRef.current.flashP2Down();
          else lampRef.current.flashP2Up();
        }
        const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
        onlineSendInput(slot, e.type, e.t);
        return;
      }

      const f = getFlow();
      const isP2 = e.code === 'KeyU' || e.code === 'KeyI';
      if (f.mode === 'online' && isP2) return; // 온라인 P2 = 봇
      if (e.type === 'down') {
        switch (e.code) {
          case 'KeyQ':
            lampRef.current.flashP1Down();
            break;
          case 'KeyW':
            lampRef.current.flashP1Up();
            break;
          case 'KeyU':
            lampRef.current.flashP2Down();
            break;
          case 'KeyI':
            lampRef.current.flashP2Up();
            break;
        }
      }
      if (f.phase !== 'playing') return;
      eventsRef.current.push(e);
    };
    const detach = attachLocalKeyboard(() => performance.now() / 1000, push);
    return () => {
      detach();
      setDebugGame(null);
    };
  }, []);

  // 라운드 시작(마운트/nextRound) → 새 game1 코어 state 생성
  useEffect(() => {
    if (flow.phase !== 'playing' || flow.gameId !== 1) return;
    const s = game1.create(Math.random);
    gameRef.current = s;
    reportedRef.current = false;
    eventsRef.current = [];
    pulseRef.current = { P1: null, P2: null };
    botNextAtRef.current = 0;
    botHeldRef.current = null;
    setGame({ ...s });
    setDebugGame(s);
  }, [flow.currentRound, flow.phase, flow.gameId]);

  // (서버 권위 상태 미러링은 useOnlineRender가 담당 — 스냅샷마다 stateRef에 미러하고
  //  per-snapshot 작업(setDebugGame)은 위 훅 콜백으로 위임. 별도 미러 effect 불필요.)

  // rAF 게임 루프 — step + 디버그 브리지 + 결과 보고.
  // 탭이 백그라운드/오클루전이면 rAF가 멈추므로 interval 워치독이 대신 스텝을 밟는다 (QA 자동화 대응).
  useEffect(() => {
    // 온라인(서버 권위): 로컬 step·봇·결과보고 없이 서버 스냅샷(stateRef)만 매 프레임 페인트한다.
    // 이 화면의 페인트 = 상태를 새 참조로 setGame 하는 React 리렌더(DOM 게임이라 캔버스 blit 대신 리렌더).
    // 스냅샷 churn은 useOnlineRender가 흡수(리렌더 없이 stateRef 미러) → 여기서는 프레임당 1회만 렌더.
    if (isOnline) {
      // 첫 스냅샷 전이면 초기 create 상태를 렌더용으로만 세팅(판정 아님 — onSnapshot이 곧 덮어씀).
      if (!stateRef.current) {
        const seed = game1.create(Math.random);
        stateRef.current = seed;
        setGame({ ...seed });
        setDebugGame(seed);
      }
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const s = stateRef.current;
        if (!s) return;
        // 스냅샷 사이 외삽: 마지막 스냅샷을 경과 dt(≤50ms)만큼 각 플레이어 값을 '자기 속도'로 전진.
        // 값(p1/p2)만 대상 — 코어 advance와 동일 공식. 종료(result≠null) 시엔 외삽하지 않는다.
        const extraDt = Math.min(0.05, Math.max(0, (now - snapAtRef.current) / 1000));
        const view = extraDt > 0 && s.result === null ? extrapolate(s, extraDt) : s;
        setGame({ ...view }); // 새 참조로 강제 리렌더(스냅샷/외삽 객체를 clone)
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    if (flow.phase !== 'playing') return;
    let raf = 0;
    let stopped = false;
    let last = performance.now();

    const step = (now: number) => {
      if (stopped) return;
      const dtSec = Math.min(0.5, (now - last) / 1000);
      if (dtSec <= 0) return;
      last = now;
      const cur = gameRef.current;

      // 온라인 봇(P2): 타겟으로 서서히 수렴 — 방향키를 눌러 게이지를 채워 이동, 타겟 도달 시 손 떼고 홀드
      if (getFlow().mode === 'online' && cur.result === null && now >= botNextAtRef.current) {
        const t = now / 1000;
        const p2r = Math.round(cur.p2);
        const diff = cur.target - p2r;
        if (diff === 0) {
          // 타겟 도달 — 누르던 키를 떼서 정지 유지(홀드)
          if (botHeldRef.current) {
            eventsRef.current.push({
              code: botHeldRef.current === 'up' ? 'KeyI' : 'KeyU',
              type: 'up',
              t,
            });
            botHeldRef.current = null;
          }
          botNextAtRef.current = now + 200;
        } else {
          const wantUp = diff > 0;
          const dir: 'up' | 'down' = wantUp ? 'up' : 'down';
          const code = wantUp ? 'KeyI' : 'KeyU';
          if (botHeldRef.current && botHeldRef.current !== dir) {
            eventsRef.current.push({
              code: botHeldRef.current === 'up' ? 'KeyI' : 'KeyU',
              type: 'up',
              t,
            });
            botHeldRef.current = null;
          }
          eventsRef.current.push({ code, type: 'down', t }); // 게이지 +30 누적
          botHeldRef.current = dir;
          (wantUp ? lampRef.current.flashP2Up : lampRef.current.flashP2Down)();
          const dist = Math.abs(diff);
          botNextAtRef.current = now + (dist > 12 ? 90 + Math.random() * 70 : 220 + Math.random() * 280);
        }
      }

      // ▲/▼ 램프: step 전 값을 스냅샷(step이 원본을 mutate하므로 반드시 호출 전에 캡처)
      const prevP1 = Math.round(cur.p1);
      const prevP2 = Math.round(cur.p2);

      const events = eventsRef.current;
      eventsRef.current = [];
      const next = game1.step(cur, events, dtSec);

      const d1 = Math.round(next.p1) - prevP1;
      if (d1 !== 0) pulseRef.current.P1 = { dir: d1 > 0 ? 'up' : 'down', until: now + 160 };
      const d2 = Math.round(next.p2) - prevP2;
      if (d2 !== 0) pulseRef.current.P2 = { dir: d2 > 0 ? 'up' : 'down', until: now + 160 };

      gameRef.current = next; // 다음 프레임 입력용(코어가 계속 mutate)
      setGame({ ...next }); // 새 참조로 강제 리렌더(코어는 동일 객체를 반환하므로 clone 필수)
      setDebugGame(next);

      if (next.result !== null) {
        stopped = true; // 루프 정지 — ResultOverlay가 phase를 보고 표시
        if (isOnlineRef.current) return; // 온라인: 서버가 round:end 구동, 화면은 결과 보고에 관여 안 함
        if (!reportedRef.current) {
          reportedRef.current = true;
          reportRoundEnd(
            next.result === 'P1' ? 'P1_WIN' : next.result === 'P2' ? 'P2_WIN' : 'DRAW',
          );
        }
      }
    };

    const loop = (now: number) => {
      step(now);
      if (!stopped) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const watchdog = setInterval(() => {
      const now = performance.now();
      if (now - last > 280) step(now); // rAF가 살아있으면 개입하지 않음
    }, 250);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearInterval(watchdog);
    };
  }, [isOnline, myRole, flow.phase, flow.currentRound]);

  const displays = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);
  const timeRemainingMs = Math.max(0, (GAME_DURATION - game.elapsed) * 1000);
  const urgent = flow.phase === 'playing' && game.result === null && timeRemainingMs <= 5000;

  const renderPanel = (role: PlayerRole) => {
    const isP1 = role === 'P1';
    const rawValue = isP1 ? game.p1 : game.p2;
    const value = Math.round(rawValue);
    const gauge = isP1 ? game.p1Gauge : game.p2Gauge;
    const hold = isP1 ? game.p1Hold : game.p2Hold;
    const disp = displays[role];

    const diff = value - game.target;
    const matched = Math.abs(value - game.target) < G1.MATCH_TOL;
    const holdProgress = Math.min(1, hold / G1.HOLD_TO_WIN);
    const near = !matched && Math.abs(diff) <= 5;
    const close = !matched && Math.abs(diff) <= 2;
    // 1초 락인을 기존 3-램프로 재해석: 진행을 3분할 점등
    const holdLit = Math.min(3, Math.floor(holdProgress * 3));

    const pl = pulseRef.current[role];
    const dir = pl && pl.until > performance.now() ? pl.dir : null;
    const color = isP1 ? 'var(--p1)' : 'var(--p2)';
    const cls = [
      'g1-panel',
      isP1 ? 'g1-panel--p1' : 'g1-panel--p2',
      near ? 'g1-panel--near' : '',
      close ? 'g1-panel--close' : '',
      matched ? 'g1-panel--matched' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div className={cls}>
        <div className="g1-panel__cap">
          <span className="g1-panel__tag font-arcade">{role}</span>
          {disp.isYou && <span className="g1-panel__you font-arcade anim-blink">YOU</span>}
          <span className={`g1-arrow ${dir === 'up' ? 'lit' : ''}`} aria-hidden>
            ▲
          </span>
          <span className={`g1-arrow ${dir === 'down' ? 'lit' : ''}`} aria-hidden>
            ▼
          </span>
        </div>
        <span key={value} className="g1-panel__num font-arcade">
          {value}
        </span>
        {/* 새 메커니즘: 누적 속도 게이지(0~100) — 네온 바 (neon-coinop 컨셉) */}
        <div className="g1-gauge-wrap">
          <span className="g1-gauge__cap font-arcade">SPEED</span>
          <div className="g1-gauge" aria-hidden>
            <div
              className="g1-gauge__fill"
              style={
                {
                  width: `${Math.max(0, Math.min(100, gauge))}%`,
                  '--gauge-color': color,
                } as CSSProperties
              }
            />
          </div>
        </div>
        {/* 코인 락인: 일치 유지 진행 램프 3개 (1초 락인을 3분할, 이탈 시 소등 — §3.1) */}
        <div className={`g1-hold ${matched ? '' : 'g1-hold--off'}`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`lamp ${i < holdLit ? 'lit' : ''}`}
              style={{ '--lamp-color': color } as CSSProperties}
            />
          ))}
          <span className="g1-hold__cap font-arcade">
            {holdProgress >= 1 ? 'LOCKED!' : 'HOLD'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <main data-testid="scr-game1" className="g1-root">
      <div className="vanish-grid dim" aria-hidden />

      <header className="g1-topbar">
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
      </header>

      <HudFrame
        p1={displays.P1}
        p2={displays.P2}
        roundWins={wins}
        roundCount={flow.roundConfig.roundCount}
        currentRound={flow.currentRound}
        timeRemainingMs={timeRemainingMs}
      />

      <section data-testid="game-stage" className={`crt-bezel g1-stage ${urgent ? 'urgent' : ''}`}>
        <span className="g1-watermark font-arcade" aria-hidden>
          PUMP
        </span>
        <div className="g1-row">
          {renderPanel('P1')}
          <div className="g1-target corner-brackets">
            <i className="cb2" />
            <span className="g1-target__cap font-arcade">TARGET</span>
            <span className="g1-target__num font-arcade glow-text">{game.target}</span>
          </div>
          {renderPanel('P2')}
        </div>
        <EndFlash active={game?.result != null} />
      </section>

      {/* 하단 조작키 안내 — 실제 배정 키 표기 (SPEC Q2) + 입력 순간 램프 점등 */}
      {/* 온라인은 U/I 두 키만 쓰므로 내 역할(role) 컨트롤만 내 색으로 표시. 오프라인은 기존 2인 레이아웃 유지. */}
      {isOnline ? (
        <footer className="g1-pads g1-pads--online">
          <div className="g1-pad-group">
            <span
              className={`g1-pads-tag font-arcade ${myRole === 'P1' ? 'c-p1' : 'c-p2'}`}
            >
              YOU · {myRole === 'P1' ? '파랑' : '빨강'}
            </span>
            <KeyCap role={myRole ?? 'P2'} keyChar="U" icon="▼" label="내리기" lit={p2DownLit} />
            <KeyCap role={myRole ?? 'P2'} keyChar="I" icon="▲" label="올리기" lit={p2UpLit} />
          </div>
          <span className="g1-pads-hint font-arcade">MATCH THE TARGET · HOLD 1 SEC</span>
        </footer>
      ) : (
        <footer className="g1-pads">
          <div className="g1-pad-group">
            <KeyCap role="P1" keyChar="Q" icon="▼" label="내리기" lit={p1DownLit} />
            <KeyCap role="P1" keyChar="W" icon="▲" label="올리기" lit={p1UpLit} />
          </div>
          <span className="g1-pads-hint font-arcade">MATCH THE TARGET · HOLD 1 SEC</span>
          <div className="g1-pad-group">
            <KeyCap role="P2" keyChar="U" icon="▼" label="내리기" lit={p2DownLit} />
            <KeyCap role="P2" keyChar="I" icon="▲" label="올리기" lit={p2UpLit} />
          </div>
        </footer>
      )}

      <ResultOverlay />
    </main>
  );
}