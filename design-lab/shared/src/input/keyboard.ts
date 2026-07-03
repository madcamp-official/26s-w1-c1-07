/**
 * 키보드 입력 매핑 — DOM 무관 순수 모듈.
 * 브라우저 어댑터(attachKeyboardAdapter)만 DOM 이벤트 타깃을 다루며,
 * 그마저도 구조적 타입만 사용해 코어는 어떤 환경에서도 typecheck된다.
 */
import type { PlayerRole } from '../types.js';

/** 플레이어 한 명이 쓰는 두 개의 조작키 */
export interface PlayerKeys {
  key1: string;
  key2: string;
}

/** 좌/우 플레이어 키맵 (P1 = 왼쪽, P2 = 오른쪽) */
export interface KeyboardMap {
  playerL: PlayerKeys;
  playerR: PlayerKeys;
}

/** 기본 키맵: 왼쪽 q/w, 오른쪽 u/i */
export const DEFAULT_KEYBOARD_MAP: KeyboardMap = {
  playerL: { key1: 'q', key2: 'w' },
  playerR: { key1: 'u', key2: 'i' },
};

/** 기본값 복사본을 반환 (호출자가 자유롭게 변형 가능) */
export function createDefaultKeyboardMap(): KeyboardMap {
  return {
    playerL: { ...DEFAULT_KEYBOARD_MAP.playerL },
    playerR: { ...DEFAULT_KEYBOARD_MAP.playerR },
  };
}

/**
 * 키맵 일부를 변경한 새 키맵을 반환한다 (원본 불변).
 * 예) remapKeys(map, { playerL: { key1: 'a' } })
 */
export function remapKeys(
  base: KeyboardMap,
  patch: Partial<{ playerL: Partial<PlayerKeys>; playerR: Partial<PlayerKeys> }>,
): KeyboardMap {
  return {
    playerL: { ...base.playerL, ...patch.playerL },
    playerR: { ...base.playerR, ...patch.playerR },
  };
}

/** 매핑된 키 이벤트 해석 결과 */
export interface MappedKey {
  player: PlayerRole; // playerL → 'P1', playerR → 'P2'
  key: 'key1' | 'key2';
}

/**
 * 물리 키 문자열을 키맵에 따라 해석한다. 매핑에 없으면 null.
 * 대소문자 무시.
 */
export function resolveKey(map: KeyboardMap, rawKey: string): MappedKey | null {
  const k = rawKey.toLowerCase();
  if (k === map.playerL.key1.toLowerCase()) return { player: 'P1', key: 'key1' };
  if (k === map.playerL.key2.toLowerCase()) return { player: 'P1', key: 'key2' };
  if (k === map.playerR.key1.toLowerCase()) return { player: 'P2', key: 'key1' };
  if (k === map.playerR.key2.toLowerCase()) return { player: 'P2', key: 'key2' };
  return null;
}

/** 키 눌림/뗌 이벤트 (코어가 소비하는 형태) */
export interface KeyInputEvent extends MappedKey {
  phase: 'down' | 'up';
}

// ---------------------------------------------------------------------------
// 브라우저 어댑터 — DOM 접근은 이 함수 안에서만 일어난다.
// DOM lib 없이도 컴파일되도록 구조적 최소 타입만 선언한다.
// ---------------------------------------------------------------------------

interface KeyboardEventLike {
  key: string;
  repeat?: boolean;
}

interface EventTargetLike {
  addEventListener(type: string, listener: (ev: KeyboardEventLike) => void): void;
  removeEventListener(type: string, listener: (ev: KeyboardEventLike) => void): void;
}

/**
 * 브라우저 keydown/keyup을 키맵으로 해석해 콜백으로 전달한다.
 * @param target 보통 window 또는 document
 * @returns 리스너 해제 함수
 */
export function attachKeyboardAdapter(
  target: EventTargetLike,
  map: KeyboardMap,
  onInput: (ev: KeyInputEvent) => void,
): () => void {
  const onDown = (e: KeyboardEventLike) => {
    if (e.repeat) return; // OS 키 반복 무시
    const mapped = resolveKey(map, e.key);
    if (mapped) onInput({ ...mapped, phase: 'down' });
  };
  const onUp = (e: KeyboardEventLike) => {
    const mapped = resolveKey(map, e.key);
    if (mapped) onInput({ ...mapped, phase: 'up' });
  };
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  return () => {
    target.removeEventListener('keydown', onDown);
    target.removeEventListener('keyup', onUp);
  };
}
