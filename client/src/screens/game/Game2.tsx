/**
 * S12 게임3 — 펜싱 (scr-game2). 담당: game2 에이전트.
 *
 * 화면(UI/컴포넌트/CSS 클래스/연출)은 neon-coinop 시안 그대로 유지하고,
 * 게임 로직만 game-test 튜닝 코어(@madpump/shared `game2`)로 교체했다.
 *
 * 새 코어는 1초 틱 가위바위보가 아니라 "실시간 넉백 펜싱"이다:
 *   · c(-EDGE..+EDGE) = 두 검객의 클래시 위치. +쪽=P1 우세(오른쪽으로 밀림), -쪽=P2 우세.
 *   · KeyQ/KeyU=공격(랜덤 시동 후 판정), KeyW/KeyI=회피(무적창).
 *   · 회피로 막으면 공격자 넉백(PARRY), 못 막으면 피해자 넉백(HIT), 헛회피는 WHIFF 넉백.
 *   · waterLevel(밀물)로 낙사선이 안쪽으로 좁아진다. 링 밖으로 밀리면 낙사.
 *   · 10초 종료 시 c 부호로 승패, 동률 DRAW.
 *
 * 배선:
 *   - game2.create(Math.random) / game2.step(state, events, dt초) — 판정 재구현 금지
 *   - attachLocalKeyboard(now=라운드경과초, push) — KeyQ/W/U/I만
 *   - state.result('P1'|'P2'|'DRAW') → MatchResult 매핑 후 reportRoundEnd (라운드당 1회)
 *   - 온라인 모드: P2는 봇 — 로컬 u/i 무시, 휴리스틱 입력을 큐에 push
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { game2, G2, GAME_DURATION } from '@madpump/shared';
import type { GameInputEvent, Game2State, FencerState } from '@madpump/shared';
import type { MatchResult, PlayerRole } from '@/shell';
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
import { attachLocalKeyboard } from '../../game/input/keyboard';
import { useOnlineRender } from '../../net/useOnlineRender';
import { functionColors, sendInput as onlineSendInput } from '../../net/online';
import { Button, HudFrame, KeyCap, useKeyLamp } from '../../components';
import { EndFlash } from '../../game/EndFlash';
import ResultOverlay from './ResultOverlay';
import RoundIntro from './RoundIntro';
import { isRoundIntroActive } from '../../state/roundIntroGate';
import './game2.css';

// 연출 상수 (로직 비침범 — 판정은 전부 @madpump/shared 코어)
const RINGOUT_FX_MS = 1400; // 낙하+스플래시 연출 후 결과 오버레이
const TIMEUP_FX_MS = 1000; // TIME UP! 캡션 후 결과 오버레이
const SAFE_SEGS = 5; // 낙사선까지 남은 여유 램프 개수

// 좌표 매핑 — 아레나 데크(--sea-w 14% ~ 86%)에 pos[-EDGE..EDGE]를 얹는다.
const EDGE = G2.EDGE; // 1.0
const HALF_GAP = G2.HALF_GAP; // 0.06
const HALF_TRACK = 36; // %/EDGE단위 (데크폭 72% ÷ 2)

type Pose = 'NEUTRAL' | 'ATTACK' | 'DODGE';

const POSE_ICON: Record<Pose, string> = { NEUTRAL: '·', ATTACK: '⚔', DODGE: '🛡' };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/**
 * 플레이어 색('blue'|'red') → 기존 역할 CSS 변수. 색은 플레이어 종속(역할 아님):
 * 'blue' = 기존 P1색(--p1 시안), 'red' = 기존 P2색(--p2 핑크).
 */
const colorVar = (c: 'blue' | 'red') => (c === 'blue' ? 'var(--p1)' : 'var(--p2)');

/** pos(-EDGE..EDGE) → 아레나 가로 % */
const posToPct = (pos: number) => 50 + clamp(pos, -1.14, 1.14) * HALF_TRACK;

/** 현재 밀물에 따른 유효 낙사선(코어와 동일 식) */
const effEdgeOf = (waterLevel: number) => Math.max(EDGE - waterLevel, HALF_GAP + 0.02);

