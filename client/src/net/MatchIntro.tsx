/**
 * MatchIntro — online match start intro overlay (shown while phase === 'slot').
 *
 * Timeline (relative to mount, synced with server INTRO_MS=7.6s):
 *   0s          VS matchup screen — both sides' nickname·color·bet coins (+ALL-IN badge) revealed
 *   2.0s        slot machine appears and starts spinning (9 reels in a row)
 *   3.0s        reel 1 stops → then one reel every 0.2s → reel 9 stops ≈4.6s (all 9 slots confirmed)
 *   4.6s→7.6s   confirmed 9-slot board held for exactly 3s (players dwell on the locked-in lineup)
 *   7.6s        server round:start → phase 'countdown', overlay unmounts — Round 1 starts 3.0s after the slots lock in
 *
 * One reel per round: reel r (1-based) = round r's game. `null` = a hidden ("?") round
 * (3 of rounds 5~9) — its game is revealed only when that round begins.
 */
import { useEffect, useRef, useState } from 'react'
import type { GameId, PlayerColor } from '@madpump/shared'
import { GamePictogram } from '../components'
import './match-intro.css'

/** Online matches are always 9 rounds — one reel per round. */
const TOTAL_ROUNDS = 9
/** Matchup (VS / ALL-IN reveal) screen shows first for this long, then the slot machine appears. */
const VS_MS = 2000
/** Spin for this long (after VS) before the first reel stops (ms) */
const SPIN_MS = 1000
/** Each subsequent reel stops this long after the previous one (ms) */
const REEL_STEP_MS = 200

/** Decorative game list scrolling through the reel while spinning (cycles through all games) */
const SPIN_STRIP: GameId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

export interface MatchIntroProps {
  /** One entry per round (length 9). null = a hidden "?" reel. */
  slotGames: (GameId | null)[]
  gameNames: Record<number, string>
  me: { nickname: string; color: PlayerColor; bet: number | null; allIn: boolean }
  opp: { nickname: string; color: PlayerColor; bet: number | null; allIn: boolean }
}

function Reel({ game, stopped, index }: { game: GameId | null; stopped: boolean; index: number }) {
  const hidden = game === null
  return (
    <div
      className={`mi-reel${stopped ? ' mi-reel--stopped' : ''}${hidden ? ' mi-reel--hidden' : ''}`}
      data-testid={`slot-reel-${index + 1}`}
    >
      <div className="mi-reel__window">
        {stopped ? (
          hidden ? (
            <div className="mi-reel__face mi-reel__face--hidden anim-sign-on" aria-label="hidden game">
              ?
            </div>
          ) : (
            <div className="mi-reel__face anim-sign-on" data-game={game}>
              <GamePictogram id={game} />
            </div>
          )
        ) : (
          <div className="mi-reel__strip" aria-hidden>
            {[...SPIN_STRIP, ...SPIN_STRIP].map((g, i) => (
              <div key={i} className="mi-reel__face">
                <GamePictogram id={g} />
              </div>
            ))}
          </div>
        )}
      </div>
      <span className="mi-reel__rounds font-arcade c-muted">R{index + 1}</span>
    </div>
  )
}

export default function MatchIntro({ slotGames, gameNames, me, opp }: MatchIntroProps) {
  const reels = slotGames.slice(0, TOTAL_ROUNDS)
  /** false = VS matchup screen (first 2s), true = slot machine (spin → confirmed board held ~3s). */
  const [showSlot, setShowSlot] = useState(false)
  /** Number of stopped reels (0~9). Once all have stopped, the confirmed board is held until round:start. */
  const [stoppedCount, setStoppedCount] = useState(0)
  const timersRef = useRef<number[]>([])
  const total = reels.length

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // After the VS matchup screen, reveal the slot machine
    timersRef.current.push(window.setTimeout(() => setShowSlot(true), VS_MS))
    if (reduce) {
      // Reduced motion: skip the spin — show the confirmed board right when the slot machine appears
      timersRef.current.push(window.setTimeout(() => setStoppedCount(total), VS_MS))
    } else {
      // Spin for SPIN_MS after VS, then stop reels left-to-right at REEL_STEP_MS intervals
      for (let i = 0; i < total; i++) {
        timersRef.current.push(
          window.setTimeout(() => setStoppedCount(i + 1), VS_MS + SPIN_MS + i * REEL_STEP_MS),
        )
      }
    }
    return () => timersRef.current.forEach((t) => window.clearTimeout(t))
  }, [total])

  const allStopped = stoppedCount >= total

  return (
    <div className="mi-overlay" data-testid="match-intro">
      {!showSlot ? (
        <div className="mi-vs anim-sign-on" data-testid="match-vs">
          <div className={`mi-player ${me.color === 'blue' ? 'is-p1' : 'is-p2'}`}>
            <span className="mi-player__you font-arcade">YOU</span>
            <span className="mi-player__name font-display">{me.nickname}</span>
            <span className="mi-player__bet font-arcade">
              🪙 {me.bet ?? '?'}
              {me.allIn && <em className="mi-allin font-arcade">ALL-IN</em>}
            </span>
          </div>
          <span className="mi-vs__word font-arcade glow-text">VS</span>
          <div className={`mi-player ${opp.color === 'blue' ? 'is-p1' : 'is-p2'}`}>
            <span className="mi-player__you font-arcade" aria-hidden>
              &nbsp;
            </span>
            <span className="mi-player__name font-display">{opp.nickname}</span>
            <span className="mi-player__bet font-arcade">
              🪙 {opp.bet ?? '?'}
              {opp.allIn && <em className="mi-allin font-arcade">ALL-IN</em>}
            </span>
          </div>
        </div>
      ) : (
        <div className="mi-slot">
          <p className="font-arcade c-accent glow-text mi-title">GAME SLOT</p>
          <div className="mi-reels">
            {reels.map((g, i) => (
              <Reel key={i} game={g} stopped={stoppedCount > i} index={i} />
            ))}
          </div>
          <p className="font-display c-muted mi-hint">
            {!allStopped
              ? 'Drawing this match’s 9 games…'
              : '9 rounds — one game each · “?” is revealed when you reach that round!'}
          </p>
          {allStopped && (
            <p className="font-display mi-names anim-sign-on">
              {reels.map((g, i) => (
                <span key={i} className={`mi-name-chip${g === null ? ' mi-name-chip--hidden' : ''}`}>
                  {g === null ? '?' : (gameNames[g] ?? `Game ${g}`)}
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
