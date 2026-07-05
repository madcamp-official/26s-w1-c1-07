/**
 * MADPUMP 서버 — Fastify(REST) + Socket.IO(실시간) 단일 프로세스.
 * v1: 개발용 로그인 스텁 + 소켓 핸드셰이크 + 로비(코드방·빠른시작) + 서버권위 매치러너.
 * (구글 OAuth·프로필·admin은 다음 단계)
 */
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import fstatic from '@fastify/static'
import { Server as IOServer } from 'socket.io'
import { OAuth2Client } from 'google-auth-library'
import { EV, type GameInputMsg, type RoomSnapshot } from '@madpump/shared'
import { devUpsertUser, prisma } from './db'
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  getSession,
  sidFromCookieHeader,
  type Session,
} from './sessions'
import {
  findRoomByUser,
  genRoomCode,
  quickQueue,
  removeFromQueue,
  roomSnapshot,
  rooms,
  type Room,
} from './rooms'
import { MatchRunner, type Participant } from './match'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3000)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'
// 쿠키 Secure는 HTTPS일 때만 켠다. HTTP 배포에서 Secure를 켜면 브라우저가 쿠키를 안 보내
// 세션/소켓 인증이 실패한다. HTTPS(cloudflared/도메인) 붙일 때 COOKIE_SECURE=1 로 켤 것.
const secureCookies = process.env.COOKIE_SECURE === '1'

const app = Fastify({ logger: false })
await app.register(cookie)
// 개발(5173→3000 크로스오리진) REST에 자격증명 CORS. 프로덕션은 같은 오리진이라 무영향.
await app.register(cors, { origin: CLIENT_ORIGIN, credentials: true })

// prod: 빌드된 클라 정적 서빙 (client/dist)
const clientDist = path.resolve(dirname, '../../client/dist')
if (existsSync(clientDist)) {
  await app.register(fstatic, { root: clientDist })
  app.setNotFoundHandler((_req, reply) => reply.sendFile('index.html'))
}

function cookieOpts() {
  return { httpOnly: true, secure: secureCookies, sameSite: 'lax' as const, path: '/' }
}

// ── REST: 개발용 로그인 스텁 + 세션 ──────────────────────────────
app.post('/api/dev/login', async (req, reply) => {
  const body = (req.body ?? {}) as { nickname?: string }
  const nickname = (body.nickname ?? '').trim()
  if (!nickname || nickname.length > 20) {
    return reply.code(400).send({ error: { code: 'VALIDATION', message: '닉네임 1~20자' } })
  }
  const user = await devUpsertUser(nickname)
  const sid = createSession({ userId: user.id, nickname: user.nickname, imageUrl: user.imageUrl, groupName: null })
  reply.setCookie(SESSION_COOKIE, sid, cookieOpts())
  return { status: 'USER', user: { id: user.id.toString(), nickname: user.nickname, imageUrl: user.imageUrl } }
})

// ── REST: 구글 OAuth 로그인 ─────────────────────────────────────
// 클라(GIS 버튼)가 받은 credential(ID 토큰)을 서버가 검증한다.
// 신규 유저면 NEEDS_NICKNAME을 돌려주고, 클라가 온보딩에서 credential+닉네임으로 /api/auth/signup 호출.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''
const googleOAuth = new OAuth2Client(GOOGLE_CLIENT_ID)

/** 가입 시 선택 가능한 분반 (온보딩 드랍다운과 1:1 — prisma/seed.ts 로 시드됨) */
const ALLOWED_GROUPS = ['1분반', '2분반', '3분반'] as const

interface GoogleProfile {
  sub: string
  email: string
  picture: string | null
}

async function verifyGoogleCredential(credential: string): Promise<GoogleProfile | null> {
  try {
    const ticket = await googleOAuth.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID })
    const p = ticket.getPayload()
    if (!p?.sub || !p.email) return null
    return { sub: p.sub, email: p.email, picture: p.picture ?? null }
  } catch {
    return null
  }
}

function userView(u: { id: bigint; nickname: string; googleImageUrl: string | null }, groupName: string | null) {
  return { id: u.id.toString(), nickname: u.nickname, imageUrl: u.googleImageUrl, groupName }
}

