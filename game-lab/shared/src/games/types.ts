export type KeyCode = 'KeyQ' | 'KeyW' | 'KeyU' | 'KeyI'

export interface GameInputEvent {
  code: KeyCode
  type: 'down' | 'up'
  /** 게임 시작 기준 경과 시간(초). 프레임 사이에 눌린 키의 정확한 타이밍 판정용 */
  t: number
}

export type GameResult = 'P1' | 'P2' | 'DRAW' | null

export const GAME_DURATION = 10

/**
 * 게임 코어 = 순수 로직 모듈. I/O·소켓·DOM 의존 금지.
 * 오프라인(키보드 2벌)과 온라인(서버 권위 판정)이 같은 코어를 공유한다.
 */
export interface GameCore<S extends { elapsed: number; result: GameResult }> {
  create(rand: () => number): S
  step(state: S, events: GameInputEvent[], dt: number): S
}
