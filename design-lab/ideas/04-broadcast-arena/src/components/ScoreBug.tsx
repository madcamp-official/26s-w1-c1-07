/**
 * ScoreBug — 인게임 상단 스코어 버그 pill (PLAN §2 인게임 공통 셸).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 좌 P1 네임플레이트(블루, hud-profile-p1) — 중앙 라운드 점수·라운드 표시·
 * 카운트다운(hud-countdown, tnum) — 우 P2 네임플레이트(레드, hud-profile-p2).
 * 카운트다운 마지막 5초는 레드 + 스케일 펄스 (PLAN §1.4).
 *
 * 사용법 (게임 화면 rAF/interval 루프에서):
 *   const flow = useFlow();
 *   const players = getPlayerDisplays(flow);
 *   const wins = getRoundWins(flow);
 *   <ScoreBug
 *     players={players}
 *     roundWins={wins}
 *     currentRound={flow.currentRound}
 *     roundCount={flow.roundConfig.roundCount}
 *     timeRemainingMs={state.derived?.timeRemainingMs ?? state.view.remainingMs}
 *   />
 */
import type { CSSProperties } from 'react';
import type { PlayerRole } from '@shared';
import type { PlayerDisplay } from '../state/flow';
import PlayerBadge from './PlayerBadge';

export interface ScoreBugProps {
  players: Record<PlayerRole, PlayerDisplay>;
  /** 라운드 승수 (getRoundWins(flow)) */
  roundWins: Record<PlayerRole, number>;
  /** 현재 라운드 (1-based) */
  currentRound: number;
  /** 총 라운드 수 */
  roundCount: number;
  /** 라운드 남은 시간 (ms) — 게임 state의 derived/view에서 */
  timeRemainingMs: number;
  style?: CSSProperties;
}

export default function ScoreBug({
  players,
  roundWins,
  currentRound,
  roundCount,
  timeRemainingMs,
  style,
}: ScoreBugProps) {
  const secs = Math.max(0, Math.ceil(timeRemainingMs / 1000));
  const isLastFive = secs <= 5;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 14,
        background: 'var(--strip)',
        borderRadius: 'var(--radius-pill)',
        padding: '6px 10px',
        boxShadow: 'var(--shadow)',
        color: '#fff',
        ...style,
      }}
    >
      <PlayerBadge
        testId="hud-profile-p1"
        role="P1"
        name={players.P1.name}
        colorIndex={players.P1.avatarColorIndex}
        isYou={players.P1.isYou}
      />
      {/* 중앙: 라운드 점수 + 라운드 표시 + 카운트다운 */}
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', minWidth: 96 }}>
        <span className="tnum" style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
          <span style={{ color: '#7db2f7' }}>{roundWins.P1}</span>
          <span style={{ opacity: 0.55, margin: '0 8px', fontSize: 18 }}>:</span>
          <span style={{ color: '#f08a8f' }}>{roundWins.P2}</span>
        </span>
        <span className="label" style={{ color: '#9fb0c8', fontSize: 10, marginTop: 2 }}>
          ROUND {currentRound}/{roundCount}
        </span>
        <span
          data-testid="hud-countdown"
          data-anim="pulse"
          className="tnum"
          style={{
            fontSize: 18,
            fontWeight: 800,
            lineHeight: 1.2,
            color: isLastFive ? 'var(--live)' : '#fff',
            animation: isLastFive ? 'count-pulse 1s ease-in-out infinite' : undefined,
          }}
        >
          {secs}
        </span>
      </span>
      <PlayerBadge
        testId="hud-profile-p2"
        role="P2"
        name={players.P2.name}
        colorIndex={players.P2.avatarColorIndex}
        isYou={players.P2.isYou}
      />
    </div>
  );
}
