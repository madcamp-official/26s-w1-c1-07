/**
 * S8 게임 선택 — 오프라인 진입 (lobby 에이전트 소유).
 *
 * 컨테이너 testid: scr-game-select / 카드: card-game1·2·3 / 좌상단 "← 메인으로"
 * - 카드 클릭: startOfflineGame(n) → navigate(`/game/${n}`) — 매칭 단계 없이 즉시
 *   (QA-S8-02, 주석 16:1665 "바로 게임으로 접속")
 * - 로그인 무관 도달 가능 (QA-S8-03) / 메인 복귀 수단 (QA-S8-04)
 * - PLAN §2-S8: "어떤 장난감으로 싸울까?" 진열대 — 클레이 오브젝트 카드 3장
 */
import { useNavigate } from 'react-router-dom';
import type { GameId } from '@shared';
import { startOfflineGame } from '../state/flow';
import { Card, ClayBlob } from '../components';
import { useDebugScreen } from '../debug';
import './lobby.css';

/** 게임1 — 딸기핑크 숫자 풍선 */
function BalloonObj() {
  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: 'var(--p1)',
          boxShadow: 'var(--shadow-clay)',
          color: '#FFF9F4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-num)',
          fontWeight: 800,
          fontSize: 32,
        }}
      >
        42
      </div>
      {/* 풍선 매듭 */}
      <div
        aria-hidden="true"
        style={{
          width: 14,
          height: 14,
          borderRadius: '50% 50% 60% 60%',
          background: 'var(--p1)',
          margin: '-4px auto 0',
        }}
      />
    </div>
  );
}

/** 게임2 — 라벤더 총알 캡슐 */
function CapsuleObj() {
  return (
    <div
      style={{
        width: 46,
        height: 94,
        borderRadius: 24,
        background: 'linear-gradient(180deg, rgba(255,251,247,0.92) 0 46%, var(--lavender) 46%)',
        boxShadow: 'var(--shadow-clay)',
        transform: 'rotate(20deg)',
      }}
    />
  );
}

/** 게임3 — 이쑤시개 검 + 바다 파도 */
function SwordObj() {
  return (
    <div style={{ position: 'relative', width: 110, height: 100 }}>
      <svg
        width="90"
        height="78"
        viewBox="0 0 90 78"
        style={{ position: 'absolute', left: 12, top: 0 }}
        aria-hidden="true"
      >
        <rect x="39" y="2" width="13" height="44" rx="6.5" fill="#C9C2D8" />
        <rect x="26" y="42" width="39" height="11" rx="5.5" fill="var(--pop)" />
        <rect x="40" y="52" width="11" height="17" rx="5.5" fill="var(--p2)" />
      </svg>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 110,
          height: 24,
          borderRadius: 14,
          background: 'var(--sea)',
          boxShadow: 'var(--shadow-sunken)',
        }}
      />
    </div>
  );
}

const GAMES: { id: GameId; name: string; desc: string; obj: React.ReactNode }[] = [
  { id: 1, name: '게임1 · 숫자 맞추기', desc: '타겟 숫자에 맞추고 3초 버티기!', obj: <BalloonObj /> },
  { id: 2, name: '게임2 · 총알 피하기', desc: '쏟아지는 캡슐 비를 피해 살아남기!', obj: <CapsuleObj /> },
  { id: 3, name: '게임3 · 펜싱', desc: '밀어붙여서 바다에 퐁당 빠뜨리기!', obj: <SwordObj /> },
];

/** 타이틀 글자 색 교차 (S2와 동일 규칙) */
const TITLE_COLORS = ['var(--accent)', 'var(--p2)', 'var(--pop)', 'var(--lavender)'];

export default function GameSelect() {
  useDebugScreen('scr-game-select');
  const navigate = useNavigate();

  const pick = (id: GameId) => {
    startOfflineGame(id);
    navigate(`/game/${id}`);
  };

  return (
    <main data-testid="scr-game-select" className="screen">
      <ClayBlob shape="star" size={190} color="#F9E4C8" style={{ top: -50, right: -40 }} />
      <ClayBlob shape="donut" size={200} style={{ bottom: -80, left: -60 }} />

      {/* 메인 복귀 (QA-S8-04) */}
      <button type="button" className="jelly gsel-back" onClick={() => navigate('/')}>
        ← 메인으로
      </button>

      <div className="gsel-body">
        <div>
          <h1 className="gsel-title breath" aria-label="MADPUMP" style={{ textAlign: 'center' }}>
            {'MADPUMP'.split('').map((ch, i) => (
              <span key={i} aria-hidden="true" style={{ color: TITLE_COLORS[i % TITLE_COLORS.length] }}>
                {ch}
              </span>
            ))}
          </h1>
          <p className="gsel-sub">어떤 장난감으로 싸울까?</p>
        </div>

        <div className="gsel-cards">
          {GAMES.map((g) => (
            <Card
              key={g.id}
              interactive
              className="gsel-card pop-in"
              data-testid={`card-game${g.id}`}
              role="button"
              tabIndex={0}
              aria-label={g.name}
              onClick={() => pick(g.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pick(g.id);
                }
              }}
            >
              <div className="gsel-obj">{g.obj}</div>
              <h2 className="gsel-name">{g.name}</h2>
              <p className="gsel-desc">{g.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
