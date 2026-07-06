/**
 * MatchIntro — 온라인 매치 시작 인트로 오버레이 (phase === 'slot' 동안 표시).
 *
 * 타임라인 (마운트 기준, 서버 INTRO_MS=4.7s와 동기):
 *   0s      슬롯머신 3릴 스핀 시작 (게임 픽토그램 스트립이 세로로 회전)
 *   1.2s    릴1 정지 → 1.5s 릴2 → 1.8s 릴3 (0.3초 간격, 명세 1-b)
 *   2.5s    VS 화면 — 양측 정보 + 베팅 코인 (+ALL-IN 뱃지) 2초 공개 (명세 1-d)
 *   4.7s    서버 round:start 도착 → phase가 'countdown'으로 바뀌며 이 오버레이는 언마운트
 *
 * 릴 k(0-based)의 게임은 라운드 k+1, k+4, k+7에 쓰인다 (명세 1-b).
 */
import { useEffect, useRef, useState } from 'react'
import type { GameId, PlayerColor } from '@madpump/shared'
import { GamePictogram } from '../components'
import './match-intro.css'

/** 릴 정지 시각(ms) — 0.3초 간격 */
const REEL_STOP_MS = [1200, 1500, 1800] as const
/** VS 화면 전환 시각(ms) */
const VS_AT_MS = 2500

/** 스핀 중 릴에 흘러가는 장식용 게임 목록 (전 게임 순환) */
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
  /** 정지된 릴 수 (0~3) → 3 이후 VS 화면 */
  const [stoppedCount, setStoppedCount] = useState(0)
  const [showVs, setShowVs] = useState(false)
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      // 모션 최소화: 스핀 생략, 곧바로 결과 → VS
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
            {stoppedCount < 3 ? '이번 매치의 게임을 뽑는 중…' : '9라운드 = 3게임 × 3회전!'}
          </p>
          {stoppedCount >= 3 && (
            <p className="font-display mi-names anim-sign-on">
              {slotGames.slice(0, 3).map((g, i) => (
                <span key={i} className="mi-name-chip">
                  {gameNames[g] ?? `게임 ${g}`}
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
