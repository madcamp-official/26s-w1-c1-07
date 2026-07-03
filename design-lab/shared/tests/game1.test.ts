import { describe, it, expect } from 'vitest';
import {
  createGame1State,
  tick,
  game1ActionFromKey,
  GAME1_MIN_VALUE,
  GAME1_MAX_VALUE,
  GAME1_HOLD_TO_WIN_MS,
  type Game1Action,
  type Game1State,
} from '../src/index.js';
import type { InputFrame, PlayerRole, RoundConfig } from '../src/index.js';

// ---------------------------------------------------------------------------
// 테스트 헬퍼
// ---------------------------------------------------------------------------

/** 임시값/가정: 테스트용 기본 라운드 설정 (1라운드, 라운드당 30초) */
const config: RoundConfig = { roundCount: 1, timePerRoundSec: 30 };

/** 정해진 수열을 차례로 반환하는 rng (소진 후엔 마지막 값 반복) */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

/** 액션 프레임 생성 헬퍼 */
let frameNo = 0;
function frame(actions: Game1Action[] = [], elapsedMs = 0): InputFrame<Game1Action> {
  return { frame: frameNo++, elapsedMs, actions };
}

function up(player: PlayerRole): Game1Action {
  return { gameId: 1, player, type: 'INCREMENT' };
}
function down(player: PlayerRole): Game1Action {
  return { gameId: 1, player, type: 'DECREMENT' };
}

/**
 * target=50, P1=49, P2=51로 시작하는 결정적 상태.
 * rng 호출 순서: 타겟 → P1 시작값 → P2 시작값.
 * - 0.49 → 타겟 = 1 + floor(0.49*100) = 50
 * - P1: 1 + floor(0.49*99) = 1+48 = 49 (< 50이므로 그대로)
 * - P2: 1 + floor(0.5*99) = 1+49 = 50 → 타겟(50) 이상이라 +1 → 51
 */
function makeFixedState(): Game1State {
  const s = createGame1State(config, seqRng([0.49, 0.49, 0.5]));
  expect(s.target).toBe(50);
  expect(s.players.P1.value).toBe(49);
  expect(s.players.P2.value).toBe(51);
  return s;
}

// ---------------------------------------------------------------------------
// 생성 (createGame1State)
// ---------------------------------------------------------------------------

describe('createGame1State — 초기 상태', () => {
  it('rng 경계값에서도 타겟이 [1,100] 안에 있다', () => {
    expect(createGame1State(config, seqRng([0, 0, 0])).target).toBe(GAME1_MIN_VALUE);
    expect(createGame1State(config, seqRng([0.9999999, 0, 0])).target).toBe(GAME1_MAX_VALUE);
  });

  it('플레이어 시작값은 항상 타겟과 다르고 [1,100] 안에 있다', () => {
    // 다양한 rng 조합을 전수에 가깝게 훑는다
    for (let t = 0; t < 1; t += 0.07) {
      for (let p = 0; p < 1; p += 0.07) {
        const s = createGame1State(config, seqRng([t, p, p]));
        for (const role of ['P1', 'P2'] as const) {
          const v = s.players[role].value;
          expect(v).not.toBe(s.target);
          expect(v).toBeGreaterThanOrEqual(GAME1_MIN_VALUE);
          expect(v).toBeLessThanOrEqual(GAME1_MAX_VALUE);
        }
      }
    }
  });

  it('rng가 타겟 자리를 뽑아도 시작값이 타겟을 건너뛴다 (경계: 타겟=100)', () => {
    // 타겟=100, 시작값 rng가 최댓값 쪽 → 100이 아니라 99가 나와야 함
    const s = createGame1State(config, seqRng([0.9999999, 0.9999999, 0.9999999]));
    expect(s.target).toBe(100);
    expect(s.players.P1.value).toBe(99);
    expect(s.players.P2.value).toBe(99);
  });

  it('rng가 타겟 자리를 뽑아도 시작값이 타겟을 건너뛴다 (경계: 타겟=1)', () => {
    const s = createGame1State(config, seqRng([0, 0, 0]));
    expect(s.target).toBe(1);
    expect(s.players.P1.value).toBe(2); // 1을 건너뛰고 2
    expect(s.players.P2.value).toBe(2);
  });

  it('초기 필드: result=null, holdMs=0, elapsedMs=0, timeLimitMs=timePerRoundSec*1000', () => {
    const s = makeFixedState();
    expect(s.result).toBeNull();
    expect(s.elapsedMs).toBe(0);
    expect(s.timeLimitMs).toBe(30_000);
    expect(s.players.P1.holdMs).toBe(0);
    expect(s.players.P2.holdMs).toBe(0);
  });

  it('초기 파생 정보(derived)가 렌더러용으로 채워진다', () => {
    const s = makeFixedState();
    expect(s.derived.P1).toEqual({
      diff: -1,
      matched: false,
      holdProgress: 0,
      holdRemainingMs: GAME1_HOLD_TO_WIN_MS,
    });
    expect(s.derived.P2.diff).toBe(1);
    expect(s.derived.timeRemainingMs).toBe(30_000);
  });
});

