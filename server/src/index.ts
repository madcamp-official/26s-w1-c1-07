/**
 * MADPUMP server — Fastify(REST) + Socket.IO(real-time) single process.
 * Roster login (Class → member select, docs/AUTH.md) + socket handshake + lobby (code room · quick start)
 * + server-authoritative match runner + class leaderboard.
 */
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import fstatic from '@fastify/static'
import { Server as IOServer } from 'socket.io'
import {
  ALL_GAME_IDS,
  EV,
  FARM_CLAIM_COOLDOWN_MS,
  isLockable,
  rollFarmReward,
  unlockBit,
  unlockCost,
  type BetPayload,
  type GameId,
  type GameInputMsg,
  type RoomSnapshot,
} from '@madpump/shared'
import { prisma } from './db'
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
// Enable the Secure cookie flag only on HTTPS. On an HTTP deployment, turning on Secure makes the browser
// stop sending the cookie, so session/socket auth fails. Turn it on with COOKIE_SECURE=1 when using HTTPS (cloudflared/domain).
const secureCookies = process.env.COOKIE_SECURE === '1'

const app = Fastify({ logger: false })
await app.register(cookie)
// Credentialed CORS for dev (5173→3000 cross-origin) REST. No effect in production since it's the same origin.
await app.register(cors, { origin: CLIENT_ORIGIN, credentials: true })

// prod: serve the built client statically (client/dist)
const clientDist = path.resolve(dirname, '../../client/dist')
if (existsSync(clientDist)) {
  await app.register(fstatic, { root: clientDist })
  app.setNotFoundHandler((_req, reply) => reply.sendFile('index.html'))
}

function cookieOpts() {
  return { httpOnly: true, secure: secureCookies, sameSite: 'lax' as const, path: '/' }
}

// ── REST: roster login (docs/AUTH.md) ──────────────────────────
// Classes (user_group) and each class's fixed members (app_user) are pre-seeded via prisma/seed.ts.
// Since this is for an internal-network-only audience, login is just member selection with no password or other auth step.

/** Class/member list for the login dialog (no auth required) */
app.get('/api/roster', async () => {
  const groups = await prisma.userGroup.findMany({
    orderBy: { name: 'asc' },
    include: {
      users: {
        where: { deletedAt: null },
        orderBy: { id: 'asc' }, // keep seed order (= roster order)
        select: { id: true, nickname: true },
      },
    },
  })
  return {
    groups: groups.map((g) => ({
      id: g.id.toString(),
      name: g.name,
      members: g.users.map((u) => ({ id: u.id.toString(), nickname: u.nickname })),
    })),
  }
})

/** Member-select login — issues a session immediately for a userId that's in the roster */
app.post('/api/login', async (req, reply) => {
  const body = (req.body ?? {}) as { userId?: string }
  if (!body.userId || !/^\d+$/.test(body.userId)) {
    return reply.code(400).send({ error: { code: 'VALIDATION', message: 'userId required' } })
  }
  const user = await prisma.appUser.findFirst({
    where: { id: BigInt(body.userId), deletedAt: null },
    include: { group: true },
  })
  if (!user) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No such user' } })

  const groupName = user.group?.name ?? null
  const sid = createSession({ userId: user.id, nickname: user.nickname, imageUrl: null, groupName })
  reply.setCookie(SESSION_COOKIE, sid, cookieOpts())
  return {
    status: 'USER',
    user: {
      id: user.id.toString(),
      nickname: user.nickname,
      imageUrl: null,
      groupName,
      coins: user.coins,
      unlockedCount: user.unlockedCount,
    },
  }
})

app.get('/api/me', async (req) => {
  const s = getSession(req.cookies[SESSION_COOKIE])
  if (!s) return { status: 'ANON', user: null }
  // Coins/unlocks change frequently, so read the latest values from the DB rather than the session
  const u = await prisma.appUser.findFirst({ where: { id: s.userId, deletedAt: null } })
  if (!u) return { status: 'ANON', user: null }
  return {
    status: 'USER',
    user: {
      id: s.userId.toString(),
      nickname: s.nickname,
      imageUrl: s.imageUrl,
      groupName: s.groupName,
      coins: u.coins,
      unlockedCount: u.unlockedCount,
    },
  }
})

