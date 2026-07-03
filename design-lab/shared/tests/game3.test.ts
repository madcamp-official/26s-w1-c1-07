import { describe, it, expect } from 'vitest';
import {
  createGame3State,
  tickGame3 as tick,
  resolveGame3Pushed as resolvePushed,
  GAME3_DEFAULT_CONFIG,
  type Game3Action,
  type Game3Move,
  type Game3State,
} from '../src/index.js';
import type { PlayerRole } from '../src/index.js';

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function act(player: PlayerRole, type: 'ATTACK' | 'DODGE'): Game3Action {
  return { gameId: 3, player, type };
}

/** 한 틱 윈도우(1000ms)를 지정 행동으로 진행. 'NONE'이면 입력을 넣지 않는다. */
function playTick(state: Game3State, p1: Game3Move, p2: Game3Move): Game3State {
  const inputs: Game3Action[] = [];
  if (p1 !== 'NONE') inputs.push(act('P1', p1));
  if (p2 !== 'NONE') inputs.push(act('P2', p2));
  return tick(state, inputs, state.config.tickIntervalMs);
}

describe('createGame3State — 초기 상태', () => {
  it('기본 설정: 낭떠러지에서 3칸(임시값), 진행 중, 판정 이력 없음', () => {
    const s = createGame3State();
    expect(s.gameId).toBe(3);
    expect(s.config).toEqual(GAME3_DEFAULT_CONFIG);
    expect(s.players.P1).toEqual({ distanceFromEdge: 3, pushedCount: 0 });
    expect(s.players.P2).toEqual({ distanceFromEdge: 3, pushedCount: 0 });
    expect(s.elapsedMs).toBe(0);
    expect(s.tickCount).toBe(0);
    expect(s.pending).toEqual({ P1: 'NONE', P2: 'NONE' });
    expect(s.lastTick).toBeNull();
    expect(s.result).toBeNull();
    expect(s.resultReason).toBeNull();
  });

  it('설정 일부만 오버라이드할 수 있다', () => {
    const s = createGame3State({ startDistanceFromEdge: 5, roundDurationMs: 10_000 });
    expect(s.players.P1.distanceFromEdge).toBe(5);
    expect(s.config.roundDurationMs).toBe(10_000);
    expect(s.config.tickIntervalMs).toBe(1000); // 기본값 유지
  });

  it('초기 view: 중앙 인접 배치, 남은 시간 = 라운드 시간', () => {
    const s = createGame3State(); // start 3 → trackLength 8 (임시값)
    expect(s.view.trackLength).toBe(8);
    expect(s.view.p1Cell).toBe(3);
    expect(s.view.p2Cell).toBe(4);
    expect(s.view.timeRemainingMs).toBe(GAME3_DEFAULT_CONFIG.roundDurationMs);
  });
});

describe('상성 판정 (resolvePushed)', () => {
  it('공격 vs 회피 → 공격자 밀림', () => {
    expect(resolvePushed('ATTACK', 'DODGE')).toBe('P1');
    expect(resolvePushed('DODGE', 'ATTACK')).toBe('P2');
  });

  it('회피 vs 무행동 → 회피자 밀림', () => {
    expect(resolvePushed('DODGE', 'NONE')).toBe('P1');
    expect(resolvePushed('NONE', 'DODGE')).toBe('P2');
  });

  it('무행동 vs 공격 → 무행동자 밀림', () => {
    expect(resolvePushed('NONE', 'ATTACK')).toBe('P1');
    expect(resolvePushed('ATTACK', 'NONE')).toBe('P2');
  });

  it('동일 행동 3종 → 아무도 안 밀림', () => {
    expect(resolvePushed('ATTACK', 'ATTACK')).toBeNull();
    expect(resolvePushed('DODGE', 'DODGE')).toBeNull();
    expect(resolvePushed('NONE', 'NONE')).toBeNull();
  });
});

