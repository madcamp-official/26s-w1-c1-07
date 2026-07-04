/**
 * 디버그 브리지 (dev 전용, QA 자동화 필수) — 전 시안 공통 명세 그대로:
 *
 *   window.__MADPUMP__ = {
 *     screen:  현재 화면 id 문자열 (scr-main-out 등 testid 레지스트리 값),
 *     game:    현재 게임의 최신 state 객체(@shared 로직의 state 그대로) | null,
 *     session: { loggedIn, nickname },
 *   }
 *
 * 갱신 규칙:
 *   - 화면 전환마다: 각 화면 컴포넌트가 useDebugScreen('scr-...') 호출 (스텁에 이미 배선됨)
 *   - 게임 틱마다:   게임 화면이 setDebugGame(state) 호출, 언마운트 시 setDebugGame(null)
 *   - 세션:          session store 구독으로 자동 갱신 (main.tsx의 initDebugBridge)
 *
 * [구현 에이전트 주의] 아키텍트 소유 — 수정 금지.
 */
import { useEffect } from 'react';
import { getSession, subscribeSession } from './state/session';

export interface MadpumpBridge {
  screen: string;
  game: unknown | null;
  session: { loggedIn: boolean; nickname: string | null };
}

declare global {
  interface Window {
    __MADPUMP__?: MadpumpBridge;
  }
}

const enabled = import.meta.env.DEV && typeof window !== 'undefined';

function bridge(): MadpumpBridge | null {
  if (!enabled) return null;
  if (!window.__MADPUMP__) {
    const s = getSession();
    window.__MADPUMP__ = {
      screen: '',
      game: null,
      session: { loggedIn: s.loggedIn, nickname: s.nickname },
    };
  }
  return window.__MADPUMP__;
}

/** main.tsx에서 1회 호출 — 세션 상태를 브리지에 자동 반영 */
export function initDebugBridge(): void {
  const b = bridge();
  if (!b) return;
  subscribeSession(() => {
    const s = getSession();
    const cur = bridge();
    if (cur) cur.session = { loggedIn: s.loggedIn, nickname: s.nickname };
  });
}

/** 현재 화면 id 갱신 (testid 레지스트리의 컨테이너 id 문자열 사용) */
export function setDebugScreen(id: string): void {
  const b = bridge();
  if (b) b.screen = id;
}

/** 게임 틱마다 최신 state 반영. 게임 화면 언마운트 시 null로 정리 */
export function setDebugGame(state: unknown | null): void {
  const b = bridge();
  if (b) b.game = state;
}

/**
 * 화면 컴포넌트용 훅 — 마운트 시 screen id 등록.
 * 예) useDebugScreen('scr-game1')
 */
export function useDebugScreen(id: string): void {
  useEffect(() => {
    setDebugScreen(id);
  }, [id]);
}
