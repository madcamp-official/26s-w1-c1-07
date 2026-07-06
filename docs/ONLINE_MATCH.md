# Online Match — 9-round slots + rematch (v1, 2026-07-06, branch online-match)

> Canonical source for the match structure of online matches (common to quick-start·code-room) and the rematch system.
> The coin-settlement rules themselves are in `docs/COINS.md`; the protocol types are in `shared/src/net/events.ts`.

## 1. Match structure: 9 rounds + slot machine

- An online match is **always 9 rounds** (the round-count UI in Settings is removed — only the game checkboxes remain).
- When a match is made, the server draws **3 slot reels** = 3 games and sends them down as `slotGames` in `match:start`.
  - **The game for round r = `slotGames[(r-1) % 3]`** → reel1 = rounds 1·4·7, reel2 = 2·5·8, reel3 = 3·6·9.
  - Candidate pool = the room's game checkboxes (quick-start = all 10). **If pool ≥ 3, three distinct games**;
    if the pool is 1~2, duplicates are allowed within it.
- **Intro timeline** (the server delays round 1's start for `INTRO_MS`=4.7s):
  | Time | Presentation (client `MatchIntro.tsx`) |
  |---|---|
  | 0s | 3 slot reels start spinning (game-pictogram strip rotates) |
  | 1.2s / 1.5s / 1.8s | reels 1→2→3 stop sequentially at **0.3s intervals** |
  | 2.5s | **VS screen**: both sides' nickname·color·bet coins revealed for 2 seconds |
  | 4.7s | server `round:start` → 3-second countdown → round 1 |
- **ALL-IN display**: if the bet = the full holdings at join time, `match:start`'s `yourAllIn/oppAllIn` are true →
  red ALL-IN badge on the VS screen. (Applies to every match regardless of whether it's a rematch.)
- The coin-settlement rule for match:end is the same as before (quick: ±own bet / code: winner absorbs loser's bet).

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
Server timing can be shortened via the `MATCH_COUNTDOWN_MS` `MATCH_ROUND_GAP_MS` `MATCH_INTRO_MS` `REVENGE_TIMEOUT_MS`
environment variables (`server/src/match.ts`, `index.ts`).

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
