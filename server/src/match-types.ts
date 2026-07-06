/** Minimal match runtime interface (avoids rooms ↔ match circular imports) */
import type { GameInputEvent } from '@madpump/shared'

export interface MatchRuntime {
  matchId: string
  /** Inject client input (server rewrites code by role) */
  pushInput(userId: string, ev: GameInputEvent): void
  /** Force stop (e.g. room teardown) */
  stop(): void
}
