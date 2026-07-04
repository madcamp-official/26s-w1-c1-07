/**
 * Avatar — 이니셜 + 색 원형 아바타.
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 사용법:
 *   <Avatar name="펌프광인" colorIndex={user.avatarColorIndex} size={32} />
 *   <Avatar name="PLAYER 1" team="p1" />   // 팀 컬러 강제 (인게임 네임플레이트)
 */
import type { CSSProperties } from 'react';

/** avatarColorIndex(0~7) → 배경색. 스튜디오 톤 8색 */
export const AVATAR_COLORS: readonly string[] = [
  '#0B63E5', // 블루 (P1 팀 컬러와 동일 계열)
  '#E0323E', // 레드 (P2)
  '#0E1E3C', // 네이비
  '#5B6B82', // 슬레이트
  '#2E7D5B', // 그린
  '#7A4FBF', // 퍼플
  '#C96A12', // 오렌지
  '#0F7C8C', // 틸
];

export interface AvatarProps {
  /** 표시 이름 — 첫 글자(이니셜)를 사용 */
  name: string;
  /** AVATAR_COLORS 인덱스 (0~7). team 지정 시 무시 */
  colorIndex?: number;
  /** 팀 컬러 강제 ('p1' 블루 / 'p2' 레드) */
  team?: 'p1' | 'p2';
  /** 지름 px. 기본 36 */
  size?: number;
  style?: CSSProperties;
}

export default function Avatar({ name, colorIndex = 0, team, size = 36, style }: AvatarProps) {
  const bg = team
    ? team === 'p1'
      ? 'var(--p1)'
      : 'var(--p2)'
    : AVATAR_COLORS[((colorIndex % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length];
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: size * 0.44,
        flexShrink: 0,
        userSelect: 'none',
        ...style,
      }}
    >
      {initial}
    </span>
  );
}
