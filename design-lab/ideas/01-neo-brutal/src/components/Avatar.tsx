/**
 * Avatar — 이니셜 + 배경색 원형 아바타 (PLAN §1.3: 원형은 아바타·설정 버튼만 허용).
 * colorIndex는 @shared MockUser.avatarColorIndex(0~7)와 호환.
 *
 * 사용법:
 *   <Avatar name="펌프광인" colorIndex={2} />
 *   <Avatar name={session.nickname ?? '?'} colorIndex={0} size={56} />
 */
import type { CSSProperties } from 'react';

export const AVATAR_COLORS = [
  '#2B5BFF', // 0 블루 (P1)
  '#FF2E88', // 1 핑크 (P2)
  '#FFD600', // 2 옐로
  '#FF5C00', // 3 오렌지
  '#00B85C', // 4 그린
  '#8A6BFF', // 5 퍼플
  '#00C2D1', // 6 시안
  '#0A0A0A', // 7 잉크
] as const;

/** 어두운 배경(파랑/핑크/잉크 등)에는 크림 텍스트 */
const LIGHT_TEXT = new Set([0, 1, 3, 4, 5, 7]);

export interface AvatarProps {
  /** 표시 이름 — 첫 글자가 이니셜로 표시됨 */
  name: string;
  /** 0~7 (범위 밖은 8로 나눈 나머지) */
  colorIndex: number;
  /** 지름 px. 기본 40 */
  size?: number;
  style?: CSSProperties;
}

export function Avatar({ name, colorIndex, size = 40, style }: AvatarProps) {
  const idx = ((colorIndex % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length;
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        border: '3px solid var(--ink)',
        background: AVATAR_COLORS[idx],
        color: LIGHT_TEXT.has(idx) ? 'var(--bg)' : 'var(--ink)',
        fontFamily: 'var(--font-display)',
        fontSize: size * 0.45,
        lineHeight: 1,
        flexShrink: 0,
        ...style,
      }}
    >
      {initial}
    </span>
  );
}
