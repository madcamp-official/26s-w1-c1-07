/**
 * 게임 내부 id(1~10) → 표시 이름. 단일 정본 — GameSelect·Settings·MatchIntro가 공유.
 * (서버 시드 server/prisma/seed.ts의 game.name과 일치해야 한다)
 */
import type { GameId } from '@/shell';

export const GAME_NAMES: Record<GameId, string> = {
  1: '숫자 맞추기',
  2: '타이드 펜싱',
  3: '펌프',
  4: '미사일 매치',
  5: '라이트 사이클',
  6: '공룡 달리기',
  7: '이카루스 매치',
  8: '뿌슝뿌슝',
  9: '스피드 오목',
  10: '줄다리기',
};
