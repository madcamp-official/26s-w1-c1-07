/**
 * PlayerBadge — 인게임 HUD 프로필 배지 (SPEC 인게임 공통: 프로필 + 색 구분 + 내 쪽 표시).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * P1=딸기핑크 / P2=민트 고정 (PLAN §1.1). 항상 "P1"/"P2" 라벨 병기.
 * isYou면 말랑 "나!" 태그 (PLAN §3.1 — "this is you" 번역).
 *
 * 사용법 (게임 화면에서):
 *   const displays = getPlayerDisplays(flow);
 *   <PlayerBadge role="P1" name={displays.P1.name} isYou={displays.P1.isYou}
 *                data-testid="hud-profile-p1" />
 *   <PlayerBadge role="P2" name={displays.P2.name} isYou={displays.P2.isYou}
 *                data-testid="hud-profile-p2" align="right" />
 */
import type { HTMLAttributes } from 'react';
import type { PlayerRole } from '@shared';
import Avatar from './Avatar';

export interface PlayerBadgeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  role: PlayerRole;
  name: string;
  /** 내 쪽이면 "나!" 태그 표시 */
  isYou?: boolean;
  /** 우측 정렬 (P2 쪽 HUD) */
  align?: 'left' | 'right';
}

export default function PlayerBadge({
  role,
  name,
  isYou = false,
  align = 'left',
  style,
  ...rest
}: PlayerBadgeProps) {
  const color = role === 'P1' ? 'var(--p1)' : 'var(--p2)';
  const tint = role === 'P1' ? 'var(--p1-tint)' : 'var(--p2-tint)';
  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: align === 'right' ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 10,
        background: tint,
        borderRadius: 22,
        padding: '8px 16px',
        boxShadow: 'var(--shadow-clay-sm)',
        ...style,
      }}
      {...rest}
    >
      <Avatar name={name} role={role} size={36} />
      <div style={{ textAlign: align === 'right' ? 'right' : 'left' }}>
        <div
          className="num"
          style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: 1 }}
        >
          {role}
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.1 }}>{name}</div>
      </div>
      {isYou && (
        <span
          style={{
            position: 'absolute',
            top: -14,
            [align === 'right' ? 'right' : 'left']: 8,
            background: 'var(--pop)',
            color: 'var(--ink)',
            fontSize: 13,
            borderRadius: 12,
            padding: '2px 10px',
            boxShadow: 'var(--shadow-clay-sm)',
            transform: 'rotate(-4deg)',
          }}
        >
          나!
        </span>
      )}
    </div>
  );
}
