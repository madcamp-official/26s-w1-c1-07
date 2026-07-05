/**
 * S1 메인 — 비로그인. 담당: auth 에이전트.
 * 컨테이너 testid: scr-main-out / 부품: btn-online, btn-offline, btn-google-login, btn-settings
 *
 * PLAN §2-S1: attract mode 타이틀 스크린 — 소실점 그리드 + MAD(핑크)/PUMP(시안) 네온 로고
 *   (마지막 P 고장 램프 개그) + btn-online(옐로 primary, INSERT COIN 점멸 캡션)
 *   + btn-offline(시안 secondary) + 우상단 구글 로그인/설정 코인 버튼 + 하단 티커 스트립.
 * 구글 로그인: GIS 공식 버튼(renderGoogleButton) → googleLogin(credential)
 *   → 최초면 /onboarding, 기존 유저면 / (S2)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CoinButton } from '../components';
import { openModal } from '../state/flow';
import { googleLogin } from '../state/session';
import { renderGoogleButton } from '../auth/google';
import { useDebugScreen } from '../debug';
import './main-logged-out.css';

const TICKER_TEXT = 'Q·W VS U·I — TWO BUTTONS. ONE WINNER. +++ ';

export default function MainLoggedOut() {
  useDebugScreen('scr-main-out');
  const navigate = useNavigate();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [loginError, setLoginError] = useState(false);

  useEffect(() => {
    if (!googleBtnRef.current) return;
    return renderGoogleButton(googleBtnRef.current, async (credential) => {
      try {
        setLoginError(false);
        const dest = await googleLogin(credential);
        // 'main'이어도 navigate 불필요 — MainGate가 세션을 보고 S2로 스위치되지만,
        // 명시적으로 라우팅해 플로우를 고정한다 (SPEC QA-S1-07).
        navigate(dest === 'onboarding' ? '/onboarding' : '/');
      } catch {
        setLoginError(true);
      }
    });
  }, [navigate]);

  return (
    <main data-testid="scr-main-out" className="s1-root">
      <div className="vanish-grid" aria-hidden />

      {/* 우상단: 구글 로그인 + 설정 코인 버튼 */}
      <header className="s1-header">
        <div className="s1-google-slot">
          <div ref={googleBtnRef} data-testid="btn-google-login" />
          {loginError && (
            <p className="s1-login-err" role="alert">
              로그인 실패 — 다시 시도해주세요
            </p>
          )}
        </div>
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
