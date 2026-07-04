import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * 게임10 = 줄다리기(Tug of War) · 교대 연타.
 *  · 밧줄 중앙 마커 pos ∈ [-1, 1]. -1=P1 완승선(왼쪽), +1=P2 완승선(오른쪽).
 *  · 각 플레이어는 자기 두 키를 '교대로' 눌러야 당긴다.
 *      P1: Q↔W 번갈아,  P2: U↔I 번갈아. 같은 키 연타는 무효(직전과 다른 키만 인정).
 *  · 유효 당김 1회 = PULL 만큼 자기 쪽으로. 아무도 안 당기면 SPRING으로 서서히 중앙 복귀.
 *  · 마커가 완승선(±1)에 닿으면 즉시 승리. 10초 종료 시 마커가 있는 쪽이 승(정중앙 DRAW).
 */
export const G9 = {
  W: 800,
  H: 450,
  /** 유효 교대 입력 1회당 당기는 정규화 거리 */
  PULL: 0.045,
  /** 중앙 복귀 스프링 계수(초당) */
  SPRING: 0.55,
  /** 완승 경계 */
  WIN_AT: 1,
  /** 당김 피드백 플래시 시간 */
  FLASH: 0.12,
} as const

export interface Game9State {
  elapsed: number
  result: GameResult
  /** [-1,1], 음수=P1 우세 */
  pos: number
  p1LastKey: 'KeyQ' | 'KeyW' | null
  p2LastKey: 'KeyU' | 'KeyI' | null
  p1Pulls: number
  p2Pulls: number
  p1Flash: number
  p2Flash: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function create(_rand: () => number): Game9State {
  return {
    elapsed: 0,
    result: null,
    pos: 0,
    p1LastKey: null,
    p2LastKey: null,
    p1Pulls: 0,
    p2Pulls: 0,
    p1Flash: 0,
    p2Flash: 0,
  }
}

export function step(state: Game9State, events: GameInputEvent[], dt: number): Game9State {
  if (state.result) return state
  state.elapsed += dt
  state.p1Flash = Math.max(0, state.p1Flash - dt)
  state.p2Flash = Math.max(0, state.p2Flash - dt)

  for (const e of events) {
    if (e.type !== 'down') continue
    if (e.code === 'KeyQ' || e.code === 'KeyW') {
      // 직전과 다른 키일 때만 유효(교대 강제)
      if (e.code !== state.p1LastKey) {
        state.p1LastKey = e.code
        state.pos -= G9.PULL
        state.p1Pulls += 1
        state.p1Flash = G9.FLASH
      }
    } else if (e.code === 'KeyU' || e.code === 'KeyI') {
      if (e.code !== state.p2LastKey) {
        state.p2LastKey = e.code
        state.pos += G9.PULL
        state.p2Pulls += 1
        state.p2Flash = G9.FLASH
      }
    }
  }

  // 중앙 복귀 스프링
  state.pos += -state.pos * G9.SPRING * dt
  state.pos = clamp(state.pos, -1.2, 1.2)

  // 완승 판정
  if (state.pos <= -G9.WIN_AT) {
    state.result = 'P1'
    return state
  }
  if (state.pos >= G9.WIN_AT) {
    state.result = 'P2'
    return state
  }

  if (state.elapsed >= GAME_DURATION) {
    state.result = state.pos < 0 ? 'P1' : state.pos > 0 ? 'P2' : 'DRAW'
  }
  return state
}
