/**
 * 게임 진입 플로우 상태 — mode(online|offline), 선택 게임, RoundConfig(설정 모달 연동),
 * 라운드 진행(현재 라운드/스코어/매치 종료 판정), 봇 상대 정보.
 * 순수 메모리 모듈 상태. 아키텍트 소유 — 화면 구현 에이전트는 import만 한다.
 *
 * 전형적인 사용 흐름:
 *
 *   // (S4 설정 모달)
 *   const { settings } = useFlow();
 *   saveSettings({ roundCount: 5, timePerRoundSec: 30 });  // 확인 버튼
 *   DEFAULT_ROUND_CONFIG                                    // 기본값 버튼 (입력만 리셋)
 *
 *   // (S6/S7 온라인) 매칭 성사 순간:
 *   const gameId = startOnlineMatch();        // 봇 상대 배정 + 게임 랜덤(Q8)
 *   navigate(gamePath(gameId));
 *
 *   // (S8 오프라인) 카드 클릭:
 *   startOfflineMatch(2); navigate(gamePath(2));
 *
 *   // (인게임 SN) 라운드 시작 전:
 *   ensureMatch(2);                            // 직접 URL 진입 가드 (오프라인 폴백)
 *   const flow = useFlow();                    // roundIndex, settings, opponent ...
 *   // 라운드 종료(shared state.result 확정) 시:
 *   const { matchOver, matchResult } = reportRoundResult(roundWinner);
 *   // → ResultOverlay 표시. matchOver=false면 btn-next-round → beginNextRound()
 *   //   matchOver=true면 btn-back-main → resetFlow() + navigate('/')
 */
import { useSyncExternalStore } from 'react';
import {
  mockUsers,
  type GameId,
  type MatchResult,
  type MockUser,
  type PlayerRole,
  type RoundConfig,
  type RoundResult,
} from '@shared';

export type MatchMode = 'online' | 'offline';

/** SPEC Q1: 기본 3라운드 / 라운드당 60초 (와이어프레임 "3초"는 placeholder 판정) */
export const DEFAULT_ROUND_CONFIG: RoundConfig = { roundCount: 3, timePerRoundSec: 60 };

export interface FlowState {
  /** S4 설정 모달 값. 모든 매치의 라운드 수/시간에 실제 반영 (QA-S4-06) */
  settings: RoundConfig;
  /** 매치 진행 중이 아니면 null */
  mode: MatchMode | null;
  gameId: GameId | null;
  /** 온라인 매치의 봇 상대 (오프라인이면 null) */
  opponent: MockUser | null;
  /** 현재 라운드 인덱스 (0-based). 표기는 roundIndex+1 */
  roundIndex: number;
  /** 종료된 라운드들의 결과 */
  roundResults: RoundResult[];
  /** 매치 종료 시 확정. 진행 중 null */
  matchResult: MatchResult | null;
  /** S3 로그인 성공 직후 "S6 온라인 패널 즉시 오픈" 1회성 신호 */
  pendingOnlinePanel: boolean;
}

// ---------------------------------------------------------------------------
// 스토어
// ---------------------------------------------------------------------------

function initialState(): FlowState {
  return {
    settings: { ...DEFAULT_ROUND_CONFIG },
    mode: null,
    gameId: null,
    opponent: null,
    roundIndex: 0,
    roundResults: [],
    matchResult: null,
    pendingOnlinePanel: false,
  };
}

let state: FlowState = initialState();
const listeners = new Set<() => void>();

