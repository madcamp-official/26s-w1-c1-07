import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * Game 6 = Pump (rhythm mash-off).
 *  · P1 is given a long string made of Q/W, P2 a long string made of U/I.
 *  · Press the "key you must hit right now" for +1 point and advance to the next key.
 *    Press the wrong key and you lose 1 point (the tile stays, no advance).
 *  · When the time limit ends, the higher score wins (a tie is a Draw).
 *  · String length = time limit (s) × 10.
 *
 * Key encoding: 0 = first key (Q / U), 1 = second key (W / I).
 */
export const G3 = {
  /** String length = time limit (seconds) × this value */
  KEYS_PER_SECOND: 10,
  /** Hit/miss flash duration (seconds) */
  FLASH: 0.12,
} as const

export const SEQ_LEN = GAME_DURATION * G3.KEYS_PER_SECOND

export interface Game3State {
  elapsed: number
  result: GameResult
  p1Seq: number[]
  p2Seq: number[]
  p1Idx: number
  p2Idx: number
  p1Score: number
  p2Score: number
  /** Remaining time for the correct-hit flash */
  p1Flash: number
  p2Flash: number
  /** Remaining time for the wrong-miss flash */
  p1Wrong: number
  p2Wrong: number
}

function makeSeq(rand: () => number, len: number): number[] {
  const out: number[] = []
  for (let i = 0; i < len; i++) out.push(rand() < 0.5 ? 0 : 1)
  return out
}

export function create(rand: () => number): Game3State {
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

export function step(state: Game3State, events: GameInputEvent[], dt: number): Game3State {
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
          state.p1Flash = G3.FLASH
        } else {
          state.p1Score -= 1
          state.p1Wrong = G3.FLASH
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
          state.p2Flash = G3.FLASH
        } else {
          state.p2Score -= 1
          state.p2Wrong = G3.FLASH
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
