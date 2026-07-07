# AGENTS.md — MADCADE

The entry point AI agents read before working in this repo. (Good for humans to read too.)
**At the start of a session, read the `context/` folder first** — the progress so far, decisions, and who is doing what live there.

## What this project is
1v1 two-button (online = U·I) minigame battles. An npm workspaces monorepo.
- `shared/` — 10 game cores (pure `tick`) + unified input contract + socket events/types (`@madcade/shared`)
- `client/` — React18 + Vite SPA. Screens, canvas rendering, online netcode
- `server/` — Fastify + Socket.IO single process. Session-cookie auth, server-authoritative match runner, Prisma (MySQL)
- `docs/` — specs (API_SPEC/MERGE_PLAN/BUILD_PLAN/ERD/DEPLOY)
- `context/` — **progress, decisions, current work** (shared agent context)
- `design-lab/`, `game-lab/` — experimental reference folders. **main code must not reference these** (it must still build if they are deleted)

## Commands
```bash
npm install                              # once at the root (workspaces)
npm run dev -w @madcade/client           # client dev → localhost:5173
npm --prefix server run dev              # server dev (tsx watch) → localhost:3000
npm --prefix client run build            # client production build (client/dist)
npm --prefix shared run typecheck        # typecheck (shared/server/client each)
npm --prefix server run typecheck
npm --prefix client run typecheck
npm run check:standalone                 # standalone guard (checks main does not reference lab folders)
bash scripts/deploy.sh                   # deploy (first cp deploy.env.example deploy.env)
```
DB: `docker compose up -d` (local MySQL 3307) / prisma runs from `server/` (`npm --prefix server run prisma:generate`, `db:seed`). For deploy, see `docs/DEPLOY.md`.

## Code conventions
- Use **only the `shared` core** for game logic/judgment (no reimplementation). Screens render directly to canvas.
- Online input is **only the two keys U/I**. The server rewrites slot → role physical keys (anti-cheat).
- Netcode = server-authoritative "dumb client" (no prediction). The client draws the server state and only sends input.
- Follow the surrounding code style, comment density, and naming as-is.

## Boundaries
- ✅ Always: before committing, confirm `typecheck` + `build` + `check:standalone` pass. `git pull` before working.
- ⚠️ Ask first: `git push`, deploy (`deploy.sh`), **shared VM DB migration/reset**, any outbound action.
- 🚫 Never: **commit secrets** like `.env` · `deploy.env` · SSH keys. Never reference `design-lab`/`game-lab` from main.

## Commits
- In small units. Messages in Korean (repo convention). `git pull --rebase` before push.
- Many contributors (humans + multiple AIs) touch the same main → write **what you are doing now** in `context/now.md` before you start.

## Deploy target
KAIST VM (internal network) → **http://172.10.8.242**. The server is a single process: static-serving client/dist + API + socket.
