/**
 * thrill-eval — 게임2 파생 버전의 "급박함/스릴"을 헤드리스로 정량 측정한다.
 *
 * 사람이 직접 못 치니, 양측을 규칙 기반 AI로 대신 플레이시키고(= "스스로 플레이"),
 * 프레임 단위로 위협 지표를 수집해 0~100 Thrill Score로 환산한다.
 *   · P1(공격) AI: 발사대를 P2 쪽으로 몰아가며(Q) 조준이 맞으면 발사(W)
 *   · P2(회피) AI: 임박한 로켓들의 반발장을 계산해 안전한 쪽으로 이동(U/I)
 * 같은 AI를 모든 버전에 동일 적용하므로 버전 간 비교는 공정하다.
 *
 * 실행: esbuild로 번들 후 node로 구동 (run-eval.sh 참고).
 */
import { GAME_DURATION } from '../shared/src/games/types'
import type { GameInputEvent, GameResult } from '../shared/src/games/types'

import * as v1 from '../shared/src/games/game2/logic'
import * as v2 from '../shared/src/games/game2v2/logic'
import * as v4 from '../shared/src/games/game2v4/logic'
import * as v5 from '../shared/src/games/game2v5/logic'
import * as v6 from '../shared/src/games/game2v6/logic'
import * as v7 from '../shared/src/games/game2v7/logic'
import * as v8 from '../shared/src/games/game2v8/logic'
import * as v9 from '../shared/src/games/game2v9/logic'
import * as v10 from '../shared/src/games/game2v10/logic'
import * as v11 from '../shared/src/games/game2v11/logic'
import * as v12 from '../shared/src/games/game2v12/logic'
import * as v13 from '../shared/src/games/game2v13/logic'
// NEW_VERSION_IMPORTS

interface GeomCfg {
  W: number
  H: number
  MARGIN: number
  LAUNCHER_Y: number
  ROCKET_W: number
  ROCKET_H: number
  P2_Y: number
  P2_W: number
  P2_H: number
  ROCKET_SPEED_MIN: number
  ROCKET_SPEED_MAX: number
}

interface AnyState {
  elapsed: number
  result: GameResult
  launcherX: number
  launcherDir: 1 | -1
  p2X: number
  rockets: Array<{ x: number; y: number; vy: number; vx?: number }>
  cooldown: number
}

interface VersionMod {
  create(rand: () => number): AnyState
  step(state: AnyState, events: GameInputEvent[], dt: number): AnyState
  cfg: GeomCfg
}

const REGISTRY: Record<string, VersionMod> = {
  ver1: { create: v1.create as never, step: v1.step as never, cfg: v1.G2 as never },
  ver2: { create: v2.create as never, step: v2.step as never, cfg: v2.G2V2 as never },
  ver4: { create: v4.create as never, step: v4.step as never, cfg: v4.G2V4 as never },
  ver5: { create: v5.create as never, step: v5.step as never, cfg: v5.G2V5 as never },
  ver6: { create: v6.create as never, step: v6.step as never, cfg: v6.G2V6 as never },
  ver7: { create: v7.create as never, step: v7.step as never, cfg: v7.G2V7 as never },
  ver8: { create: v8.create as never, step: v8.step as never, cfg: v8.G2V8 as never },
  ver9: { create: v9.create as never, step: v9.step as never, cfg: v9.G2V9 as never },
  ver10: { create: v10.create as never, step: v10.step as never, cfg: v10.G2V10 as never },
  ver11: { create: v11.create as never, step: v11.step as never, cfg: v11.G2V11 as never },
  ver12: { create: v12.create as never, step: v12.step as never, cfg: v12.G2V12 as never },
  ver13: { create: v13.create as never, step: v13.step as never, cfg: v13.G2V13 as never },
  // NEW_VERSION_REGISTRY
}

/* ---------- 결정적 RNG (재현성) ---------- */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DT = 1 / 60
const REACT = 0.3 // 임박 판정 지평선(초)
const NEAR_PX = 30 // 니어미스 판정 여유(px)
const P2_LATENCY = 0.12 // P2 반응 지연(초) — 사람 한계 모사. 결정 갱신 주기.

interface SimMetrics {
  fired: number // 발사된 로켓 수
  vySum: number // 로켓 vy 합
  vyN: number
  fallTimeSum: number // (P2_Y-LAUNCHER_Y)/vy 합
  frames: number
  rocketCountSum: number // 프레임별 화면 내 로켓 수 합
  coverageSum: number // 프레임별 레인 위협 커버리지 합
  nearMiss: number // 니어미스 수(피격 제외)
  simTime: number
  p1Win: boolean
  crossPerSecVar: number // 초당 통과 수의 변동성(에스컬레이션)
  killCaptured: boolean
  killElapsed: number
  killGen: number
  killVx: number
  killDx: number
  hitsTaken: number // P2가 이 판에서 맞은 총 횟수(HP 소모). HP 없는 버전은 0/1
}

