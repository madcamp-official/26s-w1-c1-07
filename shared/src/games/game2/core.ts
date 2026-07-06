import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * 게임3 파생 버전 공용 코어.
 * 게임3 기본 로직(공격 시동 딜레이 + 회피 매번 랜덤 + 프로필)을 그대로 두고,
 * "조절 대상 파라미터"만 config로 뽑아 여러 버전을 손쉽게 찍어내기 위한 팩토리다.
 *
 * 기본 대비 두 가지가 달라졌다.
 *  1) 회피 스타일이 2종 → 3종. 회피 버튼을 누를 때마다 아래에서 하나를 균등 랜덤 배정한다.
 *     · 'lean'  = 상반신 젖히기
 *     · 'waist' = 허리 꺾기 (">" 모양)
 *     · 'split' = 다리찢기로 몸 낮춰 피하기
 *     스타일은 시각 표현 차이일 뿐 판정에는 영향을 주지 않는다.
 *  2) 기본은 공격/회피가 COOLDOWN 하나를 공유했지만, 여기서는
 *     ATTACK_COOLDOWN / DODGE_COOLDOWN 을 분리해 각각 조절할 수 있다.
 *
 * 조절 파라미터:
 *  · ATTACK_DURATION  — 공격 판정 지속 시간(초)
 *  · DODGE_DURATION   — 회피 무적 지속 시간(초)
 *  · ATTACK_COOLDOWN  — 공격 쿨타임(초)
 *  · DODGE_COOLDOWN   — 회피 쿨타임(초)
 *  · KNOCKBACK        — 판정 1회당 전진/밀리는 정도
 *  · STARTUP_MIN/MAX  — 공격 버튼~판정 시작 사이의 랜덤 시동 딜레이 범위
 *  · HALF_GAP, EDGE   — 두 선수 간격 절반 / 링 가장자리 위치
 */
export interface Game2Config {
  /** 버전 식별 라벨(렌더 표기·디버깅용) */
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
  /** 밀물 최대 링축소량. 시간이 지날수록 낙사선이 EDGE에서 이만큼 안쪽으로 당겨진다. 미지정=0(기존 동작) */
  readonly TIDE_MAX?: number
  /** 쿨타임 최대 감소비율. 후반 쿨타임이 (1-이 값)배까지 줄어든다. 미지정=0(기존 동작) */
  readonly TEMPO_MAX?: number
  /** 가속곡선 지수 esc=(t/10)^exp. 클수록 초반 완만·후반 급격. 미지정=2 */
  readonly ESCALATE_EXP?: number
  /** 성공 패링 후 리포스트(시동0·쿨무시 즉발 반격)를 지를 수 있는 시간(초). 미지정=0 → 리포스트 OFF */
  readonly RIPOSTE_WINDOW?: number
  /** 콤보1 리포스트 HIT 넉백 배율. 미지정=1 */
  readonly RIPOSTE_MULT?: number
  /** 콤보 단계당 추가 배율(콤보2=RIPOSTE_MULT+STEP, 콤보3=+2·STEP…). 미지정=0 */
  readonly COMBO_STEP?: number
  /** 콤보(연속 성공 패링) 상한. 미지정=0 */
  readonly COMBO_MAX?: number
  /** 피해자가 자기 공격 시동 중일 때 맞으면 카운터히트 넉백 배율. 미지정=1 */
  readonly COUNTER_MULT?: number
  /** esc=0(초반) 넉백 배율. <1이면 초반 서브리설 댐핑(즉사 방지→랠리 형성). 미지정=1(기존 동작) */
  readonly KB_SURGE_MIN?: number
  /** esc=1(막판) 넉백 배율. >1이면 막판 폭발 증폭(tide와 겹쳐 한 방 치명). 미지정=1(기존 동작) */
  readonly KB_SURGE_MAX?: number
}

export type DodgeStyle = 'lean' | 'waist' | 'split'

interface AttackWindow {
  press: number
  start: number
  end: number
  resolved: boolean
  /** 이 공격이 리포스트(시동0 즉발 반격)로 발동됐는지 */
  riposte?: boolean
}

