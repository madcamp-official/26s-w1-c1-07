import { game1, game2, game3, game4, game5, game6, game7, game8, game9, game10 } from '@madpump/shared'
import type { GameCore, GameResult } from '@madpump/shared'
import { renderGame1 } from './render1'
import { renderGame2 } from './render2'
import { renderGame3 } from './render3'
import { renderGame4 } from './render4'
import { renderGame5 } from './render5'
import { renderGame6 } from './render6'
import { renderGame7 } from './render7'
import { renderGame8 } from './render8'
import { renderGame9 } from './render9'
import { renderGame10 } from './render10'

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
  '4': {
    id: '4',
    title: '게임4 · 공룡 달리기',
    core: game4 as GameDef['core'],
    render: renderGame4,
    guideP1: 'Q 점프 · W 숙이기(홀드)',
    guideP2: 'U 점프 장애물 · I 숙이기 장애물 (오른쪽에서 생성)',
    profiles: true,
  },
  '5': {
    id: '5',
    title: '게임5 · 몬스터 포격전',
    core: game5 as GameDef['core'],
    render: renderGame5,
    guideP1: 'Q 회전 방향 전환 · W 발사 (기본 반시계)',
    guideP2: 'U 회전 방향 전환 · I 발사 (기본 반시계)',
    profiles: true,
  },
  '6': {
    id: '6',
    title: '게임6 · 펌프',
    core: game6 as GameDef['core'],
    render: renderGame6,
    guideP1: 'Q ← · W → · 화살표 순서대로 입력(오답 −1)',
    guideP2: 'U ← · I → · 화살표 순서대로 입력(오답 −1)',
    profiles: false,
  },
  '7': {
    id: '7',
    title: '게임7 · 스피드 오목',
    core: game7 as GameDef['core'],
    render: renderGame7,
    guideP1: 'Q 내 차례에 돌 놓기(파랑) · W 플래시 방해',
    guideP2: 'U 내 차례에 돌 놓기(빨강) · I 플래시 방해',
    profiles: false,
  },
  '8': {
    id: '8',
    title: '게임8 · 마그마 총격 듀얼',
    core: game8 as GameDef['core'],
    render: renderGame8,
    guideP1: 'Q 살짝 점프 · W 발사 (마그마 닿으면 패)',
    guideP2: 'U 살짝 점프 · I 발사 (마그마 닿으면 패)',
    profiles: true,
  },
  '9': {
    id: '9',
    title: '게임9 · 줄다리기',
    core: game9 as GameDef['core'],
    render: renderGame9,
    guideP1: 'Q↔W 번갈아 연타로 당기기 (같은 키 연타 무효)',
    guideP2: 'U↔I 번갈아 연타로 당기기 (같은 키 연타 무효)',
    profiles: true,
  },
  '10': {
    id: '10',
    title: '게임10 · 라이트 사이클',
    core: game10 as GameDef['core'],
    render: renderGame10,
    guideP1: 'Q 좌회전 · W 우회전 (벽·궤적 충돌 시 패)',
    guideP2: 'U 좌회전 · I 우회전 (벽·궤적 충돌 시 패)',
    profiles: false,
  },
}
