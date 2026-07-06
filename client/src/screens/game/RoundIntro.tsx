/**
 * RoundIntro — 매 라운드 시작 직전 뜨는 "플레이 방법" 인트로 (전 게임 S9~S12 공용).
 * ResultOverlay와 같은 계약: props 없이 flow/online store만 읽어 스스로 열림/닫힘.
 * 각 게임 화면이 <ResultOverlay /> 옆에 <RoundIntro /> 하나만 넣으면 된다.
 *
 * 동작:
 *  · 오프라인(로컬 2인): 라운드 시작(flow.currentRound 변화) 시 INTRO_MS 동안 표시.
 *    이 동안 roundIntroGate가 게임 시뮬을 정지시킨다(게임 루프가 게이트를 확인).
 *    → 양쪽 역할(P1 Q/W · P2 U/I)을 모두 보여준다.
 *  · 온라인: 서버 카운트다운(online.phase==='countdown') 동안 표시.
 *    이때 serverState=null이라 게임은 이미 자연히 정지 → 게이트 불필요.
 *    → 내가 배정받은 역할 하나만, 내 플레이어색(myColor)으로 보여준다.
 *  · 비대칭(로켓=4 / 공룡=6)만 역할별로 안내가 갈린다. 나머지는 공통.
 *  · 문구는 한글. 색은 역할이 아니라 '플레이어색'을 따른다(색 ≠ 역할, 렌더 모델과 일치).
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { KeyCap } from '../../components';
import { useFlow } from '../../state/flow';
import { useOnline } from '../../net/online';
import { closeGate, openGate } from '../../state/roundIntroGate';
import './roundintro.css';

/** 오프라인 인트로(=게임 정지) 지속 시간. 애니메이션 1~2회 루프 + JIT 예열 창. */
const INTRO_MS = 2200;
/** 사라질 때 페이드아웃 길이 */
const OUT_MS = 300;

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

  // 오프라인: 라운드 키 변화 감지 → 게이트 open + in→out→unmount 타이머
  const [offPhase, setOffPhase] = useState<'in' | 'out' | null>(null);
  const keyRef = useRef('');
  useEffect(() => {
    if (!offlineActive) return;
    const key = `off:${flow.gameId}:${flow.currentRound}`;
    if (key === keyRef.current) return;
    keyRef.current = key;
    openGate(INTRO_MS);
    setOffPhase('in');
    const tOut = setTimeout(() => setOffPhase('out'), Math.max(0, INTRO_MS - OUT_MS));
    const tEnd = setTimeout(() => {
      setOffPhase(null);
      closeGate();
    }, INTRO_MS);
    return () => {
      clearTimeout(tOut);
      clearTimeout(tEnd);
    };
  }, [offlineActive, flow.gameId, flow.currentRound]);

  // 언마운트 시 게이트 확실히 해제(인트로 도중 이탈 대비)
  useEffect(() => () => closeGate(), []);

  // ── payload 결정 (online 우선) ──
  let gameId: number | null = null;
  let showOffline = false;
  let leaving = false;
  let onlineRole: 'P1' | 'P2' = 'P1';
  let colorRole: 'P1' | 'P2' = 'P1'; // myColor(blue→P1시안 / red→P2핑크) → KeyCap 색 + 패널색
  if (onlineIntro && o.gameId != null && o.role != null) {
    gameId = o.gameId;
    onlineRole = o.role;
    colorRole = (o.myColor ?? 'blue') === 'blue' ? 'P1' : 'P2';
  } else if (offPhase && offlineActive && flow.gameId != null) {
    gameId = flow.gameId;
    showOffline = true;
    leaving = offPhase === 'out';
  }
  if (gameId == null) return null;
  const c = COPY[gameId];
  if (!c) return null;

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
    <div className={`ri${leaving ? ' ri--out' : ''}`} data-testid="round-intro" aria-hidden>
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
        <span className="ri__ready c-accent anim-blink">▶ 곧 시작</span>
      </div>
    </div>
  );
}
