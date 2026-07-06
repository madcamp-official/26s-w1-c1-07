/**
 * Primitive catalog (owned by the architect — implementation agents must not modify, import only).
 * Usage is in the comment at the top of each file. See ARCHITECTURE.md §4.
 */
export { Button, CoinButton } from './Button';
export type { ButtonProps, ButtonVariant, CoinButtonProps } from './Button';
export { Card } from './Card';
export type { CardProps } from './Card';
export { Modal } from './Modal';
export type { ModalProps } from './Modal';
export { Avatar, AVATAR_COLORS } from './Avatar';
export type { AvatarProps } from './Avatar';
export { LeaderboardTable, ordinal, rankColor } from './LeaderboardTable';
export type { LeaderboardTableProps, LeaderboardRow, MyRankRow } from './LeaderboardTable';
export { PlayerBadge } from './PlayerBadge';
export type { PlayerBadgeProps } from './PlayerBadge';
export { GamePictogram } from './GamePictogram';
export { KeyCap, useKeyLamp } from './KeyCap';
export type { KeyCapProps } from './KeyCap';
export { HudFrame } from './HudFrame';
export type { HudFrameProps } from './HudFrame';