describe('tick — 판정과 밀림 반영', () => {
  it('공격 vs 회피: 공격자(P1)가 1칸 밀리고 이벤트가 기록된다', () => {
    const s0 = createGame3State();
    const s1 = playTick(s0, 'ATTACK', 'DODGE');
    expect(s1.players.P1.distanceFromEdge).toBe(2);
    expect(s1.players.P1.pushedCount).toBe(1);
    expect(s1.players.P2.distanceFromEdge).toBe(3);
    expect(s1.lastTick).toEqual({
      tickIndex: 1,
      moves: { P1: 'ATTACK', P2: 'DODGE' },
      pushed: 'P1',
      clash: false,
      fell: null,
    });
    expect(s1.view.p1Cell).toBe(2);
  });

  it('회피 vs 무행동: 회피자(P1)가 밀린다', () => {
    const s1 = playTick(createGame3State(), 'DODGE', 'NONE');
    expect(s1.players.P1.distanceFromEdge).toBe(2);
    expect(s1.lastTick!.pushed).toBe('P1');
    expect(s1.lastTick!.moves).toEqual({ P1: 'DODGE', P2: 'NONE' });
  });

  it('무행동 vs 공격: 무행동자(P1)가 밀린다', () => {
    const s1 = playTick(createGame3State(), 'NONE', 'ATTACK');
    expect(s1.players.P1.distanceFromEdge).toBe(2);
    expect(s1.lastTick!.pushed).toBe('P1');
  });

  it('역방향(P2가 밀리는 쪽)도 대칭으로 동작한다', () => {
    const s1 = playTick(createGame3State(), 'DODGE', 'ATTACK');
    expect(s1.players.P2.distanceFromEdge).toBe(2);
    expect(s1.players.P1.distanceFromEdge).toBe(3);
    expect(s1.lastTick!.pushed).toBe('P2');
    expect(s1.view.p2Cell).toBe(5); // 오른쪽으로 1칸 밀림
  });

  it('동일 행동: 밀림 없음, clash 이벤트만 발생', () => {
    for (const move of ['ATTACK', 'DODGE', 'NONE'] as const) {
      const s1 = playTick(createGame3State(), move, move);
      expect(s1.players.P1.distanceFromEdge).toBe(3);
      expect(s1.players.P2.distanceFromEdge).toBe(3);
      expect(s1.lastTick).toEqual({
        tickIndex: 1,
        moves: { P1: move, P2: move },
        pushed: null,
        clash: true,
        fell: null,
      });
    }
  });

  it('원본 state를 변경하지 않는다 (불변)', () => {
    const s0 = createGame3State();
    playTick(s0, 'ATTACK', 'DODGE');
    expect(s0.players.P1.distanceFromEdge).toBe(3);
    expect(s0.elapsedMs).toBe(0);
    expect(s0.lastTick).toBeNull();
  });
});

describe('틱 윈도우 — 입력 수집 규칙', () => {
  it('윈도우 내 다중 입력은 마지막 입력 채택 (임시값)', () => {
    const s0 = createGame3State();
    // P1: ATTACK 입력 후 DODGE로 변경 → DODGE 채택. P2: 무행동.
    // DODGE vs NONE → P1 밀림.
    const s1 = tick(s0, [act('P1', 'ATTACK'), act('P1', 'DODGE')], 1000);
    expect(s1.lastTick!.moves.P1).toBe('DODGE');
    expect(s1.lastTick!.pushed).toBe('P1');
  });

  it('윈도우가 끝나기 전에는 판정하지 않고 입력만 누적한다', () => {
    const s0 = createGame3State();
    const s1 = tick(s0, [act('P1', 'ATTACK')], 400);
    expect(s1.tickCount).toBe(0);
    expect(s1.lastTick).toBeNull();
    expect(s1.pending.P1).toBe('ATTACK');
    // 나머지 600ms 경과 시 이전에 누적된 입력으로 판정
    const s2 = tick(s1, [act('P2', 'DODGE')], 600);
    expect(s2.tickCount).toBe(1);
    expect(s2.lastTick!.moves).toEqual({ P1: 'ATTACK', P2: 'DODGE' });
    expect(s2.lastTick!.pushed).toBe('P1');
  });

  it('경계값: dt 999ms는 판정 없음, 누적 1000ms에 판정', () => {
    const s0 = createGame3State();
    const s1 = tick(s0, [], 999);
    expect(s1.tickCount).toBe(0);
    const s2 = tick(s1, [], 1);
    expect(s2.tickCount).toBe(1);
  });

  it('판정 후 pending은 무행동으로 리셋된다', () => {
    const s1 = playTick(createGame3State(), 'ATTACK', 'ATTACK');
    expect(s1.pending).toEqual({ P1: 'NONE', P2: 'NONE' });
  });

  it('큰 dt가 여러 윈도우를 지나면 첫 윈도우만 입력 판정, 이후는 무행동/무행동 (가정)', () => {
    const s0 = createGame3State();
    const s1 = tick(s0, [act('P1', 'ATTACK'), act('P2', 'DODGE')], 2500);
    expect(s1.tickCount).toBe(2);
    // 두 번째 윈도우는 NONE vs NONE → clash
    expect(s1.lastTick!.moves).toEqual({ P1: 'NONE', P2: 'NONE' });
    expect(s1.lastTick!.clash).toBe(true);
    // 첫 윈도우 결과(P1 밀림)는 누적치로 확인
    expect(s1.players.P1.distanceFromEdge).toBe(2);
    expect(s1.windowElapsedMs).toBe(500);
  });
});

