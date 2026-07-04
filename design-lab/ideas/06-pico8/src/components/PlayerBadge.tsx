/**
 * PlayerBadge — 인게임 프로필 칩 (PLAN §2 인게임 공통 / SPEC 주석 16:1713).
 *
 * 진영색 배지(P1=블루 고정, P2=레드 고정) + 닉네임 + (내 쪽이면) ▶YOU 옐로 태그.
 * hud-profile-p1 / hud-profile-p2 testid는 호출측에서 data-testid로 부여.
 *
 * 사용법 (게임 화면 HUD):
 *   <PlayerBadge role="P1" nickname={flow.playerNames.P1} isYou
 *                data-testid="hud-profile-p1" />
 *   <PlayerBadge role="P2" nickname={flow.playerNames.P2}
 *                data-testid="hud-profile-p2" />
 *
 * [구현 에이전트 주의] 아키텍트 소유 — 수정 금지.
 */
import type { HTMLAttributes } from 'react';
import type { PlayerRole } from '@shared';
import { Avatar } from './Avatar';

export interface PlayerBadgeProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  /** 진영 (aria role 아님) — P1=블루, P2=레드 고정 */
  role: PlayerRole;
  nickname: string;
  /** 내 쪽이면 ▶YOU 옐로 태그 병기 (색상 구분 + 식별 요구 이행) */
  isYou?: boolean;
}

export function PlayerBadge({
  role,
  nickname,
  isYou = false,
  style,
  ...rest
}: PlayerBadgeProps) {
  const teamColor = role === 'P1' ? 'var(--p1)' : 'var(--p2)';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        background: 'var(--bg-deep)',
        border: `2px solid ${teamColor}`,
        boxShadow: 'var(--shadow-hard-sm)',
        ...style,
      }}
      {...rest}
    >
      <Avatar name={nickname} role={role} size={24} />
      <span
        className="px-font"
        style={{ fontSize: 10, color: teamColor, lineHeight: 1 }}
      >
        {role}
      </span>
      <span style={{ fontSize: 14, color: 'var(--text)' }}>{nickname}</span>
      {isYou ? (
        <span
          className="px-font"
          style={{ fontSize: 10, color: 'var(--accent-2)', lineHeight: 1 }}
        >
          ▶YOU
        </span>
      ) : null}
    </div>
  );
}

export default PlayerBadge;
