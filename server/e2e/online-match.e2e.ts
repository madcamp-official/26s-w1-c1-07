/**
 * Online match E2E (manual regression test) — 9-round slots + rematch chain (verifies docs/ONLINE_MATCH.md spec)
 *
 * Precondition: the server must be started with shortened timings —
 *   MATCH_COUNTDOWN_MS=300 MATCH_ROUND_GAP_MS=300 MATCH_INTRO_MS=500 REVENGE_TIMEOUT_MS=3000
 *
 * Chain 1 (basic + item e): code room (Pump-only pool) A bet4 vs B bet3 → rig A win →
 *   B rematch (stake 6) → A offer (stake 8) accepted → match 2 A win → B.revenge=null (no consecutive)
 * Chain 2 (item f + decline/timeout): match 1' A win → B rematch → match 2' B win →
 *   A (original winner).revenge exists (item f) → A requests → B declines (DECLINED) → A re-requests → 3s no response (TIMEOUT)
 * Chain 3 (ALL-IN + slot variety): A bets entire balance → verify allIn flag on match:start,
 *   verify the 3 slotGames are all different in the full pool (leaves immediately after verifying)
 */
import { io, type Socket } from 'socket.io-client'
import { PrismaClient } from '@prisma/client'

const BASE = 'http://localhost:3000'
const prisma = new PrismaClient()

let failures = 0
function check(cond: unknown, label: string) {
  if (cond) console.log(`  ✅ ${label}`)
  else {
    failures++
    console.error(`  ❌ ${label}`)
  }
}

interface Client {
  name: string
  userId: string
  cookie: string
  socket: Socket
  events: Record<string, any[]>
  spam: boolean // whether to spam correct answers (match rigging) in this match
  role: 'P1' | 'P2' | null
  matchId: string | null
}

function record(c: Client, ev: string, payload: any) {
  ;(c.events[ev] ??= []).push(payload)
}

async function login(userId: string, name: string): Promise<Client> {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  const socket = io(BASE, { extraHeaders: { cookie }, transports: ['websocket'] })
  const c: Client = { name, userId, cookie, socket, events: {}, spam: false, role: null, matchId: null }
  for (const ev of ['match:start', 'round:start', 'round:end', 'match:end', 'revenge:offer', 'revenge:result', 'match:aborted']) {
    socket.on(ev, (m: any) => record(c, ev, m))
  }
  socket.on('match:start', (m: any) => (c.matchId = m.matchId))
  socket.on('round:start', (m: any) => (c.role = m.role))
  // Answer spam — read the next correct answer key for my role from the Pump (game3) server state and input it immediately
  socket.on('game:state', (m: any) => {
    if (!c.spam || !c.role || !c.matchId) return
    const st = m.state
    if (!st || !Array.isArray(st.p1Seq)) return // ignore if it is not Pump state
    const seq: number[] = c.role === 'P1' ? st.p1Seq : st.p2Seq
    const idx: number = c.role === 'P1' ? st.p1Idx : st.p2Idx
    if (idx >= seq.length) return
    const code = seq[idx] === 0 ? 'KeyQ' : 'KeyW' // slot main key/secondary key — server rewrites to the role's physical key
    c.socket.emit('game:input', { matchId: c.matchId, code, type: 'down', t: Date.now() / 1000 })
  })
  await new Promise<void>((res2, rej) => {
    socket.on('connect', () => res2())
    socket.on('connect_error', (e) => rej(e))
  })
  return c
}

function ack(socket: Socket, ev: string, payload: unknown): Promise<any> {
  return new Promise((resolve) => socket.emit(ev, payload, resolve))
}

async function waitEvent(c: Client, ev: string, minCount: number, timeoutSec: number): Promise<any> {
  const t0 = Date.now()
  while ((c.events[ev]?.length ?? 0) < minCount) {
    if (Date.now() - t0 > timeoutSec * 1000) throw new Error(`${c.name}: ${ev} #${minCount} wait timeout`)
    await new Promise((r) => setTimeout(r, 200))
  }
  return c.events[ev][minCount - 1]
}

async function coinsOf(userId: string): Promise<number> {
  const u = await prisma.appUser.findUniqueOrThrow({ where: { id: BigInt(userId) }, select: { coins: true } })
  return u.coins
}

async function setCoins(userId: string, coins: number) {
  await prisma.appUser.update({ where: { id: BigInt(userId) }, data: { coins } })
}

