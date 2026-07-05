/**
 * mock 세션 상태 — 서버 없음, localStorage 없음, 순수 메모리.
 * (아키텍트 소유 — 구현 에이전트는 import만, 수정 금지)
 *
 * 사용법:
 *   const session = useSession();                  // React 컴포넌트에서 구독
 *   const dest = await mockGoogleLogin();          // 'onboarding' | 'main' — 그쪽으로 navigate
 *   if (isNicknameTaken(name)) ...                 // S5 중복 검증 ("test" 등)
 *   completeOnboarding('철수', '1분반');            // S5 확인 → 이후 navigate('/')
 *   logout();                                      // S2 로그아웃 → 이후 navigate('/')
 */
import { mockUsers } from '@/shell';
import { createStore, useStore } from './store';

export interface SessionUser {
  id: string;
  /** Avatar 컴포넌트 palette 인덱스 (0~7) */
  avatarColorIndex: number;
}

export interface SessionState {
  loggedIn: boolean;
  /** 온보딩 완료 전엔 null */
  nickname: string | null;
  /** 분반 이름 (예: '1분반') — 온보딩 완료 전엔 null */
  groupName: string | null;
  /** 로그인했지만 아직 닉네임 온보딩(S5)을 안 끝낸 상태 */
  needsOnboarding: boolean;
  user: SessionUser | null;
}

const INITIAL: SessionState = {
  loggedIn: false,
  nickname: null,
  groupName: null,
  needsOnboarding: false,
  user: null,
};

export const sessionStore = createStore<SessionState>(INITIAL);

/** React 훅 */
export function useSession(): SessionState {
  return useStore(sessionStore);
}

/** 비-React 코드용 스냅샷 */
export function getSession(): SessionState {
  return sessionStore.get();
}

/**
 * 같은 브라우저 세션(메모리) 안에서 로그아웃 후 재로그인하면
 * "기존 유저"로 취급하기 위한 프로필 기억.
 */
let rememberedProfile: { nickname: string; groupName: string } | null = null;

const MOCK_LOGIN_DELAY_MS = 500;

/**
 * 가짜 Google 로그인 (SPEC S1: 0.5초 지연 후 세션 생성).
 * @returns 'onboarding' — 최초 로그인, S5로 navigate 할 것
 *          'main'       — 기존 유저, S2(메인)로 navigate 할 것
 */
export function mockGoogleLogin(): Promise<'onboarding' | 'main'> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const user: SessionUser = { id: 'me', avatarColorIndex: 0 };
      if (rememberedProfile) {
        sessionStore.set({
          loggedIn: true,
          nickname: rememberedProfile.nickname,
          groupName: rememberedProfile.groupName,
          needsOnboarding: false,
          user,
        });
        resolve('main');
      } else {
        sessionStore.set({
          loggedIn: true,
          nickname: null,
          groupName: null,
          needsOnboarding: true,
          user,
        });
        resolve('onboarding');
      }
    }, MOCK_LOGIN_DELAY_MS);
  });
}

/** 금지(중복) 닉네임 — SPEC S5의 "test" 시나리오 + mock 유저 이름들 */
const TAKEN_NICKNAMES = new Set<string>(['test', ...mockUsers.map((u) => u.nickname)]);

/** S5 이름 중복 검증. 대소문자 무시. */
export function isNicknameTaken(nickname: string): boolean {
  return TAKEN_NICKNAMES.has(nickname.trim().toLowerCase()) || TAKEN_NICKNAMES.has(nickname.trim());
}

/** S5 확인 제출 (검증 통과 후 호출). 호출자가 navigate('/') 할 것. */
export function completeOnboarding(nickname: string, groupName: string): void {
  rememberedProfile = { nickname: nickname.trim(), groupName: groupName.trim() };
  sessionStore.set({
    nickname: rememberedProfile.nickname,
    groupName: rememberedProfile.groupName,
    needsOnboarding: false,
  });
}

/** S2 로그아웃. 호출자가 navigate('/') 할 것 (S1으로 전환됨). */
export function logout(): void {
  sessionStore.set({ ...INITIAL });
}
