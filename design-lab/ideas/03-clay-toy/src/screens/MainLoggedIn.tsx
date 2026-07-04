/**
 * S2 메인 — 로그인 후 (lobby 에이전트 소유).
 *
 * 컨테이너 testid: scr-main-in
 * testid: btn-online, btn-offline, btn-settings, lb-top3(테이블 내장), lb-myrank
 * - 인사말 "○○님 안녕하세요" + 로그아웃 + 설정 (우상단 헤더)
 * - 좌: MADPUMP 클레이 타이틀 + 온라인/오프라인 CTA
 * - 우: "○분반 리더보드" 트레이 — computeLeaderboard(mock) TOP3.
 *   내 등수: 나는 리더보드에 없는 신규 유저이므로 가짜 순위를 지어내지 않고
 *   "아직 기록 없음" 행으로 정직하게 표시 (SPEC §0.4, ARCHITECTURE §2.3 정본).
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeLeaderboard, mockMatches, mockUsers, scoreConfig } from '@shared';
import { logout, useSession } from '../state/session';
import { openModal } from '../state/flow';
import { Avatar, Button, Card, ClayBlob, LeaderboardTable } from '../components';
import { GearIcon } from '../modals/Settings';
import { useDebugScreen } from '../debug';
import './lobby.css';

/** 타이틀 글자 색 교차 — coral/mint/butter/lavender (PLAN §2-S1·S2) */
const TITLE_COLORS = ['var(--accent)', 'var(--p2)', 'var(--pop)', 'var(--lavender)'];

function ClayTitle({ text }: { text: string }) {
  return (
    <h1 className="lb2-title breath" aria-label={text}>
      {text.split('').map((ch, i) => (
        <span key={i} aria-hidden="true" style={{ color: TITLE_COLORS[i % TITLE_COLORS.length] }}>
          {ch}
        </span>
      ))}
    </h1>
  );
}

export default function MainLoggedIn() {
  useDebugScreen('scr-main-in');
  const navigate = useNavigate();
  const session = useSession();

  const lb = useMemo(() => computeLeaderboard(mockUsers, mockMatches, scoreConfig), []);
  // 내 신원: 온보딩 닉네임은 mock 유저와 중복될 수 없으므로(세션 중복 검증)
  // 리더보드에 내 엔트리는 없음 → my=null (가짜 데이터 금지)
  const nickname = session.nickname ?? '';

  const onLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <main data-testid="scr-main-in" className="screen">
      {/* 모서리 장식 블롭 (z-index 0) */}
      <ClayBlob shape="donut" style={{ top: -70, left: -70 }} />
      <ClayBlob shape="drop" size={170} color="#F3E0F7" style={{ bottom: -60, left: '34%' }} />

      {/* 우상단 헤더: 인사말 + 로그아웃 + 설정 */}
      <header className="lb2-header">
        <span className="lb2-hello">{nickname}님 안녕하세요</span>
        <Button variant="tertiary" size="sm" onClick={onLogout}>
          로그아웃
        </Button>
        <button
          type="button"
          data-testid="btn-settings"
          className="jelly lb2-gear"
          aria-label="설정"
          onClick={() => openModal('settings')}
        >
          <GearIcon size={24} />
        </button>
      </header>

      <div className="lb2-body">
        {/* 좌: 타이틀 + CTA */}
        <section className="lb2-left">
          <ClayTitle text="MADPUMP" />
          <div className="lb2-cta">
            <Button
              variant="primary"
              size="lg"
              data-testid="btn-online"
              onClick={() => openModal('online')}
            >
              온라인 게임하기
            </Button>
            <Button
              variant="primary"
              size="lg"
              data-testid="btn-offline"
              onClick={() => navigate('/select')}
            >
              오프라인 게임하기
            </Button>
          </div>
        </section>

        {/* 우: 분반 리더보드 트레이 */}
        <Card className="lb2-board pop-in">
          <h2 className="lb2-board-title">
            <span className="lb2-trophy" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path
                  fill="#FFF9F4"
                  d="M6 3h12v2h3v3c0 2.4-1.8 4.4-4.1 4.9A6 6 0 0 1 13 16.9V19h3v2H8v-2h3v-2.1a6 6 0 0 1-3.9-3.1C4.8 13.4 3 11.4 3 9V5h3V3Zm-1 4v2c0 1 .6 1.9 1.4 2.4A9 9 0 0 1 6 8.6V7H5Zm14 0h-1v1.6c0 1-.14 1.9-.4 2.8A2.9 2.9 0 0 0 19 9V7Z"
                />
              </svg>
            </span>
            {session.groupName ?? '우리 분반'} 리더보드
          </h2>

          {/* TOP3 (lb-top3는 테이블 내장) — 내 등수 행은 아래 별도(신규 유저) */}
          <LeaderboardTable top3={lb.top3} my={null} />

          {/* 내 등수 — 아직 매치 기록 없음 (빈 상태를 정직하게, SPEC §0.4·QA-S2-05) */}
          <div data-testid="lb-myrank" className="lb2-myrank">
            <span className="lb2-myrank-dash num" aria-label="등수 없음">
              −
            </span>
            <Avatar name={nickname || '?'} colorIndex={session.user?.avatarColorIndex ?? 0} size={32} />
            <span style={{ fontSize: 16 }}>
              {nickname}
              <span className="lb2-me-badge">나</span>
            </span>
            <span className="lb2-myrank-note">아직 기록 없음 — 첫 게임을 해보세요!</span>
          </div>
        </Card>
      </div>
    </main>
  );
}
