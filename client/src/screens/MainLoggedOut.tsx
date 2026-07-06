/**
 * S1 메인 — 비로그인. 담당: auth 에이전트.
 * 컨테이너 testid: scr-main-out / 부품: btn-online, btn-offline, btn-login, btn-settings
 *
 * PLAN §2-S1: attract mode 타이틀 스크린 — 소실점 그리드 + MAD(핑크)/PUMP(시안) 네온 로고
 *   (마지막 P 고장 램프 개그) + btn-online(옐로 primary, INSERT COIN 점멸 캡션)
 *   + btn-offline(시안 secondary) + 우상단 로그인/설정 코인 버튼 + 하단 티커 스트립.
 * 로그인: "로그인" 버튼 → 로스터 로그인 모달(분반 → 멤버 선택, docs/AUTH.md).
 *   성공 시 MainGate가 세션을 보고 S2로 스위치.
 */
import { useNavigate } from 'react-router-dom';
import { Button } from '../components';
import { openModal } from '../state/flow';
import { openLoginModal } from '../modals/Login';
import { useDebugScreen } from '../debug';
import '@/audio'; // 전역 오디오(UI/플로우/코인 SFX + BGM) 자기초기화 — 잠긴 파일 미수정
import './main-logged-out.css';

const TICKER_TEXT = 'Q·W VS U·I — TWO BUTTONS. ONE WINNER. +++ ';

export default function MainLoggedOut() {
  useDebugScreen('scr-main-out');
  const navigate = useNavigate();

  return (
    <main data-testid="scr-main-out" className="s1-root">
      <div className="vanish-grid" aria-hidden />

      {/* 우상단: 테마 변경(전역 프리퍼런스라 비로그인에서도 노출) + 로그인 */}
      <header className="s1-header">
        <Button variant="tertiary" data-testid="btn-theme-shop" onClick={() => openModal('theme-shop')}>
          🎨 테마
        </Button>
        <Button variant="tertiary" data-testid="btn-login" onClick={() => openLoginModal()}>
          로그인
        </Button>
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
