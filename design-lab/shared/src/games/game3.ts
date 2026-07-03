/**
 * 게임3 "펜싱" — 1초 틱 가위바위보 + 링아웃. 순수 로직 모듈.
 *
 * 규칙 요약:
 * - 매 tickIntervalMs(기본 1000ms, 임시값)마다 양쪽의 행동을 동시 판정한다.
 * - 행동: 공격(key1 → ATTACK) / 회피(key2 → DODGE) / 무행동(입력 없음 → NONE).
 * - 상성(밀리는 쪽):
 *     공격 vs 회피   → 공격자 1칸 밀림
 *     회피 vs 무행동 → 회피자 1칸 밀림
 *     무행동 vs 공격 → 무행동자 1칸 밀림
 *     동일 행동      → 밀림 없음 (연출 이벤트만 발생)
 * - 시작 위치: 각자 자기 뒤 낭떠러지에서 3칸 (임시값, GAME3_DEFAULT_CONFIG).
 * - 자기 뒤로 3칸 "넘게" 밀리면(= 4번째 밀림, distanceFromEdge < 0) 바다 낙사 = 패배.
 *   [가정] 3번 밀려 벼랑 끝(distance 0)에 서 있는 것까지는 생존.
 * - 틱 윈도우 내 다중 입력은 마지막 입력 채택 (임시값).
 * - 라운드 시간(roundDurationMs) 종료 시 더 많이 밀린 쪽 패배, 동률 무승부 (임시값).
 * - 랜덤 요소 없음 — rng 파라미터는 다른 게임과의 시그니처 통일용이며 사용하지 않는다.
 *
 * I/O·DOM·소켓 의존 없음. tick은 원본 state를 변경하지 않고 새 state를 반환한다.
 */
import type { GameActionBase, MatchResult, PlayerRole } from '../types.js';

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

/** 틱 판정에 쓰이는 행동. NONE = 해당 윈도우에 입력 없음 */
export type Game3Move = 'ATTACK' | 'DODGE' | 'NONE';

/** 플레이어가 실제로 입력하는 액션 (key1 = ATTACK, key2 = DODGE) */
export interface Game3Action extends GameActionBase {
  gameId: 3;
  type: 'ATTACK' | 'DODGE';
}

export interface Game3Config {
  /** 판정 틱 간격 (ms) — 임시값 1000 */
  tickIntervalMs: number;
  /** 라운드 제한 시간 (ms) — 임시값/가정 30초 */
  roundDurationMs: number;
  /** 시작 시 자기 뒤 낭떠러지까지의 칸 수 — 임시값 3 */
  startDistanceFromEdge: number;
}

export const GAME3_DEFAULT_CONFIG: Game3Config = {
  tickIntervalMs: 1000, // 임시값
  roundDurationMs: 30_000, // 임시값/가정: 스펙에 명시 없어 30초로 둠
  startDistanceFromEdge: 3, // 임시값
};

export interface Game3PlayerState {
  /** 자기 뒤 낭떠러지까지 남은 칸 (0 = 벼랑 끝, 음수 = 낙사) */
  distanceFromEdge: number;
  /** 지금까지 밀린 총 횟수 (타임아웃 판정 기준) */
  pushedCount: number;
}

/** 한 판정 틱의 결과 — 렌더러가 연출(밀림/클래시)을 재생할 수 있는 정보 */
export interface Game3TickEvent {
  /** 몇 번째 판정 틱인지 (1부터) */
  tickIndex: number;
  /** 이 틱에서 채택된 양쪽 행동 */
  moves: Record<PlayerRole, Game3Move>;
  /** 이번 틱에 밀린 플레이어 (동일 행동이면 null) */
  pushed: PlayerRole | null;
  /** 동일 행동으로 아무도 안 밀렸는지 (연출용) */
  clash: boolean;
  /** 이번 틱에 낙사한 플레이어 (없으면 null) */
  fell: PlayerRole | null;
}

