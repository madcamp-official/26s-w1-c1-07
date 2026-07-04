/**
 * PlayerBadge — 인게임 HUD 프로필 (PLAN §2 인게임 공통 셸).
 * 헥사곤 아바타 + 닉네임 + 라운드 승수 헥사곤 핍 + YOU 칩.
 * P1=시안 / P2=마젠타 진영색 고정 (SPEC 주석 16:1713).
 *
 * props:
 *   side       — 'p1' | 'p2' (진영색·정렬 방향 결정. p2는 미러 정렬)
 *   name       — 닉네임
 *   you        — "나" 표시 (YOU 칩 + 진영색 하이라이트)
 *   wins       — 현재 매치에서의 라운드 승수 (핍 점등 개수)
 *   totalRounds— 총 라운드 수 (핍 개수)
 *   testId     — data-testid (hud-profile-p1 / hud-profile-p2)
 *
 * 사용 예:
 *   <PlayerBadge side="p1" name={me.nickname} you wins={score.p1Wins}
 *                totalRounds={settings.roundCount} testId="hud-profile-p1" />
 */
import { Avatar } from './Avatar';

export interface PlayerBadgeProps {
  side: 'p1' | 'p2';
  name: string;
  you?: boolean;
  wins?: number;
  totalRounds?: number;
  testId?: string;
}

export function PlayerBadge({
  side,
  name,
  you = false,
  wins = 0,
  totalRounds = 0,
  testId,
}: PlayerBadgeProps) {
  const color = side === 'p1' ? 'var(--p1)' : 'var(--p2)';
  const mirror = side === 'p2';
  const pips = Array.from({ length: totalRounds }, (_, i) => i < wins);

  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexDirection: mirror ? 'row-reverse' : 'row',
      }}
    >
      <Avatar name={name} side={side} size={40} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          alignItems: mirror ? 'flex-end' : 'flex-start',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexDirection: mirror ? 'row-reverse' : 'row' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-hi)' }}>{name}</span>
          {you && <span className={`chip chip--${side}`}>YOU</span>}
        </div>
        {totalRounds > 0 && (
          <div style={{ display: 'flex', gap: 4, flexDirection: mirror ? 'row-reverse' : 'row' }}>
            {pips.map((on, i) => (
              <span
                key={i}
                className="hex"
                style={{
                  width: 10,
                  height: 10,
                  background: on ? color : 'var(--line)',
                  boxShadow: on ? `0 0 6px ${color}` : 'none',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
