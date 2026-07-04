/**
 * ver9 밸런스 오토튜너 — 가속 유도 협공이 불가피(hitRate=1)하지 않고
 * 일찍 커밋하면 뚫리는(hitRate≈0.55~0.65) 지점을 찾아 Thrill을 최대화.
 */
import { evaluate } from './thrill-eval'
import { G2V9 } from '../shared/src/games/game2v9/logic'

const cfg = G2V9 as unknown as Record<string, number>
const SEEDS = 400

interface Row {
  track: number
  off1: number
  off0: number
  splitY: number
  thrill: number
  hit: number
  cover: number
  dens: number
  near: number
  vol: number
}

const rows: Row[] = []
for (const track of [0, 0.3, 0.6]) {
  for (const off1 of [40, 70, 100]) {
    for (const off0 of [200, 300]) {
      for (const splitY of [110, 150]) {
        cfg.TX_TRACK = track
        cfg.BRACKET_OFF1 = off1
        cfg.BRACKET_OFF0 = off0
        cfg.SPLIT_Y = splitY
        const r = evaluate('ver9', SEEDS)
        rows.push({
          track, off1, off0, splitY,
          thrill: r.thrill, hit: r.hitRate, cover: r.coverage,
          dens: r.density, near: r.nearMiss, vol: r.volatility,
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
    `track=${r.track} off1=${r.off1} off0=${r.off0} splitY=${r.splitY} | thrill=${r.thrill.toFixed(1)} hit=${r.hit.toFixed(2)} cover=${r.cover.toFixed(2)} dens=${r.dens.toFixed(1)} near=${r.near.toFixed(2)} vol=${r.vol.toFixed(2)}`,
  )
}
console.log('\n>>> BEST:', JSON.stringify(best))