// ── REST: offline game unlock ────────────────────────────────────
// Unlock the two locked games (LOCKABLE_GAME_IDS) individually in any order — the client specifies gameId.
// unlocked_count is stored as a bitmask in LOCKABLE_GAME_IDS order (shared/coins.ts).
app.post('/api/unlock', async (req, reply) => {
  const s = getSession(req.cookies[SESSION_COOKIE])
  if (!s) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } })
  // If bet coins are locked in an online match/queue, block unlocking (which spends coins).
  // Otherwise a locked bet could exceed the balance at settlement time and the settleCoins clamp would create coins from nothing (review #4).
  const uid = s.userId.toString()
  if (findRoomByUser(uid) || quickQueue.some((q) => q.userId === uid)) {
    return reply.code(409).send({ error: { code: 'IN_MATCH', message: "You can't unlock during a match" } })
  }
  const u = await prisma.appUser.findFirst({ where: { id: s.userId, deletedAt: null } })
  if (!u) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } })

  const gameId = Number((req.body as { gameId?: unknown } | null)?.gameId)
  if (!isLockable(gameId)) {
    return reply.code(400).send({ error: { code: 'INVALID_GAME', message: "This game can't be unlocked" } })
  }
  const bit = unlockBit(gameId)
  if ((u.unlockedCount & bit) !== 0) {
    return reply.code(400).send({ error: { code: 'ALREADY_UNLOCKED', message: 'This game is already unlocked' } })
  }
  const cost = unlockCost(gameId)
  if (u.coins < cost) {
    return reply.code(400).send({ error: { code: 'NOT_ENOUGH_COINS', message: `Not enough coins (need: ${cost})` } })
  }

  // Conditional update (validating coins and the current mask together) prevents double deduction on duplicate clicks/concurrent requests
  const updated = await prisma.appUser.updateMany({
    where: { id: u.id, unlockedCount: u.unlockedCount, coins: { gte: cost } },
    data: { coins: { decrement: cost }, unlockedCount: u.unlockedCount | bit },
  })
  if (updated.count === 0) {
    return reply.code(409).send({ error: { code: 'CONFLICT', message: 'Please try again' } })
  }
  const fresh = await prisma.appUser.findUniqueOrThrow({ where: { id: u.id } })
  return {
    status: 'OK',
    unlockedGameId: gameId,
    coins: fresh.coins,
    unlockedCount: fresh.unlockedCount,
  }
})

// ── REST: claim coin-grind reward ─────────────────────────────────
// Called when the client clears the solo Pump mission (FARM_TARGET points / FARM_DURATION seconds, docs/COINS.md).
// The reward amount is drawn by the server from a probability table (FARM_REWARD_TABLE, expected value ~4.7 coins) — the client can't specify it.
// The game itself is client-computed (same trust model as roster login) — the cooldown only blocks spam.
const farmLastClaim = new Map<string, number>() // userId → last claim time (ms)

app.post('/api/farm/claim', async (req, reply) => {
  const s = getSession(req.cookies[SESSION_COOKIE])
  if (!s) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } })

  const key = s.userId.toString()
  const now = Date.now()
  const last = farmLastClaim.get(key) ?? 0
  if (now - last < FARM_CLAIM_COOLDOWN_MS) {
    // Report the remaining time so the client can automatically wait and retry (protects legitimate consecutive clears)
    const retryAfterMs = FARM_CLAIM_COOLDOWN_MS - (now - last)
    return reply
      .code(429)
      .send({ error: { code: 'COOLDOWN', message: 'Please try again in a moment', retryAfterMs } })
  }
  farmLastClaim.set(key, now)

  const reward = rollFarmReward(() => randomInt(0, 1_000_000) / 1_000_000)
  const u = await prisma.appUser.update({
    where: { id: s.userId },
    data: { coins: { increment: reward } },
    select: { coins: true },
  })
  return { status: 'OK', reward, coins: u.coins }
})

