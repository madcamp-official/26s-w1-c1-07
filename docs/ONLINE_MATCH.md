# Online Match — 9-round slots + rematch (v1, 2026-07-06, branch online-match)

> Canonical source for the match structure of online matches (common to quick-start·code-room) and the rematch system.
> The coin-settlement rules themselves are in `docs/COINS.md`; the protocol types are in `shared/src/net/events.ts`.

## 1. Match structure: 9 rounds + slot machine (updated — branch online-round)

- An online match is **always 9 rounds** (the round-count UI in Settings is removed — only the game checkboxes remain).
- When a match is made, the server draws **9 slot reels = one game per round** and sends them as `slotGames` in `match:start`.
  - **The game for round r = `slotGames[r-1]`** (one reel per round, shown in a single row).
  - A single game fills **at most 3 of the 9 rounds**. Candidate pool = the room's game checkboxes (quick-start = all 13).
    If the pool is too small to honor "≤3 each" (host checked only 1~2), the cap is relaxed so 9 rounds still fill.
  - **Hidden rounds**: **3 of rounds 5~9** are concealed as a **"?" reel** — sent as `null` in `slotGames` (never leaked),
    and revealed by `round:start` only when that round begins.
- **Intro timeline** (the server delays round 1's start for `INTRO_MS`=5.0s):
  | Time | Presentation (client `MatchIntro.tsx`) |
  |---|---|
  | 0s | 9 slot reels start spinning (game-pictogram strip rotates) |
  | 1.0s → 2.6s | reels stop left-to-right at **0.2s intervals** (reel r = round r; "?" for hidden rounds) |
  | 3.0s | **VS screen**: both sides' nickname·color·bet coins revealed for ~2 seconds |
  | 5.0s | server `round:start` → per-round intro (see §1b) → round 1 |
- **ALL-IN display**: if the bet = the full holdings at join time, `match:start`'s `yourAllIn/oppAllIn` are true →
  red ALL-IN badge on the VS screen. (Applies to every match regardless of whether it's a rematch.)
- The coin-settlement rule for match:end is the same as before (quick: ±own bet / code: winner absorbs loser's bet).

### 1b. Per-round intro + round result + color identity (branch online-round)

Each round's pre-play window (server `round:start.countdownMs`; the sim starts exactly after it) is filled client-side by `RoundIntro.tsx`:
- **"ROUND n" banner** (1s) — announces the round + my color (YOU · BLUE/RED).
- **How-to-play guide** (3s) — **only on a game's first appearance in the match** (`round:start.showGuide`); repeat games skip it.
- **"2 · 1 · START!" countdown** (2s) — identical to offline Play.
- So `countdownMs` = 1000 + (showGuide ? 3000 : 0) + 2000 = **6000** (first appearance) / **3000** (repeat).

On `round:end` the server sends the **winner as a player color** (`winnerColor`) + **cumulative wins by color** (`wins:{blue,red}`).
`ResultOverlay.tsx` shows **"P1 WIN / P2 WIN / DRAW" + running score** for `ROUND_GAP_MS` (3s) then auto-advances (no button).

**Color identity (fixed per match)**: display **P1 = blue player, P2 = red player** everywhere (top HUD, round result, in-game
characters) so each player keeps one color for the whole match, even though the attack/defense role is re-randomized each round.

## 2. Rematch

A system where the loser challenges the immediate winner again, each staking **twice their previous bet**.

### Stake rules
- `stake = min(previous own bet × 2, current coin holdings)` — **if 2× isn't affordable, full-holdings ALL-IN**.
- Same rule whether requester (loser) or accepter (winner). But **if holdings are 0, can't participate**
  (loser: REVENGE button not shown / winner: the request itself is rejected).
- The settlement mode (quick/code) is **inherited from the original match** (restarted in the same room).

### Flow
```
match:end ─ enclose revenge:{stake, allIn} eligibility to the loser (null if none → button not shown)
  → loser clicks [REVENGE] → revenge:request (ack)
     ├─ winner left the room / disconnected / 0 coins → ack fails → loser auto-returns to main (spec 2c)
     └─ OK → revenge:offer { fromNickname, yourStake/allIn, oppStake/allIn, timeoutMs } to the winner
  → winner dialog "{loser} has staked double their bet coins and challenged you to a rematch…"
     ├─ [Accept] → revenge:result{accepted:true} to both → new match in the same room (slots re-drawn, bet=stake)
     ├─ [Decline] → revenge:result{DECLINED} → both return to main
     ├─ 10s no response → revenge:result{TIMEOUT} (server `REVENGE_TIMEOUT_MS`)
     └─ loser [Cancel] → revenge:result{CANCELLED}
```

### Eligibility (conditions for match:end's revenge to be non-null)
1. Not a draw and I am the loser
2. **I was not the rematch requester of the immediately previous match** — consecutive requests forbidden (spec 2e)
   - If the original winner lost in a rematch: they weren't the requester, so they can request (spec 2f)
3. Coin holdings ≥ 1 after settlement

### Implementation locations
| Layer | File | Content |
|---|---|---|
| Protocol | `shared/src/net/events.ts` | `MatchStartMsg.slotGames/bets/allIn`, `MatchEndMsg.revenge`, 5 `revenge:*` |
| Server | `server/src/match.ts` | 9 rounds·slot draw·INTRO_MS·match:end eligibility calc·postMatch record |
| Server | `server/src/rooms.ts` | `Member.allIn`, `Room.postMatch` (rematch window)·`revengeRequesterUserId` |
| Server | `server/src/index.ts` | `revenge:request/respond/cancel` handlers, `takeRevengePending` (double-processing guard), leaveRoom integration |
| Client | `client/src/net/online.ts` | phase `'slot'`, revengePhase/offer/closed state, 3 actions |
| Client | `client/src/net/MatchIntro.tsx` | slot presentation + VS screen (reduce-motion support) |
| Client | `client/src/net/OnlineController.tsx` | REVENGE button/wait/accept dialog, return to main on cancellation |
| Client | `client/src/components/HudFrame.tsx` | round notation (n/9) correction during an online match |

### Test knobs (E2E-only — production defaults unchanged)
Server timing can be shortened via the `MATCH_COUNTDOWN_MS` `MATCH_BANNER_MS` `MATCH_GUIDE_MS` `MATCH_ROUND_GAP_MS`
`MATCH_INTRO_MS` `REVENGE_TIMEOUT_MS` environment variables (`server/src/match.ts`, `index.ts`).

## 3. Decision record (user-finalized)
- 9 rounds fixed → round-count UI removed from the settings modal (2026-07-06)
- 3 distinct games in the slots, code room = checkbox pool (duplicates allowed if pool < 3)
- Rematch stake: allow ALL-IN when holdings < 2×, and show full-bet ALL-IN in every match
- Winner response timeout 10s
- (agreed defaults) no rematch on a draw / both return to main on decline·cancel·timeout /
  the rematch is also 9 rounds with new slots

## 4. E2E regression test

`server/e2e/online-match.e2e.ts` — verifies every spec item against the real server with 2 socket clients (~7 min).

```bash
# Terminal 1: shortened-timing server
cd server && MATCH_COUNTDOWN_MS=300 MATCH_ROUND_GAP_MS=300 MATCH_INTRO_MS=500 REVENGE_TIMEOUT_MS=3000 npx tsx src/index.ts
# Terminal 2
cd server && npx tsx e2e/online-match.e2e.ts
```
⚠️ Overwrites the coins of users 1~6, so local DB only. (Latest pass: all 121 checks ✅)

## 5. Opus deep-review reflected (2026-07-06)

Parallel review through 5 lenses (concurrency·state-machine·spec·integration·coin-edge) → 8 fixes finalized via double adversarial verification.

| Defect | Fix |
|---|---|
| Optimistic teardown of rematch 'cancel'/'main' races the winner's 'accept', losing coins | Base cancel on server finalization (revenge:result) — if accept wins, proceed to the match as-is, no coin loss |
| requestError not reset between matches → wrong banner on the next screen | Reset on match-end/slot entry (`OnlineController.tsx`) |
| REVENGE double-click → 2nd PENDING ack misread as 'winner left' | in-flight guard (`requesting`) + button disabled |
| settleCoins asymmetric clamp → code-room zero-sum broken, coins created out of thin air | transfer clamp (winner = loser's actual deduction, `db.ts`) + block `/api/unlock` during a match |
| aborted not protected as a terminal state → a following game:state overwrites the leave notice | ignore round events after termination via an `isTerminal()` guard (`online.ts`) |
| cancel echo re-fires teardown (double leaveRoom) | single-execution guard `leavingRef` in `goMain` |
| rematch countdown over-displays the first 250ms | `nowTick=performance.now()` initialization + upper clamp |
| mobile 3 slot reels overflow at ≤360px | block overlay overflow + shrink reels at ≤360px (`match-intro.css`) |
