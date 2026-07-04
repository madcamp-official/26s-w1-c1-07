/**
 * ver8 밸런스 오토튜너 — 커튼이 '불가피(hitRate=1)'하지 않고
 * 절묘하게 피할 만한(hitRate≈0.55~0.65) 지점을 찾아 Thrill을 최대화한다.
 * G2V8 상수 객체를 런타임에 변형하며 그리드 서치.
 */
import { evaluate } from './thrill-eval'
import { G2V8 } from '../shared/src/games/game2v8/logic'

const cfg = G2V8 as unknown as Record<string, number>
const SEEDS = 400

interface Row {
  burstY: number
  boost: number
  gapOff: number
  gapW: number
  sweep: number
  thrill: number
  hit: number
  near: number
  vol: number
}

const rows: Row[] = []
// 핵심: 커튼이 P2에 도달하기까지의 '반응 여유'를 만드는 두 축 — 폭발 고도(높이면 낙하시간↑)와
// 프래그 낙하배율(낮추면 느려짐). 여기에 틈 위치/폭/스윕을 곁들여 밸런스를 찾는다.
for (const burstY of [120, 145, 170, 195]) {
  for (const boost of [0.5, 0.62, 0.75, 0.9]) {
    for (const gapOff of [40, 100, 160]) {
      for (const gapW of [84, 104]) {
        for (const sweep of [500, 700]) {
          cfg.BURST_Y = burstY
          cfg.FRAG_VY_BOOST = boost
          cfg.GAP_OFF_MIN = gapOff
          cfg.GAP_OFF_SPAN = 140
          cfg.GAP_W = gapW
          cfg.SWEEP_VX = sweep
          const r = evaluate('ver8', SEEDS)
          rows.push({
            burstY, boost, gapOff, gapW, sweep,
            thrill: r.thrill, hit: r.hitRate, near: r.nearMiss, vol: r.volatility,
          })
        }
      }
    }
  }
}

// 밸런스 우선: hitRate가 [0.5,0.7]인 것 중 Thrill 최대. 없으면 |hit-0.6| 최소.
const inBand = rows.filter((r) => r.hit >= 0.5 && r.hit <= 0.7)
inBand.sort((a, b) => b.thrill - a.thrill)
const fallback = [...rows].sort(
  (a, b) => Math.abs(a.hit - 0.6) - Math.abs(b.hit - 0.6) || b.thrill - a.thrill,
)
const best = inBand[0] ?? fallback[0]

console.log(`총 ${rows.length}개 조합, hitRate∈[0.5,0.7] ${inBand.length}개`)
console.log('--- 밴드 내 Thrill 상위 8 ---')
for (const r of (inBand.length ? inBand : fallback).slice(0, 10)) {
  console.log(
    `burstY=${r.burstY} boost=${r.boost} gapOff=${r.gapOff} gapW=${r.gapW} sweep=${r.sweep} | thrill=${r.thrill.toFixed(1)} hit=${r.hit.toFixed(2)} near=${r.near.toFixed(2)} vol=${r.vol.toFixed(2)}`,
  )
}
console.log('\n>>> BEST:', JSON.stringify(best))
