/**
 * 온라인 매치 E2E (수동 회귀 테스트) — 9라운드 슬롯 + 리벤지 체인 (docs/ONLINE_MATCH.md 명세 검증)
 *
 * 사전조건: 서버가 단축 타이밍으로 기동돼 있을 것 —
 *   MATCH_COUNTDOWN_MS=300 MATCH_ROUND_GAP_MS=300 MATCH_INTRO_MS=500 REVENGE_TIMEOUT_MS=3000
 *
 * 체인1 (기본 + e항): 코드방(펌프 단독 풀) A bet4 vs B bet3 → A 승 조작 →
 *   B 리벤지(스테이크 6) → A 오퍼(스테이크 8) 수락 → 매치2 A 승 → B.revenge=null(연속 금지)
 * 체인2 (f항 + 거절/타임아웃): 매치1' A 승 → B 리벤지 → 매치2' B 승 →
 *   A(원 승자).revenge 존재(f항) → A 신청 → B 거절(DECLINED) → A 재신청 → 3s 무응답(TIMEOUT)
 * 체인3 (ALL-IN + 슬롯 다양성): A가 보유 전액 베팅 → match:start의 allIn 플래그 검증,
 *   전체 풀에서 slotGames 3칸이 서로 다른지 검증 (검증 후 즉시 이탈)
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
  spam: boolean // 이 매치에서 정답 스팸(승부 조작) 여부
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
  // 정답 스팸 — 펌프(game3) 서버 상태에서 내 역할의 다음 정답 키를 읽어 즉시 입력
  socket.on('game:state', (m: any) => {
    if (!c.spam || !c.role || !c.matchId) return
    const st = m.state
    if (!st || !Array.isArray(st.p1Seq)) return // 펌프 상태가 아니면 무시
    const seq: number[] = c.role === 'P1' ? st.p1Seq : st.p2Seq
    const idx: number = c.role === 'P1' ? st.p1Idx : st.p2Idx
    if (idx >= seq.length) return
    const code = seq[idx] === 0 ? 'KeyQ' : 'KeyW' // 슬롯 주키/보조키 — 서버가 role 물리키로 재기입
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
    if (Date.now() - t0 > timeoutSec * 1000) throw new Error(`${c.name}: ${ev} #${minCount} 대기 타임아웃`)
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

/** 매치 1판 실행 + 공통 검증. winner가 정답 스팸. matchNo = 이 클라이언트의 몇 번째 match:start/end인지(1-based) */
async function runMatch(opts: {
  a: Client
  b: Client
  winner: Client
  matchNo: number
  expectSlotAll?: number // 슬롯 3칸 전부 이 게임이어야 함 (단독 풀)
}) {
  const { a, b, winner, matchNo } = opts
  a.spam = winner === a
  b.spam = winner === b

  const msA = await waitEvent(a, 'match:start', matchNo, 20)
  const msB = await waitEvent(b, 'match:start', matchNo, 20)
  check(msA.totalRounds === 9 && msB.totalRounds === 9, `매치${matchNo}: totalRounds=9`)
  check(Array.isArray(msA.slotGames) && msA.slotGames.length === 3, `매치${matchNo}: slotGames 3칸`)
  check(JSON.stringify(msA.slotGames) === JSON.stringify(msB.slotGames), `매치${matchNo}: 양측 슬롯 동일`)
  if (opts.expectSlotAll !== undefined) {
    check(msA.slotGames.every((g: number) => g === opts.expectSlotAll), `매치${matchNo}: 슬롯 전부 게임${opts.expectSlotAll} (단독 풀 중복)`)
  }
  check(msA.yourBet === msB.oppBet && msA.oppBet === msB.yourBet, `매치${matchNo}: 베팅 교차 일치 (A ${msA.yourBet} / B ${msB.yourBet})`)

  // 9라운드: round:start의 gameId가 슬롯 스케줄과 일치하는지
  const base = (matchNo - 1) * 9
  for (let r = 1; r <= 9; r++) {
    const rs = await waitEvent(a, 'round:start', base + r, 60)
    check(rs.round === r, `매치${matchNo} R${r}: round 번호`)
    check(rs.gameId === msA.slotGames[(r - 1) % 3], `매치${matchNo} R${r}: 게임=슬롯[(r-1)%3]`)
  }

  const meA = await waitEvent(a, 'match:end', matchNo, 60)
  const meB = await waitEvent(b, 'match:end', matchNo, 60)
  a.spam = false
  b.spam = false
  const winSlot = msA.you === 'A' && winner === a ? 'A_WIN' : msB.you === 'A' && winner === b ? 'A_WIN' : 'B_WIN'
  check(meA.result === winSlot, `매치${matchNo}: 결과 ${meA.result} (조작 승자 일치)`)
  return { msA, msB, meA, meB }
}

