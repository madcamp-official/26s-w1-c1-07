/**
 * Game entry flow + match progression state (no server, memory-only).
 * (Owned by the architect — implementation agents may only import, must not modify)
 *
 * ── Core usage scenarios ────────────────────────────────────────────
 * [lobby] Online button: loggedIn ? openModal('online') : openModal('login-required')
 * [auth]  Login:          openModal('login') → select class → select member → loginAs(userId)
 *                        (if entered from login-required, on success openModal('online') — QA-S3-03)
 * [lobby] S6 quick start: openModal('matching')  → MatchingModal plays connecting→waiting
 * [lobby] S7 match found: const gameId = matchFound(); navigate(`/game/${gameId}`)
 * [lobby] S7 cancel:      cancelMatching()  (return to 'online' modal — timer cleared by the modal)
 * [lobby] S6 create code: const code = createRoomCode()  → mock joins after n sec → matchFound()
 * [lobby] S8 game card:   startOfflineGame(1); navigate('/game/1')
 * [game]  round end:      reportRoundEnd(state.result)  → check flow.phase to show overlay
 * [game]  next round:     nextRound()  → restart round with a new createGameNState(...)
 * [game]  exit/main:      exitMatch(); navigate('/')
 * ──────────────────────────────────────────────────────────────────
 */
import type { GameId, MatchResult, PlayerRole, RoundConfig, RoundResult } from '@/shell';
import { mockUsers } from '@/shell';
import { createStore, useStore } from './store';
import { getSession } from './session';
import { getOnline } from '../net/online';

export type Mode = 'online' | 'offline';

export type ModalId =
  | 'login-required'
  | 'login'
  | 'settings'
  | 'online'
  | 'matching'
  | 'theme-shop'
  | 'ranking';

/**
 * Match progression phase.
 * idle          — no match (lobby)
 * playing       — round in progress
 * round-result  — round ended, waiting for next round (ResultOverlay + btn-next-round)
 * match-result  — all rounds ended, showing match result (ResultOverlay + btn-back-main)
 */
export type MatchPhase = 'idle' | 'playing' | 'round-result' | 'match-result';

export interface OpponentInfo {
  nickname: string;
  avatarColorIndex: number;
  isBot: boolean;
}

export interface FlowState {
  /** Current entry mode. null outside a match */
  mode: Mode | null;
  /** Selected game. null outside a match */
  gameId: GameId | null;
  /** Settings modal (S4) values — source of truth for the game's total round count / round time */
  roundConfig: RoundConfig;
  /** Currently open modal (null = none) */
  modal: ModalId | null;
  /** Room code created in S6 (null before creation) */
  roomCode: string | null;
  /** Bot opponent in online mode. null when offline */
  opponent: OpponentInfo | null;
  /** Match progression phase */
  phase: MatchPhase;
  /** Current round (1-based). 0 outside a match */
  currentRound: number;
  /** Round results so far */
  roundResults: RoundResult[];
  /** Final match result (non-null only when phase === 'match-result') */
  matchResult: MatchResult | null;
  /** Settings checkboxes: playable games. Online matches are drawn only from these. */
  enabledGames: GameId[];
}

/** SPEC S4: default 3 rounds / 60 sec per round (Q1 ruling) */
export const DEFAULT_ROUND_CONFIG: RoundConfig = { roundCount: 3, timePerRoundSec: 60 };
/** Default = all 13 games */
export const ALL_GAME_IDS: GameId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

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
  enabledGames: [...ALL_GAME_IDS],
};

export const flowStore = createStore<FlowState>(INITIAL);

/** React hook */
export function useFlow(): FlowState {
  return useStore(flowStore);
}

/** Snapshot for non-React code */
export function getFlow(): FlowState {
  return flowStore.get();
}

// ---------------------------------------------------------------------------
// Settings (S4)
// ---------------------------------------------------------------------------

/** S4 confirm — after saving, the caller calls closeModal() */
export function setRoundConfig(config: RoundConfig): void {
  flowStore.set({
    roundConfig: {
      roundCount: Math.max(1, Math.round(config.roundCount)),
      timePerRoundSec: Math.max(1, Math.round(config.timePerRoundSec)),
    },
  });
}

/** Defaults for the S4 "default" button (reset the modal's local state to these — saving still needs confirm) */
export function getDefaultRoundConfig(): RoundConfig {
  return { ...DEFAULT_ROUND_CONFIG };
}

