# New games 11·12·13 (v1, 2026-07-06, branch new-games-v1)

> 3 games added. Screen UI is all English. Logic source of truth is `shared/src/games/game{11,12,13}/logic.ts`,
> screens are `client/src/screens/game/Game{11,12,13}.tsx`. Integration points in §4.

## Game 11 — HOT POTATO (bomb pass)
- Fuse **fixed at 10s**. The instant elapsed hits 10s it explodes → whoever is **holding the bomb then loses** (no draws).
- **Q(P1)/U(P2) = PASS** — hand it to the opponent. Right after receiving, you **can't pass again for 0.2s (RECEIVE_CD)** ("pass delay").
- **W(P1)/I(P2) = FAKE** — feint animation (no mechanical effect, 0.3s cooldown).
- Auto-passes when the **max hold of 1.5s** is exceeded. Starting holder is random.
- Screen: countdown hidden from 3s remaining, the bomb goes black→orange as the fuse progresses, on explosion the losing side plays the blast animation.

## Game 12 — RED LIGHT, GREEN LIGHT (the RED LIGHT, GREEN LIGHT game)
- Two players advance from the left start line (pos 0) toward the "it"/tagger and finish line on the right (pos 1).
- **Q/U = RUN** (mash, has momentum — decelerates if you don't press), **W/I = STOP** (hard stop, v=0).
- The "it": green (safe) ↔ red (staring/dangerous), with a **0.2s telegraph (turning)** just before red. During red, a speed at or above the threshold (0.12) means **caught → instant loss**.
- If both are caught on the same frame, the one **closer to the "it" (larger pos) gets eaten and loses**. Reaching the finish line while it isn't red = instant win. When time runs out, the closer side wins.
- Tuning: speed is lowered (V_MAX 0.6) so a single green can't reach the finish line — you must clear several reds to arrive. Coasting alone can't stop within 0.2s → you must hard-stop to be safe.

## Game 13 — POT SHOT (burst the pot)
- A pot in the center bobs up and down (period random 2~3s). P1 cannon bottom-left / P2 cannon bottom-right.
- **Q/U hold = angle sweeps 0~90°** (90° in 0.25s), release to lock. **W/I hold = charge power** (MAX in 1s), **fires the instant you release**. 0.4s reload after firing.
- A parabolic projectile (gravity 900) scores +1 when it hits the pot. During the 10s time limit, **whoever hits more wins**.
- Physics tuning: angle 30°→bottom of the pot · 45°→center · 60°→top (at MAX power) covers the pot's vertical range → an aiming puzzle of angle + power + firing timing.

## 4. Integration points (where each added game touched)
| Category | File | Contents |
|---|---|---|
| Logic | `shared/src/games/game{11,12,13}/logic.ts` | Core (create/step, State, G constants). New |
| Registration | `shared/src/games/registry.ts` | GameId union `…\|13`, GAME_CORES, ALL_GAME_IDS |
| Barrel | `shared/src/index.ts` | game11~13 namespaces · G11~13 · State · (G12 exports isRed/isTelegraph) |
| Coins | `shared/src/coins.ts` | GAME_ORDER `[1..13]`. **LOCKABLE fixed at `[9,10]`** (new ones are free, bitmask meaning preserved) |
| Seed | `server/prisma/seed.ts` | game 11~13 rows + **2-stage name upsert** (avoids renumbered-name collisions) |
| Client types | `client/src/shell/types.ts` | GameId `…\|13` (separate source of truth from shared) |
| Client arrays | `client/src/state/flow.ts` (ALL_GAME_IDS), `client/src/shell/mock.ts` (GAME_IDS) | `[1..13]` |
| Names | `client/src/game/gameNames.ts` | 11 HOT POTATO / 12 RED LIGHT, GREEN LIGHT / 13 POT SHOT (English) |
| Routes | `client/src/App.tsx` | import + `/game/{11,12,13}` |
| Intro | `client/src/screens/game/RoundIntro.tsx` | COPY 11~13 (English copy) |
| Slot | `client/src/net/MatchIntro.tsx` | SPIN_STRIP `[1..13]` |
| Screen | `client/src/screens/game/Game{11,12,13}.tsx` + `game{N}.css` | Canvas render (English UI). New |

**Untouched (registry/data-driven):** server's game-adapter · match · index (sanitizeGames · slot draw), GameSelect · Settings (ALL_GAME_IDS · GAME_NAMES driven), GamePictogram (fallback), net/online · useOnlineRender (generic).

## 5. Verification
- All 3 cores pass headless sim: G11 (auto-pass · cooldown · 10s explosion), G12 (cautious 40:0 reckless, arrives ~2.2s after clearing several reds), G13 (30/45/60° cover pot bottom/center/top, charge-fire-reload cycle, hit count).
- Client typecheck · production build pass. game.name matches the DB seed code (13 rows).
- ⚠️ The DB's `game` names that were left in the pre-renumber mapping were corrected via a 2-stage seed upsert. **`db:seed` is also needed on the deploy VM.**

## 6. Deploy checklist
1. `npm install` (no new dependencies) → `npm --workspace @madcade/server run db:seed` (game 11~13 rows + name correction)
2. No new migrations (schema unchanged — the game dictionary is managed only by seed)
3. Rebuild client
