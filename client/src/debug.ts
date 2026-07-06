/**
 * Debug bridge for QA automation (dev only, required).
 * (Owned by the architect — implementation agents may only import, must not modify)
 *
 * window.__MADPUMP__ = {
 *   screen:  current screen id string (container testid: 'scr-main-out', etc.),
 *   game:    the current game's latest state object (@/shell logic state as-is) or null,
 *   session: { loggedIn, nickname },
 * }
 *
 * Usage:
 *  - Screen components:  useDebugScreen('scr-game1')  ← updates screen on mount (already included in the stub)
 *  - Game screens:       setDebugGame(state) every tick, setDebugGame(null) on unmount/exit
 *  - session is auto-updated by main.tsx's initDebugBridge() subscribing to sessionStore
 */
import { useEffect } from 'react';
import { sessionStore } from './state/session';

interface MadpumpBridge {
  screen: string;
  game: unknown | null;
  session: { loggedIn: boolean; nickname: string | null };
}

declare global {
  interface Window {
    __MADPUMP__?: MadpumpBridge;
  }
}

function isDev(): boolean {
  return typeof window !== 'undefined' && import.meta.env.DEV;
}

function bridge(): MadpumpBridge | null {
  if (!isDev()) return null;
  if (!window.__MADPUMP__) {
    window.__MADPUMP__ = { screen: '', game: null, session: { loggedIn: false, nickname: null } };
  }
  return window.__MADPUMP__;
}

/** Called once from main.tsx — starts automatic session sync */
export function initDebugBridge(): void {
  const b = bridge();
  if (!b) return;
  const sync = () => {
    const s = sessionStore.get();
    b.session = { loggedIn: s.loggedIn, nickname: s.nickname };
  };
  sync();
  sessionStore.subscribe(sync);
}

/** Updates the current screen id (uses the screen container's testid string) */
export function setDebugScreen(id: string): void {
  const b = bridge();
  if (b) b.screen = id;
}

/** Updates the current game state — called every tick by the game screen. null when leaving the game */
export function setDebugGame(state: unknown | null): void {
  const b = bridge();
  if (b) b.game = state;
}

/** Hook that updates screen when a screen component mounts */
export function useDebugScreen(id: string): void {
  useEffect(() => {
    setDebugScreen(id);
  }, [id]);
}