describe('링아웃 — 승리 조건', () => {
  it('3번 밀려 벼랑 끝(distance 0)까지는 생존한다 (가정)', () => {
    let s = createGame3State();
    for (let i = 0; i < 3; i++) s = playTick(s, 'ATTACK', 'DODGE'); // P1 3번 밀림
    expect(s.players.P1.distanceFromEdge).toBe(0);
    expect(s.result).toBeNull();
  });

  it('3칸 넘게(4번째) 밀리면 낙사 = 즉시 패배', () => {
    let s = createGame3State();
    for (let i = 0; i < 4; i++) s = playTick(s, 'ATTACK', 'DODGE');
    expect(s.result).toBe('P2_WIN');
    expect(s.resultReason).toBe('RING_OUT');
    expect(s.lastTick!.fell).toBe('P1');
    expect(s.players.P1.distanceFromEdge).toBe(-1);
  });

  it('P2가 낙사하면 P1_WIN', () => {
    let s = createGame3State({ startDistanceFromEdge: 1 });
    s = playTick(s, 'DODGE', 'ATTACK'); // P2 밀림 → 0
    s = playTick(s, 'DODGE', 'ATTACK'); // P2 밀림 → -1 낙사
    expect(s.result).toBe('P1_WIN');
    expect(s.resultReason).toBe('RING_OUT');
    expect(s.lastTick!.fell).toBe('P2');
  });

  it('게임 종료 후 tick은 no-op이다', () => {
    let s = createGame3State({ startDistanceFromEdge: 0 });
    s = playTick(s, 'ATTACK', 'DODGE'); // P1 즉시 낙사
    expect(s.result).toBe('P2_WIN');
    const after = tick(s, [act('P2', 'ATTACK')], 5000);
    expect(after).toBe(s); // 동일 참조
  });
});

