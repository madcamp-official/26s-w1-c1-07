/**
 * 게임1 "숫자 맞추기" — 순수 로직 모듈 (I/O·DOM·소켓 의존 없음).
 *
 * 규칙:
 *  - 타겟 숫자(1~100, rng 주입)가 중앙에 표시된다.
 *  - 각 플레이어는 시작 숫자를 배정받는다 (타겟과 다른 값으로 강제, rng 주입).
 *  - 액션: key1 = 숫자 내리기(-1), key2 = 숫자 올리기(+1).
 *  - 승리: 자기 숫자가 타겟과 일치한 상태를 HOLD_TO_WIN_MS(3000ms) 유지.
 *  - 일치가 깨지면 해당 플레이어의 유지 타이머는 0으로 리셋.
 *
 * 가정 (스펙 미명시 — 임시값/가정):
 *  - 숫자는 [1, 100] 범위로 클램프한다 (스펙 미명시이므로 가정).
 *  - 둘이 같은 틱에 동시에 3초를 채우면 무승부(DRAW) 처리 (가정).
 *  - 라운드 시간(RoundConfig.timePerRoundSec) 종료 시 무승부(DRAW) 처리 (가정).
 *  - 승리와 타임아웃이 같은 틱에 겹치면 승리가 우선한다 (가정).
 */
import type {
  GameActionBase,
  InputFrame,
  MatchResult,
  PlayerRole,
  RoundConfig,
} from '../types.js';

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** 숫자 최솟값 */
export const GAME1_MIN_VALUE = 1;
/** 숫자 최댓값 */
export const GAME1_MAX_VALUE = 100;
/** 타겟 일치 유지 시간 — 이 시간을 채우면 승리 (ms) */
export const GAME1_HOLD_TO_WIN_MS = 3000;

// ---------------------------------------------------------------------------
// 액션
// ---------------------------------------------------------------------------

/** key1 = DECREMENT(내리기), key2 = INCREMENT(올리기) */
export type Game1ActionType = 'DECREMENT' | 'INCREMENT';

export interface Game1Action extends GameActionBase {
  gameId: 1;
  type: Game1ActionType;
}

/** 물리 키 슬롯 → 게임1 액션 종류 매핑 (key1=내리기, key2=올리기) */
export const GAME1_KEY_ACTION: Record<'key1' | 'key2', Game1ActionType> = {
  key1: 'DECREMENT',
  key2: 'INCREMENT',
};

/** 키 슬롯 입력을 게임1 액션으로 변환하는 편의 함수 */
export function game1ActionFromKey(player: PlayerRole, key: 'key1' | 'key2'): Game1Action {
  return { gameId: 1, player, type: GAME1_KEY_ACTION[key] };
}

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------

/** 플레이어 한 명의 게임1 상태 */
export interface Game1PlayerState {
  /** 현재 숫자 ([GAME1_MIN_VALUE, GAME1_MAX_VALUE] 클램프) */
  value: number;
  /** 타겟과 일치한 상태를 유지한 누적 시간 (ms). 일치가 깨지면 0으로 리셋 */
  holdMs: number;
}

/** 렌더러용 파생 정보 (플레이어별) */
export interface Game1PlayerDerived {
  /** value - target (양수면 타겟보다 큼) */
  diff: number;
  /** 현재 타겟과 일치 중인지 */
  matched: boolean;
  /** 유지 진행률 0~1 (holdMs / GAME1_HOLD_TO_WIN_MS) */
  holdProgress: number;
  /** 승리까지 남은 유지 시간 (ms) */
  holdRemainingMs: number;
}

/** 렌더러용 파생 정보 */
export interface Game1Derived {
  P1: Game1PlayerDerived;
  P2: Game1PlayerDerived;
  /** 라운드 종료까지 남은 시간 (ms, 0 미만으로 내려가지 않음) */
  timeRemainingMs: number;
}

export interface Game1State {
  gameId: 1;
  /** 맞춰야 할 타겟 숫자 (1~100) */
  target: number;
  /** 플레이어별 상태 */
  players: Record<PlayerRole, Game1PlayerState>;
  /** 라운드 시작 이후 경과 시간 (ms) */
  elapsedMs: number;
  /** 라운드 제한 시간 (ms) = RoundConfig.timePerRoundSec * 1000 */
  timeLimitMs: number;
  /** 승패 확정 결과. null이면 진행 중 */
  result: MatchResult | null;
  /** 렌더러용 파생 정보 (tick마다 재계산) */
  derived: Game1Derived;
}

// ---------------------------------------------------------------------------
// 생성
// ---------------------------------------------------------------------------

function clampValue(v: number): number {
  return Math.min(GAME1_MAX_VALUE, Math.max(GAME1_MIN_VALUE, v));
}

/** rng() (0~1)로 [1, 100] 정수 하나를 뽑는다 */
function rollValue(rng: () => number): number {
  return clampValue(
    GAME1_MIN_VALUE + Math.floor(rng() * (GAME1_MAX_VALUE - GAME1_MIN_VALUE + 1)),
  );
}

