/**
 * MADPUMP 디자인 프로토타입용 mock 데이터 + 리더보드 산출 로직.
 * 백엔드가 붙기 전까지 10종 프로토타입이 공유하는 정본 mock.
 */
import type { GameId, MatchResult } from './types';

// ---------------------------------------------------------------------------
// Mock 엔티티
// ---------------------------------------------------------------------------

export interface MockUser {
  id: string;
  nickname: string;
  /** 이니셜 아바타 배경색 팔레트 인덱스 (0~7) */
  avatarColorIndex: number;
  groupId: string;
}

export interface MockGroup {
  id: string;
  name: string;
  isPublic: boolean;
}

export interface MockMatch {
  id: string;
  gameId: GameId;
  player1Id: string;
  player2Id: string;
  result: MatchResult;
  /** ISO 8601 */
  playedAt: string;
}

export const mockGroups: MockGroup[] = [
  { id: 'g1', name: '1분반', isPublic: true },
  { id: 'g2', name: '2분반', isPublic: true },
  { id: 'g3', name: '3분반', isPublic: false },
  { id: 'g4', name: '4분반', isPublic: true },
];

export const mockUsers: MockUser[] = [
  { id: 'u1', nickname: '펌프광인', avatarColorIndex: 0, groupId: 'g1' },
  { id: 'u2', nickname: '질주본능', avatarColorIndex: 1, groupId: 'g1' },
  { id: 'u3', nickname: '콩나물', avatarColorIndex: 2, groupId: 'g2' },
  { id: 'u4', nickname: '번개손', avatarColorIndex: 3, groupId: 'g2' },
  { id: 'u5', nickname: '슬로우스타터', avatarColorIndex: 4, groupId: 'g3' },
  { id: 'u6', nickname: '막판뒤집기', avatarColorIndex: 5, groupId: 'g3' },
  { id: 'u7', nickname: '평화주의자', avatarColorIndex: 6, groupId: 'g4' },
  { id: 'u8', nickname: '무한도전', avatarColorIndex: 7, groupId: 'g4' },
];

