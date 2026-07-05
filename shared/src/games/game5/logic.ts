import type { GameInputEvent, GameResult } from '../types'
import { GAME_DURATION } from '../types'

/**
 * 게임5 = 몬스터 포격전 (대칭 대결).
 *  · 두 플레이어는 화면 중앙에 약간의 간격을 두고 대포 형태로 자리한다.
 *      P1 왼쪽 대포 (CX-GAP, CY) / P2 오른쪽 대포 (CX+GAP, CY).
 *  · 몬스터는 화면 가장자리 랜덤 지점에서 생성돼 목표 대포로 직선 이동한다.
 *      생성 시 목표 대포(P1/P2)를 번갈아 배정 → 두 대포가 받는 위협이 균등.
 *  · 조작 — 대포는 기본적으로 계속 회전(기본값 반시계)한다.
 *      P1: Q 회전 방향 전환 · W 발사(쿨 FIRE_COOLDOWN)
 *      P2: U 회전 방향 전환 · I 발사
 *  · 총알이 몬스터에 맞으면 몬스터 소멸 + 쏜 플레이어 +1점. (아무 몬스터나 맞힐 수 있다)
 *  · 몬스터가 어느 대포에든 닿으면 그 대포의 주인이 즉시 패배 → 상대 승리.
 *  · 제한시간(10s) 생존 시: 둘 다 살아남았으면 점수 높은 쪽 승, 동점이면 DRAW.
 *
 * 각도 규약: 총구 방향 = (cos a, sin a) (캔버스 좌표, y 아래로 증가).
 *   화면에서 "반시계 방향"으로 돌리려면 a 를 감소시킨다 → 회전 방향 dir=-1 이 반시계(기본값).
 */
export const G5 = {
  W: 800,
  H: 450,
  CX: 400,
  CY: 225,
  /** 두 대포의 중심에서 좌우로 벌린 간격 */
  GAP: 74,
  CANNON_R: 16,
  /** 포신 길이(렌더 + 총알 생성 위치) */
  BARREL_LEN: 26,
  // ── 대포 조작 ──
  ROT_SPEED: 5.4, // rad/s (항상 회전, Q/U로 방향 전환)
  FIRE_COOLDOWN: 0.32,
  // ── 총알 ──
  BULLET_SPEED: 660,
  BULLET_R: 5,
  // ── 몬스터 (직선 이동, 기존 대비 20% 감속) ──
  MONSTER_R: 13,
  MONSTER_SPEED_MIN: 44.8,
  MONSTER_SPEED_MAX: 76.8,
  // ── 스폰: 시간이 갈수록 간격이 짧아진다 ──
  SPAWN_INTERVAL_START: 0.9,
  SPAWN_INTERVAL_MIN: 0.42,
  /** 가장자리에서 살짝 안쪽으로 스폰 */
  SPAWN_MARGIN: 24,
} as const

export interface Shot {
  x: number
  y: number
  vx: number
  vy: number
  owner: 1 | 2
}

export interface Monster {
  x: number
  y: number
  /** 이 몬스터가 노리는 대포 */
  target: 1 | 2
  /** 생성 시 목표를 향해 고정된 직선 속도 */
  vx: number
  vy: number
  /** 렌더용 애니메이션 위상 */
  anim: number
}

