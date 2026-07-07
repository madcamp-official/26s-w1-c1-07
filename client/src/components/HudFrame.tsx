/**
 * HudFrame — shared in-game HUD (PLAN §1.5 "shared HUD frame").
 * (Owned by the architect — implementation agents must not modify)
 *
 * Arcade score line: left hud-profile-p1 (cyan) ↔ center hud-countdown ↔ right hud-profile-p2 (pink).
 * Round wins are shown as round lamps (lit = player color), arrayed toward the center. Your side has a blinking YOU tag.
 * Built-in QA testid: hud-profile-p1 / hud-countdown / hud-profile-p2.
 *
 * Usage (game agents — Game1.tsx etc.):
 *   const flow = useFlow();
 *   const players = getPlayerDisplays(flow);
 *   const wins = getRoundWins(flow);
 *   <HudFrame
 *     p1={players.P1} p2={players.P2}
 *     roundWins={wins} roundCount={flow.roundConfig.roundCount}
 *     currentRound={flow.currentRound}
 *     timeRemainingMs={state.derived.timeRemainingMs}   // from each game's view/derived
 *   />
 *   A timer ≤5s automatically gets the imminent-blink (anim-urgent) treatment.
 */
import type { PlayerRole } from '@/shell';
import type { PlayerDisplay } from '../state/flow';
import { useOnline } from '../net/online';
import { Avatar } from './Avatar';
import './hudframe.css';

export interface HudFrameProps {
  p1: PlayerDisplay;
  p2: PlayerDisplay;
  /** current round wins per player (flow getRoundWins) */
  roundWins: Record<PlayerRole, number>;
  /** total round count (number of lamps) */
  roundCount: number;
  /** current round (1-based, "ROUND 2/3" caption) */
  currentRound: number;
  /** time remaining (ms) — from the game state's derived/view */
  timeRemainingMs: number;
  /** Hide the remaining time (show "?"). For games that conceal the fuse, like HOT POTATO(11) */
  hideTime?: boolean;
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
  hideTime = false,
  className = '',
}: HudFrameProps) {
  // During an online match, correct the round labels with the server values (9 rounds / current round) —
  // the game screens pass offline flow values, so we override them here in one place (shared across all 10 screens).
  const o = useOnline();
  const onlineActive =
    o.matchId !== null &&
    (o.phase === 'slot' || o.phase === 'countdown' || o.phase === 'playing' || o.phase === 'round-result');
  if (onlineActive) {
    roundCount = o.totalRounds;
    currentRound = Math.max(1, o.round);
    // Offline flow round-wins stay 0 online, so drive the lamps from the server's per-color scoreboard.
    // P1 side = blue, P2 side = red (matches getPlayerDisplays + the in-game character colors).
    roundWins = { P1: o.roundWins.blue, P2: o.roundWins.red };
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
            {p1.isYou && <span className="nc-hud__you font-arcade anim-blink"> ◀YOU·BLUE</span>}
          </span>
          <Lamps count={roundCount} lit={roundWins.P1} color="var(--p1)" />
        </div>
      </div>

      <div className="nc-hud__timer" data-testid="hud-countdown">
        <span className="nc-hud__time-caption font-arcade c-muted">TIME</span>
        <span className={`nc-hud__secs font-arcade glow-text ${urgent ? 'anim-urgent' : 'c-accent'}`}>
          {hideTime ? '?' : secs}
        </span>
        <span className="nc-hud__round-caption font-arcade c-muted">
          ROUND {currentRound}/{roundCount}
        </span>
      </div>

      <div className="nc-hud__profile nc-hud__profile--p2" data-testid="hud-profile-p2">
        <div className="nc-hud__meta nc-hud__meta--end">
          <span className="nc-hud__name font-display c-p2 glow-text">
            {p2.isYou && <span className="nc-hud__you font-arcade anim-blink">RED·YOU▶ </span>}
            {p2.name}
          </span>
          <Lamps count={roundCount} lit={roundWins.P2} color="var(--p2)" reverse />
        </div>
        <Avatar name={p2.name} playerColor="var(--p2)" size={34} />
      </div>
    </div>
  );
}
