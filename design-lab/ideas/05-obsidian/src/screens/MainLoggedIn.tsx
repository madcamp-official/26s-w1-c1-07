/**
 * S2 메인 — 로그인 후 (scr-main-in). 소유: lobby 에이전트.
 * SPEC S2 + PLAN §2.S2 참조 — "클라이언트 로비" 2컬럼.
 * 필요 testid: btn-online, btn-offline, btn-settings, lb-top3, lb-myrank
 *   (LeaderboardTable 프리미티브가 lb-* 자동 부착)
 * 마운트 시 consumeOnlinePanelRequest() 확인 → true면 Online 패널(S6) 즉시 오픈.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeLeaderboard, mockMatches, scoreConfig } from '@shared';
import { useScreenBridge } from '../debug';
import { groupMembers, logout, selfAsMockUser, useSession } from '../state/session';
import { consumeOnlinePanelRequest } from '../state/flow';
import { Avatar, Button, Card, LeaderboardTable } from '../components';
import Settings from '../modals/Settings';
import Online from '../modals/Online';
import Matching from '../modals/Matching';
import './lobby.css';

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2M5.3 5.3l2.2 2.2M16.5 16.5l2.2 2.2M18.7 5.3l-2.2 2.2M7.5 16.5l-2.2 2.2" />
    </svg>
  );
}

type PanelState = 'none' | 'online' | 'matching';

export default function MainLoggedIn() {
  useScreenBridge('scr-main-in');
  const navigate = useNavigate();
  const session = useSession();
  const user = session.user;

  const [panel, setPanel] = useState<PanelState>('none');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // S3 로그인 성공 직후 신호 → 온라인 패널 즉시 오픈 (QA-S3-03)
  useEffect(() => {
    if (consumeOnlinePanelRequest()) setPanel('online');
  }, []);

  // 분반 리더보드 — 나(0전적 포함) + 내 분반 mock 유저 (SPEC 행24)
  const lb = useMemo(() => {
    const self = selfAsMockUser();
    const pool = self ? [...groupMembers(), self] : groupMembers();
    return computeLeaderboard(pool, mockMatches, scoreConfig);
  }, [user?.id]);

  return (
    <div className="screen" data-testid="scr-main-in">
      <header className="topbar">
        <span className="logotype">
          MADPUMP<em>{'//'}</em>
        </span>
        <div className="lby-userbar">
          <Avatar name={user?.nickname ?? '?'} colorIndex={user?.avatarColorIndex} size={32} />
          <span className="lby-greet">
            <em className="lby-nick">{user?.nickname}</em>님 안녕하세요
          </span>
          <Button variant="ghost" onClick={() => logout()}>
            로그아웃
          </Button>
          <button
            type="button"
            className="hexbtn"
            title="설정"
            aria-label="설정"
            data-testid="btn-settings"
            onClick={() => setSettingsOpen(true)}
          >
            <span className="hexbtn-border hex" />
            <span className="hexbtn-face hex">
              <GearIcon />
            </span>
          </button>
        </div>
      </header>

      <main className="lby-main">
        {/* 좌측: 타이틀 블록 + 게임 진입 */}
        <section className="lby-hero">
          <div className="overline">OBSIDIAN PROTOCOL {'//'} SEASON 01</div>
          <h1 className="display lby-title">MADPUMP</h1>
          <p className="lby-sub">두 개의 키. 하나의 승자.</p>
          <div className="lby-actions">
            <Button
              variant="primary"
              overline="RANKED QUEUE"
              testId="btn-online"
              onClick={() => setPanel('online')}
            >
              온라인 게임하기
            </Button>
            <Button
              variant="secondary"
              overline="LOCAL VERSUS"
              testId="btn-offline"
              onClick={() => navigate('/select')}
            >
              오프라인 게임하기
            </Button>
          </div>
        </section>

        {/* 우측: 분반 리더보드 패널 (QA-S2-03~05) */}
        <aside>
          <Card overline="DIVISION RANKING">
            <h2 className="lby-lb-title">{user ? `${user.groupName} 내 리더보드` : '리더보드'}</h2>
            <LeaderboardTable top3={lb.top3} myEntry={lb.entryOf('me')} />
          </Card>
        </aside>
      </main>

      {/* 모달군 — Settings는 Online 위에도 겹칠 수 있음 (S6 톱니 재사용) */}
      <Online
        open={panel === 'online'}
        onClose={() => setPanel('none')}
        onQuickstart={() => setPanel('matching')}
        onJoinCode={() => setPanel('matching')}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <Matching open={panel === 'matching'} onCancel={() => setPanel('online')} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
