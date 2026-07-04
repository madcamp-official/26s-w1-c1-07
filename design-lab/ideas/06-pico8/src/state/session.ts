/**
 * mock 세션 상태 — 서버 없음, localStorage 없음(순수 메모리).
 *
 * [구현 에이전트 주의] 아키텍트 소유 — 수정 금지. import해서 사용만.
 *
 * 사용법 (ARCHITECTURE.md §3 참조):
 *   const session = useSession();                 // 리액티브 구독
 *   session.loggedIn / session.nickname / session.user
 *
 *   await loginWithGoogleMock();                  // 0.5초 가짜 지연 → 'onboarding' | 'main' 반환
 *   const r = submitOnboarding('철수', '1분반');   // {ok:true} | {ok:false, reason:'duplicate'|'empty'}
 *   logout();                                     // 세션 클리어 (프로필은 메모리에 유지 → 재로그인 시 S2 직행)
 */
import { mockUsers } from '@shared';
import { createStore, useStore } from './store';

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  nickname: string;
  /** 분반명 (예: '1분반') — 온보딩 입력 그대로 저장 */
  groupName: string;
  /** Avatar 색 인덱스 0~7 */
  avatarColorIndex: number;
}

export interface SessionState {
  loggedIn: boolean;
  /** 편의 필드 — user?.nickname과 동일 (미로그인/온보딩 전이면 null) */
  nickname: string | null;
  user: SessionUser | null;
  /** true면 로그인은 됐지만 프로필(이름+분반) 미등록 → S5로 보내야 함 */
  needsOnboarding: boolean;
}

// ---------------------------------------------------------------------------
// 내부 상태
// ---------------------------------------------------------------------------

const store = createStore<SessionState>({
  loggedIn: false,
  nickname: null,
  user: null,
  needsOnboarding: false,
});

/** 이 브라우저 세션에서 이미 온보딩을 마친 프로필 (로그아웃해도 메모리에 유지) */
let savedProfile: SessionUser | null = null;

/** 닉네임 중복 검증용 금지 이름 — SPEC S5: "test" 시나리오 + mock 유저 닉네임 */
export const TAKEN_NICKNAMES: readonly string[] = [
  'test',
  ...mockUsers.map((u) => u.nickname),
];

/** 로그인 mock 지연 (ms) — SPEC S1 "0.5초 가짜 지연" */
export const LOGIN_MOCK_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/** 현재 세션 스냅샷 (비리액티브) */
export function getSession(): SessionState {
  return store.get();
}

/** 세션 변경 구독 (디버그 브리지 등) */
export function subscribeSession(listener: () => void): () => void {
  return store.subscribe(listener);
}

/** React 훅 — 세션 리액티브 구독 */
export function useSession(): SessionState {
  return useStore(store);
}

/**
 * mock Google 로그인. 0.5초 가짜 지연 후 로그인 처리.
 * @returns 'onboarding' — 최초 로그인(프로필 없음) → S5로 라우팅할 것
 *          'main'       — 기존 유저(프로필 있음) → S2로 라우팅할 것
 */
export async function loginWithGoogleMock(): Promise<'onboarding' | 'main'> {
  await new Promise((r) => setTimeout(r, LOGIN_MOCK_DELAY_MS));
  if (savedProfile) {
    store.set({
      loggedIn: true,
      user: savedProfile,
      nickname: savedProfile.nickname,
      needsOnboarding: false,
    });
    return 'main';
  }
  store.set({
    loggedIn: true,
    user: null,
    nickname: null,
    needsOnboarding: true,
  });
  return 'onboarding';
}

export type OnboardingResult =
  | { ok: true }
  | { ok: false; reason: 'duplicate' | 'empty' };

/**
 * 닉네임 온보딩 제출 (S5).
 * - 빈 값 → {ok:false, reason:'empty'} (제출 방지 — QA-S5-05)
 * - TAKEN_NICKNAMES 포함 → {ok:false, reason:'duplicate'} ("이미 사용하고 있는 이름입니다")
 * - 성공 시 세션에 프로필 저장 → 호출측에서 S2로 라우팅
 */
export function submitOnboarding(
  nickname: string,
  groupName: string,
): OnboardingResult {
  const name = nickname.trim();
  const group = groupName.trim();
  if (!name || !group) return { ok: false, reason: 'empty' };
  if (TAKEN_NICKNAMES.some((t) => t.toLowerCase() === name.toLowerCase())) {
    return { ok: false, reason: 'duplicate' };
  }
  savedProfile = {
    id: 'me',
    nickname: name,
    groupName: group,
    avatarColorIndex: 0,
  };
  store.set({
    loggedIn: true,
    user: savedProfile,
    nickname: savedProfile.nickname,
    needsOnboarding: false,
  });
  return { ok: true };
}

/** 로그아웃 → S1 복귀용. 프로필 메모리는 유지(재로그인 시 온보딩 생략) */
export function logout(): void {
  store.set({
    loggedIn: false,
    user: null,
    nickname: null,
    needsOnboarding: false,
  });
}
