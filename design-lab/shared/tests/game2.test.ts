import { describe, it, expect } from 'vitest';
import {
  createGame2State,
  tickGame2,
  reduceGame2Inputs,
  DEFAULT_GAME2_CONFIG,
  GAME2_IDLE_INPUTS,
  GAME2_TICK_MS,
  type Game2Action,
  type Game2Config,
  type Game2Inputs,
  type Game2State,
} from '../src/index.js';

/** 항상 같은 값을 돌려주는 결정적 rng */
const constRng = (v: number) => () => v;

/** 테스트용 축소 설정 — 수치 추론이 쉬운 값 (임시값/가정과 무관, 테스트 전용) */
const CFG: Game2Config = {
  fieldWidth: 100,
  fieldHeight: 100,
  attackerY: 10,
  dodgerY: 90,
  attackerSpeed: 40, // 50ms 틱당 2 units
  dodgerSpeed: 50, // 50ms 틱당 2.5 units
  attackerHalfWidth: 4,
  dodgerHalfWidth: 4,
  bulletRadius: 1.5,
  bulletSpeedMin: 60,
  bulletSpeedMax: 140,
  fireCooldownMs: 400,
  roundDurationMs: 2_000,
};

function inputs(patch: Partial<Game2Inputs>): Game2Inputs {
  return { ...GAME2_IDLE_INPUTS, ...patch };
}

/** n틱 동안 같은 입력으로 진행 */
function run(state: Game2State, ins: Game2Inputs, n: number, dtMs = GAME2_TICK_MS): Game2State {
  let s = state;
  for (let i = 0; i < n; i++) s = tickGame2(s, ins, dtMs);
  return s;
}

describe('createGame2State — 초기 상태', () => {
  it('중앙 배치, 총알 없음, result null', () => {
    const s = createGame2State(CFG, constRng(0.5));
    expect(s.attacker.x).toBe(50);
    expect(s.attacker.dir).toBe(1);
    expect(s.attacker.cooldownMs).toBe(0);
    expect(s.dodger.x).toBe(50);
    expect(s.bullets).toHaveLength(0);
    expect(s.result).toBeNull();
    expect(s.elapsedMs).toBe(0);
  });

  it('부분 설정은 기본값과 병합된다', () => {
    const s = createGame2State({ fieldWidth: 200 }, constRng(0));
    expect(s.config.fieldWidth).toBe(200);
    expect(s.config.fireCooldownMs).toBe(DEFAULT_GAME2_CONFIG.fireCooldownMs);
  });

  it('렌더러용 view가 초기부터 채워져 있다', () => {
    const s = createGame2State(CFG, constRng(0));
    expect(s.view.remainingMs).toBe(CFG.roundDurationMs);
    expect(s.view.attackerXRatio).toBeCloseTo(0.5);
    expect(s.view.dodgerXRatio).toBeCloseTo(0.5);
    expect(s.view.fireReadyRatio).toBe(1);
    expect(s.view.bullets).toHaveLength(0);
  });
});

describe('P1 공격자 — 자동 이동/반사/방향 전환', () => {
  it('입력 없이도 등속으로 자동 이동한다 (40u/s → 50ms에 2u)', () => {
    const s0 = createGame2State(CFG, constRng(0));
    const s1 = tickGame2(s0, GAME2_IDLE_INPUTS, 50);
    expect(s1.attacker.x).toBeCloseTo(52);
    expect(s1.attacker.dir).toBe(1);
  });

  it('오른쪽 경계(fieldWidth - halfWidth)에서 반사한다', () => {
    // x=95가 아니라 96(=100-4)이 경계. 95에서 2u 이동하면 97 → 반사되어 95
    let s = createGame2State(CFG, constRng(0));
    s = { ...s, attacker: { ...s.attacker, x: 95, dir: 1 } };
    const s1 = tickGame2(s, GAME2_IDLE_INPUTS, 50);
    expect(s1.attacker.x).toBeCloseTo(95); // 96까지 1u + 반사 후 1u 되돌아옴
    expect(s1.attacker.dir).toBe(-1);
  });

  it('왼쪽 경계(halfWidth)에서 반사한다', () => {
    let s = createGame2State(CFG, constRng(0));
    s = { ...s, attacker: { ...s.attacker, x: 5, dir: -1 } };
    const s1 = tickGame2(s, GAME2_IDLE_INPUTS, 50);
    expect(s1.attacker.x).toBeCloseTo(5); // 4까지 1u + 반사 후 1u
    expect(s1.attacker.dir).toBe(1);
  });

  it('TURN 입력이 이동 방향을 뒤집는다', () => {
    const s0 = createGame2State(CFG, constRng(0));
    const s1 = tickGame2(s0, inputs({ p1Turn: true }), 50);
    expect(s1.attacker.dir).toBe(-1);
    expect(s1.attacker.x).toBeCloseTo(48); // 전환 후 왼쪽으로 2u
  });
});

