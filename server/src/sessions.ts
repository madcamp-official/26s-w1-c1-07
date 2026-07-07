/**
 * Server in-memory session store (BUILD_PLAN D14). Re-login on restart.
 * Cookie holds only an opaque sid; user info stays on the server.
 */
import { randomBytes } from 'node:crypto'

export interface Session {
  userId: bigint
  nickname: string
  imageUrl: string | null
}

const sessions = new Map<string, Session>()

export const SESSION_COOKIE = 'mp_session'

export function createSession(s: Session): string {
  const sid = randomBytes(24).toString('hex')
  sessions.set(sid, s)
  return sid
}

export function getSession(sid: string | undefined): Session | null {
  if (!sid) return null
  return sessions.get(sid) ?? null
}

export function destroySession(sid: string | undefined): void {
  if (sid) sessions.delete(sid)
}

/** Extract sid from the cookie header (for socket handshake) */
export function sidFromCookieHeader(cookie: string | undefined): string | undefined {
  if (!cookie) return undefined
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === SESSION_COOKIE) return v.join('=')
  }
  return undefined
}
