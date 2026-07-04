/**
 * 게임 진입 플로우 + 매치 진행 상태 (서버 없음, 메모리 전용).
 * (아키텍트 소유 — 구현 에이전트는 import만, 수정 금지)
 *
 * ── 핵심 사용 시나리오 ────────────────────────────────────────────
 * [lobby] 온라인 버튼:  loggedIn ? openModal('online') : openModal('login-required')
 * [auth]  S3 로그인 성공: await mockGoogleLogin() → openModal('online')  (SPEC QA-S3-03)
 * [lobby] S6 빠른시작:   openModal('matching')  → MatchingModal이 connecting→waiting 연출
 * [lobby] S7 매칭 성사:  const gameId = matchFound(); navigate(`/game/${gameId}`)
 * [lobby] S7 취소:       cancelMatching()  (모달 'online'으로 복귀 — 타이머는 모달이 clear)
 * [lobby] S6 코드 생성:  const code = createRoomCode()  → n초 후 mock 입장 → matchFound()
 * [lobby] S8 게임 카드:  startOfflineGame(1); navigate('/game/1')
 * [game]  라운드 종료:   reportRoundEnd(state.result)  → flow.phase 확인해 오버레이 표시
 * [game]  다음 라운드:   nextRound()  → 새 createGameNState(...)로 라운드 재시작
 * [game]  나가기/메인:   exitMatch(); navigate('/')
 * ──────────────────────────────────────────────────────────────────
 */
import type { GameId, MatchResult, PlayerRole, RoundConfig, RoundResult } from '@shared';
import { mockUsers } from '@shared';
import { createStore, useStore } from './store';
import { getSession } from './session';

export type Mode = 'online' | 'offline';

export type ModalId = 'login-required' | 'settings' | 'online' | 'matching';

/**
 * 매치 진행 단계.
 * idle          — 매치 없음 (로비)
 * playing       — 라운드 진행 중
 * round-result  — 라운드 종료, 다음 라운드 대기 (ResultOverlay + btn-next-round)
 * match-result  — 전 라운드 종료, 매치 결과 표시 (ResultOverlay + btn-back-main)
 */
export type MatchPhase = 'idle' | 'playing' | 'round-result' | 'match-result';

export interface OpponentInfo {
  nickname: string;
  avatarColorIndex: number;
  isBot: boolean;
}

export interface FlowState {
  /** 현재 진입 모드. 매치 밖에서는 null */
  mode: Mode | null;
  /** 선택된 게임. 매치 밖에서는 null */
  gameId: GameId | null;
  /** 설정 모달(S4) 값 — 게임의 총 라운드 수/라운드 시간의 정본 */
  roundConfig: RoundConfig;
  /** 현재 열린 모달 (null = 없음) */
  modal: ModalId | null;
  /** S6에서 생성한 방 코드 (생성 전 null) */
  roomCode: string | null;
  /** 온라인 모드의 봇 상대. 오프라인이면 null */
  opponent: OpponentInfo | null;
  /** 매치 진행 단계 */
  phase: MatchPhase;
  /** 현재 라운드 (1-based). 매치 밖에서는 0 */
  currentRound: number;
  /** 지금까지의 라운드 결과 */
  roundResults: RoundResult[];
  /** 매치 최종 결과 (phase === 'match-result'일 때만 non-null) */
  matchResult: MatchResult | null;
}

/** SPEC S4: 기본 3라운드 / 라운드당 60초 (Q1 판정) */
export const DEFAULT_ROUND_CONFIG: RoundConfig = { roundCount: 3, timePerRoundSec: 60 };

const INITIAL: FlowState = {
  mode: null,
  gameId: null,
  roundConfig: { ...DEFAULT_ROUND_CONFIG },
  modal: null,
  roomCode: null,
  opponent: null,
  phase: 'idle',
  currentRound: 0,
  roundResults: [],
  matchResult: null,
};

export const flowStore = createStore<FlowState>(INITIAL);

/** React 훅 */
export function useFlow(): FlowState {
  return useStore(flowStore);
}

/** 비-React 코드용 스냅샷 */
export function getFlow(): FlowState {
  return flowStore.get();
}

// ---------------------------------------------------------------------------
// 설정 (S4)
// ---------------------------------------------------------------------------

/** S4 확인 — 저장 후 closeModal()은 호출자가 */
export function setRoundConfig(config: RoundConfig): void {
  flowStore.set({
    roundConfig: {
      roundCount: Math.max(1, Math.round(config.roundCount)),
      timePerRoundSec: Math.max(1, Math.round(config.timePerRoundSec)),
    },
  });
}

/** S4 "기본값" 버튼용 기본값 (모달 로컬 state를 이 값으로 리셋 — 저장은 확인 눌러야) */
export function getDefaultRoundConfig(): RoundConfig {
  return { ...DEFAULT_ROUND_CONFIG };
}

// ---------------------------------------------------------------------------
// 모달
// ---------------------------------------------------------------------------

export function openModal(id: ModalId): void {
  flowStore.set({ modal: id });
}

/** 현재 모달 닫기 */
export function closeModal(): void {
  flowStore.set({ modal: null });
}

// ---------------------------------------------------------------------------
// 온라인 플로우 (S6·S7)
// ---------------------------------------------------------------------------

/** S6 코드 생성하기 — 11자리 숫자 코드 (SPEC Q9: 와이어프레임 그대로 11자리) */
export function createRoomCode(): string {
  let code = String(1 + Math.floor(Math.random() * 9));
  for (let i = 1; i < 11; i++) code += Math.floor(Math.random() * 10);
  flowStore.set({ roomCode: code });
  return code;
}

/** S6 코드 입력 형식 검증 — 숫자만, 1자리 이상 (분반 제한 없음, SPEC S6-7) */
export function isValidRoomCode(code: string): boolean {
  return /^\d+$/.test(code.trim());
}

