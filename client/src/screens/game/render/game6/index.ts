/**
 * Game6 테마별 렌더러 디스패치. 등록 안 된 테마(neon-coinop)는 Game6.tsx의 기본 drawScene을 쓴다.
 * 각 테마 모듈은 자기 컨셉대로 씬 전체를 처음부터 그린다(좌표는 geom + G6로 고정 = 크로스플레이 불변).
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
