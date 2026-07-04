import { evaluate } from './thrill-eval'
import { G2V9 } from '../shared/src/games/game2v9/logic'
const cfg = G2V9 as unknown as Record<string, number>

function show(label: string) {
  const r = evaluate('ver9', 400)
  console.log(
    `${label.padEnd(28)} thrill=${r.thrill.toFixed(1)} hit=${r.hitRate.toFixed(2)} cover=${r.coverage.toFixed(2)} dens=${r.density.toFixed(1)} near=${r.nearMiss.toFixed(2)} speed=${Math.round(r.speed)}`,
  )
}

// 기본값 백업
const base = { ...cfg }
show('baseline')

// (1) 분열 사실상 비활성(refractory 매우 크게) → 곧은 씨앗만 => ver7류 hitRate 기대
cfg.SPLIT_REFRACTORY_0 = 99
cfg.SPLIT_REFRACTORY_1 = 99
show('splits OFF (straight only)')
cfg.SPLIT_REFRACTORY_0 = base.SPLIT_REFRACTORY_0
cfg.SPLIT_REFRACTORY_1 = base.SPLIT_REFRACTORY_1

// (2) 팔 개수 1, 중앙만 => 단일 유도탄만
cfg.ARM_COUNT_EARLY = 1
cfg.ARM_COUNT_LATE = 1
show('single center arm')
cfg.ARM_COUNT_EARLY = base.ARM_COUNT_EARLY
cfg.ARM_COUNT_LATE = base.ARM_COUNT_LATE

// (3) 팔 가로유도 제거(VX_CAP=0, CONV0=0) => 곧게 떨어지는 다탄(스프레드만)
cfg.VX_CAP = 0
cfg.ARM_CONV0 = 0
show('arms w/o homing (spread)')
cfg.VX_CAP = base.VX_CAP
cfg.ARM_CONV0 = base.ARM_CONV0

// (4) refractory 크게(웨이브 드물게) => 겹침 제거
cfg.SPLIT_REFRACTORY_0 = 1.2
cfg.SPLIT_REFRACTORY_1 = 1.2
show('sparse waves (refr 1.2)')
cfg.SPLIT_REFRACTORY_0 = base.SPLIT_REFRACTORY_0
cfg.SPLIT_REFRACTORY_1 = base.SPLIT_REFRACTORY_1

// (5) 넓은 틈: OFF1 크게(안 조임) => 수렴 안 함
cfg.BRACKET_OFF1 = 120
show('no convergence (OFF1=120)')
cfg.BRACKET_OFF1 = base.BRACKET_OFF1
