/**
 * PlayerBadge — P1/P2 색상 고정 플레이어 칩 (PLAN §1.1: 좌=블루/우=핑크 절대 고정).
 * 아바타 + 닉네임 + (내 쪽이면) "YOU" 스티커. 매칭 모달·HUD 밖 소형 표기에 사용.
 * 인게임 상단 HUD는 HudFrame이 자체 렌더하므로 이 컴포넌트는 보조용.
 *
 * 사용법:
 *   <PlayerBadge side="P1" name={session.nickname ?? 'YOU'} avatarColorIndex={0} isYou />
 *   <PlayerBadge side="P2" name="???" avatarColorIndex={1} />   // 매칭 대기 빈 슬롯
 */
import { Avatar } from './Avatar';
import { Sticker } from './Sticker';

export interface PlayerBadgeProps {
  side: 'P1' | 'P2';
  name: string;
  avatarColorIndex?: number;
  /** true면 "YOU" 스티커 부착 (SPEC 주석 16:1713 내 쪽 구분) */
  isYou?: boolean;
}

export function PlayerBadge({ side, name, avatarColorIndex, isYou = false }: PlayerBadgeProps) {
  const isP1 = side === 'P1';
  return (
    <span
      className="nb-box--sm"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: isP1 ? 'var(--p1-tint)' : 'var(--p2-tint)',
        position: 'relative',
      }}
    >
      <Avatar name={name} colorIndex={avatarColorIndex ?? (isP1 ? 0 : 1)} size={28} />
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{name}</span>
      {isYou && (
        <Sticker tilt={-6} bg="var(--highlight)" fontSize={11} style={{ padding: '1px 6px' }}>
          YOU
        </Sticker>
      )}
    </span>
  );
}
