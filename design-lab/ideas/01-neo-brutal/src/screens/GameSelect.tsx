/**
 * S8. 게임 선택 — 오프라인 진입 (scr-game-select)
 * [OWNER: lobby 에이전트] — 이 파일은 lobby 에이전트만 수정한다.
 *
 * SPEC S8 / PLAN §2-S8:
 *  - "3연속 아케이드 포스터" 카드 3장 (card-game1/2/3) — 클릭 시
 *    startOfflineGame(n) → navigate(`/game/${n}`) (매칭 단계 없음)
 *  - 좌상단 [← 메인으로] / 상단 중앙 소형 MADPUMP 워드마크 / 로그인 불필요
 */
import { useNavigate } from 'react-router-dom';
import type { GameId } from '@shared';
import { Button, Sticker } from '../components';
import { useDebugScreen } from '../debug';
import { startOfflineGame } from '../state/flow';

const css = `
.s8-head {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 22px 28px 6px;
}
.s8-mark {
  font-family: var(--font-display);
  font-size: 26px;
  letter-spacing: 0.02em;
  text-align: center;
  user-select: none;
}
.s8-mark em {
  font-style: normal;
  color: var(--accent);
}
.s8-grid {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 36px;
  padding: 4vh 6vw 60px;
  flex-wrap: wrap;
}
.s8-card {
  width: min(300px, 84vw);
  min-height: 440px;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 4px solid var(--ink);
  box-shadow: var(--shadow-md);
  padding: 0;
  text-align: center;
  transition:
    transform var(--dur-fast) var(--ease-snap),
    box-shadow var(--dur-fast) var(--ease-snap);
}
.s8-card:hover {
  transform: translate(-2px, -2px);
  box-shadow: 10px 10px 0 var(--ink);
}
.s8-card:active {
  transform: translate(6px, 6px);
  box-shadow: none;
}
.s8-card__strip {
  background: var(--ink);
  color: var(--bg);
  font-family: var(--font-mono);
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 14px;
  padding: 9px 12px;
}
.s8-card__pict {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  position: relative;
  overflow: hidden;
}
.s8-card:hover .s8-card__pict > * {
  animation: s8-jolt 240ms steps(2);
}
@keyframes s8-jolt {
  from {
    transform: translateY(-3px);
  }
  to {
    transform: translateY(3px);
  }
}
.s8-card__pict--g1 {
  background: var(--highlight);
}
.s8-card__pict--g2 {
  background: var(--accent);
}
.s8-card__pict--g3 {
  background: linear-gradient(90deg, var(--p1-tint) 0 50%, var(--p2-tint) 50% 100%);
}
.s8-card__name {
  padding: 18px 12px 22px;
  border-top: 3px solid var(--ink);
  display: flex;
  justify-content: center;
}
.s8-num {
  font-family: var(--font-display);
  font-size: 96px;
  line-height: 1;
  color: var(--ink);
  background: var(--surface);
  border: 4px solid var(--ink);
  box-shadow: var(--shadow-sm);
  padding: 2px 18px;
}
.s8-arrows {
  display: flex;
  gap: 18px;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 30px;
}
.s8-arrows span {
  border: 3px solid var(--ink);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.s8-caps {
  display: flex;
  gap: 26px;
  align-items: flex-start;
}
.s8-cap {
  width: 30px;
  height: 66px;
  border: 3px solid var(--ink);
  border-radius: 15px;
  background: linear-gradient(180deg, var(--surface) 0 60%, var(--highlight) 60% 100%);
  box-shadow: 2px 2px 0 var(--ink);
}
.s8-cap:nth-child(2) {
  margin-top: 34px;
}
.s8-cap:nth-child(3) {
  margin-top: 12px;
}
`;

interface PosterProps {
  id: GameId;
  name: string;
  pictClass: string;
  children: React.ReactNode;
  onPick(id: GameId): void;
}

function Poster({ id, name, pictClass, children, onPick }: PosterProps) {
  return (
    <button
      type="button"
      className="s8-card"
      data-testid={`card-game${id}`}
      onClick={() => onPick(id)}
    >
      <span className="s8-card__strip">GAME {id}</span>
      <span className={`s8-card__pict ${pictClass}`}>{children}</span>
      <span className="s8-card__name">
        <Sticker tilt={-3} fontSize={20}>
          {name}
        </Sticker>
      </span>
    </button>
  );
}

/** 게임3 픽토그램: 교차하는 검 2자루 + 파도 */
function SwordsPict() {
  return (
    <svg width="150" height="120" viewBox="0 0 150 120" aria-hidden>
      <g stroke="#0a0a0a" strokeWidth="5" strokeLinecap="square">
        <line x1="30" y1="18" x2="112" y2="76" stroke="#2b5bff" strokeWidth="8" />
        <line x1="120" y1="18" x2="38" y2="76" stroke="#ff2e88" strokeWidth="8" />
        <line x1="22" y1="10" x2="40" y2="26" />
        <line x1="128" y1="10" x2="110" y2="26" />
      </g>
      <polyline
        points="10,104 30,92 50,104 70,92 90,104 110,92 130,104 145,95"
        fill="none"
        stroke="#2b5bff"
        strokeWidth="6"
      />
    </svg>
  );
}

export default function GameSelect() {
  useDebugScreen('scr-game-select');
  const navigate = useNavigate();

  const pick = (id: GameId) => {
    startOfflineGame(id);
    navigate(`/game/${id}`);
  };

  return (
    <div className="screen" data-testid="scr-game-select">
      <style>{css}</style>
      <header className="s8-head">
        <div>
          <Button variant="secondary" size="sm" onClick={() => navigate('/')}>
            ← 메인으로
          </Button>
        </div>
        <div className="s8-mark" aria-label="MADPUMP">
          M<em>A</em>DPUMP
        </div>
        <div />
      </header>

      <main className="s8-grid">
        <Poster id={1} name="숫자 맞추기" pictClass="s8-card__pict--g1" onPick={pick}>
          <span className="s8-num">87</span>
          <span className="s8-arrows">
            <span>↑</span>
            <span>↓</span>
          </span>
        </Poster>

        <Poster id={2} name="총알 피하기" pictClass="s8-card__pict--g2" onPick={pick}>
          <span className="s8-caps">
            <i className="s8-cap" />
            <i className="s8-cap" />
            <i className="s8-cap" />
          </span>
        </Poster>

        <Poster id={3} name="펜싱" pictClass="s8-card__pict--g3" onPick={pick}>
          <SwordsPict />
        </Poster>
      </main>
    </div>
  );
}
