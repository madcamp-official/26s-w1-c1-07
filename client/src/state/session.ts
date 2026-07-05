/**
 * 세션 상태 — 실제 서버 인증(구글 OAuth + 쿠키 세션) 연동.
 * 서버가 mp_session 쿠키를 발급하고, 클라는 이 스토어에 유저 정보를 미러링한다.
 *
 * 사용법:
 *   const session = useSession();                       // React 컴포넌트에서 구독
 *   restoreSession();                                   // 부팅 시 GET /api/me 로 세션 복원
 *   const dest = await googleLogin(credential);         // 'onboarding' | 'main' — 그쪽으로 navigate
 *   await completeOnboarding('철수', '1분반');           // 'ok' | 'taken' | 'error'
 *   logout();                                           // S2 로그아웃 → 이후 navigate('/')
 */
import { createStore, useStore } from './store';
import { SERVER_URL } from '../net/config';
import { disconnectOnline } from '../net/online';

export interface SessionUser {
  id: string;
  /** Avatar 컴포넌트 palette 인덱스 (0~7) */
  avatarColorIndex: number;
  /** 구글 프로필 사진 URL (없으면 null) */
  imageUrl: string | null;
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

/** 서버 응답 유저 형태 */
interface ServerUser {
  id: string;
  nickname: string;
  imageUrl: string | null;
  groupName?: string | null;
}

/** 유저 id로 아바타 색 인덱스 결정 (0~7 고정 매핑) */
function avatarIndexOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return h % 8;
}

function setLoggedInUser(u: ServerUser): void {
  sessionStore.set({
    loggedIn: true,
    nickname: u.nickname,
    groupName: u.groupName ?? null,
    needsOnboarding: false,
    user: { id: u.id, avatarColorIndex: avatarIndexOf(u.id), imageUrl: u.imageUrl },
  });
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${SERVER_URL}${path}`, {
    method: 'POST',
    credentials: 'include', // 세션 쿠키 필수
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * 부팅 시 세션 복원 — 쿠키가 살아있으면(GET /api/me) 로그인 상태로 전환.
 * main.tsx 에서 fire-and-forget 으로 호출.
 */
export async function restoreSession(): Promise<void> {
  try {
    const res = await fetch(`${SERVER_URL}/api/me`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.status === 'USER' && data.user) setLoggedInUser(data.user);
  } catch {
    // 서버 미기동 등 — 비로그인 상태 유지
  }
}

/** NEEDS_NICKNAME 응답 시 온보딩 제출까지 들고 갈 구글 credential (메모리 전용) */
let pendingCredential: string | null = null;

/**
 * 구글 로그인 — GIS 버튼 콜백의 credential 을 서버로 보내 검증.
 * @returns 'onboarding' — 신규 유저, S5로 navigate 할 것
 *          'main'       — 기존 유저, S2(메인)로 navigate 할 것
 * @throws 검증 실패/네트워크 오류
 */
export async function googleLogin(credential: string): Promise<'onboarding' | 'main'> {
  const res = await postJson('/api/auth/google', { credential });
  if (!res.ok) throw new Error('GOOGLE_LOGIN_FAILED');
  const data = await res.json();
  if (data.status === 'USER' && data.user) {
    setLoggedInUser(data.user);
    return 'main';
  }
  // NEEDS_NICKNAME — 아직 서버 세션 없음. 온보딩 화면으로 보내고 credential 보관.
  pendingCredential = credential;
  sessionStore.set({ loggedIn: true, nickname: null, groupName: null, needsOnboarding: true, user: null });
  return 'onboarding';
}

/**
 * S5 온보딩 제출 — 닉네임+분반으로 회원 생성.
 * @returns 'ok' 성공(세션 발급됨) / 'taken' 닉네임 중복 / 'error' 그 외 실패
 */
export async function completeOnboarding(nickname: string, groupName: string): Promise<'ok' | 'taken' | 'error'> {
  if (!pendingCredential) return 'error'; // 새로고침 등으로 credential 유실 — 재로그인 필요
  try {
    const res = await postJson('/api/auth/signup', {
      credential: pendingCredential,
      nickname: nickname.trim(),
      groupName: groupName.trim(),
    });
    if (res.status === 409) return 'taken';
    if (!res.ok) return 'error';
    const data = await res.json();
    pendingCredential = null;
    setLoggedInUser(data.user);
    return 'ok';
  } catch {
    return 'error';
  }
}

/** S2 로그아웃. 호출자가 navigate('/') 할 것 (S1으로 전환됨). */
export function logout(): void {
  void fetch(`${SERVER_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  disconnectOnline(); // 소켓/온라인 상태도 정리
  pendingCredential = null;
  sessionStore.set({ ...INITIAL });
}