app.post('/api/auth/google', async (req, reply) => {
  const { credential } = (req.body ?? {}) as { credential?: string }
  if (!credential) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'credential 필요' } })
  const g = await verifyGoogleCredential(credential)
  if (!g) return reply.code(401).send({ error: { code: 'INVALID_CREDENTIAL', message: '구글 토큰 검증 실패' } })

  const user = await prisma.appUser.findUnique({ where: { googleSub: g.sub }, include: { group: true } })
  if (!user) return { status: 'NEEDS_NICKNAME' } // 신규 — 온보딩에서 /api/auth/signup

  const groupName = user.group?.name ?? null
  const sid = createSession({ userId: user.id, nickname: user.nickname, imageUrl: user.googleImageUrl, groupName })
  reply.setCookie(SESSION_COOKIE, sid, cookieOpts())
  return { status: 'USER', user: userView(user, groupName) }
})

app.post('/api/auth/signup', async (req, reply) => {
  const body = (req.body ?? {}) as { credential?: string; nickname?: string; groupName?: string }
  const nickname = (body.nickname ?? '').trim()
  const groupName = (body.groupName ?? '').trim()
  if (!body.credential || !nickname || nickname.length > 20) {
    return reply.code(400).send({ error: { code: 'VALIDATION', message: '닉네임 1~20자' } })
  }
  if (!(ALLOWED_GROUPS as readonly string[]).includes(groupName)) {
    return reply.code(400).send({ error: { code: 'VALIDATION', message: '분반을 선택해주세요' } })
  }
  const g = await verifyGoogleCredential(body.credential)
  if (!g) return reply.code(401).send({ error: { code: 'INVALID_CREDENTIAL', message: '구글 토큰 검증 실패' } })

  // 이미 가입된 계정이 signup을 다시 호출한 경우 → 그냥 로그인 처리
  const existing = await prisma.appUser.findUnique({ where: { googleSub: g.sub }, include: { group: true } })
  if (existing) {
    const gn = existing.group?.name ?? null
    const sid = createSession({ userId: existing.id, nickname: existing.nickname, imageUrl: existing.googleImageUrl, groupName: gn })
    reply.setCookie(SESSION_COOKIE, sid, cookieOpts())
    return { status: 'USER', user: userView(existing, gn) }
  }

  try {
    const user = await prisma.appUser.create({
      data: {
        googleSub: g.sub,
        email: g.email,
        nickname,
        googleImageUrl: g.picture,
        ...(groupName
          ? { group: { connectOrCreate: { where: { name: groupName }, create: { name: groupName } } } }
          : {}),
      },
    })
    const sid = createSession({ userId: user.id, nickname: user.nickname, imageUrl: user.googleImageUrl, groupName: groupName || null })
    reply.setCookie(SESSION_COOKIE, sid, cookieOpts())
    return { status: 'USER', user: userView(user, groupName || null) }
  } catch (err) {
    // nickname unique(uq_user_nickname) 충돌
    if ((err as { code?: string })?.code === 'P2002') {
      return reply.code(409).send({ error: { code: 'NICKNAME_TAKEN', message: '이미 사용하고 있는 이름입니다' } })
    }
    throw err
  }
})

app.get('/api/me', async (req) => {
  const s = getSession(req.cookies[SESSION_COOKIE])
  if (!s) return { status: 'ANON', user: null }
  return {
    status: 'USER',
    user: { id: s.userId.toString(), nickname: s.nickname, imageUrl: s.imageUrl, groupName: s.groupName },
  }
})

