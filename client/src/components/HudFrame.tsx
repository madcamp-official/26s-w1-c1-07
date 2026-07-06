/**
 * HudFrame — 인게임 공통 HUD (PLAN §1.5 "공통 HUD 프레임").
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 아케이드 스코어 라인: 좌 hud-profile-p1(시안) ↔ 중앙 hud-countdown ↔ 우 hud-profile-p2(핑크).
 * 라운드 승수는 원형 램프(점등=플레이어색)로, 중앙을 향해 배열. 내 쪽엔 YOU 점멸 태그.
 * QA testid 내장: hud-profile-p1 / hud-countdown / hud-profile-p2.
 *
 * 사용법 (게임 에이전트 — Game1.tsx 등):
 *   const flow = useFlow();
 *   const players = getPlayerDisplays(flow);
 *   const wins = getRoundWins(flow);
 *   <HudFrame
 *     p1={players.P1} p2={players.P2}
 *     roundWins={wins} roundCount={flow.roundConfig.roundCount}
 *     currentRound={flow.currentRound}
 *     timeRemainingMs={state.derived.timeRemainingMs}   // 게임별 view/derived에서
 *   />
 *   타이머 ≤5초는 자동으로 임박 점멸(anim-urgent) 처리.
 */
import type { PlayerRole } from '@/shell';
import type { PlayerDisplay } from '../state/flow';
import { useOnline } from '../net/online';
import { Avatar } from './Avatar';
import './hudframe.css';

export interface HudFrameProps {
  p1: PlayerDisplay;
  p2: PlayerDisplay;
  /** 플레이어별 현재 라운드 승수 (flow getRoundWins) */
  roundWins: Record<PlayerRole, number>;
  /** 총 라운드 수 (램프 개수) */
  roundCount: number;
  /** 현재 라운드 (1-based, "ROUND 2/3" 캡션) */
  currentRound: number;
  /** 남은 시간 (ms) — 게임 state의 derived/view에서 */
  timeRemainingMs: number;
  className?: string;
}

function Lamps({ count, lit, color, reverse }: { count: number; lit: number; color: string; reverse?: boolean }) {
  const lamps = Array.from({ length: count }, (_, i) => (
    <span
      key={i}
      className={`lamp ${i < lit ? 'lit' : ''}`}
      style={{ '--lamp-color': color } as React.CSSProperties}
    />
  ));
  return <div className={`nc-hud__lamps ${reverse ? 'reverse' : ''}`}>{lamps}</div>;
}

export function HudFrame({
  p1,
  p2,
  roundWins,
  roundCount,
  currentRound,
  timeRemainingMs,
  className = '',
}: HudFrameProps) {
  // 온라인 매치 중엔 라운드 표기를 서버 값(9라운드·현재 라운드)으로 보정 —
  // 게임 화면들은 오프라인용 flow 값을 넘기므로 여기서 한 번에 덮는다(10개 화면 공통).
  const o = useOnline();
  const onlineActive =
    o.matchId !== null &&
    (o.phase === 'slot' || o.phase === 'countdown' || o.phase === 'playing' || o.phase === 'round-result');
  if (onlineActive) {
    roundCount = o.totalRounds;
    currentRound = Math.max(1, o.round);
  }
  const secs = Math.ceil(timeRemainingMs / 1000);
  const urgent = timeRemainingMs <= 5000;
  return (
    <div className={`nc-hud ${className}`}>
      <div className="nc-hud__profile nc-hud__profile--p1" data-testid="hud-profile-p1">
        <Avatar name={p1.name} playerColor="var(--p1)" size={34} />
        <div className="nc-hud__meta">
          <span className="nc-hud__name font-display c-p1 glow-text">
            {p1.name}
            {p1.isYou && <span className="nc-hud__you font-arcade anim-blink"> ◀YOU·파랑</span>}
          </span>
          <Lamps count={roundCount} lit={roundWins.P1} color="var(--p1)" />
        </div>
      </div>

      <div className="nc-hud__timer" data-testid="hud-countdown">
        <span className="nc-hud__time-caption font-arcade c-muted">TIME</span>
        <span className={`nc-hud__secs font-arcade glow-text ${urgent ? 'anim-urgent' : 'c-accent'}`}>
          {secs}
        </span>
        <span className="nc-hud__round-caption font-arcade c-muted">
          ROUND {currentRound}/{roundCount}
        </span>
      </div>

      <div className="nc-hud__profile nc-hud__profile--p2" data-testid="hud-profile-p2">
        <div className="nc-hud__meta nc-hud__meta--end">
          <span className="nc-hud__name font-display c-p2 glow-text">
            {p2.isYou && <span className="nc-hud__you font-arcade anim-blink">빨강·YOU▶ </span>}
            {p2.name}
          </span>
          <Lamps count={roundCount} lit={roundWins.P2} color="var(--p2)" reverse />
        </div>
        <Avatar name={p2.name} playerColor="var(--p2)" size={34} />
      </div>
    </div>
  );
}