describe('P1 발사 — 총알 생성/랜덤 속도/쿨다운', () => {
  it('FIRE 시 공격자 위치에서 총알이 생성된다', () => {
    const s0 = createGame2State(CFG, constRng(0.5));
    const s1 = tickGame2(s0, inputs({ p1Fire: true }), 50);
    expect(s1.bullets).toHaveLength(1);
    expect(s1.bullets[0]!.x).toBeCloseTo(52); // 이동 후 위치에서 생성 (가정)
    expect(s1.bullets[0]!.y).toBe(CFG.attackerY);
  });

  it('총알 속도는 rng로 [min, max) 보간된다 — 경계값 rng=0, rng=1', () => {
    const sMin = tickGame2(createGame2State(CFG, constRng(0)), inputs({ p1Fire: true }), 50);
    expect(sMin.bullets[0]!.vy).toBe(CFG.bulletSpeedMin);

    const sMax = tickGame2(createGame2State(CFG, constRng(1)), inputs({ p1Fire: true }), 50);
    expect(sMax.bullets[0]!.vy).toBe(CFG.bulletSpeedMax);

    const sMid = tickGame2(createGame2State(CFG, constRng(0.5)), inputs({ p1Fire: true }), 50);
    expect(sMid.bullets[0]!.vy).toBeCloseTo(100); // 60 + 0.5*80
  });

  it('쿨다운 중에는 발사 입력이 무시된다 (연사 방지)', () => {
    let s = tickGame2(createGame2State(CFG, constRng(0)), inputs({ p1Fire: true }), 50);
    expect(s.bullets).toHaveLength(1);
    expect(s.attacker.cooldownMs).toBe(CFG.fireCooldownMs);

    // 쿨다운(400ms) 동안 매 틱 발사 시도 → 총알 수 그대로
    s = run(s, inputs({ p1Fire: true }), 7); // 7틱 = 350ms < 400ms
    expect(s.bullets).toHaveLength(1);

    // 8번째 틱에서 쿨다운 소진(400ms 경과) → 발사 성공
    s = tickGame2(s, inputs({ p1Fire: true }), 50);
    expect(s.bullets).toHaveLength(2);
  });

  it('총알은 동시에 여러 개 존재할 수 있고 id는 단조 증가한다', () => {
    // 낙하가 느린 설정으로 총알이 화면에 오래 남게 한다
    const cfg = { ...CFG, bulletSpeedMin: 10, bulletSpeedMax: 10, roundDurationMs: 60_000 };
    let s = createGame2State(cfg, constRng(0));
    s = tickGame2(s, inputs({ p1Fire: true }), 50);
    s = run(s, GAME2_IDLE_INPUTS, 8); // 쿨다운 소진
    s = tickGame2(s, inputs({ p1Fire: true }), 50);
    expect(s.bullets).toHaveLength(2);
    expect(s.bullets.map((b) => b.id)).toEqual([1, 2]);
  });
});

describe('P2 회피자 — 홀드 이동/경계/동시 입력', () => {
  it('키를 누르는 동안만 이동한다 (50u/s → 50ms에 2.5u)', () => {
    const s0 = createGame2State(CFG, constRng(0));
    const s1 = tickGame2(s0, inputs({ p2Right: true }), 50);
    expect(s1.dodger.x).toBeCloseTo(52.5);
    const s2 = tickGame2(s1, GAME2_IDLE_INPUTS, 50); // 뗌 → 정지
    expect(s2.dodger.x).toBeCloseTo(52.5);
    const s3 = tickGame2(s2, inputs({ p2Left: true }), 50);
    expect(s3.dodger.x).toBeCloseTo(50);
  });

  it('경계에서 멈춘다 (반사 없음)', () => {
    let s = createGame2State(CFG, constRng(0));
    s = { ...s, dodger: { x: 95 } };
    const s1 = tickGame2(s, inputs({ p2Right: true }), 50);
    expect(s1.dodger.x).toBe(96); // fieldWidth - dodgerHalfWidth
    const s2 = tickGame2(s1, inputs({ p2Right: true }), 50);
    expect(s2.dodger.x).toBe(96);
  });

  it('좌우 동시 입력은 상쇄된다 (가정)', () => {
    const s0 = createGame2State(CFG, constRng(0));
    const s1 = tickGame2(s0, inputs({ p2Left: true, p2Right: true }), 50);
    expect(s1.dodger.x).toBe(50);
  });
});

