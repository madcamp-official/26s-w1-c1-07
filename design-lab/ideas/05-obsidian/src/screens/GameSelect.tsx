/**
 * S8 게임 선택 — 오프라인 진입 (scr-game-select). 소유: lobby 에이전트.
 * SPEC S8 + PLAN §2.S8 참조 — "종목 포스터" 3열 카드.
 * 필요 testid: card-game1, card-game2, card-game3 (+ 뒤로가기)
 * 카드 클릭: startOfflineMatch(n) → navigate(gamePath(n)) — 매칭 단계 없이 즉시 인게임.
 * 로그인 여부 무관 (QA-S8-03).
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameId } from '@shared';
import { useScreenBridge } from '../debug';
import { gamePath, startOfflineMatch } from '../state/flow';
import { Button, Card, KeyCap } from '../components';
import './lobby.css';

/* --- 종목 미니 비주얼 (PLAN §3 모티프의 정적 아이콘, 전 카드 시안 통일) ----- */

function Game1Visual() {
  // 주파수 동조 — 파형 + 타겟 링
  return (
    <svg viewBox="0 0 120 64" width="120" height="64" fill="none" aria-hidden="true">
      <polyline
        points="4,40 22,40 32,18 42,54 52,26 60,36 74,36 84,30 116,30"
        stroke="rgba(0,240,255,.55)"
        strokeWidth="1.5"
      />
      <circle cx="60" cy="36" r="11" stroke="var(--p1)" strokeWidth="1.5" />
      <line x1="60" y1="6" x2="60" y2="18" stroke="rgba(0,240,255,.35)" strokeWidth="1" />
      <line x1="60" y1="54" x2="60" y2="60" stroke="rgba(0,240,255,.35)" strokeWidth="1" />
    </svg>
  );
}

function Game2Visual() {
  // 빛의 그물 — 상단 레일 광점 + 낙하 탄막 트레일
  return (
    <svg viewBox="0 0 120 64" width="120" height="64" fill="none" aria-hidden="true">
      <line x1="8" y1="10" x2="112" y2="10" stroke="rgba(0,240,255,.5)" strokeWidth="1.5" />
      <circle cx="46" cy="10" r="4" fill="var(--p1)" />
      <line x1="46" y1="18" x2="46" y2="34" stroke="rgba(0,240,255,.3)" strokeWidth="2" />
      <rect x="44" y="32" width="4" height="9" rx="2" fill="var(--p1)" />
      <line x1="78" y1="14" x2="78" y2="44" stroke="rgba(0,240,255,.22)" strokeWidth="2" />
      <rect x="76" y="42" width="4" height="9" rx="2" fill="rgba(0,240,255,.8)" />
      <line x1="8" y1="56" x2="112" y2="56" stroke="rgba(0,240,255,.5)" strokeWidth="1.5" />
      <circle cx="86" cy="56" r="4" fill="none" stroke="var(--p1)" strokeWidth="1.5" />
    </svg>
  );
}

function Game3Visual() {
  // 심해 위의 피스트 — 칸 라인 무대 + 대치 검 라인
  return (
    <svg viewBox="0 0 120 64" width="120" height="64" fill="none" aria-hidden="true">
      <line x1="14" y1="44" x2="106" y2="44" stroke="rgba(234,240,248,.6)" strokeWidth="1.5" />
      {[14, 29.3, 44.7, 60, 75.3, 90.7, 106].map((x) => (
        <line key={x} x1={x} y1="44" x2={x} y2="50" stroke="rgba(0,240,255,.35)" strokeWidth="1" />
      ))}
      {/* 좌 파이터(런지) / 우 파이터(대치) */}
      <path d="M34 42 L42 30 L52 36" stroke="var(--p1)" strokeWidth="1.5" />
      <circle cx="42" cy="26" r="3.5" stroke="var(--p1)" strokeWidth="1.5" />
      <path d="M86 42 L80 30 L70 37" stroke="rgba(0,240,255,.45)" strokeWidth="1.5" />
      <circle cx="80" cy="26" r="3.5" stroke="rgba(0,240,255,.45)" strokeWidth="1.5" />
      <path d="M18 52 Q34 56 50 52 T82 52 T106 54" stroke="rgba(0,240,255,.15)" strokeWidth="1" />
    </svg>
  );
}

interface Discipline {
  id: GameId;
  num: string;
  en: string;
  name: string;
  visual: ReactNode;
}

const DISCIPLINES: Discipline[] = [
  { id: 1, num: '01', en: 'FREQUENCY SYNC', name: '게임1 — 숫자 맞추기', visual: <Game1Visual /> },
  { id: 2, num: '02', en: 'LIGHT BARRAGE', name: '게임2 — 총알 피하기', visual: <Game2Visual /> },
  { id: 3, num: '03', en: 'ABYSS FENCING', name: '게임3 — 펜싱', visual: <Game3Visual /> },
];

export default function GameSelect() {
  useScreenBridge('scr-game-select');
  const navigate = useNavigate();

  const enter = (id: GameId) => {
    startOfflineMatch(id);
    navigate(gamePath(id));
  };

  return (
    <div className="screen" data-testid="scr-game-select">
      <header className="topbar">
        <Button variant="ghost" onClick={() => navigate('/')}>
          ← 메인으로
        </Button>
        <span className="logotype">
          MADPUMP<em>{'//'}</em>
        </span>
      </header>

      <main className="gsel-body">
        <div className="overline">SELECT DISCIPLINE {'//'} LOCAL VERSUS</div>
        <h1 className="display gsel-title">MADPUMP</h1>

        <div className="gsel-grid">
          {DISCIPLINES.map((d) => (
            <Card
              key={d.id}
              hoverable
              testId={`card-game${d.id}`}
              onClick={() => enter(d.id)}
              role="button"
              aria-label={d.name}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') enter(d.id);
              }}
            >
              <div className="gsel-num">{d.num}</div>
              <div className="overline" style={{ marginTop: 4 }}>
                {d.en}
              </div>
              <div className="gsel-visual">{d.visual}</div>
              <div className="gsel-name">{d.name}</div>
              <div className="gsel-hint">
                <KeyCap label="Q" side="p1" />
                <KeyCap label="W" side="p1" />
                <span className="gsel-vs">VS</span>
                <KeyCap label="U" side="p2" />
                <KeyCap label="I" side="p2" />
              </div>
              <div className="overline gsel-enter">ENTER ARENA →</div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
