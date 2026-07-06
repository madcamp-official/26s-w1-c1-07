/**
 * MADPUMP 서버 — Fastify(REST) + Socket.IO(실시간) 단일 프로세스.
 * 로스터 로그인(분반→멤버 선택, docs/AUTH.md) + 소켓 핸드셰이크 + 로비(코드방·빠른시작)
 * + 서버권위 매치러너 + 분반 리더보드.
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

// ── REST: 로스터 로그인 (docs/AUTH.md) ──────────────────────────
// 분반(user_group)과 분반별 고정 멤버(app_user)는 prisma/seed.ts 로 미리 시드된다.
// 내부망 한정 인원용이라 비밀번호 등 인증 절차 없이 멤버 선택만으로 로그인한다.

/** 로그인 다이얼로그용 분반·멤버 명단 (인증 불필요) */
app.get('/api/roster', async () => {
  const groups = await prisma.userGroup.findMany({
    orderBy: { name: 'asc' },
    include: {
      users: {
        where: { deletedAt: null },
        orderBy: { id: 'asc' }, // 시드 순서(=명단 순서) 유지
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

/** 멤버 선택 로그인 — 로스터에 있는 userId 면 즉시 세션 발급 */
app.post('/api/login', async (req, reply) => {
  const body = (req.body ?? {}) as { userId?: string }
  if (!body.userId || !/^\d+$/.test(body.userId)) {
    return reply.code(400).send({ error: { code: 'VALIDATION', message: 'userId 필요' } })
  }
  const user = await prisma.appUser.findFirst({
    where: { id: BigInt(body.userId), deletedAt: null },
    include: { group: true },
  })
  if (!user) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '없는 유저' } })

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
  // 코인/해금은 수시로 변하므로 세션이 아니라 DB에서 최신값을 읽는다
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

// ── REST: 오프라인 게임 해금 ────────────────────────────────────
// 잠긴 두 게임(LOCKABLE_GAME_IDS)을 순서 무관하게 개별 해금 — 클라가 gameId 를 지정.
// unlocked_count 는 LOCKABLE_GAME_IDS 순서의 비트마스크로 저장(shared/coins.ts).
app.post('/api/unlock', async (req, reply) => {
  const s = getSession(req.cookies[SESSION_COOKIE])
  if (!s) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: '로그인 필요' } })
  // 온라인 매치/큐에 베팅 코인이 락돼 있으면 해금(코인 소비)을 막는다.
  // 안 그러면 락된 베팅이 정산 시점에 보유를 초과해 settleCoins 클램프가 코인을 무에서 만든다(리뷰 #4).
  const uid = s.userId.toString()
  if (findRoomByUser(uid) || quickQueue.some((q) => q.userId === uid)) {
    return reply.code(409).send({ error: { code: 'IN_MATCH', message: '매치 중에는 해금할 수 없어요' } })
  }
  const u = await prisma.appUser.findFirst({ where: { id: s.userId, deletedAt: null } })
  if (!u) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: '로그인 필요' } })

  const gameId = Number((req.body as { gameId?: unknown } | null)?.gameId)
  if (!isLockable(gameId)) {
    return reply.code(400).send({ error: { code: 'INVALID_GAME', message: '해금할 수 없는 게임이에요' } })
  }
  const bit = unlockBit(gameId)
  if ((u.unlockedCount & bit) !== 0) {
    return reply.code(400).send({ error: { code: 'ALREADY_UNLOCKED', message: '이미 해금된 게임이에요' } })
  }
  const cost = unlockCost(gameId)
  if (u.coins < cost) {
    return reply.code(400).send({ error: { code: 'NOT_ENOUGH_COINS', message: `코인 부족 (필요: ${cost})` } })
  }

  // 조건부 갱신(코인·현재 마스크 동시 검증)으로 중복 클릭/동시 요청에도 이중 차감 방지
  const updated = await prisma.appUser.updateMany({
    where: { id: u.id, unlockedCount: u.unlockedCount, coins: { gte: cost } },
    data: { coins: { decrement: cost }, unlockedCount: u.unlockedCount | bit },
  })
  if (updated.count === 0) {
    return reply.code(409).send({ error: { code: 'CONFLICT', message: '다시 시도해주세요' } })
  }
  const fresh = await prisma.appUser.findUniqueOrThrow({ where: { id: u.id } })
  return {
    status: 'OK',
    unlockedGameId: gameId,
    coins: fresh.coins,
    unlockedCount: fresh.unlockedCount,
  }
})

// ── REST: 코인 노가다 보상 수령 ─────────────────────────────────
// 클라가 솔로 펌프 미션(FARM_TARGET점 / FARM_DURATION초, docs/COINS.md)을 클리어하면 호출.
// 보상 액수는 서버가 확률표(FARM_REWARD_TABLE, 기댓값 ~4.7코인)로 추첨 — 클라가 지정 불가.
// 게임 자체는 클라 계산(로스터 로그인과 같은 신뢰 모델) — 쿨다운으로 스팸만 차단.
const farmLastClaim = new Map<string, number>() // userId → 마지막 수령 시각(ms)

