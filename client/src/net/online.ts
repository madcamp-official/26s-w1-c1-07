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
  type PlayerColor,
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
  | 'slot' // match:start 수신 ~ 1라운드 round:start 사이 — 슬롯머신 + VS(베팅 공개) 인트로
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
  /** 내 색(매치 고정, 플레이어 종속 — 역할과 독립). 렌더러가 이 색으로 칠한다. */
  myColor: PlayerColor | null
  /** 상대 색(매치 고정) */
  oppColor: PlayerColor | null
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
  /** 슬롯머신 3릴 결과 — 라운드 r 게임 = slotGames[(r-1) % 3] */
  slotGames: GameId[] | null
  /** 이 매치의 베팅 (VS 화면·ALL-IN 표시) */
  myBet: number | null
  oppBet: number | null
  myAllIn: boolean
  oppAllIn: boolean
  /** 리벤지: 내 신청 자격 (match:end에서 패자에게만 non-null) */
  revenge: { stake: number; allIn: boolean } | null
  /** 리벤지 하위 상태 — none / waiting(신청 후 응답 대기) / offered(승자: 수락 다이얼로그) */
  revengePhase: 'none' | 'waiting' | 'offered'
  /** 승자가 받은 리벤지 오퍼 */
  revengeOffer: {
    fromNickname: string
    yourStake: number
    yourAllIn: boolean
    oppStake: number
    oppAllIn: boolean
    timeoutMs: number
    receivedAt: number
  } | null
  /** 리벤지 무산(거절/취소/타임아웃/불가) — 클라는 이걸 보고 메인으로 복귀 */
  revengeClosed: { reason: string } | null
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
  myColor: null,
  oppColor: null,
  serverState: null,
  serverSeq: -1,
  countdownUntil: 0,
  lastRoundResult: null,
  matchResult: null,
  recordedMatchId: null,
  coinDelta: null,
  coinBalance: null,
  slotGames: null,
  myBet: null,
  oppBet: null,
  myAllIn: false,
  oppAllIn: false,
  revenge: null,
  revengePhase: 'none',
  revengeOffer: null,
  revengeClosed: null,
  error: null,
}

export const onlineStore = createStore<OnlineState>({ ...INITIAL })
export const useOnline = () => useStore(onlineStore)
export const getOnline = () => onlineStore.get()

/**
 * 이 라운드 P1/P2 '기능 엔티티'의 플레이어 색 (색≠역할 — 렌더러는 이 색으로 칠한다).
 * 색은 플레이어 종속(매치 고정), 역할은 매치마다 랜덤이라 P1(공격)이 파랑일 때도 빨강일 때도 있다.
 * 오프라인/색 정보 없으면 기본(P1=blue, P2=red)이라 기존 동작과 동일.
 */
