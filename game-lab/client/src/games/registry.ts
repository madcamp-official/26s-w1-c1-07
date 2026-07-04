import { game1, game2, game3 } from '@madpump/shared'
import type { GameCore, GameResult } from '@madpump/shared'
import { renderGame1 } from './render1'
import { renderGame2 } from './render2'
import { renderGame3 } from './render3'

export const CANVAS_W = 800
export const CANVAS_H = 450

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface GameDef {
  id: string
  title: string
  core: GameCore<{ elapsed: number; result: GameResult }>
  render: (ctx: CanvasRenderingContext2D, state: any, w: number, h: number) => void
  guideP1: string
  guideP2: string
  /** true면 캔버스 좌/우에 플레이어 프로필 사진을 크게 띄운다 */
  profiles?: boolean
}

export const GAMES: Record<string, GameDef> = {
  '1': {
    id: '1',
    title: '게임1 · 숫자 맞추기',
    core: game1 as GameDef['core'],
    render: renderGame1,
    guideP1: 'Q 연타 −  · W 연타 +  (게이지 누적 100%)',
    guideP2: 'U 연타 −  · I 연타 +  (게이지 누적 100%)',
    profiles: true,
  },
  '2': {
    id: '2',
    title: '게임2 · 로켓 피하기',
    core: game2 as GameDef['core'],
    render: renderGame2,
    guideP1: 'Q 방향 반전 · W 3방향 발사',
    guideP2: 'U ← 이동 · I → 이동 · HP 3',
    profiles: true,
  },
  '3': {
    id: '3',
    title: '게임3 · 펜싱',
    core: game3 as GameDef['core'],
    render: renderGame3,
    guideP1: 'Q 공격 · W 회피',
    guideP2: 'U 공격 · I 회피',
    profiles: true,
  },
}
