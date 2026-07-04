/**
 * 디버그 브리지 (dev 전용, QA 자동화 필수).
 * window.__MADPUMP__ = { screen, game, session } — 화면 전환/게임 틱마다 갱신.
 *
 *   screen  : 현재 화면 id 문자열 (scr-main-out | scr-main-in | scr-onboarding |
 *             scr-game-select | scr-game1 | scr-game2 | scr-game3)
 *             ※ 모달은 screen을 바꾸지 않는다 (배경 화면 유지).
 *   game    : 현재 게임의 최신 state 객체 (@shared 로직의 state 그대로) or null
 *   session : { loggedIn, nickname } — 세션 스토어 변경 시 자동 동기화
 *
 * 사용법 (화면 구현 에이전트):
 *   - 모든 화면 컴포넌트 최상단에서 useScreenBridge('scr-xxx') 호출 (스텁에 이미 있음)
 *   - 게임 화면은 매 틱 reportGame(state) 호출, 언마운트 시 reportGame(null)
 *
 * 아키텍트 소유 — 화면 구현 에이전트는 수정 금지.
 */
import { useEffect } from 'react';
import { getSession, subscribeSession } from './state/session';

export interface MadpumpBridge {
  screen: string;
  game: unknown;
  session: { loggedIn: boolean; nickname: string | null };
}

declare global {
  interface Window {
    __MADPUMP__?: MadpumpBridge;
  }
}

const enabled = typeof window !== 'undefined' && import.meta.env.DEV;

function bridge(): MadpumpBridge | null {
  if (!enabled) return null;
  if (!window.__MADPUMP__) {
    window.__MADPUMP__ = {
      screen: '',
      game: null,
      session: { loggedIn: false, nickname: null },
    };
  }
  return window.__MADPUMP__;
}

/** 현재 화면 id 갱신 (화면 전환 시) */
export function reportScreen(screenId: string): void {
  const b = bridge();
  if (b) b.screen = screenId;
}

/** 현재 게임 state 갱신 (게임 틱마다). 게임 종료/이탈 시 null */
export function reportGame(state: unknown): void {
  const b = bridge();
  if (b) b.game = state;
}

function syncSession(): void {
  const b = bridge();
  if (!b) return;
  const s = getSession();
  b.session = { loggedIn: s.loggedIn, nickname: s.user?.nickname ?? null };
}

/** main.tsx에서 1회 호출 — 초기화 + 세션 자동 동기화 구독 */
export function initDebugBridge(): void {
  if (!enabled) return;
  bridge();
  syncSession();
  subscribeSession(syncSession);
}

/** 화면 컴포넌트용 훅: 마운트/화면 변경 시 screen 갱신 */
export function useScreenBridge(screenId: string): void {
  useEffect(() => {
    reportScreen(screenId);
  }, [screenId]);
}
