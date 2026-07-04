/**
 * 초경량 외부 스토어 헬퍼 — session.ts / flow.ts 공용.
 * localStorage 없이 순수 메모리 상태. React에는 useSyncExternalStore로 연결.
 *
 * [구현 에이전트 주의] 이 파일은 아키텍트 소유 — 수정 금지.
 */
import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  /** 부분 patch 또는 (prev)=>next 함수로 갱신. 갱신 후 구독자 전원 알림 */
  set(patch: Partial<T> | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      state =
        typeof patch === 'function' ? patch(state) : { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** React 훅: 스토어 전체 상태 구독 */
export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
