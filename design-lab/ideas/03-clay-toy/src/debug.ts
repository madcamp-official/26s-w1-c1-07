/**
 * QA 자동화용 디버그 브리지 (dev 전용, 필수).
 * (아키텍트 소유 — 구현 에이전트는 import만, 수정 금지)
 *
 * window.__MADPUMP__ = {
 *   screen:  현재 화면 id 문자열 (컨테이너 testid: 'scr-main-out' 등),
 *   game:    현재 게임의 최신 state 객체 (@shared 로직 state 그대로) or null,
 *   session: { loggedIn, nickname },
 * }
 *
 * 사용법:
 *  - 화면 컴포넌트:  useDebugScreen('scr-game1')  ← 마운트 시 screen 갱신 (스텁에 이미 포함)
 *  - 게임 화면:      매 틱마다 setDebugGame(state), 언마운트/종료 시 setDebugGame(null)
 *  - session은 main.tsx의 initDebugBridge()가 sessionStore를 구독해 자동 갱신
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

/** main.tsx에서 1회 호출 — session 자동 동기화 시작 */
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

/** 현재 화면 id 갱신 (화면 컨테이너 testid 문자열 사용) */
export function setDebugScreen(id: string): void {
  const b = bridge();
  if (b) b.screen = id;
}

/** 현재 게임 state 갱신 — 게임 화면이 매 틱 호출. 게임 이탈 시 null */
export function setDebugGame(state: unknown | null): void {
  const b = bridge();
  if (b) b.game = state;
}

/** 화면 컴포넌트 마운트 시 screen을 갱신하는 훅 */
export function useDebugScreen(id: string): void {
  useEffect(() => {
    setDebugScreen(id);
  }, [id]);
}
