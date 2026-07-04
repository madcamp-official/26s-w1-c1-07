import { simulate, REGISTRY } from './thrill-eval'

const mod = REGISTRY['ver9']
const N = 300
let gen0 = 0
let gen1 = 0
let unknown = 0
let sumT = 0
let sumDx = 0
let sumVx = 0
let firstWaveKill = 0 // 첫 웨이브(≈0.4s 이내) 피격
let wins = 0
const dxBuckets: Record<string, number> = {}
for (let s = 0; s < N; s++) {
  const m = simulate(mod, 1000 + s * 2654435761)
  if (!m.p1Win) continue
  wins++
  if (m.killGen === 0) gen0++
  else if (m.killGen === 1) gen1++
  else unknown++
  sumT += m.killElapsed
  sumDx += m.killDx
  sumVx += m.killVx
  if (m.killElapsed < 0.45) firstWaveKill++
  const b = m.killDx < 10 ? '<10' : m.killDx < 25 ? '10-25' : m.killDx < 40 ? '25-40' : '>=40'
  dxBuckets[b] = (dxBuckets[b] || 0) + 1
}
console.log(`wins ${wins}/${N} (hitRate ${(wins / N).toFixed(2)})`)
console.log(`kill gen: seed(gen0)=${gen0}  arm(gen1)=${gen1}  unknown=${unknown}`)
console.log(`avg killElapsed=${(sumT / wins).toFixed(2)}s  avg killDx=${(sumDx / wins).toFixed(1)}px  avg killVx=${(sumVx / wins).toFixed(0)}`)
console.log(`first-wave(<0.45s) kills: ${firstWaveKill}/${wins}`)
console.log('killDx buckets:', JSON.stringify(dxBuckets))
