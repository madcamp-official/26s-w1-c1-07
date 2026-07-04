/** ver11 확정용 — 3발 안을 고배수 시드로 정밀 탐색해 hit≈0.52~0.56 안정 지점을 찾는다. */
import { evaluate } from './thrill-eval'
import { G2V11 } from '../shared/src/games/game2v11/logic'

const cfg = G2V11 as unknown as Record<string, number>
const SEEDS = 1000
const TARGET = 0.54

interface Row { cd: number; spread: number; thrill: number; hit: number; near: number; cover: number; dens: number }
const rows: Row[] = []
cfg.BULLET_COUNT = 3
for (const spread of [18, 20, 22, 24, 26]) {
  for (const cd of [0.18, 0.2, 0.22, 0.24]) {
    cfg.SPREAD_DEG = spread
    cfg.FIRE_COOLDOWN = cd
    const r = evaluate('ver11', SEEDS)
    rows.push({ cd, spread, thrill: r.thrill, hit: r.hitRate, near: r.nearMiss, cover: r.coverage, dens: r.density })
  }
}
console.log('3발 정밀(1000 seeds):')
for (const r of rows.sort((a, b) => a.spread - b.spread || a.cd - b.cd)) {
  const fair = Math.abs(r.hit - TARGET) <= 0.05 ? ' ★' : ''
  console.log(`spread=${r.spread} cd=${r.cd.toFixed(2)} | thrill=${r.thrill.toFixed(1)} hit=${r.hit.toFixed(2)} near=${r.near.toFixed(2)} cover=${r.cover.toFixed(2)} dens=${r.dens.toFixed(1)}${fair}`)
}
const best = [...rows]
  .filter((r) => Math.abs(r.hit - TARGET) <= 0.06)
  .sort((a, b) => b.thrill - a.thrill)[0]
  ?? [...rows].sort((a, b) => Math.abs(a.hit - TARGET) - Math.abs(b.hit - TARGET))[0]
console.log('\n>>> BEST 3발:', JSON.stringify(best))
