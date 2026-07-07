/**
 * RoundIntro — 매 라운드 시작 직전 뜨는 "플레이 방법" 인트로 (전 게임 S9~S12 공용).
 * ResultOverlay와 같은 계약: props 없이 flow/online store만 읽어 스스로 열림/닫힘.
 * 각 게임 화면이 <ResultOverlay /> 옆에 <RoundIntro /> 하나만 넣으면 된다.
 *
 * 동작:
 *  · 오프라인(로컬 2인): 라운드 시작(flow.currentRound 변화) 시 준비 시퀀스를 재생 —
 *    1라운드: 가이드(GUIDE_MS 3초) → "2" → "1" → "START!" → 게임 시작.
 *    2라운드부터: 가이드 생략, "2" → "1" → "START!" 카운트다운만.
 *    이 전체 구간 동안 roundIntroGate가 시뮬을 정지시켜(게임 루프가 게이트 확인),
 *    카운트다운이 끝나야(START! 후) step()이 돈다. → 겹침 없이 확실히 대기 후 시작.
 *    가이드는 양쪽 역할(P1 Q/W · P2 U/I)을 모두 보여준다.
 *  · 온라인: 서버 카운트다운(online.phase==='countdown', 3초) 동안 가이드 표시.
 *    이때 serverState=null이라 게임은 이미 자연히 정지 → 게이트 불필요.
 *    → 내가 배정받은 역할 하나만, 내 플레이어색(myColor)으로 보여준다.
 *  · 비대칭(로켓=4 / 공룡=6)만 역할별로 안내가 갈린다. 나머지는 공통.
 *  · 문구는 한글. 색은 역할이 아니라 '플레이어색'을 따른다(색 ≠ 역할, 렌더 모델과 일치).
 */
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { KeyCap } from '../../components';
import { useFlow } from '../../state/flow';
import { useOnline } from '../../net/online';
import { closeGate, openGate } from '../../state/roundIntroGate';
import './roundintro.css';

/** 오프라인 준비 시퀀스: (1라운드만) 가이드 GUIDE_MS 표시 → "2"·"1"·"START!" 카운트다운 → 게임 시작.
 *  2라운드부터는 가이드를 생략하고 카운트다운만. 이 전체 구간 동안 roundIntroGate가 시뮬을 정지. */
const GUIDE_MS = 3000;
/** 카운트다운 "2"/"1" 각 단계 지속(ms) */
const COUNT_STEP_MS = 700;
/** "START!" 표시 후 게임 시작까지(ms) */
const START_MS = 600;
/** 카운트다운만 걸리는 시간(2 → 1 → START) — 2라운드 이후 게이트 지속 */
const COUNTDOWN_MS = 2 * COUNT_STEP_MS + START_MS;
/** 1라운드 게이트 총 지속 = 가이드 + 카운트다운 */
const ROUND1_TOTAL_MS = GUIDE_MS + COUNTDOWN_MS;

type Cap = { icon: string; label: string };
type RoleCopy = { tag: string; line: string; k1: Cap; k2: Cap };
type SymCopy = { name: string; asym: false; line: string; k1: Cap; k2: Cap };
type AsymCopy = { name: string; asym: true; P1: RoleCopy; P2: RoleCopy };

