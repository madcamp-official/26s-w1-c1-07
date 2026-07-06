/**
 * KeyCap — on-screen keycap (radius 6px, player-color border, icon + key char) (PLAN §1.5).
 * (Owned by the architect — implementation agents must not modify)
 *
 * SPEC Q2: the pad must show the actually assigned keys (q/w/u/i).
 * lit=true lights the lamp at the input moment (instant on → off after 80ms is handled by caller state).
 *
 * Usage (game agent):
 *   <KeyCap role="P1" keyChar="Q" icon="▼" lit={qPressed} label="Drop" />
 *   <KeyCap role="P2" keyChar="I" icon="▶" lit={iPressed} />
 *
 * An input-moment lighting hook (useKeyLamp) is also provided:
 *   const [lit, flash] = useKeyLamp();  // lights for 80ms when flash() is called
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerRole } from '@/shell';
import './keycap.css';

export interface KeyCapProps {
  role: PlayerRole;
  /** Key char (Q/W/U/I) — rendered in Press Start 2P */
  keyChar: string;
  /** Arrow/icon above the key (▲▼◀▶ ⚔ etc.) */
  icon?: string;
  /** Light up at the input moment */
  lit?: boolean;
  /** Small label under the icon (optional) */
  label?: string;
  className?: string;
}

export function KeyCap({ role, keyChar, icon, lit = false, label, className = '' }: KeyCapProps) {
  const cls = [
    'nc-keycap',
    role === 'P1' ? 'nc-keycap--p1' : 'nc-keycap--p2',
    lit ? 'lit' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      {icon && (
        <span className="nc-keycap__icon" aria-hidden>
          {icon}
        </span>
      )}
      <span className="nc-keycap__char font-arcade">{keyChar}</span>
      {label && <span className="nc-keycap__label">{label}</span>}
    </div>
  );
}

/**
 * Input-moment lamp lighting hook — lit=true for 80ms when flash() is called (§1.4 key input feedback).
 */
export function useKeyLamp(durationMs = 80): [boolean, () => void] {
  const [lit, setLit] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback(() => {
    setLit(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLit(false), durationMs);
  }, [durationMs]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return [lit, flash];
}
