# Structure & core contracts (architecture)

## Layers
```
shared/  10 game cores (pure tick) + input contract + socket events/types   ← shared by client & server
client/  React SPA. Screen/canvas render + online netcode (socket store/hooks)
server/  Fastify+Socket.IO single process. Sessions, match runner, Prisma
```

## Game core contract (shared/src/games)
- `GameCore { create(rand) → state, step(state, GameInputEvent[], dt) → state }`. Pure function, no I/O.
- `GameInputEvent { code:'KeyQ'|'KeyW'|'KeyU'|'KeyI', type:'down'|'up', t, cell? }`. `cell` only for Gomoku etc.
- `GameResult = 'P1'|'P2'|'DRAW'|null`. `GAME_DURATION=10`. Offline and online share the same core.
- Registry: `GAME_CORES` (1–10) in `shared/src/games/registry.ts`.

## Online netcode (server-authoritative)
- Client → server: `game:input` (input keys only). The server rewrites the slot (A/B) into role physical keys.
- Server → client: `game:state` (projected state, seed removed) at 60Hz. The client only draws it.
- Match: `MatchRunner` in `server/src/match.ts`. 3 rounds, a random game each round, color (role) fixed per match.
- Socket envelope / event names: `EV` in `shared/src/net/events.ts`.

## Auth / session
- Session cookie (`mp_session`, httpOnly). The socket handshake authenticates with the same cookie.
- Login: `/api/dev/login` (nickname stub) + Google OAuth (`/api/auth/google`, `/api/auth/signup`, requires `GOOGLE_CLIENT_ID`).

## DB (Prisma + MySQL)
- Schema: `server/prisma/schema.prisma`. User (AppUser, googleSub/email/nickname/group), game_match (playerA/B, result), game_round.
- Live = roles P1/P2, DB = slots A/B. Connection: `DATABASE_URL` (server/.env).

## Client screens
- Routes: `/` (main) `/onboarding` `/select` `/game/1~10`. `App.tsx`.
- Online match nav/overlay: `client/src/net/OnlineController.tsx`. Online store: `net/online.ts`, hook `useOnlineGame`.
- "My color (YOU)" display: `getPlayerDisplays()` (state/flow.ts) reads the online role and decides.

## Standalone rules
main (client/server/shared) must **not reference** `design-lab`/`game-lab`. Copy values if needed. Guard: `npm run check:standalone`.
