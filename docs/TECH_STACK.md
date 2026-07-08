# MADCADE Tech Stack Decision Record

> **Document purpose**: a single reference document so that every person/AI agent involved in MADCADE's implementation works on the same technical premises.
> **Status**: finalized (2026-07-03) · **Deciders**: Jonghyeok + PA session design discussion
> **To AI agents**: do not make stack choices that conflict with this document (e.g. introducing Next.js, using NoSQL). If a change is needed, do not implement it — propose it to the decider with rationale.

---

## 1. Project summary

**MADCADE** — a 1:1 versus web mini-game platform. Immersion-camp class-unit groups, Google login, online matchmaking (quick start / code room) + offline (2 players on one computer), score·class leaderboards, admin console (group/roster/match-result management).

### Canonical documents (this priority order on conflict)
1. **Screen design doc**: Figma `2aG8r8fE4uEE5ALmETw2GG` — **only the root node 16:1263 "ver4" board is canonical** (ignore other version boards)
2. **Feature-definition doc**: Google Sheets `1fsjsZiZuB1V2dmKrDIxptzl0vKksL4g1_4pz_Fjz1x8` — tab "madpump v1" (gid=36572904). ⚠️ The "consumer-app feature-definition" tab in the same document is **a different project**, so do not read it.
3. **ERD**: `docs/ERD.md` (includes DDL — schema canonical). ERDCloud "MAD PUMP" (https://www.erdcloud.com/d/uZf9hpd2EinvksbP3) is for visualization

### The 3 games
| # | Game | Rule summary | Netcode difficulty |
|---|---|---|---|
| 1 | Number Guess | Match your number to the target number (1~100) with the ±buttons and **win by holding for 3 seconds** | Low (event-based) |
| 2 | Bullet Dodge | P1 (attacker): turn + fire / P2 (dodger): move left/right, dies on hit. Bullet speed random | High (real-time sim) |
| 3 | Fencing | **1-second-tick rock-paper-scissors**: attack (key1)/dodge (key2)/no-action, a 3-way choice. dodge>attack>no-action>dodge, the loser is pushed back 1 tile, a tie has no push. Fall into the sea behind you = defeat (ring-out) | Lowest (1-second tick) |

Common: round count·per-round time setting (host), result recorded as P1 win/P2 win/draw, control keys playerL={q,w} playerR={u,i} (changeable).

---

## 2. Stack decision table

| Layer | Finalized stack | Version policy |
|---|---|---|
| Language | **TypeScript** (client/server common) | latest stable |
| Client | **Vite + React** | SPA. React Router |
| Game rendering | **Canvas 2D + requestAnimationFrame**, pure TS modules (outside React) | no framework intervention in the game loop |
| Real-time comms | **Socket.IO** (client/server) | leverage built-in room feature |
| Server | **Node + Fastify + Socket.IO single process** | static files + REST + WS in one |
| DB | **MySQL + Prisma** | schema from ERDCloud DDL → prisma db pull/migrate |
| Auth | Google OAuth authorization-code flow (server-handled) + **session cookie**. admin has a separate ID/PW (bcrypt) | no JWT (sessions are enough) |
| File storage | **Cloudflare R2** (S3-compatible) — for profile photo upload. Server resizes to 256² webp via sharp + strips EXIF before upload, DB stores only the key | upload is primary, Google profile is the default (ERD doc note 12) |
| Repo structure | **npm workspaces monorepo** (`client/` + `server/` + `shared/`) | |
| Deployment | Railway or Fly.io **single service** + managed MySQL | no Vercel (section 3 below) |

## 3. Decision rationale (why this way)

- **Excluding Next.js**: this app has no meaningful SSR/SEO (the game is behind login), and **an always-on WebSocket server is mandatory, so it can't run on Vercel serverless** → Next's biggest benefit (deployment) evaporates. Cramming it in with a custom server leaves only complexity. If an intro/marketing page grows later, split just that part into a separate Next site.
- **Adopting React**: the out-of-game UI is a large share — login/nickname onboarding/lobby modals/leaderboard/admin console (tables·tabs·search·edit history). This is the "UI app that looks like a game" domain, where React is a net gain.
- **Canvas outside React**: mixing the game loop (60fps rAF) with the React render model has them interfere with each other. React only mounts the canvas and hands control to the game module.
- **MySQL**: the canonical ERD is ERDCloud and ERDCloud export is MySQL DDL → the design-implementation pipeline connects directly.
- **Server-authoritative judging**: since win/loss·score reflect into the class ranking and external spread (Reddit etc.) is a goal, client-side judging can't be trusted. All win/loss judging is on the server.

## 4. Architecture principles (must-read for implementers)

### 4.1 Game core = pure logic module + input-source abstraction
```
Game core: (state, inputs, dt) => newState   // no I/O·socket·DOM dependency, located in shared/
Input source: LocalKeyboard(1p|2p) | RemoteSocket
```
- **Offline mode** = 2 keyboard inputs into the same core (no server needed)
- **Online mode** = the same core does authority judging on the server + prediction/display on the client
- One game's logic is **shared as a shared package** across client/server — no implementing it twice

### 4.2 Per-game network model
| Game | Model |
|---|---|
| Game 3 Fencing | server collects both inputs in a 1-second tick window → matchup judgment → broadcast result |
| Game 1 Number | client sends only ±1 events, server judges the current value·"hold-for-3-seconds match" timer |
| Game 2 Bullets | server 15~20Hz fixed-tick sim (position·projectile·collision) broadcast, client interpolation render |

### 4.3 Room/matchmaking
- Code room: server issues a code (numeric string), Socket.IO room = the code. Only the host sets rounds.
- Quick start: server in-memory waiting queue → create a room when 2 players fill it.
- Network drop: v1 "just leave it" (feature-doc decision) — reconnection recovery not implemented.

### 4.4 DB pipeline
- Modify schema in ERDCloud → Export SQL → apply to migration (`prisma db pull` then `prisma generate`, or SQL as a migration).
- Match records **require a game_type(1|2|3) column** (for the ranking screen's per-game play count/win rate).
- Score weights etc. must be admin-editable (feature doc "score system — editable in admin") → via a config table.

## 5. Repo skeleton

```
madpump/
├─ package.json           # npm workspaces: client, server, shared
├─ shared/                # game core logic + socket event types (TS)
│  └─ src/games/{game1,game2,game3}/logic.ts
├─ client/                # Vite + React + TS
│  └─ src/{ui,games,net}/ # ui=React screens, games=Canvas renderers, net=socket wrappers
└─ server/                # Fastify + Socket.IO + Prisma
   └─ src/{auth,rooms,games,admin,api}/
```

## 6. Implementation priority (first-launch basis)

1. Monorepo scaffolding + socket round-trip + Google login/nickname onboarding
2. Code-room create/join → **game 3 online** (minimal netcode) → game 1 online
3. Match-result recording + class leaderboard
4. Offline mode (low cost since it reuses the core)
5. Game 2 online (real-time tick) → quick-start matchmaking
6. Admin console (the only chunk feasible after launch)

## 7. Unresolved items (need decider confirmation before implementation)

- Game 3: start position/number of tiles to the cliff, rule for handling multiple inputs within the 1-second gap, judgment at round-time expiry, presence of random elements
- Game 2: layout finalized on the ver4 basis (P1 top track/P2 bottom track) but differed from the sheet text — balance values (bullet speed range) undecided
- Score formula (win/draw/loss weights) — only the admin-editable premise is finalized
