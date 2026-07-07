/**
 * UI types used by the shell (out-of-game UI such as login/lobby/leaderboard).
 *
 * ⚠️ This is separate from the "game core" (@madpump/shared).
 *  - The game verdict result is the core's GameResult = 'P1' | 'P2' | 'DRAW' (game-lab).
 *  - The MatchResult here ('P1_WIN'…) is a shell-domain value for displaying the mock leaderboard/records.
 *  - Once the server is wired up, these shell types are replaced by REST response types (currently mock scaffolding).
 *
 * Vendor-in from the design-lab original. Per the self-containment principle (MERGE_PLAN §2-0),
 * it is copied into client without referencing the design-lab folder.
 */

/** Mini-game identifier (1..13) */
export type GameId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

/** Player role in a local match */
export type PlayerRole = 'P1' | 'P2';

/** Final match result (shell/mock notation) */
export type MatchResult = 'P1_WIN' | 'P2_WIN' | 'DRAW';

/** Round progression settings */
export interface RoundConfig {
  /** Total number of rounds */
  roundCount: number;
  /** Time limit per round (seconds) */
  timePerRoundSec: number;
}

/** Result of a single round */
export interface RoundResult {
  roundIndex: number;
  winner: PlayerRole | null; // null = drawn round
}
