/**
 * Global audio controller — without touching the locked files (App/Button/Modal/flow…),
 * it drives UI/flow/coin/matchmaking SFX + BGM via "document event delegation + store subscriptions".
 * Self-initializes once on module load (works for the whole session just from import '@/audio').
 * Owner: audio agent.
 */
import {
  sfx,
  setBgm,
  stopBgm,
  unlockAudio,
  setMuted,
  isMuted,
} from './engine';
import { flowStore, type FlowState } from '../state/flow';
import { onlineStore, type OnlineState, type OnlinePhase } from '../net/online';
import { sessionStore } from '../state/session';
import lobbyUrl from './assets/magenta-countdown.mp3';
import overdriveUrl from './assets/magenta-overdrive.mp3';
import warpUrl from './assets/warp-pipe-parade.mp3';

let inited = false;
let lastHover = 0;

const BATTLE_ONLINE: ReadonlySet<OnlinePhase> = new Set<OnlinePhase>(['countdown', 'playing', 'round-result']);

// BGM zones: lobby = Magenta Countdown (full), in-game = Overdrive/Warp Pipe Parade (random, focus volume).
const LOBBY_VOL = 0.85;
const GAME_VOL = 0.3; // In-game = dropped low for focus (SFX cut through on top). 0=silent~1=full; tune here.
const GAME_TRACKS = [overdriveUrl, warpUrl];
let inGamePrev = false;
let gameTrackUrl = GAME_TRACKS[0];

function inGame(f: FlowState, o: OnlineState): boolean {
  const onlineActive = o.gameId != null && BATTLE_ONLINE.has(o.phase);
  if (onlineActive) return true;
  return f.mode === 'offline' && f.gameId != null && (f.phase === 'playing' || f.phase === 'round-result');
}

/** Update BGM track/volume by zone — pick a random in-game track on entry, crossfade to focus volume */
function updateBgm(f: FlowState, o: OnlineState): void {
  const g = inGame(f, o);
  if (g && !inGamePrev) {
    // Pick a random in-game track only at the moment of entering a game (kept for the rest of the match)
    gameTrackUrl = GAME_TRACKS[Math.floor(Math.random() * GAME_TRACKS.length)];
  }
  inGamePrev = g;
  setBgm(g ? gameTrackUrl : lobbyUrl, g ? GAME_VOL : LOBBY_VOL);
}

/** Offline flow transition → modal/flow/result SFX */
function onFlow(prev: FlowState, cur: FlowState, online: OnlineState): void {
  // Modal open/close
  if (prev.modal !== cur.modal) {
    if (cur.modal != null) sfx('ui-modal-open');
    else if (prev.modal != null) sfx('ui-modal-close');
  }

  // If an online match is active, result/start stingers are handled on the online side (avoid duplication)
  const onlineActive = online.gameId != null && (BATTLE_ONLINE.has(online.phase) || online.phase === 'match-end');
  if (!onlineActive) {
    // Round/match start
    if (cur.phase === 'playing' && (prev.phase !== 'playing' || cur.currentRound !== prev.currentRound)) {
      sfx('flow-match-start');
    }
    // Round end stinger
    if (prev.phase === 'playing' && cur.phase === 'round-result') {
      const last = cur.roundResults[cur.roundResults.length - 1];
      sfx(last?.winner ? 'flow-win-stinger' : 'flow-draw-stinger');
    }
    // Match end stinger
    if (prev.phase !== 'match-result' && cur.phase === 'match-result') {
      sfx(cur.matchResult === 'DRAW' ? 'flow-draw-stinger' : 'flow-win-stinger');
    }
  }

  updateBgm(cur, online);
}

