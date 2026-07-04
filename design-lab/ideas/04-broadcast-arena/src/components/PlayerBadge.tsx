/**
 * PlayerBadge — 팀 컬러 네임플레이트 (스코어 버그·트랙 배지·매칭 슬롯 공용).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * P1=블루 / P2=레드 (SPEC 주석 16:1713 색상 구분). 내 쪽은 YOU 태그 + 팀 컬러 엣지.
 *
 * 사용법:
 *   <PlayerBadge testId="hud-profile-p1" role="P1" name={players.P1.name}
 *                colorIndex={players.P1.avatarColorIndex} isYou={players.P1.isYou} />
 */
import type { CSSProperties } from 'react';
import type { PlayerRole } from '@shared';
import Avatar from './Avatar';

export interface PlayerBadgeProps {
  /** data-testid — 'hud-profile-p1' | 'hud-profile-p2' 등 */
  testId?: string;
  role: PlayerRole;
  name: string;
  colorIndex?: number;
  /** true면 YOU 태그 + 4px 팀 컬러 엣지 강조 */
  isYou?: boolean;
  /** 'pill'(기본, 스코어 버그용 어두운 판) | 'light'(흰 카드 위) */
  tone?: 'pill' | 'light';
  size?: 'sm' | 'md';
  style?: CSSProperties;
}

export default function PlayerBadge({
  testId,
  role,
  name,
  colorIndex,
  isYou = false,
  tone = 'pill',
  size = 'md',
  style,
}: PlayerBadgeProps) {
  const teamVar = role === 'P1' ? 'var(--p1)' : 'var(--p2)';
  const isPill = tone === 'pill';
  const avatarSize = size === 'md' ? 28 : 22;
  return (
    <span
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: isPill ? 'transparent' : role === 'P1' ? 'var(--p1-tint)' : 'var(--p2-tint)',
        borderRadius: 'var(--radius-pill)',
        padding: size === 'md' ? '4px 12px' : '2px 8px',
        boxShadow: isYou ? `inset 0 0 0 2px ${teamVar}` : undefined,
        color: isPill ? '#fff' : 'var(--ink)',
        ...style,
      }}
    >
      <Avatar name={name} colorIndex={colorIndex} team={role === 'P1' ? 'p1' : 'p2'} size={avatarSize} />
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontStretch: '80%',
          fontSize: size === 'md' ? 14 : 12,
          letterSpacing: '0.03em',
          whiteSpace: 'nowrap',
          maxWidth: 140,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </span>
      {isYou && (
        <span
          className="label"
          style={{
            background: teamVar,
            color: '#fff',
            padding: '1px 7px',
            fontSize: 10,
            borderRadius: 2,
          }}
        >
          YOU
        </span>
      )}
    </span>
  );
}