app.post('/api/farm/claim', async (req, reply) => {
  const s = getSession(req.cookies[SESSION_COOKIE])
  if (!s) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: '로그인 필요' } })

  const key = s.userId.toString()
  const now = Date.now()
  const last = farmLastClaim.get(key) ?? 0
  if (now - last < FARM_CLAIM_COOLDOWN_MS) {
    // 남은 시간을 알려줘 클라가 자동으로 기다렸다 재시도할 수 있게 (정당한 연속 클리어 보호)
    const retryAfterMs = FARM_CLAIM_COOLDOWN_MS - (now - last)
    return reply
      .code(429)
      .send({ error: { code: 'COOLDOWN', message: '잠시 후 다시 시도해주세요', retryAfterMs } })
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

// ── REST: 분반 리더보드 ─────────────────────────────────────────
// 내 분반 유저들을 보유 코인 기준으로 랭킹 (승/무/패는 game_match 집계 — 참고 표시).
// 정렬: 코인↓ → 승수↓ → userId↑ / 코인 동점은 같은 등수(competition ranking).
app.get('/api/leaderboard', async (req, reply) => {
  const s = getSession(req.cookies[SESSION_COOKIE])
  if (!s) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: '로그인 필요' } })
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
      rank: 0, // 아래에서 채움
    }
  })
  // 정렬: 보유 코인↓ → (표시 안정용) 승수↓ → userId↑
  entries.sort((x, y) => {
    if (y.coins !== x.coins) return y.coins - x.coins
    if (y.wins !== x.wins) return y.wins - x.wins
    return BigInt(x.userId) < BigInt(y.userId) ? -1 : 1
  })
  // 랭크: 코인 동일 = 공동 등수 (competition ranking — 다음 등수는 인원수만큼 건너뜀)
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

/**
 * 베팅액 검증 — 1 이상 정수 & 보유 코인 이하.
 * @returns 유효하면 { bet, allIn: 보유 전액 베팅 여부(VS 화면 ALL-IN 표시용) }, 아니면 null
 */
async function validateBet(userId: bigint, raw: unknown): Promise<{ bet: number; allIn: boolean } | null> {
  const bet = Number(raw ?? 0)
  if (!Number.isInteger(bet) || bet < 1) return null
  const u = await prisma.appUser.findFirst({ where: { id: userId, deletedAt: null }, select: { coins: true } })
  if (!u || bet > u.coins) return null
  return { bet, allIn: bet === u.coins }
}

/**
 * @param revengeRequesterId 이 매치가 리벤지 매치라면 신청자 userId — 연속 신청 금지(e항) 판정용
 */
