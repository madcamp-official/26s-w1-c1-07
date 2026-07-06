/**
 * SFX registry — cue id → synthesis spec (sfxr preset or multi-note jingle) + BGM tracks.
 * Owner: audio agent. ids match the game SFX source of truth (docs/AUDIO_PLAN.md).
 */
import type { SfxParams, SeqNote, VampTrack, Wave } from './synth';

type Rng = () => number;
type PresetFn = (r: Rng) => SfxParams;

/** sfxr-style presets (r = seeded random → subtle variation per cue) */
export const PRESETS: Record<string, PresetFn> = {
  hover: (r) => ({ wave: 'sine', freq: 1000 + r() * 260, attack: 0.002, sustain: 0.008, decay: 0.04, gain: 0.13 }),
  click: (r) => ({ wave: 'square', duty: 0.5, freq: 560 + r() * 140, slide: -2, attack: 0.001, sustain: 0.008, decay: 0.05, punch: 0.3, gain: 0.24 }),
  blip: (r) => ({ wave: 'square', duty: 0.5, freq: 840 + r() * 360, attack: 0.001, sustain: 0.014, decay: 0.05, punch: 0.25, gain: 0.24 }),
  confirm: (r) => ({ wave: 'square', duty: 0.5, freq: 560 + r() * 80, arpTime: 0.05, arpMul: 1.335, sustain: 0.05, decay: 0.12, gain: 0.24 }),
  back: (r) => ({ wave: 'square', duty: 0.5, freq: 540 + r() * 80, slide: -3, sustain: 0.03, decay: 0.1, gain: 0.22 }),
  coin: (r) => ({ wave: 'square', duty: 0.5, freq: 940 + r() * 120, arpTime: 0.045, arpMul: 1.5, sustain: 0.04, decay: 0.3, gain: 0.24 }),
  powerup: (r) => ({ wave: 'square', duty: 0.5, freq: 300 + r() * 80, slide: 2.2, sustain: 0.12, decay: 0.28, vibDepth: 0.02, vibSpeed: 14, gain: 0.22 }),
  toneUp: (r) => ({ wave: 'square', duty: 0.5, freq: 280 + r() * 60, slide: 2.6, sustain: 0.14, decay: 0.16, gain: 0.2 }),
  toneDown: (r) => ({ wave: 'square', duty: 0.5, freq: 760 + r() * 120, slide: -2.6, sustain: 0.1, decay: 0.2, gain: 0.2 }),
  laser: (r) => ({ wave: 'saw', freq: 960 + r() * 260, slide: -4.5, sustain: 0.05, decay: 0.12, punch: 0.2, gain: 0.2 }),
  shoot: (r) => ({ wave: 'square', duty: 0.35, freq: 820 + r() * 220, slide: -3.5, sustain: 0.04, decay: 0.1, punch: 0.2, gain: 0.2 }),
  boom: (r) => ({ wave: 'noise', freq: 520 + r() * 160, slide: -2.5, sustain: 0.05, decay: 0.3, punch: 0.3, lpf: 0.4, gain: 0.28 }),
  explosion: (r) => ({ wave: 'noise', freq: 820 + r() * 200, slide: -3.5, sustain: 0.06, decay: 0.44, punch: 0.35, lpf: 0.35, gain: 0.3 }),
  hit: (r) => ({ wave: 'noise', freq: 520 + r() * 160, slide: -1.5, sustain: 0.02, decay: 0.14, punch: 0.25, lpf: 0.5, gain: 0.26 }),
  buzz: (r) => ({ wave: 'saw', freq: 150 + r() * 30, sustain: 0.06, decay: 0.2, vibDepth: 0.03, vibSpeed: 22, gain: 0.2 }),
  whoosh: (r) => ({ wave: 'noise', freq: 480 + r() * 200, slide: 2.4, attack: 0.004, sustain: 0.04, decay: 0.14, hpf: 0.15, gain: 0.16 }),
  jump: (r) => ({ wave: 'square', duty: 0.5, freq: 380 + r() * 80, slide: 2.4, sustain: 0.06, decay: 0.09, gain: 0.22 }),
  duck: (r) => ({ wave: 'square', duty: 0.5, freq: 420 + r() * 60, slide: -2.2, sustain: 0.05, decay: 0.08, gain: 0.2 }),
  tick: (r) => ({ wave: 'square', duty: 0.5, freq: 1040 + r() * 120, attack: 0.0005, sustain: 0.008, decay: 0.04, punch: 0.3, gain: 0.24 }),
  place: (r) => ({ wave: 'square', duty: 0.5, freq: 640 + r() * 140, slide: -1, sustain: 0.012, decay: 0.06, punch: 0.25, gain: 0.24 }),
  pull: (r) => ({ wave: 'square', duty: 0.5, freq: 300 + r() * 120, slide: -1.5, sustain: 0.02, decay: 0.08, punch: 0.2, gain: 0.22 }),
  turn: (r) => ({ wave: 'square', duty: 0.5, freq: 700 + r() * 160, slide: -1, sustain: 0.01, decay: 0.05, gain: 0.18 }),
  flap: (r) => ({ wave: 'triangle', freq: 420 + r() * 120, slide: 1.5, sustain: 0.03, decay: 0.06, gain: 0.22 }),
};

