/**
 * CountdownPill — 라운드 남은 시간 알약 타이머 + "R1/3" 라운드 칩 (인게임 공통).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 남은 시간 ≤5초면 --accent로 물들며 심장박동 pulse (PLAN §1.4).
 * testid는 게임 화면이 부착: <CountdownPill remainingMs={...} data-testid="hud-countdown" />
 *
 * 사용법 (게임 화면 HUD 중앙):
 *   <CountdownPill remainingMs={state.derived.timeRemainingMs}
 *                  round={flow.currentRound} totalRounds={flow.roundConfig.roundCount}
 *                  data-testid="hud-countdown" />
 */
import type { HTMLAttributes } from 'react';

export interface CountdownPillProps extends HTMLAttributes<HTMLDivElement> {
  remainingMs: number;
  /** 현재 라운드 (1-based). 생략 시 라운드 칩 미표시 */
  round?: number;
  /** 총 라운드 수 */
  totalRounds?: number;
}

export default function CountdownPill({
  remainingMs,
  round,
  totalRounds,
  style,
  ...rest
}: CountdownPillProps) {
  const sec = Math.max(0, Math.ceil(remainingMs / 1000));
  const urgent = remainingMs <= 5000;
  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...style }}
      {...rest}
    >
      <div
        className={`num ${urgent ? 'pulse' : ''}`}
        style={{
          background: urgent ? 'var(--accent)' : 'var(--surface)',
          color: urgent ? '#FFF9F4' : 'var(--ink)',
          borderRadius: 26,
          padding: '8px 24px',
          fontSize: 26,
          fontWeight: 800,
          boxShadow: 'var(--shadow-clay-sm)',
          minWidth: 88,
          textAlign: 'center',
          transition: 'background var(--dur-fast), color var(--dur-fast)',
        }}
      >
        {sec}
      </div>
      {round !== undefined && totalRounds !== undefined && (
        <span
          className="num"
          style={{
            background: 'var(--surface-sunken)',
            boxShadow: 'var(--shadow-sunken)',
            borderRadius: 14,
            padding: '4px 12px',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ink-muted)',
          }}
        >
          R{round}/{totalRounds}
        </span>
      )}
    </div>
  );
}
