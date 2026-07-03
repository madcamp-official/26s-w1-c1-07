/**
 * 게임2 "총알 피하기" — 비대칭 대전 순수 로직 (I/O·DOM·소켓 의존 없음).
 *
 * P1(공격자): 위쪽 수평 트랙에서 등속 자동 이동(경계 반사).
 *   액션 = { 방향 전환, 발사 }. 발사 시 총알이 아래로 떨어진다.
 * P2(회피자): 아래쪽 수평 트랙. 액션 = { 왼쪽 이동, 오른쪽 이동 } (누르는 동안 이동).
 *
 * 승패:
 *   - 총알이 P2 히트박스에 닿으면 P1 승리.
 *   - 라운드 제한 시간까지 P2가 생존하면 P2 승리. (가정: 타임아웃 = 회피 성공 = P2 승)
 *
 * 시뮬레이션: 고정 틱(권장 20Hz = 50ms) 전제의 tick(state, inputs, dtMs) => newState.
 * 난수: rng(() => number, 0~1)를 createGame2State에서 주입받아 state에 보관한다.
 *   (rng는 함수라 직렬화 대상이 아님 — 리플레이/네트워크 동기화 시 시드 기반 rng를 주입할 것)
 */
import type { GameActionBase, MatchResult } from '../types.js';

/**
 * 0 이상 1 미만 난수를 반환하는 주입식 난수원.
 * (게임별 병렬 작업 중 index.ts star export 충돌을 피하려고 Game2 접두어 사용)
 */
export type Game2Rng = () => number;

// ---------------------------------------------------------------------------
// 상수 (밸런스 미확정 — 전부 임시값/가정)
// ---------------------------------------------------------------------------

/** 권장 고정 틱 간격 (20Hz). 임시값/가정 */
export const GAME2_TICK_MS = 50;

export interface Game2Config {
  /** 필드 논리 폭 (x: 0 ~ fieldWidth) */
  fieldWidth: number;
  /** 필드 논리 높이 (y: 0=위 ~ fieldHeight=아래) */
  fieldHeight: number;
  /** 공격자(P1) 트랙의 y 좌표 */
  attackerY: number;
  /** 회피자(P2) 트랙의 y 좌표 */
  dodgerY: number;
  /** 공격자 자동 이동 속도 (units/sec) */
  attackerSpeed: number;
  /** 회피자 이동 속도 (units/sec) */
  dodgerSpeed: number;
  /** 공격자 히트박스 반폭 (경계 반사 기준) */
  attackerHalfWidth: number;
  /** 회피자 히트박스 반폭 (충돌 판정 기준) */
  dodgerHalfWidth: number;
  /** 총알 반지름 (충돌 판정 기준) */
  bulletRadius: number;
  /** 총알 낙하 속도 최소값 (units/sec) — 발사 시 rng로 [min, max) 결정 */
  bulletSpeedMin: number;
  /** 총알 낙하 속도 최대값 (units/sec) */
  bulletSpeedMax: number;
  /** 발사 쿨다운 (ms). 연사 방지용 — 가정: 쿨다운 중 발사 입력은 무시(큐잉 없음) */
  fireCooldownMs: number;
  /** 라운드 제한 시간 (ms). 이 시간까지 P2 생존 시 P2 승리 */
  roundDurationMs: number;
}

/** 기본 설정. 수치는 전부 임시값/가정 — 플레이테스트로 조정 예정 */
export const DEFAULT_GAME2_CONFIG: Game2Config = {
  fieldWidth: 100,
  fieldHeight: 100,
  attackerY: 10,
  dodgerY: 90,
  attackerSpeed: 40, // 임시값/가정
  dodgerSpeed: 50, // 임시값/가정 (회피자가 약간 빠르게 — 비대칭 밸런스)
  attackerHalfWidth: 4, // 임시값/가정
  dodgerHalfWidth: 4, // 임시값/가정
  bulletRadius: 1.5, // 임시값/가정
  bulletSpeedMin: 60, // 임시값/가정
  bulletSpeedMax: 140, // 임시값/가정
  fireCooldownMs: 400, // 임시값/가정 (연사 방지)
  roundDurationMs: 20_000, // 임시값/가정 (라운드 20초)
};