// ── REST: class leaderboard ─────────────────────────────────────────
// Rank my class's users by held coins (win/draw/loss aggregated from game_match — shown for reference).
// Sort: coins↓ → wins↓ → userId↑ / coin ties get the same rank (competition ranking).
app.get('/api/leaderboard', async (req, reply) => {
  const s = getSession(req.cookies[SESSION_COOKIE])
  if (!s) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } })
  const myUserId = s.userId.toString()
  if (!s.groupName) return { status: 'OK', groupName: null, myUserId, entries: [] }

  const group = await prisma.userGroup.findUnique({ where: { name: s.groupName } })
  if (!group) return { status: 'OK', groupName: s.groupName, myUserId, entries: [] }

  const users = await prisma.appUser.findMany({
    where: { groupId: group.id, deletedAt: null },
    select: { id: true, nickname: true, coins: true },
  })
  const ids = users.map((u) => u.id)
  const matches = await prisma.gameMatch.findMany({
    where: { deletedAt: null, OR: [{ playerAId: { in: ids } }, { playerBId: { in: ids } }] },
    select: { playerAId: true, playerBId: true, result: true },
  })

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
      coins: u.coins,
      wins: x.wins,
      draws: x.draws,
      losses: x.losses,
      rank: 0, // filled in below
    }
  })
  // Sort: held coins↓ → (for display stability) wins↓ → userId↑
  entries.sort((x, y) => {
    if (y.coins !== x.coins) return y.coins - x.coins
    if (y.wins !== x.wins) return y.wins - x.wins
    return BigInt(x.userId) < BigInt(y.userId) ? -1 : 1
  })
  // Rank: equal coins = shared rank (competition ranking — the next rank skips by the number of tied people)
  let prevCoins: number | null = null
  let prevRank = 0
  entries.forEach((e, i) => {
    if (prevCoins !== null && e.coins === prevCoins) e.rank = prevRank
    else {
      e.rank = i + 1
      prevRank = e.rank
      prevCoins = e.coins
    }
  })

  return { status: 'OK', groupName: s.groupName, myUserId, entries }
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

// Handshake auth — same session cookie as REST
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

/**
 * Bet amount validation — integer ≥ 1 and ≤ held coins.
 * @returns { bet, allIn: whether the entire balance is bet (for the ALL-IN display on the VS screen) } if valid, else null
 */
async function validateBet(userId: bigint, raw: unknown): Promise<{ bet: number; allIn: boolean } | null> {
  const bet = Number(raw ?? 0)
  if (!Number.isInteger(bet) || bet < 1) return null
  const u = await prisma.appUser.findFirst({ where: { id: userId, deletedAt: null }, select: { coins: true } })
  if (!u || bet > u.coins) return null
  return { bet, allIn: bet === u.coins }
}

/**
 * @param revengeRequesterId if this match is a rematch, the requester's userId — used to enforce the no-consecutive-request rule (item e)
 */
function startMatchForRoom(room: Room, revengeRequesterId: string | null = null) {
  if (room.members.length < 2) return
  // Idempotent: don't restart if already in a match (prevents the host auto-start from double-emitting on every room:state).
  if (room.status === 'in_match' || room.match) return
  // Close the previous match's rematch window (including any pending timer)
  if (room.postMatch?.pending) clearTimeout(room.postMatch.pending.timer)
  room.postMatch = undefined
  room.revengeRequesterUserId = revengeRequesterId
  const [ma, mb] = room.members
  const a: Participant = {
    userId: ma.userId,
    dbId: BigInt(ma.userId),
    socketId: ma.socketId,
    nickname: ma.nickname,
    imageUrl: ma.imageUrl,
    bet: ma.bet,
    allIn: ma.allIn,
  }
  const b: Participant = {
    userId: mb.userId,
    dbId: BigInt(mb.userId),
    socketId: mb.socketId,
    nickname: mb.nickname,
    imageUrl: mb.imageUrl,
    bet: mb.bet,
    allIn: mb.allIn,
  }
  room.status = 'in_match'
  const runner = new MatchRunner(io, room, a, b)
  room.match = runner
  runner.start()
}

