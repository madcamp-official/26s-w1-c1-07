/**
 * S1 메인 — 비로그인 (scr-main-out). 소유: auth 에이전트.
 * SPEC S1 + PLAN §2.S1 — "타이틀 화면" 프레이밍.
 *
 * 구성: topbar(로고타입 / btn-google-login / 헥사곤 btn-settings)
 *       + 중앙 히어로(OVERLINE → MADPUMP → 한글 서브카피)
 *       + 세로 스택(btn-online Primary / btn-offline Secondary)
 * 플로우:
 *   - 온라인(비로그인) → S3 LoginRequired 모달 (QA-S1-05)
 *   - 오프라인 → /select 즉시 이동, 로그인 불필요 (QA-S1-06)
 *   - Google 로그인 → 최초 'onboarding' → /onboarding, 기존 'main' → 세션 전환으로
 *     MainRoute가 S2를 자동 렌더 (QA-S1-07)
 *   - 설정 → S4 Settings 모달 (QA-S1-08)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components';
import Settings from '../modals/Settings';
import LoginRequired from '../modals/LoginRequired';
import { loginWithGoogle } from '../state/session';
import { useScreenBridge } from '../debug';
import './auth.css';

function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
    </svg>
  );
}

export default function MainLoggedOut() {
  useScreenBridge('scr-main-out');
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  /** topbar Google 로그인 (QA-S1-07) */
  const handleGoogleLogin = async () => {
    if (signingIn) return;
    setSigningIn(true);
    const dest = await loginWithGoogle();
    if (dest === 'onboarding') {
      navigate('/onboarding');
    }
    // dest === 'main': 세션이 loggedIn+user로 전환 → MainRoute가 S2를 렌더 (이동 불필요)
  };

  /** S3 모달 내 로그인 성공 (requestOnlinePanel은 모달 내부에서 처리 — QA-S3-03) */
  const handleGuardLoggedIn = (dest: 'onboarding' | 'main') => {
    setGuardOpen(false);
    if (dest === 'onboarding') {
      navigate('/onboarding');
    }
  };

  return (
    <div className="screen" data-testid="scr-main-out">
      <header className="topbar">
        <span className="logotype">
          MADPUMP<em>//</em>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* S3 모달이 열리면 모달 내부 버튼이 btn-google-login을 가진다 —
              testid 중복(strict 쿼리 실패) 방지를 위해 topbar 쪽은 잠시 내린다 */}
          <Button
            variant="google"
            testId={guardOpen ? undefined : 'btn-google-login'}
            onClick={handleGoogleLogin}
            disabled={signingIn}
            aria-busy={signingIn}
          />
          <button
            type="button"
            className="auth-hexbtn"
            data-testid="btn-settings"
            aria-label="설정"
            title="설정"
            onClick={() => setSettingsOpen(true)}
          >
            <span className="auth-hexbtn-inner">
              <GearIcon />
            </span>
          </button>
        </div>
      </header>

      <main className="auth-hero">
        <div className="overline">OBSIDIAN PROTOCOL // SEASON 01</div>
        <h1 className="auth-title">MADPUMP</h1>
        <p className="auth-subcopy">두 개의 키. 하나의 승자.</p>

        <div className="auth-actions">
          <Button
            variant="primary"
            overline="RANKED QUEUE"
            testId="btn-online"
            onClick={() => setGuardOpen(true)}
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
      </main>

      <LoginRequired
        open={guardOpen}
        onClose={() => setGuardOpen(false)}
        onLoggedIn={handleGuardLoggedIn}
      />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
