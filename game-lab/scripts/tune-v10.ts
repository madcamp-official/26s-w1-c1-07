/** ver10 밸런스 오토튜너 — 발사대 4방향 부채꼴이 hitRate≈0.55~0.65가 되도록. */
import { evaluate } from './thrill-eval'
import { G2V10 } from '../shared/src/games/game2v10/logic'

const cfg = G2V10 as unknown as Record<string, number>
const SEEDS = 400

interface Row {
  cd: number
  spread: number
  inner: number
  bounce: number
  thrill: number
  hit: number
  cover: number
  near: number
  vol: number
  speed: number
}

const rows: Row[] = []
for (const cd of [0.16, 0.22, 0.3, 0.4]) {
  for (const spread of [28, 40, 52]) {
    for (const inner of [0.3, 0.55]) {
      for (const bounce of [1, 3]) {
        cfg.FIRE_COOLDOWN = cd
        cfg.SPREAD_DEG = spread
        cfg.INNER_FRAC = inner
        cfg.MAX_BOUNCE = bounce
        const r = evaluate('ver10', SEEDS)
        rows.push({
          cd, spread, inner, bounce,
          thrill: r.thrill, hit: r.hitRate, cover: r.coverage,
          near: r.nearMiss, vol: r.volatility, speed: r.speed,
        })
      }
    }
  }
}

const inBand = rows.filter((r) => r.hit >= 0.5 && r.hit <= 0.7)
inBand.sort((a, b) => b.thrill - a.thrill)
const fallback = [...rows].sort(
  (a, b) => Math.abs(a.hit - 0.6) - Math.abs(b.hit - 0.6) || b.thrill - a.thrill,
)
const best = inBand[0] ?? fallback[0]

console.log(`총 ${rows.length}개, hitRate∈[0.5,0.7] ${inBand.length}개`)
console.log('--- 밴드 내 Thrill 상위 10 ---')
for (const r of (inBand.length ? inBand : fallback).slice(0, 10)) {
  console.log(
    `cd=${r.cd} spread=${r.spread} inner=${r.inner} bounce=${r.bounce} | thrill=${r.thrill.toFixed(1)} hit=${r.hit.toFixed(2)} cover=${r.cover.toFixed(2)} near=${r.near.toFixed(2)} vol=${r.vol.toFixed(2)} spd=${Math.round(r.speed)}`,
  )
}
console.log('\n>>> BEST:', JSON.stringify(best))
