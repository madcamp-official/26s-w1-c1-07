/**
 * S8 게임 선택 (lobby 에이전트 소유).
 * 컨테이너 testid: scr-game-select / 카드: card-game1, card-game2, card-game3
 * PLAN §2-S8: 아케이드 캐비닛 3대 — 상단 마퀴(GAME 1 옐로 / GAME 2 시안 / GAME 3 핑크) +
 *   중앙 "스크린" 미니 픽토그램(게임1 '87'+↑↓ / 게임2 낙하 트레일 3줄 / 게임3 교차 검+파도) +
 *   하단 게임명(Gugi) + 컨트롤 패널 버튼 도트 2개. hover 시 그 캐비닛만 마퀴 점등(attract).
 *   좌상단 [◀ 메인으로](tertiary), 상단 중앙 소형 MADPUMP 워드마크.
 * SPEC QA-S8-01~04: 카드 클릭 → startOfflineGame(n); navigate(`/game/${n}`) — 매칭 없이 즉시.
 *   로그인 불필요(라우트 가드 없음). 메인 복귀 수단 = [◀ 메인으로].
 */
import { useNavigate } from 'react-router-dom';
import type { GameId } from '@shared';
import { Button } from '../components';
import { useDebugScreen } from '../debug';
import { startOfflineGame } from '../state/flow';
import './game-select.css';

interface CabinetSpec {
  id: GameId;
  title: string;
  name: string;
  colorVar: string;
}

const CABINETS: CabinetSpec[] = [
  { id: 1, title: 'GAME 1', name: '숫자 맞추기', colorVar: 'var(--accent)' },
  { id: 2, title: 'GAME 2', name: '총알 피하기', colorVar: 'var(--p1)' },
  { id: 3, title: 'GAME 3', name: '펜싱', colorVar: 'var(--p2)' },
];

/** 게임별 스크린 픽토그램 (순수 장식) */
function Pictogram({ id }: { id: GameId }) {
  if (id === 1) {
    return (
      <div className="s8-picto s8-picto--g1" aria-hidden>
        <span className="s8-g1-arrow s8-g1-arrow--up font-arcade">▲</span>
        <span className="s8-g1-num font-arcade">87</span>
        <span className="s8-g1-arrow s8-g1-arrow--down font-arcade">▼</span>
      </div>
    );
  }
  if (id === 2) {
    return (
      <div className="s8-picto s8-picto--g2" aria-hidden>
        <span className="s8-g2-trail" />
        <span className="s8-g2-trail" />
        <span className="s8-g2-trail" />
      </div>
    );
  }
  return (
    <div className="s8-picto s8-picto--g3" aria-hidden>
      <span className="s8-g3-blades">
        <span className="s8-g3-blade s8-g3-blade--p1" />
        <span className="s8-g3-blade s8-g3-blade--p2" />
      </span>
      <svg className="s8-g3-wave" viewBox="0 0 120 14" preserveAspectRatio="none">
        <polyline
          points="0,12 15,3 30,12 45,3 60,12 75,3 90,12 105,3 120,12"
          fill="none"
          stroke="var(--p1)"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

export default function GameSelect() {
  useDebugScreen('scr-game-select');
  const navigate = useNavigate();

  const pick = (id: GameId) => {
    startOfflineGame(id); // 매칭 단계 없이 즉시 인게임 (주석 16:1665)
    navigate(`/game/${id}`);
  };

  return (
    <main data-testid="scr-game-select" className="s8-root">
      <div className="vanish-grid" aria-hidden />

      <header className="s8-header">
        <Button variant="tertiary" onClick={() => navigate('/')}>
          ◀ 메인으로
        </Button>
        <p className="s8-wordmark font-arcade" aria-label="MADPUMP">
          <span className="c-p2 glow-text">MAD</span>
          <span className="c-p1 glow-text">PUMP</span>
        </p>
        <span className="s8-header-spacer" aria-hidden />
      </header>

      <p className="s8-caption font-arcade c-accent2">SELECT YOUR GAME</p>

      <div className="s8-floor">
        {CABINETS.map((cab) => (
          <button
            key={cab.id}
            type="button"
            className="s8-cabinet"
            data-testid={`card-game${cab.id}`}
            style={{ '--cab-color': cab.colorVar } as React.CSSProperties}
            onClick={() => pick(cab.id)}
          >
            <span className="s8-marquee">
              <span className="lamp" aria-hidden />
              <span className="s8-marquee-title font-arcade">{cab.title}</span>
              <span className="lamp" aria-hidden />
            </span>
            <span className="s8-screen">
              <Pictogram id={cab.id} />
            </span>
            <span className="s8-name font-display">{cab.name}</span>
            <span className="s8-panel" aria-hidden>
              <span className="s8-dot s8-dot--p1" />
              <span className="s8-dot s8-dot--p2" />
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}
