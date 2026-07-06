/**
 * Default end flash for DOM/SVG games — the counterpart to the canvas games' drawEndFlash (endFx.ts).
 * The moment the result is decided (active=false→true), a white flash fades out quickly.
 * Signals the end moment for games without a canvas (Number Guess, Gomoku, etc.).
 *
 * Usage: place <EndFlash active={game?.result != null} /> inside the game stage (position:relative container).
 */
import { useEffect, useRef } from 'react';

export function EndFlash({ active }: { active: boolean }): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    // Web Animations API — self-contained, no CSS file needed. Plays once when active turns true.
    ref.current.animate(
      [
        { opacity: 0.6 },
        { opacity: 0 },
      ],
      { duration: 320, easing: 'ease-out' },
    );
  }, [active]);
  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        background: '#ffffff',
        opacity: 0,
        pointerEvents: 'none',
        zIndex: 50,
      }}
    />
  );
}
