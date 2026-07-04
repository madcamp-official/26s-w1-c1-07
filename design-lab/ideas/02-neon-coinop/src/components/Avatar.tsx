/**
 * Avatar — 픽셀 아바타 사각 (이니셜 + 팔레트 색) (PLAN §1.5 HUD "픽셀 아바타 사각").
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 이 시안의 아바타는 원형이 아니라 "각진 사각 + 네온 보더" (§1.3 radius 0 원칙).
 * colorIndex는 @shared MockUser.avatarColorIndex(0~7)와 호환.
 *
 * 사용법:
 *   <Avatar name="펌프광인" colorIndex={3} size={40} />
 *   <Avatar name="펌프광인" colorIndex={3} playerColor="var(--p1)" />  // 인게임: 플레이어색 강제
 */
import './avatar.css';

/** 네온 팔레트 8색 (avatarColorIndex 0~7) */
export const AVATAR_COLORS = [
  '#05d9e8', // 0 시안
  '#ff2a6d', // 1 핫핑크
  '#fdf500', // 2 코인 옐로
  '#d300c5', // 3 네온 퍼플
  '#39ff88', // 4 그린
  '#ff9e00', // 5 앰버
  '#7df9ff', // 6 아이스 시안
  '#ff6ec7', // 7 라이트 핑크
] as const;

export interface AvatarProps {
  /** 닉네임 — 첫 글자가 이니셜 */
  name: string;
  /** 0~7 (@shared avatarColorIndex). 범위 밖은 mod 처리 */
  colorIndex?: number;
  /** px (기본 36) */
  size?: number;
  /** 지정 시 팔레트 대신 이 색 사용 (인게임 P1/P2 고정색) */
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
