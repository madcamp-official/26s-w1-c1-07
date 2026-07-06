/**
 * PlayerBadge — player-color neon chip (nickname + avatar + blinking YOU tag).
 * (Owned by the architect — implementation agents must not modify)
 *
 * P1=cyan / P2=pink strictly fixed (PLAN §1.1). Fill is a dim background + player-color 2px border.
 * Used for the S7 VS waiting-room profile chip, in-game track badges, etc.
 *
 * Usage:
 *   <PlayerBadge role="P1" name="PumpFiend" you />
 *   <PlayerBadge role="P2" name="???" empty />   // S7 opponent-waiting empty slot (dashed, blinking)
 */
import type { PlayerRole } from '@/shell';
import { Avatar } from './Avatar';
import './playerbadge.css';

export interface PlayerBadgeProps {
  role: PlayerRole;
  name: string;
  /** Blinking "YOU" tag */
  you?: boolean;
  /** Avatar color index (player color if omitted) */
  avatarColorIndex?: number;
  /** Empty-slot state (S7 opponent waiting — dashed border + blink) */
  empty?: boolean;
  className?: string;
}

export function PlayerBadge({
  role,
  name,
  you = false,
  avatarColorIndex,
  empty = false,
  className = '',
}: PlayerBadgeProps) {
  const cls = [
    'nc-pbadge',
    role === 'P1' ? 'nc-pbadge--p1' : 'nc-pbadge--p2',
    empty ? 'nc-pbadge--empty anim-blink' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      {!empty && (
        <Avatar
          name={name}
          colorIndex={avatarColorIndex ?? (role === 'P1' ? 0 : 1)}
          playerColor={avatarColorIndex === undefined ? `var(--${role === 'P1' ? 'p1' : 'p2'})` : undefined}
          size={28}
        />
      )}
      <span className="nc-pbadge__name font-display glow-text">{name}</span>
      {you && <span className="nc-pbadge__you font-arcade anim-blink">YOU</span>}
    </div>
  );
}