describe('승리 조건 — 충돌 시 P1 승', () => {
  it('총알이 회피자 히트박스에 닿으면 P1_WIN', () => {
    // 회피자 바로 위 총알: 같은 x, 빠르게 낙하 → 트랙 통과 시 명중
    let s = createGame2State(CFG, constRng(0));
    s = {
      ...s,
      bullets: [{ id: 1, x: 50, y: 85, vy: 140 }], // 50ms에 7u → 92, 트랙(90) 통과
    };
    const s1 = tickGame2(s, GAME2_IDLE_INPUTS, 50);
    expect(s1.result).toBe('P1_WIN');
  });

  it('x가 히트 폭 밖이면 스쳐 지나간다 (경계값: halfWidth+radius)', () => {
    // 히트 반폭 = dodgerHalfWidth(4) + bulletRadius(1.5) = 5.5
    const mk = (bx: number) => {
      let s = createGame2State(CFG, constRng(0));
      s = { ...s, bullets: [{ id: 1, x: bx, y: 85, vy: 140 }] };
      return tickGame2(s, GAME2_IDLE_INPUTS, 50);
    };
    expect(mk(55.5).result).toBe('P1_WIN'); // 경계 정확히 닿음 → 히트 (<= 판정)
    expect(mk(55.6).result).toBeNull(); // 경계 밖 → 미스
  });

  it('빠른 총알이 한 틱에 트랙을 관통해도 히트된다 (터널링 방지)', () => {
    const cfg = { ...CFG, bulletSpeedMax: 4000, bulletSpeedMin: 4000 };
    let s = createGame2State(cfg, constRng(0));
    // 한 틱(50ms)에 200u 낙하 → y 10 → 210으로 트랙(90)을 건너뜀
    s = { ...s, bullets: [{ id: 1, x: 50, y: 10, vy: 4000 }] };
    const s1 = tickGame2(s, GAME2_IDLE_INPUTS, 50);
    expect(s1.result).toBe('P1_WIN');
  });

  it('회피자가 이동해 피하면 result는 null 유지', () => {
    const cfg = { ...CFG, roundDurationMs: 60_000 };
    let s = createGame2State(cfg, constRng(0));
    s = { ...s, bullets: [{ id: 1, x: 40, y: 85, vy: 140 }], dodger: { x: 60 } };
    const s1 = tickGame2(s, GAME2_IDLE_INPUTS, 50);
    expect(s1.result).toBeNull();
  });

  it('화면 밖으로 나간 총알은 제거된다', () => {
    const cfg = { ...CFG, roundDurationMs: 60_000 };
    let s = createGame2State(cfg, constRng(0));
    s = { ...s, bullets: [{ id: 1, x: 10, y: 98, vy: 140 }], dodger: { x: 60 } };
    const s1 = tickGame2(s, GAME2_IDLE_INPUTS, 50); // y 98 → 105 > 100(+r)
    expect(s1.bullets).toHaveLength(0);
    expect(s1.result).toBeNull();
  });
});

describe('승리 조건 — 타임아웃 시 P2 승 (가정: 생존 = P2 승리)', () => {
  it('제한 시간 도달까지 생존하면 P2_WIN', () => {
    let s = createGame2State(CFG, constRng(0)); // roundDurationMs = 2000
    s = run(s, GAME2_IDLE_INPUTS, 39); // 1950ms — 아직 진행 중
    expect(s.result).toBeNull();
    s = tickGame2(s, GAME2_IDLE_INPUTS, 50); // 2000ms 도달
    expect(s.result).toBe('P2_WIN');
    expect(s.elapsedMs).toBe(2000);
  });

  it('마지막 틱의 dt가 제한 시간을 초과해도 elapsedMs는 클램프된다', () => {
    let s = createGame2State(CFG, constRng(0));
    s = run(s, GAME2_IDLE_INPUTS, 39); // 1950ms
    s = tickGame2(s, GAME2_IDLE_INPUTS, 500); // 초과분은 버림 (가정)
    expect(s.result).toBe('P2_WIN');
    expect(s.elapsedMs).toBe(2000);
  });

  it('타임아웃 틱 이내의 충돌은 P1 승이 우선한다', () => {
    let s = createGame2State(CFG, constRng(0));
    s = run(s, GAME2_IDLE_INPUTS, 39); // 1950ms
    s = { ...s, bullets: [{ id: 1, x: 50, y: 85, vy: 140 }] };
    const s1 = tickGame2(s, GAME2_IDLE_INPUTS, 50); // 같은 틱에 충돌 + 타임아웃
    expect(s1.result).toBe('P1_WIN');
  });
});