describe('타임아웃 — 라운드 시간 종료 (임시값)', () => {
  it('더 많이 밀린 쪽이 패배한다', () => {
    let s = createGame3State({ roundDurationMs: 3000 });
    s = playTick(s, 'ATTACK', 'DODGE'); // P1 밀림 (1)
    s = playTick(s, 'ATTACK', 'ATTACK'); // clash
    s = playTick(s, 'ATTACK', 'DODGE'); // P1 밀림 (2) + 3000ms 도달
    expect(s.players.P1.pushedCount).toBe(2);
    expect(s.players.P2.pushedCount).toBe(0);
    expect(s.result).toBe('P2_WIN');
    expect(s.resultReason).toBe('TIMEOUT');
  });

  it('동률이면 무승부 (임시값)', () => {
    let s = createGame3State({ roundDurationMs: 3000 });
    s = playTick(s, 'ATTACK', 'DODGE'); // P1 밀림
    s = playTick(s, 'DODGE', 'ATTACK'); // P2 밀림
    s = playTick(s, 'NONE', 'NONE'); // clash + 시간 종료
    expect(s.result).toBe('DRAW');
    expect(s.resultReason).toBe('TIMEOUT');
  });

  it('한 번도 안 밀렸어도 시간이 다 되면 무승부로 끝난다', () => {
    const s0 = createGame3State({ roundDurationMs: 2000 });
    const s1 = tick(s0, [], 2000);
    expect(s1.result).toBe('DRAW');
    expect(s1.resultReason).toBe('TIMEOUT');
  });

  it('경계값: 종료 시각과 정확히 일치하는 틱은 판정된다 — 낙사가 타임아웃보다 우선 (가정)', () => {
    // start 0: 한 번만 밀려도 낙사. 라운드 종료 = 첫 틱 경계 = 1000ms.
    let s = createGame3State({ startDistanceFromEdge: 0, roundDurationMs: 1000 });
    s = playTick(s, 'ATTACK', 'DODGE'); // 1000ms: P1 밀림 → 낙사
    expect(s.result).toBe('P2_WIN');
    expect(s.resultReason).toBe('RING_OUT'); // TIMEOUT이 아님
  });

  it('경계값: 라운드 종료 이후의 윈도우 경계는 판정하지 않는다 (가정)', () => {
    // 종료 2500ms, 큰 dt로 3000ms 경계를 넘겨도 3번째 틱은 판정 안 됨
    let s = createGame3State({ roundDurationMs: 2500 });
    s = tick(s, [], 2000); // 틱 2회 (모두 NONE/NONE clash)
    expect(s.tickCount).toBe(2);
    expect(s.result).toBeNull();
    s = tick(s, [act('P1', 'ATTACK')], 1100); // 3100ms — 3000ms 경계는 종료 이후
    expect(s.tickCount).toBe(2); // 추가 판정 없음
    expect(s.result).toBe('DRAW');
    expect(s.resultReason).toBe('TIMEOUT');
  });

  it('타임아웃 직전 마지막 틱에서의 밀림도 집계에 반영된다', () => {
    let s = createGame3State({ roundDurationMs: 1000 });
    s = playTick(s, 'NONE', 'ATTACK'); // 1000ms 경계: P1 밀림 → 즉시 타임아웃 판정
    expect(s.result).toBe('P2_WIN');
    expect(s.resultReason).toBe('TIMEOUT');
  });
});

describe('결정성 — 랜덤 요소 없음', () => {
  it('rng와 무관하게 동일 입력 시퀀스는 동일 결과를 낸다', () => {
    const rngA = () => 0.123;
    const rngB = () => 0.987;
    const run = (rng: () => number) => {
      let s = createGame3State({}, rng);
      s = playTick(s, 'ATTACK', 'DODGE');
      s = playTick(s, 'DODGE', 'NONE');
      s = playTick(s, 'NONE', 'ATTACK');
      return s;
    };
    const a = run(rngA);
    const b = run(rngB);
    expect(a.players).toEqual(b.players);
    expect(a.lastTick).toEqual(b.lastTick);
    expect(a.result).toEqual(b.result);
  });
});

describe('view — 렌더러용 파생 정보', () => {
  it('밀린 만큼 셀 위치와 남은 시간이 갱신된다', () => {
    let s = createGame3State(); // trackLength 8, p1Cell 3, p2Cell 4
    s = playTick(s, 'ATTACK', 'DODGE'); // P1 왼쪽으로 1칸
    expect(s.view).toEqual({
      trackLength: 8,
      p1Cell: 2,
      p2Cell: 4,
      timeRemainingMs: GAME3_DEFAULT_CONFIG.roundDurationMs - 1000,
    });
  });

  it('timeRemainingMs는 0 밑으로 내려가지 않는다', () => {
    let s = createGame3State({ roundDurationMs: 1000 });
    s = tick(s, [], 5000);
    expect(s.view.timeRemainingMs).toBe(0);
  });
});