// ── REST: 분반 리더보드 ─────────────────────────────────────────
// 내 분반 유저들의 온라인 매치 전적(game_match)을 score_config 점수로 집계.
// 정렬: 점수↓ → 승수↓ → userId↑ / 동점은 같은 등수(competition ranking).
app.get('/api/leaderboard', async (req, reply) => {
  const s = getSession(req.cookies[SESSION_COOKIE])
  if (!s) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: '로그인 필요' } })
  const myUserId = s.userId.toString()
  if (!s.groupName) return { status: 'OK', groupName: null, myUserId, entries: [] }

  const group = await prisma.userGroup.findUnique({ where: { name: s.groupName } })
  if (!group) return { status: 'OK', groupName: s.groupName, myUserId, entries: [] }

  const users = await prisma.appUser.findMany({
    where: { groupId: group.id, deletedAt: null },
    select: { id: true, nickname: true, googleImageUrl: true },
  })
  const ids = users.map((u) => u.id)
  const [matches, cfg] = await Promise.all([
    prisma.gameMatch.findMany({
      where: { deletedAt: null, OR: [{ playerAId: { in: ids } }, { playerBId: { in: ids } }] },
      select: { playerAId: true, playerBId: true, result: true },
    }),
    prisma.scoreConfig.findUnique({ where: { id: 1 } }),
  ])
  const pt = { win: cfg?.winPoints ?? 3, draw: cfg?.drawPoints ?? 1, loss: cfg?.lossPoints ?? 0 }

  const acc = new Map<string, { wins: number; draws: number; losses: number }>()
  for (const u of users) acc.set(u.id.toString(), { wins: 0, draws: 0, losses: 0 })
  for (const m of matches) {
    const a = acc.get(m.playerAId.toString())
    const b = acc.get(m.playerBId.toString())
    if (m.result === 'A_WIN') {
      if (a) a.wins += 1
      if (b) b.losses += 1
    } else if (m.result === 'B_WIN') {
      if (a) a.losses += 1
      if (b) b.wins += 1
    } else {
      if (a) a.draws += 1
      if (b) b.draws += 1
    }
  }

  const entries = users.map((u) => {
    const x = acc.get(u.id.toString())!
    return {
      userId: u.id.toString(),
      nickname: u.nickname,
      imageUrl: u.googleImageUrl,
      wins: x.wins,
      draws: x.draws,
      losses: x.losses,
      score: x.wins * pt.win + x.draws * pt.draw + x.losses * pt.loss,
      rank: 0, // 아래에서 채움
    }
  })
  entries.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score
    if (y.wins !== x.wins) return y.wins - x.wins
    return BigInt(x.userId) < BigInt(y.userId) ? -1 : 1
  })
  let prevScore: number | null = null
  let prevRank = 0
  entries.forEach((e, i) => {
    if (prevScore !== null && e.score === prevScore) e.rank = prevRank
    else {
      e.rank = i + 1
      prevRank = e.rank
      prevScore = e.score
    }
  })

  return { status: 'OK', groupName: s.groupName, myUserId, scoreConfig: pt, entries }
})

app.post('/api/auth/logout', async (req, reply) => {
  destroySession(req.cookies[SESSION_COOKIE])
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
  return {}
})

app.get('/api/health', async () => ({ ok: true, rooms: rooms.size, queue: quickQueue.length }))

// ── Socket.IO ────────────────────────────────────────────────
await app.ready()
const httpServer = app.server as ReturnType<typeof createServer>
const io = new IOServer(httpServer, {
  cors: { origin: CLIENT_ORIGIN, credentials: true },
})

// 핸드셰이크 인증 — REST와 같은 세션 쿠키
io.use((socket, next) => {
  const sid = sidFromCookieHeader(socket.handshake.headers.cookie)
  const s = getSession(sid)
  if (!s) return next(new Error('UNAUTHENTICATED'))
  socket.data.session = s
  next()
})

function ackOk<T>(data: T) {
  return { ok: true as const, data }
}
function ackErr(code: string, message: string) {
  return { ok: false as const, code, message }
}

function startMatchForRoom(room: Room) {
  if (room.members.length < 2) return
  // 멱등: 이미 매치 중이면 재시작 금지(호스트 auto-start가 room:state마다 중복 emit되는 것 방지).
  if (room.status === 'in_match' || room.match) return
  const [ma, mb] = room.members
  const a: Participant = {
    userId: ma.userId,
    dbId: BigInt(ma.userId),
    socketId: ma.socketId,
    nickname: ma.nickname,
    imageUrl: ma.imageUrl,
  }
  const b: Participant = {
    userId: mb.userId,
    dbId: BigInt(mb.userId),
    socketId: mb.socketId,
    nickname: mb.nickname,
    imageUrl: mb.imageUrl,
  }
  room.status = 'in_match'
  const runner = new MatchRunner(io, room, a, b)
  room.match = runner
  runner.start()
}

