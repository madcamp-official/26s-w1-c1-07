/**
 * Button — NEON COIN-OP neon-border button (PLAN §1.5).
 * (Owned by the architect — implementation agents must not modify)
 *
 * Hierarchy:
 *   primary   — yellow (--accent) border/text. "the thing to press right now" (Play Online, quick start, confirm)
 *   secondary — cyan (--p1) border (play offline, default)
 *   tertiary  — no border, muted text → cyan lights up on hover (logout, back to main)
 *   danger    — --error border (cancel)
 *
 * Usage:
 *   <Button variant="primary" data-testid="btn-online" coin onClick={...}>Play Online</Button>
 *   coin      — coin (¢) icon on the left of the label (for primary CTA)
 *   arcadeFont— render the label in Press Start 2P (English labels only, default is Gugi)
 *   block     — width 100%
 *
 * <CoinButton> — round arcade coin button (icon entry point such as the Settings gear, PLAN §1.5).
 *   <CoinButton data-testid="btn-settings" label="Settings">⚙</CoinButton>
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** coin (¢) icon on the left of the label */
  coin?: boolean;
  /** Press Start 2P label (English only) */
  arcadeFont?: boolean;
  /** width:100% */
  block?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  coin = false,
  arcadeFont = false,
  block = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const cls = [
    'nc-btn',
    `nc-btn--${variant}`,
    arcadeFont ? 'font-arcade' : 'font-display',
    block ? 'nc-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {coin && (
        <span className="nc-btn__coin" aria-hidden>
          ¢
        </span>
      )}
      {children}
    </button>
  );
}

export interface CoinButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** accessibility label (aria-label) */
  label: string;
  /** ring color (default --accent2) */
  color?: string;
  children: ReactNode;
}

/** round neon ring button — the ring glow fades on press */
export function CoinButton({ label, color, className = '', children, ...rest }: CoinButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`nc-coinbtn ${className}`}
      style={color ? ({ '--ring-color': color } as React.CSSProperties) : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
