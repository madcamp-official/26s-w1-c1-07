# MADCADE API · JSON · DB Specification (v1 — based on game-lab tuning logic)

> **Source-of-truth ranking (read before anything else).** This document is a **downstream derived document** that synthesizes three drafts (the API surface · per-game JSON · DB I/O). On conflict, the higher source of truth wins.
> 1. **`docs/TECH_STACK.md`** (source of truth for stack · auth · netcode policy)
> 2. **`docs/ERD.md`** → transcribed into **`/Users/siheom-yong/programming/madpump/26s-w1-c1-07/server/prisma/schema.prisma`** (source of truth for the DB schema. Schema changes edit ERD.md first)
> 3. **game-lab game core code** (source of truth for game state · resolution logic. worktree `.../scratchpad/wt-gametest/game-lab/shared/src/games/*`)
> 4. **This document** (the transport/data contract assembled from the three above. If it disagrees with the above, the above is correct)
>
> Note on code-evidence paths: `game{1,2,3}/*.ts`, `types.ts`, `render{1,2,3}.ts`, `registry.ts`, `GameScreen.tsx`, `keyboard.ts` = based on the **game-lab worktree**. `schema.prisma` = based on the **main repo** (`/Users/siheom-yong/programming/madpump/26s-w1-c1-07/server/prisma/schema.prisma`) — it does not exist in the game-lab worktree.

---

## TL;DR (one-screen summary)

