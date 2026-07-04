/**
 * S8 게임 선택 — TONIGHT'S CARD 대진표 (lobby 에이전트 구현).
 *
 * SPEC S8: 게임1/2/3 선택 → 즉시 인게임(매칭 없음) / 로그인 무관 도달 / 메인 복귀 수단.
 * PLAN §2 S8: 경기 예고 카드 3장 가로 배치(픽토그램 + 게임명 + 룰 요약 + MATCH 라벨),
 * hover 시 골드 엣지 점등, 좌상단 뒤로가기.
 *
 * testid: scr-game-select / card-game1 / card-game2 / card-game3
 */
import { useNavigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import type { GameId } from '@shared';
import { Button, Card, SkewTab, Ticker } from '../components';
import { startOfflineGame } from '../state/flow';
import { useDebugScreen } from '../debug';
import './lobby.css';

/* ── 종목 픽토그램 (팀 컬러 듀얼 톤 미니 그래픽) ───────────────── */

function PictoGame1() {
  return (
    <svg width="96" height="64" viewBox="0 0 96 64" fill="none" aria-hidden="true">
      {/* 타겟 플립보드 슬랫 */}
      <rect x="26" y="8" width="44" height="34" rx="4" fill="var(--strip)" />
      <line x1="26" y1="25" x2="70" y2="25" stroke="#fff" strokeOpacity="0.25" strokeWidth="2" />
      <text
        x="48"
        y="33"
        textAnchor="middle"
        fill="#fff"
        fontFamily="var(--font-display)"
        fontWeight="800"
        fontSize="20"
      >
        42
      </text>
      {/* 좌우 현재숫자 패널 */}
      <rect x="6" y="46" width="34" height="12" rx="2" fill="var(--p1-tint)" stroke="var(--p1)" strokeWidth="2" />
      <rect x="56" y="46" width="34" height="12" rx="2" fill="var(--p2-tint)" stroke="var(--p2)" strokeWidth="2" />
    </svg>
  );
}

function PictoGame2() {
  return (
    <svg width="96" height="64" viewBox="0 0 96 64" fill="none" aria-hidden="true">
      {/* 상단 P1 트랙 / 하단 P2 트랙 */}
      <line x1="8" y1="12" x2="88" y2="12" stroke="var(--p1)" strokeWidth="2" />
      <circle cx="30" cy="12" r="7" fill="var(--p1)" />
      <line x1="8" y1="54" x2="88" y2="54" stroke="var(--p2)" strokeWidth="2" />
      <circle cx="62" cy="54" r="7" fill="var(--p2)" />
      {/* 낙하 총알 캡슐 + 트레일 */}
      <rect x="42" y="28" width="8" height="16" rx="4" fill="var(--strip)" />
      <rect x="43.5" y="20" width="5" height="6" rx="2.5" fill="var(--strip)" opacity="0.35" />
      <rect x="44.5" y="14" width="3" height="4" rx="1.5" fill="var(--strip)" opacity="0.15" />
    </svg>
  );
}

function PictoGame3() {
  return (
    <svg width="96" height="64" viewBox="0 0 96 64" fill="none" aria-hidden="true">
      {/* 피스트 플랫폼 + 바다 */}
      <line x1="16" y1="52" x2="80" y2="52" stroke="var(--strip)" strokeWidth="3" />
      <path d="M2 58c4 0 4-3 8-3s4 3 8 3" stroke="var(--p1)" strokeWidth="2" strokeLinecap="round" />
      <path d="M78 58c4 0 4-3 8-3s4 3 8 3" stroke="var(--p2)" strokeWidth="2" strokeLinecap="round" />
      {/* 스틱 펜서 2명 (P1 런지 / P2 방패) */}
      <circle cx="34" cy="22" r="5" fill="var(--p1)" />
      <path d="M34 27v12l-6 10M34 33l8 6M34 39l8 8" stroke="var(--p1)" strokeWidth="3" strokeLinecap="round" />
      <path d="M42 39l16-6" stroke="var(--p1)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="64" cy="24" r="5" fill="var(--p2)" />
      <path d="M64 29v11l4 11M64 34l-5 7" stroke="var(--p2)" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="57" cy="42" rx="4" ry="7" fill="var(--p2-tint)" stroke="var(--p2)" strokeWidth="2" />
    </svg>
  );
}

interface MatchCardDef {
  id: GameId;
  testId: string;
  matchNo: string;
  title: string;
  desc: string;
  picto: () => ReactElement;
}

const MATCH_CARDS: MatchCardDef[] = [
  {
    id: 1,
    testId: 'card-game1',
    matchNo: 'MATCH 01',
    title: '게임1 · 숫자 맞추기',
    desc: '타겟 숫자에 내 숫자를 맞추고 3초 유지하면 승리',
    picto: PictoGame1,
  },
  {
    id: 2,
    testId: 'card-game2',
    matchNo: 'MATCH 02',
    title: '게임2 · 총알 피하기',
    desc: 'P1은 총알 발사, P2는 좌우 회피 — 명중 시 P1 승',
    picto: PictoGame2,
  },
  {
    id: 3,
    testId: 'card-game3',
    matchNo: 'MATCH 03',
    title: '게임3 · 펜싱',
    desc: '1초마다 공격·회피 수 싸움 — 상대를 바다로 밀어내면 승리',
    picto: PictoGame3,
  },
];

export default function GameSelect() {
  useDebugScreen('scr-game-select');
  const navigate = useNavigate();

  const pick = (id: GameId) => {
    startOfflineGame(id); // 매칭 단계 없음 (주석 16:1665 "바로 게임으로 접속")
    navigate(`/game/${id}`);
  };

  return (
    <div
      data-testid="scr-game-select"
      className="lobby-screen"
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: 'var(--ticker-h)',
      }}
    >
      {/* 헤더: 뒤로가기(QA-S8-04) + TONIGHT'S CARD */}
      <header style={{ padding: '16px 28px 0' }}>
        <Button variant="text" onClick={() => navigate('/')}>
          ← 메인으로
        </Button>
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 36,
          padding: '16px 48px 40px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <SkewTab>TONIGHT'S CARD</SkewTab>
          <h1
            className="wordmark"
            style={{ margin: '14px 0 6px', fontSize: 'clamp(36px, 5vw, 60px)' }}
          >
            경기를 선택하세요
          </h1>
          <p className="label" style={{ margin: 0, color: 'var(--ink-sub)' }}>
            OFFLINE EXHIBITION — PLAYER L (Q/W) VS PLAYER R (U/I)
          </p>
        </div>

        {/* 대진 카드 3장 — QA-S8-01/02 */}
        <div
          style={{
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'stretch',
          }}
        >
          {MATCH_CARDS.map((g) => {
            const Picto = g.picto;
            return (
              <Card
                key={g.id}
                testId={g.testId}
                accent="navy"
                hoverGold
                onClick={() => pick(g.id)}
                style={{
                  width: 264,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  textAlign: 'center',
                  paddingTop: 26,
                }}
              >
                <span className="label" style={{ color: 'var(--ink-sub)' }}>
                  {g.matchNo}
                </span>
                <Picto />
                <strong
                  className="display"
                  style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em' }}
                >
                  {g.title}
                </strong>
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-sub)', lineHeight: 1.55 }}>
                  {g.desc}
                </p>
              </Card>
            );
          })}
        </div>
      </main>

      <Ticker />
    </div>
  );
}