function emit(patch: Partial<FlowState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribeFlow(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFlow(): FlowState {
  return state;
}

/** React 훅 — 플로우 변경 시 리렌더 */
export function useFlow(): FlowState {
  return useSyncExternalStore(subscribeFlow, getFlow);
}

// ---------------------------------------------------------------------------
// 설정 (S4)
// ---------------------------------------------------------------------------

/** 확인 버튼: min 1 클램프 후 저장 */
export function saveSettings(config: RoundConfig): void {
  emit({
    settings: {
      roundCount: Math.max(1, Math.floor(config.roundCount) || 1),
      timePerRoundSec: Math.max(1, Math.floor(config.timePerRoundSec) || 1),
    },
  });
}

// ---------------------------------------------------------------------------
// 매치 시작
// ---------------------------------------------------------------------------

const GAME_IDS: GameId[] = [1, 2, 3];

export function gamePath(gameId: GameId): string {
  return `/game/${gameId}`;
}

function resetRounds(): Pick<FlowState, 'roundIndex' | 'roundResults' | 'matchResult'> {
  return { roundIndex: 0, roundResults: [], matchResult: null };
}

/** 오프라인 매치 시작 (S8 카드 클릭). 한 키보드 2인 — 봇 없음 */
export function startOfflineMatch(gameId: GameId): void {
  emit({ mode: 'offline', gameId, opponent: null, ...resetRounds() });
}

/**
 * 온라인 매치 시작 (S6 빠른 시작 / 코드 방 매칭 성사 시).
 * @param gameId 생략 시 랜덤 배정 (SPEC Q8: 빠른 시작=랜덤)
 * @returns 확정된 gameId — navigate(gamePath(반환값)) 하면 된다
 */
export function startOnlineMatch(gameId?: GameId): GameId {
  const id = gameId ?? GAME_IDS[Math.floor(Math.random() * GAME_IDS.length)];
  const opponent = mockUsers[Math.floor(Math.random() * mockUsers.length)];
  emit({ mode: 'online', gameId: id, opponent, ...resetRounds() });
  return id;
}

/**
 * 인게임 화면 마운트 가드 — 매치 시작 없이 /game/N 직접 진입 시
 * 오프라인 매치로 폴백해 상태를 정합하게 만든다.
 */
export function ensureMatch(gameId: GameId): void {
  if (state.mode === null || state.gameId !== gameId) {
    startOfflineMatch(gameId);
  }
}

/** 온라인 매치(봇 상대)인가 — 인게임에서 P2 봇 입력 구동 여부 판단용 */
export function isBotMatch(): boolean {
  return state.mode === 'online';
}

// ---------------------------------------------------------------------------
// 라운드 진행 / 매치 판정
// ---------------------------------------------------------------------------

export interface RoundReport {
  /** 설정된 라운드 수를 모두 소화했는가 */
  matchOver: boolean;
  /** matchOver=true일 때만 non-null (라운드 다승제, 동률 DRAW) */
  matchResult: MatchResult | null;
}

/** 현재 스코어 (ResultOverlay/HUD 핍 표기용) */
export function getScore(results: readonly RoundResult[] = state.roundResults): {
  p1Wins: number;
  p2Wins: number;
  draws: number;
} {
  let p1Wins = 0;
  let p2Wins = 0;
  let draws = 0;
  for (const r of results) {
    if (r.winner === 'P1') p1Wins += 1;
    else if (r.winner === 'P2') p2Wins += 1;
    else draws += 1;
  }
  return { p1Wins, p2Wins, draws };
}

/**
 * 라운드 종료 보고 (shared 게임 state.result가 확정된 순간 1회 호출).
 * @param winner 라운드 승자 ('P1' | 'P2' | null=무승부)
 * @returns 매치 종료 여부 + 매치 결과. 스토어에도 반영된다.
 */
export function reportRoundResult(winner: PlayerRole | null): RoundReport {
  const roundResults: RoundResult[] = [
    ...state.roundResults,
    { roundIndex: state.roundIndex, winner },
  ];
  const matchOver = roundResults.length >= state.settings.roundCount;
  let matchResult: MatchResult | null = null;
  if (matchOver) {
    const { p1Wins, p2Wins } = getScore(roundResults);
    matchResult = p1Wins > p2Wins ? 'P1_WIN' : p2Wins > p1Wins ? 'P2_WIN' : 'DRAW';
  }
  emit({ roundResults, matchResult });
  return { matchOver, matchResult };
}

/** 다음 라운드 개시 (btn-next-round). 매치 종료 후에는 no-op */
export function beginNextRound(): void {
  if (state.matchResult !== null) return;
  emit({ roundIndex: state.roundIndex + 1 });
}

/** 매치 종료/이탈 시 플로우 초기화 (설정값은 유지). btn-back-main / btn-exit에서 호출 */
export function resetFlow(): void {
  emit({ mode: null, gameId: null, opponent: null, ...resetRounds() });
}

// ---------------------------------------------------------------------------
// S3 → S6 연결 신호 (로그인 가드 통과 후 온라인 패널 자동 오픈)
// ---------------------------------------------------------------------------

/** S3 모달에서 로그인 성공 시 호출 — S2 마운트 후 온라인 패널이 즉시 열린다 */
export function requestOnlinePanel(): void {
  emit({ pendingOnlinePanel: true });
}

/** S2(MainLoggedIn) 마운트 시 호출. true면 온라인 패널(S6)을 열 것 */
export function consumeOnlinePanelRequest(): boolean {
  const pending = state.pendingOnlinePanel;
  if (pending) emit({ pendingOnlinePanel: false });
  return pending;
}
