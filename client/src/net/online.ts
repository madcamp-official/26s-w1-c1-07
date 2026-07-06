/**
 * Online match client store — socket connection + server event handling + actions.
 * True multiplayer: the server computes the game (authoritative), the client receives game:state to render + sends game:input.
 * (replaces the mock bot — flow.mode stays offline-only, and online play is handled by this store)
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
  | 'slot' // between receiving match:start and round 1 round:start — slot machine + VS (bet reveal) intro
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
  /** My color (fixed per match, tied to the player — independent of role). The renderer paints with this color. */
  myColor: PlayerColor | null
  /** Opponent color (fixed per match) */
  oppColor: PlayerColor | null
  /** Latest projected state from server game:state (the game screen renders it) */
  serverState: unknown | null
  serverSeq: number
  countdownUntil: number
  lastRoundResult: GameResult | null
  matchResult: SlotResult | null
  recordedMatchId: string | null
  /** My coin change from match settlement (on match:end) */
  coinDelta: number | null
  /** My coin balance after settlement */
  coinBalance: number | null
  /** Slot machine 3-reel result — round r game = slotGames[(r-1) % 3] */
  slotGames: GameId[] | null
  /** This match's bets (VS screen / ALL-IN display) */
  myBet: number | null
  oppBet: number | null
  myAllIn: boolean
  oppAllIn: boolean
  /** Rematch: my eligibility to request (non-null only for the loser on match:end) */
  revenge: { stake: number; allIn: boolean } | null
  /** Rematch sub-state — none / waiting (awaiting response after requesting) / offered (winner: accept dialog) */
  revengePhase: 'none' | 'waiting' | 'offered'
  /** Rematch offer received by the winner */
  revengeOffer: {
    fromNickname: string
    yourStake: number
    yourAllIn: boolean
    oppStake: number
    oppAllIn: boolean
    timeoutMs: number
    receivedAt: number
  } | null
  /** Rematch fell through (declined/canceled/timeout/unavailable) — the client uses this to return to main */
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
 * Player colors of this round's P1/P2 'functional entities' (color ≠ role — the renderer paints with this color).
 * Color is tied to the player (fixed per match); role is randomized each match, so P1 (attacker) can be blue or red.
 * When offline / no color info, defaults (P1=blue, P2=red) match the existing behavior.
 */
export function functionColors(): { p1: PlayerColor; p2: PlayerColor } {
  const o = onlineStore.get()
  if (!o.myColor || !o.oppColor || !o.role) return { p1: 'blue', p2: 'red' }
  // role = my role (fixed this match). If I'm P1 then P1 entity = my color, otherwise the opponent's color.
  return o.role === 'P1'
    ? { p1: o.myColor, p2: o.oppColor }
    : { p1: o.oppColor, p2: o.myColor }
}

let socket: Socket | null = null
// Prevents the host from emitting roomStart on every room:state and starting the match twice (once per room code).
let startRequestedForRoom: string | null = null

/** Check the server session (roster login cookie) → connect socket + wire events */
export async function connectOnline(): Promise<void> {
  onlineStore.set({ phase: 'connecting', error: null })
  // 1) Check session — login (class → member select) must come first
  let hasSession = false
  try {
    const me = await fetch(`${SERVER_URL}/api/me`, { credentials: 'include' })
    if (me.ok) hasSession = (await me.json()).status === 'USER'
  } catch {
    /* handled as an error below */
  }
  if (!hasSession) {
    onlineStore.set({ phase: 'idle', error: 'Login required' })
    return
  }
  // 2) Socket connection (cookie auto-attached)
  if (socket) socket.disconnect()
  socket = io(SERVER_URL, { withCredentials: true, transports: ['websocket', 'polling'] })
  wire(socket)
  await new Promise<void>((resolve) => {
    socket!.on('connect', () => resolve())
    socket!.on('connect_error', () => {
      onlineStore.set({ phase: 'idle', error: 'Socket authentication failed' })
      resolve()
    })
  })
}

function wire(s: Socket) {
  s.on(EV.hello, (m: { me: MeInfo }) => onlineStore.set({ connected: true, me: m.me }))
  s.on(EV.roomState, (room: RoomSnapshot) => {
    // While a match-end/left overlay is showing, don't overwrite phase with room:state.
    // (When the opponent disconnects after the match ends, the server's leaveRoom sends room:state to the
    //  remaining player, which would overwrite the 'match-end' phase with 'room' and make the result overlay
    //  vanish — this prevents that bug.)
    const cur = getOnline()
    // During a match (slot intro / countdown / play / result / left), don't overwrite phase with room:state —
    // only refresh the room info. (Prevents the bug where a code-room auto-advance room:state overwrites the
    //  slot intro / in-game phase with 'room', making the screen flash and disappear.)
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
    // Code-room auto-advance: once 2 players gather, each readies up and the host starts (no manual ready/start UI)
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
        phase: 'slot', // slot machine + VS intro (round:start switches to countdown)
      }),
  )
  // In a terminal state (aborted/match-end), ignore subsequent round events.
  // The server keeps computing the match to the end even after the opponent leaves and keeps sending
  // game:state/round:start; reflecting these would revive the 'aborted' (OPPONENT LEFT) overlay back into the game screen.
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
    if (m.seq <= getOnline().serverSeq) return // ignore out-of-order
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
      startRequestedForRoom = null // allow a rematch in the same room
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
  // ── Rematch (docs/ONLINE_MATCH.md) ──
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
      // accepted — match:start (slot intro) follows immediately, so just clear the sub-state
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

// ── Actions (bet: coins wagered on this match — the server re-validates the balance) ──
export function joinQueue(bet: number): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, message: 'Not connected' })
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
    if (!socket) return resolve({ room: null, message: 'Not connected' })
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
    if (!socket) return resolve({ ok: false, message: 'Not connected' })
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
 * Send game input — carries the slot (A/B) as a canonical key. The server remaps it by role.
 * cell (optional): a cell index the client picked with a local cursor, as in Gomoku. Omitted for most games.
 */
export function sendInput(slot: 'A' | 'B', type: 'down' | 'up', t: number, cell?: number): void {
  const matchId = getOnline().matchId
  if (!socket || !matchId) return
  socket.emit(EV.gameInput, { matchId, code: slot === 'A' ? 'KeyQ' : 'KeyW', type, t, cell })
}

// ── Rematch actions ──
/** Loser → request a rematch. On failure (winner left, etc.) returns false with a message — the client returns to main */
export function requestRevenge(): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, message: 'Not connected' })
    socket.emit(EV.revengeRequest, {}, (ack: { ok: boolean; message?: string }) => {
      if (ack?.ok) {
        onlineStore.set({ revengePhase: 'waiting', revengeClosed: null })
        resolve({ ok: true })
      } else resolve({ ok: false, message: ack?.message })
    })
  })
}

/** Winner → respond to the offer (on accept, the server sends revenge:result → match:start in order) */
export function respondRevenge(accept: boolean): void {
  socket?.emit(EV.revengeRespond, { accept }, () => {})
}

/**
 * Loser → cancel a pending request. Doesn't change the local phase; waits for the server's confirmation (revenge:result).
 * (If the cancel loses the race against the winner's 'accept', the server sends accepted:true + match:start and the match starts as-is — #1)
 */
export function cancelRevenge(): void {
  socket?.emit(EV.revengeCancel)
}

/** Reset online state after a match ends/is left (keeps the socket) */
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