// ---------------------------------------------------------------------------
// 액션 / 입력
// ---------------------------------------------------------------------------

/** 게임2 이산 액션 (어댑터 → 코어 전달용). types.ts의 GameActionBase 확장 */
export interface Game2Action extends GameActionBase {
  gameId: 2;
  type:
    | 'TURN' // P1: 이동 방향 전환 (엣지)
    | 'FIRE' // P1: 발사 (엣지)
    | 'LEFT_DOWN' // P2: 왼쪽 키 누름
    | 'LEFT_UP' // P2: 왼쪽 키 뗌
    | 'RIGHT_DOWN' // P2: 오른쪽 키 누름
    | 'RIGHT_UP'; // P2: 오른쪽 키 뗌
}

/**
 * 한 틱 동안의 입력 스냅샷.
 * P1은 엣지 트리거(이 틱에 눌렸는가), P2는 레벨 트리거(눌려 있는 동안 true).
 */
export interface Game2Inputs {
  /** P1: 이 틱에 방향 전환 입력 발생 */
  p1Turn: boolean;
  /** P1: 이 틱에 발사 입력 발생 */
  p1Fire: boolean;
  /** P2: 왼쪽 이동키가 눌려 있음 */
  p2Left: boolean;
  /** P2: 오른쪽 이동키가 눌려 있음 */
  p2Right: boolean;
}

/** 아무 입력도 없는 틱 */
export const GAME2_IDLE_INPUTS: Game2Inputs = {
  p1Turn: false,
  p1Fire: false,
  p2Left: false,
  p2Right: false,
};

/**
 * 이산 액션 목록을 다음 틱 입력 스냅샷으로 접는다.
 * prev의 P2 홀드 상태를 이어받고, P1 엣지는 매 틱 리셋한다.
 */
export function reduceGame2Inputs(prev: Game2Inputs, actions: readonly Game2Action[]): Game2Inputs {
  const next: Game2Inputs = { ...prev, p1Turn: false, p1Fire: false };
  for (const a of actions) {
    if (a.gameId !== 2) continue;
    // 가정: 역할 강제 — P1 액션은 P1만, P2 액션은 P2만 유효 (크로스 입력 무시)
    if (a.player === 'P1' && a.type === 'TURN') next.p1Turn = true;
    else if (a.player === 'P1' && a.type === 'FIRE') next.p1Fire = true;
    else if (a.player === 'P2' && a.type === 'LEFT_DOWN') next.p2Left = true;
    else if (a.player === 'P2' && a.type === 'LEFT_UP') next.p2Left = false;
    else if (a.player === 'P2' && a.type === 'RIGHT_DOWN') next.p2Right = true;
    else if (a.player === 'P2' && a.type === 'RIGHT_UP') next.p2Right = false;
  }
  return next;
}

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------

/** 화면에 떠 있는 총알 하나 */
export interface Game2Bullet {
  id: number;
  x: number;
  y: number;
  /** 낙하 속도 (units/sec, +y 방향) — 발사 시 rng로 결정된 뒤 고정 */
  vy: number;
}

/** 렌더러용 파생 정보 (매 틱 재계산, 로직에는 사용하지 않음) */
export interface Game2View {
  /** 남은 라운드 시간 (ms, 0 이상) */
  remainingMs: number;
  /** 남은 발사 쿨다운 (ms, 0 이상) */
  fireCooldownRemainingMs: number;
  /** 발사 준비도 0(방금 발사)~1(발사 가능) — 쿨다운 게이지용 */
  fireReadyRatio: number;
  /** 공격자 x의 0~1 정규화 값 */
  attackerXRatio: number;
  /** 회피자 x의 0~1 정규화 값 */
  dodgerXRatio: number;
  /** 총알 위치 정규화 목록 (x, y 모두 0~1) */
  bullets: readonly { id: number; xRatio: number; yRatio: number }[];
}

