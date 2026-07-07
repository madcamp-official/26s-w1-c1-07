/**
 * Game6 (Dino Run) per-theme renderer contract.
 * Each theme draws the whole scene "from scratch" in its own concept (drawScene). It never invents coordinates/verdicts —
 * it goes only by geom (theme-invariant geometry) + the @madcade/shared G6 constants (crossplay invariant). This is 'drawing' only.
 */
import type { Game6State } from '@madcade/shared';

/** Render-only effects (non-invasive to game logic — Game6.tsx generates them from state changes and passes them in) */
export type Fx =
  | { kind: 'dust'; x: number; y: number; t: number } // landing/jump dust
  | { kind: 'shards'; x: number; y: number; t: number } // crash shards
  | { kind: 'spawn'; x: number; y: number; t: number } // P2 throw flash
  | { kind: 'caption'; text: string; color: string; x: number; y: number; t: number; life: number }
  | { kind: 'chroma'; t: number } // crash-moment FX
  | { kind: 'rush'; t: number }; // survival-win rush

/** Theme-invariant geometry — logical (core 800×450) → canvas pixel transform. Used identically by every theme (fairness). */
export interface Geom {
  /** Canvas logical width (px) */
  CW: number;
  /** Canvas logical height (px) */
  CH: number;
  /** Scale (CW / G6.W) */
  SC: number;
  /** logical x → canvas x */
  X: (u: number) => number;
  /** logical y → canvas y */
  Y: (u: number) => number;
  /** Background star layout (deterministic) */
  STARS: readonly { x: number; y: number; z: number; r: number }[];
}

/**
 * Per-theme scene renderer — draws a whole frame: background/ground/obstacles (cactus·bird)/dino (P1)/HUD reload gauge/player badge/effects.
 * drawEndFlash (end flash) and the HUD frame are layered on separately by Game6.tsx.
 * Color follows the "player", not the "role" → functionColors() decides the P1/P2 entity colors (inside each renderer).
 */
export type Game6DrawScene = (
  ctx: CanvasRenderingContext2D,
  s: Game6State,
  fx: readonly Fx[],
  now: number,
  p1IsYou: boolean,
  p2IsYou: boolean,
  geom: Geom,
) => void;
