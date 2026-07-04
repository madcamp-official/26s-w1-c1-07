/**
 * S2. 메인 — 로그인 후 (scr-main-in) — 로비 (PLAN §2 S2)
 * [소유: lobby 에이전트]
 *
 * - "{닉네임}님 안녕하세요" + 로그아웃 + 설정(btn-settings)
 * - 좌 2/3: MADPUMP 픽셀 타이틀(다색) + 온라인/오프라인 메뉴
 * - 우 1/3: 분반 리더보드 카트리지 패널(그린) — TOP3(lb-top3) 플레이수/승수/승률
 *   + 내 등수(lb-myrank). 데이터는 @shared computeLeaderboard (SPEC 행24)
 *   내 기록이 mock에 없으면 rank "-"로 정직 표기 (SPEC §0.4 — 지어내지 않음)
 * - btn-online → Online 모달(S6, 로그인 상태라 가드 없음 — QA-S2-07)
 * - btn-offline → /select (S8) / 로그아웃 → logout() 후 '/'가 S1 렌더
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeLeaderboard, mockMatches, mockUsers, scoreConfig } from '@shared';
import { Button, Card, LeaderboardTable } from '../components';
import { useDebugScreen } from '../debug';
import { logout, useSession } from '../state/session';
import Online from '../modals/Online';
import Settings from '../modals/Settings';
import './MainLoggedIn.css';

/* MADPUMP 글자별 팔레트 다색 — 오렌지/옐로/블루/그린 교차 (PLAN §2 S1/S2) */
const TITLE_COLORS = [
  'var(--accent)',
  'var(--accent-2)',
  'var(--p1)',
  'var(--ok)',
  'var(--accent)',
  'var(--accent-2)',
  'var(--p1)',
];

/** 8x8 픽셀 톱니 스프라이트 (설정 키캡) */
function GearSprite() {
  return (
    <svg width="16" height="16" viewBox="0 0 8 8" aria-hidden="true">
      <rect x="3" y="0" width="2" height="1" fill="var(--text)" />
      <rect x="3" y="7" width="2" height="1" fill="var(--text)" />
      <rect x="0" y="3" width="1" height="2" fill="var(--text)" />
      <rect x="7" y="3" width="1" height="2" fill="var(--text)" />
      <rect x="1" y="1" width="1" height="1" fill="var(--text)" />
      <rect x="6" y="1" width="1" height="1" fill="var(--text)" />
      <rect x="1" y="6" width="1" height="1" fill="var(--text)" />
      <rect x="6" y="6" width="1" height="1" fill="var(--text)" />
      <rect x="2" y="2" width="4" height="4" fill="var(--text)" />
      <rect x="3" y="3" width="2" height="2" fill="var(--surface-3)" />
    </svg>
  );
}

export default function MainLoggedIn() {
  useDebugScreen('scr-main-in');
  const session = useSession();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onlineOpen, setOnlineOpen] = useState(false);

  // 리더보드 — @shared 정본 산식 (승3/무1/패0, SPEC Q16)
  const lb = useMemo(() => computeLeaderboard(mockUsers, mockMatches, scoreConfig), []);
  const top3 = lb.top3.map((e) => ({
    rank: e.rank,
    nickname: e.nickname,
    plays: e.totalPlays,
    wins: e.wins,
    winRate: e.winRate,
  }));
  // 내 기록: mock 매치에 내 id가 없으므로 rank null("-") — 빈 기록을 지어내지 않는다
  const myEntry = session.user ? lb.entryOf(session.user.id) : null;
  const myRow = {
    rank: myEntry?.rank ?? null,
    nickname: session.nickname ?? 'YOU',
    plays: myEntry?.totalPlays ?? 0,
    wins: myEntry?.wins ?? 0,
    winRate: myEntry?.winRate ?? 0,
  };

  const groupName = session.user?.groupName ?? '?분반';

  return (
    <div data-testid="scr-main-in" className="min-screen px-snap-in">
      {/* 우상단 헤더 */}
      <header className="min-header">
        <span className="min-greet">
          <span className="min-nick">{session.nickname}</span>님 안녕하세요
        </span>
        <button type="button" className="min-logout" onClick={logout}>
          로그아웃
        </button>
        <button
          type="button"
          data-testid="btn-settings"
          className="px-keycap"
          aria-label="설정"
          title="설정"
          onClick={() => setSettingsOpen(true)}
          style={{ width: 40, height: 40 }}
        >
          <GearSprite />
        </button>
      </header>

      <div className="min-body">
        {/* 좌측: 타이틀 + 메뉴 */}
        <section className="min-left">
          <div>
            <h1 className="min-title" aria-label="MADPUMP">
              {'MADPUMP'.split('').map((ch, i) => (
                <span key={i} style={{ color: TITLE_COLORS[i % TITLE_COLORS.length] }}>
                  {ch}
                </span>
              ))}
            </h1>
            <p className="min-tagline px-blink">READY TO PUMP, {(session.nickname ?? 'PLAYER').toUpperCase()}?</p>
          </div>

          <nav className="min-menu" aria-label="게임 메뉴">
            <Button
              data-testid="btn-online"
              variant="primary"
              size="lg"
              overline="ONLINE MATCH"
              onClick={() => setOnlineOpen(true)}
            >
              온라인 게임하기
            </Button>
            <Button
              data-testid="btn-offline"
              variant="surface"
              size="lg"
              overline="OFFLINE MATCH"
              onClick={() => navigate('/select')}
            >
              오프라인 게임하기
            </Button>
          </nav>
        </section>

        {/* 우측: 분반 리더보드 카트리지 (그린) — SPEC 행24 */}
        <aside className="min-right">
          <Card tone="green" title={`RANKING · ${groupName}`}>
            <div style={{ padding: 8 }}>
              <LeaderboardTable top3={top3} myRow={myRow} />
            </div>
          </Card>
        </aside>
      </div>

      {/* 모달 — S4 설정 / S6 온라인(내부에서 S7 매칭까지) */}
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Online open={onlineOpen} onClose={() => setOnlineOpen(false)} />
    </div>
  );
}
