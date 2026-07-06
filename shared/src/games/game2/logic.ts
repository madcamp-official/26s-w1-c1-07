import { makeGame3, type Game2Config } from './core'

/**
 * Game 3 = "surge knockback (SURGE)" fencing.
 * Core:
 *  · Extreme brawl base (short duration · narrow window · fast cooldown · wide startup randomness = feint mind games).
 *  · Tide (TIDE) + tempo acceleration: as time passes the fall line tightens and cooldowns shrink, exploding density late.
 *  · Riposte-break: successful parry → instant counter window + combo snowball.
 *  · Surge knockback: an esc=(t/10)^2 curve applies a time-linked multiplier to every knockback (×0.75 damping early → ×2.1 explosion late).
 *    It never reads position (c), only t, so it builds a "push-pull opening → late explosion" arc without rubber-band feel-bad.
 */
export const G2: Game2Config = {
  label: 'game2',
  ATTACK_DURATION: 0.06,
  DODGE_DURATION: 0.1,
  ATTACK_COOLDOWN: 0.15,
  DODGE_COOLDOWN: 0.17,
  KNOCKBACK: 0.1,
  HALF_GAP: 0.06,
  EDGE: 1.0,
  STARTUP_MIN: 0.04,
  STARTUP_MAX: 0.18,
  TIDE_MAX: 0.45,
  TEMPO_MAX: 0.45,
  ESCALATE_EXP: 2.0,
  RIPOSTE_WINDOW: 0.35,
  RIPOSTE_MULT: 1.6,
  COMBO_STEP: 0.25,
  COMBO_MAX: 3,
  COUNTER_MULT: 1.4,
  KB_SURGE_MIN: 0.75,
  KB_SURGE_MAX: 2.1,
}

const core = makeGame3(G2)
export const create = core.create
export const step = core.step