/** 매치 기록 40건 (하드코딩) */
export const mockMatches: MockMatch[] = [
  { id: 'm01', gameId: 1, player1Id: 'u1', player2Id: 'u2', result: 'P1_WIN', playedAt: '2026-06-01T10:00:00Z' },
  { id: 'm02', gameId: 1, player1Id: 'u3', player2Id: 'u4', result: 'P2_WIN', playedAt: '2026-06-01T10:10:00Z' },
  { id: 'm03', gameId: 2, player1Id: 'u5', player2Id: 'u6', result: 'DRAW',   playedAt: '2026-06-01T10:20:00Z' },
  { id: 'm04', gameId: 3, player1Id: 'u7', player2Id: 'u8', result: 'P1_WIN', playedAt: '2026-06-01T10:30:00Z' },
  { id: 'm05', gameId: 1, player1Id: 'u1', player2Id: 'u3', result: 'P1_WIN', playedAt: '2026-06-02T09:00:00Z' },
  { id: 'm06', gameId: 2, player1Id: 'u2', player2Id: 'u4', result: 'P1_WIN', playedAt: '2026-06-02T09:15:00Z' },
  { id: 'm07', gameId: 3, player1Id: 'u5', player2Id: 'u7', result: 'P2_WIN', playedAt: '2026-06-02T09:30:00Z' },
  { id: 'm08', gameId: 1, player1Id: 'u6', player2Id: 'u8', result: 'P2_WIN', playedAt: '2026-06-02T09:45:00Z' },
  { id: 'm09', gameId: 2, player1Id: 'u1', player2Id: 'u4', result: 'P1_WIN', playedAt: '2026-06-03T11:00:00Z' },
  { id: 'm10', gameId: 3, player1Id: 'u2', player2Id: 'u3', result: 'DRAW',   playedAt: '2026-06-03T11:20:00Z' },
  { id: 'm11', gameId: 1, player1Id: 'u5', player2Id: 'u8', result: 'P2_WIN', playedAt: '2026-06-03T11:40:00Z' },
  { id: 'm12', gameId: 2, player1Id: 'u6', player2Id: 'u7', result: 'P1_WIN', playedAt: '2026-06-03T12:00:00Z' },
  { id: 'm13', gameId: 3, player1Id: 'u1', player2Id: 'u5', result: 'P1_WIN', playedAt: '2026-06-04T14:00:00Z' },
  { id: 'm14', gameId: 1, player1Id: 'u2', player2Id: 'u6', result: 'P2_WIN', playedAt: '2026-06-04T14:20:00Z' },
  { id: 'm15', gameId: 2, player1Id: 'u3', player2Id: 'u7', result: 'P1_WIN', playedAt: '2026-06-04T14:40:00Z' },
  { id: 'm16', gameId: 3, player1Id: 'u4', player2Id: 'u8', result: 'DRAW',   playedAt: '2026-06-04T15:00:00Z' },
  { id: 'm17', gameId: 1, player1Id: 'u1', player2Id: 'u6', result: 'P1_WIN', playedAt: '2026-06-05T10:00:00Z' },
  { id: 'm18', gameId: 2, player1Id: 'u2', player2Id: 'u5', result: 'P1_WIN', playedAt: '2026-06-05T10:20:00Z' },
  { id: 'm19', gameId: 3, player1Id: 'u3', player2Id: 'u8', result: 'P2_WIN', playedAt: '2026-06-05T10:40:00Z' },
  { id: 'm20', gameId: 1, player1Id: 'u4', player2Id: 'u7', result: 'P1_WIN', playedAt: '2026-06-05T11:00:00Z' },
  { id: 'm21', gameId: 2, player1Id: 'u1', player2Id: 'u8', result: 'P2_WIN', playedAt: '2026-06-08T09:00:00Z' },
  { id: 'm22', gameId: 3, player1Id: 'u2', player2Id: 'u7', result: 'P1_WIN', playedAt: '2026-06-08T09:20:00Z' },
  { id: 'm23', gameId: 1, player1Id: 'u3', player2Id: 'u5', result: 'DRAW',   playedAt: '2026-06-08T09:40:00Z' },
  { id: 'm24', gameId: 2, player1Id: 'u4', player2Id: 'u6', result: 'P2_WIN', playedAt: '2026-06-08T10:00:00Z' },
  { id: 'm25', gameId: 3, player1Id: 'u1', player2Id: 'u2', result: 'P1_WIN', playedAt: '2026-06-09T13:00:00Z' },
  { id: 'm26', gameId: 1, player1Id: 'u3', player2Id: 'u6', result: 'P2_WIN', playedAt: '2026-06-09T13:20:00Z' },
  { id: 'm27', gameId: 2, player1Id: 'u5', player2Id: 'u4', result: 'P2_WIN', playedAt: '2026-06-09T13:40:00Z' },
  { id: 'm28', gameId: 3, player1Id: 'u8', player2Id: 'u7', result: 'P1_WIN', playedAt: '2026-06-09T14:00:00Z' },
  { id: 'm29', gameId: 1, player1Id: 'u2', player2Id: 'u1', result: 'P2_WIN', playedAt: '2026-06-10T10:00:00Z' },
  { id: 'm30', gameId: 2, player1Id: 'u4', player2Id: 'u3', result: 'DRAW',   playedAt: '2026-06-10T10:20:00Z' },
  { id: 'm31', gameId: 3, player1Id: 'u6', player2Id: 'u5', result: 'P1_WIN', playedAt: '2026-06-10T10:40:00Z' },
  { id: 'm32', gameId: 1, player1Id: 'u8', player2Id: 'u1', result: 'P2_WIN', playedAt: '2026-06-10T11:00:00Z' },
  { id: 'm33', gameId: 2, player1Id: 'u7', player2Id: 'u2', result: 'P2_WIN', playedAt: '2026-06-11T15:00:00Z' },
  { id: 'm34', gameId: 3, player1Id: 'u5', player2Id: 'u3', result: 'P2_WIN', playedAt: '2026-06-11T15:20:00Z' },
  { id: 'm35', gameId: 1, player1Id: 'u6', player2Id: 'u4', result: 'DRAW',   playedAt: '2026-06-11T15:40:00Z' },
  { id: 'm36', gameId: 2, player1Id: 'u8', player2Id: 'u2', result: 'P2_WIN', playedAt: '2026-06-11T16:00:00Z' },
  { id: 'm37', gameId: 3, player1Id: 'u1', player2Id: 'u4', result: 'P1_WIN', playedAt: '2026-06-12T09:00:00Z' },
  { id: 'm38', gameId: 1, player1Id: 'u7', player2Id: 'u5', result: 'P1_WIN', playedAt: '2026-06-12T09:20:00Z' },
  { id: 'm39', gameId: 2, player1Id: 'u6', player2Id: 'u3', result: 'P1_WIN', playedAt: '2026-06-12T09:40:00Z' },
  { id: 'm40', gameId: 3, player1Id: 'u8', player2Id: 'u2', result: 'DRAW',   playedAt: '2026-06-12T10:00:00Z' },
];

// ---------------------------------------------------------------------------
// 점수 설정 + 리더보드
// ---------------------------------------------------------------------------

export interface ScoreConfig {
  win: number;
  draw: number;
  loss: number;
}

export const scoreConfig: ScoreConfig = { win: 3, draw: 1, loss: 0 };