/** Save the settings game checkboxes (guarantees at least 1). */
export function setEnabledGames(games: GameId[]): void {
  const uniq = [...new Set(games)].filter((g) => ALL_GAME_IDS.includes(g));
  flowStore.set({ enabledGames: uniq.length ? uniq : [...ALL_GAME_IDS] });
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

export function openModal(id: ModalId): void {
  flowStore.set({ modal: id });
}

/** Close the current modal */
export function closeModal(): void {
  flowStore.set({ modal: null });
}

// ---------------------------------------------------------------------------
// Online flow (S6·S7)
// ---------------------------------------------------------------------------

/** S6 create code — 11-digit numeric code (SPEC Q9: 11 digits, matching the wireframe) */
export function createRoomCode(): string {
  let code = String(1 + Math.floor(Math.random() * 9));
  for (let i = 1; i < 11; i++) code += Math.floor(Math.random() * 10);
  flowStore.set({ roomCode: code });
  return code;
}

/** S6 code input format validation — digits only, at least 1 digit (no class restriction, SPEC S6-7) */
export function isValidRoomCode(code: string): boolean {
  return /^\d+$/.test(code.trim());
}

/** S7 cancel — matching modal → return to online panel. (clearing setTimeout is the modal component's job) */
export function cancelMatching(): void {
  flowStore.set({ modal: 'online' });
}

/**
 * Match found (mock) — assign bot opponent + decide game + start match + close modal.
 * @param gameId random if omitted (SPEC Q8: quick start = random allowed)
 * @returns the decided gameId — the caller should navigate(`/game/${gameId}`)
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
// Offline flow (S8)
// ---------------------------------------------------------------------------

/** S8 game card selected — start match. The caller should navigate(`/game/${gameId}`) */
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
// Round progression (called by the S9~S12 game screens)
// ---------------------------------------------------------------------------

/**
 * Report round end. Just pass the shared game state's result (MatchResult) through.
 * Once the configured roundCount is reached, judge the match (best-of rounds, tie = DRAW — SPEC §3 common)
 * then phase='match-result', otherwise phase='round-result'.
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

/** ResultOverlay's "next round" — the game screen must create a new game state after this call */
export function nextRound(): void {
  const f = flowStore.get();
  if (f.phase !== 'round-result') return;
  flowStore.set({ currentRound: f.currentRound + 1, phase: 'playing' });
}

/** Current round wins per player (for the HUD lamps) */
export function getRoundWins(state: FlowState): Record<PlayerRole, number> {
  return {
    P1: state.roundResults.filter((r) => r.winner === 'P1').length,
    P2: state.roundResults.filter((r) => r.winner === 'P2').length,
  };
}

/** Match end/leave — reset all match-related fields. The caller should navigate('/') */
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
// Display helpers
// ---------------------------------------------------------------------------

export interface PlayerDisplay {
  name: string;
  avatarColorIndex: number;
  /** Whether this is the "YOU" blinking-tag target (PLAN §1.5 HUD) */
  isYou: boolean;
}

/**
 * P1/P2 names·avatars to show on the HUD/canvas + "my side (isYou)" distinction.
 * - Real-server online: P1 = the blue player, P2 = the red player (fixed for the whole match by player color).
 *     isYou marks my color's side. Keeps the HUD sides matching the in-game character colors even as the
 *     attack/defense role swaps each round (requirement: one color per player for the whole match).
 * - (legacy) offline mock bot mode: P1 is always me.
 * - offline local 2-player: "PLAYER 1" / "PLAYER 2" (no isYou).
 */
export function getPlayerDisplays(flow: FlowState): Record<PlayerRole, PlayerDisplay> {
  const session = getSession();

  // If a real-server online match is in progress, prioritize the server-assigned role.
  const online = getOnline();
  const onlineActive =
    online.role != null &&
    online.gameId != null &&
    (online.phase === 'countdown' || online.phase === 'playing' || online.phase === 'round-result');
  if (onlineActive) {
    const myName = session.nickname ?? 'YOU';
    const oppName = online.opponent?.nickname ?? 'Opponent';
    // Fixed identity for the whole match: P1 = the BLUE player, P2 = the RED player (independent of the per-round role).
    // This keeps the top HUD sides consistent with the in-game character colors (blue→--p1 cyan / red→--p2 pink).
    const iAmBlue = online.myColor ? online.myColor === 'blue' : online.role === 'P1';
    return {
      P1: { name: iAmBlue ? myName : oppName, avatarColorIndex: 0, isYou: iAmBlue },
      P2: { name: iAmBlue ? oppName : myName, avatarColorIndex: 1, isYou: !iAmBlue },
    };
  }

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
