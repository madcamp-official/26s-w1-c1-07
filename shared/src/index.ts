export * from './games/types'

// 게임 10종 코어 (id = 화면 순서, shared/coins.ts GAME_ORDER)
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

export { G1 } from './games/game1/logic' // 숫자 맞추기
export { G2 } from './games/game2/logic' // 펜싱
export { G3, SEQ_LEN } from './games/game3/logic' // 펌프
export { G4 } from './games/game4/logic' // 로켓 피하기
export { G5 } from './games/game5/logic' // 라이트 사이클
export { G6 } from './games/game6/logic' // 공룡 달리기
export { G7, magmaSurfaceY } from './games/game7/logic' // 마그마 총격 듀얼
export { G8 } from './games/game8/logic' // 몬스터 포격전
export { G9, maxRun, density, resolveTimeout } from './games/game9/logic' // 스피드 오목
export { G10 } from './games/game10/logic' // 줄다리기

export type { Game1State } from './games/game1/logic'
export type { Game3State } from './games/game3/logic'
export type { Game4State, Bullet } from './games/game4/logic'
export type { Game5State } from './games/game5/logic'
export type { Game6State, Obstacle, ObstacleType } from './games/game6/logic'
export type { Game7State, Shot8 } from './games/game7/logic'
export type { Game8State, Shot, Monster } from './games/game8/logic'
export type { Game9State } from './games/game9/logic'
export type { Game10State } from './games/game10/logic'

// 펜싱(게임2) 엔진 타입(렌더러가 사용)은 core.ts
export type { Game2Config, Game2State, FencerState, DodgeStyle } from './games/game2/core'

// 게임 코어 레지스트리 + 소켓 이벤트 계약 (서버/클라 공유)
export { GAME_CORES, ALL_GAME_IDS } from './games/registry'
export type { GameId } from './games/registry'
export * from './net/events'

// 코인 시스템 (베팅·게임 해금)
export * from './coins'
