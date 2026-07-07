/**
 * Change Theme modal — instantly switches the entire web design theme (6 design-lab concepts).
 * root testid: modal-theme-shop / parts: btn-theme-<id>
 *
 * Pressing a button calls setTheme() in state/theme.ts, which swaps <html data-theme> to reskin the
 * whole app and saves it to localStorage (free, instant apply, no reload). Game logic/coordinates are
 * theme-invariant, so two people on different themes get identical judgement/coordinates (crossplay).
 * The modal stays open so you can immediately see the background behind it get reskinned.
 */
import { Button, Modal } from '../components';
import { closeModal, useFlow } from '../state/flow';
import { THEMES, setTheme, useTheme } from '../state/theme';
import './theme-shop.css';

export default function ThemeShopModal() {
  const flow = useFlow();
  const current = useTheme();
  const open = flow.modal === 'theme-shop';

  return (
    <Modal
      open={open}
      onClose={closeModal}
      marquee="Change Theme — THEME SELECT"
      accentColor="var(--accent2)"
      testId="modal-theme-shop"
      width={560}
    >
      <div className="ts-body">
        <h2 className="font-display ts-title">Change Theme</h2>
        <p className="ts-balance font-display c-muted">
          Press a button and the entire web design changes instantly. Games can be played together across any themes.
        </p>
        <div className="ts-grid">
          {THEMES.map((t) => {
            const active = t.id === current;
            return (
              <div key={t.id} className={`ts-card${active ? ' ts-card--active' : ''}`}>
                <div className="ts-swatch" aria-hidden>
                  {t.swatch.map((c, i) => (
                    <span key={i} style={{ background: c }} />
                  ))}
                </div>
                <span className="ts-card-name font-display">{t.name}</span>
                <span className="ts-card-desc font-display c-muted">{t.tagline}</span>
                <Button
                  variant={active ? 'secondary' : 'primary'}
                  block
                  data-testid={`btn-theme-${t.id}`}
                  aria-pressed={active}
                  disabled={active}
                  onClick={() => setTheme(t.id)}
                >
                  {active ? 'In use' : 'Apply'}
                </Button>
              </div>
            );
          })}
        </div>
        <Button variant="tertiary" block onClick={closeModal}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
