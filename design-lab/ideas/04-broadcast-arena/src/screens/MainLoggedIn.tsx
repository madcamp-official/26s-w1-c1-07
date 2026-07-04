/**
 * S2 메인 — 로그인 후 (lobby 에이전트 구현).
 *
 * SPEC S2: 닉네임 인사말 / 로그아웃 / 분반 리더보드(TOP3 스탯 + 내 등수, 행24) /
 * 온라인·오프라인 버튼 / 설정.
 * PLAN §2 S2: 헤더 우측 로워서드 인사말(팀 블루 엣지) + 로그아웃 + 원형 설정,
 * 워드마크 좌측 시프트 + 우측 STANDINGS 패널, 하단 버튼 2개 + 티커.
 *
 * testid: scr-main-in / btn-online / btn-offline / btn-settings
 *         (lb-top3·lb-myrank는 LeaderboardTable 내장)
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeLeaderboard, mockUsers, mockMatches, scoreConfig } from '@shared';
import { Button, Card, LeaderboardTable, Ticker } from '../components';
import { useSession, logout } from '../state/session';
import { openModal } from '../state/flow';
import { useDebugScreen } from '../debug';
import './lobby.css';

function GearIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm8.6 3.5c0-.6-.05-1.16-.15-1.7l2.05-1.6-2-3.46-2.42.98a8.5 8.5 0 0 0-2.94-1.7L14.77 2h-4l-.37 2.52a8.5 8.5 0 0 0-2.94 1.7l-2.42-.98-2 3.46 2.05 1.6a8.6 8.6 0 0 0 0 3.4l-2.05 1.6 2 3.46 2.42-.98a8.5 8.5 0 0 0 2.94 1.7L10.77 22h4l.37-2.52a8.5 8.5 0 0 0 2.94-1.7l2.42.98 2-3.46-2.05-1.6c.1-.54.15-1.1.15-1.7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MainLoggedIn() {
  useDebugScreen('scr-main-in');
  const session = useSession();
  const navigate = useNavigate();

  // 리더보드 — @shared computeLeaderboard + mock 정본 (재구현 금지)
  const lb = useMemo(() => computeLeaderboard(mockUsers, mockMatches, scoreConfig), []);
  // 내 mock 신원: 닉네임이 mock 유저와 일치하면 그 유저, 아니면 시안 관례상 'u1'
  const myEntry =
    (session.nickname ? lb.entries.find((e) => e.nickname === session.nickname) : null) ??
    lb.entryOf('u1');
  const groupName = session.groupName ?? '1분반';

  const onLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div
      data-testid="scr-main-in"
      className="lobby-screen"
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: 'var(--ticker-h)',
      }}
    >
      {/* ── 방송 헤더 바 ─────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '16px 28px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span className="skew" style={{ background: 'var(--strip)', padding: '6px 16px' }}>
          <span className="unskew label" style={{ color: '#fff' }}>
            MP ARENA
          </span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          {/* 로워서드 인사말 — QA-S2-01 */}
          <span className="skew lobby-nameplate">
            <span
              className="unskew"
              style={{
                fontSize: 14,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 260,
              }}
            >
              {session.nickname}님 안녕하세요
            </span>
          </span>
          {/* QA-S2-02/06 */}
          <Button variant="text" onClick={onLogout}>
            로그아웃
          </Button>
          <button
            type="button"
            data-testid="btn-settings"
            className="lobby-settings-btn"
            aria-label="설정"
            onClick={() => openModal('settings')}
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {/* ── 본문: 워드마크(좌) + STANDINGS 패널(우) ───────────── */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 56,
          padding: '32px 48px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 640 }}>
          <h1 className="wordmark" style={{ margin: 0, fontSize: 'clamp(56px, 8vw, 104px)' }}>
            MADPUMP
          </h1>
          <p className="label" style={{ margin: '0 0 26px', color: 'var(--ink-sub)' }}>
            OFFICIAL PUMPING LEAGUE — 26S W1
          </p>
          {/* 온라인/오프라인 — QA-S2-07/08 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
            <Button testId="btn-online" variant="primary" size="lg" onClick={() => openModal('online')}>
              온라인 게임하기 · RANKED
            </Button>
            <Button testId="btn-offline" variant="secondary" size="lg" onClick={() => navigate('/select')}>
              오프라인 게임하기 · EXHIBITION
            </Button>
          </div>
        </div>

        {/* STANDINGS 패널 — QA-S2-03/04/05 (행24) */}
        <Card
          accent="navy"
          tab={`STANDINGS — ${groupName}`}
          style={{ width: 400, maxWidth: '100%', paddingBottom: 12 }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              padding: '0 10px 8px',
            }}
          >
            <span className="label" style={{ color: 'var(--ink-sub)' }}>
              TOP 3 + MY RANK
            </span>
            <span className="label" style={{ color: 'var(--ink-sub)' }}>
              경기 · 승 · 승률
            </span>
          </div>
          <LeaderboardTable top3={lb.top3} my={myEntry} />
        </Card>
      </main>

      <Ticker />
    </div>
  );
}