/** 렌더러용 파생 정보 (매 tick 재계산) */
export interface Game3View {
  /**
   * 트랙 셀 수 = startDistanceFromEdge * 2 + 2 (임시값).
   * P1 낭떠러지가 셀 -1 왼쪽, P2 낭떠러지가 셀 trackLength 오른쪽.
   * 시작 시 두 플레이어는 트랙 중앙에서 서로 인접.
   */
  trackLength: number;
  /** P1의 절대 셀 (왼쪽 기준, 음수면 낙사 연출) */
  p1Cell: number;
  /** P2의 절대 셀 (왼쪽 기준, trackLength 이상이면 낙사 연출) */
  p2Cell: number;
  /** 남은 라운드 시간 (ms, 0 미만으로 내려가지 않음) */
  timeRemainingMs: number;
}

export interface Game3State {
  gameId: 3;
  config: Game3Config;
  /** 매치 시작 이후 경과 시간 (ms) */
  elapsedMs: number;
  /** 현재 틱 윈도우 안에서의 경과 시간 (ms) */
  windowElapsedMs: number;
  /** 지금까지 판정된 틱 수 */
  tickCount: number;
  /** 현재 윈도우에서 채택 예정인 행동 (마지막 입력 채택) */
  pending: Record<PlayerRole, Game3Move>;
  players: Record<PlayerRole, Game3PlayerState>;
  /** 가장 최근 판정 틱의 결과 (렌더러 연출용, 아직 판정 전이면 null) */
  lastTick: Game3TickEvent | null;
  /** 승패 확정 필드 (null = 진행 중) */
  result: MatchResult | null;
  /** 승패 확정 사유 */
  resultReason: 'RING_OUT' | 'TIMEOUT' | null;
  /** 렌더러용 파생 정보 */
  view: Game3View;
}

// ---------------------------------------------------------------------------
// 생성
// ---------------------------------------------------------------------------

/**
 * 초기 상태를 만든다.
 * @param config 부분 설정 — 나머지는 GAME3_DEFAULT_CONFIG로 채움
 * @param _rng 0~1 난수 주입 (게임3은 랜덤 요소가 없어 사용하지 않음, 시그니처 통일용)
 */
export function createGame3State(
  config: Partial<Game3Config> = {},
  _rng: () => number = Math.random,
): Game3State {
  const cfg: Game3Config = { ...GAME3_DEFAULT_CONFIG, ...config };
  const players: Record<PlayerRole, Game3PlayerState> = {
    P1: { distanceFromEdge: cfg.startDistanceFromEdge, pushedCount: 0 },
    P2: { distanceFromEdge: cfg.startDistanceFromEdge, pushedCount: 0 },
  };
  return {
    gameId: 3,
    config: cfg,
    elapsedMs: 0,
    windowElapsedMs: 0,
    tickCount: 0,
    pending: { P1: 'NONE', P2: 'NONE' },
    players,
    lastTick: null,
    result: null,
    resultReason: null,
    view: computeView(cfg, players, 0),
  };
}

// ---------------------------------------------------------------------------
// 판정 헬퍼
// ---------------------------------------------------------------------------

/** move가 "지는"(밀리는) 상대 행동. ATTACK은 DODGE에, DODGE는 NONE에, NONE은 ATTACK에 밀린다. */
const LOSES_TO: Record<Game3Move, Game3Move> = {
  ATTACK: 'DODGE',
  DODGE: 'NONE',
  NONE: 'ATTACK',
};

/** 이 틱에서 밀리는 플레이어를 반환 (동일 행동이면 null) */
export function resolveGame3Pushed(p1Move: Game3Move, p2Move: Game3Move): PlayerRole | null {
  if (p1Move === p2Move) return null;
  if (LOSES_TO[p1Move] === p2Move) return 'P1';
  return 'P2';
}

function computeView(
  cfg: Game3Config,
  players: Record<PlayerRole, Game3PlayerState>,
  elapsedMs: number,
): Game3View {
  const trackLength = cfg.startDistanceFromEdge * 2 + 2; // 임시값: 시작 시 중앙 인접 배치
  return {
    trackLength,
    p1Cell: players.P1.distanceFromEdge,
    p2Cell: trackLength - 1 - players.P2.distanceFromEdge,
    timeRemainingMs: Math.max(0, cfg.roundDurationMs - elapsedMs),
  };
}

