/**
 * S2. 메인 — 로그인 후 (scr-main-in)
 * [OWNER: lobby 에이전트] — 이 파일은 lobby 에이전트만 수정한다.
 *
 * SPEC S2 / PLAN §2-S2:
 *  - "OOO님 안녕하세요" 네임태그 스티커 + 로그아웃(tertiary) + 설정(btn-settings 원형 톱니)
 *  - 좌측 55% 존: MADPUMP 타이틀 + 온라인/오프라인 버튼
 *  - 우측 40%: 분반 리더보드 카드 — computeLeaderboard + <LeaderboardTable>(lb-top3/lb-myrank)
 *    (내 등수는 '나'를 리더보드 산식에 포함해 실제 계산 — 기록 0판이면 0판 0승 0%로 정직 표기)
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeLeaderboard, mockMatches, mockUsers, scoreConfig } from '@shared';
import { Button, Card, LeaderboardTable, Sticker } from '../components';
import { useDebugScreen } from '../debug';
import { logout, useSession } from '../state/session';
import { openModal } from '../state/flow';

const MY_ID = '__me__';

const css = `
.s2-bg-l, .s2-bg-r {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.s2-bg-l {
  background: var(--p1);
  clip-path: polygon(0 0, 15% 0, 5% 100%, 0 100%);
}
.s2-bg-r {
  background: var(--p2);
  clip-path: polygon(91% 0, 100% 0, 100% 100%, 81% 100%);
}
.s2-head {
  position: relative;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 18px;
  padding: 22px 30px 8px;
  flex-wrap: wrap;
}
.s2-gear {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 3px solid var(--ink);
  background: var(--highlight);
  box-shadow: var(--shadow-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink);
  transition:
    transform var(--dur-fast) var(--ease-snap),
    box-shadow var(--dur-fast) var(--ease-snap);
}
.s2-gear:hover {
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 var(--ink);
}
.s2-gear:active {
  transform: translate(4px, 4px);
  box-shadow: none;
}
.s2-main {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 48px;
  padding: 3vh 6vw 60px;
  flex-wrap: wrap;
}
.s2-left {
  flex: 1 1 480px;
  /* min-width:auto(=min-content)가 타이틀 폭 때문에 커져 1280px에서 리더보드가
     아랫줄로 wrap → lb-myrank 폴드 밖 잘림(QA V-1). 480px로 고정해 2열 유지. */
  min-width: 480px;
  max-width: 660px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding-top: 5vh;
}
.s2-title {
  font-family: var(--font-display);
  font-size: clamp(64px, 9vw, 136px);
  line-height: 1;
  display: flex;
  user-select: none;
}
.s2-title__ch {
  text-shadow: 4px 4px 0 var(--highlight);
}
.s2-title__ch--accent {
  color: var(--accent);
  text-shadow: 4px 4px 0 var(--ink);
}
.s2-btns {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: 3vh;
}
.s2-board {
  flex: 0 1 460px;
  min-width: 360px;
  padding-top: 3vh;
}
`;

function GearIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm9.3 5.2-2-.3c-.14.52-.34 1-.6 1.46l1.24 1.62-1.84 1.84-1.62-1.24c-.45.26-.94.46-1.46.6l-.3 2h-2.6l-.3-2a6.6 6.6 0 0 1-1.46-.6l-1.62 1.24-1.84-1.84 1.24-1.62a6.6 6.6 0 0 1-.6-1.46l-2-.3v-2.6l2-.3c.14-.52.34-1 .6-1.46L6.9 6.8l1.84-1.84 1.62 1.24c.45-.26.94-.46 1.46-.6l.3-2h2.6l.3 2c.52.14 1 .34 1.46.6l1.62-1.24 1.84 1.84-1.24 1.62c.26.45.46.94.6 1.46l2 .3v2.6Z"
      />
    </svg>
  );
}

export default function MainLoggedIn() {
  useDebugScreen('scr-main-in');
  const navigate = useNavigate();
  const session = useSession();

  const { top3, myEntry } = useMemo(() => {
    // '나'를 산식에 포함해 실제 등수 계산 (기록 없으면 0판 0승 0% — 지어내지 않음)
    const me = {
      id: MY_ID,
      nickname: session.nickname ?? 'PLAYER',
      avatarColorIndex: session.user?.avatarColorIndex ?? 0,
      groupId: 'g1',
    };
    const board = computeLeaderboard([...mockUsers, me], mockMatches, scoreConfig);
    return { top3: board.top3, myEntry: board.entryOf(MY_ID) };
  }, [session.nickname, session.user]);

  return (
    <div className="screen" data-testid="scr-main-in">
      <style>{css}</style>
      <div className="s2-bg-l" aria-hidden />
      <div className="s2-bg-r" aria-hidden />

      <header className="s2-head">
        <Sticker tilt={-3} bg="var(--p1-tint)" fontSize={16}>
          {session.nickname ?? 'PLAYER'}님 안녕하세요
        </Sticker>
        <Button
          variant="tertiary"
          onClick={() => {
            logout();
            navigate('/');
          }}
        >
          로그아웃
        </Button>
        <button
          type="button"
          className="s2-gear"
          data-testid="btn-settings"
          aria-label="설정"
          onClick={() => openModal('settings')}
        >
          <GearIcon />
        </button>
      </header>

      <main className="s2-main">
        <section className="s2-left">
          <h1 className="s2-title" aria-label="MADPUMP">
            {'MADPUMP'.split('').map((ch, i) => (
              <span
                key={i}
                className={`s2-title__ch${i === 1 ? ' s2-title__ch--accent' : ''}`}
              >
                {ch}
              </span>
            ))}
          </h1>
          <Sticker tilt={-3} bg="var(--highlight)" fontSize={15}>
            1v1 PUMPING DUEL
          </Sticker>
          <div className="s2-btns">
            <Button
              variant="primary"
              size="lg"
              data-testid="btn-online"
              onClick={() => openModal('online')}
            >
              온라인 게임하기
            </Button>
            <Button
              variant="secondary"
              size="lg"
              data-testid="btn-offline"
              onClick={() => navigate('/select')}
            >
              오프라인 게임하기
            </Button>
          </div>
        </section>

        <aside className="s2-board">
          <Card title={`${session.groupName ?? '내 분반'} 리더보드`} style={{ background: 'var(--surface)' }}>
            <LeaderboardTable
              top3={top3}
              myNickname={session.nickname ?? 'PLAYER'}
              myEntry={myEntry}
            />
          </Card>
        </aside>
      </main>
    </div>
  );
}
