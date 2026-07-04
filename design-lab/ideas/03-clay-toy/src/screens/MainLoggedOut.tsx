/**
 * S1 메인 — 비로그인 (auth 에이전트 소유)
 *
 * 컨테이너 testid: scr-main-out
 * testid: btn-google-login, btn-settings, btn-online, btn-offline
 * SPEC S1 / PLAN §2-S1:
 *  - 중앙 초대형 Jua "MADPUMP" — 글자별 클레이 색 교차 + 아이들 호흡
 *  - 타이틀 아래 세로 스택 Primary 버튼 2개 (온라인/오프라인 게임하기)
 *  - 우상단: Google 로그인 알약 + 원형 톱니 클레이 버튼
 *  - 타이틀 주변 게임 3종 상징 미니 클레이 오브젝트(풍선·캡슐·검) 부유
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebugScreen } from '../debug';
import { mockGoogleLogin, useSession } from '../state/session';
import { openModal } from '../state/flow';
import { Button, ClayBlob } from '../components';
import './MainLoggedOut.css';

const TITLE = 'MADPUMP';

function GearIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.4 13c.04-.33.06-.66.06-1s-.02-.67-.06-1l2.1-1.63a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.47 1a7.3 7.3 0 0 0-1.73-1l-.37-2.63A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.37 2.63c-.62.26-1.2.6-1.73 1l-2.47-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64L4.55 11c-.04.33-.06.66-.06 1s.02.67.06 1l-2.1 1.63a.5.5 0 0 0-.12.64l2 3.46c.13.22.39.31.6.22l2.47-1c.53.4 1.11.74 1.73 1l.37 2.63a.5.5 0 0 0 .5.42h4a.5.5 0 0 0 .5-.42l.37-2.63a7.3 7.3 0 0 0 1.73-1l2.47 1c.21.09.47 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64L19.4 13zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
    </svg>
  );
}

/** 게임1 상징 — 숫자 클레이 풍선 */
function BalloonToy() {
  return (
    <svg className="s1-toy s1-toy--balloon" width="66" height="88" viewBox="0 0 66 88" aria-hidden="true">
      <ellipse cx="33" cy="28" rx="24" ry="26" fill="var(--p1)" />
      <ellipse cx="25" cy="18" rx="7" ry="9" fill="rgba(255,255,255,0.5)" />
      <path d="M33 55 q-7 14 4 30" stroke="var(--ink-muted)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <text
        x="33"
        y="37"
        textAnchor="middle"
        fontFamily="'Baloo 2', sans-serif"
        fontWeight="800"
        fontSize="22"
        fill="#FFF9F4"
      >
        7
      </text>
    </svg>
  );
}

/** 게임2 상징 — 총알 클레이 캡슐 */
function CapsuleToy() {
  return (
    <svg className="s1-toy s1-toy--capsule" width="72" height="72" viewBox="0 0 70 70" aria-hidden="true">
      <g transform="rotate(35 35 35)">
        <rect x="15" y="22" width="40" height="26" rx="13" fill="var(--surface)" />
        <path d="M28 22 A13 13 0 0 0 28 48 Z" fill="var(--lavender)" />
        <ellipse cx="42" cy="29" rx="7" ry="3.5" fill="rgba(255,255,255,0.7)" />
      </g>
    </svg>
  );
}

/** 게임3 상징 — 이쑤시개 검 */
function SwordToy() {
  return (
    <svg className="s1-toy s1-toy--sword" width="72" height="72" viewBox="0 0 70 70" aria-hidden="true">
      <g transform="rotate(40 35 35)">
        <rect x="32" y="6" width="6" height="36" rx="3" fill="var(--p2)" />
        <rect x="23" y="40" width="24" height="7" rx="3.5" fill="var(--pop)" />
        <rect x="32" y="47" width="6" height="14" rx="3" fill="var(--ink)" />
      </g>
    </svg>
  );
}

export default function MainLoggedOut() {
  useDebugScreen('scr-main-out');
  const navigate = useNavigate();
  const session = useSession();
  const [loggingIn, setLoggingIn] = useState(false);

  const handleGoogleLogin = async () => {
    if (loggingIn) return;
    setLoggingIn(true);
    try {
      const dest = await mockGoogleLogin();
      if (dest === 'onboarding') navigate('/onboarding');
      else navigate('/');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleOnline = () => {
    // S1은 비로그인 화면이지만 로그인 직후 잔류 케이스 대비 가드 유지
    if (session.loggedIn) openModal('online');
    else openModal('login-required');
  };

  return (
    <main data-testid="scr-main-out" className="screen">
      {/* 놀이방 배경 블롭 장식 (z-index 0) */}
      <ClayBlob shape="donut" size={260} style={{ top: -90, left: -80 }} />
      <ClayBlob shape="drop" size={200} style={{ bottom: -70, right: -50 }} />

      {/* 우상단 헤더: Google 로그인 + 설정 톱니 */}
      <header className="s1-header">
        <Button
          variant="google"
          size="sm"
          data-testid="btn-google-login"
          onClick={handleGoogleLogin}
          disabled={loggingIn}
          style={loggingIn ? { opacity: 0.6 } : undefined}
        >
          {loggingIn ? '로그인 중…' : 'SIGN IN WITH GOOGLE'}
        </Button>
        <button
          type="button"
          className="s1-gear jelly"
          data-testid="btn-settings"
          aria-label="설정"
          onClick={() => openModal('settings')}
        >
          <GearIcon />
        </button>
      </header>

      <div className="s1-center">
        <div className="s1-title-wrap breath">
          <BalloonToy />
          <CapsuleToy />
          <SwordToy />
          <h1 className="s1-title" aria-label={TITLE}>
            {TITLE.split('').map((ch, i) => (
              <span key={i} aria-hidden="true">
                {ch}
              </span>
            ))}
          </h1>
          <p className="s1-tagline">말랑말랑 찰흙 대결 한 판!</p>
        </div>

        <div className="s1-stack">
          <Button variant="primary" size="lg" data-testid="btn-online" onClick={handleOnline}>
            온라인 게임하기
          </Button>
          <Button variant="primary" size="lg" data-testid="btn-offline" onClick={() => navigate('/select')}>
            오프라인 게임하기
          </Button>
        </div>
      </div>
    </main>
  );
}
