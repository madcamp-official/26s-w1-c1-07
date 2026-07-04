/**
 * 게임 진입 플로우 상태 — 모드(online/offline), 선택 게임, RoundConfig,
 * 라운드 진행(현재 라운드/스코어/매치 종료 판정), 봇 상대 정보.
 *
 * [구현 에이전트 주의] 아키텍트 소유 — 수정 금지. import해서 사용만.
 *
 * 사용법 (ARCHITECTURE.md §3 참조):
 *   // 설정 모달(S4)
 *   setRoundConfig({ roundCount: 5, timePerRoundSec: 30 });
 *   resetRoundConfig(); // 기본값(3라운드/60초) 복원
 *
 *   // 매치 시작 (게임 화면으로 navigate 하기 "전에" 호출)
 *   startMatch('offline', 2);                  // S8에서 게임 선택
 *   startMatch('online', pickRandomGameId());  // S6/S7 매칭 성사(봇 상대 자동 배정)
 *
 *   // 인게임 (게임 화면)
 *   const flow = useFlow();
 *   flow.currentRound / flow.roundConfig / flow.opponent / flow.playerNames
 *   const r = recordRoundResult('P1');   // 라운드 종료마다 호출 → {matchOver, matchResult}
 *   advanceRound();                      // result-overlay "다음 라운드" 버튼
 *   resetFlow();                         // "메인으로" — 진행 상태 초기화
 */
import type {
  GameId,
  MatchResult,
  PlayerRole,
  RoundConfig,
  RoundResult,
} from '@shared';
import { mockUsers } from '@shared';
import { createStore, useStore } from './store';
import { getSession } from './session';

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type FlowMode = 'online' | 'offline';

/** 온라인 mock 매칭 상대(봇) 정보 */
export interface BotInfo {
  nickname: string;
  avatarColorIndex: number;
}

export interface RoundScores {
  p1Wins: number;
  p2Wins: number;
  draws: number;
}

export interface FlowState {
  /** 진입 모드. null = 매치 진행 중 아님 */
  mode: FlowMode | null;
  /** 선택된 게임. null = 미선택 */
  gameId: GameId | null;
  /** 대결 규칙 — S4 설정 모달과 연동. 매치 시작 시 이 값을 사용 */
  roundConfig: RoundConfig;
  /** 현재 라운드 (1-base). 0 = 매치 시작 전 */
  currentRound: number;
  /** 종료된 라운드들의 결과 (winner null = 무승부 라운드) */
  roundResults: RoundResult[];
  /** 파생 스코어 (roundResults 집계 — recordRoundResult가 갱신) */
  scores: RoundScores;
  /** 전 라운드 종료 후 확정되는 매치 결과. null = 진행 중 */
  matchResult: MatchResult | null;
  /** 온라인 모드의 봇 상대. 오프라인이면 null */
  opponent: BotInfo | null;
  /**
   * 화면 표기용 플레이어 이름 (P1=왼쪽/playerL, P2=오른쪽/playerR).
   * 온라인: P1=내 닉네임, P2=봇 닉네임 / 오프라인: 'PLAYER 1'/'PLAYER 2'
   */
  playerNames: Record<PlayerRole, string>;
}

// ---------------------------------------------------------------------------
// 기본값 / 내부 상태
// ---------------------------------------------------------------------------

/** SPEC Q1: 기본 3라운드, 라운드당 60초 (와이어프레임 "3초"는 placeholder 판정) */
export const DEFAULT_ROUND_CONFIG: RoundConfig = {
  roundCount: 3,
  timePerRoundSec: 60,
};

const EMPTY_SCORES: RoundScores = { p1Wins: 0, p2Wins: 0, draws: 0 };

const store = createStore<FlowState>({
  mode: null,
  gameId: null,
  roundConfig: { ...DEFAULT_ROUND_CONFIG },
  currentRound: 0,
  roundResults: [],
  scores: { ...EMPTY_SCORES },
  matchResult: null,
  opponent: null,
  playerNames: { P1: 'PLAYER 1', P2: 'PLAYER 2' },
});

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/** 현재 플로우 스냅샷 (비리액티브 — 게임 루프 안에서 사용) */
export function getFlow(): FlowState {
  return store.get();
}

export function subscribeFlow(listener: () => void): () => void {
  return store.subscribe(listener);
}

/** React 훅 — 플로우 리액티브 구독 */
export function useFlow(): FlowState {
  return useStore(store);
}

