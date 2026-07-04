/**
 * 초소형 외부 스토어 헬퍼 — React context 없이 모듈 상태 + useSyncExternalStore.
 * session.ts / flow.ts 가 사용한다. (아키텍트 소유 — 구현 에이전트 수정 금지)
 */
import { useSyncExternalStore } from 'react';

export interface Store<T> {
  /** 현재 스냅샷 (불변 객체) */
  get(): T;
  /** 부분 패치 또는 updater 함수로 상태 교체 + 구독자 통지 */
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
        typeof patch === 'function' ? (patch as (prev: T) => T)(state) : { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** React 훅 — 스토어 전체 스냅샷 구독 */
export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
