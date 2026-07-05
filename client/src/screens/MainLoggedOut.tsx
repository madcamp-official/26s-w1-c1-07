/**
 * S1 메인 — 비로그인. 담당: auth 에이전트.
 * 컨테이너 testid: scr-main-out / 부품: btn-online, btn-offline, btn-google-login, btn-settings
 *
 * PLAN §2-S1: attract mode 타이틀 스크린 — 소실점 그리드 + MAD(핑크)/PUMP(시안) 네온 로고
 *   (마지막 P 고장 램프 개그) + btn-online(옐로 primary, INSERT COIN 점멸 캡션)
 *   + btn-offline(시안 secondary) + 우상단 구글 로그인/설정 코인 버튼 + 하단 티커 스트립.
 * SPEC QA-S1-01~08:
 *   온라인(비로그인) → openModal('login-required') / 오프라인 → navigate('/select')
 *   구글 로그인 → mockGoogleLogin() → 최초면 /onboarding, 기존 유저면 / (S2)
 *   설정 → openModal('settings')
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CoinButton } from '../components';
import { openModal } from '../state/flow';
import { mockGoogleLogin } from '../state/session';
import { useDebugScreen } from '../debug';
import './main-logged-out.css';

/** 구글 G 로고 (원색 유지 — PLAN §2-S1) */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

const TICKER_TEXT = 'Q·W VS U·I — TWO BUTTONS. ONE WINNER. +++ ';

export default function MainLoggedOut() {
  useDebugScreen('scr-main-out');
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);

  const handleGoogleLogin = async () => {
    if (signingIn) return;
    setSigningIn(true);
    const dest = await mockGoogleLogin();
    // 'main'이어도 navigate 불필요 — MainGate가 세션을 보고 S2로 스위치되지만,
    // 명시적으로 라우팅해 플로우를 고정한다 (SPEC QA-S1-07).
    navigate(dest === 'onboarding' ? '/onboarding' : '/');
  };

  return (
    <main data-testid="scr-main-out" className="s1-root">
      <div className="vanish-grid" aria-hidden />

      {/* 우상단: 구글 로그인 + 설정 코인 버튼 */}
      <header className="s1-header">
        <button
          type="button"
          className="s1-google-btn"
          data-testid="btn-google-login"
          onClick={handleGoogleLogin}
          disabled={signingIn}
        >
          <GoogleLogo />
          <span>{signingIn ? 'CONNECTING…' : 'SIGN IN WITH GOOGLE'}</span>
        </button>
        <CoinButton data-testid="btn-settings" label="설정" onClick={() => openModal('settings')}>
          ⚙
        </CoinButton>
      </header>

      {/* 중앙: attract mode 네온 로고 + CTA */}
      <section className="s1-hero">
        <h1 className="s1-logo font-arcade" aria-label="MADPUMP">
          <span className="s1-logo-mad anim-sign-on">MAD</span>
          <span className="s1-logo-pump anim-sign-on">
            PUM
            <span className="s1-logo-faulty">P</span>
          </span>
        </h1>
        <p className="s1-tagline font-arcade c-accent2 glow-text">1V1 PUMPING DUEL</p>

        <div className="s1-cta">
          <p className="s1-insert font-arcade c-accent glow-text anim-blink" aria-hidden>
            INSERT COIN ▶
          </p>
          <Button
            variant="primary"
            coin
            block
            data-testid="btn-online"
            onClick={() => openModal('login-required')}
          >
            온라인 게임하기
          </Button>
          <Button variant="secondary" block data-testid="btn-offline" onClick={() => navigate('/select')}>
            오프라인 게임하기
          </Button>
        </div>
      </section>

      {/* 하단 티커 스트립 (장식 — 기능 아님) */}
      <div className="s1-ticker" aria-hidden>
        <span className="s1-ticker__rail font-arcade">
          {TICKER_TEXT.repeat(4)}
          {TICKER_TEXT.repeat(4)}
        </span>
      </div>
    </main>
  );
}