/** 한 판(한 시드) 시뮬레이션 */
function simulate(mod: VersionMod, seed: number): SimMetrics {
  const rng = mulberry32(seed)
  const state = mod.create(rng)
  const cfg = mod.cfg
  const laneW = cfg.W - 2 * cfg.MARGIN
  const hitHalf = cfg.P2_W / 2 + cfg.ROCKET_W / 2
  const fallDist = cfg.P2_Y - cfg.LAUNCHER_Y
  const expVy = (cfg.ROCKET_SPEED_MIN + cfg.ROCKET_SPEED_MAX) / 2

  // P2 held state
  let heldLeft = false
  let heldRight = false
  // rocket bookkeeping
  const seen = new WeakSet<object>()
  const crossed = new WeakSet<object>()
  const vxPrev = new WeakMap<object, number>() // 프레임간 vx → 가속 추정(휘는 궤적 인지)
  let prevP2Vel = 0
  let prevP2X = state.p2X

  const m: SimMetrics = {
    fired: 0, vySum: 0, vyN: 0, fallTimeSum: 0, frames: 0,
    rocketCountSum: 0, coverageSum: 0, nearMiss: 0, simTime: 0,
    p1Win: false, crossPerSecVar: 0,
    killCaptured: false, killElapsed: 0, killGen: -1, killVx: 0, killDx: 0,
    hitsTaken: 0,
  }
  const hp0 = (state as unknown as { hp?: number }).hp ?? 1
  const crossPerSecBuckets: number[] = []
  let curBucket = 0
  let bucketT = 0

  let dirDecision = 0
  let decisionClock = 0
  const maxSteps = Math.ceil((GAME_DURATION + 0.2) / DT)
  for (let i = 0; i < maxSteps; i++) {
    if (state.result) break
    const events: GameInputEvent[] = []
    const t = state.elapsed
    const RSPEED = (state as unknown as { rocketSpeed?: number }).rocketSpeed // ver1 fallback
    const evy = (r: { vy: number }) => r.vy || RSPEED || expVy

    /* ---- P2 (dodger) AI: 반발장 회피 + 반응 지연 + 가속 인지 ----
     * 임박 위협의 예측 도달점에서 밀려나며, 대칭 협공이면 반발이 상쇄돼 '가운데 빈틈'으로
     * 흘러든다(가운데가 안전한 패턴에 자연 대응). 예측은 2차(가속)까지 반영. */
    decisionClock -= DT
    if (decisionClock <= 0) {
      decisionClock = P2_LATENCY
      let repel = 0
      let anyThreat = false
      for (const r of state.rockets) {
        const vy = evy(r)
        if (vy <= 0 || r.y >= cfg.P2_Y) continue
        const tImp = (cfg.P2_Y - r.y) / vy
        if (tImp <= 0 || tImp > 0.42) continue // 늦게 보이는 위협만 반응(현실적 긴박)
        // 도달점 2차 예측: 위치 + 속도 + 측정가속(휘어드는 궤적 인지). 등속은 1차와 동일.
        const rvx = r.vx || 0
        const ax = (rvx - (vxPrev.has(r) ? (vxPrev.get(r) as number) : rvx)) / DT
        const impactX = r.x + rvx * tImp + 0.5 * Math.max(-6000, Math.min(6000, ax)) * tImp * tImp
        const dx = state.p2X - impactX
        const adx = Math.abs(dx)
        if (adx > laneW * 0.6) continue
        anyThreat = true
        const urgency = 1 / (tImp + 0.05)
        const prox = 1 / (adx + 12)
        repel += Math.sign(dx || 1) * urgency * prox
      }
      if (anyThreat && Math.abs(repel) > 1e-6) {
        dirDecision = repel > 0 ? 1 : -1
      } else {
        // 위협 없음/대칭 상쇄 → 중앙(=대칭 패턴의 빈틈)으로 복귀
        const dc = cfg.W / 2 - state.p2X
        dirDecision = Math.abs(dc) > 40 ? Math.sign(dc) : 0
      }
    }
    let desiredDir = dirDecision
    // 벽 충돌은 지연 없이 즉시 회피(물리적 반사)
    if (desiredDir < 0 && state.p2X <= cfg.MARGIN + 2) desiredDir = 1
    if (desiredDir > 0 && state.p2X >= cfg.W - cfg.MARGIN - 2) desiredDir = -1

    const wantLeft = desiredDir < 0
    const wantRight = desiredDir > 0
    if (wantLeft !== heldLeft) {
      events.push({ code: 'KeyU', type: wantLeft ? 'down' : 'up', t })
      heldLeft = wantLeft
    }
    if (wantRight !== heldRight) {
      events.push({ code: 'KeyI', type: wantRight ? 'down' : 'up', t })
      heldRight = wantRight
    }

    /* ---- P1 (attacker) AI: P2 위로 몰아가며 쿨마다 탄막 발사 ---- */
    const leadT = fallDist / expVy
    const predP2X = state.p2X + prevP2Vel * leadT
    const aimErr = predP2X - state.launcherX
    // 방향 몰기: 발사대를 P2 예측 위치 쪽으로 (조준 집중 → 압박)
    if (Math.abs(aimErr) > 60 && Math.sign(aimErr) !== state.launcherDir) {
      events.push({ code: 'KeyQ', type: 'down', t })
    }
    // 공격적 탄막: 쿨 준비되면 항상 발사 (짧은 쿨타임이 그대로 밀도로 반영됨)
    if (state.cooldown <= 1e-9) {
      events.push({ code: 'KeyW', type: 'down', t })
    }

    // step
    const wasResult = state.result
    mod.step(state, events, DT)
    if (!wasResult && state.result === 'P1' && !m.killCaptured) {
      m.killCaptured = true
      m.killElapsed = state.elapsed
      // 겹친 로켓 찾아 kill 정보 기록
      for (const r of state.rockets) {
        const rx0 = r.x - cfg.ROCKET_W / 2
        const rx1 = r.x + cfg.ROCKET_W / 2
        if (
          rx0 < state.p2X + cfg.P2_W / 2 &&
          rx1 > state.p2X - cfg.P2_W / 2 &&
          r.y < cfg.P2_Y + cfg.P2_H &&
          r.y + cfg.ROCKET_H > cfg.P2_Y
        ) {
          const rr = r as unknown as { gen?: number; vx?: number }
          m.killGen = rr.gen ?? -1
          m.killVx = Math.abs(rr.vx ?? 0)
          m.killDx = Math.abs(r.x - state.p2X)
          break
        }
      }
    }

    /* ---- 지표 수집 ---- */
    m.frames++
    m.simTime = state.elapsed
    // 새 로켓 집계
    for (const r of state.rockets) {
      if (!seen.has(r)) {
        seen.add(r)
        m.fired++
        const vy = evy(r)
        m.vySum += vy
        m.vyN++
        m.fallTimeSum += fallDist / Math.max(vy, 1)
      }
    }
    m.rocketCountSum += state.rockets.length
    // 커버리지: 임박 로켓들의 위험구간 합집합 / 레인폭
    const intervals: Array<[number, number]> = []
    for (const r of state.rockets) {
      const vy = evy(r)
      if (vy <= 0 || r.y >= cfg.P2_Y) continue
      const tImp = (cfg.P2_Y - r.y) / vy
      if (tImp <= 0 || tImp > REACT) continue
      intervals.push([r.x - hitHalf, r.x + hitHalf])
    }
    m.coverageSum += unionLen(intervals, cfg.MARGIN, cfg.W - cfg.MARGIN) / laneW
    // 니어미스: P2_Y 밴드를 통과하는 로켓의 수평거리
    for (const r of state.rockets) {
      if (crossed.has(r)) continue
      if (r.y + cfg.ROCKET_H >= cfg.P2_Y && r.y <= cfg.P2_Y + cfg.P2_H) {
        crossed.add(r)
        const d = Math.abs(r.x - state.p2X)
        if (d > hitHalf && d <= hitHalf + NEAR_PX) m.nearMiss++
        curBucket++
      }
    }
    // 초당 통과 버킷
    bucketT += DT
    if (bucketT >= 1) {
      crossPerSecBuckets.push(curBucket)
      curBucket = 0
      bucketT = 0
    }

    prevP2Vel = (state.p2X - prevP2X) / DT
    prevP2X = state.p2X
    for (const r of state.rockets) vxPrev.set(r, r.vx || 0) // 다음 프레임 가속 추정용
  }
  m.p1Win = state.result === 'P1'
  const finalHp = (state as unknown as { hp?: number }).hp ?? (m.p1Win ? 0 : hp0)
  m.hitsTaken = hp0 - finalHp
  if (crossPerSecBuckets.length > 1) {
    const mean = crossPerSecBuckets.reduce((a, b) => a + b, 0) / crossPerSecBuckets.length
    const varr = crossPerSecBuckets.reduce((a, b) => a + (b - mean) ** 2, 0) / crossPerSecBuckets.length
    m.crossPerSecVar = mean > 0 ? Math.sqrt(varr) / mean : 0 // 변동계수
  }
  return m
}

