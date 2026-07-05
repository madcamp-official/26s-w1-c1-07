/**
 * 온라인 매치 클라 스토어 — 소켓 연결 + 서버 이벤트 수신 + 액션.
 * 진짜 멀티플레이: 서버가 게임을 계산하고(권위), 클라는 game:state를 받아 렌더 + game:input 전송.
 * (mock 봇 대체 — flow.mode는 offline 전용으로 남고, 온라인은 이 스토어가 담당)
 */
import { io, type Socket } from 'socket.io-client'
import {
  EV,
  type GameId,
  type GameResult,
  type MeInfo,
  type OpponentView,
  type Role,
  type RoomSnapshot,
  type SlotResult,
} from '@madpump/shared'
import { createStore, useStore } from '../state/store'
import { SERVER_URL } from './config'

export type OnlinePhase =
  | 'idle'
  | 'connecting'
  | 'queue'
  | 'room'
  | 'countdown'
  | 'playing'
  | 'round-result'
  | 'match-end'
  | 'aborted'

export interface OnlineState {
  connected: boolean
  me: MeInfo | null
  phase: OnlinePhase
  room: RoomSnapshot | null
  matchId: string | null
  mySlot: 'A' | 'B' | null
  totalRounds: number
  round: number
  gameId: GameId | null
  role: Role | null
  opponent: OpponentView | null
  /** 서버 game:state 최신 투영 상태 (게임 화면이 렌더) */
  serverState: unknown | null
  serverSeq: number
  countdownUntil: number
  lastRoundResult: GameResult | null
  matchResult: SlotResult | null
  recordedMatchId: string | null
  /** 매치 정산으로 인한 내 코인 증감 (match:end 수신 시) */
  coinDelta: number | null
  /** 정산 후 내 보유 코인 */
  coinBalance: number | null
  error: string | null
}

const INITIAL: OnlineState = {
  connected: false,
  me: null,
  phase: 'idle',
  room: null,
  matchId: null,
  mySlot: null,
  totalRounds: 3,
  round: 0,
  gameId: null,
  role: null,
  opponent: null,
  serverState: null,
  serverSeq: -1,
  countdownUntil: 0,
  lastRoundResult: null,
  matchResult: null,
  recordedMatchId: null,
  coinDelta: null,
  coinBalance: null,
  error: null,
}

export const onlineStore = createStore<OnlineState>({ ...INITIAL })
export const useOnline = () => useStore(onlineStore)
export const getOnline = () => onlineStore.get()

let socket: Socket | null = null
// 호스트가 room:state 마다 roomStart를 중복 emit해 매치가 2번 시작되는 것 방지(방 코드당 1회).
let startRequestedForRoom: string | null = null

/** 서버 세션(로스터 로그인 쿠키) 확인 → 소켓 연결 + 이벤트 배선 */
export async function connectOnline(): Promise<void> {
  onlineStore.set({ phase: 'connecting', error: null })
  // 1) 세션 확인 — 로그인(분반→멤버 선택)이 선행돼야 한다
  let hasSession = false
  try {
    const me = await fetch(`${SERVER_URL}/api/me`, { credentials: 'include' })
    if (me.ok) hasSession = (await me.json()).status === 'USER'
  } catch {
    /* 아래에서 에러 처리 */
  }
  if (!hasSession) {
    onlineStore.set({ phase: 'idle', error: '로그인 필요' })
    return
  }
  // 2) 소켓 연결 (쿠키 자동 동봉)
  if (socket) socket.disconnect()
  socket = io(SERVER_URL, { withCredentials: true, transports: ['websocket', 'polling'] })
  wire(socket)
  await new Promise<void>((resolve) => {
    socket!.on('connect', () => resolve())
    socket!.on('connect_error', () => {
      onlineStore.set({ phase: 'idle', error: '소켓 인증 실패' })
      resolve()
    })
  })
}

