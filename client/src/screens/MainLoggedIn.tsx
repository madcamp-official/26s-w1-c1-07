/**
 * S2 메인 — 로그인 후 (lobby 에이전트 소유).
 * 컨테이너 testid: scr-main-in
 * PLAN §2-S2: 좌 로고 존 + 우 HI-SCORE 패널. "PLAYER 1: OOO" 겸용 네온 인사말(시안) +
 *   로그아웃(tertiary) + 설정 코인 버튼 + LeaderboardTable(lb-top3/lb-myrank 내장) +
 *   btn-online(옐로 primary, INSERT COIN ▶ 점멸 캡션)/btn-offline(시안 secondary).
 * SPEC QA-S2-01~09. 리더보드 = GET /api/leaderboard (내 분반 유저들의 실제 game_match 집계).
 *   분반에 기록이 없으면 빈 상태 정직 표기(§0.4) — LeaderboardTable의 NO RECORD.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameId, LeaderboardEntry, PerGameStats } from '@/shell';
import { Button, Card, CoinButton, LeaderboardTable } from '../components';
import type { MyRankRow } from '../components';
import { useDebugScreen } from '../debug';
import { logout, useSession } from '../state/session';
import { openModal } from '../state/flow';
import { SERVER_URL } from '../net/config';
import './main-in.css';

/** GET /api/leaderboard 응답의 엔트리 (서버에서 정렬·rank 계산 완료) */
interface LbEntryDto {
  userId: string;
  nickname: string;
  imageUrl: string | null;
  wins: number;
  draws: number;
  losses: number;
  score: number;
  rank: number;
}

const GAME_IDS: GameId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** 서버 집계는 매치 단위(게임별 세분화 없음) — 테이블이 안 쓰는 perGame은 0으로 채운다 */
function toEntry(d: LbEntryDto): LeaderboardEntry {
  const plays = d.wins + d.draws + d.losses;
  const perGame = Object.fromEntries(
    GAME_IDS.map((g) => [g, { plays: 0, wins: 0, winRate: 0 }]),
  ) as Record<GameId, PerGameStats>;
  return {
    userId: d.userId,
    nickname: d.nickname,
    score: d.score,
    rank: d.rank,
    totalPlays: plays,
    wins: d.wins,
    draws: d.draws,
    losses: d.losses,
    winRate: plays > 0 ? d.wins / plays : 0,
    perGame,
  };
}

export default function MainLoggedIn() {
  useDebugScreen('scr-main-in');
  const session = useSession();
  const navigate = useNavigate();

  const nickname = session.nickname ?? 'PLAYER';
  const groupName = session.groupName;

  const [top3, setTop3] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<MyRankRow | undefined>(undefined);

  // 마운트마다 서버에서 최신 랭킹 로드 — 매치 후 메인 복귀 시 자동 갱신
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/leaderboard`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive || data.status !== 'OK') return;
        const entries = (data.entries ?? []) as LbEntryDto[];
        setTop3(entries.slice(0, 3).map(toEntry));
        const mine = entries.find((e) => e.userId === data.myUserId);
        setMyRank(
          mine
            ? {
                rank: mine.rank,
                nickname: mine.nickname,
                plays: mine.wins + mine.draws + mine.losses,
                wins: mine.wins,
                winRate: mine.wins + mine.draws + mine.losses > 0 ? mine.wins / (mine.wins + mine.draws + mine.losses) : 0,
              }
            : undefined,
        );
      } catch {
        // 서버 미기동 등 — 빈 상태(NO RECORD) 유지
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main data-testid="scr-main-in" className="s2-root">
      <div className="vanish-grid" aria-hidden />

      {/* 우상단 헤더: 인사말 + 로그아웃 + 설정 */}
      <header className="s2-header">
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
        <CoinButton
          data-testid="btn-settings"
          label="설정"
          color="var(--accent2)"
          onClick={() => openModal('settings')}
        >
          ⚙
        </CoinButton>
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
            <LeaderboardTable top3={top3} myRank={myRank} />
          </Card>
        </section>
      </div>
    </main>
  );
}