// Config validation: games keeps only valid games (all games if none). The round count is always fixed at 9, so it isn't configurable.
function sanitizeGames(games?: number[]): GameId[] {
  const valid = Array.isArray(games)
    ? (games.filter((g) => (ALL_GAME_IDS as number[]).includes(g)) as GameId[])
    : []
  return valid.length ? valid : [...ALL_GAME_IDS]
}

// ── rematch (docs/ONLINE_MATCH.md) ─────────────────────────
const REVENGE_TIMEOUT_MS = Number(process.env.REVENGE_TIMEOUT_MS ?? 10_000)

/** Atomically reclaim the in-flight offer (including stopping the timer). null if none — the single gate that prevents double processing */
function takeRevengePending(room: Room): { requesterId: string } | null {
  const pending = room.postMatch?.pending
  if (!pending) return null
  clearTimeout(pending.timer)
  room.postMatch!.pending = undefined
  return { requesterId: pending.requesterId }
}

/** Notify that the rematch fell through — to both room members. The client returns to main on receipt */
function notifyRevengeClosed(room: Room, reason: 'DECLINED' | 'TIMEOUT' | 'CANCELLED' | 'UNAVAILABLE') {
  for (const m of room.members) {
    io.to(m.socketId).emit(EV.revengeResult, { accepted: false, reason })
  }
}

process.on("uncaughtException", (e) => console.error("[uncaughtException]", e))
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e))

