/**
 * Avatar — 이니셜 + PICO-8 팔레트 색 아바타 (PLAN §1.5 프로필 칩용).
 *
 * radius 0 사각 스프라이트 스타일. colorIndex(0~7)는 @shared MockUser.avatarColorIndex와
 * 호환 — PICO-8 밝은 8색에 매핑, 텍스트는 검정.
 *
 * 사용법:
 *   <Avatar name="펌프광인" colorIndex={0} />
 *   <Avatar name="철수" colorIndex={3} size={48} />
 *   <Avatar name="봇" role="P2" />   // role 주면 진영색(P1 블루/P2 레드) 강제
 *
 * [구현 에이전트 주의] 아키텍트 소유 — 수정 금지.
 */
import type { HTMLAttributes } from 'react';
import type { PlayerRole } from '@shared';

/** avatarColorIndex(0~7) → PICO-8 밝은 색 */
export const AVATAR_COLORS: readonly string[] = [
  '#FFA300', // 0 오렌지
  '#29ADFF', // 1 블루
  '#00E436', // 2 그린
  '#FFEC27', // 3 옐로
  '#FF77A8', // 4 핑크
  '#83769C', // 5 라벤더
  '#FFCCAA', // 6 플레시
  '#C2C3C7', // 7 라이트그레이
];

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** 닉네임 — 첫 글자를 이니셜로 표시 */
  name: string;
  /** 0~7 (@shared avatarColorIndex 호환). role이 있으면 무시됨 */
  colorIndex?: number;
  /** 진영색 강제: P1=블루, P2=레드 (인게임 프로필 칩용) */
  role?: PlayerRole;
  /** 한 변 px (기본 32) */
  size?: number;
}

export function Avatar({
  name,
  colorIndex = 0,
  role,
  size = 32,
  style,
  ...rest
}: AvatarProps) {
  const bg = role
    ? role === 'P1'
      ? 'var(--p1)'
      : 'var(--p2)'
    : AVATAR_COLORS[((colorIndex % 8) + 8) % 8];
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <div
      aria-label={name}
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
        color: 'var(--bg-deep)',
        border: '2px solid var(--bg-deep)',
        fontFamily: 'var(--font-kr)',
        fontSize: Math.round(size * 0.55),
        lineHeight: 1,
        userSelect: 'none',
        ...style,
      }}
      {...rest}
    >
      {initial}
    </div>
  );
}

export default Avatar;