describe('결과 확정 후 — 상태 동결', () => {
  it('result 확정 후 틱은 상태를 바꾸지 않는다 (동일 참조 반환)', () => {
    let s = createGame2State(CFG, constRng(0));
    s = { ...s, bullets: [{ id: 1, x: 50, y: 85, vy: 140 }] };
    const done = tickGame2(s, GAME2_IDLE_INPUTS, 50);
    expect(done.result).toBe('P1_WIN');
    const after = tickGame2(done, inputs({ p1Fire: true, p2Left: true }), 50);
    expect(after).toBe(done);
  });
});

describe('순수성 — 입력 상태 불변', () => {
  it('tick은 이전 상태를 변형하지 않는다', () => {
    const s0 = createGame2State(CFG, constRng(0.5));
    const snapshot = JSON.parse(JSON.stringify({ ...s0, rng: undefined }));
    tickGame2(s0, inputs({ p1Fire: true, p2Right: true }), 50);
    expect(JSON.parse(JSON.stringify({ ...s0, rng: undefined }))).toEqual(snapshot);
  });

  it('dtMs가 0 이하이면 상태를 그대로 반환한다', () => {
    const s0 = createGame2State(CFG, constRng(0));
    expect(tickGame2(s0, GAME2_IDLE_INPUTS, 0)).toBe(s0);
    expect(tickGame2(s0, GAME2_IDLE_INPUTS, -50)).toBe(s0);
  });
});

describe('렌더러용 파생 정보 (view)', () => {
  it('남은 시간/쿨다운 게이지/정규화 좌표가 갱신된다', () => {
    let s = createGame2State(CFG, constRng(0));
    s = tickGame2(s, inputs({ p1Fire: true }), 50);
    expect(s.view.remainingMs).toBe(CFG.roundDurationMs - 50);
    expect(s.view.fireCooldownRemainingMs).toBe(CFG.fireCooldownMs);
    expect(s.view.fireReadyRatio).toBe(0); // 방금 발사
    expect(s.view.attackerXRatio).toBeCloseTo(0.52);
    expect(s.view.bullets).toHaveLength(1);
    expect(s.view.bullets[0]!.yRatio).toBeCloseTo(CFG.attackerY / CFG.fieldHeight);

    s = tickGame2(s, GAME2_IDLE_INPUTS, 200); // 쿨다운 절반 소진
    expect(s.view.fireReadyRatio).toBeCloseTo(0.5);
  });
});

describe('reduceGame2Inputs — 액션 → 입력 스냅샷', () => {
  const act = (player: 'P1' | 'P2', type: Game2Action['type']): Game2Action => ({
    gameId: 2,
    player,
    type,
  });

  it('P1 엣지는 매 틱 리셋되고, P2 홀드는 유지된다', () => {
    const t1 = reduceGame2Inputs(GAME2_IDLE_INPUTS, [act('P1', 'FIRE'), act('P2', 'LEFT_DOWN')]);
    expect(t1).toEqual(inputs({ p1Fire: true, p2Left: true }));

    const t2 = reduceGame2Inputs(t1, []); // 다음 틱: 액션 없음
    expect(t2).toEqual(inputs({ p2Left: true })); // FIRE는 리셋, LEFT는 유지

    const t3 = reduceGame2Inputs(t2, [act('P2', 'LEFT_UP')]);
    expect(t3).toEqual(GAME2_IDLE_INPUTS);
  });

  it('역할이 맞지 않는 액션은 무시된다 (가정: 크로스 입력 차단)', () => {
    const t = reduceGame2Inputs(GAME2_IDLE_INPUTS, [
      act('P2', 'FIRE'), // P2가 발사 시도 → 무시
      act('P1', 'LEFT_DOWN'), // P1이 회피 이동 시도 → 무시
    ]);
    expect(t).toEqual(GAME2_IDLE_INPUTS);
  });
});
