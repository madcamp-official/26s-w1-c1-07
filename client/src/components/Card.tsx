/**
 * Card — dark surface + purple hairline + top marquee strip (PLAN §1.5).
 * (Owned by the architect — implementation agents must not modify)
 *
 * Marquee strip: a nod to the cabinet's top signboard — neon title on a dark band + 2 small lamps at each end.
 *
 * Usage:
 *   <Card marquee="Class 1 HI-SCORE" marqueeColor="var(--accent)">
 *     ...body...
 *   </Card>
 *   Omitting marquee gives a plain card. Use brackets to add corner brackets (for the hero panel).
 */
import type { HTMLAttributes, ReactNode } from 'react';
import './card.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** top marquee strip title (no strip when omitted) */
  marquee?: ReactNode;
  /** marquee title/lamp color (default --accent2) */
  marqueeColor?: string;
  /** L-shaped brackets on the four corners (hero panel) */
  brackets?: boolean;
  /** bracket color (default --accent2) */
  bracketColor?: string;
  children: ReactNode;
}

export function Card({
  marquee,
  marqueeColor = 'var(--accent2)',
  brackets = false,
  bracketColor = 'var(--accent2)',
  className = '',
  children,
  ...rest
}: CardProps) {
  const cls = ['nc-card', brackets ? 'corner-brackets' : '', className].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      style={brackets ? ({ '--bracket-color': bracketColor } as React.CSSProperties) : undefined}
      {...rest}
    >
      {brackets && <i className="cb2" aria-hidden />}
      {marquee !== undefined && (
        <div className="marquee-strip" style={{ color: marqueeColor }}>
          <span className="lamp lit" style={{ '--lamp-color': marqueeColor } as React.CSSProperties} />
          <span className="marquee-title glow-text">{marquee}</span>
          <span className="lamp lit" style={{ '--lamp-color': marqueeColor } as React.CSSProperties} />
        </div>
      )}
      <div className="nc-card__body">{children}</div>
    </div>
  );
}
