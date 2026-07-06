import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * 게임11 = HOT POTATO (폭탄 돌리기).
 *  · 퓨즈 10초 고정: elapsed가 GAME_DURATION(10s)에 닿는 순간 폭발. 폭발 시 폭탄을 든 쪽이 패배.
 *    (항상 누군가 들고 있으므로 무승부 없음)
 *  · Q(P1)/U(P2) = 상대에게 넘기기. 받은 직후 RECEIVE_CD(0.2s) 동안은 다시 넘길 수 없다
 *    (= "패스 딜레이 0.2초"). 넘기면 소유권은 즉시 상대에게 넘어간다.
 *  · W(P1)/I(P2) = 페이크 모션(연출 전용, 기계 효과 없음. FAKE_CD 쿨다운). 상대를 속이는 심리용.
 *  · 최대 홀드 MAX_HOLD(1.5s): 그 이상 들고 있으면 자동으로 상대에게 넘어간다.
 *  · 화면(렌더): 남은 3초부터 카운트다운 숫자를 가리고, 퓨즈가 끝나갈수록 폭탄이 검정→주황.
 */
export const G11 = {
  /** 받은 직후 다시 넘길 수 없는 시간(초) — 패스 딜레이 */
  RECEIVE_CD: 0.2,
  /** 최대 홀드(초). 초과 시 자동 패스 */
  MAX_HOLD: 1.5,
  /** 페이크 쿨다운(초) */
  FAKE_CD: 0.3,
  /** 남은 시간이 이 값(초) 이하면 카운트다운 숨김(렌더 규칙) */
  HIDE_UNDER: 3,
} as const

export interface Game11State {
  elapsed: number
  result: GameResult
  /** 현재 폭탄 보유자 (1=P1, 2=P2) */
  holder: 1 | 2
  /** 현재 보유자가 폭탄을 받은 시각(elapsed) — 홀드 시간·수신 쿨다운 계산 */
  holdStart: number
  /** 마지막 패스 발생 시각(elapsed) — 렌더의 날아가는 연출용 */
  passAt: number
  /** 마지막 자동패스 여부(렌더 구분용) */
  autoPass: boolean
  /** 페이크 쿨다운 잔여(초) */
  fakeCd1: number
  fakeCd2: number
  /** 페이크 발동 시각(elapsed) — 렌더 페인트 연출용. 0=없음 */
  fake1: number
  fake2: number
}

export function create(rand: () => number): Game11State {
  return {
    elapsed: 0,
    result: null,
    holder: rand() < 0.5 ? 1 : 2,
    holdStart: 0,
    passAt: 0,
    autoPass: false,
    fakeCd1: 0,
    fakeCd2: 0,
    fake1: 0,
    fake2: 0,
  }
}

/** 소유권을 상대에게 넘긴다(즉시). 홀드 타이머·수신 쿨다운 리셋. */
function pass(state: Game11State, auto: boolean): void {
  state.holder = state.holder === 1 ? 2 : 1
  state.holdStart = state.elapsed
  state.passAt = state.elapsed
  state.autoPass = auto
}

export function step(state: Game11State, events: GameInputEvent[], dt: number): Game11State {
  if (state.result) return state
  state.elapsed += dt
  state.fakeCd1 = Math.max(0, state.fakeCd1 - dt)
  state.fakeCd2 = Math.max(0, state.fakeCd2 - dt)

  const canPass = state.elapsed - state.holdStart >= G11.RECEIVE_CD

  for (const e of events) {
    if (e.type !== 'down') continue
    switch (e.code) {
      case 'KeyQ': // P1 패스 (P1이 들고 있고 수신 쿨다운 지났을 때만)
        if (state.holder === 1 && canPass) pass(state, false)
        break
      case 'KeyU': // P2 패스
        if (state.holder === 2 && canPass) pass(state, false)
        break
      case 'KeyW': // P1 페이크 (보유자만, 쿨다운)
        if (state.holder === 1 && state.fakeCd1 === 0) {
          state.fake1 = state.elapsed
          state.fakeCd1 = G11.FAKE_CD
        }
        break
      case 'KeyI': // P2 페이크
        if (state.holder === 2 && state.fakeCd2 === 0) {
          state.fake2 = state.elapsed
          state.fakeCd2 = G11.FAKE_CD
        }
        break
    }
  }

  // 최대 홀드 초과 → 자동 패스
  if (state.elapsed - state.holdStart >= G11.MAX_HOLD) pass(state, true)

  // 퓨즈 만료 → 폭발. 든 쪽이 패배(상대 승).
  if (state.elapsed >= GAME_DURATION) {
    state.result = state.holder === 1 ? 'P2' : 'P1'
  }
  return state
}
