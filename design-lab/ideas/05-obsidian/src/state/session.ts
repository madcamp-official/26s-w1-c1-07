/**
 * Mock 세션 상태 — 서버 없음, localStorage 없음, 순수 메모리 모듈 상태.
 * 아키텍트 소유 — 화면 구현 에이전트는 이 파일을 수정하지 말고 import만 한다.
 *
 * 사용법:
 *   const session = useSession();               // React 구독
 *   const dest = await loginWithGoogle();       // 'onboarding' | 'main'
 *   if (dest === 'onboarding') navigate('/onboarding'); else navigate('/');
 *   completeOnboarding('홍길동', '1분반');       // S5 확인 → navigate('/')
 *   logout();                                    // → S1 (프로필은 메모리에 유지,
 *                                                //   재로그인 시 곧장 'main')
 */
import { useSyncExternalStore } from 'react';
import { mockGroups, mockUsers, type MockUser } from '@shared';

export interface SessionUser {
  id: string;
  nickname: string;
  /** 온보딩에서 입력한 분반명 (예: '1분반') */
  groupName: string;
  /** mockGroups에서 이름이 일치하는 분반 id. 일치 없으면 'g1' (리더보드 풀 기본값) */
  groupId: string;
  /** 이니셜 아바타 색 인덱스 (0~7) */
  avatarColorIndex: number;
}

export interface SessionState {
  loggedIn: boolean;
  /** 온보딩(닉네임 등록)을 마쳤는가 */
  onboarded: boolean;
  /** 로그인+온보딩 완료 시에만 non-null */
  user: SessionUser | null;
}

// ---------------------------------------------------------------------------
// 스토어 (모듈 상태 + useSyncExternalStore)
// ---------------------------------------------------------------------------

let state: SessionState = { loggedIn: false, onboarded: false, user: null };
/** 로그아웃해도 유지되는 프로필 — 재로그인 시 온보딩 생략 근거 */
let savedProfile: SessionUser | null = null;

const listeners = new Set<() => void>();

function emit(next: SessionState) {
  state = next;
  listeners.forEach((l) => l());
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSession(): SessionState {
  return state;
}

/** React 훅 — 세션 변경 시 리렌더 */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSession);
}

// ---------------------------------------------------------------------------
// 액션
// ---------------------------------------------------------------------------

const FAKE_LOGIN_DELAY_MS = 500;

/**
 * 가짜 Google 로그인 (SPEC S1: 클릭 → 0.5초 지연 → mock 유저).
 * @returns 'onboarding' = 최초 로그인(S5로 보낼 것) / 'main' = 기존 유저(S2로)
 */
export function loginWithGoogle(): Promise<'onboarding' | 'main'> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (savedProfile) {
        emit({ loggedIn: true, onboarded: true, user: savedProfile });
        resolve('main');
      } else {
        emit({ loggedIn: true, onboarded: false, user: null });
        resolve('onboarding');
      }
    }, FAKE_LOGIN_DELAY_MS);
  });
}

/** 금지(중복) 닉네임 — SPEC S5의 "test" 시나리오 + mock 유저 닉네임 전부 */
export function isNicknameTaken(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (n === 'test') return true;
  return mockUsers.some((u) => u.nickname.toLowerCase() === n);
}

/**
 * 온보딩 확인 제출. 호출 전에 isNicknameTaken/빈 값 검증은 화면에서 수행.
 * 성공 시 세션이 완성되고 S2로 라우팅하면 된다.
 */
export function completeOnboarding(nickname: string, groupName: string): SessionUser {
  const trimmedName = nickname.trim();
  const trimmedGroup = groupName.trim();
  const user: SessionUser = {
    id: 'me',
    nickname: trimmedName,
    groupName: trimmedGroup,
    groupId: mockGroups.find((g) => g.name === trimmedGroup)?.id ?? 'g1',
    avatarColorIndex: 2,
  };
  savedProfile = user;
  emit({ loggedIn: true, onboarded: true, user });
  return user;
}

/** 로그아웃 → S1. 프로필은 메모리에 남아 재로그인 시 'main'으로 직행 */
export function logout(): void {
  emit({ loggedIn: false, onboarded: savedProfile !== null, user: null });
}

// ---------------------------------------------------------------------------
// 리더보드 연동 헬퍼
// ---------------------------------------------------------------------------

/**
 * 나를 MockUser 형태로 반환 (computeLeaderboard에 mock 유저들과 함께 넣기 위함).
 * 매치 기록이 없으므로 리더보드 최하위(0점)로 계산된다 — 이것이 정직한 "내 등수".
 * 로그인 전/온보딩 전이면 null.
 */
export function selfAsMockUser(): MockUser | null {
  if (!state.user) return null;
  return {
    id: state.user.id,
    nickname: state.user.nickname,
    avatarColorIndex: state.user.avatarColorIndex,
    groupId: state.user.groupId,
  };
}

/** 내 분반의 mock 유저 목록 (나 제외). 리더보드 풀 구성용 */
export function groupMembers(): MockUser[] {
  const gid = state.user?.groupId ?? 'g1';
  return mockUsers.filter((u) => u.groupId === gid);
}
