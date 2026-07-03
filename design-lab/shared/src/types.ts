/**
 * MADPUMP shared core types.
 * 게임별 세부 액션 타입은 각 게임 모듈에서 GameActionBase를 확장해 정의한다.
 */

/** 미니게임 식별자 (1, 2, 3) */
export type GameId = 1 | 2 | 3;

/** 로컬 대전에서의 플레이어 역할 */
export type PlayerRole = 'P1' | 'P2';

/** 매치 최종 결과 */
export type MatchResult = 'P1_WIN' | 'P2_WIN' | 'DRAW';

/** 라운드 진행 설정 */
export interface RoundConfig {
  /** 총 라운드 수 */
  roundCount: number;
  /** 라운드당 제한 시간 (초) */
  timePerRoundSec: number;
}

/**
 * 게임 액션 공통 골격.
 * 각 게임 파일에서 `type`을 리터럴 유니온으로 좁히고 payload를 확장한다.
 *
 * 예)
 *   interface Game1Action extends GameActionBase {
 *     gameId: 1;
 *     type: 'PUMP' | 'HOLD';
 *   }
 */
export interface GameActionBase {
  gameId: GameId;
  player: PlayerRole;
  /** 게임별 액션 종류 (각 게임에서 리터럴로 좁힘) */
  type: string;
}

/**
 * 한 프레임(틱)에 수집된 입력 스냅샷.
 * A에 게임별 액션 타입을 넣어 사용한다.
 */
export interface InputFrame<A extends GameActionBase = GameActionBase> {
  /** 매치 시작 이후 프레임 번호 (0부터) */
  frame: number;
  /** 매치 시작 이후 경과 시간 (ms) */
  elapsedMs: number;
  /** 이 프레임에 발생한 액션들 (없으면 빈 배열) */
  actions: A[];
}

/** 라운드 하나의 결과 */
export interface RoundResult {
  roundIndex: number;
  winner: PlayerRole | null; // null = 무승부 라운드
}

/** 매치 요약 */
export interface MatchSummary {
  gameId: GameId;
  config: RoundConfig;
  rounds: RoundResult[];
  result: MatchResult;
}
