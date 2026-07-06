/**
 * 프리미티브 카탈로그 (아키텍트 소유 — 구현 에이전트 수정 금지, import만).
 * 각 파일 상단 주석에 사용법. ARCHITECTURE.md §4 참조.
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
export { KeyCap, useKeyLamp } from './KeyCap';
export type { KeyCapProps } from './KeyCap';
export { HudFrame } from './HudFrame';
export type { HudFrameProps } from './HudFrame';
