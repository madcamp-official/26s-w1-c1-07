import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * Shared core for Game 3 derivative versions.
 * A factory that keeps the base Game 3 logic (attack startup delay + dodge randomized each time + profile)
 * intact and only pulls out the "tunable parameters" into config, so many versions can be stamped out easily.
 *
 * Two things differ from the base.
 *  1) Dodge styles go from 2 → 3. Each time the dodge button is pressed, one of the below is assigned uniformly at random.
 *     · 'lean'  = lean the upper body back
 *     · 'waist' = bend at the waist (">" shape)
 *     · 'split' = drop low into a split to evade
 *     The style is only a visual difference and does not affect resolution.
 *  2) The base shared a single COOLDOWN for attack/dodge, but here
 *     ATTACK_COOLDOWN / DODGE_COOLDOWN are split so each can be tuned separately.
 *
 * Tunable parameters:
 *  · ATTACK_DURATION  — attack active duration (seconds)
 *  · DODGE_DURATION   — dodge invulnerability duration (seconds)
 *  · ATTACK_COOLDOWN  — attack cooldown (seconds)
 *  · DODGE_COOLDOWN   — dodge cooldown (seconds)
 *  · KNOCKBACK        — advance/push amount per resolution
 *  · STARTUP_MIN/MAX  — random startup delay range between attack button and active start
 *  · HALF_GAP, EDGE   — half the gap between the two fencers / ring edge position
 */
export interface Game2Config {
  /** Version identifier label (for render display / debugging) */
  readonly label: string
  readonly ATTACK_DURATION: number
  readonly DODGE_DURATION: number
  readonly ATTACK_COOLDOWN: number
  readonly DODGE_COOLDOWN: number
  readonly KNOCKBACK: number
  readonly HALF_GAP: number
  readonly EDGE: number
  readonly STARTUP_MIN: number
  readonly STARTUP_MAX: number
  /** Max tide ring shrink. As time passes the fall line is pulled this far inward from EDGE. Unset=0 (original behavior) */
  readonly TIDE_MAX?: number
  /** Max cooldown reduction ratio. Late-game cooldown shrinks to (1 - this value)×. Unset=0 (original behavior) */
  readonly TEMPO_MAX?: number
  /** Acceleration curve exponent esc=(t/10)^exp. Higher = gentler early, steeper late. Unset=2 */
  readonly ESCALATE_EXP?: number
  /** Time window (seconds) to fire a riposte (startup-0, cooldown-ignoring instant counter) after a successful parry. Unset=0 → riposte OFF */
  readonly RIPOSTE_WINDOW?: number
  /** Combo-1 riposte HIT knockback multiplier. Unset=1 */
  readonly RIPOSTE_MULT?: number
  /** Additional multiplier per combo step (combo2=RIPOSTE_MULT+STEP, combo3=+2·STEP…). Unset=0 */
  readonly COMBO_STEP?: number
  /** Combo (consecutive successful parry) cap. Unset=0 */
  readonly COMBO_MAX?: number
  /** Counter-hit knockback multiplier when the victim is hit during their own attack startup. Unset=1 */
  readonly COUNTER_MULT?: number
  /** esc=0 (early) knockback multiplier. <1 dampens early sub-lethal (prevents instant kill → forms rallies). Unset=1 (original behavior) */
  readonly KB_SURGE_MIN?: number
  /** esc=1 (final) knockback multiplier. >1 amplifies the late-game explosion (overlaps with tide for a one-hit kill). Unset=1 (original behavior) */
  readonly KB_SURGE_MAX?: number
}

export type DodgeStyle = 'lean' | 'waist' | 'split'

interface AttackWindow {
  press: number
  start: number
  end: number
  resolved: boolean
  /** Whether this attack was triggered as a riposte (startup-0 instant counter) */
  riposte?: boolean
}

interface DodgeWindow {
  start: number
  end: number
  resolved: boolean
  /** Motion assigned to this single dodge (randomized on each press) */
  style: DodgeStyle
}

export type G3EventKind = 'hit' | 'parry' | 'whiff'

