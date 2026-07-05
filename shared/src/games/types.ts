export type KeyCode = 'KeyQ' | 'KeyW' | 'KeyU' | 'KeyI'

export interface GameInputEvent {
  code: KeyCode
  type: 'down' | 'up'
  /** 게임 시작 기준 경과 시간(초). 프레임 사이에 눌린 키의 정확한 타이밍 판정용 */
  t: number
  /**
   * (선택) "고른 칸" 인덱스. 오목(게임7)처럼 커서가 자동 스캔되는 게임에서,
   * 커서를 서버가 관리·브로드캐스트하지 않고 클라가 로컬로 돌린 뒤 배치 순간의 칸만 보낼 때 쓴다.
   * 없으면(undefined) 코어는 기존 방식(서버측 커서 등)으로 판정한다. 대부분 게임은 사용 안 함.
   */
  cell?: number
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
