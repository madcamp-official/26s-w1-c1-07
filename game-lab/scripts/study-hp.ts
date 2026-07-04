/**
 * ver12 HP 형평성 3-loop 연구.
 *  Loop1: ver11 난이도에 HP 1/3/5를 얹어 '원리' 확인(HP만 주면 P2 과유리 → 난이도 복원 필요).
 *  Loop2: 난이도(탄수·스프레드·쿨) × HP{3,5}를 스윕해 P2승률≈0.50 되는 지점을 찾고,
 *         같은 균형에서 HP 3 vs 5의 급박함(thrill)·운의존(hitsStd)을 비교.
 *  Loop3: HP=4와 i-frame 대안까지 확인해 최종 형평 지점을 고른다.
 */
import { evaluate } from './thrill-eval'
import { G2V12 } from '../shared/src/games/game2v12/logic'

const cfg = G2V12 as unknown as Record<string, number>
const SEEDS = 500

function set(o: Record<string, number>) {
  for (const k in o) cfg[k] = o[k]
}
function run() {
  const r = evaluate('ver12', SEEDS)
  return {
    p2Win: 1 - r.hitRate,
    avgHits: r.avgHits,
    hitsStd: r.hitsStd,
    thrill: r.thrill,
    near: r.nearMiss,
    dens: r.density,
    cover: r.coverage,
  }
}
const fmt = (x: { p2Win: number; avgHits: number; hitsStd: number; thrill: number; near: number; dens: number }) =>
  `P2win=${x.p2Win.toFixed(2)} avgHits=${x.avgHits.toFixed(2)} hitsStd=${x.hitsStd.toFixed(2)} thrill=${x.thrill.toFixed(1)} near=${x.near.toFixed(2)} dens=${x.dens.toFixed(1)}`

// ============ LOOP 1 ============
console.log('===== LOOP 1: ver11 난이도(3발·20°·쿨0.20)에 HP 얹기 =====')
set({ BULLET_COUNT: 3, SPREAD_DEG: 20, FIRE_COOLDOWN: 0.2, IFRAME_TIME: 0.45 })
for (const hp of [1, 3, 5]) {
  set({ MAX_HP: hp })
  console.log(`HP=${hp}: ${fmt(run())}`)
}

// ============ LOOP 2 ============
console.log('\n===== LOOP 2: 난이도 복원 × HP{3,5} → P2승률≈0.50 co-tuning =====')
set({ IFRAME_TIME: 0.45 })
interface Cand { count: number; spread: number; cd: number; hp: number; p2Win: number; thrill: number; avgHits: number; hitsStd: number; near: number; dens: number }
const cands: Cand[] = []
for (const hp of [3, 5]) {
  for (const count of [3, 4, 5]) {
    for (const spread of [26, 36, 46]) {
      for (const cd of [0.12, 0.16, 0.22]) {
        set({ MAX_HP: hp, BULLET_COUNT: count, SPREAD_DEG: spread, FIRE_COOLDOWN: cd })
        const x = run()
        cands.push({ count, spread, cd, hp, p2Win: x.p2Win, thrill: x.thrill, avgHits: x.avgHits, hitsStd: x.hitsStd, near: x.near, dens: x.dens })
      }
    }
  }
}
for (const hp of [3, 5]) {
  const near50 = cands
    .filter((c) => c.hp === hp && Math.abs(c.p2Win - 0.5) <= 0.05)
    .sort((a, b) => b.thrill - a.thrill)
  console.log(`\n--- HP=${hp}: 균형(P2win 0.45~0.55) ${near50.length}개 · thrill 상위 5 ---`)
  for (const c of near50.slice(0, 5)) {
    console.log(
      `count=${c.count} spread=${c.spread} cd=${c.cd} | P2win=${c.p2Win.toFixed(2)} thrill=${c.thrill.toFixed(1)} avgHits=${c.avgHits.toFixed(2)} hitsStd=${c.hitsStd.toFixed(2)} near=${c.near.toFixed(2)} dens=${c.dens.toFixed(1)}`,
    )
  }
}
function bestBalanced(hp: number): Cand | undefined {
  const band = cands.filter((c) => c.hp === hp && Math.abs(c.p2Win - 0.5) <= 0.05)
  if (band.length) return band.sort((a, b) => b.thrill - a.thrill)[0]
  return cands.filter((c) => c.hp === hp).sort((a, b) => Math.abs(a.p2Win - 0.5) - Math.abs(b.p2Win - 0.5))[0]
}
const b3 = bestBalanced(3)!
const b5 = bestBalanced(5)!
console.log('\n--- 균형점 비교 (같은 ~50%에서 HP3 vs HP5) ---')
console.log(`HP=3 best: count=${b3.count} spread=${b3.spread} cd=${b3.cd} → thrill=${b3.thrill.toFixed(1)} avgHits=${b3.avgHits.toFixed(2)} hitsStd=${b3.hitsStd.toFixed(2)} (상대변동 ${(b3.hitsStd / b3.hp).toFixed(2)})`)
console.log(`HP=5 best: count=${b5.count} spread=${b5.spread} cd=${b5.cd} → thrill=${b5.thrill.toFixed(1)} avgHits=${b5.avgHits.toFixed(2)} hitsStd=${b5.hitsStd.toFixed(2)} (상대변동 ${(b5.hitsStd / b5.hp).toFixed(2)})`)

// ============ LOOP 3 ============
console.log('\n===== LOOP 3: HP=4 및 i-frame 대안 점검 =====')
// HP=4를 HP=5의 난이도에서 확인(중간값이 더 팽팽한지)
for (const hp of [3, 4, 5]) {
  set({ MAX_HP: hp, BULLET_COUNT: b5.count, SPREAD_DEG: b5.spread, FIRE_COOLDOWN: b5.cd, IFRAME_TIME: 0.45 })
  console.log(`(HP5난이도) HP=${hp}: ${fmt(run())}`)
}
console.log('--- i-frame 길이 영향 (HP=5, HP5난이도) ---')
for (const ifr of [0.3, 0.45, 0.6]) {
  set({ MAX_HP: 5, BULLET_COUNT: b5.count, SPREAD_DEG: b5.spread, FIRE_COOLDOWN: b5.cd, IFRAME_TIME: ifr })
  console.log(`iframe=${ifr}: ${fmt(run())}`)
}

console.log('\n>>> b3:', JSON.stringify(b3))
console.log('>>> b5:', JSON.stringify(b5))