/** 타임아웃 판정: 더 많이 밀린 쪽 패배, 동률 무승부 (임시값) */
function judgeTimeout(players: Record<PlayerRole, Game3PlayerState>): MatchResult {
  if (players.P1.pushedCount > players.P2.pushedCount) return 'P2_WIN';
  if (players.P2.pushedCount > players.P1.pushedCount) return 'P1_WIN';
  return 'DRAW';
}

// ---------------------------------------------------------------------------
// tick
// ---------------------------------------------------------------------------

/**
 * dtMs만큼 시간을 진행시키고, 틱 윈도우 경계를 지날 때마다 동시 판정한다.
 *
 * [가정] inputs는 이번 dtMs 동안 발생한 액션들이며, 전부 "현재(첫) 윈도우"에
 * 귀속시킨다. dtMs가 여러 윈도우를 건너뛰는 경우 두 번째 이후 윈도우는
 * 무행동(NONE/NONE)으로 판정된다. (호출자는 보통 프레임 단위의 작은 dt로 호출)
 *
 * 원본 state는 변경하지 않는다.
 * (barrel(index.ts) 충돌 방지를 위해 game2와 같은 tickGameN 네이밍을 따른다)
 */
export function tickGame3(state: Game3State, inputs: Game3Action[], dtMs: number): Game3State {
  // 게임 종료 후에는 no-op (동일 참조 반환)
  if (state.result !== null) return state;
  if (dtMs < 0) throw new Error('dtMs must be >= 0');

  const cfg = state.config;

  // 1) 이번 dt 동안의 입력 반영 — 윈도우 내 다중 입력은 마지막 채택 (임시값)
  const pending: Record<PlayerRole, Game3Move> = { ...state.pending };
  for (const a of inputs) {
    if (a.gameId !== 3) continue;
    pending[a.player] = a.type;
  }

  // 2) 시간 진행
  const elapsedMs = state.elapsedMs + dtMs;
  let windowElapsedMs = state.windowElapsedMs + dtMs;
  let tickCount = state.tickCount;
  let lastTick = state.lastTick;
  let result: MatchResult | null = null;
  let resultReason: Game3State['resultReason'] = null;

  const players: Record<PlayerRole, Game3PlayerState> = {
    P1: { ...state.players.P1 },
    P2: { ...state.players.P2 },
  };
  let currentPending = pending;

  // 3) 지나간 윈도우 경계마다 판정
  while (result === null && windowElapsedMs >= cfg.tickIntervalMs) {
    const boundaryMs = (tickCount + 1) * cfg.tickIntervalMs;
    // [가정] 라운드 종료 시각을 넘어선 윈도우 경계는 판정하지 않는다.
    //        (경계가 종료 시각과 정확히 일치하면 판정한다)
    if (boundaryMs > cfg.roundDurationMs) break;

    windowElapsedMs -= cfg.tickIntervalMs;
    tickCount += 1;

    const p1Move = currentPending.P1;
    const p2Move = currentPending.P2;
    const pushed = resolveGame3Pushed(p1Move, p2Move);
    let fell: PlayerRole | null = null;

    if (pushed !== null) {
      players[pushed] = {
        distanceFromEdge: players[pushed].distanceFromEdge - 1,
        pushedCount: players[pushed].pushedCount + 1,
      };
      if (players[pushed].distanceFromEdge < 0) {
        // 자기 뒤로 3칸 "넘게" 밀림 → 바다 낙사
        fell = pushed;
        result = pushed === 'P1' ? 'P2_WIN' : 'P1_WIN';
        resultReason = 'RING_OUT';
      }
    }

    lastTick = {
      tickIndex: tickCount,
      moves: { P1: p1Move, P2: p2Move },
      pushed,
      clash: pushed === null,
      fell,
    };

    // 다음 윈도우는 새 입력이 없는 한 무행동
    currentPending = { P1: 'NONE', P2: 'NONE' };
  }

  // 4) 라운드 시간 종료 판정 (낙사가 먼저 확정됐으면 그대로 둠)
  if (result === null && elapsedMs >= cfg.roundDurationMs) {
    result = judgeTimeout(players);
    resultReason = 'TIMEOUT';
  }

  return {
    ...state,
    elapsedMs,
    windowElapsedMs,
    tickCount,
    pending: currentPending,
    players,
    lastTick,
    result,
    resultReason,
    view: computeView(cfg, players, elapsedMs),
  };
}
