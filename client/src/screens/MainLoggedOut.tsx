/**
 * S1 Main — logged out. Owner: auth agent.
 * Container testid: scr-main-out / parts: btn-online, btn-offline, btn-login, btn-settings
 *
 * PLAN §2-S1: attract-mode title screen — vanishing-point grid + MAD (pink)/PUMP (cyan) neon logo
 *   (broken-lamp gag on the last P) + btn-online (yellow primary, blinking INSERT COIN caption)
 *   + btn-offline (cyan secondary) + top-right login/settings coin button + bottom ticker strip.
 * Login: "Login" button → roster login modal (class → member select, docs/AUTH.md).
 *   On success, MainGate sees the session and switches to S2.
 */
import { useNavigate } from 'react-router-dom';
import { Button } from '../components';
import { openModal } from '../state/flow';
import { openLoginModal } from '../modals/Login';
import { useDebugScreen } from '../debug';
import '@/audio'; // global audio (UI/flow/coin SFX + BGM) self-initializes — do not modify locked files
import './main-logged-out.css';

const TICKER_TEXT = 'Q·W VS U·I — TWO BUTTONS. ONE WINNER. +++ ';

export default function MainLoggedOut() {
  useDebugScreen('scr-main-out');
  const navigate = useNavigate();

  return (
    <main data-testid="scr-main-out" className="s1-root">
      <div className="vanish-grid" aria-hidden />

      {/* Top-right: Theme switcher (a global preference, so shown even when logged out) + Login */}
      <header className="s1-header">
        <Button variant="tertiary" data-testid="btn-theme-shop" onClick={() => openModal('theme-shop')}>
          🎨 Theme
        </Button>
        <Button variant="tertiary" data-testid="btn-login" onClick={() => openLoginModal()}>
          Login
        </Button>
      </header>

      {/* Center: attract-mode neon logo + CTA */}
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
            Play Online
          </Button>
          <Button variant="secondary" block data-testid="btn-offline" onClick={() => navigate('/select')}>
            Play Offline
          </Button>
        </div>
      </section>

      {/* Bottom ticker strip (decorative — not functional) */}
      <div className="s1-ticker" aria-hidden>
        <span className="s1-ticker__rail font-arcade">
          {TICKER_TEXT.repeat(4)}
          {TICKER_TEXT.repeat(4)}
        </span>
      </div>
    </main>
  );
}
