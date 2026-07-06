/**
 * Theme shop modal (mock) — placeholder for buying/applying site-wide themes with coins.
 * root testid: modal-theme-shop / parts: btn-theme-<name>
 *
 * Currently a mock: it only displays the two themes "Notepad Theme" and "Hockey Theme" at 10000 coins,
 * and purchase is disabled even with enough coins ("COMING SOON"). Actual theme switching (CSS variable swap) is implemented later.
 */
import { Button, Modal } from '../components';
import { closeModal, useFlow } from '../state/flow';
import { useSession } from '../state/session';
import './theme-shop.css';

const THEMES = [
  { key: 'memo', name: 'Notepad Theme', desc: 'Lined notebook + pencil doodle vibe', price: 10000 },
  { key: 'hockey', name: 'Hockey Theme', desc: 'Ice rink + puck cursor', price: 10000 },
] as const;

export default function ThemeShopModal() {
  const flow = useFlow();
  const session = useSession();
  const open = flow.modal === 'theme-shop';

  return (
    <Modal
      open={open}
      onClose={closeModal}
      marquee="Theme shop — THEME SHOP"
      accentColor="var(--accent2)"
      testId="modal-theme-shop"
      width={520}
    >
      <div className="ts-body">
        <h2 className="font-display ts-title">Change Theme</h2>
        <p className="ts-balance font-arcade">
          Owned <span className="c-accent glow-text">{session.coins}</span> COIN
        </p>
        <div className="ts-grid">
          {THEMES.map((t) => (
            <div key={t.key} className="ts-card">
              <span className="ts-card-name font-display">{t.name}</span>
              <span className="ts-card-desc font-display c-muted">{t.desc}</span>
              <span className="ts-card-price font-arcade c-accent">🪙 {t.price.toLocaleString()}</span>
              {/* mock: purchase disabled even with enough coins */}
              <Button variant="secondary" block data-testid={`btn-theme-${t.name}`} disabled>
                COMING SOON
              </Button>
            </div>
          ))}
        </div>
        <p className="ts-note font-display c-muted">Themes are coming soon — not available for purchase yet.</p>
        <Button variant="tertiary" block onClick={closeModal}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
