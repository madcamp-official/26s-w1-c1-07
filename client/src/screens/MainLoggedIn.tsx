/**
 * S2 메인 — 로그인 후 (lobby 에이전트 소유).
 * 컨테이너 testid: scr-main-in
 * PLAN §2-S2: 좌 로고 존 + 우 HI-SCORE 패널. "PLAYER 1: OOO" 겸용 네온 인사말(시안) +
 *   로그아웃(tertiary) + 설정 코인 버튼 + LeaderboardTable(lb-top3/lb-myrank 내장) +
 *   btn-online(옐로 primary, INSERT COIN ▶ 점멸 캡션)/btn-offline(시안 secondary).
 * SPEC QA-S2-01~09. 리더보드 = @/shell computeLeaderboard(내 분반 mock 유저 + 나, mockMatches, scoreConfig).
 *   분반에 mock 데이터가 없으면 빈 상태 정직 표기(§0.4) — LeaderboardTable의 NO RECORD.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeLeaderboard, mockGroups, mockMatches, mockUsers, scoreConfig } from '@/shell';
import type { MockUser } from '@/shell';
import { Button, Card, CoinButton, LeaderboardTable } from '../components';
import type { MyRankRow } from '../components';
import { useDebugScreen } from '../debug';
import { logout, useSession } from '../state/session';
import { openModal } from '../state/flow';
import './main-in.css';

/** mock 유저 목록에 없는 "나"를 리더보드 산식에 합류시키기 위한 임시 id */
const ME_ID = '__me__';

export default function MainLoggedIn() {
  useDebugScreen('scr-main-in');
  const session = useSession();
  const navigate = useNavigate();

  const nickname = session.nickname ?? 'PLAYER';
  const groupName = session.groupName;
  const avatarColorIndex = session.user?.avatarColorIndex ?? 0;

  const { top3, myRank } = useMemo(() => {
    const group = mockGroups.find((g) => g.name === groupName?.trim());
    const groupUsers = group ? mockUsers.filter((u) => u.groupId === group.id) : [];
    // 분반에 mock 데이터가 전혀 없으면 빈 상태를 정직하게 (SPEC §0.4 / QA-S2-09)
    if (groupUsers.length === 0) {
      return { top3: [], myRank: undefined as MyRankRow | undefined };
    }
    const me: MockUser = {
      id: ME_ID,
      nickname,
      avatarColorIndex,
      groupId: group!.id,
    };
    // 나를 포함해 같은 산식으로 계산 — 내 기록(0플레이)도 지어내지 않고 그대로 노출
    const lb = computeLeaderboard([...groupUsers, me], mockMatches, scoreConfig);
    const mine = lb.entryOf(ME_ID);
    const myRankRow: MyRankRow | undefined = mine
      ? {
          rank: mine.rank,
          nickname: mine.nickname,
          plays: mine.totalPlays,
          wins: mine.wins,
          winRate: mine.winRate,
        }
      : undefined;
    return { top3: lb.top3, myRank: myRankRow };
  }, [groupName, nickname, avatarColorIndex]);

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
