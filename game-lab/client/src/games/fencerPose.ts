/**
 * 게임3(펜싱) 렌더 공용 — 캐릭터 치수 + 회피 포즈 곡선.
 *
 * 두 가지 공통 개선을 한 곳에 모은다.
 *  1) 캐릭터 키 확대: 동작(공격/회피)이 잘 보이도록 몸/다리/검을 키운 치수.
 *  2) 부드러운 회피 복귀: 기존엔 bend = sin(p·π) 라 회피 정점이 창 한가운데서
 *     "찰나"만 유지되고 창이 끝나면 즉시 기본자세로 스냅되어 끊겨 보였다.
 *     여기서는 "빠르게 회피자세로 진입 → 무적창 동안 유지 → 창이 끝난 뒤
 *     RECOVERY 시간에 걸쳐 부드럽게 복귀"하는 곡선으로 바꾼다(스냅 제거).
 */

/** 캐릭터 치수 — 공용. 기존보다 ~1.4배 키움. */
export const FENCER: {
  legH: number
  torsoH: number
  torsoW: number
  headR: number
  legSpread: number
  swordRest: number
  swordStrike: number
  swordWindup: number
  swordLiftRest: number
  swordLiftWindup: number
} = {
  legH: 28,
  torsoH: 44,
  torsoW: 20,
  headR: 12,
  /** 기본 스탠스에서 다리를 벌린 폭(반) */
  legSpread: 9,
  /** 검 길이 */
  swordRest: 34,
  swordStrike: 66,
  swordWindup: 26,
  /** 검 끝 들림(기본/윈드업) */
  swordLiftRest: 9,
  swordLiftWindup: 13,
}

/** 회피자세로 진입하는 데 걸리는 시간(초) — 짧게 스냅인 */
export const DODGE_RISE = 0.05
/** 무적창이 끝난 뒤 기본자세로 복귀하는 데 걸리는 시간(초) — 여기서 "끊김"을 없앤다 */
export const DODGE_RECOVERY = 0.16

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

export interface DodgePose<S> {
  /** 포즈 진폭 0..1 (0=기본자세, 1=완전 회피자세) */
  amp: number
  /** 이 포즈를 지배하는 회피의 스타일(있으면) */
  style: S
  /** 아직 무적창(판정상 회피) 안인가 */
  active: boolean
}

/**
 * now 시점의 회피 포즈를 반환. 무적창이 끝난 직후 RECOVERY 동안에도 amp가
 * 부드럽게 0으로 감소하므로, 렌더는 창 종료 후에도 잠깐 복귀 동작을 이어 그린다.
 * 동시에 여러 회피가 걸쳐 있으면 가장 늦게 시작한(가장 최근) 회피가 포즈를 지배한다.
 */
export function dodgePose<S>(
  dodges: { start: number; end: number; style?: S }[],
  now: number,
): DodgePose<S> | null {
  let chosen: { start: number; end: number; style?: S } | null = null
  for (const d of dodges) {
    if (d.start <= now && now < d.end + DODGE_RECOVERY) {
      if (!chosen || d.start > chosen.start) chosen = d
    }
  }
  if (!chosen) return null
  const { start, end } = chosen
  const dur = end - start
  // 무적창 안에서 반드시 진입이 끝나도록 rise를 창 길이에 맞춰 캡
  const rise = Math.min(DODGE_RISE, dur * 0.6)
  let amp: number
  if (now < end) {
    amp = easeOutCubic(clamp01((now - start) / rise)) // 0→1로 빠르게 올라 유지
  } else {
    amp = 1 - easeInOutCubic(clamp01((now - end) / DODGE_RECOVERY)) // 1→0 부드럽게
  }
  return { amp, style: chosen.style as S, active: now < end }
}
