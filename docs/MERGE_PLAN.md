# MADCADE Merge Methodology — game-lab logic + design-lab design → main

## TL;DR (5 lines)

1. **The "heart" of logic/render/input is ported wholesale from game-lab** → promote the 3 core modules `game-lab/shared/src/games/*` into main's empty `shared/`, and move `game-lab/client`'s canvas renderers, unified input, and game-loop skeleton into main `client/`.
2. **The "face" of the out-of-game screens is ported from design-lab** → move the winning mockup's (1st choice `05-obsidian`) `screens/modals/components/theme.css` into main `client/`. **Discard the in-game screens (Game1~3.tsx), the old core, and mock authority.**
3. **Win/loss authority belongs to the new `server`** → a single Fastify + Socket.IO process runs `@madcade/shared`'s `core.create/step` on the server; queue/room/live state are in-memory, and only the final result (1 row) is written to `game_match`.
4. **The only place the three sources actually overlap is a single cross-cutting task** — "in-game canvas palette injection" (the canvas cannot read CSS variables, so the winner's `theme.css` hex values are mirrored once into a JS `RenderPalette`). Everything else is file-level porting, so there are no conflicts.
5. **The online switch replaces only "input source + state owner"** — the local loop (`create→step→render`) stays as-is; the client starts as a dumb client that emits key inputs to the server and only renders the server's view-snapshots (prediction is optional).

---

## 1. Role breakdown of the 3 sources (KEEP / DROP)

This repo has **3 coexisting game APIs that share the same names but differ in structure**. Half of the merge methodology is "which API to adopt as canonical and how to retire the rest."

| API | Location (identifier) | State shape | Result notation | Verdict |
|---|---|---|---|---|
| **game-lab (adopted as canonical)** | `game-lab/shared/src/games/*` — package name `@madcade/shared` | `Game1State.p1/p1Gauge/p1Hold`, `Game2State.rockets/hp/seed`, `Game3State.c/feed/seed/waterLevel` | `GameResult = 'P1'\|'P2'\|'DRAW'\|null` | `GameCore.create/step` (pure & deterministic) |
| **design-lab old core (retired)** | `design-lab/shared/src/games/*` — **package name is also `@madcade/shared` (identical)**, referenced by screens via the path alias `@shared` | `Game1State.players.P1.value / derived / elapsedMs` | `MatchResult = 'P1_WIN'\|'P2_WIN'\|'DRAW'` | `createGame1State / tick / game1ActionFromKey` |
| **DB enum (separate domain)** | `server/prisma/schema.prisma` | — | `enum MatchResult { P1_WIN, P2_WIN, DRAW }` | for storage |

> **Correction (verification-reflected):** all three `shared/` packages **have the exact same npm name `@madcade/shared`** (confirmed across 3 `package.json` files). The `@shared` that the design-lab screens use is **not a package name but a tsconfig/vite path alias** — `05-obsidian/tsconfig.json`'s `"@shared": ["../../shared/src/index.ts"]`, and `vite.config.ts`'s `'@shared' → design-lab/shared/src` (comment: "directly references the `@madcade/shared` source"). So the reason design-lab's imports disappear is not "because the name is different" but **because we delete the `@shared` alias and replace `shared/` with the game-lab version**. Because the three packages share the same name, **name-collision must actually be considered** — but if design-lab's `shared/` is completely excluded from porting, only one remains at runtime and no collision occurs.

### 1-1. KEEP / DROP table

| Source | KEEP (adopt) | DROP (retire) | Evidence file |
|---|---|---|---|
| **game-lab** | ① 3 core modules `shared/src/games/{types, game1/logic, game2/logic, game3/core+logic}.ts` ② canvas renderers `client/src/games/{render1,render2,render3,fencerPose,registry}.ts` ③ unified input `client/src/input/keyboard.ts` ④ local game-loop skeleton `client/src/ui/GameScreen.tsx` ⑤ core tests (97 tests) | minimal UI (`MainScreen.tsx`, `index.css`) — replaced by design-lab screens | `shared/src/index.ts`, `client/src/games/registry.ts` |
| **design-lab** | ① out-of-game screen shells `screens/{MainLoggedOut,MainLoggedIn,Onboarding,GameSelect}.tsx` ② modals `modals/{LoginRequired,Online,Matching,Settings}.tsx` ③ primitives `components/{Button,Card,Modal,Avatar,LeaderboardTable,PlayerBadge,KeyCap…}.tsx` ④ theme `theme.css` (palette/font/clip·frame tokens) ⑤ result overlay `screens/game/ResultOverlay.tsx` | **all in-game game logic and game render**: `screens/game/{Game1,Game2,Game3}.tsx`, old core `shared/src/games/*`, old input `attachKeyboardAdapter`, mock authority (`state/{flow,session}.ts`'s bots, `reportRoundResult`, fake login) | `ideas/05-obsidian/src/**`, `theme.css`, `Game1.tsx`, `Game2.tsx:45` |
| **main** | place the above two into the 3 workspace slots (`shared`/`client`/`server`, all `@madcade/*`) + **write the new `server`** | current empty stubs (`client/`·`shared/` are just `package.json`, `server/` is just Prisma) | root `package.json` (workspaces), `server/prisma/` |

**The nature of the third tension (code-confirmed):** design-lab's in-game screens aren't even unified in render approach — `Game1.tsx`/`Game3.tsx` draw with **React DOM** (div·span·CSS), while `Game2.tsx` draws with **canvas**. On top of that, all three are **nailed to the old API (`players.P1.value`·`derived.timeRemainingMs`)**, so they cannot draw the new state (`Game1State.p1`, `Game2State.rockets/hp`, `Game3State.c/feed`). → **design-lab's in-game render is unreusable.** game-lab's 3 canvas renderers all support the new state with a consistent signature (`render(ctx, state, w, h)`), so we unify the port on these.

---

## 2. Target monorepo layout (file mapping)

main is already an npm-workspaces monorepo (`shared`/`server`/`client`, all `@madcade/*`). game-lab uses the same convention, so the layout is close to a path copy.

### 2-0. Self-containment & contract first principles (★this section is the constitution of the layout)

Two invariants that must never be broken in the merge. Every "port" in 2-1~2-3 below is only valid on top of these principles.

#### Invariant A — Self-containment: main builds & runs even without `game-lab`/`design-lab`

> **Principle: the originals are the "mine," main is the "product." Merge = physically copying files into the main workspace (vendor-in) and cutting every umbilical cord to the originals (path references, aliases, symlinks, workspace globs).** Once the copy is done, **deleting `game-lab` or `design-lab` folder-and-all must leave main intact.**

Why this matters: the `design-lab` mockups currently point to `../../shared/src` (= inside design-lab) via the `@shared` alias, and `game-lab` exists **only on a different branch (experiment/game-test)**. If you do the "port" as *path wiring that points at the original folders* rather than a *copy*, then the moment you later delete the lab folders, main won't even compile. So it must be **copy + umbilical cut**, not wiring.

**Enforced guardrails (rules to follow at implementation time):**

| Rule | Forbidden | Allowed |
|---|---|---|
| **Workspace scope** | Adding `design-lab`/`game-lab`/`ideas/*` to the root `package.json`'s `workspaces` | Keep only the 3 slots `["shared","server","client"]` (as-is currently) |
| **Path alias** | `client`'s tsconfig/vite `paths` pointing at `../../design-lab`·`../../game-lab`·`../../shared` (inside a lab) | Alias only **within its own workspace** (`@/…`=client/src). Core only via `@madcade/shared` (main's shared) |
| **Relative-path import** | `import … from '../../design-lab/...'` / `'../../game-lab/...'` | Relative paths inside main's 3 workspaces + `@madcade/shared` |
| **Symlink/glob** | symlink into a lab folder, `file:../design-lab` dependency | none |

**Git import method (because the originals live in different places):**
- `game-lab` (different branch): use `git checkout experiment/game-test -- game-lab/` to pull just the files → move what you need into `shared/`·`client/` → commit to main. Afterwards, discard the game-lab tree from main.
- `design-lab` (currently in the main tree): copy the winning mockup's `screens/modals/components/theme.css` into `client/src` → clean up imports to local components + `@madcade/shared` → **delete all of `design-lab/` from main (or, after confirming 0 references, it's fine to leave it)**.

