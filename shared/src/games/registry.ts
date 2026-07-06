/**
 * 게임 코어 레지스트리 — gameId(1~10) → { create, step }.
 * 서버 매치러너와 클라가 gameId로 게임 코어를 dispatch할 때 쓴다.
 * (렌더러는 클라 전용이라 여기 없음 — 순수 로직만)
 */
import type { GameCore, GameResult } from './types'
import * as game1 from './game1/logic'
import * as game2 from './game2/logic'
import * as game3 from './game3/logic'
import * as game4 from './game4/logic'
import * as game5 from './game5/logic'
import * as game6 from './game6/logic'
import * as game7 from './game7/logic'
import * as game8 from './game8/logic'
import * as game9 from './game9/logic'
import * as game10 from './game10/logic'
import * as game11 from './game11/logic'
import * as game12 from './game12/logic'
import * as game13 from './game13/logic'

export type GameId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13

/** 전 게임 공통 코어 타입(런타임 상태는 게임별) */
type AnyCore = GameCore<{ elapsed: number; result: GameResult }>

/* eslint-disable @typescript-eslint/no-explicit-any */
export const GAME_CORES: Record<GameId, AnyCore> = {
  1: game1 as unknown as AnyCore,
  2: game2 as unknown as AnyCore,
  3: game3 as unknown as AnyCore,
  4: game4 as unknown as AnyCore,
  5: game5 as unknown as AnyCore,
  6: game6 as unknown as AnyCore,
  7: game7 as unknown as AnyCore,
  8: game8 as unknown as AnyCore,
  9: game9 as unknown as AnyCore,
  10: game10 as unknown as AnyCore,
  11: game11 as unknown as AnyCore,
  12: game12 as unknown as AnyCore,
  13: game13 as unknown as AnyCore,
}

/** 활성 게임 id 목록 (매치 러너 랜덤 추첨 풀) */
export const ALL_GAME_IDS: GameId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