/** Run one match + common verification. winner spams correct answers. matchNo = this client's Nth match:start/end (1-based) */
async function runMatch(opts: {
  a: Client
  b: Client
  winner: Client
  matchNo: number
  expectSlotAll?: number // all 3 slots must be this game (single pool)
}) {
  const { a, b, winner, matchNo } = opts
  a.spam = winner === a
  b.spam = winner === b

  const msA = await waitEvent(a, 'match:start', matchNo, 20)
  const msB = await waitEvent(b, 'match:start', matchNo, 20)
  check(msA.totalRounds === 9 && msB.totalRounds === 9, `match ${matchNo}: totalRounds=9`)
  check(Array.isArray(msA.slotGames) && msA.slotGames.length === 3, `match ${matchNo}: slotGames 3 slots`)
  check(JSON.stringify(msA.slotGames) === JSON.stringify(msB.slotGames), `match ${matchNo}: both sides same slots`)
  if (opts.expectSlotAll !== undefined) {
    check(msA.slotGames.every((g: number) => g === opts.expectSlotAll), `match ${matchNo}: all slots game ${opts.expectSlotAll} (single-pool duplicate)`)
  }
  check(msA.yourBet === msB.oppBet && msA.oppBet === msB.yourBet, `match ${matchNo}: bets cross-match (A ${msA.yourBet} / B ${msB.yourBet})`)

  // 9 rounds: whether round:start's gameId matches the slot schedule
  const base = (matchNo - 1) * 9
  for (let r = 1; r <= 9; r++) {
    const rs = await waitEvent(a, 'round:start', base + r, 60)
    check(rs.round === r, `match ${matchNo} R${r}: round number`)
    check(rs.gameId === msA.slotGames[(r - 1) % 3], `match ${matchNo} R${r}: game=slot[(r-1)%3]`)
  }

  const meA = await waitEvent(a, 'match:end', matchNo, 60)
  const meB = await waitEvent(b, 'match:end', matchNo, 60)
  a.spam = false
  b.spam = false
  const winSlot = msA.you === 'A' && winner === a ? 'A_WIN' : msB.you === 'A' && winner === b ? 'A_WIN' : 'B_WIN'
  check(meA.result === winSlot, `match ${matchNo}: result ${meA.result} (matches rigged winner)`)
  return { msA, msB, meA, meB }
}

