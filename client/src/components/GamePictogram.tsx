/**
 * GamePictogram — per-game (1~10) screen pictogram (purely decorative).
 * Extracted from inside GameSelect(S8) to share with the online match slot-machine intro.
 * Unique art: Number Guess=1 / fencing=2 / missile=4. Everything else uses the SVG scenes from pictograms.ts (FINAL_PICTOS),
 * with the display number (GAME_ORDER position) as a fallback. Class names keep the existing s8- / gp- families.
 */
import { GAME_ORDER } from '@madpump/shared';
import type { GameId } from '@/shell';
import { FINAL_PICTOS } from '../screens/pictograms';
import './game-pictogram.css';

export function GamePictogram({ id, displayNo }: { id: GameId; displayNo?: number }) {
  if (id === 1) {
    return (
      <div className="s8-picto s8-picto--g1" aria-hidden>
        <span className="s8-g1-arrow s8-g1-arrow--up font-arcade">▲</span>
        <span className="s8-g1-num font-arcade">87</span>
        <span className="s8-g1-arrow s8-g1-arrow--down font-arcade">▼</span>
      </div>
    );
  }
  if (id === 4) {
    return (
      <div className="s8-picto s8-picto--g2" aria-hidden>
        <span className="s8-g2-trail" />
        <span className="s8-g2-trail" />
        <span className="s8-g2-trail" />
      </div>
    );
  }
  if (id === 2) {
    return (
      <div className="s8-picto s8-picto--g3" aria-hidden>
        <span className="s8-g3-blades">
          <span className="s8-g3-blade s8-g3-blade--p1" />
          <span className="s8-g3-blade s8-g3-blade--p2" />
        </span>
        <svg className="s8-g3-wave" viewBox="0 0 120 14" preserveAspectRatio="none">
          <polyline
            points="0,12 15,3 30,12 45,3 60,12 75,3 90,12 105,3 120,12"
            fill="none"
            stroke="var(--p1)"
            strokeWidth="2"
          />
        </svg>
      </div>
    );
  }
  // representative pictogram (pictograms.ts, keyed by the game's internal id)
  const finalPicto = FINAL_PICTOS[id];
  if (finalPicto) {
    return (
      <div className="s8-picto gpic" aria-hidden>
        <svg
          viewBox="0 0 120 108"
          preserveAspectRatio="xMidYMid meet"
          dangerouslySetInnerHTML={{ __html: finalPicto }}
        />
      </div>
    );
  }
  // fallback: display-number pictogram
  const no = displayNo ?? (GAME_ORDER as readonly number[]).indexOf(id) + 1;
  return (
    <div className="s8-picto s8-picto--gN" aria-hidden>
      <span className="s8-gN-num font-arcade glow-text">{no || id}</span>
    </div>
  );
}