const sq: Wave = 'square';
const tri: Wave = 'triangle';
export const SEQS: Record<string, SeqNote[]> = {
  win: [
    { m: 72, t: 0, d: 0.1, w: sq, g: 0.28 },
    { m: 76, t: 0.1, d: 0.1, w: sq, g: 0.28 },
    { m: 79, t: 0.2, d: 0.1, w: sq, g: 0.28 },
    { m: 84, t: 0.3, d: 0.28, w: sq, g: 0.3 },
  ],
  lose: [
    { m: 69, t: 0, d: 0.14, w: sq, g: 0.24 },
    { m: 65, t: 0.14, d: 0.14, w: sq, g: 0.24 },
    { m: 60, t: 0.28, d: 0.34, w: tri, g: 0.26 },
  ],
  draw: [
    { m: 67, t: 0, d: 0.13, w: sq, g: 0.24 },
    { m: 69, t: 0.13, d: 0.13, w: sq, g: 0.24 },
    { m: 67, t: 0.26, d: 0.22, w: sq, g: 0.22 },
  ],
  go: [
    { m: 60, t: 0, d: 0.26, w: sq, g: 0.22 },
    { m: 64, t: 0, d: 0.26, w: sq, g: 0.2 },
    { m: 67, t: 0, d: 0.26, w: sq, g: 0.2 },
  ],
};

/** cue id → spec: preset (preset name) or seq (jingle name). Matches the 70 cues in docs/AUDIO_PLAN.md. */
export interface SfxSpec {
  preset?: string;
  seq?: string;
}
export const SPEC: Record<string, SfxSpec> = {
  // UI & Navigation
  'ui-hover': { preset: 'hover' },
  'ui-click': { preset: 'click' },
  'ui-confirm': { preset: 'confirm' },
  'ui-cancel-back': { preset: 'back' },
  'ui-toggle': { preset: 'click' },
  'ui-tab-switch': { preset: 'blip' },
  'ui-modal-open': { preset: 'confirm' },
  'ui-modal-close': { preset: 'back' },
  'ui-login-success': { preset: 'coin' },
  'ui-landing-appear': { preset: 'powerup' },
  'ui-error-beep': { preset: 'buzz' },
  // Matchmaking & Room
  'mm-searching-loop': { preset: 'tick' },
  'mm-match-found': { preset: 'coin' },
  'room-create': { preset: 'confirm' },
  'room-join': { preset: 'confirm' },
  'room-join-fail': { preset: 'buzz' },
  'room-opponent-join': { preset: 'blip' },
  'room-opponent-leave': { preset: 'back' },
  'room-ready': { preset: 'coin' },
  // Coin & Economy
  'coin-bet-confirm': { preset: 'coin' },
  'coin-gain': { preset: 'coin' },
  'coin-loss': { preset: 'toneDown' },
  'coin-tally-tick': { preset: 'tick' },
  'coin-unlock': { preset: 'powerup' },
  'coin-insufficient': { preset: 'buzz' },
  // Match Flow
  'flow-countdown-tick': { preset: 'tick' },
  'flow-go': { seq: 'go' },
  'flow-match-start': { preset: 'powerup' },
  'flow-timeup': { preset: 'buzz' },
  'flow-win-stinger': { seq: 'win' },
  'flow-lose-stinger': { seq: 'lose' },
  'flow-draw-stinger': { seq: 'draw' },
  // Per-game 1-5
  'g1-tap': { preset: 'blip' },
  'g1-gauge-rise': { preset: 'toneUp' },
  'g1-gauge-max': { preset: 'powerup' },
  'g2-clash': { preset: 'hit' },
  'g2-parry': { preset: 'shoot' },
  'g2-riposte': { preset: 'powerup' },
  'g2-knockback': { preset: 'whoosh' },
  'g2-ringout': { preset: 'explosion' },
  'g2-combo': { preset: 'confirm' },
  'g3-hit-correct': { preset: 'place' },
  'g3-hit-wrong': { preset: 'buzz' },
  'g3-sequence-clear': { preset: 'powerup' },
  'g4-rocket-fire': { preset: 'shoot' },
  'g4-dodge': { preset: 'whoosh' },
  'g4-hit': { preset: 'hit' },
  'g4-invincible': { preset: 'toneUp' },
  'g4-ko': { preset: 'explosion' },
  'g5-turn': { preset: 'turn' },
  'g5-trail-loop': { preset: 'blip' },
  'g5-crash': { preset: 'explosion' },
  // Per-game 6-10
  'g6-jump': { preset: 'jump' },
  'g6-duck': { preset: 'duck' },
  'g6-obstacle-spawn': { preset: 'place' },
  'g6-crash': { preset: 'explosion' },
  'g7-flap': { preset: 'flap' },
  'g7-shoot': { preset: 'shoot' },
  'g7-hit': { preset: 'hit' },
  'g7-magma-death': { preset: 'boom' },
  'g8-cannon-fire': { preset: 'boom' },
  'g8-monster-hit': { preset: 'hit' },
  'g8-cannon-damaged': { preset: 'hit' },
  'g8-monster-approach': { preset: 'buzz' },
  'g9-cursor-move': { preset: 'tick' },
  'g9-place-stone': { preset: 'place' },
  'g9-three-win': { seq: 'win' },
  'g10-pull': { preset: 'pull' },
  'g10-rope-tension': { preset: 'toneUp' },
  'g10-win-line': { seq: 'win' },
};

export type SfxId = keyof typeof SPEC;

/** Chiptune loop BGM tracks (chord vamp for renderVamp) */
export const BGM: Record<string, VampTrack> = {
  lobby: { id: 'lobby', bpm: 150, leadWave: 'square', leadOct: 0, density: 16, bars: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]] },
  battle: { id: 'battle', bpm: 165, leadWave: 'square', leadOct: 1, density: 16, bars: [[62, 66, 69], [57, 61, 64], [59, 62, 66], [55, 59, 62]] },
};
export type BgmKey = keyof typeof BGM;
