/**
 * Shell domain barrel — UI types + mock data used by the out-of-game UI (login/lobby/leaderboard/modals).
 * Replaces the design-lab core that the design-02 screens originally referenced with this local module (`@/shell`).
 * (Self-containment: does not reference the design-lab/game-lab folders — MERGE_PLAN §2-0 invariant A)
 *
 * The game core logic/state lives in `@madcade/shared` (game-lab vendor-in), not here.
 */
export * from './types';
export * from './mock';