io.on('connection', (socket) => {
  const s: Session = socket.data.session
  const userId = s.userId.toString()
  socket.emit(EV.hello, {
    me: { id: userId, nickname: s.nickname, imageUrl: s.imageUrl },
    reconnect: false,
  })

  // ── 코드방 ──
  socket.on(EV.roomCreate, (payload: { rounds?: number }, ack: (r: unknown) => void) => {
    if (findRoomByUser(userId)) return ack(ackErr('ALREADY_IN_ROOM', '이미 방에 있음'))
    const code = genRoomCode()
    const room: Room = {
      code,
      hostUserId: userId,
      status: 'waiting',
      rounds: payload?.rounds ?? 3,
      members: [
        { userId, nickname: s.nickname, imageUrl: s.imageUrl, socketId: socket.id, role: 'P1', ready: false },
      ],
    }
    rooms.set(code, room)
    socket.join(code)
    ack(ackOk<RoomSnapshot>(roomSnapshot(room)))
  })

  socket.on(EV.roomJoin, (payload: { code: string }, ack: (r: unknown) => void) => {
    const room = rooms.get(payload?.code)
    if (!room) return ack(ackErr('NOT_FOUND', '방 없음'))
    if (room.members.length >= 2) return ack(ackErr('ROOM_FULL', '정원 초과'))
    if (findRoomByUser(userId)) return ack(ackErr('ALREADY_IN_ROOM', '이미 방에 있음'))
    room.members.push({
      userId, nickname: s.nickname, imageUrl: s.imageUrl, socketId: socket.id, role: 'P2', ready: false,
    })
    socket.join(room.code)
    ack(ackOk<RoomSnapshot>(roomSnapshot(room)))
    io.to(room.code).emit(EV.roomState, roomSnapshot(room))
  })

  socket.on(EV.roomConfigure, (payload: { rounds?: number }) => {
    const room = findRoomByUser(userId)
    if (!room || room.hostUserId !== userId) return
    if (payload?.rounds) room.rounds = payload.rounds
    io.to(room.code).emit(EV.roomState, roomSnapshot(room))
  })

  socket.on(EV.roomReady, (payload: { ready: boolean }) => {
    const room = findRoomByUser(userId)
    if (!room) return
    const me = room.members.find((m) => m.userId === userId)
    if (me) me.ready = !!payload?.ready
    io.to(room.code).emit(EV.roomState, roomSnapshot(room))
  })

  socket.on(EV.roomStart, () => {
    const room = findRoomByUser(userId)
    if (!room || room.hostUserId !== userId) return
    if (room.members.length < 2 || !room.members.every((m) => m.ready)) return
    startMatchForRoom(room)
  })

  socket.on(EV.roomLeave, () => leaveRoom())

  // ── 빠른시작 (글로벌 FIFO) ──
  socket.on(EV.queueJoin, () => {
    if (findRoomByUser(userId) || quickQueue.some((q) => q.userId === userId)) return
    quickQueue.push({ userId, nickname: s.nickname, imageUrl: s.imageUrl, socketId: socket.id })
    if (quickQueue.length >= 2) {
      const p1 = quickQueue.shift()!
      const p2 = quickQueue.shift()!
      const code = genRoomCode()
      const room: Room = {
        code, hostUserId: p1.userId, status: 'waiting', rounds: 3,
        members: [
          { ...p1, role: 'P1', ready: true },
          { ...p2, role: 'P2', ready: true },
        ],
      }
      rooms.set(code, room)
      io.sockets.sockets.get(p1.socketId)?.join(code)
      io.sockets.sockets.get(p2.socketId)?.join(code)
      io.to(p1.socketId).emit(EV.queueMatched, { roomCode: code, role: 'P1', opponent: { nickname: p2.nickname, imageUrl: p2.imageUrl } })
      io.to(p2.socketId).emit(EV.queueMatched, { roomCode: code, role: 'P2', opponent: { nickname: p1.nickname, imageUrl: p1.imageUrl } })
      startMatchForRoom(room)
    }
  })

  socket.on(EV.queueLeave, () => removeFromQueue(userId))

  // ── 인게임 입력 ──
  socket.on(EV.gameInput, (msg: GameInputMsg) => {
    const room = findRoomByUser(userId)
    if (!room?.match) return
    room.match.pushInput(userId, { code: msg.code, type: msg.type, t: msg.t, cell: msg.cell })
  })

  socket.on('disconnect', () => {
    removeFromQueue(userId)
    leaveRoom(true)
  })

  function leaveRoom(isDisconnect = false) {
    const room = findRoomByUser(userId)
    if (!room) return
    // 매치 진행 중이면: 서버는 끝까지 연산(D8). 상대에게 안내만.
    if (room.status === 'in_match') {
      const other = room.members.find((m) => m.userId !== userId)
      if (other) io.to(other.socketId).emit(EV.matchAborted, { matchId: room.match?.matchId ?? '', reason: 'OPPONENT_LEFT' })
      if (!isDisconnect) socket.leave(room.code)
      return
    }
    // 대기 중이면 방에서 제거
    room.members = room.members.filter((m) => m.userId !== userId)
    socket.leave(room.code)
    if (room.members.length === 0) rooms.delete(room.code)
    else {
      room.hostUserId = room.members[0].userId
      io.to(room.code).emit(EV.roomState, roomSnapshot(room))
    }
  }
})

await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`✅ MADPUMP 서버 http://localhost:${PORT} (client origin: ${CLIENT_ORIGIN})`)
