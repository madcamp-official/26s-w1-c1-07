/**
 * 온라인 매치 네비게이션 컨트롤러 — App에 상시 마운트.
 * 라운드마다 게임이 바뀌면 해당 게임 화면으로 자동 이동(서버 round:start 기반).
 * 매치 종료/상대 이탈 시 전역 오버레이 표시.
 */
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { resetOnline, useOnline } from './online'
import { closeModal } from '../state/flow'
import './online.css'

export default function OnlineController() {
  const o = useOnline()
  const navigate = useNavigate()
  const loc = useLocation()

  // 현재 라운드 게임 화면으로 이동(게임이 라운드마다 랜덤이라 매 round:start마다)
  useEffect(() => {
    if ((o.phase === 'countdown' || o.phase === 'playing') && o.gameId) {
      closeModal() // 매치 시작 시 온라인/설정 모달 자동 닫기(게임 시작해도 모달이 남아있던 버그)
      const target = `/game/${o.gameId}`
      if (loc.pathname !== target) navigate(target)
    }
  }, [o.gameId, o.phase, loc.pathname, navigate])

  // 라운드 카운트다운: 이 라운드에 서버가 배정한 내 색(역할)을 크게 알린다.
  // 역할이 매 라운드 랜덤이라, 플레이 시작 전에 "내가 파랑인지 빨강인지" 확실히 보여준다.
  if (o.phase === 'countdown' && o.role) {
    const iAmP1 = o.role === 'P1'
    return (
      <div className="onl-youbanner" data-testid="online-you-banner" aria-live="polite">
        <div className={`onl-youbanner__card ${iAmP1 ? 'is-p1' : 'is-p2'}`}>
          <span className="onl-youbanner__label font-arcade">YOU ARE</span>
          <span className="onl-youbanner__color font-arcade glow-text">
            {iAmP1 ? '파랑 · P1' : '빨강 · P2'}
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
    return (
      <div className="onl-overlay" data-testid="online-match-end">
        <div className={`onl-result font-arcade glow-text ${cls}`}>{label}</div>
        <div className="onl-sub font-arcade">MATCH OVER</div>
        <button
          type="button"
          className="onl-btn font-display"
          onClick={() => {
            resetOnline()
            navigate('/')
          }}
        >
          메인으로 ▶
        </button>
      </div>
    )
  }

  if (o.phase === 'aborted') {
    return (
      <div className="onl-overlay" data-testid="online-aborted">
        <div className="onl-result font-arcade glow-text lose">OPPONENT LEFT</div>
        <div className="onl-sub font-arcade">상대가 나갔습니다 — 매치는 서버에서 종료됩니다</div>
        <button
          type="button"
          className="onl-btn font-display"
          onClick={() => {
            resetOnline()
            navigate('/')
          }}
        >
          메인으로 ▶
        </button>
      </div>
    )
  }

  return null
}