/** S7 취소하기 — matching 모달 → online 패널 복귀. (setTimeout 정리는 모달 컴포넌트 책임) */
export function cancelMatching(): void {
  flowStore.set({ modal: 'online' });
}

/**
 * 매칭 성사 (mock) — 봇 상대 배정 + 게임 결정 + 매치 시작 + 모달 닫기.
 * @param gameId 생략 시 랜덤 (SPEC Q8: 빠른 시작=랜덤 허용)
 * @returns 결정된 gameId — 호출자가 navigate(`/game/${gameId}`) 할 것
 */
export function matchFound(gameId?: GameId): GameId {
  const id: GameId = gameId ?? ((1 + Math.floor(Math.random() * 3)) as GameId);
  const myNickname = getSession().nickname;
  const pool = mockUsers.filter((u) => u.nickname !== myNickname);
  const bot = pool[Math.floor(Math.random() * pool.length)];
  flowStore.set({
    mode: 'online',
    gameId: id,
    modal: null,
    opponent: { nickname: bot.nickname, avatarColorIndex: bot.avatarColorIndex, isBot: true },
    ...freshMatchFields(),
  });
  return id;
}

// ---------------------------------------------------------------------------
// 오프라인 플로우 (S8)
// ---------------------------------------------------------------------------

/** S8 게임 카드 선택 — 매치 시작. 호출자가 navigate(`/game/${gameId}`) 할 것 */
export function startOfflineGame(gameId: GameId): void {
  flowStore.set({
    mode: 'offline',
    gameId,
    modal: null,
    opponent: null,
    ...freshMatchFields(),
  });
}

function freshMatchFields(): Pick<
  FlowState,
  'phase' | 'currentRound' | 'roundResults' | 'matchResult'
> {
  return { phase: 'playing', currentRound: 1, roundResults: [], matchResult: null };
}

// ---------------------------------------------------------------------------
// 라운드 진행 (S9~S12 게임 화면이 호출)
// ---------------------------------------------------------------------------

/**
 * 라운드 종료 보고. shared 게임 state의 result(MatchResult)를 그대로 넘기면 된다.
 * 설정된 roundCount를 채우면 매치 종료 판정(라운드 다승제, 동률=DRAW — SPEC §3 공통)
 * 후 phase='match-result', 아니면 phase='round-result'.
 */
export function reportRoundEnd(roundResult: MatchResult): void {
  const f = flowStore.get();
  if (f.phase !== 'playing') return;
  const winner: PlayerRole | null =
    roundResult === 'P1_WIN' ? 'P1' : roundResult === 'P2_WIN' ? 'P2' : null;
  const roundResults: RoundResult[] = [
    ...f.roundResults,
    { roundIndex: f.currentRound - 1, winner },
  ];
  if (roundResults.length >= f.roundConfig.roundCount) {
    const p1 = roundResults.filter((r) => r.winner === 'P1').length;
    const p2 = roundResults.filter((r) => r.winner === 'P2').length;
    const matchResult: MatchResult = p1 > p2 ? 'P1_WIN' : p2 > p1 ? 'P2_WIN' : 'DRAW';
    flowStore.set({ roundResults, phase: 'match-result', matchResult });
  } else {
    flowStore.set({ roundResults, phase: 'round-result' });
  }
}

/** ResultOverlay의 "다음 라운드" — 게임 화면은 이 호출 후 새 게임 state를 생성해야 한다 */
export function nextRound(): void {
  const f = flowStore.get();
  if (f.phase !== 'round-result') return;
  flowStore.set({ currentRound: f.currentRound + 1, phase: 'playing' });
}

/** 플레이어별 현재 라운드 승수 (HUD 램프용) */
export function getRoundWins(state: FlowState): Record<PlayerRole, number> {
  return {
    P1: state.roundResults.filter((r) => r.winner === 'P1').length,
    P2: state.roundResults.filter((r) => r.winner === 'P2').length,
  };
}

/** 매치 종료/이탈 — 매치 관련 필드 전부 초기화. 호출자가 navigate('/') 할 것 */
export function exitMatch(): void {
  flowStore.set({
    mode: null,
    gameId: null,
    modal: null,
    roomCode: null,
    opponent: null,
    phase: 'idle',
    currentRound: 0,
    roundResults: [],
    matchResult: null,
  });
}

// ---------------------------------------------------------------------------
// 표시용 헬퍼
// ---------------------------------------------------------------------------

export interface PlayerDisplay {
  name: string;
  avatarColorIndex: number;
  /** "YOU" 점멸 태그 대상 여부 (PLAN §1.5 HUD) */
  isYou: boolean;
}

/**
 * HUD에 표시할 P1/P2 이름·아바타 (SPEC 인게임 공통: 프로필 + 내 쪽 구분).
 * - offline: "PLAYER 1" / "PLAYER 2" (둘 다 로컬 — isYou 없음)
 * - online:  내 닉네임(P1, YOU) vs 봇 상대(P2)
 */
export function getPlayerDisplays(flow: FlowState): Record<PlayerRole, PlayerDisplay> {
  const session = getSession();
  if (flow.mode === 'online' && flow.opponent) {
    return {
      P1: {
        name: session.nickname ?? 'YOU',
        avatarColorIndex: session.user?.avatarColorIndex ?? 0,
        isYou: true,
      },
      P2: {
        name: flow.opponent.nickname,
        avatarColorIndex: flow.opponent.avatarColorIndex,
        isYou: false,
      },
    };
  }
  return {
    P1: { name: 'PLAYER 1', avatarColorIndex: 0, isYou: false },
    P2: { name: 'PLAYER 2', avatarColorIndex: 1, isYou: false },
  };
}
