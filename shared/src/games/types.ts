export type KeyCode = 'KeyQ' | 'KeyW' | 'KeyU' | 'KeyI'

export interface GameInputEvent {
  code: KeyCode
  type: 'down' | 'up'
  /** Elapsed time since game start (seconds). For precise timing of keys pressed between frames */
  t: number
  /**
   * (optional) "chosen cell" index. In games where the cursor auto-scans (like Gomoku, game 7),
   * used when the server does not manage/broadcast the cursor and the client runs it locally, then sends only the cell at the moment of placement.
   * If absent (undefined), the core judges using the existing method (server-side cursor, etc.). Most games do not use this.
   */
  cell?: number
}

export type GameResult = 'P1' | 'P2' | 'DRAW' | null

export const GAME_DURATION = 10

/**
 * Game core = pure logic module. No I/O, socket, or DOM dependencies allowed.
 * Offline (two keyboard sets) and online (server-authoritative judging) share the same core.
 */
export interface GameCore<S extends { elapsed: number; result: GameResult }> {
  create(rand: () => number): S
  step(state: S, events: GameInputEvent[], dt: number): S
}
