/**
 * Avatar — pixel avatar square (initial + palette color) (PLAN §1.5 HUD "pixel avatar square").
 * (Owned by the architect — implementation agents must not modify)
 *
 * The avatar in this mockup is not a circle but a "boxy square + neon border" (§1.3 radius 0 principle).
 * colorIndex is compatible with @/shell MockUser.avatarColorIndex (0~7).
 *
 * Usage:
 *   <Avatar name="PumpFiend" colorIndex={3} size={40} />
 *   <Avatar name="PumpFiend" colorIndex={3} playerColor="var(--p1)" />  // in-game: force player color
 */
import './avatar.css';

/** Neon palette, 8 colors (avatarColorIndex 0~7) */
export const AVATAR_COLORS = [
  '#05d9e8', // 0 cyan
  '#ff2a6d', // 1 hot pink
  '#fdf500', // 2 coin yellow
  '#d300c5', // 3 neon purple
  '#39ff88', // 4 green
  '#ff9e00', // 5 amber
  '#7df9ff', // 6 ice cyan
  '#ff6ec7', // 7 light pink
] as const;

export interface AvatarProps {
  /** nickname — the first character is the initial */
  name: string;
  /** 0~7 (@/shell avatarColorIndex). Out-of-range values are mod'd */
  colorIndex?: number;
  /** px (default 36) */
  size?: number;
  /** when set, use this color instead of the palette (in-game fixed P1/P2 color) */
  playerColor?: string;
  className?: string;
}

export function Avatar({ name, colorIndex = 0, size = 36, playerColor, className = '' }: AvatarProps) {
  const color = playerColor ?? AVATAR_COLORS[((colorIndex % 8) + 8) % 8];
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      className={`nc-avatar font-arcade ${className}`}
      style={
        {
          '--avatar-color': color,
          width: size,
          height: size,
          fontSize: Math.max(10, Math.floor(size * 0.42)),
        } as React.CSSProperties
      }
      aria-hidden
    >
      {initial}
    </span>
  );
}