- **The transport surface is exactly 2 events, regardless of game count.** `[C→S] game:input` (unified input envelope) + `[S→C] game:state` (unified state envelope). Rationale: every game uses the same `GameCore` interface (`create`/`step`) and the same single input type `GameInputEvent` (`types.ts`). → **Adding game 4 requires 0 lines of change to the transport/server-loop code.**
- **The server is the sole authority.** `core.create(seed)` fixes the initial state → `game:input` events are collected and advanced via `core.step` → `game:state` is broadcast every tick. The client is fundamentally a **dumb renderer** (it only draws the state it receives).
- **What goes out over `game:state` is not the "full authoritative state" but a "render-projection".** The `seed` (LCG PRNG internal state), hidden stats (`p1Rate`/`p2Speed`), and internal resolution flags (`resolved`, etc.) are **never transmitted**. Reason: if you hand over the `seed`, the opponent can pre-compute the next developments (game2 bullet distribution, game3 attack-startup delay) and achieve perfect dodges/counters (cheating). render1/2/3 do not read these fields, so it is confirmed in code that **removing them is render-lossless**.
- **Input-spoofing prevention.** The P1/P2 encoding in `code` (Q/W=P1, U/I=P2) is not trusted. The server derives `role` from the socket session, **takes only the slot and rewrites the physical key to the role's own key**, then feeds it into `step`.
- **The DB does not know about live play.** Zero DB access during play. **Only when a match ends (`result≠null`) is a single `game_match` row INSERTed.** Round/tick details are not stored (ERD note #2). Mapping `GameResult('P1'/'P2'/'DRAW')` → DB `MatchResult(P1_WIN/P2_WIN/DRAW)` is mandatory. **`match:end` is broadcast only after the INSERT commit succeeds** (no fake success).

---

## Table of contents

- [Three-group user mental model ↔ section mapping](#user-map)
- [§0 Common envelope — same API + JSON state (the substance of the user's insight)](#s0)
- [§1 Auth · session · profile (group ①, REST)](#s1)
- [§2 Lobby · room · matchmaking (group ②, Socket.IO)](#s2)
- [§3 In-game — per-game JSON state schema (group ③)](#s3)
- [§4 DB I/O — when to write and read what](#s4)
- [Open questions (undecided list)](#open)
- [Implementation roadmap](#roadmap)

---

<a id="user-map"></a>
## Three-group user mental model ↔ section mapping

The user's mental model splits into three groups: **① login/logout (account) · ② game connection (room · matchmaking) · ③ game execution (input · state · resolution).** Which surface of the spec each group maps to:

| Group | User's words | Owning section | Main surface | Key artifact |
|---|---|---|---|---|
| **①** | "log in/out, my profile" | **§1** | REST `/auth/*`·`/api/*` | session cookie, `app_user` INSERT/UPDATE |
| **②** | "create/enter a room, quick start" | **§2** | Socket `lobby:*`/`room:*`/`queue:*` | in-memory rooms · queue, role (P1/P2) assignment |
| **③** | "press a key and state changes, win/lose" | **§0 + §3** | Socket `match:*`/`round:*`/`game:*` | unified envelope, per-game state JSON, server resolution |
| (cross-cutting) | (invisible to the user) | **§4** | Prisma ↔ MySQL | persistence of ③'s results + identity lookup for ① + leaderboard |

> The user's insight — "since the input keys are fixed, **unify on one API** and **send state as JSON**" — is realized directly in §0. game-lab already implements that unification with the `GameCore` + `GameInputEvent` structure.

---

<a id="s0"></a>
## §0 Common envelope — same API + JSON state (the substance of the user's insight)

### 0.1 Design principle: "unify the envelope, keep the content per-game"

Every game shares a **completely identical core interface** (`shared/src/games/types.ts:18-21`):

```ts
export interface GameCore<S extends { elapsed: number; result: GameResult }> {
  create(rand: () => number): S               // generate the authoritative initial state once from rng (fixes the seed)
  step(state: S, events: GameInputEvent[], dt: number): S   // pure · deterministic. input array + dt → next state
}
```

And the input is a **single game-agnostic event** (`types.ts:1-8`):

```ts
export type KeyCode = 'KeyQ' | 'KeyW' | 'KeyU' | 'KeyI'   // 4 fixed physical keys (P1=Q/W, P2=U/I)
export interface GameInputEvent {
  code: KeyCode              // the physical key pressed (based on e.code → independent of the Korean IME)
  type: 'down' | 'up'        // press / release
  t: number                  // elapsed seconds since game start (for sub-frame timing resolution)
}
export type GameResult = 'P1' | 'P2' | 'DRAW' | null   // win/lose (in progress = null)
export const GAME_DURATION = 10                        // fixed 10 seconds for every game
```

→ Therefore **the transport surface only needs 2 events, regardless of game count:**

| Event | Direction | Envelope | Content |
|---|---|---|---|
| **`game:input`** | **[C→S]** | `GameInputMsg` (shared) | `GameInputEvent` + correlation key `matchId` |
| **`game:state`** | **[S→C]** | `GameStateMsg` (shared) | `matchId`/`round`/`seq` + **render-projection of the per-game state** |

This unification is what yields "0 lines of transport-code change when adding a new game" (§0.6).

### 0.2 Unified input envelope `game:input`

```ts
// [C→S] game:input — shared by every game. shared GameInputEvent + just the correlation key
interface GameInputMsg {
  matchId: string       // runtime correlation key for the current match. mismatch with sender's match → game:reject
  code: KeyCode         // 'KeyQ'|'KeyW'|'KeyU'|'KeyI'. ※the server rewrites it by role (below) — not trusted
  type: 'down' | 'up'   // key press/release (same meaning as game-lab keyboard.ts: ignore e.repeat, on blur send up for all held)
  t: number             // client-reported elapsed seconds (relative to match:go t=0). server clamps to the tick window
}
```

**Anti-cheat = the server rewrites the side of `code`.** In the code, `code` is effectively the player's identity (`step` branches `KeyQ/KeyW→P1`, `KeyU/KeyI→P2`; game1 `logic.ts:121-138`, game2 `logic.ts:105-110`, game3 `core.ts:209-212`). If believed as-is, a P2 client could send `KeyQ` to **control its opponent (P1)**. So the server derives `role` from the socket session and **takes only the slot, overwriting the physical key with the role's own:**

| `code` the client sent | Slot (meaning) | if sender=P1 → | if sender=P2 → |
|---|---|---|---|
| `KeyQ` or `KeyU` | action A | `KeyQ` | `KeyU` |
| `KeyW` or `KeyI` | action B | `KeyW` | `KeyI` |

Per-game meaning of the slots (for reference):

| Slot | Game 1 (`game1/logic.ts`) | Game 2 (`game2/logic.ts`) | Game 3 (`game3/core.ts`) |
|---|---|---|---|
| **A** (P1=Q / P2=U) | number − direction (`p1Down`) | launcher direction flip / P2 move left | attack (`tryAttack`) |
| **B** (P1=W / P2=I) | number + direction (`p1Up`) | 3-way fire / P2 move right | dodge (`tryDodge`) |

> The client sends its two local keys as slots A/B (recommended: transmit canonically as Q/W). **Invariant: the client's sent `code` does not determine P1/P2.** The client-local key-binding/remapping UI is **(undecided)** — as long as the server rewrite rule is fixed, it is safe.

**Trust range of `t` — the server clamps it.** The server does not blindly trust `t`; it clamps to the current tick window `[t0, now]`. Evidence (measured in code): `game3/core.ts:208` `const t = Math.min(Math.max(e.t, t0), now)`. A forged `t` at most gets placed somewhere within the current tick (limited to sub-frame ordering distortion). game1/game2 do not consume `t`, so no effect. → Adopt "clamp the client `t`" (the code behavior) as the v1 default. Whether to fully recompute `t` from the server arrival time is **(undecided)**.

Invalid-input notification:
```jsonc
// [S→C] game:reject
{ "matchId":"m_9f3a2c",
  "reason": "NOT_YOUR_MATCH" | "STALE_MATCH" | "NOT_PLAYING" | "BAD_KEY" | "AFTER_END" }
```
> Input is loss-tolerant (dropped = one tick missed → the next `game:state` self-heals). Reliable retransmit / input `seq` is not enforced in v1 — if needed, add `seq:number` to `game:input` **(undecided)**.

### 0.3 Unified state envelope `game:state` (★ render-projection, not full state)

```ts
// [S→C] game:state — shared by every game. only the state content is per-game
interface GameStateMsg {
  matchId: string      // runtime correlation key
  round: number        // current round (1-based)
  seq: number          // broadcast sequence number (for ordering guarantee · dedup, monotonically increasing on the server)
  state: G1View | G2View | G3View   // ★ not the full authoritative state, but a projection of "only the fields the renderer reads"
}
```
> The client already received `gameId` in `match:start`, so it does not re-embed the game kind in every-tick envelope (the actual type of `state` is determined by that match's `gameId`).

**Two-layer state model (the premise of this document).** Inside the server there is the **full authoritative state** (`Game1State`/`Game2State`/`Game3State`) as-is, and what goes out to the client is the **projection (`G*View`) of only the fields the renderer actually consumes** from it. The two are different things.

| Layer | Definition | Owner | Exposure |
|---|---|---|---|
| **Full authoritative state** | the original TS object that `core.create/step` handles. includes all of `seed`·`rate`·`resolved` | server-only (in-memory) | **never transmitted** |
| **Render-projection `G*View`** | a subset that `Pick`s only the render-consumed fields from the above | server generates it every tick | broadcast as `game:state.state` |

The one-line judgment (global fallback principle): **"Don't send fields the client doesn't use to draw."** This is both bandwidth savings and cheat prevention. Since it was **confirmed in code** that `render{1,2,3}.ts` do **not read** `seed`/`rate`/`resolved` (§3 for each game), the projection is **render-lossless**, and the dumb-render · server-authority model is preserved.

> **Type safety.** Define `G*View = Pick<Game*State, ...>` and type the renderer against `G*View` (the fields the current renderer reads are exactly the View), so even passing the full state (superset) is assignable to the View parameter — offline and online share the same renderer.

**Full-snapshot transmission (not deltas).** At 2-player scale, deltas are unnecessary. Per-game detail strategy is in §3.5.

### 0.4 Group ③ match · round lifecycle

```jsonc
// [S→C] match:start  (sent individually to each player — since role differs)
{ "matchId":"m_9f3a2c", "gameId":3, "role":"P1",
  "totalRounds":1,                                   // room setting. default 1 (multi-round is (undecided))
  "opponent": { "nickname":"opponent", "imageUrl":"…" } }

// [C→S] match:loaded  { matchId }                   // canvas · assets ready (both wait)
// [S→C] match:go      { matchId, startAt }          // startAt=server clock t=0. subsequent game:input.t is relative to this

// [S→C] round:start  { matchId, round }             // server fixes the authoritative initial state via core.create(serverRng) (seed fixed)
// [S→C] game:state   { … }  ← broadcast every tick (§0.5 frequency)
// [S→C] round:end    { matchId, round, result, wins }
//        result: 'P1'|'P2'|'DRAW' (raw GameResult) · wins:{P1,P2} cumulative round win counts

// [S→C] match:end   (only after the INSERT commit succeeds — §4.4)
{ "matchId":"m_9f3a2c",
  "gameId":3,
  "result":"P1",                    // final GameResult('P1'|'P2'|'DRAW', null not allowed)
  "wins": { "P1":1, "P2":0 },
  "players": { "p1": { "userId":"88", "nickname":"yong" },
               "p2": { "userId":"91", "nickname":"lee"  } },
  "recordedMatchId":"88123",        // game_match.id (exists only after the INSERT commit). the sole key to re-query the result
  "playedAt":"2026-07-04T05:12:33.000Z" }

// [S→C] match:aborted { matchId, reason:"OPPONENT_LEFT"|"OPPONENT_DISCONNECT" }
// [S→C] match:error   { matchId, code:"RESULT_PERSIST_FAILED" }   // INSERT failed (no fake success)
```

> **Correlation-key convention (consistent across the whole document).** `matchId` = server in-memory match runtime id (string, e.g. `"m_9f3a2c"`, **not stored in DB**) · `recordedMatchId` = `game_match.id` (BigInt→string, exists **only after the match-end INSERT commit**).
> **Note on rounds.** `totalRounds>1` (best-of-N) is a server-orchestration concept and does not exist in the game-lab core (the core is one 10-second bout → a single `GameResult`). v1 default is `totalRounds=1`. Multi-round aggregation and game2 role-swap policy are **(undecided, §2.4)**. **In any case, the DB keeps only a single final-match-result row** (ERD note #2).

### 0.5 Tick / synchronization model

**Server-authoritative step loop** = the game-lab offline loop (`client/src/ui/GameScreen.tsx:48-60`) moved to the server:
```
round:start → state = core.create(serverRng)          // fix the seed (authoritative)
each tick: dt = min((now - last)/1000, 0.05)          // dt cap 0.05 — GameScreen.tsx:50 literal
       state = core.step(state, drainedInputs, dt)      // consume the game:input collected this tick (rewrite done)
       broadcast game:state { project(state) }          // ★ send the projection (excluding seed etc.)
       if (state.result) → round:end                    // GAME_DURATION=10 end or instant-win condition
```

| Game | create randomness | step randomness | server tick/broadcast | client render | evidence |
|---|---|---|---|---|---|
| Game 1 | target · start value · rate | none (fully deterministic) | low OK (≈20Hz) | dumb render | `game1/logic.ts` (no rng in step) |
| Game 2 | dir · p2Speed · seed | fire speed/jitter from seed | **needs to be high (20–30Hz)** | dumb render + optional interpolation | `game2/logic.ts:111-117` (nextRand in fire branch) |
| Game 3 | seed | startup delay · dodge style from seed | **needs to be high (≥30Hz)** — `ATTACK_DURATION` 0.06s / `DODGE_DURATION` 0.1s window resolution | dumb render | `game3/core.ts:190,200-202` (draw) |

- Every game uses **the same envelope · the same loop code**; only the frequency differs.
- `GAME_DURATION=10` (`types.ts:12`) constant → v1 fixes every game at 10 seconds. The host's "round-time setting" conflicts with the core constant → **(undecided)**.
- **The `docs/TECH_STACK.md` description of game3 as "1-second-tick rock-paper-scissors" disagrees with the adopted code.** The adopted game-lab code is **continuous step + sub-frame `t`** (0.06s attack window), incompatible with a 1-second tick. Since the code is authoritative, adopt **continuous high-frequency ticks** and mark the 1-second-tick description for removal → **(undecided, planning reconciliation)**.

### 0.6 How the unified envelope makes "adding a new game" reusable

When attaching a new game `game4`:

| Layer | Needed for a new game? | Reason |
|---|---|---|
| `game:input` envelope | ✅ reuse | input is only `GameInputEvent` — game-agnostic |
| server input rewrite (§0.2) | ✅ reuse | slot A/B → role mapping is game-independent |
| server step loop (§0.5) | ✅ reuse | `core.step(state, events, dt)` signature is fixed (`GameCore`) |
| `game:state` envelope | ✅ reuse | transparently passes the projection, only add the `G4View` type |
| match/round lifecycle | ✅ reuse | the result is the common `GameResult` |
| **implement new** | ⛳ one `GameCore` in `shared/` | pure `create`/`step` logic |
| **implement new** | ⛳ one client renderer | `render4(ctx, state, w, h)` — **4 args** (`registry.ts:15` `GameDef.render` contract, `w=CANVAS_W=800`, `h=CANVAS_H=450`) |
| **implement new** | ⛳ one registry line + one projection function | `GAMES['4']={…}`, `projectG4(state)→G4View` |

→ **0 lines of transport-code change.** This is the actual benefit of the user's insight, and the evidence is that game-lab already implements it with that structure.

---

<a id="s1"></a>
## §1 Auth · session · profile (group ①, REST)

### 1.1 Namespace · cookie convention

| Category | Convention |
|---|---|
| REST paths | `/auth/*` = browser top-level navigation only (OAuth 302 round trip) · `/api/*` = everything else (XHR/fetch, JSON) |
| Auth | an **opaque cookie** carrying a server session-store key (no JWT, `TECH_STACK.md`). The user/admin cookie names differ so simultaneous login is possible |

| Cookie | Value | Attributes |
|---|---|---|
| `mp_session` | user session id (opaque) | `HttpOnly; Secure(prod); SameSite=Lax; Path=/; Max-Age=<session lifetime>` |
| `mp_admin` | admin session id (independent of user) | `HttpOnly; Secure(prod); SameSite=Lax; Path=/` |
| `mp_oauth_state` | temporary OAuth state+PKCE | `HttpOnly; Secure(prod); SameSite=Lax; Max-Age=600; Path=/auth` |

Reason for `SameSite=Lax`: the Google callback is a top-level GET, so with `Lax` the cookie is sent along (with `Strict` it would be lost), while it is not sent on a cross-site fetch POST — a first-line CSRF defense. State-changing REST (`POST/PATCH/DELETE`) + the socket handshake additionally validate an `Origin`/`Host` whitelist.

**Error convention (REST synchronous failure)** — HTTP status + body `{ "error": { "code":"STRING_CODE", "message":"human-readable" } }`:

| Status | example code | situation |
|---|---|---|
| 400 | `VALIDATION` | missing field / malformed |
| 401 | `UNAUTHENTICATED` | no session / expired |
| 403 | `CSRF`/`FORBIDDEN` | Origin mismatch / no permission |
| 404 | `NOT_FOUND` | resource / room code not found |
| 409 | `ALREADY_ONBOARDED`/`NICKNAME_TAKEN` | state · unique conflict (`nickname` UNIQUE, `schema.prisma:45`) |
| 413/415 | `IMAGE_TOO_LARGE`/`UNSUPPORTED_MEDIA` | upload size / MIME |
| 429 | `RATE_LIMITED` | abuse prevention |
| 502 | `OAUTH_UPSTREAM` | Google token exchange failed |

### 1.2 Endpoints

**`GET /auth/google/login`** — start OAuth
```
(browser top-level, no body)
→ 302 Location: https://accounts.google.com/o/oauth2/v2/auth?client_id=..&redirect_uri=..
        &response_type=code&scope=openid%20email%20profile&state=<rand>&code_challenge=<pkce>&code_challenge_method=S256
   Set-Cookie: mp_oauth_state=<rand>; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/auth
```

**`GET /auth/google/callback`** — code exchange · session issuance
```
[GET /auth/google/callback?code=<auth_code>&state=<rand>]  Cookie: mp_oauth_state=<rand>
→ (validate state → exchange code→token → obtain Google profile)
   new (no app_user): keep the Google profile in the session (PENDING_ONBOARDING), 302 → /onboarding
   existing user: issue mp_session, 302 → /
   Set-Cookie: mp_oauth_state=; Max-Age=0; Path=/auth
errors: state mismatch → 403 CSRF · token exchange failed → 502 OAUTH_UPSTREAM
```
> **When `app_user` is created.** Since `nickname` is NOT NULL+UNIQUE (`schema.prisma:45`), there is no confirmed nickname at callback time, so INSERTing immediately is awkward. The implementation choice is left to §4.6: (a) keep the Google profile in a `PENDING_ONBOARDING` session and **INSERT on onboarding submit**, or (b) INSERT at callback with a temporary nickname and UPDATE during onboarding. **The exact choice is (undecided)** — either way it is a 2-step "signup=INSERT / nickname-fix=write".

**`GET /api/me`** — current session state (always 200)
```jsonc
{ "status": "ANON" | "PENDING_ONBOARDING" | "USER",  // the server determines this from the session
  "user": {                                          // only when status=USER
    "id": "1024",                                    // app_user.id (BigInt→string)
    "nickname": "Jonghyeok",                         // app_user.nickname (UNIQUE)
    "email": "forgotmypasswrd044@gmail.com",         // app_user.email
    "imageUrl": "https://cdn../pfp/abc.webp",        // uploaded_image_key→R2 URL, else google_image_url
    "hasUploadedImage": true,                        // uploaded_image_key != null
    "group": { "id": "3", "name": "Class 1" } | null // group_id join (nullable)
  } | null }
```

**`GET /api/groups`** — class list (public): `{ "groups": [ { "id":"3", "name":"Class 1", "isPublic":true } ] }`

**`POST /api/onboarding`** — submit nickname + class
```jsonc
// request
{ "nickname": "Jonghyeok",   // required, 1–50 chars (VarChar(50) UNIQUE)
  "groupId": "3" }           // optional (nullable). unaffiliated allowed
// 200 → same { status:"USER", user } as GET /api/me
// errors: 409 NICKNAME_TAKEN · 409 ALREADY_ONBOARDED · 400 VALIDATION · 404 NOT_FOUND(groupId)
```

**`PATCH /api/me`** — change nickname `{ "nickname":"newnick" }` → 200 me. Conflict 409 `NICKNAME_TAKEN`.

**`POST /api/me/profile-image`** (multipart, field `image`)
```
server: resize to 256² webp with sharp + strip EXIF → R2 PUT → update app_user.uploaded_image_key
→ 200 { "imageKey":"pfp/1024_abc.webp",  // R2 object key (value stored in DB)
        "imageUrl":"https://cdn../pfp/1024_abc.webp" }
errors: 413 IMAGE_TOO_LARGE · 415 UNSUPPORTED_MEDIA · 401 UNAUTHENTICATED
```
> The original bytes live **only in R2**, and the DB holds **only the key** (`uploaded_image_key`, `schema.prisma:47`). The client receives only the URL.

**`DELETE /api/me/profile-image`** → `uploaded_image_key=null` → thereafter use `google_image_url` → 200 me.

**`POST /api/auth/logout`** → 200 `{}` + `Set-Cookie: mp_session=; Max-Age=0; Path=/`

**`POST /api/admin/login` / `POST /api/admin/logout`** (independent of the user)
```jsonc
// [POST /api/admin/login]  { "loginId":"root", "password":"…" }  → admin_account.login_id / bcrypt(pw_hash)
// 200 {} + Set-Cookie: mp_admin=<sid>; HttpOnly; Secure; SameSite=Lax; Path=/
// error: 401 BAD_CREDENTIALS
```

**Reconnect (v1).** No recovery. If the socket drops, an in-progress match is ended after notifying the opponent with `match:aborted` (`TECH_STACK.md` §4.3). The in-memory room/match is lost.

---

<a id="s2"></a>
## §2 Lobby · room · matchmaking (group ②, Socket.IO)

### 2.1 Handshake auth & socket error convention

The socket authenticates with the **same cookie** as REST. The `io` middleware validates the handshake's `mp_session`:
- `USER` session → allow the connection, inject `socket.data.userId`/`nickname`.
- `ANON`/`PENDING` → `connect_error` (payload `{ code:'UNAUTHENTICATED' }`).
- Fix the `io` server's `cors.origin` to the allowed domain, `credentials:true`. Client `io(url,{withCredentials:true})`.

**Socket synchronous failure** = returned via the Socket.IO **ack callback** (request-style `room:*`/`queue:*`):
```ts
type Ack<T> = { ok: true; data: T } | { ok: false; code: string; message: string }
// e.g.) socket.emit('room:join', { code }, (ack: Ack<RoomSnapshot>) => { ... })
```
**Socket asynchronous failure** (a change I did not trigger) = push: lobby `lobby:error`, in-game invalid input `game:reject`, match abort `match:aborted`, persist failure `match:error`.

Immediately on successful connection:
```jsonc
// [S→C] lobby:hello
{ "me": { "id":"1024", "nickname":"Jonghyeok", "imageUrl":"…" }, "reconnect": false }  // v1 always false
```

### 2.2 Room in-memory object (server-owned, not stored in DB)

```ts
type Role = 'P1' | 'P2'
type RoomStatus = 'waiting' | 'in_match'

interface RoomMember {
  userId: string        // app_user.id
  nickname: string      // display cache
  socketId: string      // current socket (not included in RoomSnapshot)
  role: Role            // role assignment (§2.4)
  ready: boolean        // room:ready toggle
}
interface RoomConfig {
  gameId: 1 | 2 | 3     // Game.id (schema: fixed TinyInt)
  rounds: number        // host setting. v1 default 1 (multi-round is (undecided))
  // roundSeconds is ignored in v1 — the core uses the GAME_DURATION=10 constant → (undecided)
}
interface Room {
  code: string          // server-issued numeric string = Socket.IO room key
  hostUserId: string    // host (settings · start permission)
  status: RoomStatus
  config: RoomConfig
  members: RoomMember[]  // max 2
  matchId?: string       // runtime correlation key of the current match when status=in_match
}
```

### 2.3 Code-room events (request-style returns an ack)

```ts
// [C→S] room:create   { gameId, rounds? }  → ack Ack<RoomSnapshot>   creator=host=P1 (default)
// [C→S] room:join     { code }             → ack Ack<RoomSnapshot> | {ok:false, code:'ROOM_FULL'|'NOT_FOUND'}
// [C→S] room:configure{ gameId?, rounds? } → host only. broadcast room:state after change
// [C→S] room:ready    { ready:boolean }     → toggle my ready
// [C→S] room:start                          → host only. when 2 players & both ready, start the match (§0.4)
// [C→S] room:leave                          → leave. room:state to the remaining 1 / match:aborted if in progress
```
```jsonc
// [S→C] room:state  (broadcast on every room change = single source of truth. same structure as RoomSnapshot minus socketId)
{ "code": "48213", "status": "waiting", "hostUserId": "1024",
  "config": { "gameId": 3, "rounds": 1 },
  "members": [
    { "userId":"1024", "nickname":"Jonghyeok", "role":"P1", "ready":true },
    { "userId":"2048", "nickname":"opponent", "role":"P2", "ready":false }
  ] }
```

**`GET /api/rooms/:code`** (optional) — pre-validate a code before entering. 404 `NOT_FOUND` / 200 `{ code, status, config, memberCount }`.

### 2.4 P1/P2 role-assignment rule (important because of game2's asymmetry)

Game 2 is fully asymmetric with **P1=shooter (attack), P2=dodger (HP 3)** (`game2/logic.ts`). Games 1/3 are symmetric.
- **Default:** host=P1, joiner=P2 (matches the code notation P1=Q/W, P2=U/I).
- **Game 2 fairness (proposal):** if the match has multiple rounds, swap roles each round and aggregate the final by "role-independent win count". **The exact swap policy is (undecided).**
- The assigned `role` exists only in server memory and cannot be forged by the client during in-game input (§0.2 rewrite).
- **Invariant:** the role assigned at matchmaking = the DB column. **P1=`player1_id`, P2=`player2_id`.** This correspondence does not flip up until the terminal INSERT (§4.3).

### 2.5 Quick-start queue

```ts
// [C→S] queue:join   { gameId }   → push onto the server in-memory queue
// [C→S] queue:leave
// [S→C] queue:waiting { position }                    // waiting (optional position)
// [S→C] queue:matched { roomCode, role, opponent }    // 2 players of the same gameId matched → auto-create room → soon match:start
```
> The queue is also **per-game** (a room is created once 2 players of the same `gameId` fill it). The subsequent flow joins via `match:start`, identical to a code room.

---

<a id="s3"></a>
## §3 In-game — per-game JSON state schema (group ③)

> The event uses §0's `game:state` (the projected `state`) as-is. Below precisely specifies each game's **full authoritative state (code original)** and the **transmitted projection (`G*View`)** · **non-transmitted fields · reasons** within it.
> The "S→C transmit?" column was filled by confirming in code the fields `render{1,2,3}.ts` actually read (non-transmitted = not render-consumed + prevents cheating/information advantage).

### 3.1 Game 1 — `Game1State` (Number Guess · cumulative speed gauge)

`game1/logic.ts`. **No `seed` — rand is used only in `create` → step is fully deterministic.** The only hidden randomness is `p1Rate/p2Rate` (42–88).

```ts
// game1/logic.ts:36-53 (original)
export interface Game1State {
  target: number            // target to hit, 1–1000
  p1: number; p2: number    // current number (real)
  p1Rate: number; p2Rate: number     // base speed (42–88, create random) — hidden
  p1Down: boolean; p1Up: boolean; p2Down: boolean; p2Up: boolean  // key hold
  p1Gauge: number; p2Gauge: number   // speed gauge 0–100, cumulative (keydown +30%p, always sqrt decay)
  p1Hold: number; p2Hold: number     // cumulative hold-target-still time after releasing (seconds), ≥1=win
  elapsed: number; result: GameResult
}
```

| Field | Type | Meaning | render/resolution | S→C transmit? |
|---|---|---|---|---|
| `target` | number(1–1000) | target to hit | render+resolution | ✅ |
| `p1`/`p2` | number(1–1000) | current number (render uses `Math.round`) | render+resolution | ✅ |
| `p1Rate`/`p2Rate` | number(42–88) | speed at 30%p gauge (`speed=rate×gauge/30`). `create` random | **resolution only** (render1 does not consume) | ❌ hidden |
| `p1Down`/`p1Up`/`p2Down`/`p2Up` | boolean | direction hold (Q−/W+, U−/I+) | **resolution only** (render1 does not consume) | ❌ |
| `p1Gauge`/`p2Gauge` | number(0–100) | speed gauge cumulative | render (bar)+resolution | ✅ |
| `p1Hold`/`p2Hold` | number(seconds) | still-hold cumulative. `≥1` instant win | render (HOLD bar)+resolution | ✅ |
| `elapsed` | number(seconds) | elapsed. proximity check at `≥10` end | render+resolution | ✅ |
| `result` | GameResult | final win/lose | resolution | ✅ |

**Projection `G1View`** = `Pick<Game1State, 'target'|'p1'|'p2'|'p1Gauge'|'p2Gauge'|'p1Hold'|'p2Hold'|'elapsed'|'result'>` (9 fields). It was confirmed in code that `render1.ts` does not read `rate/down/up` → removal is lossless.

```jsonc
// [S→C] game:state (game 1)
{ "matchId":"m_9f3a2c", "round":1, "seq":148,
  "state": { "target":617, "p1":403, "p2":588,   // p1/p2 rounded to integers (the render rounds anyway)
             "p1Gauge":84, "p2Gauge":13, "p1Hold":0, "p2Hold":0.34,
             "elapsed":6.20, "result":null } }
```
Size ≈ 150–200 B/snapshot. At 20–30Hz that's 4–6 KB/s. **A full snapshot is sufficient** (a delta is overhead instead).

### 3.2 Game 2 — `Game2State` + `Bullet[]` (Rocket dodge · asymmetric HP)

`game2/logic.ts`. `create` draws a `seed` (uint32) (`:92`), and in `step`'s W fire branch it draws bullet speed/jitter with the built-in LCG `nextRand(seed)` and updates `seed` (`:111-117`). Logical canvas is **800×450**.

```ts
// game2/logic.ts:37-59 (original)
export interface Bullet { x:number; y:number; vx:number; vy:number; bounces:number }
export interface Game2State {
  elapsed:number; result:GameResult
  launcherX:number; launcherDir:1|-1      // P1 launcher (left/right scan, Q=direction flip)
  p2Speed:number                          // P2 move speed (create random 1380–1760) — hidden
  p2X:number; leftHeld:boolean; rightHeld:boolean   // U/I hold movement
  rockets:Bullet[]; cooldown:number       // W 3-way fan (cooldown 0.25s), side-wall single bounce
  seed:number                             // LCG PRNG internal state — ★not transmitted
  hp:number; iframes:number               // P2 health 3 / on hit invulnerable 0.45s
}
```

| Field | Type | Meaning | render/resolution | S→C transmit? |
|---|---|---|---|---|
| `elapsed` | number(seconds) | elapsed. `≥10` → P2 survival win | render+resolution | ✅ |
| `result` | GameResult | HP 0→`'P1'`, survive 10s→`'P2'` | resolution | ✅ |
| `launcherX` | number(px) | launcher x (scan) | render+resolution | ✅ |
| `launcherDir` | `1\|-1` | scan direction (Q flip) | render+resolution | ✅ |
| `p2Speed` | number(1380–1760) | P2 move speed. `create` random | **resolution only** (render2 does not consume) | ❌ hidden |
| `p2X` | number(px) | P2 position | render+resolution | ✅ |
| `leftHeld`/`rightHeld` | boolean | U/I hold | **resolution only** (render2 does not consume) | ❌ |
| `rockets` | `Bullet[]` | fired rockets | render+resolution | ✅ (partial) |
| `cooldown` | number(seconds) | remaining fire cooldown (0=can fire) | render (cooldown bar)+resolution | ✅ |
| `seed` | number(uint32) | **LCG PRNG internal state** | **resolution only** | ❌ **★not transmitted** |
| `hp` | number(0–3) | P2 health | render (hearts)+resolution | ✅ |
| `iframes` | number(seconds) | invuln remaining (on hit 0.45s) | render (blink)+resolution | ✅ |

**`Bullet` per field:**

| Field | Type | Meaning | render/resolution | transmit? |
|---|---|---|---|---|
| `x`/`y` | number(px) | bullet position | render+resolution | ✅ |
| `vx`/`vy` | number(px/s) | velocity. render computes the rocket rotation angle via `atan2(vy,vx)` (`render2.ts:63`) | render (angle)+resolution (movement) | ✅ |
| `bounces` | number(≤`MAX_BOUNCE`=1) | side-wall bounce count | **resolution only** (render2 does not consume) | ❌ not transmitted |

**`seed` never transmitted (cheating).** If the opponent client knows the seed, it can run `nextRand` itself to **pre-compute the speed · fan distribution of bullets not yet fired** and dodge perfectly. Resolution is done solely by the server holding the seed.

**Projection `G2View`** — remove `seed/p2Speed/leftHeld/rightHeld`, and `rockets` keeps only `{x,y,vx,vy}` (drop `bounces`):

```jsonc
// [S→C] game:state (game 2)
{ "matchId":"m_9f3a2c", "round":1, "seq":84,
  "state": { "elapsed":4.10, "result":null,
             "launcherX":512, "launcherDir":-1, "p2X":301,
             "rockets":[ {"x":211,"y":180,"vx":-120,"vy":690},
                         {"x":540,"y":96,"vx":260,"vy":641} ],
             "cooldown":0.12, "hp":2, "iframes":0.31 } }
```
Size (game2 is the largest): fire cooldown 0.25s → at most 12 shots/second, dwell ~0.6–0.75s → typically **9–18 concurrent** → with integer rounding **about 0.8–1.1 KB/snapshot**, at 20–30Hz 16–33 KB/s.

### 3.3 Game 3 — `Game3State` + `FencerState` + `feed[]` (Fencing · surge knockback)

`game3/core.ts` (factory `makeGame3`) + `game3/logic.ts` (config). `create` secures a `seed` (`:149`), then draws startup delay · dodge style with an LCG. No visual coordinates — position is the normalized `c` (`EDGE`·`HALF_GAP`). `+c` = P1 advantage.

```ts
// game3/core.ts:61-111 (original)
type DodgeStyle = 'lean'|'waist'|'split'
interface AttackWindow { press:number; start:number; end:number; resolved:boolean; riposte?:boolean }
interface DodgeWindow  { start:number; end:number; resolved:boolean; style:DodgeStyle }
interface G3FeedEvent  { kind:'hit'|'parry'|'whiff'; victim:'P1'|'P2'; t:number; mult?:number }
interface FencerState {
  attacks:AttackWindow[]; dodges:DodgeWindow[]
  attackCdUntil:number; dodgeCdUntil:number
  riposteUntil:number; combo:number
}
export interface Game3State {
  elapsed:number; result:GameResult
  c:number                 // position balance (-EDGE~+EDGE approx)
  p1:FencerState; p2:FencerState
  feed:G3FeedEvent[]       // presentation events (hit/parry/whiff, disappear after 1.2s)
  seed:number              // LCG PRNG — ★not transmitted (core.ts:108)
  waterLevel:number        // rising-tide height flood (for render)
}
```

**`Game3State` per field:**

| Field | Type | Meaning | render/resolution | transmit? |
|---|---|---|---|---|
| `elapsed` | number(seconds) | elapsed (the render's "now" basis) | render+resolution | ✅ |
| `result` | GameResult | resolved by the sign of `c` on fall-out / 10s end | resolution | ✅ |
| `c` | number | position balance. **The fencer's actual position = `c ± HALF_GAP` (P1=`c−0.06`, P2=`c+0.06`), and when this position exceeds `effEdge` that fencer falls out.** P1 falls out (→P2 win): `c−HALF_GAP < −effEdge`, P2 falls out (→P1 win): `c+HALF_GAP > effEdge` (`core.ts:281-288`). The two thresholds differ. `effEdge` shrinks over time with the rising tide. The range is `±EDGE` approx (`\|c\|` may slightly exceed EDGE on the step just before fall-out) | render (fencer x)+resolution | ✅ |
| `p1`/`p2` | `FencerState` | fencer state | render+resolution | ✅ (partial) |
| `feed` | `G3FeedEvent[]` | recent-resolution presentation (disappear after 1.2s) | **render only** | ✅ |
| `seed` | number(uint32) | **LCG PRNG internal state** | resolution only | ❌ **★not transmitted** |
| `waterLevel` | number | rising-tide height `flood` (=`EDGE−effEdge`). render draws the sea · fall-out warning line | **render only** | ✅ |

**`FencerState` per field:**

| Field | Type | Meaning | render/resolution | transmit? |
|---|---|---|---|---|
| `attacks` | `AttackWindow[]` | in-progress/recent attack windows | render+resolution | ✅ (partial) |
| `dodges` | `DodgeWindow[]` | in-progress/recent dodge windows | render+resolution | ✅ (partial) |
| `attackCdUntil` | number(seconds) | **absolute game time** when the attack cooldown lifts (`now≥value` = ready) | render (cooldown chip)+resolution | ✅ |
| `dodgeCdUntil` | number(seconds) | absolute time when the dodge cooldown lifts | render (cooldown chip)+resolution | ✅ |
| `riposteUntil` | number(seconds) | absolute deadline of the riposte (instant counter) window (`>now` = open) | render (gold ring, `render3.ts:152`)+resolution | ✅ |
| `combo` | number(0–`COMBO_MAX`) | consecutive-parry combo level | render+resolution | ✅ |

**`AttackWindow`/`DodgeWindow`/`G3FeedEvent`:**

| Field | Type | Meaning | render/resolution | transmit? |
|---|---|---|---|---|
| `AttackWindow.press` | number(seconds) | time the button was pressed → windup progress | render+resolution | ✅ |
| `AttackWindow.start` | number(seconds) | resolution start (=press+startup delay `STARTUP` 0.04–0.18) | render+resolution | ✅ |
| `AttackWindow.end` | number(seconds) | resolution end (start+`ATTACK_DURATION` 0.06) | render+resolution | ✅ |
| `AttackWindow.resolved` | boolean | resolution-processed flag | **resolution only** | ❌ |
| `AttackWindow.riposte?` | boolean | whether riposte fired (for knockback multiplier) | **resolution only** | ❌ |
| `DodgeWindow.start` | number(seconds) | dodge start → dodgePose | render+resolution | ✅ |
| `DodgeWindow.end` | number(seconds) | dodge end (end of invuln window, +`DODGE_DURATION` 0.1) | render+resolution | ✅ |
| `DodgeWindow.resolved` | boolean | resolution-processed flag | **resolution only** | ❌ |
| `DodgeWindow.style` | `'lean'\|'waist'\|'split'` | dodge motion. **irrelevant to resolution, purely visual** | **render only** | ✅ |
| `G3FeedEvent.kind` | `'hit'\|'parry'\|'whiff'` | presentation label | render only | ✅ |
| `G3FeedEvent.victim` | `'P1'\|'P2'` | target (position · color) | render only | ✅ |
| `G3FeedEvent.t` | number(seconds) | occurrence time (=now). fade `age=elapsed−t` | render only | ✅ |
| `G3FeedEvent.mult?` | number | knockback multiplier. **on a `hit` event, if `mult>1.01`, orange (`#ff8a3d`) · enlarged emphasis (`render3.ts:97-100`). `parry`/`whiff` also carry `mult` (the core always includes `surge`, `core.ts:220`) but it is not reflected in color/size emphasis** | render only | ✅ |

**`seed` never transmitted (cheating).** If the seed leaks, the opponent's next attack-startup delay (which of 0.04–0.18) can be pre-computed to perfect parry timing. `resolved`/`riposte` are not render-consumed + not transmitted to minimize leaking developmental info.

**`feed` is included in `game:state` (not a separate event).** It is a short presentation that auto-disappears after 1.2s and the renderer reads the whole `s.feed` each frame. Putting it in the snapshot makes it **self-contained**, so even if one packet is lost the next snapshot self-heals. Since there are usually 0–4 events, the duplication cost is negligible.

**Projection `G3View`** — remove `seed`, attack-window `resolved/riposte`, dodge-window `resolved`:

```jsonc
// [S→C] game:state (game 3)
{ "matchId":"m_9f3a2c", "round":1, "seq":210,
  "state": {
    "elapsed":7.35, "result":null, "c":0.184, "waterLevel":0.221,
    "p1": { "attacks":[ {"press":7.10,"start":7.19,"end":7.25} ],
            "dodges":[ {"start":7.30,"end":7.40,"style":"waist"} ],
            "attackCdUntil":7.28, "dodgeCdUntil":7.44, "riposteUntil":0, "combo":1 },
    "p2": { "attacks":[], "dodges":[],
            "attackCdUntil":7.05, "dodgeCdUntil":6.90, "riposteUntil":0, "combo":0 },
    "feed":[ {"kind":"parry","victim":"P2","t":7.25,"mult":1.3} ] } }
```
Size: the arrays are pruned by `end>now−0.5` (`core.ts:273-276`), feed keeps only `<1.2s` (`:279`) → **about 500–900 B/snapshot**.
> `attackCdUntil` etc. are **absolute game time**, so the client takes its own snapshot's `elapsed` as "now" and compares directly (no offset recomputation needed). `c` is only meaningful to 3–4 decimal places.

### 3.4 Non-transmitted field rule (invariant) & per-game summary table

1. **`seed` · all rng internal state** → never transmitted (predictive cheating). game2/game3 `seed`.
2. **Hidden random stats** → not transmitted (block information advantage). game1 `p1Rate/p2Rate`, game2 `p2Speed`.
3. **Non-render-consumed resolution internal flags · input state** → not transmitted (minimize bandwidth · leakage). game1 `p*Down/p*Up`, game2 `leftHeld/rightHeld/Bullet.bounces`, game3 `resolved/riposte`.
4. **Wire rounding allowed** → render-only numbers such as position/gauge are rounded to integers/a few decimals (dumb render means no meaning distortion = good fallback). **But the server authoritative state keeps full precision.**

| Game | ✅ send (render-consumed) | ❌ don't send (authoritative/cheat-prevention) |
|---|---|---|
| **1** | `target, p1, p2, p1Gauge, p2Gauge, p1Hold, p2Hold, elapsed, result` | `p1Rate, p2Rate`, `p1Down/p1Up/p2Down/p2Up` |
| **2** | `launcherX, launcherDir, p2X, rockets[{x,y,vx,vy}], cooldown, hp, iframes, elapsed, result` | **`seed`**, `p2Speed`, `leftHeld/rightHeld`, `Bullet.bounces` |
| **3** | `c, waterLevel, p1/p2{attacks[{press,start,end}], dodges[{start,end,style}], attackCdUntil, dodgeCdUntil, riposteUntil, combo}, feed[], elapsed, result` | **`seed`**, `AttackWindow.resolved/riposte`, `DodgeWindow.resolved` |

The principle in one line: **"Send down only what is used to draw, and cage the seed/stats/internal flags used for resolution on the server."**

### 3.5 Full/delta transmission strategy (per-game summary)

| Game | State size | Variable arrays | Recommended transmission | Rationale |
|---|---|---|---|---|
| Game 1 | tiny (9 scalars, ~180 B) | none | **full snapshot** | a delta is overhead instead |
| Game 2 | medium (~0.8–1.1 KB) | `rockets[]` (9–18 concurrent, worst 40+) | **start full → delta under load** | the only case where the array grows. adopting a delta needs a server-issued `Bullet.id` on bullets (not in current code) — **(undecided)** |
| Game 3 | small (~0.5–0.9 KB) | `attacks/dodges/feed` (pruned short) | **full snapshot** | the core already prunes by `end>now−0.5`/`t<1.2` |

**Why JSON was adopted:** the state is already a pure TS object (`Game*State`), so `JSON.stringify(project(state))` serializes it in one line, and the client passes it straight to the renderer after `JSON.parse` (no schema codegen needed). It also matches Socket.IO's default encoding, and at the worst case (game2) ~33 KB/s the scale does not warrant binary optimization.

---

<a id="s4"></a>
## §4 DB I/O — when to write and read what

> Evidence: `schema.prisma` (source of truth `docs/ERD.md`), the game-lab core. `server/src` is unimplemented, so the Prisma code below is a **proposal example grounded in the schema** (field names · types are 1:1 with the actual schema).

### 4.1 Grand principle — the DB does not know about "live"

| Data | Example | Storage location | Reason |
|---|---|---|---|
| live game state | full `Game*State` (`p1Gauge`,`rockets`,`hp`,`c`,`feed`,`seed`…) | **server RAM (authoritative)** | changes tens of steps per second. writing to the DB is an I/O flood and pointless |
| input events | `GameInputEvent{code,type,t}` | **server RAM (step queue)** | flows only over the socket. not a persistence target |
| identity/reference | `AppUser`,`UserGroup`,`AdminAccount`,`Game` | **DB (mostly read)** | loaded at match start |
| final match result | `GameMatch` 1 row | **DB (written once on end)** | the sole persisted "result". no round/tick detail |
| audit · config | `MatchEditHistory`,`ScoreConfig` | **DB** | admin edit / score weights |

> In one line: **"Only when the game ends does a single row appear in the DB."** During play, the DB is not touched.

### 4.2 Match lifecycle × DB (a→d)

```
(a) before start ── SELECT ── app_user / user_group  (identity load, read only)
(b) during play  ── no contact ── repeat core.step in server RAM, 0 DB calls
(c) at end       ── INSERT ── game_match 1 row         (result fixed, one write)
(d) query        ── SELECT ── game_match aggregation + score_config  (leaderboard/record)
```

**(a) before start — identity load:**
```ts
const [p1, p2] = await Promise.all([
  prisma.appUser.findUnique({
    where: { id: player1Id },                 // user assigned the P1 role
    select: { id:true, nickname:true, googleImageUrl:true, uploadedImageKey:true, groupId:true },
  }),
  prisma.appUser.findUnique({ where: { id: player2Id }, select: { /* same */ } }),
])
// deletedAt (soft-delete) users are already excluded with where deletedAt:null at the matchmaking-queue entry stage
```

**(b) during play — no DB contact:** for the `GAME_DURATION=10` seconds, the server repeats `create`→`step` only in RAM. game1's step is fully deterministic; game2/game3's `create` fixes a `seed` (uint32) and thereafter draws only via the built-in `nextRand`, so **it is reproducible given only the initial state (including seed)** — yet still nothing is written to the DB.

### 4.3 Result mapping — `GameResult` → DB `MatchResult`

The two notations are **different.** They must be mapped (`types.ts:10` vs `schema.prisma:22-26`).

| Core `state.result` | DB `MatchResult` | Handling |
|---|---|---|
| `'P1'` | `P1_WIN` | INSERT |
| `'P2'` | `P2_WIN` | INSERT |
| `'DRAW'` | `DRAW` | INSERT |
| `null` | — | **no INSERT** (not ended = no result) |

```ts
import { MatchResult } from '@prisma/client'
import type { GameResult } from '@madcade/shared'   // types.ts

function toDbResult(r: GameResult): MatchResult {   // the sole mapping point
  switch (r) {
    case 'P1':   return MatchResult.P1_WIN
    case 'P2':   return MatchResult.P2_WIN
    case 'DRAW': return MatchResult.DRAW
    default:     throw new Error('cannot persist unfinished match (result=null)')
  }
}
```

**Role-mapping invariant:** **P1 role (Q/W) = `player1_id`, P2 role (U/I) = `player2_id`.** Fixed once at matchmaking (the RAM room object) and does not flip up until the terminal INSERT. So if `state.result==='P1'`, the winner is always `player1_id`.

### 4.4 INSERT + broadcast order (strict)

**Invariant: "broadcast `match:end` only after the commit succeeds."** The final result the client sees and the DB match 100%.

```ts
try {
  const match = await prisma.gameMatch.create({           // ← commit
    data: {
      gameId: room.config.gameId,     // Int @db.TinyInt (1|2|3)
      player1Id: room.player1Id,      // BigInt — P1(Q/W)
      player2Id: room.player2Id,      // BigInt — P2(U/I)
      result: toDbResult(state.result),
      // omit playedAt → @default(now()) (schema.prisma:91)
      // omit deletedAt → null (soft-delete only)
    },
    select: { id: true, playedAt: true, result: true },
  })
  io.to(room.code).emit('match:end', {                    // ← only after the commit
    matchId: room.matchId,                    // runtime correlation key
    gameId: room.config.gameId,
    result: state.result,                     // client keeps the code notation ('P1'/'P2'/'DRAW') as-is
    wins: room.wins,
    players: { p1: {...}, p2: {...} },
    recordedMatchId: match.id.toString(),     // BigInt → string (JSON-safe)
    playedAt: match.playedAt.toISOString(),
  })
} catch (err) {
  io.to(room.code).emit('match:error', { matchId: room.matchId, code: 'RESULT_PERSIST_FAILED' })
  // the result remains in RAM, so hand it to a retry queue to guarantee at-least-once storage
}
```
- Single write, so `$transaction` is unnecessary (if a side-write such as a stats cache appears, bundle it then — adoption is (undecided)).
- **No bad fallback:** on INSERT failure, do not broadcast "pretending it succeeded". When the source of truth (DB) is empty, fail loudly with `match:error`.

### 4.5 Leaderboard / rank query (proposal)

Score = `ScoreConfig` (single row id=1: `winPoints=3`,`drawPoints=1`,`lossPoints=0`, `schema.prisma:123-134`) × record. A user can appear as either `player1_id`/`player2_id`, so **unfold (normalize) the two roles** when aggregating.

```sql
-- [per-class leaderboard] played CTE = role unfold (shared by 3.1·3.2). Prisma $queryRaw recommended.
WITH played AS (
  SELECT player1_id AS user_id, game_id,
         CASE result WHEN 'P1_WIN' THEN 'WIN' WHEN 'P2_WIN' THEN 'LOSS' ELSE 'DRAW' END AS outcome
  FROM game_match WHERE deleted_at IS NULL           -- exclude soft-delete
  UNION ALL
  SELECT player2_id AS user_id, game_id,
         CASE result WHEN 'P2_WIN' THEN 'WIN' WHEN 'P1_WIN' THEN 'LOSS' ELSE 'DRAW' END AS outcome
  FROM game_match WHERE deleted_at IS NULL
)
SELECT u.id, u.nickname, u.group_id,
       SUM(p.outcome='WIN')  AS wins,
       SUM(p.outcome='DRAW') AS draws,
       SUM(p.outcome='LOSS') AS losses,
       SUM(CASE p.outcome WHEN 'WIN' THEN cfg.win_points
                          WHEN 'DRAW' THEN cfg.draw_points
                          ELSE cfg.loss_points END) AS points
FROM played p
JOIN app_user u ON u.id = p.user_id AND u.deleted_at IS NULL
CROSS JOIN score_config cfg                          -- single row (id=1)
WHERE u.group_id = :groupId
GROUP BY u.id, u.nickname, u.group_id
ORDER BY points DESC, wins DESC, losses ASC;         -- tie-break
```

```sql
-- [per-game win rate] ★ the played CTE must be re-included (so it can run standalone)
WITH played AS ( /* ↑ the same two SELECT UNION ALL as above */ )
SELECT p.game_id, u.id, u.nickname,
       SUM(p.outcome='WIN') AS wins, COUNT(*) AS total,
       ROUND(SUM(p.outcome='WIN')/COUNT(*), 3) AS win_rate
FROM played p
JOIN app_user u ON u.id = p.user_id AND u.deleted_at IS NULL
GROUP BY p.game_id, u.id, u.nickname
ORDER BY p.game_id, win_rate DESC;
```
- Indexes: `ix_match_p1(player1_id, played_at)`·`ix_match_p2(player2_id, played_at)`·`ix_match_played(played_at)` (`schema.prisma:100-102`) back per-user/per-period scans. **There is no standalone `game_id` index** → if bulk per-game aggregation becomes frequent, consider adding one (proposal).

### 4.6 Auth/onboarding writes & admin

**First Google login:** determine existence by `google_sub` (unique); INSERT if absent.
```ts
const user = await prisma.appUser.upsert({
  where: { googleSub: profile.sub },     // uq_user_google
  update: { email: profile.email, googleImageUrl: profile.picture },
  create: {
    googleSub: profile.sub, email: profile.email,
    nickname: provisionalNickname(),     // ⚠ nickname NOT NULL+UNIQUE(:45) → needs a temporary value (undecided strategy)
    googleImageUrl: profile.picture,
    // no groupId (nullable) — filled in during onboarding
  },
})
```
> Because of the `nickname` UNIQUE constraint, "signup=INSERT / nickname-fix=UPDATE" is a 2-step process. Temporary-nickname strategy (e.g. `user_{id}`) vs keeping a PENDING session then INSERTing at onboarding — **(undecided, §1.2)**.

**Onboarding:** `prisma.appUser.update({ where:{id}, data:{ nickname, groupId } })`. `nickname` conflict `P2002` → 400/409 `NICKNAME_TAKEN`. `groupId` is a `user_group.id` FK (`onDelete:Restrict`).

**admin result edit = UPDATE + audit-log INSERT (atomic):**
```ts
await prisma.$transaction([
  prisma.gameMatch.update({ where: { id: matchId }, data: { result: after } }),
  prisma.matchEditHistory.create({
    data: { matchId, adminId, beforeResult: before, afterResult: after },  // editedAt @default(now())
  }),
])
```

### 4.7 Profile image — key only in DB, binary in R2

| Item | Location | Field |
|---|---|---|
| uploaded image **key** | DB | `AppUser.uploadedImageKey` (`VarChar(300)`, nullable, `:47`) |
| uploaded image **binary** | Cloudflare R2 | (not in DB) |
| Google default profile URL | DB | `AppUser.googleImageUrl` (`VarChar(500)`, nullable, `:46`) |

```ts
function resolveAvatar(u: { uploadedImageKey: string|null; googleImageUrl: string|null }) {
  if (u.uploadedImageKey) return r2PublicUrl(u.uploadedImageKey)  // R2 key → URL (or presigned)
  if (u.googleImageUrl)   return u.googleImageUrl
  return null                                                     // client shows an initials avatar (good fallback = honestly "no image")
}
```
> The R2 serving method (public bucket direct URL vs presigned vs server proxy) is **(undecided)** — implement `r2PublicUrl` after the infra decision.

### 4.8 Boundary formats & schema gaps

| Boundary | Format | Rationale |
|---|---|---|
| DB ↔ server | **Prisma (SQL)** | type-safe ORM, all examples above |
| server ↔ client | **JSON** (Socket.IO payload / REST body) | serialize `state.result` etc., `BigInt` stringified |
| app config format | **(undecided)** — unspecified in the stack doc (`TECH_STACK.md`) | ~~YAML-only~~ unfounded → only assert the two verified boundaries |

**Schema-gap judgment — only the final result remains.** `GameMatch` has only `(gameId, player1Id, player2Id, result, playedAt)`.

| Game | What the core knows (RAM) | What remains in DB | What is discarded |
|---|---|---|---|
| game1 | `p1,p2,target,p1Gauge,p1Hold,elapsed` | `result` only | final proximity gap, gauge, still-hold time |
| game2 | `hp,iframes,rockets[],elapsed` | `result` only | final HP remaining, survival time, hit count |
| game3 | `c,feed[],p1.combo,waterLevel,seed,elapsed` | `result` only | final `c`, `feed`, combo count, rising tide |

**v1 verdict: sufficient.** The requirement is "one row per online match's final result" (ERD note #2), and the leaderboard/win rate (§4.5) are fully computable from `result` alone. Detailed state is for render presentation (game3 `feed` disappears after 1.2s), so its persistence value is low.

**Extensions are 'proposals' only (source of truth = update ERD.md first, no arbitrary change, `schema.prisma:1-4`):**
- If highlight/replay is needed → propose a separate `game_match_detail(match_id, payload JSON)` table.
- Replay for game2/game3 is **deterministically reproducible from just the `seed` (uint32) + `GameInputEvent[]`** → low-footprint replay (proposal).

### 4.9 At-a-glance summary (DB triggers)

```
write triggers:
  1) first Google login       → app_user  INSERT/upsert (when google_sub absent)
  2) onboarding complete      → app_user  UPDATE (nickname, group_id)
  3) match end (result≠null)  → game_match INSERT (broadcast match:end only after commit)
  (admin) result edit         → game_match UPDATE + match_edit_history INSERT (transaction)
read triggers:
  A) before match start       → app_user/user_group SELECT (identity)
  B) leaderboard/record/rate  → game_match aggregation × score_config (raw SQL, played CTE)
absolute rules:
  · no live state (gauge/hp/c/feed/seed…) in the DB — server RAM authoritative
  · result mapping: 'P1'→P1_WIN / 'P2'→P2_WIN / 'DRAW'→DRAW / null→not stored
  · player1_id=P1(Q/W), player2_id=P2(U/I) — fixed at matchmaking, does not flip
  · INSERT commit succeeds → only then match:end. on failure match:error (no fake success)
  · boundaries: DB↔server=Prisma/SQL, server↔client=JSON, app config format=(undecided)
```

---

<a id="open"></a>
## Open questions (undecided list)

1. **Game 2 role-swap policy** (§2.4) — swap each round vs fixed per match, how to decide the starting role on odd rounds.
2. **Multi-round (best-of-N)** (§0.4) — v1 defaults to `totalRounds=1`. The `rounds>1` aggregation rule and the DB final-result definition are undecided (an orchestration concept the core lacks).
3. **Round time** (§0.5, §2.2) — the core `GAME_DURATION=10` constant vs the host's setting (currently conflicting).
4. **Game 3 server tick model** (§0.5) — `TECH_STACK.md`'s "1-second-tick RPS" disagrees with the adopted code (continuous sub-frame 0.06s window) → must be dropped per the code.
5. **`t` authority** (§0.2) — clamp the client `t` (the code behavior, adopted in v1) vs recompute from the server arrival time.
6. **Client-local key binding/remapping UI** (§0.2) — the server rewrite rule is fixed, the client display/remapping is undecided.
7. **Game 2 delta transmission** (§3.5) — adoption needs a `Bullet.id` (server-issued) that the current code lacks.
8. **First-login nickname strategy** (§1.2, §4.6) — PENDING session then onboarding INSERT vs temporary-nickname INSERT then UPDATE.
9. **R2 serving method** (§4.7) — public URL vs presigned vs server proxy.
10. **Input `seq` / reliable retransmit** (§0.2) — not enforced in v1, add if needed.
11. **App config format** (§4.8) — unspecified in the stack doc (no basis to assert YAML).
12. **Stats cache table** (§4.4) — on adoption, bundle the INSERT in a `$transaction`.

---

<a id="roadmap"></a>
## Implementation roadmap

Each step is verifiable in the form `step → verify: check`.

1. **Port the shared core** → `verify:` port game-lab `shared/src/games/*` into main `shared/`, keep the offline 97 tests passing.
2. **Projection functions + View types** → `verify:` write `projectG{1,2,3}(state)→G*View`, then type-check that `render{1,2,3}` render from the View alone + confirm with offline replay (render-lossless without seed/rate).
3. **Server authoritative loop (single match)** → `verify:` on Fastify+Socket.IO, run `round:start(create)→step loop→game:state broadcast` with 2 bots and confirm `result` is reached.
4. **Input rewrite + `t` clamp** → `verify:` a unit test that injecting `KeyQ` as P2 cannot control P1 (rewrite) + a forged `t` is clamped to the tick window.
5. **Auth/session (§1)** → `verify:` OAuth round trip → `mp_session` → `GET /api/me` returns `USER`, onboarding INSERT.
6. **Lobby/room/queue (§2)** → `verify:` 2 clients code-room match → `room:state` source of truth matches → `match:start` role delivered individually.
7. **Result persistence (§4)** → `verify:` `result≠null` → `match:end` only after the `game_match` INSERT commit, `match:error` on failure (no fake success).
8. **Leaderboard (§4.5)** → `verify:` the played-CTE aggregation matches the `score_config` weights, per-class/per-game rank snapshot.
9. **Combine design mockups** → `verify:` wire the design-lab UI (login/lobby/matchmaking/game-select/result) to the API above, replacing only the game canvas with `game:state` dumb render.

<!-- notify: consolidated the API · JSON · DB spec -->