io.on('connection', (socket) => {
  const s: Session = socket.data.session
  const userId = s.userId.toString()
  socket.emit(EV.hello, {
    me: { id: userId, nickname: s.nickname, imageUrl: s.imageUrl },
    reconnect: false,
  })

  // ── code room ──
  socket.on(EV.roomCreate, async (payload: { games?: number[] } & Partial<BetPayload>, ack: (r: unknown) => void) => {
    if (typeof ack !== 'function') return
    if (findRoomByUser(userId)) return ack(ackErr('ALREADY_IN_ROOM', 'Already in a room'))
    const v = await validateBet(s.userId, payload?.bet)
    if (v === null) return ack(ackErr('INVALID_BET', 'Invalid bet amount (integer ≥ 1, within your coin balance)'))
    if (findRoomByUser(userId)) return ack(ackErr('ALREADY_IN_ROOM', 'Already in a room')) // recheck across the await
    const code = genRoomCode()
    const room: Room = {
      code,
      hostUserId: userId,
      status: 'waiting',
      rounds: 9, // online matches are always 9 rounds (3 slot reels × 3 spins)
      games: sanitizeGames(payload?.games),
      kind: 'code',
      members: [
        { userId, nickname: s.nickname, imageUrl: s.imageUrl, socketId: socket.id, role: 'P1', ready: false, bet: v.bet, allIn: v.allIn },
      ],
    }
    rooms.set(code, room)
    socket.join(code)
    ack(ackOk<RoomSnapshot>(roomSnapshot(room)))
  })

  socket.on(EV.roomJoin, async (payload: { code: string } & Partial<BetPayload>, ack: (r: unknown) => void) => {
    if (typeof ack !== 'function') return
    const v = await validateBet(s.userId, payload?.bet)
    if (v === null) return ack(ackErr('INVALID_BET', 'Invalid bet amount (integer ≥ 1, within your coin balance)'))
    const room = rooms.get(payload?.code)
    if (!room) return ack(ackErr('NOT_FOUND', 'Room not found'))
    if (room.members.length >= 2) return ack(ackErr('ROOM_FULL', 'Room full'))
    if (findRoomByUser(userId)) return ack(ackErr('ALREADY_IN_ROOM', 'Already in a room'))
    room.members.push({
      userId, nickname: s.nickname, imageUrl: s.imageUrl, socketId: socket.id, role: 'P2', ready: false, bet: v.bet, allIn: v.allIn,
    })
    socket.join(room.code)
    ack(ackOk<RoomSnapshot>(roomSnapshot(room)))
    io.to(room.code).emit(EV.roomState, roomSnapshot(room))
  })

  socket.on(EV.roomConfigure, (payload: { games?: number[] }) => {
    const room = findRoomByUser(userId)
    if (!room || room.hostUserId !== userId) return
    if (payload?.games) room.games = sanitizeGames(payload.games)
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

  // ── quick start (global FIFO) ──
  socket.on(EV.queueJoin, async (payload: Partial<BetPayload>, ack?: (r: unknown) => void) => {
    if (findRoomByUser(userId) || quickQueue.some((q) => q.userId === userId)) {
      return ack?.(ackErr('ALREADY_IN_ROOM', 'Already in a room/queue'))
    }
    const v = await validateBet(s.userId, payload?.bet)
    if (v === null) return ack?.(ackErr('INVALID_BET', 'Invalid bet amount (integer ≥ 1, within your coin balance)'))
    if (findRoomByUser(userId) || quickQueue.some((q) => q.userId === userId)) {
      return ack?.(ackErr('ALREADY_IN_ROOM', 'Already in a room/queue')) // recheck across the await
    }
    quickQueue.push({ userId, nickname: s.nickname, imageUrl: s.imageUrl, socketId: socket.id, bet: v.bet, allIn: v.allIn })
    ack?.(ackOk({ queued: true }))
    if (quickQueue.length >= 2) {
      const p1 = quickQueue.shift()!
      const p2 = quickQueue.shift()!
      const code = genRoomCode()
      const room: Room = {
        code, hostUserId: p1.userId, status: 'waiting', rounds: 9, games: [...ALL_GAME_IDS], kind: 'quick',
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

  // ── rematch (docs/ONLINE_MATCH.md) ──
  // loser → revenge:request → (validate) → revenge:offer to winner → revenge:respond →
  //   accept: recompute stake (min(previous bet×2, balance)) → new match in the same room (slots re-drawn)
  //   decline/cancel/10s no-response/leave: revenge:result{accepted:false} to both sides → client returns to main
  socket.on(EV.revengeRequest, async (_payload: unknown, ack?: (r: unknown) => void) => {
    const room = findRoomByUser(userId)
    const pm = room?.postMatch
    if (!room || !pm || room.status !== 'waiting' || room.match) {
      return ack?.(ackErr('UNAVAILABLE', "You can't request a rematch"))
    }
    if (pm.loserUserId !== userId) return ack?.(ackErr('NOT_LOSER', 'Only the loser can request'))
    if (pm.requesterUserId === userId) {
      return ack?.(ackErr('CONSECUTIVE', "You can't request a rematch two times in a row"))
    }
    if (pm.pending) return ack?.(ackErr('PENDING', 'A request is already pending'))
    const winner = room.members.find((m) => m.userId === pm.winnerUserId)
    const loser = room.members.find((m) => m.userId === userId)
    // Can't deliver if the winner left the room (= went to find another match) or disconnected (2c)
    if (!winner || !loser || !io.sockets.sockets.get(winner.socketId)) {
      return ack?.(ackErr('UNAVAILABLE', 'The opponent has already left'))
    }
    // Stake = min(previous bet × 2, current balance) — ALL-IN if it can't reach 2×. Both sides need balance ≥ 1
    const [loserU, winnerU] = await Promise.all([
      prisma.appUser.findFirst({ where: { id: BigInt(userId) }, select: { coins: true } }),
      prisma.appUser.findFirst({ where: { id: BigInt(pm.winnerUserId) }, select: { coins: true } }),
    ])
    if (!loserU || loserU.coins < 1) return ack?.(ackErr('NO_COINS', 'You have no coins to bet'))
    if (!winnerU || winnerU.coins < 1) return ack?.(ackErr('UNAVAILABLE', 'The opponent has no coins to bet'))
    // Recheck for state changes across the await (another request/match start/leave)
    if (pm.pending || room.status !== 'waiting' || room.match || !room.members.includes(winner)) {
      return ack?.(ackErr('UNAVAILABLE', "You can't request a rematch"))
    }
    const loserStake = Math.min(pm.bets[userId] * 2, loserU.coins)
    const winnerStake = Math.min(pm.bets[pm.winnerUserId] * 2, winnerU.coins)
    pm.pending = {
      requesterId: userId,
      timer: setTimeout(() => {
        if (takeRevengePending(room)) notifyRevengeClosed(room, 'TIMEOUT')
      }, REVENGE_TIMEOUT_MS),
    }
    io.to(winner.socketId).emit(EV.revengeOffer, {
      fromNickname: loser.nickname,
      yourStake: winnerStake,
      yourAllIn: winnerStake === winnerU.coins,
      oppStake: loserStake,
      oppAllIn: loserStake === loserU.coins,
      timeoutMs: REVENGE_TIMEOUT_MS,
    })
    ack?.(ackOk({ waiting: true, stake: loserStake }))
  })

  socket.on(EV.revengeRespond, async (payload: { accept?: boolean }, ack?: (r: unknown) => void) => {
    const room = findRoomByUser(userId)
    const pm = room?.postMatch
    if (!room || !pm?.pending || pm.winnerUserId !== userId) {
      return ack?.(ackErr('UNAVAILABLE', 'There is no rematch request to respond to'))
    }
    const pending = takeRevengePending(room)! // stop the timer + reclaim the offer (prevents double processing)
    if (!payload?.accept) {
      notifyRevengeClosed(room, 'DECLINED')
      return ack?.(ackOk({ accepted: false }))
    }
    // Accept — finalize the stake using the balance at response time
    const loser = room.members.find((m) => m.userId === pending.requesterId)
    const winner = room.members.find((m) => m.userId === userId)
    const [loserU, winnerU] = await Promise.all([
      loser ? prisma.appUser.findFirst({ where: { id: BigInt(loser.userId) }, select: { coins: true } }) : null,
      prisma.appUser.findFirst({ where: { id: BigInt(userId) }, select: { coins: true } }),
    ])
    const valid =
      loser && winner && loserU && winnerU && loserU.coins >= 1 && winnerU.coins >= 1 &&
      room.status === 'waiting' && !room.match &&
      room.members.includes(loser) && room.members.includes(winner) &&
      io.sockets.sockets.has(loser.socketId)
    if (!valid) {
      notifyRevengeClosed(room, 'UNAVAILABLE')
      return ack?.(ackErr('UNAVAILABLE', "The rematch can't be started"))
    }
    loser.bet = Math.min(pm.bets[loser.userId] * 2, loserU.coins)
    loser.allIn = loser.bet === loserU.coins
    winner.bet = Math.min(pm.bets[winner.userId] * 2, winnerU.coins)
    winner.allIn = winner.bet === winnerU.coins
    for (const m of room.members) m.ready = true
    for (const m of room.members) io.to(m.socketId).emit(EV.revengeResult, { accepted: true })
    startMatchForRoom(room, pending.requesterId)
    ack?.(ackOk({ accepted: true }))
  })

  socket.on(EV.revengeCancel, () => {
    const room = findRoomByUser(userId)
    if (!room || room.postMatch?.pending?.requesterId !== userId) return
    if (takeRevengePending(room)) notifyRevengeClosed(room, 'CANCELLED')
  })

  // ── in-game input ──
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
    // If a match is in progress: the server computes to the end (D8). Only notify the opponent.
    if (room.status === 'in_match') {
      const other = room.members.find((m) => m.userId !== userId)
      if (other) io.to(other.socketId).emit(EV.matchAborted, { matchId: room.match?.matchId ?? '', reason: 'OPPONENT_LEFT' })
      if (!isDisconnect) socket.leave(room.code)
      return
    }
    // If a party leaves while a rematch offer is pending, cancel it and notify the remaining side
    if (room.postMatch?.pending && takeRevengePending(room)) {
      notifyRevengeClosed(room, userId === room.postMatch.loserUserId ? 'CANCELLED' : 'UNAVAILABLE')
    }
    // If waiting, remove from the room
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
console.log(`✅ MADPUMP server http://localhost:${PORT} (client origin: ${CLIENT_ORIGIN})`)