interface DodgeWindow {
  start: number
  end: number
  resolved: boolean
  /** 이 회피 1회에 배정된 모션(누를 때마다 랜덤) */
  style: DodgeStyle
}

export type G3EventKind = 'hit' | 'parry' | 'whiff'

export interface G3FeedEvent {
  kind: G3EventKind
  victim: 'P1' | 'P2'
  t: number
  /** 넉백 배율(리포스트·카운터히트면 >1). 렌더 강조용. 미지정=1 */
  mult?: number
}

export interface FencerState {
  attacks: AttackWindow[]
  dodges: DodgeWindow[]
  attackCdUntil: number
  dodgeCdUntil: number
  /** 이 시각 전까지 리포스트(즉발 반격)를 지를 수 있다. 성공 패링 시 열리고, 리포스트 발동 시 소비 */
  riposteUntil: number
  /** 연속 성공 패링 콤보 단계(리포스트 넉백 스노우볼). 나쁜 결과(피격/패링당함/휘프) 시 0 리셋 */
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
  /** 현재 밀물 높이(렌더용, 0=EDGE 그대로). 미사용 버전은 항상 0 */
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

/** config 하나로 game2 파생 버전의 { create, step } 코어를 만든다. */
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

    // 시간 경과에 따른 밀물(링 축소) + 템포 가속(쿨타임 감소).
    // 옵션 미지정이면 flood=0, tempo=1 이므로 기존 버전과 완전히 동일하게 동작한다.
    const p = Math.min(now, GAME_DURATION) / GAME_DURATION
    const esc = Math.pow(p, cfg.ESCALATE_EXP ?? 2)
    const flood = (cfg.TIDE_MAX ?? 0) * esc
    const effEdge = Math.max(cfg.EDGE - flood, cfg.HALF_GAP + 0.02)
    const tempo = 1 - (cfg.TEMPO_MAX ?? 0) * esc
    state.waterLevel = flood

    // 서지-넉백 — 같은 esc 곡선으로 모든 넉백에 시간연동 배율을 곱한다.
    // 초반은 sMin(<1)로 댐핑해 즉사를 막아 밀당 랠리를 만들고, 막판은 sMax(>1)로 폭발시켜
    // tide가 좁힌 링과 겹쳐 한 방이 치명이 되게 한다. 미지정이면 surge=1(기존 동작).
    const sMin = cfg.KB_SURGE_MIN ?? 1
    const sMax = cfg.KB_SURGE_MAX ?? 1
    const surge = sMin + (sMax - sMin) * esc

    const draw = () => {
      const { u, seed } = nextRand(state.seed)
      state.seed = seed
      return u
    }

    const tryAttack = (f: FencerState, t: number) => {
      // 성공 패링 직후 리포스트창 안이면 시동0·쿨무시 즉발 반격으로 승격
      const rip = t < f.riposteUntil
      if (!rip && t < f.attackCdUntil) return
      const delay = rip ? 0 : cfg.STARTUP_MIN + (cfg.STARTUP_MAX - cfg.STARTUP_MIN) * draw()
      const start = t + delay
      f.attacks.push({ press: t, start, end: start + cfg.ATTACK_DURATION, resolved: false, riposte: rip })
      if (rip) f.riposteUntil = 0 // 1회성 소비
      f.attackCdUntil = t + cfg.ATTACK_COOLDOWN * tempo
    }

    const tryDodge = (f: FencerState, t: number) => {
      if (t < f.dodgeCdUntil) return
      // 누를 때마다 이 회피의 스타일을 3종 중 균등 랜덤 배정
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
      // 서지 배율을 최종 넉백에 일괄 적용(hit/parry/whiff/ri포스트 모두).
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
          // 공격자 넉백(기존과 동일). 공격자 콤보 끊기고, 막아낸 방어자에게 리포스트창+콤보 부여
          knock(attName, 'parry')
          att.combo = 0
          def.riposteUntil = now + (cfg.RIPOSTE_WINDOW ?? 0)
          def.combo = Math.min(def.combo + 1, comboMax)
        } else {
          // 방어자 피격. 리포스트면 콤보 배율 스노우볼, 아니면 피해자 시동중 여부로 카운터히트
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
          def.combo = 0 // 헛회피도 콤보 끊김
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
