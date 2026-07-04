export * from './games/types'

// 게임 3종 코어
export * as game1 from './games/game1/logic'
export * as game2 from './games/game2/logic'
export * as game3 from './games/game3/logic'

export { G1 } from './games/game1/logic'
export { G2 } from './games/game2/logic'
export { G3 } from './games/game3/logic'

export type { Game1State } from './games/game1/logic'
export type { Game2State, Bullet } from './games/game2/logic'

// 게임3 엔진 타입(렌더러가 사용)
export type { Game3Config, Game3State, FencerState, DodgeStyle } from './games/game3/core'
