/** 매치 런타임 최소 인터페이스 (rooms ↔ match 순환참조 방지) */
import type { GameInputEvent } from '@madpump/shared'

export interface MatchRuntime {
  matchId: string
  /** 클라 입력 주입 (서버가 role로 code 재기입) */
  pushInput(userId: string, ev: GameInputEvent): void
  /** 강제 종료 (방 파기 등) */
  stop(): void
}
