/**
 * S1. 메인 — 비로그인 (scr-main-out)
 * [소유: auth 에이전트]
 *
 * SPEC S1 + PLAN §2 S1:
 * - MADPUMP 픽셀 타이틀(글자별 팔레트 다색) + PRESS ANY BUTTON TO PUMP 점멸 태그라인
 * - 우상단: 구글 로그인(btn-google-login, 흰 바탕 + G 픽셀 로고) + 설정 키캡(btn-settings)
 * - 중앙 메뉴: 온라인(btn-online, 오렌지 CTA) / 오프라인(btn-offline, 퍼플)
 * - 비로그인 + 온라인 클릭 → S3 LoginRequired 모달
 * - 오프라인 클릭 → /select (로그인 불필요 — QA-S1-06)
 * - 구글 로그인: loginWithGoogleMock() → 'onboarding'이면 /onboarding, 'main'이면 '/'(S2 자동 분기)
 * - S3 로그인 성공(onLoginSuccess): S1은 로그인 순간 언마운트되므로 라우터 state로
 *   "온라인 이어가기" 의도를 전달한다 — '/'에 {openOnline:true} (S2가 읽어 S6 오픈),
 *   최초 로그인이면 /onboarding에 {intent:'online'} (S5가 완료 시 openOnline으로 승계).
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebugScreen } from '../debug';
import { Button } from '../components';
import { getSession, loginWithGoogleMock } from '../state/session';
import LoginRequired from '../modals/LoginRequired';
import Settings from '../modals/Settings';
import './MainLoggedOut.css';

/* ------------------------------------------------------------------------ */
/* 픽셀 스프라이트 (인라인 SVG rect, PICO-8 팔레트 밖 색 금지 — PLAN §1.3)      */
/* ------------------------------------------------------------------------ */

const PICO: Record<string, string> = {
  K: '#000000', // black
  W: '#FFF1E8', // white
  R: '#FF004D', // red
  O: '#FFA300', // orange
  Y: '#FFEC27', // yellow
  G: '#00E436', // green
  B: '#29ADFF', // blue
  L: '#83769C', // lavender
  P: '#FF77A8', // pink
  F: '#FFCCAA', // flesh
};

function PixelSprite({
  rows,
  px = 4,
  className,
  style,
}: {
  rows: readonly string[];
  px?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return (
    <svg
      width={w * px}
      height={rows.length * px}
      viewBox={`0 0 ${w} ${rows.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => {
          const fill = PICO[ch];
          if (!fill) return null;
          return <rect key={`${y}-${x}`} x={x} y={y} width={1} height={1} fill={fill} />;
        }),
      )}
    </svg>
  );
}

/** 구글 G 로고 — PICO-8 근사색(레드/옐로/블루/그린) 8x8 도트 */
const GOOGLE_G = [
  '..RRRR..',
  '.RR..RR.',
  'YY......',
  'YY..BBBB',
  'YY....BB',
  'YY....BB',
  '.GG..BB.',
  '..GGGG..',
] as const;

const STAR = [
  '...Y...',
  '..YYY..',
  'YYYYYYY',
  '.YYYYY.',
  '..YYY..',
  '.YY.YY.',
  'YY...YY',
] as const;

const HEART = [
  '.PP.PP.',
  'PPPPPPP',
  'PPPPPPP',
  '.PPPPP.',
  '..PPP..',
  '...P...',
] as const;

const GEAR = [
  '..W..W..',
  '.WWWWWW.',
  'WWW..WWW',
  '.W....W.',
  '.W....W.',
  'WWW..WWW',
  '.WWWWWW.',
  '..W..W..',
] as const;

/** 타이틀 글자별 팔레트 다색 (오렌지/옐로/블루/그린 교차 — PLAN §2 S1) */
const TITLE_COLORS = ['var(--accent)', 'var(--accent-2)', 'var(--p1)', 'var(--ok)'];

/* ------------------------------------------------------------------------ */

export default function MainLoggedOut() {
  useDebugScreen('scr-main-out');
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [showLoginRequired, setShowLoginRequired] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  /** 우상단 구글 로그인 (QA-S1-07) */
  const doGoogleLogin = async () => {
    if (busy) return;
    setBusy(true);
    const dest = await loginWithGoogleMock();
    // 'main'이면 '/'가 세션 보고 S2 자동 렌더, 최초 로그인이면 S5 온보딩
    navigate(dest === 'onboarding' ? '/onboarding' : '/', { replace: true });
  };

  /** S3 모달 내 로그인 성공 — 원래 의도(온라인 S6)로 이어서 진입 (QA-S3-03) */
  const onModalLoginSuccess = () => {
    setShowLoginRequired(false);
    if (getSession().needsOnboarding) {
      // 최초 로그인 → S5 경유. 온라인 의도는 S5가 완료 시 승계한다.
      navigate('/onboarding', { replace: true, state: { intent: 'online' } });
    } else {
      // 기존 유저 → S2 렌더 + S2가 openOnline을 읽어 온라인 패널(S6)을 연다.
      navigate('/', { replace: true, state: { openOnline: true } });
    }
  };

  return (
    <div data-testid="scr-main-out" className="mo-root px-snap-in">
      {/* 우상단: 구글 로그인 + 설정 키캡 */}
      <div className="mo-topbar">
        <Button
          data-testid="btn-google-login"
          size="md"
          pixelFont
          disabled={busy}
          onClick={doGoogleLogin}
          style={{ background: 'var(--text)', color: 'var(--bg-deep)', gap: 10 }}
        >
          <PixelSprite rows={GOOGLE_G} px={2} />
          {busy ? 'SIGNING IN...' : 'SIGN IN WITH GOOGLE'}
        </Button>
        <button
          type="button"
          data-testid="btn-settings"
          className="px-keycap mo-keycap"
          aria-label="설정"
          title="설정"
          onClick={() => setShowSettings(true)}
        >
          <PixelSprite rows={GEAR} px={3} />
        </button>
      </div>

      {/* 부트 타이틀 스크린 */}
      <div className="mo-hero">
        <PixelSprite rows={STAR} px={4} className="mo-float mo-star-l" />
        <PixelSprite rows={STAR} px={3} className="mo-float mo-star-r" />
        <PixelSprite rows={HEART} px={4} className="mo-float mo-heart-l" />
        <h1 className="mo-title px-font" aria-label="MADPUMP">
          {'MADPUMP'.split('').map((ch, i) => (
            <span key={i} style={{ color: TITLE_COLORS[i % TITLE_COLORS.length] }}>
              {ch}
            </span>
          ))}
        </h1>
        <p className="mo-tagline px-font px-blink">PRESS ANY BUTTON TO PUMP</p>
      </div>

      {/* 고전 타이틀 메뉴 */}
      <nav className="mo-menu" aria-label="메인 메뉴">
        <Button
          data-testid="btn-online"
          variant="primary"
          size="lg"
          overline="ONLINE MATCH"
          onClick={() => setShowLoginRequired(true)}
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

      <LoginRequired
        open={showLoginRequired}
        onClose={() => setShowLoginRequired(false)}
        onLoginSuccess={onModalLoginSuccess}
      />
      <Settings open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
