/**
 * Tiny external-store helper — module state + useSyncExternalStore, no React context.
 * Used by session.ts / flow.ts. (Owned by the architect — implementation agents must not modify)
 */
import { useSyncExternalStore } from 'react';

export interface Store<T> {
  /** Current snapshot (immutable object) */
  get(): T;
  /** Replace state via partial patch or updater function + notify subscribers */
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

/** React hook — subscribe to the store's full snapshot */
export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