async function main() {
  // ── Chain 1: basic flow + no consecutive requests (item e) ──
  console.log('\n━━ Chain 1: 9-round slots + rematch accept + item e ━━')
  await setCoins('1', 100) // Lee Jimin = A
  await setCoins('2', 20) //  Park Junseo = B
  const A = await login('1', 'A(Lee Jimin)')
  const B = await login('2', 'B(Park Junseo)')

  const created = await ack(A.socket, 'room:create', { games: [3], bet: 4 }) // Pump-only pool
  check(created.ok, 'room created (bet 4)')
  const joined = await ack(B.socket, 'room:join', { code: created.data.code, bet: 3 })
  check(joined.ok, 'room joined (bet 3)')
  A.socket.emit('room:ready', { ready: true })
  B.socket.emit('room:ready', { ready: true })
  await new Promise((r) => setTimeout(r, 300))
  A.socket.emit('room:start')

  const m1 = await runMatch({ a: A, b: B, winner: A, matchNo: 1, expectSlotAll: 3 })
  check(m1.msA.yourAllIn === false && m1.msA.oppAllIn === false, 'match 1: not ALL-IN')
  // Code-room settlement: winner + loser's bet (3), loser - own bet (3)
  check(m1.meA.coinDelta === 3 && m1.meB.coinDelta === -3, `match 1 settlement: A +3 / B -3`)
  check(m1.meA.revenge === null, 'match 1: winner revenge=null')
  check(m1.meB.revenge?.stake === 6 && m1.meB.revenge?.allIn === false, `match 1: loser revenge stake=6 (3×2)`)

  // B requests rematch → A receives and accepts offer
  const req = await ack(B.socket, 'revenge:request', {})
  check(req.ok, 'rematch request accepted')
  const offer = await waitEvent(A, 'revenge:offer', 1, 5)
  check(offer.fromNickname === 'Park Junseo', `offer: requester nickname (${offer.fromNickname})`)
  check(offer.yourStake === 8 && offer.oppStake === 6, `offer: stakes winner 8 (4×2) / loser 6 (3×2)`)
  const resp = await ack(A.socket, 'revenge:respond', { accept: true })
  check(resp.ok, 'rematch accepted')
  const rrA = await waitEvent(A, 'revenge:result', 1, 5)
  check(rrA.accepted === true, 'revenge:result accepted (both sides)')

  const m2 = await runMatch({ a: A, b: B, winner: A, matchNo: 2, expectSlotAll: 3 })
  check(m2.msA.yourBet === 8 && m2.msB.yourBet === 6, 'match 2 (rematch): bets doubled (8/6)')
  check(m2.meA.coinDelta === 6 && m2.meB.coinDelta === -6, 'match 2 settlement: A +6 / B -6')
  check(m2.meB.revenge === null, 'item e: rematch loser (requester) cannot re-request (revenge=null)')
  check(await coinsOf('1') === 109 && (await coinsOf('2')) === 11, `final balances A=109 B=11`)
  A.socket.emit('room:leave')
  B.socket.emit('room:leave')
  A.socket.disconnect()
  B.socket.disconnect()

  // ── Chain 2: item f + decline + timeout ──
  console.log('\n━━ Chain 2: item f (original winner's rematch) + decline + timeout ━━')
  await setCoins('3', 100) // Ra Taehyeong = C
  await setCoins('4', 100) // Lee Jonghyeok = D
  const C = await login('3', 'C(Ra Taehyeong)')
  const D = await login('4', 'D(Lee Jonghyeok)')
  const created2 = await ack(C.socket, 'room:create', { games: [3], bet: 4 })
  await ack(D.socket, 'room:join', { code: created2.data.code, bet: 3 })
  C.socket.emit('room:ready', { ready: true })
  D.socket.emit('room:ready', { ready: true })
  await new Promise((r) => setTimeout(r, 300))
  C.socket.emit('room:start')

  await runMatch({ a: C, b: D, winner: C, matchNo: 1 }) // C wins
  const reqD = await ack(D.socket, 'revenge:request', {})
  check(reqD.ok, 'D rematch request')
  await waitEvent(C, 'revenge:offer', 1, 5)
  await ack(C.socket, 'revenge:respond', { accept: true })
  await waitEvent(C, 'revenge:result', 1, 5)

  const m2b = await runMatch({ a: C, b: D, winner: D, matchNo: 2 }) // D wins the rematch (original winner C loses)
  const meC2 = m2b.meA // C's match:end
  check(meC2.revenge !== null && meC2.revenge?.stake === 16, `item f: original winner C can request rematch (stake=16)`)
  check(m2b.meB.revenge === null, 'rematch winner D has revenge=null')

  // C requests → D declines
  const reqC = await ack(C.socket, 'revenge:request', {})
  check(reqC.ok, 'C (original winner) rematch request — item f behavior')
  await waitEvent(D, 'revenge:offer', 1, 5)
  await ack(D.socket, 'revenge:respond', { accept: false })
  const rrC = await waitEvent(C, 'revenge:result', 2, 5)
  check(rrC.accepted === false && rrC.reason === 'DECLINED', `decline: revenge:result DECLINED`)

  // C re-requests → D no response → timeout (3s)
  const reqC2 = await ack(C.socket, 'revenge:request', {})
  check(reqC2.ok, 'C re-request (retry allowed after decline)')
  const rrC2 = await waitEvent(C, 'revenge:result', 3, 8)
  check(rrC2.accepted === false && rrC2.reason === 'TIMEOUT', `timeout: revenge:result TIMEOUT`)
  C.socket.emit('room:leave')
  D.socket.emit('room:leave')

  // Request after winner leaves (2c): no new postMatch, so confirm the UNAVAILABLE family
  const reqAfterLeave = await ack(C.socket, 'revenge:request', {})
  check(!reqAfterLeave.ok, 'cannot request after leaving room (2c family)')
  C.socket.disconnect()
  D.socket.disconnect()

  // ── Chain 3: ALL-IN display + 3 slots all different (full pool) ──
  console.log('\n━━ Chain 3: ALL-IN flag + slot variety ━━')
  await setCoins('5', 7) // Yu Nayeon = E — bets entire balance
  await setCoins('6', 50) // Yu Yeongseok = F
  const E = await login('5', 'E(Yu Nayeon)')
  const F = await login('6', 'F(Yu Yeongseok)')
  const created3 = await ack(E.socket, 'room:create', { bet: 7 }) // games omitted = full pool
  await ack(F.socket, 'room:join', { code: created3.data.code, bet: 10 })
  E.socket.emit('room:ready', { ready: true })
  F.socket.emit('room:ready', { ready: true })
  await new Promise((r) => setTimeout(r, 300))
  E.socket.emit('room:start')
  const msE = await waitEvent(E, 'match:start', 1, 10)
  const msF = await waitEvent(F, 'match:start', 1, 10)
  check(msE.yourAllIn === true && msF.oppAllIn === true, 'ALL-IN: entire-balance bet flag (self/opponent view)')
  check(msF.yourAllIn === false, 'non-full bet is not ALL-IN')
  const uniq = new Set(msE.slotGames)
  check(uniq.size === 3, `slot variety: 3 slots all different in full pool (${msE.slotGames})`)
  E.socket.disconnect() // verification done — server cleans up the match on its own
  F.socket.disconnect()

  console.log(failures === 0 ? '\n✅ Online match E2E all passed' : `\n❌ ${failures} failures`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
