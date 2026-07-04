/**
 * ver12 확정 — ver11의 '조준 3발 부채꼴' 정체성을 유지하면서 HP=3로 ~50% 균형을 맞추는
 * 난이도(spread·cd)를 정밀 탐색. 같은 난이도에서 HP 3/4/5도 비교 표로 제시.
 */
import { evaluate } from './thrill-eval'
import { G2V12 } from '../shared/src/games/game2v12/logic'

const cfg = G2V12 as unknown as Record<string, number>
const SEEDS = 800
const set = (o: Record<string, number>) => { for (const k in o) cfg[k] = o[k] }
const run = () => {
  const r = evaluate('ver12', SEEDS)
  return { p2Win: 1 - r.hitRate, thrill: r.thrill, avgHits: r.avgHits, hitsStd: r.hitsStd, near: r.nearMiss, dens: r.density }
}

console.log('=== 3발 유지 · HP=3 · 균형(spread×cd) 탐색 ===')
interface C { spread: number; cd: number; p2Win: number; thrill: number; avgHits: number; hitsStd: number; near: number }
const rows: C[] = []
set({ BULLET_COUNT: 3, MAX_HP: 3, IFRAME_TIME: 0.45 })
for (const spread of [22, 26, 30, 34]) {
  for (const cd of [0.13, 0.15, 0.17, 0.2]) {
    set({ SPREAD_DEG: spread, FIRE_COOLDOWN: cd })
    const x = run()
    rows.push({ spread, cd, ...x })
  }
}
for (const r of rows.sort((a, b) => a.spread - b.spread || a.cd - b.cd)) {
  const bal = Math.abs(r.p2Win - 0.5) <= 0.04 ? ' ★' : ''
  console.log(`spread=${r.spread} cd=${r.cd.toFixed(2)} | P2win=${r.p2Win.toFixed(2)} thrill=${r.thrill.toFixed(1)} avgHits=${r.avgHits.toFixed(2)} hitsStd=${r.hitsStd.toFixed(2)} near=${r.near.toFixed(2)}${bal}`)
}
const best = rows.filter((r) => Math.abs(r.p2Win - 0.5) <= 0.05).sort((a, b) => b.thrill - a.thrill)[0]
  ?? rows.sort((a, b) => Math.abs(a.p2Win - 0.5) - Math.abs(b.p2Win - 0.5))[0]
console.log(`\n>>> 확정 난이도(3발): spread=${best.spread} cd=${best.cd}`)

console.log('\n=== 같은 난이도에서 HP 3/4/5 비교 ===')
set({ BULLET_COUNT: 3, SPREAD_DEG: best.spread, FIRE_COOLDOWN: best.cd, IFRAME_TIME: 0.45 })
for (const hp of [1, 3, 4, 5]) {
  set({ MAX_HP: hp })
  const x = run()
  console.log(`HP=${hp}: P2win=${x.p2Win.toFixed(2)} thrill=${x.thrill.toFixed(1)} avgHits=${x.avgHits.toFixed(2)} hitsStd=${x.hitsStd.toFixed(2)} near=${x.near.toFixed(2)}`)
}
console.log('\nBEST:', JSON.stringify(best))