#### Invariant B — Contract fixed: the API envelope is game-agnostic & immutable, per-game JSON is split per folder

> **Principle: "what is exchanged (the transport envelope)" is decided once and fixed; "what the state inside looks like (per-game JSON)" is stored split into an independent file per game, so that the envelope is untouched even when a game changes.**

- **Fixed contract (does not change)** — `shared/src/net/events.ts`: unified input `game:input {code,type,t}` + state envelope `game:state {gameId, state}` + lifecycle events. **Adding or modifying a game leaves this file as-is.** This is the substance of "defining the API up front."
- **Per-game "interpretation" (changes often)** — one game = one folder, isolated. Inside `shared/src/games/gameN/` sit **that game's state type + config (G1/G2/G3) + core (create/step)**, in full — so to change that game you touch **only that folder**.
- **Separately-stored schema files (proposed)** — `shared/schemas/gameN.state.schema.json` (one JSON Schema per game). Separate from the code, this nails down "this game's state JSON looks like this" as a language-neutral contract readable by humans, AI, and validators alike. When a game changes, only this file and the `gameN/` folder show up in the diff; the transport envelope, other games, and the DB are unchanged.
- **Assembled via a registry** — `shared/src/games/registry.ts` maps `gameId → {core, schema, config}`. **Adding a new game = one folder + one schema + one registry line.** The transport and server-loop code are untouched (the implementation form of the user's insight "same API + JSON state").

### 2-1. `shared/` — promote game-lab core as-is

| game-lab original | → main target | Note |
|---|---|---|
| `shared/src/games/types.ts` | `shared/src/games/types.ts` | Canonical for `KeyCode`, `GameInputEvent`, `GameResult`, `GAME_DURATION=10`, `GameCore<S>` |
| `shared/src/games/game1/logic.ts` | same | `Game1State`, `G1`, `create/step` |
| `shared/src/games/game2/logic.ts` | same | `Game2State`, `Bullet`, `G2`, `seed` |
| `shared/src/games/game3/{core,logic}.ts` | same | `Game3State`, `FencerState`, `DodgeStyle`, `G3FeedEvent`, `seed` |
| `shared/src/index.ts` | same | barrel export |
| — (**new**) | `shared/src/game/palette.ts` | `RenderPalette` — canvas palette injection type (§3) |
| — (**new**) | `shared/src/game/viewState.ts` | **projector: server original state → client view-snapshot** (strips authority-only fields like `seed`, §5·§7) |
| — (**new**) | `shared/src/net/events.ts` | socket event payload types — shared by client·server (§5) |
| — (**new**) | `shared/src/net/result.ts` | `GameResult ↔ MatchResult(DB)` mapping util (§7) |
| — (**new**) | `shared/src/games/registry.ts` | `gameId → {core, schema, config}` registry. New game = folder + schema + one line (2-0 invariant B) |
| — (**new**) | `shared/schemas/{game1,game2,game3}.state.schema.json` | per-game state JSON Schema — language-neutral contract for "how to interpret this game." When a game changes, only this file + `gameN/` are edited; envelope, other games, DB unchanged (2-0 invariant B) |

### 2-2. `client/` — wire design-lab shell + game-lab renderers to the socket

| Original | → main target | Handling |
|---|---|---|
| design-lab `screens/*`, `modals/*`, `components/*`, `theme.css` | `client/src/{screens,modals,components}/`, `client/src/theme.css` | **Port as-is.** Only clean up import paths (remove `@shared` alias → local component/`@madcade/shared`). Replace mock authority (`flow.ts` bots·`reportRoundResult`, `session.ts` fake login) with socket/REST |
| game-lab `client/src/games/render{1,2,3}.ts`, `fencerPose.ts`, `registry.ts` | `client/src/game/render*.ts`, `registry.ts` | **Port as-is** + palette parameterization (§3) |
| game-lab `client/src/input/keyboard.ts` | `client/src/game/input/keyboard.ts` | keep `attachLocalKeyboard` → behind an `InputSource` interface (§5) |
| game-lab `client/src/ui/GameScreen.tsx` | `client/src/screens/game/GameHost.tsx` | **rework the local loop into a socket loop** (§5). Attach design-lab `ResultOverlay.tsx` for result display |
| design-lab `screens/game/{Game1,Game2,Game3}.tsx` | ❌ not ported | old API·old render. A single `GameHost` handles all 3 games via the `registry` |

### 2-3. `server/` — new Fastify + Socket.IO + Prisma authority loop

| Layer | Target (new) | Role |
|---|---|---|
| HTTP | `server/src/http/{auth,match,leaderboard}.ts` | Google OAuth callback (auth code + session cookie, no JWT), match record query, leaderboard (REST) |
| Socket | `server/src/socket/index.ts` | queue·room·live state = **in-memory** (no room/queue table in DB) |
| Authority loop | `server/src/game/loop.ts` | runs `@madcade/shared`'s `core.create/step` **on the server**. **The original state (including seed) exists only inside this file** (§5·§7) |
| DB | `server/prisma/*` (existing) | writes 1 row to `game_match` on match end. `GameResult→MatchResult` mapping |

---

## 3. Resolving the core tension: touch only one place, "game rendering"

### Problem

- The game-lab renderers (`render1/2/3.ts`) **draw the new state precisely but have a dark palette hardcoded**. Confirmed: `render1.ts` 17, `render2.ts` 17, `render3.ts` 20 hex literals. **Correction (verification-reflected):** the representative hex values inside the renderers are `#4da3ff` (P1), `#ff5d5d` (P2), etc. — `#10131a` is nowhere in any renderer and exists **only in the canvas background fill (`GameScreen.tsx:63` `ctx.fillStyle='#10131a'`)**. (Background/timer-warning colors like `#ff5d5d` are also owned by `GameScreen`.)
- The design-lab theme is CSS variables (`--p1`, `--p2`, `--bg-0`, `--danger` …, `theme.css`), but **the canvas cannot read CSS variables**. design-lab `Game2.tsx:45` already confesses this limitation (`// same hex as theme.css --p1/--p2 — canvas can't read CSS variables`) → the hex is re-copied into JS.

### Resolution — promote the renderers to "palette-injected"

Add a palette argument to the renderer signature, and mirror the winner mockup's CSS-variable hex once into a JS object to inject it. **The game logic and state are not touched by a single character.**

```ts
// shared/src/game/palette.ts — canvas can't read CSS vars, so mirror them in JS (canonical: theme.css)
export interface RenderPalette {
  bg: string           // canvas background (originally GameScreen:63 #10131a → winner --bg-1) — owner: theme
  p1: string           // P1 side color (--p1, originally renderer #4da3ff) — keep the 'absolutely immutable' rule
  p2: string           // P2 side color (--p2, originally renderer #ff5d5d)
  danger: string       // last-3-seconds warning color (--danger, originally #ff5d5d)
  accent: string       // gauge/highlight (--gold, etc.)
  fontDisplay: string  // HUD number font (--font-display)
}

// Before:  render(ctx, state, w, h)
// After:   render(ctx, state, w, h, pal)   ← only pal added, the rest identical
export type GameRender<S> =
  (ctx: CanvasRenderingContext2D, state: S, w: number, h: number, pal: RenderPalette) => void
```

The workload is a single mechanical refactor per renderer, replacing its 17~20 hex literals (+ the background/timer hex that `GameScreen` used to hold) with `pal.*` references. **The out-of-game UI (login/lobby/result/leaderboard) is already pure React+CSS**, so porting the design-lab screens as-is is all it takes — **canvas palette injection is the only cross-cutting task**.

---

## 4. Design mockup selection strategy

**Recommendation: "fix one winner" + "tokenize only palette/font/frame."** Pure token-swap (freely swapping the 7 mockups by CSS variables alone) is **impossible** — because each mockup's screen file composition itself differs.

| Mockup | screens composition difference | usage history |
|---|---|---|
| 01-neo-brutal | no CSS split (component inline) | loop1 |
| 02-neon-coinop | many per-screen CSS files like `main-in.css`/`onboarding.css` | — |
| 03-clay-toy | `lobby.css` + per-screen CSS mixed | loop? |
| 04-broadcast-arena | `auth.css` + `lobby.css` split (clean) | loop4 |
| **05-obsidian** | `auth.css` + `lobby.css` split, complete token system (palette·font·clip·ease variabilized) | **loop5 (latest)** |
| 06-pico8 | many per-screen CSS files | — |
| 07-gym-class | (screens list unconfirmed) | — |

**1st-choice recommendation: `05-obsidian`.** Rationale: ① **most recent usage history (loop5)**, ② the dark e-sports palette **immediately matches** the game-lab canvas render (dark `#10131a`-background-based), so injection per §3 has minimal dissonance, ③ its `theme.css` **fully tokenizes** palette/font/clip/ease, so `RenderPalette` mirroring maps 1:1, ④ the "absolutely immutable" `--p1`/`--p2` rule matches the game-lab renderer's P1(`#4da3ff`)/P2(`#ff5d5d`) convention. **2nd choice: `04-broadcast-arena`** (sports-broadcast concept, same `auth.css`/`lobby.css` structure, loop4 history).

> **(unconfirmed)** **The final winner is a user decision** (→ 'Decisions needed' at the end of the doc). The methodology is **mockup-independent**: "port one winner folder into `client/src` + mirror that `theme.css`'s hex into `RenderPalette`." Even if you change the winner later, **the only files that change are `theme.css` + the `palette.ts` mirror**, and the game logic/render structure is invariant.

---

## 5. Offline → online switch method

### 5-1. Input source abstraction (LocalKeyboard | RemoteSocket)

game-lab's local loop (`GameScreen.tsx`) is 3 stages: `create(Math.random)` once → per rAF `step(state, queue.splice(0), dt)` → `render`. Keep this as-is and **change only the input provider and the state owner**.

```ts
// client/src/game/input/source.ts — local/remote behind the same interface
export interface InputSource {
  // GameInputEvent = { code: KeyCode; type: 'down'|'up'; t: number }  (canonical: shared/types.ts)
  start(onEvent: (e: GameInputEvent) => void): void  // start pushing events
  stop(): void
}
// Offline: wrap the existing attachLocalKeyboard (keyboard.ts as-is)
// Online:  emit my key input to the server, receive the server view-snapshot and only render
```

### 5-2. Server authority loop vs dumb-client render

Because `create`'s `rand()` fixes the initial state (especially `seed`) — game2/game3 draw `seed` in `create` via `Math.floor(rand()*4294967296)` (game2/logic.ts:92, game3/core.ts:149), after which `step` uses only the built-in LCG `nextRand(seed)` for randomness — **once the server owns `create`, the subsequent evolution is deterministic**. game1 has no randomness in `step` at all.

> **The exact condition for determinism (verification-reflected — important):** the core's "pure & deterministic" holds **only when `(dt sequence, event sequence, seed)` are identical**. It is not dt-independent. game1's gauge sqrt-decay·value integration·hold accumulation, and game3's knockback accumulation, are all **dt-path-dependent**, and game2's collision detection also depends on the per-step movement amount. Therefore the **server tick rate must be set consistent with the offline tuning (rAF ~16ms, 60fps)**.
>
> **Correction:** in the offline `dt = Math.min((now-last)/1000, 0.05)` (GameScreen.tsx:50), **`0.05` (50ms) is the dt "cap," not the tick interval** — offline actually runs at rAF ~16ms. Running the server at a fixed 50ms (20Hz) diverges the float-integration trajectory and misaligns with the 60fps tuning. **→ Run the server authority loop at a fixed ~16ms (≈60Hz) tick**, and the client snapshot send-rate can be lowered **independently** of that (e.g. 20~30Hz snapshots). That is, separate "physics step dt" from "network snapshot period."

```
[server loop.ts — authority, holds original state (incl. seed) internally]   [client GameHost — dumb render]
state = core.create(serverRng)                              key input → input:key emit ──▶ server buf load
physics loop (fixed ~16ms, 60Hz):
  buf = collected GameInputEvent[]
  state = core.step(state, buf, dt≈0.016)
snapshot loop (e.g. 20~30Hz):
  view = toViewState(state)   ← strip authority-only fields like seed (§7)
  ──state:tick(seq, view)──▶                              render the received view via render(ctx,view,w,h,pal)
  if state.result:  ──match:over(result)──▶               show ResultOverlay
```

The client is **done by just feeding the received view-snapshot to the renderer** — the game-lab renderer already has the `(ctx, state, w, h)` signature and **never reads `state.seed`** (grep across render1/2/3·fencerPose confirms = 0 hits), so removing seed from the view-snapshot has no effect on rendering. **The default starts as dumb render.**

> **(unconfirmed)** whether to apply client prediction and reconciliation, and the final values of physics dt / snapshot send-rate → 'Decisions needed'. **To turn prediction on, the client must step forward with the same `core`, so only then does the client need seed**, and in that case §7's cheat tradeoff must be explicitly documented.

### 5-3. Representative socket events (colon convention) — **view-snapshot principle reflected**

```
[C→S] queue:join    { gameId?: 1|2|3 }                       // if absent, random (quick start)
[S→C] match:found   { matchId: string, gameId: 1|2|3, role: 'P1'|'P2' }
[S→C] match:start   { view: <per-game 'view state'> }        // projection of server create result with seed removed
[C→S] input:key     { code: KeyCode, type: 'down'|'up', t: number }  // = GameInputEvent
[S→C] state:tick    { seq: number, view: <per-game 'view state'> }   // authority snapshot (excl. authority-only fields like seed)
[S→C] match:over    { matchId: string, result: 'P1'|'P2'|'DRAW' }    // = GameResult
```

> **Security principle (major-verification-reflected — must be handed off to the API-spec part):** the original `Game2State`/`Game3State` contain the **PRNG internal state `seed`** (game2/logic.ts:56, game3/core.ts:108). Sending it as-is via `state:tick`/`match:start` **leaks the server RNG seed to the client, and a tampered client can predict future randomness** — for game2 the rocket speed/jitter, and **for game3 the attack windup delay (0.04~0.18s) and dodge style**, opening a **deterministic cheat: frame-perfect parry/dodge**. Since the renderer doesn't read seed (grep confirmed above), a dumb client doesn't need it in the first place. **→ `shared/src/game/viewState.ts`'s `toViewState(state)` produces a 'view state' containing only the fields the renderer actually reads, and the original seed-containing state stays only inside the server's `loop.ts`.** The final contract for event names·payloads belongs to the API-spec part, so hand off **`seed non-exposure` (and non-exposure of authority-only fields)** to that part explicitly.

> **Netcode pitfall (must be specced):** `GameInputEvent.t` (seconds elapsed since game start) is **actually read only by game 3** — game3's `core.ts` uses `t` to judge attack-windup timing at subframe granularity. game1/game2 `step` look only at `e.code`/`e.type` and ignore `e.t`. **→ (unconfirmed)** a policy decision is needed on whether to trust the client-stamped `t` as-is online, or re-stamp with the server arrival time. Determinism·fairness hinge on this (→ 'Decisions needed').

---

## 6. Step-by-step execution plan (step → verify)

| # | Step | Verify (acceptance criteria) |
|---|---|---|
| **1** | **Core promotion**: game-lab `shared/src/games/*` → main `shared/`. Port the core tests (97 tests) too. Create `viewState.ts`/`palette.ts`/`net/*` stubs | `--filter @madcade/shared test` all pass + `import {G1,G2,makeGame3} from '@madcade/shared'` typechecks OK |
| **2** | **Client shell port (offline first)**: port the winning mockup's `screens/modals/components/theme.css` + game-lab renderers/input/`GameHost`, wire `InputSource=LocalKeyboard`. Palette injection (§3) | In the browser, login (mock)→lobby→game-select→**games 1·2·3 run as local 2-player** and win/loss appears. Render is drawn with the winner theme palette |
| **3** | **Server socket round-trip**: bring up Fastify+Socket.IO, in-memory queue/room, `queue:join→match:found→match:start`. Server owns `core.create`, client `InputSource=RemoteSocket`. **Apply view-snapshot projection (seed removed)** | Two tabs connect → matched → both clients render the server-sent `state:tick(view)`. Confirm `input:key` round-trip. **No `seed` field in the payload dump** |
| **4** | **Per-game online judging**: server-authority `step` loop (**fixed ~16ms**) + `match:over`. Finalize game3's `e.t` stamping policy | **Replaying the same `(event + dt)` frame trace makes server `result` == offline local-sim `result`** (game1 deterministic, game2/3 reproduced via shared seed). ※ determinism assumes "identical dt sequence" — replaying a 60fps trace on a 20Hz server mismatching is normal. ResultOverlay OK |
| **5** | **DB record/leaderboard**: insert 1 row into `game_match` on `match:over` (`GameResult→MatchResult` mapping), score aggregation REST via `score_config` | Confirm `game_match` row created, leaderboard screen renders from real DB aggregation (not mock) |
| **6** | **Auth**: Google OAuth auth code + session cookie (no JWT), separate admin ID/PW (bcrypt). Replace design-lab `session.ts` mock with the real API | Real Google login→onboarding (unique nickname)→`app_user` created. Online entry blocked when not logged in (`LoginRequired` modal) |

Each step proceeds to the next **only after the previous one works observably**. **The key is that offline fully runs first at step 2** — with render·input·core porting verified, only the socket is layered on top.

> **Umbilical-cut test (enforcing invariant A — mandatory as a step-2 exit gate + final gate):** right after the client-shell port finishes, temporarily move the original folders aside and confirm the build still passes.
> ```bash
> # temporarily move the lab folders outside (safely, instead of deleting)
> mv design-lab ../_park_design-lab 2>/dev/null; git stash -u 2>/dev/null
> mv /tmp/game-lab-src ../_park_game-lab 2>/dev/null   # traces of the original after import
> npm ci && npm run -ws build && npm run -ws test       # ← must pass here for self-containment success
> # residual-reference scanner (any hit = failure):
> grep -rn "design-lab\|game-lab\|@shared\b\|\.\./\.\./\(shared\|game-lab\|design-lab\)" client/src server/src shared/src
> ```
> If the build breaks or grep catches something, **the umbilical isn't cut yet** — change that import to a local copy or `@madcade/shared` and retry. Once it passes, restore the lab folders (or delete permanently) and move to the next step.

---

## 7. Risks / cautions

| Risk | Detail | Mitigation |
|---|---|---|
| **Residual reference to original folders (self-containment collapse)** | Doing the port as *path wiring* rather than *copy* (`@shared` alias·`../../design-lab`·`../../game-lab`·adding labs to workspaces) makes main un-buildable when the `design-lab`/`game-lab` folders are later deleted | **Invariant A (2-0)** — vendor-in copy + umbilical cut. Workspaces fixed at 3, alias only within its own workspace, core only via `@madcade/shared`. **Enforce §6's "umbilical-cut test" as a step-2 and final gate** (move lab folders aside and pass `npm run -ws build` + 0 reference greps) |
| **seed client exposure (cheat vector)** | The original `Game2State`/`Game3State` include the PRNG `seed`. Sending the state wholesale lets a tampered client predict game3's windup delay·dodge and game2's rocket randomness → frame-perfect cheat | **View-snapshot projection**: send only the fields the renderer reads (seed removed), original stays internal to server `loop.ts`. Hand off `seed non-exposure` to the API-spec part. Only when enabling a prediction client, explicitly document the seed-exposure tradeoff |
| **Determinism = dt-sequence-dependent (not dt-independent)** | Running the server at 20Hz (50ms) misaligns game1 integration·game3 knockback·game2 collision granularity from the 60fps tuning. `0.05` is a dt cap, not the tick interval | Run the server physics loop at a **fixed ~16ms (≈60Hz)**. Separate the network snapshot period (e.g. 20~30Hz). Step4 verify is defined as "matches when replaying the same `(event+dt)` trace" |
| **Old/new state confusion** | design-lab `Game1State` (`players.P1.value`, `derived`, `elapsedMs`) and game-lab `Game1State` (`p1`, `p1Gauge`, `p1Hold`, `elapsed`) are **same-name-different-shape**. A wrong import breaks silently | Only the game-lab version exists in main `shared`. design-lab `shared` is **completely excluded from porting**, and the `@shared` alias is deleted. Because the three packages share the same npm name (`@madcade/shared`), a folder swap leaves only the single canonical one |
| **3 result notations** | `GameResult('P1'/'P2'/'DRAW')` ↔ design-lab `MatchResult('P1_WIN'…)` ↔ DB enum (`P1_WIN`…) | Single mapping in `shared/src/net/result.ts`: `'P1'→'P1_WIN'`, `'P2'→'P2_WIN'`, `'DRAW'→'DRAW'`. Convert only at the store·display boundaries |
| **Divergence if the client calls create** | game2/3 are deterministic if they share `create`'s `seed`, and game1 if it shares `create`'s randomness (target·start value·rate) | `core.create` is called **only by the server**. The client starts only from the view-snapshot received via `match:start` |
| **game3 `e.t` timing** | Only game3 judges via subframe `e.t`. Trusting the client stamp online risks tampering·non-determinism | **(unconfirmed)** Finalize server-restamp vs trust policy before step 4. game1/2 are unaffected (don't use `e.t`) |
| **Round-model mismatch** | design-lab `flow.ts` is multi-round best-of + variable `timePerRoundSec`. The game-lab core is a **fixed 10-second single round** (`GAME_DURATION=10`), and DB `game_match` is **1 result row per match** | Match = server orchestrates N rounds, each round = game-lab 10-second core, DB stores only the final match result. **(unconfirmed)** respect variable `timePerRoundSec` vs fix at 10 seconds |
| **Canvas vs CSS theme boundary** | The canvas can't read CSS variables (`Game2.tsx:45` proves it) | Mirror the palette hex **once** into the `RenderPalette` JS object, pin `theme.css` as canonical in a comment. Rule: update both places simultaneously when the theme changes |
| **Mockup screen-composition differences** | 05 splits `auth.css`/`lobby.css`, 02/06 have many per-screen CSS files — you can't swap mockups by pure token swap | Fix one winner and port it folder-and-all. Swap only in units of `theme.css`+`palette.ts` mirroring (§4) |

---

## Decisions needed (user/lead judgment — finalize before implementation)

| # | Item | Options | What's at stake |
|---|---|---|---|
| **D1** | **Design winner mockup** | `05-obsidian` (1st) / `04-broadcast-arena` (2nd) / other | The methodology is mockup-independent — just finalize and do a folder port + one palette mirror. §4 |
| **D2** | **game3 `e.t` stamping policy** | (a) trust client stamp / (b) re-stamp with server arrival time / (c) clamp after server validation | game3 judging determinism·fairness·cheat resistance. §5-3, mandatory before step 4 |
| **D3** | **Client prediction on/off** | (a) dumb render only (default) / (b) prediction+reconciliation | If off, full seed non-exposure can be kept. **If on, the seed-exposure tradeoff must be accepted·documented**. §5-2·§7 |
| **D4** | **Server physics tick rate + snapshot period** | physics fixed ~16ms (recommended) / snapshot 20·30·60Hz | Determinism (60fps tuning alignment) + bandwidth. §5-2, premise of step4 verify |
| **D5** | **Round-time model** | (a) fixed 10 seconds (`GAME_DURATION`) / (b) respect variable `timePerRoundSec` | Match orchestration·UI round display. §7 |
| **D6** | **View-snapshot field contract** (handed to the API-spec part) | the exact field set (per game) that `toViewState` will carry | Guarantees non-exposure of authority-only fields like `seed`. §5-3 |

<!-- notify: merge methodology doc done -->
