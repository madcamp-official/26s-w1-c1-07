# Progress (progress)

> Update when a big change happens. Last update: 2026-07-05

## ✅ Done
- **Monorepo implementation**: client (React18+Vite) / server (Fastify+Socket.IO) / shared (game cores). Standalone structure (does not reference lab folders).
- **10 minigames**: Number Guess, rocket dodge, fencing, Dino Run, monster bombardment, Pump, Speed Gomoku, magma shooting, Tug of War, Light Cycle. Core (shared) + screen (client) complete.
- **Online multiplayer**: server-authoritative match runner (60Hz tick), 3 rounds (a random game each round / **color = role fixed per match**), session-cookie auth, code room/quick start, disconnect = compute to the end, results recorded to game_match/game_round DB.
- **Online input U/I only**: a connected player controls their role character with the two keys U (primary) and I (secondary). The bottom bar shows only my role (color) controls ("YOU·BLUE/RED").
- **Gomoku cursor**: derived locally on the client instead of server broadcast + only the placed cell is sent.
- **Google OAuth login + class leaderboard**: (teammate's work) `/api/auth/google`, `/api/auth/signup`, per-class record aggregation `/api/leaderboard`. Note: to work, needs `GOOGLE_CLIENT_ID` env + DB schema applied.
- **Deploy**: `scripts/deploy.sh` → KAIST VM (http://172.10.8.242). `docs/DEPLOY.md`.

## 🔧 In progress / needs checking
- Google login live behavior: check that `GOOGLE_CLIENT_ID` is set on client/server + the OAuth schema (googleSub/email/group etc.) is applied to the VM DB.
- Check the leaderboard live-aggregation wiring (mock→real DB) status.

## ⬜ Remaining / ideas
- Public internet exposure (currently KAIST internal network only) → HTTPS tunnel via cloudflared etc. If HTTPS, `COOKIE_SECURE=1`.
- Profile image optimization (p1.png 3.7MB / p2.jpeg 3.1MB — needs resizing).
- admin console.