export interface Game5State {
  elapsed: number
  result: GameResult
  // ── P1 대포 ──
  p1Angle: number
  /** 회전 방향(-1=반시계 기본, 1=시계). Q로 토글 */
  p1Dir: 1 | -1
  p1Cooldown: number
  p1Score: number
  // ── P2 대포 ──
  p2Angle: number
  /** 회전 방향(-1=반시계 기본, 1=시계). U로 토글 */
  p2Dir: 1 | -1
  p2Cooldown: number
  p2Score: number
  // ──
  shots: Shot[]
  monsters: Monster[]
  spawnTimer: number
  /** 다음 몬스터가 노릴 대포(번갈아 배정) */
  nextTarget: 1 | 2
  seed: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function nextRand(seed: number): { u: number; seed: number } {
  const s = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return { u: s / 4294967296, seed: s }
}

const p1Pos = () => ({ x: G5.CX - G5.GAP, y: G5.CY })
const p2Pos = () => ({ x: G5.CX + G5.GAP, y: G5.CY })

/** 현재 경과 시간 기준 스폰 간격 (선형 가속) */
function spawnInterval(elapsed: number): number {
  const t = clamp(elapsed / GAME_DURATION, 0, 1)
  return lerp(G5.SPAWN_INTERVAL_START, G5.SPAWN_INTERVAL_MIN, t)
}

export function create(rand: () => number): Game5State {
  return {
    elapsed: 0,
    result: null,
    p1Angle: -Math.PI / 2, // 위쪽을 향한 채 시작
    p1Dir: -1, // 기본 반시계
    p1Cooldown: 0,
    p1Score: 0,
    p2Angle: -Math.PI / 2,
    p2Dir: -1, // 기본 반시계
    p2Cooldown: 0,
    p2Score: 0,
    shots: [],
    monsters: [],
    spawnTimer: 0.4, // 첫 몬스터까지 살짝 여유
    nextTarget: rand() < 0.5 ? 1 : 2,
    seed: Math.floor(rand() * 4294967296) >>> 0,
  }
}

/** 가장자리 랜덤 지점에서 target 대포를 노리는 몬스터를 만든다 */
function spawnMonster(state: Game5State, target: 1 | 2): void {
  const m = G5.SPAWN_MARGIN
  let r = nextRand(state.seed)
  state.seed = r.seed
  const edge = Math.floor(r.u * 4) % 4 // 0 상 1 하 2 좌 3 우

  r = nextRand(state.seed)
  state.seed = r.seed
  const along = r.u

  let x: number
  let y: number
  if (edge === 0) {
    x = lerp(m, G5.W - m, along)
    y = m
  } else if (edge === 1) {
    x = lerp(m, G5.W - m, along)
    y = G5.H - m
  } else if (edge === 2) {
    x = m
    y = lerp(m, G5.H - m, along)
  } else {
    x = G5.W - m
    y = lerp(m, G5.H - m, along)
  }

  r = nextRand(state.seed)
  state.seed = r.seed
  const speed = lerp(G5.MONSTER_SPEED_MIN, G5.MONSTER_SPEED_MAX, r.u)

  // 목표 대포를 향한 고정 직선 속도 (대포는 정지 → 경로가 직선)
  const tp = target === 1 ? p1Pos() : p2Pos()
  const dist = Math.hypot(tp.x - x, tp.y - y) || 1
  const vx = ((tp.x - x) / dist) * speed
  const vy = ((tp.y - y) / dist) * speed

  state.monsters.push({ x, y, target, vx, vy, anim: 0 })
}

export function step(state: Game5State, events: GameInputEvent[], dt: number): Game5State {
  if (state.result) return state
  state.elapsed += dt
  state.p1Cooldown = Math.max(0, state.p1Cooldown - dt)
  state.p2Cooldown = Math.max(0, state.p2Cooldown - dt)

  // 1) 입력
  for (const e of events) {
    const down = e.type === 'down'
    switch (e.code) {
      case 'KeyQ': // P1 회전 방향 전환
        if (down) state.p1Dir = state.p1Dir === -1 ? 1 : -1
        break
      case 'KeyU': // P2 회전 방향 전환
        if (down) state.p2Dir = state.p2Dir === -1 ? 1 : -1
        break
      case 'KeyW': // P1 발사
        if (down && state.p1Cooldown === 0) {
          const p = p1Pos()
          state.shots.push({
            x: p.x + Math.cos(state.p1Angle) * G5.BARREL_LEN,
            y: p.y + Math.sin(state.p1Angle) * G5.BARREL_LEN,
            vx: Math.cos(state.p1Angle) * G5.BULLET_SPEED,
            vy: Math.sin(state.p1Angle) * G5.BULLET_SPEED,
            owner: 1,
          })
          state.p1Cooldown = G5.FIRE_COOLDOWN
        }
        break
      case 'KeyI': // P2 발사
        if (down && state.p2Cooldown === 0) {
          const p = p2Pos()
          state.shots.push({
            x: p.x + Math.cos(state.p2Angle) * G5.BARREL_LEN,
            y: p.y + Math.sin(state.p2Angle) * G5.BARREL_LEN,
            vx: Math.cos(state.p2Angle) * G5.BULLET_SPEED,
            vy: Math.sin(state.p2Angle) * G5.BULLET_SPEED,
            owner: 2,
          })
          state.p2Cooldown = G5.FIRE_COOLDOWN
        }
        break
    }
  }

  // 2) 대포 회전 — 항상 회전(dir=-1 반시계 기본), Q/U로 방향만 토글
  state.p1Angle += G5.ROT_SPEED * state.p1Dir * dt
  state.p2Angle += G5.ROT_SPEED * state.p2Dir * dt

  // 3) 몬스터 스폰(번갈아 목표 배정)
  state.spawnTimer -= dt
  if (state.spawnTimer <= 0) {
    spawnMonster(state, state.nextTarget)
    state.nextTarget = state.nextTarget === 1 ? 2 : 1
    state.spawnTimer += spawnInterval(state.elapsed)
  }

  // 4) 몬스터 이동 — 생성 시 정해진 목표를 향해 직선 이동
  for (const mo of state.monsters) {
    mo.x += mo.vx * dt
    mo.y += mo.vy * dt
    mo.anim += dt
  }

  // 5) 총알 이동 + 화면 밖 제거
  const liveShots: Shot[] = []
  for (const sh of state.shots) {
    sh.x += sh.vx * dt
    sh.y += sh.vy * dt
    if (sh.x >= -20 && sh.x <= G5.W + 20 && sh.y >= -20 && sh.y <= G5.H + 20) {
      liveShots.push(sh)
    }
  }
  state.shots = liveShots

  // 6) 총알 ↔ 몬스터 충돌 — 맞으면 몬스터 소멸 + 쏜 사람 +1, 총알도 소멸
  const hitR = G5.MONSTER_R + G5.BULLET_R
  const deadMonster = new Set<number>()
  const usedShot = new Set<number>()
  for (let si = 0; si < state.shots.length; si++) {
    const sh = state.shots[si]
    for (let mi = 0; mi < state.monsters.length; mi++) {
      if (deadMonster.has(mi)) continue
      const mo = state.monsters[mi]
      if (Math.hypot(sh.x - mo.x, sh.y - mo.y) <= hitR) {
        deadMonster.add(mi)
        usedShot.add(si)
        if (sh.owner === 1) state.p1Score += 1
        else state.p2Score += 1
        break
      }
    }
  }
  if (deadMonster.size > 0) {
    state.monsters = state.monsters.filter((_, i) => !deadMonster.has(i))
    state.shots = state.shots.filter((_, i) => !usedShot.has(i))
  }

  // 7) 몬스터 ↔ 대포 충돌 — 닿은 대포의 주인이 즉시 패배
  const touchR = G5.MONSTER_R + G5.CANNON_R
  const p1 = p1Pos()
  const p2 = p2Pos()
  for (const mo of state.monsters) {
    if (Math.hypot(mo.x - p1.x, mo.y - p1.y) <= touchR) {
      state.result = 'P2'
      return state
    }
    if (Math.hypot(mo.x - p2.x, mo.y - p2.y) <= touchR) {
      state.result = 'P1'
      return state
    }
  }

  // 8) 제한시간 종료 — 둘 다 생존, 점수로 판정
  if (state.elapsed >= GAME_DURATION) {
    if (state.p1Score > state.p2Score) state.result = 'P1'
    else if (state.p2Score > state.p1Score) state.result = 'P2'
    else state.result = 'DRAW'
  }
  return state
}
