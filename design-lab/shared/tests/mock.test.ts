import { describe, it, expect } from 'vitest';
import {
  computeLeaderboard,
  mockUsers,
  mockMatches,
  mockGroups,
  scoreConfig,
  type MockUser,
  type MockMatch,
} from '../src/index.js';

function user(id: string, groupId = 'g1'): MockUser {
  return { id, nickname: `nick-${id}`, avatarColorIndex: 0, groupId };
}

function match(
  id: string,
  p1: string,
  p2: string,
  result: MockMatch['result'],
  gameId: MockMatch['gameId'] = 1,
): MockMatch {
  return { id, gameId, player1Id: p1, player2Id: p2, result, playedAt: '2026-06-01T00:00:00Z' };
}

describe('mock 데이터 무결성', () => {
  it('유저 8명, 그룹 4개, 매치 40건', () => {
    expect(mockUsers).toHaveLength(8);
    expect(mockGroups).toHaveLength(4);
    expect(mockMatches).toHaveLength(40);
  });

  it('모든 매치의 플레이어/그룹 참조가 유효하다', () => {
    const userIds = new Set(mockUsers.map((u) => u.id));
    const groupIds = new Set(mockGroups.map((g) => g.id));
    for (const m of mockMatches) {
      expect(userIds.has(m.player1Id)).toBe(true);
      expect(userIds.has(m.player2Id)).toBe(true);
      expect(m.player1Id).not.toBe(m.player2Id);
    }
    for (const u of mockUsers) {
      expect(groupIds.has(u.groupId)).toBe(true);
    }
  });
});

describe('computeLeaderboard — 기본 집계', () => {
  it('승/무/패를 점수로 환산한다 (win:3, draw:1, loss:0)', () => {
    const users = [user('a'), user('b'), user('c')];
    const matches = [
      match('m1', 'a', 'b', 'P1_WIN'), // a승 b패
      match('m2', 'a', 'c', 'DRAW'),   // a무 c무
      match('m3', 'b', 'c', 'P2_WIN'), // b패 c승
    ];
    const lb = computeLeaderboard(users, matches, { win: 3, draw: 1, loss: 0 });

    expect(lb.entryOf('a')).toMatchObject({ score: 4, wins: 1, draws: 1, losses: 0 });
    expect(lb.entryOf('b')).toMatchObject({ score: 0, wins: 0, draws: 0, losses: 2 });
    expect(lb.entryOf('c')).toMatchObject({ score: 4, wins: 1, draws: 1, losses: 0 });
  });

  it('게임별 플레이 수/승수/승률을 산출한다', () => {
    const users = [user('a'), user('b')];
    const matches = [
      match('m1', 'a', 'b', 'P1_WIN', 1),
      match('m2', 'a', 'b', 'P2_WIN', 1),
      match('m3', 'a', 'b', 'P1_WIN', 2),
      match('m4', 'a', 'b', 'DRAW', 3),
    ];
    const lb = computeLeaderboard(users, matches, scoreConfig);
    const a = lb.entryOf('a')!;

    expect(a.perGame[1]).toEqual({ plays: 2, wins: 1, winRate: 0.5 });
    expect(a.perGame[2]).toEqual({ plays: 1, wins: 1, winRate: 1 });
    expect(a.perGame[3]).toEqual({ plays: 1, wins: 0, winRate: 0 });
    expect(a.totalPlays).toBe(4);
    expect(a.winRate).toBe(0.5);
  });

  it('플레이 기록이 없는 유저는 0점, 승률 0', () => {
    const users = [user('a'), user('ghost')];
    const matches: MockMatch[] = [];
    const lb = computeLeaderboard(users, matches, scoreConfig);
    const g = lb.entryOf('ghost')!;
    expect(g.score).toBe(0);
    expect(g.totalPlays).toBe(0);
    expect(g.winRate).toBe(0);
  });
});

describe('computeLeaderboard — 순위와 동점 처리', () => {
  it('동점자는 같은 등수, 다음 등수는 건너뛴다 (1, 1, 3)', () => {
    const users = [user('a'), user('b'), user('c'), user('d')];
    const matches = [
      match('m1', 'a', 'd', 'P1_WIN'), // a 3점
      match('m2', 'b', 'd', 'P1_WIN'), // b 3점
      match('m3', 'c', 'd', 'DRAW'),   // c 1점, d 1점
    ];
    const lb = computeLeaderboard(users, matches, { win: 3, draw: 1, loss: 0 });

    expect(lb.rankOf('a')).toBe(1);
    expect(lb.rankOf('b')).toBe(1);
    expect(lb.rankOf('c')).toBe(3); // 2등 없이 3등
    expect(lb.rankOf('d')).toBe(3);
  });

  it('동점 시 승수 많은 쪽이 먼저 정렬된다 (등수는 동일)', () => {
    // a: 1승 1패 = 3점, b: 3무 = 3점
    const users = [user('a'), user('b'), user('c')];
    const matches = [
      match('m1', 'a', 'c', 'P1_WIN'),
      match('m2', 'a', 'c', 'P2_WIN'),
      match('m3', 'b', 'c', 'DRAW'),
      match('m4', 'b', 'c', 'DRAW'),
      match('m5', 'b', 'c', 'DRAW'),
    ];
    const lb = computeLeaderboard(users, matches, { win: 3, draw: 1, loss: 0 });

    expect(lb.entryOf('a')!.score).toBe(3);
    expect(lb.entryOf('b')!.score).toBe(3);
    const idxA = lb.entries.findIndex((e) => e.userId === 'a');
    const idxB = lb.entries.findIndex((e) => e.userId === 'b');
    expect(idxA).toBeLessThan(idxB); // 승수 우선 정렬
    expect(lb.rankOf('a')).toBe(lb.rankOf('b')); // 등수는 같음
  });

  it('rankOf: 알 수 없는 유저는 null', () => {
    const lb = computeLeaderboard([user('a')], [], scoreConfig);
    expect(lb.rankOf('nobody')).toBeNull();
    expect(lb.entryOf('nobody')).toBeNull();
  });
});

describe('computeLeaderboard — 실제 mock 데이터', () => {
  const lb = computeLeaderboard(mockUsers, mockMatches, scoreConfig);

  it('TOP3는 3명이고 점수 내림차순이다', () => {
    expect(lb.top3).toHaveLength(3);
    expect(lb.top3[0]!.score).toBeGreaterThanOrEqual(lb.top3[1]!.score);
    expect(lb.top3[1]!.score).toBeGreaterThanOrEqual(lb.top3[2]!.score);
    expect(lb.top3[0]!.rank).toBe(1);
  });

  it('전체 플레이 수 합 = 매치 수 * 2', () => {
    const total = lb.entries.reduce((s, e) => s + e.totalPlays, 0);
    expect(total).toBe(mockMatches.length * 2);
  });

  it('유저별 게임별 plays 합 = totalPlays', () => {
    for (const e of lb.entries) {
      const sum = e.perGame[1].plays + e.perGame[2].plays + e.perGame[3].plays;
      expect(sum).toBe(e.totalPlays);
    }
  });

  it('모든 유저가 등수를 갖고, 내 등수 조회가 동작한다', () => {
    for (const u of mockUsers) {
      const r = lb.rankOf(u.id);
      expect(r).not.toBeNull();
      expect(r!).toBeGreaterThanOrEqual(1);
      expect(r!).toBeLessThanOrEqual(mockUsers.length);
    }
  });
});