/**
 * 타겟과 다른 시작 숫자를 뽑는다.
 * 재추첨 루프 대신 "타겟을 제외한 99개 값" 공간에서 한 번에 뽑아
 * rng 호출 1회로 결정적·종료 보장되게 한다.
 */
function rollStartValue(rng: () => number, target: number): number {
  const span = GAME1_MAX_VALUE - GAME1_MIN_VALUE; // 타겟 제외 후 남는 값 개수 (99)
  let v = GAME1_MIN_VALUE + Math.floor(Math.min(rng(), 0.9999999999) * span);
  if (v >= target) v += 1; // 타겟 자리를 건너뛰어 항상 target과 다름
  return clampValue(v);
}

function computeDerived(
  target: number,
  players: Record<PlayerRole, Game1PlayerState>,
  elapsedMs: number,
  timeLimitMs: number,
): Game1Derived {
  const per = (p: Game1PlayerState): Game1PlayerDerived => ({
    diff: p.value - target,
    matched: p.value === target,
    holdProgress: Math.min(1, p.holdMs / GAME1_HOLD_TO_WIN_MS),
    holdRemainingMs: Math.max(0, GAME1_HOLD_TO_WIN_MS - p.holdMs),
  });
  return {
    P1: per(players.P1),
    P2: per(players.P2),
    timeRemainingMs: Math.max(0, timeLimitMs - elapsedMs),
  };
}

/**
 * 게임1 초기 상태를 만든다.
 * @param config 라운드 설정 (timePerRoundSec 사용)
 * @param rng 0~1 난수 생성기 주입 (호출 순서: 타겟 → P1 시작값 → P2 시작값)
 */
export function createGame1State(config: RoundConfig, rng: () => number): Game1State {
  const target = rollValue(rng);
  const players: Record<PlayerRole, Game1PlayerState> = {
    P1: { value: rollStartValue(rng, target), holdMs: 0 },
    P2: { value: rollStartValue(rng, target), holdMs: 0 },
  };
  const timeLimitMs = config.timePerRoundSec * 1000;
  return {
    gameId: 1,
    target,
    players,
    elapsedMs: 0,
    timeLimitMs,
    result: null,
    derived: computeDerived(target, players, 0, timeLimitMs),
  };
}

// ---------------------------------------------------------------------------
// 틱
// ---------------------------------------------------------------------------

/**
 * 한 틱을 진행해 새 상태를 반환한다 (원본 불변).
 *
 * 처리 순서:
 *  1. 결과가 이미 확정됐으면 그대로 반환.
 *  2. 이 프레임의 액션을 적용해 숫자 갱신 ([1,100] 클램프 — 가정).
 *  3. dtMs만큼 시간 경과, 일치 중인 플레이어의 holdMs 누적 / 깨지면 0 리셋.
 *  4. holdMs >= 3000ms 판정 — 둘 다 동시 도달이면 DRAW (가정),
 *     승리는 타임아웃보다 우선 (가정).
 *  5. 승자가 없고 elapsedMs >= timeLimitMs면 DRAW (가정).
 */
export function tick(
  state: Game1State,
  inputs: InputFrame<Game1Action>,
  dtMs: number,
): Game1State {
  if (state.result !== null) return state;

  // 2. 액션 적용 (게임1 액션만 소비; 다른 게임 액션은 무시)
  const players: Record<PlayerRole, Game1PlayerState> = {
    P1: { ...state.players.P1 },
    P2: { ...state.players.P2 },
  };
  for (const action of inputs.actions) {
    if (action.gameId !== 1) continue;
    const p = players[action.player];
    const delta = action.type === 'INCREMENT' ? 1 : -1;
    p.value = clampValue(p.value + delta);
  }

  // 3. 시간 경과 + 유지 타이머
  const elapsedMs = state.elapsedMs + dtMs;
  for (const role of ['P1', 'P2'] as const) {
    const p = players[role];
    p.holdMs = p.value === state.target ? p.holdMs + dtMs : 0;
  }

  // 4~5. 승패 판정
  const p1Done = players.P1.holdMs >= GAME1_HOLD_TO_WIN_MS;
  const p2Done = players.P2.holdMs >= GAME1_HOLD_TO_WIN_MS;
  let result: MatchResult | null = null;
  if (p1Done && p2Done) {
    result = 'DRAW'; // 동시 3초 도달 → 무승부 (가정)
  } else if (p1Done) {
    result = 'P1_WIN';
  } else if (p2Done) {
    result = 'P2_WIN';
  } else if (elapsedMs >= state.timeLimitMs) {
    result = 'DRAW'; // 라운드 시간 종료 → 무승부 (가정)
  }

  return {
    ...state,
    players,
    elapsedMs,
    result,
    derived: computeDerived(state.target, players, elapsedMs, state.timeLimitMs),
  };
}
