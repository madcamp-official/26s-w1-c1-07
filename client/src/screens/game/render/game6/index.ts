/**
 * Game6 per-theme renderer dispatch. Unregistered themes (neon-coinop) use the default drawScene in Game6.tsx.
 * Each theme module draws the whole scene from scratch in its own concept (coordinates fixed by geom + G6 = crossplay invariant).
 */
import type { ThemeId } from '../../../../state/theme';
import type { Game6DrawScene } from './types';
import { drawScene as pico8 } from './pico8';
import { drawScene as neoBrutal } from './neo-brutal';
import { drawScene as clay } from './clay-toy';
import { drawScene as broadcast } from './broadcast-arena';
import { drawScene as obsidian } from './obsidian';

export const game6Draw: Partial<Record<ThemeId, Game6DrawScene>> = {
  pico8,
  'neo-brutal': neoBrutal,
  'clay-toy': clay,
  'broadcast-arena': broadcast,
  obsidian,
};

export type { Game6DrawScene } from './types';