export function functionColors(): { p1: PlayerColor; p2: PlayerColor } {
  const o = onlineStore.get()
  if (!o.myColor || !o.oppColor || !o.role) return { p1: 'blue', p2: 'red' }
  // role = 내 역할(이 매치 고정). 내가 P1이면 P1엔티티=내 색, 아니면 상대 색.
  return o.role === 'P1'
    ? { p1: o.myColor, p2: o.oppColor }
    : { p1: o.oppColor, p2: o.myColor }
}

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
    // 매치 진행/종료 중(슬롯 인트로·카운트다운·플레이·결과·이탈)에는 room:state 로 phase 를
    // 덮지 않는다 — room 정보만 갱신. (코드방 자동진행 room:state 가 슬롯 인트로/인게임 phase 를
    //  'room' 으로 덮어써 화면이 번쩍하고 사라지는 버그 방지)
    if (
      cur.phase === 'slot' ||
      cur.phase === 'countdown' ||
      cur.phase === 'playing' ||
      cur.phase === 'match-end' ||
      cur.phase === 'aborted'
    ) {
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
  s.on(
    EV.matchStart,
    (m: {
      matchId: string
      you: 'A' | 'B'
      totalRounds: number
      opponent: OpponentView
      yourColor: PlayerColor
      oppColor: PlayerColor
      slotGames?: GameId[]
      yourBet?: number
      oppBet?: number
      yourAllIn?: boolean
      oppAllIn?: boolean
    }) =>
      onlineStore.set({
        matchId: m.matchId,
        mySlot: m.you,
        totalRounds: m.totalRounds,
        opponent: m.opponent,
        myColor: m.yourColor,
        oppColor: m.oppColor,
        slotGames: m.slotGames ?? null,
        myBet: m.yourBet ?? null,
        oppBet: m.oppBet ?? null,
        myAllIn: m.yourAllIn ?? false,
        oppAllIn: m.oppAllIn ?? false,
        matchResult: null,
        recordedMatchId: null,
        revenge: null,
        revengePhase: 'none',
        revengeOffer: null,
        revengeClosed: null,
        phase: 'slot', // 슬롯머신 + VS 인트로 (round:start가 countdown으로 전환)
      }),
  )
  // 종료 상태(aborted/match-end)면 이후 라운드 이벤트를 무시한다.
  // 서버는 상대 이탈 후에도 매치를 끝까지 연산해 game:state/round:start를 계속 보내는데,
  // 이걸 반영하면 'aborted'(OPPONENT LEFT) 오버레이가 게임 화면으로 되살아나 버림.
  const isTerminal = () => {
    const p = getOnline().phase
    return p === 'aborted' || p === 'match-end'
  }
  s.on(EV.roundStart, (m: { matchId: string; round: number; gameId: GameId; role: Role; countdownMs: number }) => {
    if (isTerminal()) return
    onlineStore.set({
      round: m.round,
      gameId: m.gameId,
      role: m.role,
      phase: 'countdown',
      serverState: null,
      serverSeq: -1,
      lastRoundResult: null,
      countdownUntil: performance.now() + m.countdownMs,
    })
  })
  s.on(EV.gameState, (m: { seq: number; state: unknown }) => {
    if (isTerminal()) return
    if (m.seq <= getOnline().serverSeq) return // 순서 역전 무시
    onlineStore.set({ serverState: m.state, serverSeq: m.seq, phase: 'playing' })
  })
  s.on(EV.roundEnd, (m: { result: GameResult }) => {
    if (isTerminal()) return
    onlineStore.set({ phase: 'round-result', lastRoundResult: m.result })
  })
  s.on(
    EV.matchEnd,
    (m: {
      result: SlotResult
      recordedMatchId: string
      coinDelta?: number
      coinBalance?: number
      revenge?: { stake: number; allIn: boolean } | null
    }) => {
      startRequestedForRoom = null // 같은 방 재대결 허용
      onlineStore.set({
        phase: 'match-end',
        matchResult: m.result,
        recordedMatchId: m.recordedMatchId,
        coinDelta: m.coinDelta ?? null,
        coinBalance: m.coinBalance ?? null,
        revenge: m.revenge ?? null,
        revengePhase: 'none',
        revengeOffer: null,
        revengeClosed: null,
      })
    },
  )
  // ── 리벤지 (docs/ONLINE_MATCH.md) ──
  s.on(
    EV.revengeOffer,
    (m: {
      fromNickname: string
      yourStake: number
      yourAllIn: boolean
      oppStake: number
      oppAllIn: boolean
      timeoutMs: number
    }) =>
      onlineStore.set({
        revengePhase: 'offered',
        revengeOffer: { ...m, receivedAt: performance.now() },
      }),
  )
  s.on(EV.revengeResult, (m: { accepted: boolean; reason?: string }) => {
    if (m.accepted) {
      // 수락 — 곧바로 match:start(슬롯 인트로)가 이어지므로 하위 상태만 정리
      onlineStore.set({ revengePhase: 'none', revengeOffer: null, revengeClosed: null })
    } else {
      onlineStore.set({
        revengePhase: 'none',
        revengeOffer: null,
        revengeClosed: { reason: m.reason ?? 'DECLINED' },
      })
    }
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
  games: GameId[],
  bet: number,
): Promise<{ room: RoomSnapshot | null; message?: string }> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ room: null, message: '연결 안 됨' })
    socket.emit(EV.roomCreate, { games, bet }, (ack: { ok: boolean; data?: RoomSnapshot; message?: string }) => {
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

// ── 리벤지 액션 ──
/** 패자 → 리벤지 신청. 실패(승자 이탈 등) 시 메시지와 함께 false — 클라는 메인으로 복귀 */
export function requestRevenge(): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, message: '연결 안 됨' })
    socket.emit(EV.revengeRequest, {}, (ack: { ok: boolean; message?: string }) => {
      if (ack?.ok) {
        onlineStore.set({ revengePhase: 'waiting', revengeClosed: null })
        resolve({ ok: true })
      } else resolve({ ok: false, message: ack?.message })
    })
  })
}

/** 승자 → 오퍼 응답 (수락 시 서버가 revenge:result → match:start 순으로 보낸다) */
export function respondRevenge(accept: boolean): void {
  socket?.emit(EV.revengeRespond, { accept }, () => {})
}

/**
 * 패자 → 대기 중 신청 취소. 로컬 phase를 바꾸지 않고 서버 확정(revenge:result)을 기다린다.
 * (승자 '수락'과의 경합에서 취소가 지면 서버가 accepted:true+match:start를 보내 그대로 매치로 진입 — #1)
 */
export function cancelRevenge(): void {
  socket?.emit(EV.revengeCancel)
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
