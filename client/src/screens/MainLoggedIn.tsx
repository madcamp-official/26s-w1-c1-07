/**
 * S2 메인 — 로그인 후 (lobby 에이전트 소유).
 * 컨테이너 testid: scr-main-in
 * PLAN §2-S2: 좌 로고 존 + 우 HI-SCORE 패널. "PLAYER 1: OOO" 겸용 네온 인사말(시안) +
 *   로그아웃(tertiary) + 설정 코인 버튼 + LeaderboardTable(lb-top3/lb-myrank 내장) +
 *   btn-online(옐로 primary, INSERT COIN ▶ 점멸 캡션)/btn-offline(시안 secondary).
 * SPEC QA-S2-01~09. 리더보드 = GET /api/leaderboard — 랭킹 기준은 보유 코인(docs/COINS.md).
 *   TOP3(정렬 순 앞 3명) + 내 정보 표시. 패널 클릭 → 분반 전체 랭킹 모달(ranking).
 *   분반에 기록이 없으면 빈 상태 정직 표기(§0.4) — LeaderboardTable의 NO RECORD.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, LeaderboardTable } from '../components';
import type { LeaderboardRow } from '../components';
import { useDebugScreen } from '../debug';
import { logout, restoreSession, useSession } from '../state/session';
import { openModal } from '../state/flow';
import { fetchLeaderboard } from '../net/leaderboard';
import './main-in.css';

export default function MainLoggedIn() {
  useDebugScreen('scr-main-in');
  const session = useSession();
  const navigate = useNavigate();

  const nickname = session.nickname ?? 'PLAYER';
  const groupName = session.groupName;

  const [top3, setTop3] = useState<LeaderboardRow[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardRow | undefined>(undefined);

  // 매치 정산/해금으로 코인이 변했을 수 있으니 메인 복귀 시 지갑 새로고침
  useEffect(() => {
    void restoreSession();
  }, []);

  // 마운트마다 서버에서 최신 랭킹 로드 — 매치/노가다 후 메인 복귀 시 자동 갱신
  useEffect(() => {
    let alive = true;
    void fetchLeaderboard().then((lb) => {
      if (!alive || !lb) return;
      setTop3(lb.rows.slice(0, 3)); // 공동 등수가 있어도 앞 3명만
      setMyRank(lb.me ?? undefined);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main data-testid="scr-main-in" className="s2-root">
      <div className="vanish-grid" aria-hidden />

      {/* 우상단 헤더: 인사말 + 코인 + 로그아웃 + 설정 */}
      <header className="s2-header">
        <span className="s2-coins font-arcade c-accent glow-text" data-testid="coin-balance" title="보유 코인">
          🪙 {session.coins}
        </span>
        <p className="s2-greet">
          <span className="font-arcade s2-greet-tag c-p1 glow-text">PLAYER 1:</span>
          <span className="font-display s2-greet-name c-p1 glow-text">{nickname}</span>
          <span className="font-display s2-greet-hello">님 안녕하세요</span>
        </p>
        <Button
          variant="tertiary"
          onClick={() => {
            logout();
            navigate('/');
          }}
        >
          로그아웃
        </Button>
      </header>

      <div className="s2-body">
        {/* 좌측 로고 존 */}
        <section className="s2-logo-zone">
          <h1 className="s2-logo font-arcade" aria-label="MADPUMP">
            <span className="s2-logo-mad glow-text">MAD</span>
            <span className="s2-logo-pump glow-text">PUMP</span>
          </h1>
          <p className="s2-tagline font-arcade c-accent2">1v1 PUMPING DUEL</p>

          <div className="s2-cta">
            <p className="s2-insert font-arcade c-accent anim-blink" aria-hidden>
              INSERT COIN ▶
            </p>
            <Button
              variant="primary"
              coin
              block
              data-testid="btn-online"
              onClick={() => openModal('online')}
            >
              온라인 게임하기
            </Button>
            <Button
              variant="secondary"
              block
              data-testid="btn-offline"
              onClick={() => navigate('/select')}
            >
              오프라인 게임하기
            </Button>
          </div>
        </section>

        {/* 우측 HI-SCORE 패널 */}
        <section className="s2-lb-zone">
          <Card
            marquee={
              <span className="font-display">
                {groupName ? `${groupName} ` : ''}
                <span className="font-arcade s2-hiscore-word">HI-SCORE</span>
              </span>
            }
            marqueeColor="var(--accent)"
            brackets
            bracketColor="var(--p1)"
            className="s2-lb-card"
          >
            {/* 패널 클릭 → 분반 전체 랭킹 모달 */}
            <button
              type="button"
              className="s2-lb-click"
              data-testid="btn-open-ranking"
              onClick={() => openModal('ranking')}
              title="분반 전체 랭킹 보기"
            >
              <LeaderboardTable top3={top3} myRank={myRank} />
              <span className="s2-lb-more font-arcade c-muted">▶ 전체 랭킹 보기</span>
            </button>
          </Card>
        </section>
      </div>

      {/* 우하단: 테마 변경하기 (상점 mock) */}
      <button
        type="button"
        className="s2-theme-btn font-display"
        data-testid="btn-theme-shop"
        onClick={() => openModal('theme-shop')}
      >
        🎨 테마 변경하기
      </button>
    </main>
  );
}
