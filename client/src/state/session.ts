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
  /** 오프라인 게임 해금 수 (UNLOCK_ORDER 앞에서부터 n개 — shared/coins.ts) */
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
 * 다음 게임 해금 (POST /api/unlock) — 성공 시 지갑 갱신.
 * @returns 성공: { unlockedGameId } / 실패: { error: 사용자 표시용 메시지 }
 */
export async function unlockNextGame(): Promise<{ unlockedGameId?: number; error?: string }> {
  try {
    const res = await fetch(`${SERVER_URL}/api/unlock`, { method: 'POST', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) return { error: data?.error?.message ?? '해금 실패' };
    updateWallet(data.coins, data.unlockedCount);
    return { unlockedGameId: data.unlockedGameId };
  } catch {
    return { error: '서버 연결 실패' };
  }
}

/** claimFarmReward 결과 — code/retryAfterMs 는 실패 시에만 */
export interface FarmClaimResult {
  reward?: number;
  error?: string;
  /** 서버 에러 코드: 'UNAUTHENTICATED' | 'COOLDOWN' | 'NETWORK' 등 */
  code?: string;
  /** COOLDOWN일 때 재시도까지 남은 시간(ms) */
  retryAfterMs?: number;
}

/**
 * 코인 노가다 미션 클리어 보상 수령 (POST /api/farm/claim) — 서버가 액수 추첨.
 * 401(UNAUTHENTICATED)이면 서버 세션이 죽은 것 — 클라 세션도 로그아웃으로 동기화한다.
 */
export async function claimFarmReward(): Promise<FarmClaimResult> {
  try {
    const res = await fetch(`${SERVER_URL}/api/farm/claim`, { method: 'POST', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) {
      const code = data?.error?.code as string | undefined;
      if (code === 'UNAUTHENTICATED') sessionStore.set({ ...INITIAL });
      return {
        error: data?.error?.message ?? '보상 수령 실패',
        code,
        retryAfterMs: data?.error?.retryAfterMs,
      };
    }
    updateWallet(data.coins);
    return { reward: data.reward };
  } catch {
    return { error: '서버 연결 실패', code: 'NETWORK' };
  }
}

/**
 * 세션 동기화 — 쿠키가 살아있으면(GET /api/me) 로그인 상태로 전환.
 * 서버가 ANON을 답하면(서버 재시작으로 인메모리 세션 소멸 등) 클라 상태도
 * 로그아웃으로 내린다 — 화면만 로그인인 "유령 세션"이 남지 않게.
 * main.tsx 부팅 시 + 각 화면 진입 시 fire-and-forget 으로 호출.
 */
export async function restoreSession(): Promise<void> {
  try {
    const res = await fetch(`${SERVER_URL}/api/me`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.status === 'USER' && data.user) setLoggedInUser(data.user);
    else if (data.status === 'ANON' && sessionStore.get().loggedIn) sessionStore.set({ ...INITIAL });
  } catch {
    // 서버 미기동/네트워크 오류 — 판단 불가이므로 현 상태 유지
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
