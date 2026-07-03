/**
 * S1. 메인 — 비로그인 (scr-main-out)
 * [OWNER: auth 에이전트] — 이 파일은 auth 에이전트만 수정한다.
 *
 * 구현 (SPEC S1 / PLAN §2-S1):
 *  - MADPUMP 타이틀, SIGN IN WITH GOOGLE(btn-google-login), 설정(btn-settings),
 *    온라인(btn-online)/오프라인(btn-offline) 게임하기
 *  - 온라인 클릭: openModal('login-required')  (비로그인이므로 항상 S3)
 *  - 오프라인 클릭: navigate('/select')
 *  - 설정 클릭: openModal('settings')
 *  - 구글 로그인: await mockGoogleLogin() → 'onboarding'이면 navigate('/onboarding'),
 *    'main'이면 navigate('/') (로그인되면 App 게이트가 S2를 렌더)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Sticker } from '../components';
import { openModal } from '../state/flow';
import { mockGoogleLogin } from '../state/session';
import { useDebugScreen } from '../debug';

/** 구글 G 로고 (인라인 SVG — 외부 에셋 없음) */
export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
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

/** 톱니 아이콘 (인라인 SVG) */
export function GearIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path
        d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Zm9.2 5.06c.05-.48.08-.96.08-1.46s-.03-.98-.08-1.46l2.1-1.64a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.48 1a7.7 7.7 0 0 0-2.52-1.46l-.38-2.64A.5.5 0 0 0 14.96 1h-4a.5.5 0 0 0-.5.42l-.38 2.64c-.9.36-1.76.86-2.52 1.46l-2.48-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.1 1.64c-.05.48-.08.96-.08 1.46s.03.98.08 1.46l-2.1 1.64a.5.5 0 0 0-.12.64l2 3.46c.14.24.4.32.6.22l2.48-1c.76.6 1.62 1.1 2.52 1.46l.38 2.64a.5.5 0 0 0 .5.42h4a.5.5 0 0 0 .5-.42l.38-2.64a7.7 7.7 0 0 0 2.52-1.46l2.48 1c.24.1.5 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.1-1.64Z"
        fill="currentColor"
        transform="translate(-1 -1) scale(1.05)"
      />
    </svg>
  );
}

const TITLE = 'MADPUMP';
const TICKER_TEXT = 'Q·W vs U·I — TWO KEYS. ONE WINNER. ★ ';

export default function MainLoggedOut() {
  useDebugScreen('scr-main-out');
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);

  const onGoogleLogin = async () => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      const dest = await mockGoogleLogin();
      navigate(dest === 'onboarding' ? '/onboarding' : '/');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="screen s1-root" data-testid="scr-main-out">
      <style>{S1_CSS}</style>

      {/* 대각선 투톤 배경 (블루/핑크) — 크림 중앙 존을 남기고 좌우를 가른다 */}
      <div className="s1-bg s1-bg--p1" aria-hidden />
      <div className="s1-bg s1-bg--p2" aria-hidden />

      {/* 우상단: 구글 로그인 + 원형 설정 */}
      <header className="s1-topbar">
        <Button
          data-testid="btn-google-login"
          onClick={onGoogleLogin}
          disabled={signingIn}
          aria-label="SIGN IN WITH GOOGLE"
        >
          <GoogleG />
          <span className="s1-google-label">
            {signingIn ? 'SIGNING IN…' : 'SIGN IN WITH GOOGLE'}
          </span>
        </Button>
        <button
          type="button"
          className="s1-gear"
          data-testid="btn-settings"
          aria-label="설정"
          title="설정"
          onClick={() => openModal('settings')}
        >
          <GearIcon />
        </button>
      </header>

      {/* 중앙: 초대형 타이틀 + 스티커 + CTA 스택 */}
      <main className="s1-center">
        <h1 className="s1-title font-display" aria-label={TITLE}>
          {TITLE.split('').map((ch, i) => (
            <span key={i} className={ch === 'A' ? 's1-title__ch s1-title__ch--accent' : 's1-title__ch'}>
              {ch}
            </span>
          ))}
        </h1>
        <div className="s1-sub">
          <Sticker tilt={-3} bg="var(--highlight)" fontSize={16}>
            1v1 PUMPING DUEL
          </Sticker>
        </div>

        <div className="s1-cta">
          <Button variant="primary" size="lg" data-testid="btn-online" onClick={() => openModal('login-required')}>
            온라인 게임하기
          </Button>
          <Button variant="secondary" size="lg" data-testid="btn-offline" onClick={() => navigate('/select')}>
            오프라인 게임하기
          </Button>
        </div>
      </main>

      {/* 하단 티커 (장식) */}
      <div className="s1-ticker" aria-hidden>
        <div className="s1-ticker__track font-mono">
          {TICKER_TEXT.repeat(8)}
        </div>
      </div>
    </div>
  );
}

const S1_CSS = `
.s1-root {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.s1-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.s1-bg--p1 {
  background: var(--p1);
  clip-path: polygon(0 0, 22% 0, 6% 100%, 0 100%);
}
.s1-bg--p2 {
  background: var(--p2);
  clip-path: polygon(78% 0, 100% 0, 100% 100%, 94% 100%);
}
.s1-topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  padding: 20px 28px 0;
}
.s1-google-label {
  font-size: 15px;
  letter-spacing: 0.02em;
}
.s1-gear {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: var(--border-w) solid var(--ink);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink);
  transition:
    transform var(--dur-fast) var(--ease-snap),
    box-shadow var(--dur-fast) var(--ease-snap);
}
.s1-gear:hover {
  transform: translate(-2px, -2px) rotate(15deg);
  box-shadow: 6px 6px 0 var(--ink);
}
.s1-gear:active {
  transform: translate(4px, 4px);
  box-shadow: none;
}
.s1-center {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px 40px;
}
.s1-title {
  font-size: clamp(64px, 13vw, 190px);
  line-height: 1;
  letter-spacing: 0.01em;
  user-select: none;
  white-space: nowrap;
}
.s1-title__ch {
  display: inline-block;
  color: var(--ink);
  text-shadow: 2px 2px 0 var(--bg), 5px 5px 0 var(--ink);
}
.s1-title__ch--accent {
  color: var(--accent);
}
.s1-sub {
  margin-top: -6px;
}
.s1-cta {
  margin-top: 56px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  align-items: center;
}
.s1-ticker {
  position: relative;
  z-index: 2;
  background: var(--ink);
  color: var(--bg);
  overflow: hidden;
  padding: 8px 0;
  border-top: var(--border-w) solid var(--ink);
}
.s1-ticker__track {
  display: inline-block;
  white-space: nowrap;
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  animation: s1-ticker-slide 18s linear infinite;
}
@keyframes s1-ticker-slide {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .s1-ticker__track { animation: none; }
}
`;