export interface Game2State {
  readonly config: Game2Config;
  /** 주입된 난수원 (직렬화 비대상) */
  readonly rng: Game2Rng;
  /** 라운드 경과 시간 (ms) */
  elapsedMs: number;
  attacker: {
    x: number;
    /** 이동 방향: 1 = 오른쪽(+x), -1 = 왼쪽(-x) */
    dir: 1 | -1;
    /** 남은 발사 쿨다운 (ms). 0 이하이면 발사 가능 */
    cooldownMs: number;
  };
  dodger: {
    x: number;
  };
  bullets: readonly Game2Bullet[];
  /** 다음 총알에 부여할 id (단조 증가) */
  nextBulletId: number;
  /** 승패 확정 필드. null = 진행 중 */
  result: MatchResult | null;
  /** 렌더러용 파생 정보 */
  view: Game2View;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function computeView(
  config: Game2Config,
  elapsedMs: number,
  attackerX: number,
  cooldownMs: number,
  dodgerX: number,
  bullets: readonly Game2Bullet[],
): Game2View {
  return {
    remainingMs: Math.max(0, config.roundDurationMs - elapsedMs),
    fireCooldownRemainingMs: Math.max(0, cooldownMs),
    fireReadyRatio:
      config.fireCooldownMs <= 0 ? 1 : clamp(1 - cooldownMs / config.fireCooldownMs, 0, 1),
    attackerXRatio: clamp(attackerX / config.fieldWidth, 0, 1),
    dodgerXRatio: clamp(dodgerX / config.fieldWidth, 0, 1),
    bullets: bullets.map((b) => ({
      id: b.id,
      xRatio: clamp(b.x / config.fieldWidth, 0, 1),
      yRatio: clamp(b.y / config.fieldHeight, 0, 1),
    })),
  };
}

/**
 * 초기 상태 생성.
 * 가정: P1은 필드 중앙에서 오른쪽으로 출발, P2는 필드 중앙에서 시작.
 */
export function createGame2State(
  config: Partial<Game2Config> = {},
  rng: Game2Rng = Math.random,
): Game2State {
  const cfg: Game2Config = { ...DEFAULT_GAME2_CONFIG, ...config };
  const attackerX = cfg.fieldWidth / 2;
  const dodgerX = cfg.fieldWidth / 2;
  return {
    config: cfg,
    rng,
    elapsedMs: 0,
    attacker: { x: attackerX, dir: 1, cooldownMs: 0 },
    dodger: { x: dodgerX },
    bullets: [],
    nextBulletId: 1,
    result: null,
    view: computeView(cfg, 0, attackerX, 0, dodgerX, []),
  };
}

// ---------------------------------------------------------------------------
// 틱 시뮬레이션
// ---------------------------------------------------------------------------

/**
 * 공격자 위치를 등속 이동 + 경계 반사로 갱신한다.
 * 이동 범위: [attackerHalfWidth, fieldWidth - attackerHalfWidth]
 */
function moveAttacker(
  x: number,
  dir: 1 | -1,
  speed: number,
  dtSec: number,
  lo: number,
  hi: number,
): { x: number; dir: 1 | -1 } {
  let nx = x + dir * speed * dtSec;
  let nd = dir;
  // 한 틱에 여러 번 반사될 수 있으므로(속도가 매우 크거나 필드가 좁은 경우) 반복 반사
  for (let guard = 0; guard < 16 && (nx < lo || nx > hi); guard++) {
    if (nx < lo) {
      nx = lo + (lo - nx);
      nd = 1;
    } else {
      nx = hi - (nx - hi);
      nd = -1;
    }
  }
  return { x: clamp(nx, lo, hi), dir: nd };
}

/**
 * 한 틱 진행. 순수 함수 — state를 변형하지 않고 새 상태를 반환한다.
 *
 * 판정 순서 (가정):
 *   1. result가 이미 확정이면 그대로 반환 (틱 무시).
 *   2. dtMs를 남은 라운드 시간으로 클램프해 시뮬레이션 → 타임아웃 틱에서도
 *      제한 시간 "이내"의 충돌은 P1 승으로 인정.
 *   3. 충돌(P1 승) 판정이 타임아웃(P2 승) 판정보다 우선.
 *
 * (이름은 star export 충돌 방지를 위해 tickGame2 — 형태는 tick(state, inputs, dtMs))
 */
export function tickGame2(state: Game2State, inputs: Game2Inputs, dtMs: number): Game2State {
  if (state.result !== null) return state; // 승패 확정 후에는 상태 동결
  if (dtMs <= 0) return state;

  const cfg = state.config;
  // 타임아웃 경계: 남은 시간만큼만 시뮬레이션 (가정: 초과분은 버림)
  const simMs = Math.min(dtMs, Math.max(0, cfg.roundDurationMs - state.elapsedMs));
  const dtSec = simMs / 1000;
  const elapsedMs = state.elapsedMs + simMs;

  // --- P1 공격자: 방향 전환 → 등속 이동(경계 반사) ---
  const dirAfterTurn: 1 | -1 = inputs.p1Turn ? ((-state.attacker.dir) as 1 | -1) : state.attacker.dir;
  const aLo = cfg.attackerHalfWidth;
  const aHi = cfg.fieldWidth - cfg.attackerHalfWidth;
  const moved = moveAttacker(state.attacker.x, dirAfterTurn, cfg.attackerSpeed, dtSec, aLo, aHi);

  // --- P1 발사: 쿨다운 소진 후에만. 총알 속도는 rng로 [min, max) ---
  let cooldownMs = Math.max(0, state.attacker.cooldownMs - simMs);
  let nextBulletId = state.nextBulletId;
  let newBullet: Game2Bullet | null = null;
  if (inputs.p1Fire && cooldownMs <= 0) {
    const r = state.rng();
    const vy = cfg.bulletSpeedMin + r * (cfg.bulletSpeedMax - cfg.bulletSpeedMin);
    // 가정: 총알은 "이동 후" 공격자 위치에서 생성되고, 생성 틱에는 낙하하지 않는다.
    newBullet = { id: nextBulletId, x: moved.x, y: cfg.attackerY, vy };
    nextBulletId += 1;
    cooldownMs = cfg.fireCooldownMs;
  }

  // --- P2 회피자: 누르는 동안 이동 (양쪽 동시 입력은 상쇄 — 가정) ---
  const moveDir = (inputs.p2Right ? 1 : 0) - (inputs.p2Left ? 1 : 0);
  const dLo = cfg.dodgerHalfWidth;
  const dHi = cfg.fieldWidth - cfg.dodgerHalfWidth;
  const dodgerX = clamp(state.dodger.x + moveDir * cfg.dodgerSpeed * dtSec, dLo, dHi);

  // --- 총알 낙하 + 충돌 판정 ---
  // 터널링 방지: 이 틱 동안 총알이 지나간 y 구간 [prevY, newY]가
  // 회피자 트랙(dodgerY)을 스치면 그 시점의 x 겹침으로 판정한다.
  // (가정: x 판정에는 틱 종료 시점의 회피자 위치 사용 — 50ms 틱에선 오차 미미)
  const hitHalfWidth = cfg.dodgerHalfWidth + cfg.bulletRadius;
  const bullets: Game2Bullet[] = [];
  let hit = false;
  for (const b of state.bullets) {
    const newY = b.y + b.vy * dtSec;
    const crossesTrack = b.y - cfg.bulletRadius <= cfg.dodgerY && newY + cfg.bulletRadius >= cfg.dodgerY;
    if (crossesTrack && Math.abs(b.x - dodgerX) <= hitHalfWidth) {
      hit = true;
      bullets.push({ ...b, y: newY }); // 명중 총알도 렌더용으로 남긴다
      continue;
    }
    if (newY - cfg.bulletRadius <= cfg.fieldHeight) {
      bullets.push({ ...b, y: newY }); // 필드 밖으로 나간 총알은 제거
    }
  }
  if (newBullet) bullets.push(newBullet); // 발사 순서 유지 (기존 총알 뒤에 추가)

  // --- 승패 판정: 충돌(P1 승) > 타임아웃(P2 승) ---
  let result: MatchResult | null = null;
  if (hit) {
    result = 'P1_WIN';
  } else if (elapsedMs >= cfg.roundDurationMs) {
    // 가정: 제한 시간까지 생존 = P2 승리
    result = 'P2_WIN';
  }

  return {
    config: cfg,
    rng: state.rng,
    elapsedMs,
    attacker: { x: moved.x, dir: moved.dir, cooldownMs },
    dodger: { x: dodgerX },
    bullets,
    nextBulletId,
    result,
    view: computeView(cfg, elapsedMs, moved.x, cooldownMs, dodgerX, bullets),
  };
}
