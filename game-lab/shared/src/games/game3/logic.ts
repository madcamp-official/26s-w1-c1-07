import { makeGame3, type Game3Config } from './core'

/**
 * 게임3 = "서지-넉백(SURGE)" 펜싱.
 * 핵심:
 *  · 극한 난타전 베이스(짧은 지속·좁은 창·빠른 쿨·넓은 시동 랜덤 = 페인트 심리전).
 *  · 밀물(TIDE)+템포 가속: 시간이 갈수록 낙사선이 조이고 쿨타임이 줄어 후반 밀도 폭발.
 *  · 리포스트-브레이크: 성공 패링 → 즉발 반격창 + 콤보 스노우볼.
 *  · 서지-넉백: esc=(t/10)^2 곡선으로 모든 넉백에 시간연동 배율(초반 ×0.75 댐핑 → 막판 ×2.1 폭발).
 *    위치(c)는 안 읽고 오직 t만 읽어 러버밴드 feel-bad 없이 "밀당 개막 → 막판 폭발" 아치를 만든다.
 */
export const G3: Game3Config = {
  label: 'game3',
  ATTACK_DURATION: 0.06,
  DODGE_DURATION: 0.1,
  ATTACK_COOLDOWN: 0.15,
  DODGE_COOLDOWN: 0.17,
  KNOCKBACK: 0.1,
  HALF_GAP: 0.06,
  EDGE: 1.0,
  STARTUP_MIN: 0.04,
  STARTUP_MAX: 0.18,
  TIDE_MAX: 0.45,
  TEMPO_MAX: 0.45,
  ESCALATE_EXP: 2.0,
  RIPOSTE_WINDOW: 0.35,
  RIPOSTE_MULT: 1.6,
  COMBO_STEP: 0.25,
  COMBO_MAX: 3,
  COUNTER_MULT: 1.4,
  KB_SURGE_MIN: 0.75,
  KB_SURGE_MAX: 2.1,
}

const core = makeGame3(G3)
export const create = core.create
export const step = core.step