export interface G3FeedEvent {
  kind: G3EventKind
  victim: 'P1' | 'P2'
  t: number
  /** Knockback multiplier (>1 for riposte / counter-hit). For render emphasis. Unset=1 */
  mult?: number
}

export interface FencerState {
  attacks: AttackWindow[]
  dodges: DodgeWindow[]
  attackCdUntil: number
  dodgeCdUntil: number
  /** A riposte (instant counter) can be fired until this time. Opens on a successful parry, consumed when the riposte fires */
  riposteUntil: number
  /** Consecutive successful parry combo step (riposte knockback snowball). Resets to 0 on a bad outcome (hit / getting parried / whiff) */
  combo: number
}

export interface Game2State {
  elapsed: number
  result: GameResult
  c: number
  p1: FencerState
  p2: FencerState
  feed: G3FeedEvent[]
  seed: number
  /** Current tide height (for render, 0=EDGE unchanged). Always 0 in versions that don't use it */
  waterLevel: number
}

export interface Game2Core {
  create(rand: () => number): Game2State
  step(
    state: Game2State,
    events: GameInputEvent[],
    dt: number,
  ): Game2State
}

const newFencer = (): FencerState => ({
  attacks: [],
  dodges: [],
  attackCdUntil: 0,
  dodgeCdUntil: 0,
  riposteUntil: 0,
  combo: 0,
})