function startMatchForRoom(room: Room, revengeRequesterId: string | null = null) {
  if (room.members.length < 2) return
  // 멱등: 이미 매치 중이면 재시작 금지(호스트 auto-start가 room:state마다 중복 emit되는 것 방지).
  if (room.status === 'in_match' || room.match) return
  // 이전 매치의 리벤지 창구 폐쇄 (대기 중 타이머 포함)
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

// 설정값 검증: games는 유효 게임만(없으면 전체). 라운드 수는 항상 9로 고정이라 설정받지 않는다.
function sanitizeGames(games?: number[]): GameId[] {
  const valid = Array.isArray(games)
    ? (games.filter((g) => (ALL_GAME_IDS as number[]).includes(g)) as GameId[])
    : []
  return valid.length ? valid : [...ALL_GAME_IDS]
}

// ── 리벤지 매치 (docs/ONLINE_MATCH.md) ─────────────────────────
const REVENGE_TIMEOUT_MS = Number(process.env.REVENGE_TIMEOUT_MS ?? 10_000)

/** 진행 중 오퍼를 원자적으로 회수(타이머 정지 포함). 없으면 null — 이중 처리 방지의 단일 관문 */
function takeRevengePending(room: Room): { requesterId: string } | null {
  const pending = room.postMatch?.pending
  if (!pending) return null
  clearTimeout(pending.timer)
  room.postMatch!.pending = undefined
  return { requesterId: pending.requesterId }
}

/** 리벤지 무산 통지 — 방의 두 멤버 모두에게. 클라는 수신 시 메인으로 복귀한다 */
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

  // ── 코드방 ──
  socket.on(EV.roomCreate, async (payload: { games?: number[] } & Partial<BetPayload>, ack: (r: unknown) => void) => {
    if (typeof ack !== 'function') return
    if (findRoomByUser(userId)) return ack(ackErr('ALREADY_IN_ROOM', '이미 방에 있음'))
    const v = await validateBet(s.userId, payload?.bet)
    if (v === null) return ack(ackErr('INVALID_BET', '베팅액이 올바르지 않아요 (1 이상, 보유 코인 한도 내 정수)'))
    if (findRoomByUser(userId)) return ack(ackErr('ALREADY_IN_ROOM', '이미 방에 있음')) // await 사이 재검사
    const code = genRoomCode()
    const room: Room = {
      code,
      hostUserId: userId,
      status: 'waiting',
      rounds: 9, // 온라인 매치는 항상 9라운드 (슬롯 3릴 × 3회전)
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
    if (v === null) return ack(ackErr('INVALID_BET', '베팅액이 올바르지 않아요 (1 이상, 보유 코인 한도 내 정수)'))
    const room = rooms.get(payload?.code)
    if (!room) return ack(ackErr('NOT_FOUND', '방 없음'))
    if (room.members.length >= 2) return ack(ackErr('ROOM_FULL', '정원 초과'))
    if (findRoomByUser(userId)) return ack(ackErr('ALREADY_IN_ROOM', '이미 방에 있음'))
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

  // ── 빠른시작 (글로벌 FIFO) ──
  socket.on(EV.queueJoin, async (payload: Partial<BetPayload>, ack?: (r: unknown) => void) => {
    if (findRoomByUser(userId) || quickQueue.some((q) => q.userId === userId)) {
      return ack?.(ackErr('ALREADY_IN_ROOM', '이미 방/큐에 있음'))
    }
    const v = await validateBet(s.userId, payload?.bet)
    if (v === null) return ack?.(ackErr('INVALID_BET', '베팅액이 올바르지 않아요 (1 이상, 보유 코인 한도 내 정수)'))
    if (findRoomByUser(userId) || quickQueue.some((q) => q.userId === userId)) {
      return ack?.(ackErr('ALREADY_IN_ROOM', '이미 방/큐에 있음')) // await 사이 재검사
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

  // ── 리벤지 매치 (docs/ONLINE_MATCH.md) ──
  // 패자 → revenge:request → (검증) → 승자에게 revenge:offer → revenge:respond →
  //   수락: 스테이크(min(직전 베팅×2, 보유)) 재계산 → 같은 방에서 새 매치(슬롯 재추첨)
  //   거절/취소/10초 무응답/이탈: 양측에 revenge:result{accepted:false} → 클라는 메인 복귀
  socket.on(EV.revengeRequest, async (_payload: unknown, ack?: (r: unknown) => void) => {
    const room = findRoomByUser(userId)
    const pm = room?.postMatch
    if (!room || !pm || room.status !== 'waiting' || room.match) {
      return ack?.(ackErr('UNAVAILABLE', '리벤지를 신청할 수 없어요'))
    }
    if (pm.loserUserId !== userId) return ack?.(ackErr('NOT_LOSER', '패자만 신청할 수 있어요'))
    if (pm.requesterUserId === userId) {
      return ack?.(ackErr('CONSECUTIVE', '연속으로 리벤지를 신청할 수 없어요'))
    }
    if (pm.pending) return ack?.(ackErr('PENDING', '이미 신청 대기 중이에요'))
    const winner = room.members.find((m) => m.userId === pm.winnerUserId)
    const loser = room.members.find((m) => m.userId === userId)
    // 승자가 방을 떠났거나(=다른 매치를 잡으러 감) 접속이 끊겼으면 전달 불가 (2c)
    if (!winner || !loser || !io.sockets.sockets.get(winner.socketId)) {
      return ack?.(ackErr('UNAVAILABLE', '상대가 이미 자리를 떠났어요'))
    }
    // 스테이크 = min(직전 베팅 × 2, 현재 보유) — 2배가 안 되면 ALL-IN. 양쪽 모두 보유 ≥ 1 필요
    const [loserU, winnerU] = await Promise.all([
      prisma.appUser.findFirst({ where: { id: BigInt(userId) }, select: { coins: true } }),
      prisma.appUser.findFirst({ where: { id: BigInt(pm.winnerUserId) }, select: { coins: true } }),
    ])
    if (!loserU || loserU.coins < 1) return ack?.(ackErr('NO_COINS', '베팅할 코인이 없어요'))
    if (!winnerU || winnerU.coins < 1) return ack?.(ackErr('UNAVAILABLE', '상대가 베팅할 코인이 없어요'))
    // await 사이 상태 변동 재검사 (다른 신청/매치 시작/이탈)
    if (pm.pending || room.status !== 'waiting' || room.match || !room.members.includes(winner)) {
      return ack?.(ackErr('UNAVAILABLE', '리벤지를 신청할 수 없어요'))
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
      return ack?.(ackErr('UNAVAILABLE', '응답할 리벤지 신청이 없어요'))
    }
    const pending = takeRevengePending(room)! // 타이머 정지 + 오퍼 회수 (이중 처리 방지)
    if (!payload?.accept) {
      notifyRevengeClosed(room, 'DECLINED')
      return ack?.(ackOk({ accepted: false }))
    }
    // 수락 — 응답 시점 보유로 스테이크 최종 확정
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
      return ack?.(ackErr('UNAVAILABLE', '리벤지를 시작할 수 없어요'))
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
    // 리벤지 오퍼 대기 중에 당사자가 떠나면 무산 처리 후 남은 쪽에 통지
    if (room.postMatch?.pending && takeRevengePending(room)) {
      notifyRevengeClosed(room, userId === room.postMatch.loserUserId ? 'CANCELLED' : 'UNAVAILABLE')
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
