/**
 * Avatar — 이니셜 + 팔레트 색 원형 클레이 아바타.
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 사용법:
 *   <Avatar name="펌프광인" colorIndex={0} />            // mock 유저 avatarColorIndex 사용
 *   <Avatar name="철수" colorIndex={2} size={56} />
 *   <Avatar name="PLAYER 1" role="P1" />                 // 인게임: 플레이어 고정색 강제
 *
 * colorIndex 0~7 팔레트는 mock 유저의 avatarColorIndex(0~7)와 1:1.
 * role을 주면 팔레트 대신 P1 딸기핑크 / P2 민트 고정색 (SPEC 색 구분 요구).
 */
import type { CSSProperties } from 'react';
import type { PlayerRole } from '@shared';

export interface AvatarProps {
  /** 이니셜 추출 대상 (첫 글자) */
  name: string;
  /** 0~7 (mockUser.avatarColorIndex). role이 있으면 무시됨 */
  colorIndex?: number;
  /** 인게임 플레이어 고정색 — 'P1'(핑크) | 'P2'(민트) */
  role?: PlayerRole;
  /** 지름 px. 기본 44 */
  size?: number;
  style?: CSSProperties;
}

/** 이니셜 아바타 8색 (파스텔 클레이 톤 — 팔레트에서 파생) */
export const AVATAR_COLORS: readonly { bg: string; fg: string }[] = [
  { bg: '#FF8A5C', fg: '#FFF9F4' }, // coral
  { bg: '#B79CF0', fg: '#FFF9F4' }, // lavender
  { bg: '#FFD447', fg: '#4A3A52' }, // butter
  { bg: '#3FC49E', fg: '#FFF9F4' }, // mint
  { bg: '#FF6E8A', fg: '#FFF9F4' }, // strawberry
  { bg: '#8FD8F2', fg: '#4A3A52' }, // sea
  { bg: '#F5A97F', fg: '#4A3A52' }, // peach
  { bg: '#9C8CAB', fg: '#FFF9F4' }, // plum-muted
];

export default function Avatar({ name, colorIndex = 0, role, size = 44, style }: AvatarProps) {
  const color = role
    ? role === 'P1'
      ? { bg: 'var(--p1)', fg: '#FFF9F4' }
      : { bg: 'var(--p2)', fg: '#FFF9F4' }
    : AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color.bg,
        color: color.fg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-num)',
        fontWeight: 800,
        fontSize: size * 0.45,
        boxShadow: 'var(--shadow-clay-sm)',
        flexShrink: 0,
        ...style,
      }}
    >
      {initial}
    </div>
  );
}
