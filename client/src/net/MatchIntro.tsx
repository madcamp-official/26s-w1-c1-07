/**
 * MatchIntro — online match start intro overlay (shown while phase === 'slot').
 *
 * Timeline (relative to mount, synced with server INTRO_MS=5s):
 *   0s      slot machine spins — 9 reels in a row (game pictogram strip spins vertically)
 *   1.0s    reel 1 stops → then one reel every 0.2s → reel 9 stops ≈2.6s
 *   3.0s    VS screen — both sides' info + bet Coins (+ALL-IN badge) revealed for ~2s
 *   5.0s    server round:start arrives → phase changes to 'countdown' and this overlay unmounts
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
/** Spin for this long before the first reel stops (ms) */
const SPIN_MS = 1000
/** Each subsequent reel stops this long after the previous one (ms) */
const REEL_STEP_MS = 200
/** VS screen transition time (ms) — after the last reel settles */
const VS_AT_MS = 3000

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
  /** Number of stopped reels (0~9) → VS screen once all have stopped */
  const [stoppedCount, setStoppedCount] = useState(0)
  const [showVs, setShowVs] = useState(false)
  const timersRef = useRef<number[]>([])
  const total = reels.length

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      // Reduced motion: skip the spin, go straight to result → VS
      setStoppedCount(total)
      timersRef.current.push(window.setTimeout(() => setShowVs(true), 800))
    } else {
      // Spin for SPIN_MS, then stop reels left-to-right at REEL_STEP_MS intervals
      for (let i = 0; i < total; i++) {
        timersRef.current.push(
          window.setTimeout(() => setStoppedCount(i + 1), SPIN_MS + i * REEL_STEP_MS),
        )
      }
      timersRef.current.push(window.setTimeout(() => setShowVs(true), VS_AT_MS))
    }
    return () => timersRef.current.forEach((t) => window.clearTimeout(t))
  }, [total])

  const allStopped = stoppedCount >= total

  return (
    <div className="mi-overlay" data-testid="match-intro">
      {!showVs ? (
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
      ) : (
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
      )}
    </div>
  )
}
