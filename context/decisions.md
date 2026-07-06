# Decision log (decisions) — append-only

> New decisions are **appended below only** (no editing the past). "What / why". Format: `## YYYY-MM-DD Title`

## 2026-07-04 Game logic follows game-test, design follows design-02
Port only the verified game logic/constants from the game-test branch, and keep the UI/system from design-lab. main is a **standalone structure** that does not reference the lab folders (builds even if deleted). Why: labs are experimental and can disappear at any time. Guard: `scripts/check-standalone.sh`.

## 2026-07-04 Netcode = server-authoritative "dumb client" (no prediction)
Client→server is input keys only, server→client is state only. All games use the same socket envelope. Why: anti-cheat + removes per-game special sync logic.

## 2026-07-04 DB uses A/B slots (does not record roles)
game_match (playerA/playerB), game_round (result=A_WIN/B_WIN/DRAW). Win/loss is per match, win rate is per round. Why: roles (P1/P2) are display-only, not persistent data.

## 2026-07-05 Online input uses only the two keys U/I
A connected player uses only U (slotA) and I (slotB); the server rewrites them into role physical keys. The bottom control bar also shows only the U/I of my role (color). Why: one hand, two buttons + removes the "which character am I" confusion.

## 2026-07-05 Color (role) is fixed per match
The role, which used to be random each round, is assigned only once at match start (server/src/match.ts constructor). Why: so the color does not change within a match (Jonghyeok's request).

## 2026-07-05 Server tick 60Hz
TICK_MS 33→16. Why: matches the client rAF to reduce online render stutter for fast games (Dino etc.).

## 2026-07-05 Gomoku cursor is derived locally on the client
Instead of the server broadcasting the scan cursor, the client computes it locally from turnClock and only sends the cell at the moment it is placed. Why: removes 30Hz jitter + "the server only needs to know the chosen cell".

## 2026-07-05 Deploy = rsync + tmux script, secrets kept separate
`scripts/deploy.sh` (code rsync + remote tmux restart, `server/.env` excluded). Secrets stay out of git: DB password = VM's server/.env, SSH key = each person's ~/.ssh, deploy config = local deploy.env. Why: collaborators/AI can reproduce the deploy + prevent secret leaks.

## 2026-07-05 Agent context sharing = root AGENTS.md + context/ folder
Since it is a single codebase, manage it atomically in one history with the code instead of a separate repo. Why: multiple people/AI touch the same main and need to share progress, decisions, and current work.
