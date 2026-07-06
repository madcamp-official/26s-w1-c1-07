/**
 * Render hook for online game screens (standard performance structure) — extracts the pattern proven in Game2, game-agnostic.
 *
 * Problem: the original useOnlineGame subscribed to the 'whole' store, so on every server snapshot (60Hz)
 *          the game component re-rendered entirely, and the rAF loop effect was re-created every frame (churn).
 *
 * Solution (this hook):
 *  1) Selectively subscribe to active/role only via a 'primitive string sig' → re-render only at round boundaries where the value changes.
 *  2) Handle server snapshot → ref mirroring via a 'direct store subscription' (doesn't trigger a re-render).
 *     Per-game per-snapshot work (setState for HP/time, etc.) is delegated to the onSnapshot callback —
 *     these setStates re-render 'only when the value actually changes' (second-quantization, etc.), so the 60Hz re-render is gone.
 *
 * Usage (each game screen):
 *   const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game2State>(2, (s) => {
 *     setHp(s.hp); setHudMs(...);   // reflect the per-game HUD
 *   });
 *   // The rAF loop reads stateRef.current (latest snapshot) / snapAtRef.current (receive time) to draw.
 *   // The loop effect deps are only 'stable primitives' like [isOnline, myRole, ...] → no loop re-creation.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GameId, Role } from '@madpump/shared';
import { onlineStore } from './online';

export interface OnlineRender<S> {
  /** Whether this game is active as the current round of the ongoing online match */
  isOnline: boolean;
  /** My role in this match (P1/P2). null if inactive */
  myRole: Role | null;
  /** Latest server snapshot (projected state). Updated on every snapshot but doesn't trigger a re-render */
  stateRef: React.MutableRefObject<S | null>;
  /** Time the last snapshot was received (performance.now) — for computing render extrapolation dt */
  snapAtRef: React.MutableRefObject<number>;
}

function isActive(o: ReturnType<typeof onlineStore.get>, gameId: GameId): boolean {
  return (
    o.gameId === gameId &&
    o.role != null &&
    (o.phase === 'countdown' || o.phase === 'playing' || o.phase === 'round-result')
  );
}

export function useOnlineRender<S>(gameId: GameId, onSnapshot?: (s: S) => void): OnlineRender<S> {
  const stateRef = useRef<S | null>(null);
  const snapAtRef = useRef(0);
  // Keep onSnapshot in a ref so the latest is used even though it's a new closure each render (the effect depends only on gameId).
  const onSnapRef = useRef(onSnapshot);
  onSnapRef.current = onSnapshot;

  // (1) Selectively subscribe to active/role only — primitive string sig. No re-render if the value doesn't change.
  const readSig = () => {
    const o = onlineStore.get();
    return isActive(o, gameId) ? `1:${o.role}` : '0';
  };
  const sig = useSyncExternalStore(onlineStore.subscribe, readSig, readSig);
  const isOnline = sig !== '0';
  const myRole: Role | null = isOnline ? (sig.slice(2) as Role) : null;

  // (2) Snapshot → ref mirroring via direct subscription (no re-render). Per-game work is delegated to onSnapshot.
  useEffect(() => {
    const sync = () => {
      const o = onlineStore.get();
      if (!isActive(o, gameId) || !o.serverState) return;
      const s = o.serverState as S;
      stateRef.current = s;
      snapAtRef.current = performance.now();
      onSnapRef.current?.(s);
    };
    sync(); // once on init
    return onlineStore.subscribe(sync); // called on every snapshot but doesn't trigger a re-render
  }, [gameId]);

  return { isOnline, myRole, stateRef, snapAtRef };
}