/** 새 gameId 매핑 기준 (1 숫자 · 2 펜싱 · 3 펌프 · 4 로켓 · 5 라이트사이클 · 6 공룡 · 7 마그마 · 8 포격 · 9 오목 · 10 줄다리기) */
const COPY: Record<number, SymCopy | AsymCopy> = {
  1: { name: '숫자 맞추기', asym: false, line: '게이지를 올려 내 숫자를 <em>타겟</em>에 맞추고 — 멈춰서 버텨라!', k1: { icon: '▼', label: '내리기' }, k2: { icon: '▲', label: '올리기' } },
  2: { name: '펜싱', asym: false, line: '찌르고 막아 상대를 <em>링 밖</em>으로 밀어내라!', k1: { icon: '⚔', label: '공격' }, k2: { icon: '⛨', label: '회피' } },
  3: { name: '펌프', asym: false, line: '뜨는 <em>화살표</em>와 같은 키를 정확히 눌러 점수를 쌓아라!', k1: { icon: '◀', label: '왼쪽' }, k2: { icon: '▶', label: '오른쪽' } },
  4: {
    name: '로켓 피하기', asym: true,
    P1: { tag: '공격수', line: '로켓을 쏴 상대를 3번 맞혀라!', k1: { icon: '⇋', label: '방향전환' }, k2: { icon: '✦', label: '발사' } },
    P2: { tag: '러너', line: '좌우로 피해 10초 버텨라!', k1: { icon: '◀', label: '왼쪽' }, k2: { icon: '▶', label: '오른쪽' } },
  },
  5: { name: '라이트 사이클', asym: false, line: '좌우 회전만으로 벽·궤적을 피해 <em>오래 살아남아라</em>!', k1: { icon: '↺', label: '좌회전' }, k2: { icon: '↻', label: '우회전' } },
  6: {
    name: '공룡 달리기', asym: true,
    P1: { tag: '공룡', line: '점프·숙이기로 피해 10초 살아남아라!', k1: { icon: '▲', label: '점프' }, k2: { icon: '▼', label: '숙이기' } },
    P2: { tag: '스포너', line: '선인장·새를 던져 공룡을 부딪혀라!', k1: { icon: '※', label: '선인장' }, k2: { icon: '^', label: '새' } },
  },
  7: { name: '마그마 총격 듀얼', asym: false, line: '점프로 떠서 가시·마그마를 피하며 상대를 <em>먼저 쏴라</em>!', k1: { icon: '▲', label: '점프' }, k2: { icon: '✦', label: '발사' } },
  8: { name: '몬스터 포격전', asym: false, line: '대포를 돌려 몬스터를 격추 — 내 대포를 <em>지켜라</em>!', k1: { icon: '⟳', label: '방향전환' }, k2: { icon: '✦', label: '발사' } },
  9: { name: '스피드 오목', asym: false, line: '커서가 원하는 칸에 올 때 놓아 먼저 <em>3목</em>을 만들어라!', k1: { icon: '●', label: '놓기' }, k2: { icon: '✳', label: '방해' } },
  10: { name: '줄다리기', asym: false, line: '두 키를 <em>번갈아</em> 연타해 밧줄을 당겨라!', k1: { icon: '⇄', label: '교대①' }, k2: { icon: '⇄', label: '교대②' } },
  // 신규 게임 11~13 — 화면 전부 영어 (요구사항)
  11: { name: 'HOT POTATO', asym: false, line: 'Pass the bomb — <em>don’t</em> hold it when it blows!', k1: { icon: '⇄', label: 'PASS' }, k2: { icon: '✳', label: 'FAKE' } },
  12: { name: 'RED LIGHT, GREEN LIGHT', asym: false, line: 'Mash to run — <em>freeze</em> on the red light!', k1: { icon: '▶', label: 'RUN' }, k2: { icon: '✖', label: 'STOP' } },
  13: { name: 'POT SHOT', asym: false, line: 'Aim the angle, charge power — <em>hit the pot</em>!', k1: { icon: '∠', label: 'AIM' }, k2: { icon: '✳', label: 'POWER' } },
};

/** <em>…</em> 마크업을 노드로 (dangerouslySetInnerHTML 회피) */
function renderLine(s: string): ReactNode {
  const parts = s.split(/(<em>.*?<\/em>)/g).filter(Boolean);
  return parts.map((p, i) => {
    const m = p.match(/^<em>(.*?)<\/em>$/);
    return m ? <em key={i}>{m[1]}</em> : <span key={i}>{p}</span>;
  });
}

