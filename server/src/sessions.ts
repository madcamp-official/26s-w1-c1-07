/**
 * 서버 인메모리 세션 스토어 (BUILD_PLAN D14). 재시작 시 재로그인.
 * 쿠키엔 opaque sid만, 사용자 정보는 서버에.
 */
import { randomBytes } from 'node:crypto'

export interface Session {
  userId: bigint
  nickname: string
  imageUrl: string | null
  /** 분반 이름 (user_group.name) — 없으면 null */
  groupName: string | null
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

/** 쿠키 헤더에서 sid 추출 (소켓 핸드셰이크용) */
export function sidFromCookieHeader(cookie: string | undefined): string | undefined {
  if (!cookie) return undefined
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === SESSION_COOKIE) return v.join('=')
  }
  return undefined
}
