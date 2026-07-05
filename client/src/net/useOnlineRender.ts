/**
 * 온라인 게임 화면용 렌더 훅 (성능 구조 표준) — Game2에서 검증된 패턴을 게임 무관하게 추출.
 *
 * 문제: 기존 useOnlineGame은 스토어 '전체'를 구독해서, 서버 스냅샷이 올 때마다(60Hz)
 *       게임 컴포넌트가 통째로 리렌더되고, rAF 루프 effect도 매 프레임 재생성(churn)됐다.
 *
 * 해결(이 훅):
 *  1) 활성/역할만 '원시 문자열 sig'로 선택 구독 → 값이 바뀌는 라운드 경계에서만 리렌더.
 *  2) 서버 스냅샷 → ref 미러링을 '직접 스토어 구독'으로 처리(리렌더 유발 안 함).
 *     게임별 per-snapshot 작업(HP/시간 등 setState)은 onSnapshot 콜백으로 위임 —
 *     이 setState들은 '값이 실제로 바뀔 때만' 리렌더(초 양자화 등)라 60Hz 리렌더가 사라진다.
 *
 * 사용(각 게임 화면):
 *   const { isOnline, myRole, stateRef, snapAtRef } = useOnlineRender<Game2State>(2, (s) => {
 *     setHp(s.hp); setHudMs(...);   // 게임별 HUD 반영
 *   });
 *   // rAF 루프는 stateRef.current(최신 스냅샷) / snapAtRef.current(수신시각)를 읽어 그린다.
 *   // 루프 effect deps는 [isOnline, myRole, ...] 처럼 '안정 원시값'만 → 루프 재생성 없음.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GameId, Role } from '@madpump/shared';
import { onlineStore } from './online';

export interface OnlineRender<S> {
  /** 이 게임이 지금 온라인 매치의 현재 라운드로 활성인가 */
  isOnline: boolean;
  /** 이 매치에서 내 역할(P1/P2). 비활성이면 null */
  myRole: Role | null;
  /** 최신 서버 스냅샷(투영 상태). 스냅샷마다 갱신되지만 리렌더는 유발 안 함 */
  stateRef: React.MutableRefObject<S | null>;
  /** 마지막 스냅샷 수신 시각(performance.now) — 렌더 외삽 dt 계산용 */
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
  // onSnapshot이 매 렌더 새 클로저여도 최신을 쓰도록 ref로 보관(effect는 gameId만 의존).
  const onSnapRef = useRef(onSnapshot);
  onSnapRef.current = onSnapshot;

  // (1) 활성/역할만 선택 구독 — 원시 문자열 sig. 값 안 바뀌면 리렌더 안 함.
  const readSig = () => {
    const o = onlineStore.get();
    return isActive(o, gameId) ? `1:${o.role}` : '0';
  };
  const sig = useSyncExternalStore(onlineStore.subscribe, readSig, readSig);
  const isOnline = sig !== '0';
  const myRole: Role | null = isOnline ? (sig.slice(2) as Role) : null;

  // (2) 스냅샷 → ref 미러링을 직접 구독으로(리렌더 없이). 게임별 작업은 onSnapshot에 위임.
  useEffect(() => {
    const sync = () => {
      const o = onlineStore.get();
      if (!isActive(o, gameId) || !o.serverState) return;
      const s = o.serverState as S;
      stateRef.current = s;
      snapAtRef.current = performance.now();
      onSnapRef.current?.(s);
    };
    sync(); // 초기 1회
    return onlineStore.subscribe(sync); // 스냅샷마다 호출되지만 리렌더는 유발 안 함
  }, [gameId]);

  return { isOnline, myRole, stateRef, snapAtRef };
}
