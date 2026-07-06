/**
 * Session state — roster login (class → member selection, docs/AUTH.md) + cookie session.
 * The server issues the mp_session cookie, and the client mirrors user info into this store.
 *
 * Usage:
 *   const session = useSession();          // subscribe in a React component
 *   restoreSession();                      // restore session via GET /api/me on boot
 *   await fetchRoster();                   // class·member list for the login dialog
 *   await loginAs(userId);                 // select member → log in immediately (no auth step)
 *   logout();                              // log out → then navigate('/')
 */
import { createStore, useStore } from './store';
import { SERVER_URL } from '../net/config';
import { disconnectOnline } from '../net/online';

export interface SessionUser {
  id: string;
  /** Avatar component palette index (0~7) */
  avatarColorIndex: number;
  /** Profile picture URL (always null for roster login — shown as an avatar color) */
  imageUrl: string | null;
}

export interface SessionState {
  loggedIn: boolean;
  nickname: string | null;
  /** Class name (e.g. 'Class 1') */
  groupName: string | null;
  user: SessionUser | null;
  /** Coins held (0 when not logged in) — server /api/me is the source of truth, this is a mirror */
  coins: number;
  /** Offline game unlock state (bitmask in LOCKABLE_GAME_IDS order — shared/coins.ts) */
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

/** React hook */
export function useSession(): SessionState {
  return useStore(sessionStore);
}

/** Snapshot for non-React code */
export function getSession(): SessionState {
  return sessionStore.get();
}

/** Server-response user shape */
interface ServerUser {
  id: string;
  nickname: string;
  imageUrl: string | null;
  groupName?: string | null;
  coins?: number;
  unlockedCount?: number;
}

/** Decide avatar color index from user id (fixed 0~7 mapping) */
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

/** Update only coin/unlock state (for reflecting unlock API responses, match settlement) */
export function updateWallet(coins: number, unlockedCount?: number): void {
  sessionStore.set(unlockedCount === undefined ? { coins } : { coins, unlockedCount });
}

/**
 * Unlock a game (POST /api/unlock) — specify the locked game id, update the wallet on success.
 * The two locked games can each be unlocked independently of order (shared/coins.ts).
 * @returns success: { unlockedGameId } / failure: { error: user-facing message }
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
    if (!res.ok) return { error: data?.error?.message ?? 'Unlock failed' };
    updateWallet(data.coins, data.unlockedCount);
    return { unlockedGameId: data.unlockedGameId };
  } catch {
    return { error: 'Server connection failed' };
  }
}

/** claimFarmReward result — code/retryAfterMs only on failure */
export interface FarmClaimResult {
  reward?: number;
  error?: string;
  /** Server error code: 'UNAUTHENTICATED' | 'COOLDOWN' | 'NETWORK' etc. */
  code?: string;
  /** Time remaining until retry (ms) when COOLDOWN */
  retryAfterMs?: number;
}

/**
 * Claim the coin-grind mission clear reward (POST /api/farm/claim) — the server rolls the amount.
 * On 401 (UNAUTHENTICATED) the server session is dead — sync the client session to logged out too.
 */
export async function claimFarmReward(): Promise<FarmClaimResult> {
  try {
    const res = await fetch(`${SERVER_URL}/api/farm/claim`, { method: 'POST', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) {
      const code = data?.error?.code as string | undefined;
      if (code === 'UNAUTHENTICATED') sessionStore.set({ ...INITIAL });
      return {
        error: data?.error?.message ?? 'Reward claim failed',
        code,
        retryAfterMs: data?.error?.retryAfterMs,
      };
    }
    updateWallet(data.coins);
    return { reward: data.reward };
  } catch {
    return { error: 'Server connection failed', code: 'NETWORK' };
  }
}

/**
 * Session sync — if the cookie is alive (GET /api/me), switch to logged-in state.
 * If the server answers ANON (e.g. in-memory session lost on server restart), bring the
 * client state down to logged out too — so no "ghost session" that's only logged in on screen remains.
 * Called fire-and-forget on main.tsx boot + on each screen entry.
 */
export async function restoreSession(): Promise<void> {
  try {
    const res = await fetch(`${SERVER_URL}/api/me`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.status === 'USER' && data.user) setLoggedInUser(data.user);
    else if (data.status === 'ANON' && sessionStore.get().loggedIn) sessionStore.set({ ...INITIAL });
  } catch {
    // Server not running / network error — can't determine, so keep current state
  }
}

/** Class·member list for the login dialog (GET /api/roster) */
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
 * Member-selection login (POST /api/login) — on success, issues session cookie + updates the store.
 * @returns true on success / false on failure
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

/** Log out. The caller should navigate('/') (transitions to S1). */
export function logout(): void {
  void fetch(`${SERVER_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  disconnectOnline(); // also clean up socket/online state
  sessionStore.set({ ...INITIAL });
}