export default function RoundIntro() {
  const flow = useFlow();
  const o = useOnline();

  // 온라인 우선 판정(getPlayerDisplays 선례). 실서버 온라인은 flow.mode를 안 건드리므로 store 직접 확인.
  const onlineActive =
    o.gameId != null &&
    o.role != null &&
    (o.phase === 'countdown' || o.phase === 'playing' || o.phase === 'round-result');
  const onlineIntro = onlineActive && o.phase === 'countdown';
  const offlineActive =
    !onlineActive &&
    flow.mode === 'offline' &&
    flow.phase === 'playing' &&
    flow.currentRound > 0 &&
    flow.gameId != null;

  // 오프라인: 라운드 키 변화 감지 → 게이트 open + 가이드→2→1→START→시작 타이머
  //  offStep: 'guide' 가이드 표시 / 'c2'·'c1' 카운트다운 / 'start' START! / null 종료(게임 시작)
  const [offStep, setOffStep] = useState<'guide' | 'c2' | 'c1' | 'start' | null>(null);
  // ⚠️ keyRef 가드를 쓰지 않는다: StrictMode(dev) mount→unmount→mount에서
  //   ref가 유지돼 2차 마운트가 openGate를 건너뛰고(가드 매치) 게이트가 닫힌 채 남는 버그
  //   (첫 라운드에서만 안내가 안 뜨고 게임이 겹쳐 보이던 원인). 대신 cleanup에서 게이트를
  //   확실히 닫아, 재실행(=strict 2차 마운트/라운드 전환)이 항상 새로 열도록 한다.
  useEffect(() => {
    if (!offlineActive || flow.gameId == null) return;
    // 1라운드: 가이드(GUIDE_MS) 후 카운트다운. 2라운드부터: 가이드 생략, 카운트다운만.
    const withGuide = flow.currentRound <= 1;
    const total = withGuide ? ROUND1_TOTAL_MS : COUNTDOWN_MS;
    // 카운트다운 시작 오프셋(가이드가 있으면 GUIDE_MS 뒤, 없으면 0)
    const c2At = withGuide ? GUIDE_MS : 0;
    // 준비 시퀀스 전체 동안 게임 정지 — 카운트다운이 끝나야(START! 후) step()이 돈다.
    openGate(total);
    setOffStep(withGuide ? 'guide' : 'c2');
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (withGuide) timers.push(setTimeout(() => setOffStep('c2'), c2At));
    timers.push(setTimeout(() => setOffStep('c1'), c2At + COUNT_STEP_MS));
    timers.push(setTimeout(() => setOffStep('start'), c2At + 2 * COUNT_STEP_MS));
    timers.push(
      setTimeout(() => {
        setOffStep(null);
        closeGate();
      }, total),
    );
    return () => {
      timers.forEach(clearTimeout);
      setOffStep(null);
      closeGate(); // 재실행/언마운트 시 게이트 해제 — 다음 실행(또는 strict 2차 마운트)이 다시 연다
    };
  }, [offlineActive, flow.gameId, flow.currentRound]);

  // ── payload 결정 (online 우선) ──
  let gameId: number | null = null;
  let showOffline = false;
  let onlineRole: 'P1' | 'P2' = 'P1';
  let colorRole: 'P1' | 'P2' = 'P1'; // myColor(blue→P1시안 / red→P2핑크) → KeyCap 색 + 패널색
  if (onlineIntro && o.gameId != null && o.role != null) {
    gameId = o.gameId;
    onlineRole = o.role;
    colorRole = (o.myColor ?? 'blue') === 'blue' ? 'P1' : 'P2';
  } else if (offStep && offlineActive && flow.gameId != null) {
    gameId = flow.gameId;
    showOffline = true;
  }
  if (gameId == null) return null;
  const c = COPY[gameId];
  if (!c) return null;

  // 오프라인 카운트다운 단계면 가이드 대신 큰 "2/1/START!" 오버레이를 보여준다.
  const offCountdown =
    showOffline && offStep === 'c2'
      ? '2'
      : showOffline && offStep === 'c1'
        ? '1'
        : showOffline && offStep === 'start'
          ? 'START!'
          : null;
  if (offCountdown) {
    return (
      <div className="ri ri--count" data-testid="round-intro" aria-hidden>
        <span
          key={offCountdown}
          className={`ri-count__num font-arcade glow-text anim-sign-on ${offCountdown === 'START!' ? 'ri-count__go' : ''}`}
        >
          {offCountdown}
        </span>
      </div>
    );
  }

  const roundKey = showOffline
    ? `off:${gameId}:${flow.currentRound}`
    : `on:${gameId}:${o.round}:${onlineRole}`;
  // 오프라인(양쪽 표시)=중립 옐로, 온라인=내 플레이어색
  const panelColor = showOffline ? 'var(--accent)' : colorRole === 'P1' ? 'var(--p1)' : 'var(--p2)';

  const caps = (role: 'P1' | 'P2', keys: [string, string], k1: Cap, k2: Cap) => (
    <div className="ri__caps">
      <KeyCap role={role} keyChar={keys[0]} icon={k1.icon} label={k1.label} />
      <KeyCap role={role} keyChar={keys[1]} icon={k2.icon} label={k2.label} />
    </div>
  );

  let tag: string | null = null;
  let line: ReactNode = null;
  let body: ReactNode = null;

  if (c.asym) {
    if (showOffline) {
      line = '두 역할이 다르게 플레이한다!';
      body = (
        <div className="ri__keys">
          <div className="ri__side">
            <span className="ri__who is-p1">{c.P1.tag} · P1</span>
            <span className="ri__subline">{c.P1.line}</span>
            {caps('P1', ['Q', 'W'], c.P1.k1, c.P1.k2)}
          </div>
          <span className="ri__vs font-arcade">VS</span>
          <div className="ri__side">
            <span className="ri__who is-p2">{c.P2.tag} · P2</span>
            <span className="ri__subline">{c.P2.line}</span>
            {caps('P2', ['U', 'I'], c.P2.k1, c.P2.k2)}
          </div>
        </div>
      );
    } else {
      const r = c[onlineRole];
      tag = `내 역할 · ${r.tag}`;
      line = r.line;
      body = <div className="ri__keys">{caps(colorRole, ['U', 'I'], r.k1, r.k2)}</div>;
    }
  } else {
    line = renderLine(c.line);
    if (showOffline) {
      body = (
        <div className="ri__keys">
          <div className="ri__side">
            <span className="ri__who is-p1">P1</span>
            {caps('P1', ['Q', 'W'], c.k1, c.k2)}
          </div>
          <span className="ri__vs font-arcade">VS</span>
          <div className="ri__side">
            <span className="ri__who is-p2">P2</span>
            {caps('P2', ['U', 'I'], c.k1, c.k2)}
          </div>
        </div>
      );
    } else {
      body = <div className="ri__keys">{caps(colorRole, ['U', 'I'], c.k1, c.k2)}</div>;
    }
  }

  return (
    <div className="ri" data-testid="round-intro" aria-hidden>
      <div
        key={roundKey}
        className="ri__panel corner-brackets anim-sign-on"
        style={{ '--ri-color': panelColor } as CSSProperties}
      >
        <i className="cb2" />
        {tag && <span className="ri__tag font-display">{tag}</span>}
        <h2 className="ri__name font-display">{c.name}</h2>
        <p className="ri__line">{line}</p>
        {body}
        <span className="ri__ready c-accent anim-blink">
          {showOffline ? 'GET READY…' : '▶ 곧 시작'}
        </span>
      </div>
    </div>
  );
}
