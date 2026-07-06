/**
 * Online match navigation controller — permanently mounted in App.
 * When the game changes each round, automatically navigates to that game's screen (based on server round:start).
 * Slot machine + VS intro at match start (phase 'slot'), result + rematch overlay at the end.
 *
 * Rematch UX (docs/ONLINE_MATCH.md):
 *  · Loser: if eligible, a REVENGE button (shows stake · ALL-IN) → after requesting, waits for a response (can cancel)
 *  · Winner: offer dialog "Do you accept {name}'s …?" [Accept]/[Decline] + 10s count
 *  · Fallthrough (decline/cancel/timeout/ineligible): revengeClosed received → leave the room and go to main
 *  · Accept: server sends revenge:result → match:start in order → restarts from the slot intro
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  cancelRevenge,
  leaveRoom,
  requestRevenge,
  resetOnline,
  respondRevenge,
  useOnline,
} from './online'
import { closeModal } from '../state/flow'
import { GAME_NAMES } from '../game/gameNames'
import MatchIntro from './MatchIntro'
import './online.css'

export default function OnlineController() {
  const o = useOnline()
  const navigate = useNavigate()
  const loc = useLocation()

  /** For displaying the rematch countdown (cosmetic — the actual timeout is the server's 10s). Initialized to now (#7: prevents the first 250ms being shown wrong) */
  const [nowTick, setNowTick] = useState(() => performance.now())
  /** The time the loser sent the request (for displaying the wait count) */
  const [waitStartedAt, setWaitStartedAt] = useState(0)
  const [requestError, setRequestError] = useState<string | null>(null)
  /** In-flight guard for the REVENGE request (#3: prevents double-clicks) */
  const [requesting, setRequesting] = useState(false)
  /** Waiting for the server to confirm after a cancel request */
  const [cancelling, setCancelling] = useState(false)
  /** I'm leaving to main on my own — so a server event echo doesn't re-trigger teardown (#1·#6) */
  const leavingRef = useRef(false)

  const goMain = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    leaveRoom()
    resetOnline()
    navigate('/')
  }, [navigate])

  // At match start (including the slot intro), clean up modals + navigate to the round's game screen
  useEffect(() => {
    if (o.phase === 'slot') {
      leavingRef.current = false // entering a new match — release the teardown guard (including rematch-accept restart)
      setRequestError(null)
      setRequesting(false)
      setCancelling(false)
      closeModal() // intro starts — close the online/matchmaking modal
    }
    if ((o.phase === 'countdown' || o.phase === 'playing') && o.gameId) {
      closeModal()
      const target = `/online/game/${o.gameId}` // 온라인 매치 전용 URL (오프라인 /game/N 과 구분)
      if (loc.pathname !== target) navigate(target)
    }
  }, [o.gameId, o.phase, loc.pathname, navigate])

  // On every new match end (match-end), reset the stale request state from the previous match (#2)
  useEffect(() => {
    if (o.phase === 'match-end') {
      setRequestError(null)
      setRequesting(false)
      setCancelling(false)
    }
  }, [o.matchId, o.phase])

  // Rematch fallthrough (decline/cancel/timeout/request ineligible) → leave the room and go to main (spec 2c). goMain blocks duplicate execution (#6)
  useEffect(() => {
    if (o.revengeClosed) goMain()
  }, [o.revengeClosed, goMain])

  // Rematch countdown tick (only while waiting/offering)
  useEffect(() => {
    if (o.revengePhase === 'none') return
    const t = window.setInterval(() => setNowTick(performance.now()), 250)
    return () => window.clearInterval(t)
  }, [o.revengePhase])

  // ── Slot machine + VS intro ──
  if (o.phase === 'slot' && o.slotGames && o.opponent) {
    return (
      <MatchIntro
        slotGames={o.slotGames}
        gameNames={GAME_NAMES}
        me={{
          nickname: o.me?.nickname ?? 'YOU',
          color: o.myColor ?? 'blue',
          bet: o.myBet,
          allIn: o.myAllIn,
        }}
        opp={{
          nickname: o.opponent.nickname,
          color: o.oppColor ?? 'red',
          bet: o.oppBet,
          allIn: o.oppAllIn,
        }}
      />
    )
  }

  // Round countdown: prominently announce my 'color' (player-bound, fixed for the match).
  // Color is unrelated to role — attack/defense roles are random each match, so color doesn't reveal role (that's intended).
  if (o.phase === 'countdown' && o.role) {
    // If there's no color info (old versions, etc.), fall back to the role color.
    const iAmBlue = o.myColor ? o.myColor === 'blue' : o.role === 'P1'
    return (
      <div className="onl-youbanner" data-testid="online-you-banner" aria-live="polite">
        <div className={`onl-youbanner__card ${iAmBlue ? 'is-p1' : 'is-p2'}`}>
          <span className="onl-youbanner__label font-arcade">YOU ARE</span>
          <span className="onl-youbanner__color font-arcade glow-text">
            {iAmBlue ? 'BLUE' : 'RED'}
          </span>
          <span className="onl-youbanner__hint font-display">Control with U · I</span>
        </div>
      </div>
    )
  }

  if (o.phase === 'match-end') {
    const win = o.matchResult === `${o.mySlot}_WIN`
    const draw = o.matchResult === 'DRAW'
    const label = draw ? 'DRAW' : win ? 'YOU WIN!' : 'YOU LOSE'
    const cls = draw ? 'draw' : win ? 'win' : 'lose'

    // Remaining seconds on the rematch offer (winner dialog) — clamped to an upper bound (#7: prevents over-display on first render)
    const offerRemain = o.revengeOffer
      ? Math.min(
          Math.ceil(o.revengeOffer.timeoutMs / 1000),
          Math.max(0, Math.ceil((o.revengeOffer.timeoutMs - (nowTick - o.revengeOffer.receivedAt)) / 1000)),
        )
      : 0
    // Remaining seconds waiting for the request (loser) — cosmetic based on the server's 10s timeout, clamped to 10s upper bound
    const waitRemain = Math.min(10, Math.max(0, Math.ceil((10_000 - (nowTick - waitStartedAt)) / 1000)))

    return (
      <div className="onl-overlay" data-testid="online-match-end">
        <div className={`onl-result font-arcade glow-text ${cls}`}>{label}</div>
        <div className="onl-sub font-arcade">MATCH OVER</div>
        {o.coinDelta !== null && (
          <div className="onl-coins font-arcade" data-testid="online-coin-result">
            <span className={o.coinDelta > 0 ? 'win' : o.coinDelta < 0 ? 'lose' : 'draw'}>
              {o.coinDelta > 0 ? `+${o.coinDelta}` : o.coinDelta} COIN
            </span>
            {o.coinBalance !== null && <span className="onl-coins-balance"> · Held {o.coinBalance}</span>}
          </div>
        )}

        {/* ── Winner: rematch offer dialog ── */}
        {o.revengePhase === 'offered' && o.revengeOffer && (
          <div className="onl-revenge-offer anim-sign-on" data-testid="revenge-offer" role="dialog">
            <p className="font-display onl-revenge-offer__msg">
              <strong>{o.revengeOffer.fromNickname}</strong> has requested a rematch, betting double
              the bet Coins.
              <br />
              Do you accept the rematch?
            </p>
            <p className="font-arcade onl-revenge-offer__stake">
              My bet 🪙 {o.revengeOffer.yourStake}
              {o.revengeOffer.yourAllIn && <em className="onl-allin font-arcade">ALL-IN</em>}
              <span className="c-muted"> / Opponent 🪙 {o.revengeOffer.oppStake}</span>
              {o.revengeOffer.oppAllIn && <em className="onl-allin font-arcade">ALL-IN</em>}
            </p>
            <div className="onl-revenge-offer__actions">
              <button
                type="button"
                className="onl-btn onl-btn--accent font-display"
                data-testid="btn-revenge-accept"
                onClick={() => respondRevenge(true)}
              >
                Accept ({offerRemain}s)
              </button>
              <button
                type="button"
                className="onl-btn font-display"
                data-testid="btn-revenge-decline"
                onClick={() => respondRevenge(false)}
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {/* ── Loser: REVENGE button (only when eligible) / wait after requesting ──
            During revengeClosed we're about to leave to main, so hide the button to prevent a one-frame flicker */}
        {!draw && !win && o.revengePhase === 'none' && o.revenge && !o.revengeClosed && (
          <div className="onl-revenge">
            <button
              type="button"
              className="onl-btn onl-btn--revenge font-arcade"
              data-testid="btn-revenge"
              disabled={requesting}
              onClick={async () => {
                if (requesting) return // #3: double-click in-flight guard
                setRequesting(true)
                setRequestError(null)
                setWaitStartedAt(performance.now())
                const r = await requestRevenge() // on success, transitions to revengePhase='waiting'
                if (!r.ok) {
                  // The winner already left or a match was found — notify then go to main (spec 2c)
                  setRequestError(r.message ?? 'Can’t request a rematch')
                  window.setTimeout(goMain, 1200)
                }
                // On success we move to the waiting UI, so requesting stays as-is (button unmounts)
              }}
            >
              REVENGE — 🪙 {o.revenge.stake}
              {o.revenge.allIn && <em className="onl-allin font-arcade">ALL-IN</em>}
            </button>
            {requestError && (
              <p className="font-display c-error onl-revenge__err" role="alert">
                {requestError} — returning to main
              </p>
            )}
          </div>
        )}
        {o.revengePhase === 'waiting' && (
          <div className="onl-revenge" data-testid="revenge-waiting">
            <p className="font-display onl-revenge__wait">
              {cancelling ? 'Cancelling…' : `Waiting for the opponent’s response… (${waitRemain}s)`}
            </p>
            {/* Cancel is server-confirmation-based — it doesn't do an optimistic teardown, it waits for revenge:result(CANCELLED).
                (#1: so that even if cancel loses the race against the winner's 'accept', no Coins are lost — on accept we just enter the match) */}
            <button
              type="button"
              className="onl-btn font-display"
              data-testid="btn-revenge-cancel"
              disabled={cancelling}
              onClick={() => {
                setCancelling(true)
                cancelRevenge()
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* 'To main' only when not waiting — while waiting, expose only cancel to eliminate the race window (#1) */}
        {o.revengePhase !== 'waiting' && (
          <button type="button" className="onl-btn font-display" onClick={goMain}>
            To main ▶
          </button>
        )}
      </div>
    )
  }

  if (o.phase === 'aborted') {
    return (
      <div className="onl-overlay" data-testid="online-aborted">
        <div className="onl-result font-arcade glow-text lose">OPPONENT LEFT</div>
        <div className="onl-sub font-arcade">Opponent left — the match is ended by the server</div>
        <button type="button" className="onl-btn font-display" onClick={goMain}>
          To main ▶
        </button>
      </div>
    )
  }

  return null
}
