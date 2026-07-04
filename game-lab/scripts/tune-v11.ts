/**
 * ver11 검토기 — 두 안을 정량 비교:
 *  (1) 탄 수 3개  (2) 탄 수 4개 + 쿨타임 상향
 * ver10 기준 hitRate 0.68(P1 과유리)을 '적절한 수준'(≈0.50~0.58, 살짝 P2 여유)으로.
 * count별로 fair 밴드 내 최고 Thrill을 뽑아 옆에 놓고 비교한다.
 */
import { evaluate } from './thrill-eval'
import { G2V11 } from '../shared/src/games/game2v11/logic'

const cfg = G2V11 as unknown as Record<string, number>
const SEEDS = 500
const TARGET = 0.54 // 원하는 밸런스 중심(살짝 P2 여유)

interface Row {
  count: number
  cd: number
  spread: number
  thrill: number
  hit: number
  cover: number
  near: number
  dens: number
  vol: number
}

const rows: Row[] = []
for (const count of [3, 4]) {
  for (const cd of [0.18, 0.24, 0.3]) {
    for (const spread of [14, 18, 22, 26]) {
      cfg.BULLET_COUNT = count
      cfg.FIRE_COOLDOWN = cd
      cfg.SPREAD_DEG = spread
      const r = evaluate('ver11', SEEDS)
      rows.push({
        count, cd, spread,
        thrill: r.thrill, hit: r.hitRate, cover: r.coverage,
        near: r.nearMiss, dens: r.density, vol: r.volatility,
      })
    }
  }
}

function bestFor(count: number) {
  // 목표(~0.54)에 충분히 가까운(±0.06) 것 중 Thrill 최대
  const near = rows.filter((r) => r.count === count && Math.abs(r.hit - TARGET) <= 0.06)
  if (near.length) return near.sort((a, b) => b.thrill - a.thrill)[0]
  return [...rows]
    .filter((r) => r.count === count)
    .sort((a, b) => Math.abs(a.hit - TARGET) - Math.abs(b.hit - TARGET) || b.thrill - a.thrill)[0]
}

for (const count of [3, 4]) {
  console.log(`\n===== 탄 ${count}발: hit vs spread/cd =====`)
  for (const r of rows
    .filter((x) => x.count === count)
    .sort((a, b) => a.spread - b.spread || a.cd - b.cd)) {
    const fair = r.hit >= 0.46 && r.hit <= 0.6 ? ' ★' : ''
    console.log(
      `spread=${r.spread} cd=${r.cd.toFixed(2)} | thrill=${r.thrill.toFixed(1)} hit=${r.hit.toFixed(2)} near=${r.near.toFixed(2)} cover=${r.cover.toFixed(2)} dens=${r.dens.toFixed(1)}${fair}`,
    )
  }
}

const b3 = bestFor(3)
const b4 = bestFor(4)
console.log('\n================ 결론 비교 ================')
console.log(`(1) 3발 최적: cd=${b3.cd} spread=${b3.spread} → thrill=${b3.thrill.toFixed(1)} hit=${b3.hit.toFixed(2)} near=${b3.near.toFixed(2)} cover=${b3.cover.toFixed(2)}`)
console.log(`(2) 4발+쿨: cd=${b4.cd} spread=${b4.spread} → thrill=${b4.thrill.toFixed(1)} hit=${b4.hit.toFixed(2)} near=${b4.near.toFixed(2)} cover=${b4.cover.toFixed(2)}`)
console.log(`\n>>> WINNER: ${b3.thrill >= b4.thrill ? '(1) 3발' : '(2) 4발+쿨'}`)
console.log('BEST3:', JSON.stringify(b3))
console.log('BEST4:', JSON.stringify(b4))