// ---------------------------------------------------------------------------
// 액션 적용 (key1=내리기, key2=올리기)
// ---------------------------------------------------------------------------

describe('tick — 액션 적용', () => {
  it('INCREMENT는 +1, DECREMENT는 -1', () => {
    const s0 = makeFixedState();
    const s1 = tick(s0, frame([up('P1'), down('P2')]), 16);
    expect(s1.players.P1.value).toBe(50);
    expect(s1.players.P2.value).toBe(50);
  });

  it('같은 프레임의 액션 여러 개가 순서대로 누적된다', () => {
    const s0 = makeFixedState();
    const s1 = tick(s0, frame([up('P1'), up('P1'), up('P1')]), 16);
    expect(s1.players.P1.value).toBe(52);
  });

  it('경계값: 1 아래로 내려가지 않는다 (클램프 — 가정)', () => {
    let s = createGame1State(config, seqRng([0.49, 0, 0])); // P1=P2=1 (target 50)
    expect(s.players.P1.value).toBe(1);
    s = tick(s, frame([down('P1'), down('P1'), down('P1')]), 16);
    expect(s.players.P1.value).toBe(GAME1_MIN_VALUE);
  });

  it('경계값: 100 위로 올라가지 않는다 (클램프 — 가정)', () => {
    let s = createGame1State(config, seqRng([0.49, 0.9999999, 0.9999999])); // P1=P2=100
    expect(s.players.P1.value).toBe(100);
    s = tick(s, frame([up('P1'), up('P1')]), 16);
    expect(s.players.P1.value).toBe(GAME1_MAX_VALUE);
  });

  it('다른 게임(gameId!==1)의 액션은 무시한다', () => {
    const s0 = makeFixedState();
    const alien = { gameId: 2, player: 'P1', type: 'INCREMENT' } as unknown as Game1Action;
    const s1 = tick(s0, frame([alien]), 16);
    expect(s1.players.P1.value).toBe(49);
  });

  it('game1ActionFromKey: key1=내리기, key2=올리기', () => {
    expect(game1ActionFromKey('P1', 'key1')).toEqual({ gameId: 1, player: 'P1', type: 'DECREMENT' });
    expect(game1ActionFromKey('P2', 'key2')).toEqual({ gameId: 1, player: 'P2', type: 'INCREMENT' });
  });
});

// ---------------------------------------------------------------------------
// 승리 판정 (3000ms 유지)
// ---------------------------------------------------------------------------

describe('tick — 유지 타이머와 승리 판정', () => {
  it('타겟 일치 중이면 holdMs가 dtMs만큼 누적된다', () => {
    let s = makeFixedState();
    s = tick(s, frame([up('P1')]), 16); // P1=50 일치, 이 틱부터 누적
    expect(s.players.P1.holdMs).toBe(16);
    s = tick(s, frame(), 100);
    expect(s.players.P1.holdMs).toBe(116);
    expect(s.players.P2.holdMs).toBe(0); // P2(51)는 불일치
  });

  it('일치 상태로 3000ms를 채우면 승리한다 (정확히 3000ms 경계 포함)', () => {
    let s = makeFixedState();
    s = tick(s, frame([up('P1')]), 1000); // P1=50, hold 1000
    s = tick(s, frame(), 1000); // 2000
    expect(s.result).toBeNull();
    s = tick(s, frame(), 1000); // 정확히 3000 → 승리
    expect(s.players.P1.holdMs).toBe(GAME1_HOLD_TO_WIN_MS);
    expect(s.result).toBe('P1_WIN');
  });

  it('2999ms에서는 아직 승리가 아니다', () => {
    let s = makeFixedState();
    s = tick(s, frame([up('P1')]), 2999);
    expect(s.players.P1.holdMs).toBe(2999);
    expect(s.result).toBeNull();
  });

  it('P2도 같은 규칙으로 승리한다', () => {
    let s = makeFixedState();
    s = tick(s, frame([down('P2')]), 3000); // P2=50 일치 후 3000ms
    expect(s.result).toBe('P2_WIN');
  });

  it('일치가 깨지면 유지 타이머가 0으로 리셋되고, 다시 일치하면 처음부터 센다', () => {
    let s = makeFixedState();
    s = tick(s, frame([up('P1')]), 2000); // P1=50, hold 2000
    s = tick(s, frame([up('P1')]), 500); // P1=51 → 리셋
    expect(s.players.P1.holdMs).toBe(0);
    s = tick(s, frame([down('P1')]), 2900); // 다시 50, hold 2900
    expect(s.players.P1.holdMs).toBe(2900);
    expect(s.result).toBeNull();
    s = tick(s, frame(), 100); // 3000 도달
    expect(s.result).toBe('P1_WIN');
  });

  it('같은 틱에 일치를 깨는 액션이 들어오면 그 틱은 누적되지 않는다', () => {
    let s = makeFixedState();
    s = tick(s, frame([up('P1')]), 2999); // hold 2999
    // 3000을 채울 틱에 P1이 숫자를 움직여 일치가 깨짐 → 승리 무효
    s = tick(s, frame([up('P1')]), 1);
    expect(s.players.P1.value).toBe(51);
    expect(s.players.P1.holdMs).toBe(0);
    expect(s.result).toBeNull();
  });

  it('둘이 같은 틱에 동시에 3000ms를 채우면 무승부 (가정)', () => {
    let s = makeFixedState();
    s = tick(s, frame([up('P1'), down('P2')]), 3000); // 둘 다 50, 동시에 3000
    expect(s.players.P1.holdMs).toBe(3000);
    expect(s.players.P2.holdMs).toBe(3000);
    expect(s.result).toBe('DRAW');
  });

  it('둘 다 일치 중이어도 먼저 3000ms를 채운 쪽이 이긴다', () => {
    let s = makeFixedState();
    s = tick(s, frame([up('P1')]), 500); // P1 먼저 일치 (hold 500)
    s = tick(s, frame([down('P2')]), 2500); // P1 hold 3000 / P2 hold 2500
    expect(s.result).toBe('P1_WIN');
  });
});

