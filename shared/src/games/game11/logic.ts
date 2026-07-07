import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * Game 11 = HOT POTATO (bomb pass).
 *  · Fuse fixed at 10s: explodes the moment elapsed hits GAME_DURATION(10s). On explosion, whoever holds the bomb loses.
 *    (someone is always holding it, so there's no draw)
 *  · Q(P1)/U(P2) = pass to the opponent. Right after receiving, you can't pass again during RECEIVE_CD(0.2s)
 *    (= "pass delay 0.2s"). Passing hands ownership to the opponent immediately.
 *  · W(P1)/I(P2) = fake motion (visual only, no mechanical effect. FAKE_CD cooldown). A mind-game to fool the opponent.
 *  · Max hold MAX_HOLD(1.5s): hold longer than that and it auto-passes to the opponent.
 *  · Screen (render): hide the countdown number starting from the last 3s, and the bomb goes black→orange as the fuse runs out.
 */
export const G11 = {
  /** Time (s) after receiving during which you can't pass again — pass delay */
  RECEIVE_CD: 0.2,
  /** Max hold (s). Auto-pass when exceeded */
  MAX_HOLD: 1.5,
  /** Fake cooldown (s) */
  FAKE_CD: 0.3,
  /** If remaining time is at or below this value (s), hide the countdown (render rule) */
  HIDE_UNDER: 3,
} as const

export interface Game11State {
  elapsed: number
  result: GameResult
  /** Current bomb holder (1=P1, 2=P2) */
  holder: 1 | 2
  /** Time (elapsed) the current holder received the bomb — for hold time / receive cooldown calc */
  holdStart: number
  /** Time (elapsed) of the last pass — for the flying render effect */
  passAt: number
  /** Whether the last pass was an auto-pass (for render distinction) */
  autoPass: boolean
  /** Remaining fake cooldown (s) */
  fakeCd1: number
  fakeCd2: number
  /** Time (elapsed) a fake was triggered — for render paint effect. 0=none */
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

/** Hands ownership to the opponent (immediately). Resets hold timer and receive cooldown. */
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
      case 'KeyQ': // P1 pass (only when P1 is holding and the receive cooldown has passed)
        if (state.holder === 1 && canPass) pass(state, false)
        break
      case 'KeyU': // P2 pass
        if (state.holder === 2 && canPass) pass(state, false)
        break
      case 'KeyW': // P1 fake (holder only, cooldown)
        if (state.holder === 1 && state.fakeCd1 === 0) {
          state.fake1 = state.elapsed
          state.fakeCd1 = G11.FAKE_CD
        }
        break
      case 'KeyI': // P2 fake
        if (state.holder === 2 && state.fakeCd2 === 0) {
          state.fake2 = state.elapsed
          state.fakeCd2 = G11.FAKE_CD
        }
        break
    }
  }

  // Max hold exceeded → auto-pass
  if (state.elapsed - state.holdStart >= G11.MAX_HOLD) pass(state, true)

  // Fuse expired → explosion. The holder loses (opponent wins).
  if (state.elapsed >= GAME_DURATION) {
    state.result = state.holder === 1 ? 'P2' : 'P1'
  }
  return state
}