/** 검객 포즈 — 공격/회피 창을 짧은 시각 홀드까지 포함해 판정 */
function poseOf(f: FencerState | undefined, now: number): Pose {
  if (!f || !f.attacks || !f.dodges) return 'NEUTRAL';
  let atk = -Infinity;
  let dod = -Infinity;
  for (const a of f.attacks) if (now >= a.press && now <= a.end + 0.16) atk = Math.max(atk, a.press);
  for (const d of f.dodges) if (now >= d.start && now <= d.end + 0.14) dod = Math.max(dod, d.start);
  if (atk === -Infinity && dod === -Infinity) return 'NEUTRAL';
  return atk >= dod ? 'ATTACK' : 'DODGE';
}

// ---------------------------------------------------------------------------
// 네온 스틱 검객 (2px 스트로크 아웃라인 — §3.3) — 시안 그대로 재사용
// ---------------------------------------------------------------------------

function FencerSvg({ pose }: { pose: Pose }) {
  return (
    <svg viewBox="0 0 110 120" className={`g2-fencer g2-fencer--${pose.toLowerCase()}`} aria-hidden>
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
          <circle cx="102" cy="46" r="3" className="g2-swordtip" />
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
          <circle cx="84" cy="41" r="2.2" className="g2-swordtip" />
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 와이어프레임 바다 (시안 지그재그 2~3겹, steps 출렁 — §3.3) — 시안 그대로 재사용
// ---------------------------------------------------------------------------

function zigzag(y: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 12; i++) pts.push(`${i * 10},${y + (i % 2 === 0 ? 5 : -5)}`);
  return pts.join(' ');
}

function Sea({ side, splashKey }: { side: 'left' | 'right'; splashKey: number | null }) {
  return (
    <div className={`g2-sea g2-sea--${side}`} aria-hidden>
      <svg viewBox="0 0 120 60" preserveAspectRatio="none">
        <polyline points={zigzag(12)} className="g2-wave g2-wave--1" />
        <polyline points={zigzag(30)} className="g2-wave g2-wave--2" />
        <polyline points={zigzag(48)} className="g2-wave g2-wave--3" />
      </svg>
      {splashKey !== null && (
        <div className="g2-splash" key={splashKey}>
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

export default function Game2() {
  useDebugScreen('scr-game2');
  const flow = useFlow();
  const navigate = useNavigate();

  // 초기 상태를 유효한 create()로 둔다(온라인 카운트다운 등 첫 서버 스냅샷 전에도 feed/p1/p2가 존재).
  const [game, setGame] = useState<Game2State | null>(() => game2.create(Math.random));

  // 온라인 렌더 훅(성능 구조 표준) — 활성/역할만 '선택 구독'하고 서버 스냅샷은 stateRef로 미러링한다
  // (스토어 전체 구독/effect churn 제거). truthy(isOnline)면 로컬 시뮬/봇을 끄고 서버 상태를 렌더 +
  // 내 입력만 전송한다. 이 화면은 canvas가 아니라 DOM/SVG를 game state로 그리므로, per-snapshot 작업
  // (= 이 게임의 'draw')은 onSnapshot에서 setGame으로 수행한다(새 스냅샷 참조에서만 실제 리렌더).
  const { isOnline, myRole, stateRef } = useOnlineRender<Game2State>(2, (s) => {
    setGame(s); // 서버 권위 스냅샷을 DOM/SVG로 렌더(=draw)
    setDebugGame(s);
  });
  // 입력 핸들러(안정 클로저)가 최신 '온라인 활성 여부'를 보게 하는 ref.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const queueRef = useRef<GameInputEvent[]>([]);
  const reportedRef = useRef(false);
  const reportTimerRef = useRef<number | null>(null);
  const botRef = useRef<{ nextAt: number } | null>(null);

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

  // direct-URL 복구: 매치 컨텍스트가 없으면 오프라인 게임3으로 (§3.3).
  // 단, 실서버 온라인(online) 매치면 오프라인 flow로 오염시키지 않는다.
  useEffect(() => {
    if (isOnline) return;
    const f = getFlow();
    if (f.phase === 'idle' || f.gameId !== 2) startOfflineGame(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 라운드 (재)시작 — currentRound 변화마다 새 @madpump/shared state 생성
  useEffect(() => {
    const f = getFlow();
    if (f.gameId !== 2 || f.currentRound < 1) return;
    const st = game2.create(Math.random);
    stateRef.current = st;
    queueRef.current = [];
    reportedRef.current = false;
    botRef.current = null;
    setGame({ ...st }); // 코어는 동일 객체를 반환하므로 clone으로 새 참조 강제(리렌더)
    setDebugGame(st);
  }, [flow.gameId, flow.currentRound]);

  // 온라인(실서버) 스냅샷 미러링은 위 useOnlineRender의 onSnapshot이 담당한다(setGame=draw).
  // 이 화면은 DOM/SVG를 game state로 렌더하므로 onSnapshot의 setGame이 곧 매 스냅샷의 "draw"다.

  // 키보드: KeyQ/KeyU=공격(key1), KeyW/KeyI=회피(key2). now=라운드 경과초.
  useEffect(() => {
    const detach = attachLocalKeyboard(
      () => stateRef.current?.elapsed ?? 0,
      (e) => {
        const isP1 = e.code === 'KeyQ' || e.code === 'KeyW';
        const role: PlayerRole = isP1 ? 'P1' : 'P2';
        const key: 'key1' | 'key2' = e.code === 'KeyQ' || e.code === 'KeyU' ? 'key1' : 'key2';

        // 실서버 온라인: 로컬 큐/봇을 쓰지 않고 서버로만 전송(down/up 모두).
        // 슬롯 A=주키(Q/U), B=보조키(W/I). 내가 어느 role이든 서버가 slot으로 재기입하므로
        // 로컬 4키(Q/W/U/I) 아무거나 눌러도 내 슬롯 입력으로 전송된다.
        if (isOnlineRef.current) {
          // 온라인은 U/I 두 키만(요구사항). U=주키(slotA), I=보조키(slotB). Q/W는 무시.
          if (e.code !== 'KeyU' && e.code !== 'KeyI') return;
          const slot: 'A' | 'B' = e.code === 'KeyU' ? 'A' : 'B';
          flashRef.current[role][key](); // 램프 점등은 유지(U/I → P2측)
          onlineSendInput(slot, e.type, e.t ?? performance.now() / 1000);
          return;
        }

        // ── 오프라인 경로(기존과 100% 동일) ──
        if (e.type !== 'down') return; // 코어는 down만 판정
        const f = getFlow();
        // 오프라인 mock 봇 모드(flow.mode==='online')에선 P2 자리(u/i)는 봇 전용 — 로컬 키 입력 무시
        if (f.mode === 'online' && role === 'P2') return;
        flashRef.current[role][key]();
        if (f.phase !== 'playing') return;
        queueRef.current.push(e);
      },
    );
    return detach;
  }, []);

  // 게임 루프 — rAF(전경) + interval 워치독(백그라운드 탭 대비). 공유 시계(last)로 이중진행 방지.
  useEffect(() => {
    // 온라인(실서버): 로컬 step/봇/결과보고를 돌리지 않는다.
    // 이 화면은 canvas가 없고 DOM/SVG를 game state로 렌더 → onSnapshot의 setGame이
    // 매 서버 스냅샷마다 리렌더(=draw)를 구동하므로 별도 draw 루프가 필요 없다.
    if (isOnline) return;

    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      // 라운드 인트로 중엔 시뮬 정지(코어 step 스킵) + last 갱신으로 재개 시 dt 점프 방지
      if (isRoundIntroActive()) {
        last = now;
        return;
      }
      const dtMs = clamp(now - last, 0, 250);
      last = now;
      const st = stateRef.current;
      if (!st || st.result !== null) return;
      const dt = dtMs / 1000;

      // 봇(온라인 mock): 실시간 휴리스틱 — 위협(P1 임박 공격) 감지 시 회피, 아니면 확률적 공격/회피
      if (getFlow().mode === 'online') {
        const t = st.elapsed;
        if (botRef.current === null) botRef.current = { nextAt: t + 0.25 + Math.random() * 0.3 };
        if (t >= botRef.current.nextAt) {
          const threat = st.p1.attacks.some((a) => !a.resolved && t <= a.end && a.start <= t + 0.16);
          let code: GameInputEvent['code'];
          if (threat && st.p2.dodgeCdUntil <= t) code = 'KeyI';
          else if (Math.random() < 0.62 && st.p2.attackCdUntil <= t) code = 'KeyU';
          else code = 'KeyI';
          queueRef.current.push({ code, type: 'down', t });
          const key: 'key1' | 'key2' = code === 'KeyU' ? 'key1' : 'key2';
          flashRef.current.P2[key]();
          botRef.current.nextAt = t + 0.12 + Math.random() * 0.22;
        }
      }

      const inputs = queueRef.current;
      queueRef.current = [];
      const next = game2.step(st, inputs, dt);
      stateRef.current = next;
      setGame({ ...next }); // 코어는 동일 객체를 반환 → clone으로 새 참조 강제(매 프레임 리렌더)
      setDebugGame(next);

      // 승패 확정 → 링아웃/타임업 연출 후 라운드 결과 보고 (라운드당 1회)
      // 온라인은 서버가 round:end 를 구동하므로 화면은 결과 보고에 관여하지 않는다.
      if (isOnlineRef.current) return;
      if (next.result !== null && !reportedRef.current) {
        reportedRef.current = true;
        const effEdge = effEdgeOf(next.waterLevel);
        const ring =
          (next.result === 'P2' && next.c - HALF_GAP <= -effEdge + 1e-4) ||
          (next.result === 'P1' && next.c + HALF_GAP >= effEdge - 1e-4);
        const delay = ring ? RINGOUT_FX_MS : TIMEUP_FX_MS;
        const mr: MatchResult =
          next.result === 'P1' ? 'P1_WIN' : next.result === 'P2' ? 'P2_WIN' : 'DRAW';
        reportTimerRef.current = window.setTimeout(() => reportRoundEnd(mr), delay);
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
  }, [isOnline, myRole]);

  // 언마운트 정리
  useEffect(
    () => () => {
      if (reportTimerRef.current !== null) clearTimeout(reportTimerRef.current);
      setDebugGame(null);
    },
    [],
  );

  // ------------------------------------------------------------------ 파생값
  // 레거시 오프라인 mock 봇 모드(flow.mode==='online') — P2 라벨을 'CPU'로 표기.
  // 실서버 온라인은 위쪽 useOnlineRender(3) 훅(isOnline/myRole)이 담당한다.
  const flowOnline = flow.mode === 'online';
  const players = getPlayerDisplays(flow);
  const wins = getRoundWins(flow);

  const now = game?.elapsed ?? 0;
  const c = game?.c ?? 0;
  const waterLevel = game?.waterLevel ?? 0;
  const effEdge = effEdgeOf(waterLevel);
  const p1 = game?.p1;
  const p2 = game?.p2;
  const result = game?.result ?? null;

  // 색은 플레이어 종속(역할 아님) — P1/P2 기능 엔티티의 실제 플레이어 색으로 칠한다.
  // 오프라인/정보없음이면 기본 {p1:'blue', p2:'red'} → 기존(P1 시안 / P2 핑크)과 동일.
  const fc = functionColors();
  const p1Color = colorVar(fc.p1); // P1 엔티티(공격측 자리) 색
  const p2Color = colorVar(fc.p2); // P2 엔티티(회피측 자리) 색
  // 온라인 하단 컨트롤(YOU)은 내 역할이 어느 색인지로 표기.
  const myPlayerColor = myRole === 'P1' ? fc.p1 : fc.p2;
  const myColorVar = colorVar(myPlayerColor);

  const p1Pos = c - HALF_GAP;
  const p2Pos = c + HALF_GAP;

  const ringOut =
    result !== null && game !== null
      ? (result === 'P2' && p1Pos <= -effEdge + 1e-4) ||
        (result === 'P1' && p2Pos >= effEdge - 1e-4)
      : false;
  const p1Fell = result === 'P2' && ringOut;
  const p2Fell = result === 'P1' && ringOut;

  const timeRemainingMs =
    game !== null ? Math.max(0, GAME_DURATION - now) * 1000 : GAME_DURATION * 1000;
  const urgent = game !== null && result === null && timeRemainingMs <= 5000;

  // 밀물 폭(양끝) — waterLevel(EDGE단위)을 데크 % 로
  const tideW = (waterLevel * HALF_TRACK).toFixed(2);

  // 낙사선까지 남은 여유 램프 (자기 낭떠러지 기준)
  const safeLit = (pos: number, ownCliff: number, fell: boolean) => {
    if (fell) return 0;
    const frac = clamp01(Math.abs(pos - ownCliff) / (2 * effEdge));
    return clamp(Math.round(frac * SAFE_SEGS), 0, SAFE_SEGS);
  };
  const litSafeP1 = safeLit(p1Pos, -effEdge, p1Fell);
  const litSafeP2 = safeLit(p2Pos, effEdge, p2Fell);

  // 우세 바 (momentum) — c 부호 방향으로 중앙에서 채운다. 오른쪽=P1, 왼쪽=P2.
  const advFrac = clamp(c / EDGE, -1, 1); // -1..1
  const advPct = Math.abs(advFrac) * 50; // 절반폭 대비
  const advFillLeft = advFrac >= 0 ? 50 : 50 - advPct;
  const advColor = advFrac >= 0 ? p1Color : p2Color;
  const advMarkerLeft = 50 + advFrac * 50;

  const pose1 = poseOf(p1, now);
  const pose2 = poseOf(p2, now);

  const combo1 = p1?.combo ?? 0;
  const combo2 = p2?.combo ?? 0;
  const riposte1 = result === null && !!p1 && now < p1.riposteUntil;
  const riposte2 = result === null && !!p2 && now < p2.riposteUntil;

  // 최신 피드 이벤트 (HIT/PARRY/WHIFF 네온 플래시)
  const lastFeed = game && game.feed && game.feed.length ? game.feed[game.feed.length - 1] : null;
  const feedFresh = lastFeed !== null && now - lastFeed.t < 0.9 && result === null;
  const feedText = lastFeed
    ? lastFeed.kind === 'hit'
      ? 'TOUCHÉ!'
      : lastFeed.kind === 'parry'
        ? 'PARRY!'
        : 'WHIFF'
    : '';
  const feedColor = lastFeed
    ? lastFeed.kind === 'whiff'
      ? 'var(--text-muted)'
      : lastFeed.victim === 'P1'
        ? p2Color
        : p1Color
    : 'var(--text)';
  const feedMultStr = lastFeed && lastFeed.mult && lastFeed.mult > 1.05 ? ` ×${lastFeed.mult.toFixed(1)}` : '';
  const feedPos = lastFeed ? (lastFeed.victim === 'P1' ? p1Pos : p2Pos) : 0;

  const ringOutFx = ringOut;
  const endcapColor =
    result === 'P1' ? p1Color : result === 'P2' ? p2Color : 'var(--accent2)';

  // 검객 옆 부가 연출(콤보/리포스트/피격 스파크)
  const fighterFx = (role: PlayerRole) => {
    const combo = role === 'P1' ? combo1 : combo2;
    const riposte = role === 'P1' ? riposte1 : riposte2;
    const spark =
      feedFresh &&
      lastFeed !== null &&
      lastFeed.victim === role &&
      (lastFeed.kind === 'hit' || lastFeed.kind === 'parry');
    return (
      <>
        {riposte && <span className="g3a-rip-badge font-arcade anim-blink">RIPOSTE</span>}
        {combo >= 2 && <span className="g3a-combo font-arcade">COMBO ×{combo}</span>}
        {spark && lastFeed && (
          <span key={`sp-${role}-${lastFeed.t.toFixed(3)}`} className="g2-sparks" aria-hidden>
            <i />
            <i />
          </span>
        )}
      </>
    );
  };

  // ------------------------------------------------------------------ 렌더
  return (
    <main data-testid="scr-game2" className="g2-root">
      <div className="vanish-grid dim" aria-hidden />
      <div className="g2-inner">
        <header className="g2-topbar">
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
          <div className="g2-hud">
            <HudFrame
              p1={players.P1}
              p2={players.P2}
              roundWins={wins}
              roundCount={flow.roundConfig.roundCount}
              currentRound={Math.max(1, flow.currentRound)}
              timeRemainingMs={timeRemainingMs}
            />
          </div>
        </header>

        <section data-testid="game-stage" className={`g2-stage crt-bezel ${urgent ? 'urgent' : ''}`}>
          <div className={`g2-arena ${result !== null ? 'g2-arena--glitch' : ''}`}>
            {/* 우세 미터 — c 부호/크기(momentum) 표시 */}
            <div className="g3a-advbar" aria-hidden>
              <div className="g3a-advbar__track">
                <span className="g3a-advbar__mid" />
                <span
                  className="g3a-advbar__fill"
                  style={
                    {
                      left: `${advFillLeft}%`,
                      width: `${advPct}%`,
                      background: advColor,
                      color: advColor,
                    } as CSSProperties
                  }
                />
                <span className="g3a-advbar__marker" style={{ left: `${advMarkerLeft}%` }} />
              </div>
              <div className="g3a-advbar__cap font-arcade">
                <span style={{ color: p2Color }}>◀ P2</span>
                <span className="c-muted">CLASH</span>
                <span style={{ color: p1Color }}>P1 ▶</span>
              </div>
            </div>

            {/* 남은 여유 램프 (자기 낭떠러지까지 — §3.3 톤 재사용) */}
            <div className="g2-safe g2-safe--p1">
              <span className="g2-safe__label font-arcade" style={{ color: p1Color }}>P1 SAFE</span>
              <span className="lamps">
                {Array.from({ length: SAFE_SEGS }, (_, i) => (
                  <span
                    key={i}
                    className={`lamp ${i < litSafeP1 ? 'lit' : ''}`}
                    style={{ '--lamp-color': p1Color } as CSSProperties}
                  />
                ))}
              </span>
            </div>
            <div className="g2-safe g2-safe--p2">
              <span className="g2-safe__label font-arcade" style={{ color: p2Color }}>P2 SAFE</span>
              <span className="lamps">
                {Array.from({ length: SAFE_SEGS }, (_, i) => (
                  <span
                    key={i}
                    className={`lamp ${i < litSafeP2 ? 'lit' : ''}`}
                    style={{ '--lamp-color': p2Color } as CSSProperties}
                  />
                ))}
              </span>
            </div>

            {/* 바다 (양끝 낭떠러지 밖 깊은 물) */}
            <Sea side="left" splashKey={p1Fell ? Math.floor(now * 10) : null} />
            <Sea side="right" splashKey={p2Fell ? Math.floor(now * 10) : null} />

            {/* 플랫폼: 그리드 상판(칸 눈금 + 끝단 경고) + #000 옆면 */}
            <div className="g2-deck" aria-hidden>
              <div className="g2-deck-top">
                {Array.from({ length: 12 }, (_, i) => (
                  <div
                    key={i}
                    className={`g2-cell ${i === 0 || i === 11 ? 'g2-cell--edge' : ''}`}
                  />
                ))}
              </div>
              <div className="g2-deck-face" />
            </div>

            {/* 밀물 — waterLevel로 안쪽으로 차오르는 물 (링 축소 표시) */}
            <div className="g3a-tide g3a-tide--left" style={{ width: `${tideW}%` }} aria-hidden />
            <div className="g3a-tide g3a-tide--right" style={{ width: `${tideW}%` }} aria-hidden />

            {/* 검객 — 색은 플레이어 종속(역할 아님). P1/P2 엔티티의 실제 플레이어 색으로.
                내부 SVG/스파크/콤보는 currentColor라 검객의 color만 정하면 자동 반영. */}
            <div
              className={`g2-fighter g2-fighter--rt g2-fighter--p1 ${p1Fell ? 'g2-fighter--fall' : ''} ${riposte1 ? 'g3a-riposte' : ''}`}
              style={{ left: `${posToPct(p1Pos)}%`, color: p1Color }}
              aria-label={`P1 위치: 낙사선까지 여유 ${litSafeP1}칸`}
            >
              <FencerSvg pose={pose1} />
              {fighterFx('P1')}
            </div>
            <div
              className={`g2-fighter g2-fighter--rt g2-fighter--p2 ${p2Fell ? 'g2-fighter--fall' : ''} ${riposte2 ? 'g3a-riposte' : ''}`}
              style={{ left: `${posToPct(p2Pos)}%`, color: p2Color }}
              aria-label={`P2 위치: 낙사선까지 여유 ${litSafeP2}칸`}
            >
              <FencerSvg pose={pose2} />
              {fighterFx('P2')}
            </div>

            {/* 판정 플래시 (HIT/PARRY/WHIFF) — 피해자 위치에 네온 캡션 */}
            {feedFresh && lastFeed && (
              <div
                key={`fd-${lastFeed.kind}-${lastFeed.victim}-${lastFeed.t.toFixed(3)}`}
                className="g3a-flash font-arcade glow-text"
                style={{ left: `${posToPct(feedPos)}%`, color: feedColor }}
              >
                {feedText}
                {feedMultStr}
              </div>
            )}

            {/* 라운드 종료 캡션: 링아웃 승패 / 시간 종료 판정 (오버레이 직전 연출) */}
            {game !== null && result !== null && flow.phase === 'playing' && (
              <div
                className="g2-endcap font-arcade glow-text anim-sign-on"
                style={{ color: endcapColor }}
              >
                {ringOutFx ? 'RING OUT!' : 'TIME UP!'}
              </div>
            )}

          </div>

          {/* 기본 종료 플래시 — result 확정 순간 흰 섬광 (스테이지 relative 컨테이너 기준 오버레이) */}
          <EndFlash active={game?.result != null} />
        </section>

        {/* 하단: 온스크린 키캡(실제 배정 키 표기 — SPEC Q2) + 스탠스 피드백 */}
        {isOnline ? (
          // 온라인: 로컬 플레이어(내 역할)의 U/I 컨트롤만, 내 색으로 표기.
          // 펜싱은 대칭 게임(P1/P2 동작 동일: U=공격, I=회피)이라 아이콘/라벨은 역할과 무관.
          <footer className="g2-controls g2-controls--online">
            <div className={`g2-pad ${myPlayerColor === 'blue' ? 'g2-pad--p1' : 'g2-pad--p2'}`}>
              <div className="g2-stance" style={{ color: myColorVar }}>
                <span className="g2-stance__label">
                  YOU · {myPlayerColor === 'blue' ? '파랑' : '빨강'}
                </span>
                <span className="g2-stance__icon">
                  {POSE_ICON[myRole === 'P1' ? pose1 : pose2]}
                </span>
              </div>
              <KeyCap
                role={myPlayerColor === 'blue' ? 'P1' : 'P2'}
                keyChar="U"
                icon="⚔"
                label="공격"
                lit={litP2Atk}
              />
              <KeyCap
                role={myPlayerColor === 'blue' ? 'P1' : 'P2'}
                keyChar="I"
                icon="🛡"
                label="회피"
                lit={litP2Dod}
              />
            </div>
            <div className="g2-hint c-muted">
              실시간 넉백 — 공격(⚔)은 상대를 밀고, 회피(🛡)로 막으면 되받아친다 · 밀물이 링을 조인다 ·
              링 밖으로 밀리면 낙사
            </div>
          </footer>
        ) : (
          <footer className="g2-controls">
            <div className="g2-pad g2-pad--p1">
              <KeyCap role="P1" keyChar="Q" icon="⚔" label="공격" lit={litP1Atk} />
              <KeyCap role="P1" keyChar="W" icon="🛡" label="회피" lit={litP1Dod} />
              <div className="g2-stance c-p1">
                <span className="g2-stance__label">STANCE</span>
                <span className="g2-stance__icon">{POSE_ICON[pose1]}</span>
              </div>
            </div>
            <div className="g2-hint c-muted">
              실시간 넉백 — 공격(⚔)은 상대를 밀고, 회피(🛡)로 막으면 되받아친다 · 밀물이 링을 조인다 ·
              링 밖으로 밀리면 낙사
            </div>
            <div className="g2-pad g2-pad--p2">
              <div className="g2-stance c-p2">
                <span className="g2-stance__label">{flowOnline ? 'CPU' : 'STANCE'}</span>
                <span className="g2-stance__icon">{POSE_ICON[pose2]}</span>
              </div>
              <KeyCap role="P2" keyChar="U" icon="⚔" label="공격" lit={litP2Atk} />
              <KeyCap role="P2" keyChar="I" icon="🛡" label="회피" lit={litP2Dod} />
            </div>
          </footer>
        )}
      </div>

      {/* 라운드/매치 결과 오버레이 (game1 소유 공용 — import만) */}
      <ResultOverlay />
      <RoundIntro />
    </main>
  );
}
