/**
 * 세션 상태 — 로스터 로그인(분반→멤버 선택, docs/AUTH.md) + 쿠키 세션.
 * 서버가 mp_session 쿠키를 발급하고, 클라는 이 스토어에 유저 정보를 미러링한다.
 *
 * 사용법:
 *   const session = useSession();          // React 컴포넌트에서 구독
 *   restoreSession();                      // 부팅 시 GET /api/me 로 세션 복원
 *   await fetchRoster();                   // 로그인 다이얼로그용 분반·멤버 명단
 *   await loginAs(userId);                 // 멤버 선택 → 즉시 로그인 (인증 절차 없음)
 *   logout();                              // 로그아웃 → 이후 navigate('/')
 */
import { createStore, useStore } from './store';
import { SERVER_URL } from '../net/config';
import { disconnectOnline } from '../net/online';

export interface SessionUser {
  id: string;
  /** Avatar 컴포넌트 palette 인덱스 (0~7) */
  avatarColorIndex: number;
  /** 프로필 사진 URL (로스터 로그인은 항상 null — 아바타 색으로 표시) */
  imageUrl: string | null;
}

export interface SessionState {
  loggedIn: boolean;
  nickname: string | null;
  /** 분반 이름 (예: '1분반') */
  groupName: string | null;
  user: SessionUser | null;
  /** 보유 코인 (비로그인 시 0) — 서버 /api/me 가 정본, 여기는 미러 */
  coins: number;
  /** 오프라인 게임 해금 상태 (LOCKABLE_GAME_IDS 순서의 비트마스크 — shared/coins.ts) */
  unlockedCount: number;
}

const INITIAL: SessionState = {
  loggedIn: false,
  nickname: null,
  groupName: null,
  user: null,
  coins: 0,
  unlockedCount: 0,
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
  coins?: number;
  unlockedCount?: number;
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
    user: { id: u.id, avatarColorIndex: avatarIndexOf(u.id), imageUrl: u.imageUrl },
    coins: u.coins ?? 0,
    unlockedCount: u.unlockedCount ?? 0,
  });
}

/** 코인/해금 상태만 갱신 (해금 API 응답, 매치 정산 반영용) */
export function updateWallet(coins: number, unlockedCount?: number): void {
  sessionStore.set(unlockedCount === undefined ? { coins } : { coins, unlockedCount });
}

/**
 * 게임 해금 (POST /api/unlock) — 잠긴 게임 id 를 지정, 성공 시 지갑 갱신.
 * 잠긴 두 게임은 순서 무관하게 각각 해금할 수 있다 (shared/coins.ts).
 * @returns 성공: { unlockedGameId } / 실패: { error: 사용자 표시용 메시지 }
 */
export async function unlockGame(gameId: number): Promise<{ unlockedGameId?: number; error?: string }> {
  try {
    const res = await fetch(`${SERVER_URL}/api/unlock`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data?.error?.message ?? '해금 실패' };
    updateWallet(data.coins, data.unlockedCount);
    return { unlockedGameId: data.unlockedGameId };
  } catch {
    return { error: '서버 연결 실패' };
  }
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

/** 로그인 다이얼로그용 분반·멤버 명단 (GET /api/roster) */
export interface RosterMember {
  id: string;
  nickname: string;
}
export interface RosterGroup {
  id: string;
  name: string;
  members: RosterMember[];
}

export async function fetchRoster(): Promise<RosterGroup[]> {
  const res = await fetch(`${SERVER_URL}/api/roster`, { credentials: 'include' });
  if (!res.ok) throw new Error('ROSTER_FAILED');
  const data = await res.json();
  return (data.groups ?? []) as RosterGroup[];
}

/**
 * 멤버 선택 로그인 (POST /api/login) — 성공 시 세션 쿠키 발급 + 스토어 갱신.
 * @returns true 성공 / false 실패
 */
export async function loginAs(userId: string): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/api/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.status !== 'USER' || !data.user) return false;
    setLoggedInUser(data.user);
    return true;
  } catch {
    return false;
  }
}

/** 로그아웃. 호출자가 navigate('/') 할 것 (S1으로 전환됨). */
export function logout(): void {
  void fetch(`${SERVER_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  disconnectOnline(); // 소켓/온라인 상태도 정리
  sessionStore.set({ ...INITIAL });
}