function wire(s: Socket) {
  s.on(EV.hello, (m: { me: MeInfo }) => onlineStore.set({ connected: true, me: m.me }))
  s.on(EV.roomState, (room: RoomSnapshot) => {
    // 매치 종료/이탈 오버레이 표시 중엔 room:state로 phase를 덮지 않는다.
    // (상대가 종료 후 접속을 끊으면 서버 leaveRoom이 남은 사람에게 room:state를 보내는데,
    //  이게 'match-end' phase를 'room'으로 덮어써 결과 오버레이가 사라지는 버그 방지.)
    const cur = getOnline()
    if (cur.phase === 'match-end' || cur.phase === 'aborted') {
      onlineStore.set({ room })
      return
    }
    onlineStore.set({ room, phase: 'room' })
    // 코드방 자동 진행: 2명 모이면 각자 ready, 방장이 시작 (수동 ready/start UI 생략)
    const meId = getOnline().me?.id
    if (room.members.length < 2 || !meId) return
    const mine = room.members.find((m) => m.userId === meId)
    if (mine && !mine.ready) roomReady(true)
    if (
      room.hostUserId === meId &&
      room.members.every((m) => m.ready) &&
      startRequestedForRoom !== room.code
    ) {
      startRequestedForRoom = room.code
      roomStart()
    }
  })
  s.on(EV.queueMatched, (m: { roomCode: string; role: Role; opponent: OpponentView }) =>
    onlineStore.set({ role: m.role, opponent: m.opponent }),
  )
  s.on(EV.matchStart, (m: { matchId: string; you: 'A' | 'B'; totalRounds: number; opponent: OpponentView }) =>
    onlineStore.set({
      matchId: m.matchId,
      mySlot: m.you,
      totalRounds: m.totalRounds,
      opponent: m.opponent,
      matchResult: null,
      recordedMatchId: null,
    }),
  )
  s.on(EV.roundStart, (m: { matchId: string; round: number; gameId: GameId; role: Role; countdownMs: number }) =>
    onlineStore.set({
      round: m.round,
      gameId: m.gameId,
      role: m.role,
      phase: 'countdown',
      serverState: null,
      serverSeq: -1,
      lastRoundResult: null,
      countdownUntil: performance.now() + m.countdownMs,
    }),
  )
  s.on(EV.gameState, (m: { seq: number; state: unknown }) => {
    if (m.seq <= getOnline().serverSeq) return // 순서 역전 무시
    onlineStore.set({ serverState: m.state, serverSeq: m.seq, phase: 'playing' })
  })
  s.on(EV.roundEnd, (m: { result: GameResult }) =>
    onlineStore.set({ phase: 'round-result', lastRoundResult: m.result }),
  )
  s.on(EV.matchEnd, (m: { result: SlotResult; recordedMatchId: string; coinDelta?: number; coinBalance?: number }) => {
    startRequestedForRoom = null // 같은 방 재대결 허용
    onlineStore.set({
      phase: 'match-end',
      matchResult: m.result,
      recordedMatchId: m.recordedMatchId,
      coinDelta: m.coinDelta ?? null,
      coinBalance: m.coinBalance ?? null,
    })
  })
  s.on(EV.matchAborted, () => {
    startRequestedForRoom = null
    onlineStore.set({ phase: 'aborted' })
  })
  s.on('disconnect', () => onlineStore.set({ connected: false }))
}

// ── 액션 (bet: 이 매치에 거는 코인 — 서버가 보유량 재검증) ──
export function joinQueue(bet: number): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, message: '연결 안 됨' })
    socket.emit(EV.queueJoin, { bet }, (ack: { ok: boolean; message?: string }) => {
      if (ack?.ok) {
        onlineStore.set({ phase: 'queue' })
        resolve({ ok: true })
      } else resolve({ ok: false, message: ack?.message })
    })
  })
}
export function leaveQueue(): void {
  socket?.emit(EV.queueLeave)
  onlineStore.set({ phase: 'idle' })
}
export function createRoom(
  rounds: number,
  games: GameId[],
  bet: number,
): Promise<{ room: RoomSnapshot | null; message?: string }> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ room: null, message: '연결 안 됨' })
    socket.emit(EV.roomCreate, { rounds, games, bet }, (ack: { ok: boolean; data?: RoomSnapshot; message?: string }) => {
      if (ack?.ok && ack.data) {
        onlineStore.set({ room: ack.data, phase: 'room' })
        resolve({ room: ack.data })
      } else resolve({ room: null, message: ack?.message })
    })
  })
}
export function joinRoom(code: string, bet: number): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, message: '연결 안 됨' })
    socket.emit(EV.roomJoin, { code, bet }, (ack: { ok: boolean; data?: RoomSnapshot; message?: string }) => {
      if (ack?.ok && ack.data) {
        onlineStore.set({ room: ack.data, phase: 'room' })
        resolve({ ok: true })
      } else resolve({ ok: false, message: ack?.message })
    })
  })
}
export function roomReady(ready: boolean): void {
  socket?.emit(EV.roomReady, { ready })
}
export function roomStart(): void {
  socket?.emit(EV.roomStart)
}
export function leaveRoom(): void {
  socket?.emit(EV.roomLeave)
  startRequestedForRoom = null
  onlineStore.set({ phase: 'idle', room: null })
}

/**
 * 게임 입력 전송 — 슬롯(A/B)을 canonical 키로 실어 보냄. 서버가 role로 재기입.
 * cell(선택): 오목처럼 클라가 로컬 커서로 고른 칸 인덱스. 대부분 게임은 생략.
 */
export function sendInput(slot: 'A' | 'B', type: 'down' | 'up', t: number, cell?: number): void {
  const matchId = getOnline().matchId
  if (!socket || !matchId) return
  socket.emit(EV.gameInput, { matchId, code: slot === 'A' ? 'KeyQ' : 'KeyW', type, t, cell })
}

/** 매치 종료/이탈 후 온라인 상태 초기화(소켓은 유지) */
export function resetOnline(): void {
  startRequestedForRoom = null
  onlineStore.set({ ...INITIAL, connected: getOnline().connected, me: getOnline().me })
}

export function disconnectOnline(): void {
  socket?.disconnect()
  socket = null
  startRequestedForRoom = null
  onlineStore.set({ ...INITIAL })
}
