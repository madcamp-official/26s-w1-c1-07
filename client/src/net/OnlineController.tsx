/**
 * 온라인 매치 네비게이션 컨트롤러 — App에 상시 마운트.
 * 라운드마다 게임이 바뀌면 해당 게임 화면으로 자동 이동(서버 round:start 기반).
 * 매치 시작 시 슬롯머신+VS 인트로(phase 'slot'), 종료 시 결과+리벤지 오버레이.
 *
 * 리벤지 UX (docs/ONLINE_MATCH.md):
 *  · 패자: 자격이 있으면 REVENGE 버튼(스테이크·ALL-IN 표시) → 신청 후 응답 대기(취소 가능)
 *  · 승자: 오퍼 다이얼로그 "{이름} 님이 … 수락하시겠습니까?" [수락]/[거절] + 10초 카운트
 *  · 무산(거절/취소/타임아웃/불가): revengeClosed 수신 → 방 나가고 메인으로
 *  · 수락: 서버가 revenge:result → match:start 순으로 보냄 → 슬롯 인트로부터 재시작
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

  /** 리벤지 카운트다운 표시용(코스메틱 — 실제 타임아웃은 서버 10초). now로 초기화(#7: 첫 250ms 오표시 방지) */
  const [nowTick, setNowTick] = useState(() => performance.now())
  /** 패자가 신청을 보낸 시각 (대기 카운트 표시용) */
  const [waitStartedAt, setWaitStartedAt] = useState(0)
  const [requestError, setRequestError] = useState<string | null>(null)
  /** REVENGE 신청 in-flight 가드 (#3: 더블클릭 방지) */
  const [requesting, setRequesting] = useState(false)
  /** 취소 요청 후 서버 확정 대기 중 */
  const [cancelling, setCancelling] = useState(false)
  /** 내가 스스로 메인으로 빠져나가는 중 — 서버 이벤트 에코가 teardown을 재트리거하지 않게 (#1·#6) */
  const leavingRef = useRef(false)

  const goMain = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    leaveRoom()
    resetOnline()
    navigate('/')
  }, [navigate])

  // 매치 시작(슬롯 인트로 포함) 시 모달 정리 + 라운드 게임 화면으로 이동
  useEffect(() => {
    if (o.phase === 'slot') {
      leavingRef.current = false // 새 매치 진입 — teardown 가드 해제 (리벤지 수락 재시작 포함)
      setRequestError(null)
      setRequesting(false)
      setCancelling(false)
      closeModal() // 인트로 시작 — 온라인/매칭 모달 닫기
    }
    if ((o.phase === 'countdown' || o.phase === 'playing') && o.gameId) {
      closeModal()
      const target = `/game/${o.gameId}`
      if (loc.pathname !== target) navigate(target)
    }
  }, [o.gameId, o.phase, loc.pathname, navigate])

  // 새 매치 종료(match-end)마다 이전 매치의 stale 신청상태 초기화 (#2)
  useEffect(() => {
    if (o.phase === 'match-end') {
      setRequestError(null)
      setRequesting(false)
      setCancelling(false)
    }
  }, [o.matchId, o.phase])

  // 리벤지 무산(거절/취소/타임아웃/신청 불가) → 방 나가고 메인으로 (명세 2c). goMain이 중복 실행 차단(#6)
  useEffect(() => {
    if (o.revengeClosed) goMain()
  }, [o.revengeClosed, goMain])

  // 리벤지 카운트다운 틱 (대기/오퍼 중에만)
  useEffect(() => {
    if (o.revengePhase === 'none') return
    const t = window.setInterval(() => setNowTick(performance.now()), 250)
    return () => window.clearInterval(t)
  }, [o.revengePhase])

  // ── 슬롯머신 + VS 인트로 ──
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

  // 라운드 카운트다운: 내 '색'(플레이어 종속, 매치 고정)을 크게 알린다.
  // 색은 역할과 무관 — 공격/수비 역할은 매치마다 랜덤이라 색으로 역할을 알 수 없다(그게 의도).
  if (o.phase === 'countdown' && o.role) {
    // 색 정보 없으면(구버전 등) 역할 색으로 폴백.
    const iAmBlue = o.myColor ? o.myColor === 'blue' : o.role === 'P1'
    return (
      <div className="onl-youbanner" data-testid="online-you-banner" aria-live="polite">
        <div className={`onl-youbanner__card ${iAmBlue ? 'is-p1' : 'is-p2'}`}>
          <span className="onl-youbanner__label font-arcade">YOU ARE</span>
          <span className="onl-youbanner__color font-arcade glow-text">
            {iAmBlue ? '파랑' : '빨강'}
          </span>
          <span className="onl-youbanner__hint font-display">U · I 로 조종</span>
        </div>
      </div>
    )
  }

  if (o.phase === 'match-end') {
    const win = o.matchResult === `${o.mySlot}_WIN`
    const draw = o.matchResult === 'DRAW'
    const label = draw ? 'DRAW' : win ? 'YOU WIN!' : 'YOU LOSE'
    const cls = draw ? 'draw' : win ? 'win' : 'lose'

    // 리벤지 오퍼 남은 초 (승자 다이얼로그) — 상한 클램프(#7: 첫 렌더 과대 표시 방지)
    const offerRemain = o.revengeOffer
      ? Math.min(
          Math.ceil(o.revengeOffer.timeoutMs / 1000),
          Math.max(0, Math.ceil((o.revengeOffer.timeoutMs - (nowTick - o.revengeOffer.receivedAt)) / 1000)),
        )
      : 0
    // 신청 대기 남은 초 (패자) — 서버 타임아웃 10초 기준 코스메틱, 상한 10s 클램프
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
            {o.coinBalance !== null && <span className="onl-coins-balance"> · 보유 {o.coinBalance}</span>}
          </div>
        )}

        {/* ── 승자: 리벤지 오퍼 다이얼로그 ── */}
        {o.revengePhase === 'offered' && o.revengeOffer && (
          <div className="onl-revenge-offer anim-sign-on" data-testid="revenge-offer" role="dialog">
            <p className="font-display onl-revenge-offer__msg">
              <strong>{o.revengeOffer.fromNickname}</strong> 님이 베팅 코인의 2배를 걸고 리벤지
              매치를 신청하셨습니다.
              <br />
              리벤지를 수락하시겠습니까?
            </p>
            <p className="font-arcade onl-revenge-offer__stake">
              내 베팅 🪙 {o.revengeOffer.yourStake}
              {o.revengeOffer.yourAllIn && <em className="onl-allin font-arcade">ALL-IN</em>}
              <span className="c-muted"> / 상대 🪙 {o.revengeOffer.oppStake}</span>
              {o.revengeOffer.oppAllIn && <em className="onl-allin font-arcade">ALL-IN</em>}
            </p>
            <div className="onl-revenge-offer__actions">
              <button
                type="button"
                className="onl-btn onl-btn--accent font-display"
                data-testid="btn-revenge-accept"
                onClick={() => respondRevenge(true)}
              >
                수락 ({offerRemain}s)
              </button>
              <button
                type="button"
                className="onl-btn font-display"
                data-testid="btn-revenge-decline"
                onClick={() => respondRevenge(false)}
              >
                거절
              </button>
            </div>
          </div>
        )}

        {/* ── 패자: REVENGE 버튼 (자격 있을 때만) / 신청 후 대기 ──
            revengeClosed 중엔 곧 메인으로 나가므로 버튼을 숨겨 한 프레임 깜빡임 방지 */}
        {!draw && !win && o.revengePhase === 'none' && o.revenge && !o.revengeClosed && (
          <div className="onl-revenge">
            <button
              type="button"
              className="onl-btn onl-btn--revenge font-arcade"
              data-testid="btn-revenge"
              disabled={requesting}
              onClick={async () => {
                if (requesting) return // #3: 더블클릭 in-flight 가드
                setRequesting(true)
                setRequestError(null)
                setWaitStartedAt(performance.now())
                const r = await requestRevenge() // 성공 시 revengePhase='waiting'로 전환됨
                if (!r.ok) {
                  // 승자가 이미 떠났거나 매치가 잡힘 — 안내 후 메인으로 (명세 2c)
                  setRequestError(r.message ?? '리벤지를 신청할 수 없어요')
                  window.setTimeout(goMain, 1200)
                }
                // 성공이면 waiting UI로 넘어가므로 requesting은 그대로(버튼 언마운트)
              }}
            >
              REVENGE — 🪙 {o.revenge.stake}
              {o.revenge.allIn && <em className="onl-allin font-arcade">ALL-IN</em>}
            </button>
            {requestError && (
              <p className="font-display c-error onl-revenge__err" role="alert">
                {requestError} — 메인으로 돌아갑니다
              </p>
            )}
          </div>
        )}
        {o.revengePhase === 'waiting' && (
          <div className="onl-revenge" data-testid="revenge-waiting">
            <p className="font-display onl-revenge__wait">
              {cancelling ? '취소하는 중…' : `상대의 응답을 기다리는 중… (${waitRemain}s)`}
            </p>
            {/* 취소는 서버 확정 기반 — 낙관적 teardown을 하지 않고 revenge:result(CANCELLED)를 기다린다.
                (#1: 승자 '수락'과의 경합에서 취소가 져도 코인을 잃지 않게 — 수락 시엔 그대로 매치로 진입) */}
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
              취소
            </button>
          </div>
        )}

        {/* 대기 중이 아닐 때만 '메인으로' — waiting 중엔 취소만 노출해 경합 창을 없앤다(#1) */}
        {o.revengePhase !== 'waiting' && (
          <button type="button" className="onl-btn font-display" onClick={goMain}>
            메인으로 ▶
          </button>
        )}
      </div>
    )
  }

  if (o.phase === 'aborted') {
    return (
      <div className="onl-overlay" data-testid="online-aborted">
        <div className="onl-result font-arcade glow-text lose">OPPONENT LEFT</div>
        <div className="onl-sub font-arcade">상대가 나갔습니다 — 매치는 서버에서 종료됩니다</div>
        <button type="button" className="onl-btn font-display" onClick={goMain}>
          메인으로 ▶
        </button>
      </div>
    )
  }

  return null
}