/** [lo,hi] 안에서 구간들의 합집합 길이 */
function unionLen(intervals: Array<[number, number]>, lo: number, hi: number): number {
  if (!intervals.length) return 0
  const clip = intervals
    .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0])
  if (!clip.length) return 0
  let total = 0
  let [cs, ce] = clip[0]
  for (let i = 1; i < clip.length; i++) {
    const [a, b] = clip[i]
    if (a > ce) {
      total += ce - cs
      cs = a
      ce = b
    } else if (b > ce) ce = b
  }
  total += ce - cs
  return total
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

interface Report {
  id: string
  seeds: number
  cadence: number // rockets/s
  speed: number // mean vy
  fallTime: number // s (작을수록 급박)
  density: number // mean rockets on screen
  coverage: number // 0..1
  nearMiss: number // per second
  volatility: number // 변동계수
  hitRate: number // P1 승률
  thrill: number // 0..100
  avgHits: number // 판당 P2가 맞은 평균 횟수(HP 소모)
  hitsStd: number // 맞은 횟수 표준편차(운/변동성 지표 — 작을수록 결과가 안정적=형평)
  sub: Record<string, number>
}

function evaluate(id: string, seeds: number): Report {
  const mod = REGISTRY[id]
  if (!mod) throw new Error(`unknown version: ${id}`)
  let cadence = 0, speed = 0, fallTime = 0, density = 0, coverage = 0
  let nearMiss = 0, vol = 0, wins = 0, vyN = 0, speedSum = 0, fallSum = 0
  const hitsArr: number[] = []
  for (let s = 0; s < seeds; s++) {
    const m = simulate(mod, 1000 + s * 2654435761)
    const dur = Math.max(m.simTime, 0.5)
    cadence += m.fired / dur
    speedSum += m.vySum
    vyN += m.vyN
    fallSum += m.fallTimeSum
    density += m.rocketCountSum / Math.max(m.frames, 1)
    coverage += m.coverageSum / Math.max(m.frames, 1)
    nearMiss += m.nearMiss / dur
    vol += m.crossPerSecVar
    hitsArr.push(m.hitsTaken)
    if (m.p1Win) wins++
  }
  const avgHits = hitsArr.reduce((a, b) => a + b, 0) / seeds
  const hitsStd = Math.sqrt(hitsArr.reduce((a, b) => a + (b - avgHits) ** 2, 0) / seeds)
  cadence /= seeds
  speed = vyN > 0 ? speedSum / vyN : 0
  fallTime = vyN > 0 ? fallSum / vyN : 0
  density /= seeds
  coverage /= seeds
  nearMiss /= seeds
  vol /= seeds
  const hitRate = wins / seeds

  // 정규화 → 가중합
  const Cn = clamp01(cadence / 8)
  const Sn = clamp01((speed - 300) / (1600 - 300))
  const Rn = clamp01((0.6 - fallTime) / (0.6 - 0.18))
  const Dn = clamp01(density / 6)
  const Vn = clamp01(coverage / 0.5)
  const Nn = clamp01(nearMiss / 4)
  const Xn = clamp01(vol / 0.8)
  const Bn = 1 - Math.min(1, Math.abs(hitRate - 0.6) / 0.6)
  const thrill =
    100 *
    (0.16 * Cn + 0.16 * Sn + 0.16 * Rn + 0.12 * Dn + 0.14 * Vn + 0.14 * Nn + 0.06 * Xn + 0.06 * Bn)

  return {
    id, seeds, cadence, speed, fallTime, density, coverage, nearMiss,
    volatility: vol, hitRate, thrill, avgHits, hitsStd,
    sub: { Cn, Sn, Rn, Dn, Vn, Nn, Xn, Bn },
  }
}

export { evaluate, REGISTRY, simulate }
export type { Report }

/* ---------- main (CLI) ---------- */
function runCli() {
  const argv = process.argv.slice(2)
  const seeds = Number(argv.find((a) => a.startsWith('--seeds='))?.split('=')[1] ?? 250)
  const ids = argv.filter((a) => !a.startsWith('--'))
  const targets = ids.length ? ids : Object.keys(REGISTRY)
  const reports = targets.map((id) => evaluate(id, seeds))
  console.log(JSON.stringify(reports, null, 2))
}

// 스윕 스크립트가 import할 때는 CLI를 돌리지 않는다.
if (!process.env.THRILL_NOCLI) runCli()