/** S4 설정 모달 "확인" — 라운드 규칙 저장 (min 1 클램프) */
export function setRoundConfig(config: RoundConfig): void {
  store.set({
    roundConfig: {
      roundCount: Math.max(1, Math.floor(config.roundCount)),
      timePerRoundSec: Math.max(1, Math.floor(config.timePerRoundSec)),
    },
  });
}

/** S4 "기본값" — 저장까지 하려면 이 함수, 입력만 리셋하려면 DEFAULT_ROUND_CONFIG 사용 */
export function resetRoundConfig(): void {
  store.set({ roundConfig: { ...DEFAULT_ROUND_CONFIG } });
}

/** 온라인 랜덤 매칭용 게임 선택 (SPEC Q8: 빠른 시작=랜덤) */
export function pickRandomGameId(): GameId {
  return (1 + Math.floor(Math.random() * 3)) as GameId;
}

/** mock 봇 상대 하나를 뽑는다 (내 닉네임과 겹치지 않게) */
export function pickBotOpponent(): BotInfo {
  const myName = getSession().nickname;
  const pool = mockUsers.filter((u) => u.nickname !== myName);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { nickname: pick.nickname, avatarColorIndex: pick.avatarColorIndex };
}

/**
 * 매치 시작 — 게임 화면으로 navigate 하기 전에 호출.
 * 라운드 진행 상태를 리셋하고 currentRound=1로 만든다.
 * 온라인이면 봇 상대를 자동 배정(P2), 내 닉네임을 P1로 표기.
 */
export function startMatch(mode: FlowMode, gameId: GameId): void {
  const opponent = mode === 'online' ? pickBotOpponent() : null;
  const myName = getSession().nickname;
  const playerNames: Record<PlayerRole, string> =
    mode === 'online'
      ? { P1: myName ?? 'YOU', P2: opponent!.nickname }
      : { P1: 'PLAYER 1', P2: 'PLAYER 2' };
  store.set({
    mode,
    gameId,
    currentRound: 1,
    roundResults: [],
    scores: { ...EMPTY_SCORES },
    matchResult: null,
    opponent,
    playerNames,
  });
}

function tally(results: RoundResult[]): RoundScores {
  const s: RoundScores = { p1Wins: 0, p2Wins: 0, draws: 0 };
  for (const r of results) {
    if (r.winner === 'P1') s.p1Wins += 1;
    else if (r.winner === 'P2') s.p2Wins += 1;
    else s.draws += 1;
  }
  return s;
}

export interface RoundRecordOutcome {
  /** true면 설정된 라운드를 모두 소화 → 매치 종료 */
  matchOver: boolean;
  /** matchOver=true일 때 라운드 다승제 결과 (동률이면 DRAW) */
  matchResult: MatchResult | null;
  scores: RoundScores;
}

/**
 * 라운드 종료 시 호출 (winner: 'P1' | 'P2' | null=무승부 라운드).
 * 설정된 라운드 수를 모두 채우면 다승제로 매치 결과를 확정한다.
 */
export function recordRoundResult(winner: PlayerRole | null): RoundRecordOutcome {
  const prev = store.get();
  const roundResults: RoundResult[] = [
    ...prev.roundResults,
    { roundIndex: prev.roundResults.length, winner },
  ];
  const scores = tally(roundResults);
  const matchOver = roundResults.length >= prev.roundConfig.roundCount;
  let matchResult: MatchResult | null = null;
  if (matchOver) {
    if (scores.p1Wins > scores.p2Wins) matchResult = 'P1_WIN';
    else if (scores.p2Wins > scores.p1Wins) matchResult = 'P2_WIN';
    else matchResult = 'DRAW';
  }
  store.set({ roundResults, scores, matchResult });
  return { matchOver, matchResult, scores };
}

/** result-overlay "다음 라운드" — 다음 라운드로 진행 (매치 종료 후 호출 금지) */
export function advanceRound(): void {
  const prev = store.get();
  if (prev.matchResult !== null) return;
  store.set({ currentRound: prev.currentRound + 1 });
}

/** "메인으로"/매치 이탈 — 진행 상태 초기화 (roundConfig 설정값은 유지) */
export function resetFlow(): void {
  store.set({
    mode: null,
    gameId: null,
    currentRound: 0,
    roundResults: [],
    scores: { ...EMPTY_SCORES },
    matchResult: null,
    opponent: null,
    playerNames: { P1: 'PLAYER 1', P2: 'PLAYER 2' },
  });
}
