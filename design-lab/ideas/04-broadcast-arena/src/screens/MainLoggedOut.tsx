/**
 * S1 메인 — 비로그인 (canonical 16:1264). 담당: auth 에이전트.
 *
 * PLAN §2 S1 "프리게임 스튜디오": 상단 방송 헤더 바(스큐 채널 로고 "MP ARENA" /
 * 우측 Google 버튼 + 원형 설정 버튼), 중앙 초대형 이탤릭 워드마크 MADPUMP +
 * "OFFICIAL PUMPING LEAGUE — 26S W1" 서브라벨, 온라인(primary)·오프라인(secondary)
 * 세로 스택, 하단 풀폭 네이비 티커. 배경엔 미세한 피치 라인 패턴.
 *
 * - 온라인(비로그인): openModal('login-required')  (SPEC QA-S1-05)
 * - 오프라인: navigate('/select')                  (QA-S1-06)
 * - 로그인: mockGoogleLogin() → 'onboarding'→/onboarding, 'main'→/  (QA-S1-07)
 * - 설정: openModal('settings')                    (QA-S1-08)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, SkewTab, Ticker } from '../components';
import { openModal } from '../state/flow';
import { mockGoogleLogin } from '../state/session';
import { useDebugScreen } from '../debug';
import './auth.css';

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm8.6 3.5c0-.6-.05-1.17-.15-1.73l2.02-1.58-2-3.46-2.39.96a8.6 8.6 0 0 0-3-1.73L14.7 2h-4l-.38 2.46a8.6 8.6 0 0 0-3 1.73l-2.39-.96-2 3.46 2.02 1.58a8.72 8.72 0 0 0 0 3.46L2.93 15.3l2 3.46 2.39-.96a8.6 8.6 0 0 0 3 1.73L10.7 22h4l.38-2.46a8.6 8.6 0 0 0 3-1.73l2.39.96 2-3.46-2.02-1.58c.1-.56.15-1.13.15-1.73Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MainLoggedOut() {
  useDebugScreen('scr-main-out');
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);

  const handleGoogleLogin = async () => {
    if (signingIn) return;
    setSigningIn(true);
    const dest = await mockGoogleLogin();
    navigate(dest === 'onboarding' ? '/onboarding' : '/');
  };

  return (
    <div data-testid="scr-main-out" className="auth-screen">
      <div className="auth-pitch" aria-hidden="true" />

      {/* 상단 방송 헤더 바 */}
      <header className="auth-header">
        <div className="auth-header-left">
          <SkewTab>MP ARENA</SkewTab>
          <span className="label" style={{ color: 'var(--ink-sub)' }}>
            MATCH DAY · 26S W1
          </span>
        </div>
        <div className="auth-header-right">
          <Button
            testId="btn-google-login"
            variant="google"
            disabled={signingIn}
            onClick={handleGoogleLogin}
          >
            {signingIn ? 'SIGNING IN…' : 'SIGN IN WITH GOOGLE'}
          </Button>
          <button
            data-testid="btn-settings"
            type="button"
            className="auth-gear-btn"
            aria-label="설정"
            onClick={() => openModal('settings')}
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {/* 중앙 히어로 — 프리게임 스튜디오 */}
      <main className="s1-hero">
        <h1 className="wordmark s1-wordmark">MADPUMP</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span aria-hidden="true" style={{ width: 40, height: 1, background: 'var(--line)' }} />
          <span className="label" style={{ color: 'var(--ink-sub)' }}>
            Official Pumping League — 26S W1
          </span>
          <span aria-hidden="true" style={{ width: 40, height: 1, background: 'var(--line)' }} />
        </div>

        <div className="s1-actions">
          <Button
            testId="btn-online"
            variant="primary"
            size="lg"
            onClick={() => openModal('login-required')}
          >
            온라인 게임하기 · Ranked
          </Button>
          <Button
            testId="btn-offline"
            variant="secondary"
            size="lg"
            onClick={() => navigate('/select')}
          >
            오프라인 게임하기 · Exhibition
          </Button>
        </div>
      </main>

      <Ticker />
    </div>
  );
}
