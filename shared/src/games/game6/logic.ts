import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * 게임6 = 펌프(리듬 연타 대전).
 *  · P1에게는 Q/W로 이루어진 긴 스트링, P2에게는 U/I로 이루어진 긴 스트링이 주어진다.
 *  · "지금 눌러야 할 키"를 누르면 점수 +1, 다음 키로 진행한다.
 *    틀린 키를 누르면 점수 −1(타일은 그대로, 진행하지 않는다).
 *  · 제한시간이 끝나면 점수가 높은 쪽이 승리(동점은 무승부).
 *  · 스트링 길이 = 제한시간(s) × 10.
 *
 * 키 인코딩: 0 = 첫 번째 키(Q / U), 1 = 두 번째 키(W / I).
 */
export const G6 = {
  /** 스트링 길이 = 제한시간(초) × 이 값 */
  KEYS_PER_SECOND: 10,
  /** 히트/미스 플래시 지속(초) */
  FLASH: 0.12,
} as const

export const SEQ_LEN = GAME_DURATION * G6.KEYS_PER_SECOND

export interface Game6State {
  elapsed: number
  result: GameResult
  p1Seq: number[]
  p2Seq: number[]
  p1Idx: number
  p2Idx: number
  p1Score: number
  p2Score: number
  /** 정답 히트 플래시 잔여 시간 */
  p1Flash: number
  p2Flash: number
  /** 오답 미스 플래시 잔여 시간 */
  p1Wrong: number
  p2Wrong: number
}

function makeSeq(rand: () => number, len: number): number[] {
  const out: number[] = []
  for (let i = 0; i < len; i++) out.push(rand() < 0.5 ? 0 : 1)
  return out
}

export function create(rand: () => number): Game6State {
  return {
    elapsed: 0,
    result: null,
    p1Seq: makeSeq(rand, SEQ_LEN),
    p2Seq: makeSeq(rand, SEQ_LEN),
    p1Idx: 0,
    p2Idx: 0,
    p1Score: 0,
    p2Score: 0,
    p1Flash: 0,
    p2Flash: 0,
    p1Wrong: 0,
    p2Wrong: 0,
  }
}

export function step(state: Game6State, events: GameInputEvent[], dt: number): Game6State {
  if (state.result) return state
  state.elapsed += dt
  state.p1Flash = Math.max(0, state.p1Flash - dt)
  state.p2Flash = Math.max(0, state.p2Flash - dt)
  state.p1Wrong = Math.max(0, state.p1Wrong - dt)
  state.p2Wrong = Math.max(0, state.p2Wrong - dt)

  for (const e of events) {
    if (e.type !== 'down') continue
    switch (e.code) {
      case 'KeyQ':
      case 'KeyW': {
        if (state.p1Idx >= SEQ_LEN) break
        const got = e.code === 'KeyQ' ? 0 : 1
        if (got === state.p1Seq[state.p1Idx]) {
          state.p1Score += 1
          state.p1Idx += 1
          state.p1Flash = G6.FLASH
        } else {
          state.p1Score -= 1
          state.p1Wrong = G6.FLASH
        }
        break
      }
      case 'KeyU':
      case 'KeyI': {
        if (state.p2Idx >= SEQ_LEN) break
        const got = e.code === 'KeyU' ? 0 : 1
        if (got === state.p2Seq[state.p2Idx]) {
          state.p2Score += 1
          state.p2Idx += 1
          state.p2Flash = G6.FLASH
        } else {
          state.p2Score -= 1
          state.p2Wrong = G6.FLASH
        }
        break
      }
    }
  }

  if (state.elapsed >= GAME_DURATION) {
    state.result =
      state.p1Score > state.p2Score ? 'P1' : state.p2Score > state.p1Score ? 'P2' : 'DRAW'
  }
  return state
}
