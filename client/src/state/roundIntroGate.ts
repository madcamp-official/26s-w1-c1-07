/**
 * Round-intro freeze gate — pure module singleton (not React).
 *
 * Why it's needed:
 *   Offline matches have no countdown phase, so the moment flow.phase becomes 'playing'
 *   the game rAF loop runs the core step(). Then magma (gravity)·timers·projectiles advance
 *   immediately, and the player can die before even reading the "how to play" intro.
 *   → Pause the game simulation while the intro is up (+ it also buys initial JIT warm-up time).
 *
 * Why a module variable instead of a store:
 *   The game loop (rAF) and QA watchdog (setInterval) must read it synchronously every frame,
 *   outside React. flow.ts / App.tsx are owned by the architect (must not modify), so instead of
 *   putting this state there, it's managed as a separate module.
 *   (same style as online.ts's socket/startRequestedForRoom module variables)
 *
 * Online doesn't use this gate: during the server countdown serverState=null, so it's already naturally paused.
 */
let activeUntil = 0;

/** Call when the intro starts — freeze active for `ms` from now */
export function openGate(ms: number): void {
  activeUntil = performance.now() + ms;
}

/** Call when the intro ends (or unmounts) — release immediately */
export function closeGate(): void {
  activeUntil = 0;
}

/** Checked by the game loop every frame — if true, skip this frame's step() */
export function isRoundIntroActive(): boolean {
  return performance.now() < activeUntil;
}

/** Remaining freeze time (ms) — use for a progress bar etc. if needed */
export function roundIntroRemainingMs(): number {
  return Math.max(0, activeUntil - performance.now());
}
