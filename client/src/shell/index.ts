/**
 * 셸 도메인 배럴 — 게임 밖 UI(로그인/로비/리더보드/모달)가 쓰는 UI 타입 + mock 데이터.
 * design-02 화면들이 원래 참조하던 design-lab 코어를 이 로컬 모듈(`@/shell`)로 대체한다.
 * (자립성: design-lab/game-lab 폴더를 참조하지 않는다 — MERGE_PLAN §2-0 불변식 A)
 *
 * 게임 코어 로직/상태는 여기가 아니라 `@madpump/shared`(game-lab vendor-in)에 있다.
 */
export * from './types';
export * from './mock';
