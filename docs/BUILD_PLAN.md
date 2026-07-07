# MADCADE execution plan (v1 full-online launch + 10-game expansion)

> The full set of decisions closed via grilling + a single execution roadmap. Source-of-truth priority: implementation plans under `TECH_STACK.md` / `ERD.md`.

---

## 0. Confirmed decision log (grilling results)

| # | Item | Decision |
|---|---|---|
| D1 | Launch scope | **C = full online** (Google login + online matchmaking + result saving + leaderboard) |
| D2 | Room/queue storage | **server memory** (`Map`), not DB. Only results in DB. |
| D3 | Match structure | **3 rounds, always run to completion** (no early clinch). Match winner = round majority, tie = DRAW |
| D4 | Round game/role | **random game (different each round, evenly distributed) + random role** |
| D5 | Schema | `game_match`(playerA/B, result) + **new `game_round`**. enum→`A_WIN/B_WIN/DRAW`. Game role (P1/P2) not stored in DB |
| D6 | Leaderboard | Ranking = **per match** (win 3/draw 1/loss 0), per-game win rate = **per round** |
| D7 | Netcode | **dumb client**·server-authoritative·games 2·3 ~30Hz·no prediction·game3 `t` clamp |
| D8 | Disconnect handling | **no interruption** — server computes to the end, results always saved. **Rounds auto-count-down on the server**. `match:aborted` = notification alert only |
| D9 | Game select screen | **fully removed** (random both online and offline). The **match runner** runs 3 games in sequence |
| D10 | Profile | Changed in onboarding+settings. Storage = **VM local disk** (R2 not used) |
| D11 | admin | v1 = core (login·score edit·result edit·group creation·member list). Member CRUD = fast-follow |
| D12 | Game count | 10 games' logic+constants complete (game-test branch). Games 1~3 launch + **games 4~10 fast-follow (parallel)** |
| D13 | Games 4~10 build | **built entirely from scratch**. No reusing the game-lab renderer / no shells. Reuse logic·constants only. Per-game subagent. Design is **read and copied** from PLAN.md/theme.css (no referencing). Self-containment test required |
| D14 | Session | Server in-memory. Nickname 1~20 chars, unique. Classes seeded into DB |

---

## 1. Two-layer architecture (core invariant)

- **Live/protocol layer**: `P1/P2` = that round's game role (returned by the core). Random each round. Used in socket events.
- **DB layer**: `A/B` = the two fixed participant identities. Only "who won" is stored. When a round ends the server translates role-result → identity-winner.
- **Server authority**: all judgments are the server's `core.step`. The client sends input + renders state (dumb). Even if disconnected, the server computes to the end.
- **Self-containment**: main (client/server/shared) never references design-lab/game-lab. Enforced by `scripts/check-standalone.sh`.

---

## 2. Schema changes (ERD.md first → schema.prisma → migration)

```
enum MatchResult { A_WIN, B_WIN, DRAW }          // P1_WIN/P2_WIN → A_WIN/B_WIN rename

game_match
  id BIGINT PK · playerA_id FK · playerB_id FK
  result MatchResult · played_at DATETIME · deleted_at DATETIME?

game_round  (new)
  id BIGINT PK · match_id FK→game_match · round_index INT
  game_type TINYINT FK→game · result MatchResult
  UNIQUE(match_id, round_index)

game  (seed 3 rows → expand to 10 rows)
score_config  (win 3/draw 1/loss 0, admin-editable)
match_edit_history  (result enum also A/B)
```

---

## 3. Execution roadmap (2 tracks in parallel)

### Track A — backend/online (sequential, led by me)
| P | Task | Verify |
|---|---|---|
| A0 | Update ERD.md + schema.prisma (game_round·enum rename·game 10 rows) + local docker MySQL migrate/seed | migration succeeds, seed 10 games |
| A1 | Server skeleton: Fastify+Socket.IO, `shared/src/net/events.ts` unified envelope, **dev login stub**, handshake + `lobby:hello` | two tabs socket-connected |
| A2 | Lobby: code room (room:*) + quick start (global FIFO queue) + room:state broadcast | two tabs matchmade |
| A3 | **Match runner + game 1 online vertical slice**: server-authoritative step loop, 3 rounds random·random-role·auto countdown, game:input/state, disconnect = compute-to-end, match:end → game_match+game_round INSERT | login → matchmaking → online play → result saved to DB → reflected in leaderboard |
| A4 | Bring games 2·3 online (reusing the same envelope) + ~30Hz | 3 games online |
| A5 | Real Google OAuth + session cookie + onboarding (nickname·class) → replace the stub | actual login |
| A6 | Profile (onboarding+settings, VM local disk) + admin core (score·result edit·group creation·member list) | profile change·admin works |
| A7 | VM deploy: KAIST VM server+DB, remote 2-player test | real-device remote play |

### Track B — content (parallel, subagent team)
| P | Task | Verify |
|---|---|---|
| B0 | Vendor games 4~10 logic+constants into main `shared/`, expand GameId 1~10 | typecheck |
| B1 | **Build 7 fully new screens for games 4~10** (per-game subagent, new neon UI, reuse logic·constants only, 0 design-lab references) | build + browser + self-containment test |
| B2 | Fold into the match runner (game pool = all is_active) | new games appear in random matches |

**Launch (Saturday) = A0~A5 + games 1~3.** Games 4~10 (B1)·admin expansion·profile enhancement are fast-follow right after.

---

## 4. Games 4~10 build rules (D13 detail)

Each game = a dedicated subagent + individual instructions. Rules:
1. **Use as-is** `@madcade/shared`'s `gameN.create/step` + `GN` constants (no reimplementing logic).
2. **No reusing/copy-pasting/shelling** the game-lab renderer — build the screen·rendering **fully new**.
3. Design = **read** `design-lab/ideas/02-neon-coinop/PLAN.md` (source of truth)·`theme.css` (tokens) **and copy only the values into main**. **Never import from design-lab paths.**
4. Reuse the neon system (HudFrame·KeyCap·Button·CRT bezel·theme tokens, already copied into main).
5. Read the games 1~3 screens as a wiring-pattern reference but do not copy the code.
6. **Self-containment verification**: `check-standalone.sh` + umbilical cut (move design-lab aside and build).

---

## 5. Verification gates (common to every step)
- Each step is done only after it **works observably**, then move on.
- `npm run check:standalone` passes at all times (0 design-lab/game-lab references).
- Online judgment is confirmed deterministic by "replaying the same input sequence, server result == local sim".
