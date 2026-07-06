/**
 * Modal — overlay + neon panel (PLAN §1.5).
 * (Owned by the architect — implementation agents must not modify)
 *
 * - Overlay rgba(13,2,33,.82) (scanlines are already covered by the global .crt-overlay)
 * - Root: --surface + 2px accent-color border + corner brackets + top marquee strip title
 * - sign-on flicker on entry (§1.4)
 * - Background click/ESC → onClose (SPEC convention). Non-closable modals omit onClose.
 *
 * Usage:
 *   <Modal open={flow.modal === 'settings'} onClose={closeModal}
 *          marquee="Settings — OPERATOR MENU" accentColor="var(--accent)"
 *          testId="modal-settings" width={520}>
 *     ...body...
 *   </Modal>
 *
 * testId attaches to the modal "root" element (QA registry: modal-*).
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import './modal.css';

export interface ModalProps {
  open: boolean;
  /** Called on background click/ESC. If omitted, does not close via background/ESC */
  onClose?: () => void;
  /** Top marquee strip title */
  marquee?: ReactNode;
  /** Border/bracket/marquee color (default --accent2) */
  accentColor?: string;
  /** Root data-testid (QA registry modal-*) */
  testId?: string;
  /** Root max-width (px, default 480) */
  width?: number;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  marquee,
  accentColor = 'var(--accent2)',
  testId,
  width = 480,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="nc-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="nc-modal corner-brackets anim-sign-on"
        style={
          {
            '--modal-accent': accentColor,
            '--bracket-color': accentColor,
            maxWidth: width,
          } as React.CSSProperties
        }
        data-testid={testId}
        role="dialog"
        aria-modal="true"
      >
        <i className="cb2" aria-hidden />
        {marquee !== undefined && (
          <div className="marquee-strip" style={{ color: accentColor }}>
            <span
              className="lamp lit"
              style={{ '--lamp-color': accentColor } as React.CSSProperties}
            />
            <span className="marquee-title glow-text">{marquee}</span>
            <span
              className="lamp lit"
              style={{ '--lamp-color': accentColor } as React.CSSProperties}
            />
          </div>
        )}
        <div className="nc-modal__body">{children}</div>
      </div>
    </div>
  );
}
