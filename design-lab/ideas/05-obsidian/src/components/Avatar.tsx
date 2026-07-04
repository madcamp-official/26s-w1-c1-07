/**
 * Avatar — 헥사곤 이니셜 아바타 (PLAN §1.3 헥사곤 티어 엠블럼 계열).
 *
 * props:
 *   name       — 이니셜(첫 글자)을 뽑을 이름
 *   colorIndex — MockUser.avatarColorIndex (0~7 팔레트). 생략 시 이름 해시
 *   size       — px (기본 36)
 *   side       — 'p1' | 'p2' 지정 시 진영색 보더 글로우 (인게임 HUD용)
 *
 * 사용 예:
 *   <Avatar name={user.nickname} colorIndex={user.avatarColorIndex} />
 *   <Avatar name="펌프광인" side="p1" size={44} />
 */
export const AVATAR_COLORS = [
  '#1E3A4C', // 0 딥 틸
  '#3A2B4C', // 1 딥 바이올렛
  '#1F4C3A', // 2 딥 그린
  '#4C3A1E', // 3 딥 앰버
  '#2B3A5C', // 4 딥 블루
  '#4C1F2B', // 5 딥 와인
  '#2F4C1E', // 6 딥 올리브
  '#3A4C5C', // 7 슬레이트
] as const;

export interface AvatarProps {
  name: string;
  colorIndex?: number;
  size?: number;
  side?: 'p1' | 'p2';
}

function hashIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % AVATAR_COLORS.length;
}

export function Avatar({ name, colorIndex, size = 36, side }: AvatarProps) {
  const bg = AVATAR_COLORS[colorIndex ?? hashIndex(name)];
  const sideColor = side === 'p1' ? 'var(--p1)' : side === 'p2' ? 'var(--p2)' : null;
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-label={name}
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {/* 진영색 보더 레이어 (헥사곤 위에 1px 큰 헥사곤) */}
      {sideColor && (
        <span
          className="hex"
          style={{ position: 'absolute', inset: -1.5, background: sideColor }}
        />
      )}
      <span
        className="hex"
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          background: bg,
          color: 'var(--text-hi)',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: Math.round(size * 0.42),
        }}
      >
        {initial}
      </span>
    </span>
  );
}