function nextRand(seed: number): { u: number; seed: number } {
  const s = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return { u: s / 4294967296, seed: s }
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && a.end > b.start

/** Builds the { create, step } core of a game2 derivative version from a single config. */
export function makeGame3(cfg: Game2Config): Game2Core {
  function create(rand: () => number): Game2State {
    return {
      elapsed: 0,
      result: null,
      c: 0,
      p1: newFencer(),
      p2: newFencer(),
      feed: [],
      seed: Math.floor(rand() * 4294967296) >>> 0,
      waterLevel: 0,
    }
  }

  function step(
    state: Game2State,
    events: GameInputEvent[],
    dt: number,
  ): Game2State {
    if (state.result) return state
    const t0 = state.elapsed
    state.elapsed += dt
    const now = state.elapsed

    // Tide (ring shrink) over time + tempo acceleration (cooldown reduction).
    // If the options are unset, flood=0 and tempo=1, so it behaves exactly like the original version.
    const p = Math.min(now, GAME_DURATION) / GAME_DURATION
    const esc = Math.pow(p, cfg.ESCALATE_EXP ?? 2)
    const flood = (cfg.TIDE_MAX ?? 0) * esc
    const effEdge = Math.max(cfg.EDGE - flood, cfg.HALF_GAP + 0.02)
    const tempo = 1 - (cfg.TEMPO_MAX ?? 0) * esc
    state.waterLevel = flood

    // Surge knockback — multiplies every knockback by a time-linked factor using the same esc curve.
    // Early it dampens with sMin(<1) to prevent instant kills and form push-pull rallies; late it explodes with sMax(>1),
    // overlapping with the tide-narrowed ring so a single hit becomes lethal. If unset, surge=1 (original behavior).
    const sMin = cfg.KB_SURGE_MIN ?? 1
    const sMax = cfg.KB_SURGE_MAX ?? 1
    const surge = sMin + (sMax - sMin) * esc

    const draw = () => {
      const { u, seed } = nextRand(state.seed)
      state.seed = seed
      return u
    }

    const tryAttack = (f: FencerState, t: number) => {
      // If within the riposte window right after a successful parry, promote to a startup-0, cooldown-ignoring instant counter
      const rip = t < f.riposteUntil
      if (!rip && t < f.attackCdUntil) return
      const delay = rip ? 0 : cfg.STARTUP_MIN + (cfg.STARTUP_MAX - cfg.STARTUP_MIN) * draw()
      const start = t + delay
      f.attacks.push({ press: t, start, end: start + cfg.ATTACK_DURATION, resolved: false, riposte: rip })
      if (rip) f.riposteUntil = 0 // one-time consumption
      f.attackCdUntil = t + cfg.ATTACK_COOLDOWN * tempo
    }

    const tryDodge = (f: FencerState, t: number) => {
      if (t < f.dodgeCdUntil) return
      // On each press, assign this dodge's style uniformly at random among the 3 kinds
      const r = draw()
      const style: DodgeStyle = r < 1 / 3 ? 'lean' : r < 2 / 3 ? 'waist' : 'split'
      f.dodges.push({ start: t, end: t + cfg.DODGE_DURATION, resolved: false, style })
      f.dodgeCdUntil = t + cfg.DODGE_COOLDOWN * tempo
    }

    for (const e of events) {
      if (e.type !== 'down') continue
      const t = Math.min(Math.max(e.t, t0), now)
      if (e.code === 'KeyQ') tryAttack(state.p1, t)
      else if (e.code === 'KeyW') tryDodge(state.p1, t)
      else if (e.code === 'KeyU') tryAttack(state.p2, t)
      else if (e.code === 'KeyI') tryDodge(state.p2, t)
    }

    let delta = 0
    const knock = (victim: 'P1' | 'P2', kind: G3EventKind, mult = 1) => {
      // Apply the surge multiplier to the final knockback across the board (hit/parry/whiff/riposte all).
      const m = mult * surge
      delta += (victim === 'P1' ? -cfg.KNOCKBACK : cfg.KNOCKBACK) * m
      state.feed.push({ kind, victim, t: now, mult: m })
    }

    const comboMax = cfg.COMBO_MAX ?? 0
    const resolveAttacks = (
      att: FencerState,
      def: FencerState,
      attName: 'P1' | 'P2',
      defName: 'P1' | 'P2',
    ) => {
      for (const a of att.attacks) {
        if (a.resolved || a.end > now) continue
        a.resolved = true
        const parried = def.dodges.some((d) => overlaps(d, a))
        if (parried) {
          // Attacker knockback (same as before). Break the attacker's combo, grant the defender who parried a riposte window + combo
          knock(attName, 'parry')
          att.combo = 0
          def.riposteUntil = now + (cfg.RIPOSTE_WINDOW ?? 0)
          def.combo = Math.min(def.combo + 1, comboMax)
        } else {
          // Defender hit. If a riposte, snowball the combo multiplier; otherwise counter-hit based on whether the victim is mid-startup
          let mult = 1
          if (a.riposte) {
            const s = Math.max(0, Math.min(att.combo - 1, comboMax))
            mult = (cfg.RIPOSTE_MULT ?? 1) + (cfg.COMBO_STEP ?? 0) * s
          } else if (def.attacks.some((da) => !da.resolved && now < da.start)) {
            mult = cfg.COUNTER_MULT ?? 1
          }
          knock(defName, 'hit', mult)
          def.combo = 0
        }
      }
    }
    resolveAttacks(state.p1, state.p2, 'P1', 'P2')
    resolveAttacks(state.p2, state.p1, 'P2', 'P1')

    const resolveDodges = (def: FencerState, opp: FencerState, defName: 'P1' | 'P2') => {
      for (const d of def.dodges) {
        if (d.resolved || d.end > now) continue
        d.resolved = true
        const covered = opp.attacks.some((a) => overlaps(a, d))
        if (!covered) {
          knock(defName, 'whiff')
          def.combo = 0 // a whiffed dodge also breaks the combo
        }
      }
    }
    resolveDodges(state.p1, state.p2, 'P1')
    resolveDodges(state.p2, state.p1, 'P2')

    state.c += delta

    const prune = (f: FencerState) => {
      f.attacks = f.attacks.filter((a) => a.end > now - 0.5)
      f.dodges = f.dodges.filter((d) => d.end > now - 0.5)
    }
    prune(state.p1)
    prune(state.p2)
    state.feed = state.feed.filter((f) => now - f.t < 1.2)

    if (state.c - cfg.HALF_GAP < -effEdge) {
      state.result = 'P2'
      return state
    }
    if (state.c + cfg.HALF_GAP > effEdge) {
      state.result = 'P1'
      return state
    }

    if (now >= GAME_DURATION) {
      const EPS = 1e-9
      state.result = state.c > EPS ? 'P1' : state.c < -EPS ? 'P2' : 'DRAW'
    }
    return state
  }

  return { create, step }
}

export type { AttackWindow, DodgeWindow }