export interface PerGameStats {
  /** 해당 게임 플레이 수 */
  plays: number;
  /** 해당 게임 승리 수 */
  wins: number;
  /** 승률 (0~1). 플레이 0회면 0. */
  winRate: number;
}

export interface LeaderboardEntry {
  userId: string;
  nickname: string;
  score: number;
  /** 동점자는 같은 등수 (competition ranking: 1, 1, 3, ...) */
  rank: number;
  totalPlays: number;
  wins: number;
  draws: number;
  losses: number;
  /** 전체 승률 (0~1) */
  winRate: number;
  /** 게임(1~3)별 플레이 수/승수/승률 */
  perGame: Record<GameId, PerGameStats>;
}

export interface Leaderboard {
  /** 점수 내림차순 (동점 시 승수 내림차순 → userId 오름차순) */
  entries: LeaderboardEntry[];
  /** 상위 3명 (동점자 포함 없이 정렬 순 앞 3명) */
  top3: LeaderboardEntry[];
  /** 특정 유저 등수 조회. 없는 유저면 null. */
  rankOf(userId: string): number | null;
  /** 특정 유저 엔트리 조회. 없는 유저면 null. */
  entryOf(userId: string): LeaderboardEntry | null;
}

const GAME_IDS: GameId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function emptyPerGame(): Record<GameId, PerGameStats> {
  return Object.fromEntries(
    GAME_IDS.map((g) => [g, { plays: 0, wins: 0, winRate: 0 }]),
  ) as Record<GameId, PerGameStats>;
}

/**
 * 유저별 점수를 합산해 리더보드를 만든다.
 * - 점수 = 승 * win + 무 * draw + 패 * loss
 * - 동점자는 같은 등수(competition ranking), 다음 등수는 인원수만큼 건너뜀
 * - 기능정의서: TOP3 + 내 등수, TOP3 유저별 플레이 수/승리 수/승률
 */
export function computeLeaderboard(
  users: MockUser[],
  matches: MockMatch[],
  config: ScoreConfig,
): Leaderboard {
  type Acc = {
    wins: number;
    draws: number;
    losses: number;
    perGame: Record<GameId, PerGameStats>;
  };
  const acc = new Map<string, Acc>();
  for (const u of users) {
    acc.set(u.id, { wins: 0, draws: 0, losses: 0, perGame: emptyPerGame() });
  }

  for (const m of matches) {
    const p1 = acc.get(m.player1Id);
    const p2 = acc.get(m.player2Id);
    if (p1) {
      p1.perGame[m.gameId].plays += 1;
      if (m.result === 'P1_WIN') {
        p1.wins += 1;
        p1.perGame[m.gameId].wins += 1;
      } else if (m.result === 'P2_WIN') {
        p1.losses += 1;
      } else {
        p1.draws += 1;
      }
    }
    if (p2) {
      p2.perGame[m.gameId].plays += 1;
      if (m.result === 'P2_WIN') {
        p2.wins += 1;
        p2.perGame[m.gameId].wins += 1;
      } else if (m.result === 'P1_WIN') {
        p2.losses += 1;
      } else {
        p2.draws += 1;
      }
    }
  }

  const entries: LeaderboardEntry[] = users.map((u) => {
    const a = acc.get(u.id)!;
    const totalPlays = a.wins + a.draws + a.losses;
    for (const g of GAME_IDS) {
      const pg = a.perGame[g];
      pg.winRate = pg.plays > 0 ? pg.wins / pg.plays : 0;
    }
    return {
      userId: u.id,
      nickname: u.nickname,
      score: a.wins * config.win + a.draws * config.draw + a.losses * config.loss,
      rank: 0, // 아래에서 채움
      totalPlays,
      wins: a.wins,
      draws: a.draws,
      losses: a.losses,
      winRate: totalPlays > 0 ? a.wins / totalPlays : 0,
      perGame: a.perGame,
    };
  });

  entries.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    if (y.wins !== x.wins) return y.wins - x.wins;
    return x.userId < y.userId ? -1 : x.userId > y.userId ? 1 : 0;
  });

  // competition ranking: 동점(score 기준)은 같은 등수
  let prevScore: number | null = null;
  let prevRank = 0;
  entries.forEach((e, i) => {
    if (prevScore !== null && e.score === prevScore) {
      e.rank = prevRank;
    } else {
      e.rank = i + 1;
      prevRank = e.rank;
      prevScore = e.score;
    }
  });

  const byId = new Map(entries.map((e) => [e.userId, e]));

  return {
    entries,
    top3: entries.slice(0, 3),
    rankOf: (userId) => byId.get(userId)?.rank ?? null,
    entryOf: (userId) => byId.get(userId) ?? null,
  };
}
