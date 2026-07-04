/**
 * PlayerBadge — 플레이어색 네온 칩 (닉네임 + 아바타 + YOU 점멸 태그).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * P1=시안 / P2=핑크 절대 고정 (PLAN §1.1). 채움은 dim 바탕 + 플레이어색 2px 보더.
 * S7 VS 대기실 프로필 칩, 인게임 트랙 배지 등에 사용.
 *
 * 사용법:
 *   <PlayerBadge role="P1" name="펌프광인" you />
 *   <PlayerBadge role="P2" name="???" empty />   // S7 상대 대기 빈 슬롯(점선 점멸)
 */
import type { PlayerRole } from '@shared';
import { Avatar } from './Avatar';
import './playerbadge.css';

export interface PlayerBadgeProps {
  role: PlayerRole;
  name: string;
  /** "YOU" 점멸 태그 */
  you?: boolean;
  /** 아바타 색 인덱스 (생략 시 플레이어색) */
  avatarColorIndex?: number;
  /** 빈 슬롯 상태 (S7 상대 대기 — 점선 보더 + 점멸) */
  empty?: boolean;
  className?: string;
}

export function PlayerBadge({
  role,
  name,
  you = false,
  avatarColorIndex,
  empty = false,
  className = '',
}: PlayerBadgeProps) {
  const cls = [
    'nc-pbadge',
    role === 'P1' ? 'nc-pbadge--p1' : 'nc-pbadge--p2',
    empty ? 'nc-pbadge--empty anim-blink' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      {!empty && (
        <Avatar
          name={name}
          colorIndex={avatarColorIndex ?? (role === 'P1' ? 0 : 1)}
          playerColor={avatarColorIndex === undefined ? `var(--${role === 'P1' ? 'p1' : 'p2'})` : undefined}
          size={28}
        />
      )}
      <span className="nc-pbadge__name font-display glow-text">{name}</span>
      {you && <span className="nc-pbadge__you font-arcade anim-blink">YOU</span>}
    </div>
  );
}
