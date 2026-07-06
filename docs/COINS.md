# MADPUMP coin system (v1, 2026-07-05)

> The rule source of truth for the "Coin" currency. The code source of truth for constants·helpers is `shared/src/coins.ts` (shared by client/server).
> The DB schema is `docs/ERD.md` v2 (app_user.coins / unlocked_count).

## 1. Basic rules

- Every user starts with **30 Coins** (`app_user.coins DEFAULT 30`).
- Uses: ① unlocking offline games ② betting on online matches ③ (planned) theme purchases.

## 2. Online betting

Before running quick start / create code / enter code, a **"Coin bet" window** appears
(an integer within your balance, 0 allowed). The bet amount is passed via the `bet` field of the `queue:join` / `room:create` / `room:join`
payload, and the server re-validates the balance (`INVALID_BET` if it exceeds it).

**Settlement (at match end, `server/src/match.ts` finishMatch):**

| Match type | Winner | Loser | Draw |
|---|---|---|---|
| Quick start (`quick`) | +own bet | −own bet | no change |
| Code room (`code`) | **+loser's bet** | −own bet | no change |

The settlement result rides in the `match:end` message per player: `coinDelta` (change), `coinBalance` (balance).
The match-end overlay shows "+N COIN / −N COIN · balance M".

## 3. Offline game unlock

- In screen order (= game id), **only the last 2 (No. 9 Speed Gomoku · No. 10 Tug of War) are locked**; the other 8 are open from the start.
- The 2 locked ones can be unlocked **independently, regardless of order** (login required):

| Game | Cost |
|---|---|
| No. 9 Speed Gomoku | 30 Coins |
| No. 10 Tug of War | 50 Coins |

- The DB stores only **`unlocked_count`** — a **bitmask** in `LOCKABLE_GAME_IDS` order (2 lockable targets,
  so values 0~3, no schema migration needed). Restore it with the `unlockedGameIds(mask)` helper.
- `POST /api/unlock` (auth required, body `{ gameId }`): unlocks the specified locked game — the server
  validates cost·duplicate·balance and sets the bit with a conditional UPDATE (concurrent-request safe).
  Response `{ unlockedGameId, coins, unlockedCount }`.
- Logged-out users can play the default **8 types** only, and cannot unlock.
- The random round-game selection (1~10) in online matches is **unrelated** to unlocking (an offline-only restriction).

## 4. Coin farm — solo pump mission

Bottom-right of Game Select (offline): **"⛏ Coin farm"** → `/farm`. Login required (logged-out gets the login modal).
It is a single-player mission mode condensing the U/I lane grammar of the existing Pump (Game 6). Constants source of truth: `shared/src/coins.ts`.

- **Mission**: within a **10-second** time limit (`FARM_DURATION`), reach **25 correct hits** (`FARM_TARGET`) → MISSION COMPLETE, coins awarded.
- **Failure conditions**: ① fewer than 25 points within the time → MISSION FAILED ② **one wrong key = FAILED instantly** (no reward).
- **Reward distribution** (`FARM_REWARD_TABLE`, drawn by the server — `POST /api/farm/claim`):

| Coins | 1 | 2 | 3 | 5 | 10 | 20 | 50 | 100 |
|---|---|---|---|---|---|---|---|---|
| Probability | 30% | 20% | 15% | 18% | 11% | 5% | 0.9% | 0.1% |

  Expected value **4.7 coins** (≈5), min 1 / max 100.
- Game judgment is client-computed (same trust model as roster login). The server only blocks spam calls with a **5-second cooldown per user**
  (`FARM_CLAIM_COOLDOWN_MS`) and draws the amount directly.
- Implementation: screen `client/src/screens/CoinFarm.tsx` / server `POST /api/farm/claim` (`server/src/index.ts`).

## 5. mock (no functionality yet)

- **Change Theme** (main bottom-right): theme shop modal — notepad/hockey themes each shown as 10,000 coins,
  purchase disabled (COMING SOON). `client/src/modals/ThemeShop.tsx`

## 6. API·event summary

| Location | Change |
|---|---|
| `GET /api/me` | includes `coins`, `unlockedCount` (latest DB values) |
| `POST /api/login` | `coins`, `unlockedCount` in the response |
| `POST /api/unlock` | unlock a locked game (body `{ gameId }`; 400: `INVALID_GAME`/`ALREADY_UNLOCKED`/`NOT_ENOUGH_COINS`) |
| `POST /api/farm/claim` | draw·grant farm reward (429: `COOLDOWN`) → `{ reward, coins }` |
| `queue:join` `room:create` `room:join` | add `{ bet }` + return `INVALID_BET` via ack |
| `match:end` | add `coinDelta`, `coinBalance` (sent individually per player) |

Migration: `server/prisma/migrations/20260705130654_coin_system`.
Existing users automatically become 30 coins / 0 unlocked at migration time.