async function main() {
  // ── 체인 1: 기본 흐름 + 연속 신청 금지(e항) ──
  console.log('\n━━ 체인 1: 9라운드 슬롯 + 리벤지 수락 + e항 ━━')
  await setCoins('1', 100) // 이지민 = A
  await setCoins('2', 20) //  박준서 = B
  const A = await login('1', 'A(이지민)')
  const B = await login('2', 'B(박준서)')

  const created = await ack(A.socket, 'room:create', { games: [3], bet: 4 }) // 펌프 단독 풀
  check(created.ok, '방 생성 (bet 4)')
  const joined = await ack(B.socket, 'room:join', { code: created.data.code, bet: 3 })
  check(joined.ok, '방 입장 (bet 3)')
  A.socket.emit('room:ready', { ready: true })
  B.socket.emit('room:ready', { ready: true })
  await new Promise((r) => setTimeout(r, 300))
  A.socket.emit('room:start')

  const m1 = await runMatch({ a: A, b: B, winner: A, matchNo: 1, expectSlotAll: 3 })
  check(m1.msA.yourAllIn === false && m1.msA.oppAllIn === false, '매치1: ALL-IN 아님')
  // 코드방 정산: 승자 +패자 베팅(3), 패자 -자기 베팅(3)
  check(m1.meA.coinDelta === 3 && m1.meB.coinDelta === -3, `매치1 정산: A +3 / B -3`)
  check(m1.meA.revenge === null, '매치1: 승자 revenge=null')
  check(m1.meB.revenge?.stake === 6 && m1.meB.revenge?.allIn === false, `매치1: 패자 revenge stake=6 (3×2)`)

  // B 리벤지 신청 → A 오퍼 수신·수락
  const req = await ack(B.socket, 'revenge:request', {})
  check(req.ok, '리벤지 신청 접수')
  const offer = await waitEvent(A, 'revenge:offer', 1, 5)
  check(offer.fromNickname === '박준서', `오퍼: 신청자 닉네임 (${offer.fromNickname})`)
  check(offer.yourStake === 8 && offer.oppStake === 6, `오퍼: 스테이크 승자8(4×2)/패자6(3×2)`)
  const resp = await ack(A.socket, 'revenge:respond', { accept: true })
  check(resp.ok, '리벤지 수락')
  const rrA = await waitEvent(A, 'revenge:result', 1, 5)
  check(rrA.accepted === true, 'revenge:result accepted (양측)')

  const m2 = await runMatch({ a: A, b: B, winner: A, matchNo: 2, expectSlotAll: 3 })
  check(m2.msA.yourBet === 8 && m2.msB.yourBet === 6, '매치2(리벤지): 베팅 2배 (8/6)')
  check(m2.meA.coinDelta === 6 && m2.meB.coinDelta === -6, '매치2 정산: A +6 / B -6')
  check(m2.meB.revenge === null, 'e항: 리벤지 패자(신청자)는 재신청 불가 (revenge=null)')
  check(await coinsOf('1') === 109 && (await coinsOf('2')) === 11, `최종 잔액 A=109 B=11`)
  A.socket.emit('room:leave')
  B.socket.emit('room:leave')
  A.socket.disconnect()
  B.socket.disconnect()

  // ── 체인 2: f항 + 거절 + 타임아웃 ──
  console.log('\n━━ 체인 2: f항(원 승자의 리벤지) + 거절 + 타임아웃 ━━')
  await setCoins('3', 100) // 라태형 = C
  await setCoins('4', 100) // 이종혁 = D
  const C = await login('3', 'C(라태형)')
  const D = await login('4', 'D(이종혁)')
  const created2 = await ack(C.socket, 'room:create', { games: [3], bet: 4 })
  await ack(D.socket, 'room:join', { code: created2.data.code, bet: 3 })
  C.socket.emit('room:ready', { ready: true })
  D.socket.emit('room:ready', { ready: true })
  await new Promise((r) => setTimeout(r, 300))
  C.socket.emit('room:start')

  await runMatch({ a: C, b: D, winner: C, matchNo: 1 }) // C 승
  const reqD = await ack(D.socket, 'revenge:request', {})
  check(reqD.ok, 'D 리벤지 신청')
  await waitEvent(C, 'revenge:offer', 1, 5)
  await ack(C.socket, 'revenge:respond', { accept: true })
  await waitEvent(C, 'revenge:result', 1, 5)

  const m2b = await runMatch({ a: C, b: D, winner: D, matchNo: 2 }) // 리벤지에서 D 승 (원 승자 C 패배)
  const meC2 = m2b.meA // C의 match:end
  check(meC2.revenge !== null && meC2.revenge?.stake === 16, `f항: 원 승자 C가 리벤지 신청 가능 (stake=16)`)
  check(m2b.meB.revenge === null, '리벤지 승자 D는 revenge=null')

  // C 신청 → D 거절
  const reqC = await ack(C.socket, 'revenge:request', {})
  check(reqC.ok, 'C(원 승자) 리벤지 신청 — f항 동작')
  await waitEvent(D, 'revenge:offer', 1, 5)
  await ack(D.socket, 'revenge:respond', { accept: false })
  const rrC = await waitEvent(C, 'revenge:result', 2, 5)
  check(rrC.accepted === false && rrC.reason === 'DECLINED', `거절: revenge:result DECLINED`)

  // C 재신청 → D 무응답 → 타임아웃(3s)
  const reqC2 = await ack(C.socket, 'revenge:request', {})
  check(reqC2.ok, 'C 재신청 (거절 후 재시도 허용)')
  const rrC2 = await waitEvent(C, 'revenge:result', 3, 8)
  check(rrC2.accepted === false && rrC2.reason === 'TIMEOUT', `타임아웃: revenge:result TIMEOUT`)
  C.socket.emit('room:leave')
  D.socket.emit('room:leave')

  // 승자 이탈 후 신청 (2c): 새 postMatch가 없으므로 UNAVAILABLE 계열 확인
  const reqAfterLeave = await ack(C.socket, 'revenge:request', {})
  check(!reqAfterLeave.ok, '방 이탈 후 신청 불가 (2c 계열)')
  C.socket.disconnect()
  D.socket.disconnect()

  // ── 체인 3: ALL-IN 표시 + 슬롯 3칸 서로 다름(전체 풀) ──
  console.log('\n━━ 체인 3: ALL-IN 플래그 + 슬롯 다양성 ━━')
  await setCoins('5', 7) // 유나연 = E — 전액 베팅
  await setCoins('6', 50) // 유영석 = F
  const E = await login('5', 'E(유나연)')
  const F = await login('6', 'F(유영석)')
  const created3 = await ack(E.socket, 'room:create', { bet: 7 }) // games 생략 = 전체 풀
  await ack(F.socket, 'room:join', { code: created3.data.code, bet: 10 })
  E.socket.emit('room:ready', { ready: true })
  F.socket.emit('room:ready', { ready: true })
  await new Promise((r) => setTimeout(r, 300))
  E.socket.emit('room:start')
  const msE = await waitEvent(E, 'match:start', 1, 10)
  const msF = await waitEvent(F, 'match:start', 1, 10)
  check(msE.yourAllIn === true && msF.oppAllIn === true, 'ALL-IN: 전액 베팅 플래그 (본인/상대 시점)')
  check(msF.yourAllIn === false, '비전액 베팅은 ALL-IN 아님')
  const uniq = new Set(msE.slotGames)
  check(uniq.size === 3, `슬롯 다양성: 전체 풀에서 3칸 서로 다름 (${msE.slotGames})`)
  E.socket.disconnect() // 검증 완료 — 매치는 서버가 알아서 정리
  F.socket.disconnect()

  console.log(failures === 0 ? '\n✅ 온라인 매치 E2E 전부 통과' : `\n❌ 실패 ${failures}건`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
