/**
 * 셸(로그인/로비/리더보드 등 게임 밖 UI)이 쓰는 UI 타입.
 *
 * ⚠️ 이건 "게임 코어"(@madpump/shared)와 별개다.
 *  - 게임 판정 결과는 코어의 GameResult = 'P1' | 'P2' | 'DRAW' (game-lab).
 *  - 여기 MatchResult('P1_WIN'…)는 mock 리더보드/전적 표시용 셸 도메인 값.
 *  - 서버가 붙으면 이 셸 타입들은 REST 응답 타입으로 대체된다(현재는 mock 스캐폴딩).
 *
 * design-lab 원본에서 vendor-in. 자립성 원칙(MERGE_PLAN §2-0)에 따라
 * design-lab 폴더를 참조하지 않고 client 안에 복사해 둔다.
 */

/** 미니게임 식별자 (1, 2, 3) */
export type GameId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** 로컬 대전에서의 플레이어 역할 */
export type PlayerRole = 'P1' | 'P2';

/** 매치 최종 결과(셸/mock 표기) */
export type MatchResult = 'P1_WIN' | 'P2_WIN' | 'DRAW';

/** 라운드 진행 설정 */
export interface RoundConfig {
  /** 총 라운드 수 */
  roundCount: number;
  /** 라운드당 제한 시간 (초) */
  timePerRoundSec: number;
}

/** 라운드 하나의 결과 */
export interface RoundResult {
  roundIndex: number;
  winner: PlayerRole | null; // null = 무승부 라운드
}