/** Online store transition → matchmaking/countdown/result/coin SFX */
function onOnline(prev: OnlineState, cur: OnlineState): void {
  // Bet confirm (entering the quick-start queue)
  if (prev.phase !== 'queue' && cur.phase === 'queue') sfx('coin-bet-confirm');
  // Matchmaking success (opponent assigned)
  if (prev.opponent == null && cur.opponent != null) sfx('mm-match-found');
  // Code-room member count change
  const pn = prev.room?.members.length ?? 0;
  const cn = cur.room?.members.length ?? 0;
  if (pn < 2 && cn >= 2) sfx('room-opponent-join');
  else if (pn >= 2 && cn < 2 && cur.phase !== 'match-end') sfx('room-opponent-leave');

  // Round start (countdown) / GO
  if (prev.phase !== 'countdown' && cur.phase === 'countdown') sfx('flow-match-start');
  if (prev.phase === 'countdown' && cur.phase === 'playing') sfx('flow-go');

  // Round result stinger (win/loss from my role's perspective)
  if (prev.phase !== 'round-result' && cur.phase === 'round-result') {
    const res = cur.lastRoundResult;
    if (res === 'DRAW' || res == null) sfx('flow-draw-stinger');
    else sfx(res === cur.role ? 'flow-win-stinger' : 'flow-lose-stinger');
  }

  // Match end stinger + coin settlement (SlotResult = 'A_WIN'|'B_WIN'|'DRAW' → win/loss from my slot's perspective)
  if (prev.phase !== 'match-end' && cur.phase === 'match-end') {
    const mr = cur.matchResult;
    const won = mr != null && mr === `${cur.mySlot}_WIN`;
    sfx(mr === 'DRAW' ? 'flow-draw-stinger' : won ? 'flow-win-stinger' : 'flow-lose-stinger');
    const delta = cur.coinDelta ?? 0;
    if (delta !== 0) {
      // Coin sound after the stinger (avoid overlap)
      window.setTimeout(() => sfx(delta > 0 ? 'coin-gain' : 'coin-loss'), 720);
    }
  }
  // Opponent left/aborted
  if (prev.phase !== 'aborted' && cur.phase === 'aborted') sfx('ui-error-beep');

  updateBgm(flowStore.get(), cur);
}

// ── Document event delegation (locked Button/Modal not modified) ──
function classify(el: Element): string {
  const disabled =
    (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
  if (disabled) return 'ui-error-beep';
  const tid = el.getAttribute('data-testid') ?? '';
  const cl = el.classList;
  if (cl.contains('nc-btn--danger') || cl.contains('nc-btn--tertiary') || /cancel|back|exit|leave|logout|main/.test(tid)) {
    return 'ui-cancel-back';
  }
  if (cl.contains('nc-btn--primary') || /confirm|online|next|start|quick|create|join|ok|play|select|game-card/.test(tid)) {
    return 'ui-confirm';
  }
  return 'ui-click';
}

function onClickCapture(e: Event): void {
  const t = e.target as Element | null;
  if (!t || typeof t.closest !== 'function') return;
  const el = t.closest('button, a[href], [role="button"], .nc-btn, .nc-coinbtn');
  if (!el) return;
  sfx(classify(el));
}

function onOverCapture(e: Event): void {
  const t = e.target as Element | null;
  if (!t || typeof t.closest !== 'function') return;
  const el = t.closest('.nc-btn, .nc-coinbtn, button, [role="button"]');
  if (!el) return;
  const now = Date.now();
  if (now - lastHover < 55) return;
  lastHover = now;
  sfx('ui-hover');
}

function onGesture(): void {
  unlockAudio();
}

export function initAudio(): void {
  if (inited || typeof window === 'undefined' || typeof document === 'undefined') return;
  inited = true;

  // Unlock audio on a gesture (browser autoplay policy)
  window.addEventListener('pointerdown', onGesture, { capture: true });
  window.addEventListener('keydown', onGesture, { capture: true });
  // UI SFX delegation
  document.addEventListener('click', onClickCapture, { capture: true });
  document.addEventListener('pointerover', onOverCapture, { capture: true });

  // Store subscriptions (non-React)
  let prevFlow = flowStore.get();
  flowStore.subscribe(() => {
    const cur = flowStore.get();
    const p = prevFlow;
    prevFlow = cur;
    onFlow(p, cur, onlineStore.get());
  });

  let prevOnline = onlineStore.get();
  onlineStore.subscribe(() => {
    const cur = onlineStore.get();
    const p = prevOnline;
    prevOnline = cur;
    onOnline(p, cur);
  });

  let prevSession = sessionStore.get();
  sessionStore.subscribe(() => {
    const cur = sessionStore.get();
    const p = prevSession;
    prevSession = cur;
    if (!p.loggedIn && cur.loggedIn) sfx('ui-login-success');
  });

  // Schedule initial BGM (lobby) — starts on the first gesture
  updateBgm(flowStore.get(), onlineStore.get());
}

// Re-export mute toggle (for wiring to Settings)
export { setMuted, isMuted, stopBgm };
