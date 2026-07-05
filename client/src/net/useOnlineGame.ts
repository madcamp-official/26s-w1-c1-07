/**
 * 게임 화면용 온라인 훅.
 * 이 게임(gameId)이 지금 온라인 매치의 현재 라운드면 { state, role, sendInput }를 반환.
 * 화면은 이때 로컬 시뮬/봇을 돌리지 않고 서버 state를 렌더 + 입력을 전송한다.
 */
import { useOnline, sendInput } from './online'
import type { GameId, GameResult, OpponentView, Role } from '@madpump/shared'

export interface OnlineGame {
  /** 서버 권위 상태(렌더용 투영). null이면 아직 첫 스냅샷 전(카운트다운 등) */
  state: unknown | null
  role: Role
  round: number
  phase: 'countdown' | 'playing' | 'round-result'
  countdownUntil: number
  lastRoundResult: GameResult | null
  opponent: OpponentView | null
  /** 내 입력 전송(슬롯 A=주키/B=보조키). cell(선택)=오목 등에서 로컬 커서로 고른 칸. */
  sendInput: (slot: 'A' | 'B', type: 'down' | 'up', t: number, cell?: number) => void
}

export function useOnlineGame(gameId: GameId): OnlineGame | null {
  const o = useOnline()
  const active =
    o.gameId === gameId &&
    o.role != null &&
    (o.phase === 'countdown' || o.phase === 'playing' || o.phase === 'round-result')
  if (!active) return null
  return {
    state: o.serverState,
    role: o.role as Role,
    round: o.round,
    phase: o.phase as OnlineGame['phase'],
    countdownUntil: o.countdownUntil,
    lastRoundResult: o.lastRoundResult,
    opponent: o.opponent,
    sendInput,
  }
}
