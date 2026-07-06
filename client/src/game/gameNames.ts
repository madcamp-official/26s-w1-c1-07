/**
 * Internal game id (1~10) → display name. Single source of truth — shared by GameSelect, Settings, MatchIntro.
 * (must match game.name in the server seed server/prisma/seed.ts)
 */
import type { GameId } from '@/shell';

export const GAME_NAMES: Record<GameId, string> = {
  1: 'Number Guess',
  2: 'Tide Fencing',
  3: 'Pump',
  4: 'Missile Match',
  5: 'Light Cycle',
  6: 'Dino Run',
  7: 'Icarus Match',
  8: 'Pew Pew',
  9: 'Speed Gomoku',
  10: 'Tug of War',
};