// ---------------------------------------------------------------------------
// 타임아웃
// ---------------------------------------------------------------------------

describe('tick — 라운드 타임아웃', () => {
  it('제한 시간 도달 시 무승부 (가정)', () => {
    let s = makeFixedState();
    s = tick(s, frame(), 29_999);
    expect(s.result).toBeNull();
    s = tick(s, frame(), 1); // 정확히 30000ms
    expect(s.result).toBe('DRAW');
  });

  it('제한 시간을 넘겨도 무승부', () => {
    const s = tick(makeFixedState(), frame(), 60_000);
    expect(s.result).toBe('DRAW');
  });

  it('승리와 타임아웃이 같은 틱이면 승리가 우선한다 (가정)', () => {
    // timePerRoundSec=3 → 3000ms 시점에 유지 완성과 타임아웃이 동시 발생
    const shortConfig: RoundConfig = { roundCount: 1, timePerRoundSec: 3 };
    let s = createGame1State(shortConfig, seqRng([0.49, 0.49, 0.5]));
    s = tick(s, frame([up('P1')]), 3000);
    expect(s.elapsedMs).toBe(s.timeLimitMs);
    expect(s.result).toBe('P1_WIN');
  });
});

// ---------------------------------------------------------------------------
// 결과 확정 후 / 불변성
// ---------------------------------------------------------------------------

describe('tick — 결과 확정 후와 순수성', () => {
  it('결과가 확정되면 이후 tick은 상태를 바꾸지 않는다', () => {
    let s = makeFixedState();
    s = tick(s, frame([up('P1')]), 3000);
    expect(s.result).toBe('P1_WIN');
    const after = tick(s, frame([down('P1'), up('P2')]), 5000);
    expect(after).toBe(s); // 동일 참조 반환
  });

  it('tick은 입력 상태를 변형하지 않는다 (순수 함수)', () => {
    const s0 = makeFixedState();
    const snapshot = JSON.parse(JSON.stringify(s0));
    tick(s0, frame([up('P1'), down('P2')]), 3000);
    expect(s0).toEqual(snapshot);
  });

  it('파생 정보가 tick마다 갱신된다 (holdProgress, timeRemainingMs)', () => {
    let s = makeFixedState();
    s = tick(s, frame([up('P1')]), 1500); // P1 일치, hold 1500
    expect(s.derived.P1.matched).toBe(true);
    expect(s.derived.P1.holdProgress).toBeCloseTo(0.5);
    expect(s.derived.P1.holdRemainingMs).toBe(1500);
    expect(s.derived.P2.matched).toBe(false);
    expect(s.derived.timeRemainingMs).toBe(28_500);
    s = tick(s, frame(), 1500); // hold 3000 → 승리, progress 1로 캡
    expect(s.derived.P1.holdProgress).toBe(1);
    expect(s.derived.P1.holdRemainingMs).toBe(0);
  });
});
