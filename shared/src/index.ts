export * from './games/types'

// Core of the 13 games (id = screen order, shared/coins.ts GAME_ORDER)
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
export * as game11 from './games/game11/logic'
export * as game12 from './games/game12/logic'
export * as game13 from './games/game13/logic'

export { G1 } from './games/game1/logic' // Number Guess
export { G2 } from './games/game2/logic' // Fencing
export { G3, SEQ_LEN } from './games/game3/logic' // Pump
export { G4 } from './games/game4/logic' // dodge the rockets
export { G5 } from './games/game5/logic' // Light Cycle
export { G6 } from './games/game6/logic' // Dino Run
export { G7, magmaSurfaceY } from './games/game7/logic' // magma gunfight duel
export { G8 } from './games/game8/logic' // monster bombardment
export { G9, maxRun, density, resolveTimeout } from './games/game9/logic' // Speed Gomoku
export { G10 } from './games/game10/logic' // Tug of War
export { G11 } from './games/game11/logic' // HOT POTATO (bomb pass)
export { G12, isRed, isTelegraph } from './games/game12/logic' // RED LIGHT, GREEN LIGHT
export { G13 } from './games/game13/logic' // POT SHOT (burst the pot)

export type { Game1State } from './games/game1/logic'
export type { Game3State } from './games/game3/logic'
export type { Game4State, Bullet } from './games/game4/logic'
export type { Game5State } from './games/game5/logic'
export type { Game6State, Obstacle, ObstacleType } from './games/game6/logic'
export type { Game7State, Shot8 } from './games/game7/logic'
export type { Game8State, Shot, Monster } from './games/game8/logic'
export type { Game9State } from './games/game9/logic'
export type { Game10State } from './games/game10/logic'
export type { Game11State } from './games/game11/logic'
export type { Game12State } from './games/game12/logic'
export type { Game13State, Shot13 } from './games/game13/logic'

// Fencing (game 2) engine types (used by the renderer) live in core.ts
export type { Game2Config, Game2State, FencerState, DodgeStyle } from './games/game2/core'

// Game core registry + socket event contract (shared server/client)
export { GAME_CORES, ALL_GAME_IDS } from './games/registry'
export type { GameId } from './games/registry'
export * from './net/events'

// Coin system (betting and game unlocking)
export * from './coins'
