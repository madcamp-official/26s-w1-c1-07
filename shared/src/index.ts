export * from './games/types'

// 게임 7종 코어
export * as game1 from './games/game1/logic'
export * as game2 from './games/game2/logic'
export * as game3 from './games/game3/logic'
export * as game4 from './games/game4/logic'
export * as game5 from './games/game5/logic'
export * as game6 from './games/game6/logic'
export * as game7 from './games/game7/logic'
export * as game8 from './games/game8/logic'
export * as game9 from './games/game9/logic'
export * as game10 from './games/game10/logic'

export { G1 } from './games/game1/logic'
export { G2 } from './games/game2/logic'
export { G3 } from './games/game3/logic'
export { G4 } from './games/game4/logic'
export { G5 } from './games/game5/logic'
export { G6, SEQ_LEN } from './games/game6/logic'
export { G7, maxRun, density, resolveTimeout } from './games/game7/logic'
export { G8, magmaSurfaceY } from './games/game8/logic'
export { G9 } from './games/game9/logic'
export { G10 } from './games/game10/logic'

export type { Game1State } from './games/game1/logic'
export type { Game2State, Bullet } from './games/game2/logic'
export type { Game4State, Obstacle, ObstacleType } from './games/game4/logic'
export type { Game5State, Shot, Monster } from './games/game5/logic'
export type { Game6State } from './games/game6/logic'
export type { Game7State } from './games/game7/logic'
export type { Game8State, Shot8 } from './games/game8/logic'
export type { Game9State } from './games/game9/logic'
export type { Game10State } from './games/game10/logic'

// 게임3 엔진 타입(렌더러가 사용)
export type { Game3Config, Game3State, FencerState, DodgeStyle } from './games/game3/core'

// 게임 코어 레지스트리 + 소켓 이벤트 계약 (서버/클라 공유)
export { GAME_CORES, ALL_GAME_IDS } from './games/registry'
export type { GameId } from './games/registry'
export * from './net/events'
