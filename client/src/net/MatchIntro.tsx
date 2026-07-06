/**
 * MatchIntro — online match start intro overlay (shown while phase === 'slot').
 *
 * Timeline (relative to mount, synced with server INTRO_MS=4.7s):
 *   0s      slot machine 3-reel spin starts (game pictogram strip spins vertically)
 *   1.2s    reel 1 stops → 1.5s reel 2 → 1.8s reel 3 (0.3s interval, spec 1-b)
 *   2.5s    VS screen — both sides' info + bet Coins (+ALL-IN badge) revealed for 2s (spec 1-d)
 *   4.7s    server round:start arrives → phase changes to 'countdown' and this overlay unmounts
 *
 * Reel k (0-based)'s game is used in rounds k+1, k+4, k+7 (spec 1-b).
 */
import { useEffect, useRef, useState } from 'react'
import type { GameId, PlayerColor } from '@madpump/shared'
import { GamePictogram } from '../components'
import './match-intro.css'

/** Reel stop times (ms) — 0.3s interval */
const REEL_STOP_MS = [1200, 1500, 1800] as const
/** VS screen transition time (ms) */
const VS_AT_MS = 2500

/** Decorative game list scrolling through the reel while spinning (cycles through all games) */
const SPIN_STRIP: GameId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export interface MatchIntroProps {
  slotGames: GameId[]
  gameNames: Record<number, string>
  me: { nickname: string; color: PlayerColor; bet: number | null; allIn: boolean }
  opp: { nickname: string; color: PlayerColor; bet: number | null; allIn: boolean }
}

function Reel({ game, stopped, index }: { game: GameId; stopped: boolean; index: number }) {
  return (
    <div className={`mi-reel${stopped ? ' mi-reel--stopped' : ''}`} data-testid={`slot-reel-${index + 1}`}>
      <div className="mi-reel__window">
        {stopped ? (
          <div className="mi-reel__face anim-sign-on" data-game={game}>
            <GamePictogram id={game} />
          </div>
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
      <span className="mi-reel__rounds font-arcade c-muted">
        R{index + 1}·{index + 4}·{index + 7}
      </span>
    </div>
  )
}

export default function MatchIntro({ slotGames, gameNames, me, opp }: MatchIntroProps) {
  /** Number of stopped reels (0~3) → VS screen after 3 */
  const [stoppedCount, setStoppedCount] = useState(0)
  const [showVs, setShowVs] = useState(false)
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      // Reduced motion: skip the spin, go straight to result → VS
      setStoppedCount(3)
      timersRef.current.push(window.setTimeout(() => setShowVs(true), 800))
    } else {
      REEL_STOP_MS.forEach((at, i) =>
        timersRef.current.push(window.setTimeout(() => setStoppedCount(i + 1), at)),
      )
      timersRef.current.push(window.setTimeout(() => setShowVs(true), VS_AT_MS))
    }
    return () => timersRef.current.forEach((t) => window.clearTimeout(t))
  }, [])

  return (
    <div className="mi-overlay" data-testid="match-intro">
      {!showVs ? (
        <div className="mi-slot">
          <p className="font-arcade c-accent glow-text mi-title">GAME SLOT</p>
          <div className="mi-reels">
            {slotGames.slice(0, 3).map((g, i) => (
              <Reel key={i} game={g} stopped={stoppedCount > i} index={i} />
            ))}
          </div>
          <p className="font-display c-muted mi-hint">
            {stoppedCount < 3 ? 'Drawing this match’s games…' : '9 rounds = 3 games × 3 rotations!'}
          </p>
          {stoppedCount >= 3 && (
            <p className="font-display mi-names anim-sign-on">
              {slotGames.slice(0, 3).map((g, i) => (
                <span key={i} className="mi-name-chip">
                  {gameNames[g] ?? `Game ${g}`}
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
