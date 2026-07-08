# MADCADE login design — roster login (v2, 2026-07-05)

> This document is **the source of truth for why login changed from Google OAuth to roster login, and for the current design**.
> Collaborators and AI agents must read this document first before any auth-related work.
> The schema source of truth is `docs/ERD.md` (v2); the implementation is `server/src/index.ts` + `client/src/modals/Login.tsx`.

## 1. Why Google OAuth was dropped

- The deployment environment is a **school internal network (KCLOUD)**, and clients connect only through a VPN.
- Google login (GIS) requires the browser to reach `accounts.google.com`, but
  **the internal-network policy blocks external access, so the OAuth flow itself does not work.**
- Since players are limited to the immersion-camp attendees (55 people) anyway, we **gave up on rigorous authentication**
  and replaced it with a "class → pick your own name from the list" approach. There is no password/token verification.
  (Security-wise, anyone can log in as any name — an intentional trade-off accepted because this is an internal-network-only service.)
- If the entire Google OAuth implementation becomes needed again: it is in commit `21c8f5c` (OAuth login implementation) on the `main` branch.

## 2. Login flow (current)

```
[S1 main] "Login" button
  → [login modal step 1] "Which class are you in?" — Class 1 / Class 2 / Class 3   (GET /api/roster)
  → [login modal step 2] "Pick user" — grid of class member buttons
  → member click → POST /api/login { userId } → session cookie (mp_session) issued → S2 main
```

- From a logged-out state, "Play Online" → login-required modal (S3) → "Login" → the same modal chain,
  and on success continues straight into the online panel (S6).
- Sessions are server in-memory (`server/src/sessions.ts`) — re-login is required after a server restart.
- On refresh, the session is restored via `GET /api/me` (`client/src/main.tsx` → `restoreSession()`).
- The onboarding (nickname entry) screen is dropped — nickname/class are fixed in the roster, so it is unnecessary.

## 3. API

| Method/path | Auth | Description |
|---|---|---|
| `GET /api/roster` | none | Class list + members per class `{ id, nickname }` (for the login dialog) |
| `POST /api/login` `{ userId }` | none | Immediately issue a session for that user. 404 if the id does not exist |
| `GET /api/me` | cookie | Session user `{ id, nickname, imageUrl, groupName }` or `ANON` |
| `POST /api/auth/logout` | cookie | Destroy the session |
| `GET /api/leaderboard` | cookie | My class ranking (game_match aggregation × score_config) |

Removed endpoints: `POST /api/dev/login`, `POST /api/auth/google`, `POST /api/auth/signup`.
Removed dependency: `google-auth-library`.

## 4. DB change (migration `20260705120000_roster_login`)

- Removed from `app_user`: `google_sub`, `email`, `google_image_url` (+ unique `uq_user_google`)
- Nickname uniqueness changed: global `uq_user_nickname` → **per class** `uq_user_group_nick(group_id, nickname)`
  - Reason: the same name exists in different classes (Class 1 "Lee Seojin", Class 3 "Lee Seojin")
- User-creation path changed: no signup → **`prisma/seed.ts` seeds 3 classes + 55 members** (idempotent upsert)

### Apply procedure (where the DB lives — VM or local)

```bash
npm install                                            # reflect removal of google-auth-library
npm --workspace @madcade/server run migrate:deploy     # apply the roster migration
npm --workspace @madcade/server run db:seed            # seed 3 classes + 55 members
npm --workspace @madcade/server run db:cleanup-groups  # (optional) delete junk groups other than Class 1/2/3
```

⚠️ The migration's `CREATE UNIQUE INDEX uq_user_group_nick` fails if there are existing duplicate (class, nickname)
rows. All existing data is test data, so if it fails the simplest fix is to
reset and reseed: `npm --workspace @madcade/server run db:reset` (migrate reset + seed run automatically).

## 5. Roster by class (source of truth: `server/prisma/seed.ts`)

To edit the list, fix `ROSTER` in seed.ts and re-run `db:seed` (upsert, so safe to run any number of times).
The login dialog reads the DB (`GET /api/roster`), so no client code changes are needed.

- **Class 1 (16 people)**: Lee Jimin, Park Junseo, Ra Taehyeong, Lee Jonghyeok, Yu Nayeon, Yu Yeongseok, Kim Taehyeon, Kwon Sunho, Lee Yudam, An Jonghwa, Heo Seojun, Lee Seojin, Jeong Seoyeong, Lee Yewon, Kim Huiseo, Ju Seongmin
- **Class 2 (19 people)**: Park Seoyun, Choi Jaeyun, Kim Minjae, Lee Yeji, Kim Gyeongwon, Lee Jaejun, Yang Uhyeon, Ju Yeongjun, Park Jimin, Hwang Siu, Park Chaehun, Park Soyo, Won Geonhui, Lee Seoyeong, Im Yubin, Park Dohyeon, Park Jeongjun, Kim Dohyeon, Kim Doyeon
- **Class 3 (20 people)**: Son Gihwan, Kim Yunseo, Yang Hoseong, Jeong Yujin, Kim Min, Jo Yejun, An Sohui, Lee Seojin, Kang Uhyeon, Song Jaehun, Lee Jio, Kim Jaehun, Im Seongjin, Park Jiho, Jo Junho, Kim Gyumin, Seo Yeongbin, Kim Hyeri, Park Suhyeon, Park Minsu

## 6. Related file map

| Area | File | Role |
|---|---|---|
| Server | `server/src/index.ts` | `/api/roster`, `/api/login`, `/api/me`, `/api/leaderboard` |
| Server | `server/src/sessions.ts` | In-memory session (sid cookie → userId/nickname/groupName) |
| Server | `server/prisma/seed.ts` | Class·roster·game dictionary·score config seed (**roster source of truth**) |
| Server | `server/prisma/migrations/20260705120000_roster_login/` | Migration removing Google columns |
| Client | `client/src/modals/Login.tsx` | Login modal 2 steps (class → member), `openLoginModal()` |
| Client | `client/src/state/session.ts` | `restoreSession` / `fetchRoster` / `loginAs` / `logout` |
| Client | `client/src/modals/LoginRequired.tsx` | S3 login-required modal → login modal chain |
