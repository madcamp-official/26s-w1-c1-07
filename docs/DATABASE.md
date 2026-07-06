# MADPUMP DB Documentation (implementation · operation · understanding)

> This document is **for understanding and working with the actually-built DB**.
> - The **design rationale / source of truth** is [`ERD.md`](./ERD.md) (why it looks this way, 17 decision notes).
> - This document (`DATABASE.md`) covers **how it runs, and how to connect / change / query it**.
> - Stack assumptions are in [`TECH_STACK.md`](./TECH_STACK.md).

---

## 0. 30-second summary (TL;DR)

- **Engine**: MySQL 8.0.46, charset `utf8mb4` (Hangul-safe).
- **Location**: inside the KAIST VM (`camp-9`), bound only to `localhost:3306` (`127.0.0.1`) — **external and other VPN users cannot connect to the DB directly**. Only the app (same VM) connects.
- **DB/user**: database `madpump`, app user `madpump@localhost`.
- **Schema management**: Prisma. Source-of-truth file = `server/prisma/schema.prisma` ← this is a port of the MySQL DDL from `ERD.md`.
- **7 tables**: `user_group` · `app_user` · `admin_account` · `game` · `game_match` · `match_edit_history` · `score_config`.
- **Seed**: `game` 3 rows (Number Guess / Dodge Bullets / Fencing), `score_config` 1 row (win 3 · draw 1 · loss 0).
- **To connect from your PC**, one SSH tunnel line: `ssh -N -L 3306:localhost:3306 kaistvm` (see §3).

---

## 1. Where and how it lives (physical layout)

```
┌ KAIST VM  camp-9 (Ubuntu 22.04, 172.10.8.242 = VPN internal) ┐
│                                                               │
│   ┌ Node/Fastify app (planned) ┐    ┌ MySQL 8 ┐               │
│   │  @prisma/client        │──TCP──▶│ :3306   │ (127.0.0.1)   │
│   └────────────────────────┘        │ DB=madpump             │
│                                     └─────────┘               │
└───────────────────────────────────────────────────────────────┘
       ▲ external access only via SSH tunnel (dev PC → VM)
```

- MySQL is open **only on the VM's local loopback (127.0.0.1)**. Others on the same camp network / VPN cannot connect to `3306` directly either → only the app and developers (via SSH tunnel) can reach it.
- Data-loss protection: currently a single instance (no backup configured). See ops notes §9.

---

## 2. Schema management approach (Prisma + migrations)

**Single source chain:** `ERD.md` (design) → `server/prisma/schema.prisma` (code source of truth) → `prisma/migrations/*` (applied history) → MySQL.

- To change the schema, **edit `ERD.md` first**, then reflect it into `schema.prisma` and create a migration. (No reverse order — editing only the code drifts from the source of truth.)
- Applied history is recorded in the DB's `_prisma_migrations` table. Currently applied migration: **`0_init`** (initial creation of the entire schema).

---

## 3. How to connect (3 situations)

The connection string is managed in a single `DATABASE_URL` in `server/.env` (`.env` is **not committed**; the example is `server/.env.example`).

### (a) The app connects directly inside the VM — actual production
```
DATABASE_URL="mysql://madpump:<VM_DB_PASSWORD>@localhost:3306/madpump"
```

### (b) Migrate/query the VM DB from your PC — SSH tunnel
```bash
# Terminal 1: keep the tunnel up (maps VM localhost:3306 to your PC's 127.0.0.1:3306)
ssh -N -L 3306:localhost:3306 kaistvm
# Terminal 2:
#   .env → DATABASE_URL="mysql://madpump:<VM_DB_PASSWORD>@127.0.0.1:3306/madpump"
npm --workspace @madpump/server run migrate:deploy
```
> With the tunnel, the connection looks like `localhost` from the VM's side, matching the `madpump@localhost` privileges. You get remote management without exposing MySQL externally.

### (c) Develop with local docker — unrelated to the VM
```bash
docker compose up -d      # root docker-compose.yml → 127.0.0.1:3307
# .env → DATABASE_URL="mysql://madpump:devpass@127.0.0.1:3307/madpump"
npm --workspace @madpump/server run migrate:deploy
npm --workspace @madpump/server run db:seed
```

The **VM DB password** is not in the repo. It lives only in `server/.env` (VM) and a separate secure store. If lost, see the reset procedure in §9.

---

## 4. ER diagram

```mermaid
erDiagram
    user_group ||--o{ app_user : "member of (optional)"
    game ||--o{ game_match : "game type"
    app_user ||--o{ game_match : "player1"
    app_user ||--o{ game_match : "player2"
    game_match ||--o{ match_edit_history : "edit history"
    admin_account ||--o{ match_edit_history : "editor"
    admin_account ||--o{ score_config : "last editor (optional)"

    user_group {
        bigint id PK
        varchar name UK
        boolean is_public
        datetime created_at
    }
    app_user {
        bigint id PK
        varchar google_sub UK
        varchar email
        varchar nickname UK
        varchar google_image_url "nullable"
        varchar uploaded_image_key "nullable"
        bigint group_id FK "nullable"
        datetime created_at
        datetime deleted_at "soft delete"
    }
    admin_account {
        bigint id PK
        varchar login_id UK
        varchar pw_hash
        datetime created_at
    }
    game {
        tinyint id PK
        varchar name UK
        boolean is_active
    }
    game_match {
        bigint id PK
        tinyint game_id FK
        bigint player1_id FK
        bigint player2_id FK
        enum result "P1_WIN|P2_WIN|DRAW"
        datetime played_at
        datetime deleted_at "soft delete"
    }
    match_edit_history {
        bigint id PK
        bigint match_id FK
        bigint admin_id FK
        enum before_result
        enum after_result
        datetime edited_at
    }
    score_config {
        tinyint id PK
        int win_points
        int draw_points
        int loss_points
        datetime updated_at
        bigint updated_by FK "nullable"
    }
```

---

## 5. Per-table details (as implemented)

Each table's Prisma model name ↔ the actual table name (snake_case) is linked via `@@map`.

### 5.1 `user_group` — class/group (Prisma: `UserGroup`)
| Column | Type | Constraint | Description |
|---|---|---|---|
| id | BIGINT AI | PK | Group ID |
| name | VARCHAR(100) | UNIQUE `uq_group_name` | Group name (e.g. Immersion Camp Class 1) |
| is_public | BOOLEAN | NOT NULL, default 1 | Whether public |
| created_at | DATETIME(3) | NOT NULL, default now | Creation timestamp |

### 5.2 `app_user` — Google-login user (Prisma: `AppUser`)
| Column | Type | Constraint | Description |
|---|---|---|---|
| id | BIGINT AI | PK | User ID |
| google_sub | VARCHAR(64) | UNIQUE `uq_user_google` | Google OAuth `sub` |
| email | VARCHAR(255) | NOT NULL | Google email (not unique) |
| nickname | VARCHAR(50) | UNIQUE `uq_user_nickname` | Nickname (globally unique) |
| google_image_url | VARCHAR(500) | NULL | Google profile (refreshed each login, default) |
| uploaded_image_key | VARCHAR(300) | NULL | Uploaded-photo storage key (takes priority if present) |
| group_id | BIGINT | NULL, FK→user_group | Class the user belongs to (may be none) |
| created_at | DATETIME(3) | default now | Signup timestamp |
| deleted_at | DATETIME(3) | NULL | soft delete time |

- Index: `ix_user_group(group_id)` — FK helper index for per-class user lookups.
- The reason profile photos use **2 columns**, the display priority, and the upload pipeline are in `ERD.md` note #12.
- The unique-masking logic on account deletion/re-signup is in `ERD.md` note #9 (app logic, DDL unchanged).
  - ⚠️ **Mind the masking length**: when masking `nickname`(VARCHAR 50)/`google_sub`(64)/`email`(255) on soft delete, if the masked value exceeds the column limit the UPDATE fails under MySQL 8 STRICT mode (e.g. a 50-char nickname + the `deleted:<id>:` prefix → over 50 chars). Since unique-release is guaranteed by the PK (`id`) alone, keep the prefix short as `deleted:<id>` and **either do not append the original value or truncate it to the column limit**. (This boundary condition is not spelled out in ERD.md note #9 → must be handled at implementation time.)

### 5.3 `admin_account` — administrator (Prisma: `AdminAccount`)
| Column | Type | Constraint | Description |
|---|---|---|---|
| id | BIGINT AI | PK | Admin ID |
| login_id | VARCHAR(50) | UNIQUE `uq_admin_login` | Login ID |
| pw_hash | VARCHAR(255) | NOT NULL | bcrypt hash |
| created_at | DATETIME(3) | default now | Creation timestamp |

- Authentication **completely separate** from users (Google OAuth). Not JWT — session cookie (`TECH_STACK.md`).

### 5.4 `game` — game-type dictionary (Prisma: `Game`)
| Column | Type | Constraint | Description |
|---|---|---|---|
| id | TINYINT | PK (**not AI**) | Fixed mapping to the code's game number (1/2/3) |
| name | VARCHAR(50) | UNIQUE `uq_game_name` | Game name |
| is_active | BOOLEAN | default 1 | Hide-before-release / temporary-pause switch |

- A **code-mirror** table. A new game = code deploy + adding 1 seed row (`ERD.md` note #15).

### 5.5 `game_match` — match results (Prisma: `GameMatch`)
| Column | Type | Constraint | Description |
|---|---|---|---|
| id | BIGINT AI | PK | Match ID |
| game_id | TINYINT | FK→game | Game type |
| player1_id | BIGINT | FK→app_user | Player 1 |
| player2_id | BIGINT | FK→app_user | Player 2 |
| result | ENUM('P1_WIN','P2_WIN','DRAW') | NOT NULL | Match result (atomic value) |
| played_at | DATETIME(3) | default now | Match time |
| deleted_at | DATETIME(3) | NULL | admin soft delete |

- Records **online matches only** (offline excluded, `ERD.md` note #2). Round details are not stored (note #8).
- Indexes: `ix_match_p1(player1_id, played_at)`, `ix_match_p2(player2_id, played_at)`, `ix_match_played(played_at)`.
- **App validation required**: `player1_id ≠ player2_id` (no matching against yourself, `ERD.md` note #14).

### 5.6 `match_edit_history` — match-edit audit log (Prisma: `MatchEditHistory`)
| Column | Type | Constraint | Description |
|---|---|---|---|
| id | BIGINT AI | PK | History ID |
| match_id | BIGINT | FK→game_match | Target match |
| admin_id | BIGINT | FK→admin_account | Admin who edited |
| before_result | ENUM(...) | NOT NULL | Previous result |
| after_result | ENUM(...) | NOT NULL | New result |
| edited_at | DATETIME(3) | default now | Edit time |

- Each time an admin changes a match result, **1 row is appended** (`ERD.md` note #5). Index `ix_meh_match(match_id, edited_at)`.

### 5.7 `score_config` — score settings (Prisma: `ScoreConfig`)
| Column | Type | Constraint | Description |
|---|---|---|---|
| id | TINYINT | PK | **always 1** (single row) |
| win_points | INT | default 3 | Win points |
| draw_points | INT | default 1 | Draw points |
| loss_points | INT | default 0 | Loss points |
| updated_at | DATETIME(3) | @updatedAt | Edit time (automatic) |
| updated_by | BIGINT | NULL, FK→admin_account | Admin who edited |

- Editable by admin at runtime. Scores are **aggregated at query time**, so changing the weights retroactively recomputes even past matches (v1 intent, `ERD.md` note #17).

---

## 6. Relationships (FK) and delete behavior

| FK | References | onDelete | Meaning |
|---|---|---|---|
| app_user.group_id | user_group.id | Restrict | Groups with members can't be deleted (removal sets group_id=NULL) |
| game_match.game_id | game.id | Restrict | Game types that have matches can't be deleted |
| game_match.player1_id | app_user.id | Restrict | (users are soft-deleted, so no real hard delete) |
| game_match.player2_id | app_user.id | Restrict | (same as above) |
| match_edit_history.match_id | game_match.id | Restrict | (same as above) |
| match_edit_history.admin_id | admin_account.id | Restrict | (same as above) |
| score_config.updated_by | admin_account.id | **SetNull** | Even if the admin is deleted, the config row is kept; only the editor becomes NULL |

> In practice, users and matches are all **soft-deleted** (`deleted_at`), so hard deletes are rare → the Restrict rules above are accident-prevention safeguards.

---

## 7. Seed data (`server/prisma/seed.ts`)

Idempotent upsert. Run with `npm --workspace @madpump/server run db:seed`.

| Table | Seed contents |
|---|---|
| game | `(1,'Number Guess',1)`, `(2,'Dodge Bullets',1)`, `(3,'Fencing',1)` |
| score_config | `(1, win=3, draw=1, loss=0)` |

- Safe to re-run: `game` only syncs names, `score_config` preserves values changed by admin (does not overwrite).

---

## 8. Derived data is a "query," not a table

Scores, win rates, rankings, and headcounts are **not stored but aggregated every time** (enough for a class of a few dozen, `ERD.md` §4). Examples:

**User score + class leaderboard** (excluding deleted matches):
```sql
SELECT u.id, u.nickname, u.group_id,
  COALESCE(SUM(
    CASE
      WHEN m.id IS NULL                                  THEN 0             -- user with 0 matches (LEFT JOIN phantom row) → score 0
      WHEN (m.player1_id = u.id AND m.result = 'P1_WIN')
        OR (m.player2_id = u.id AND m.result = 'P2_WIN') THEN c.win_points
      WHEN m.result = 'DRAW'                              THEN c.draw_points
      ELSE                                                     c.loss_points  -- only actual losses
    END
  ), 0) AS score
FROM app_user u
CROSS JOIN score_config c                        -- single row
LEFT JOIN game_match m
  ON (m.player1_id = u.id OR m.player2_id = u.id)
 AND m.deleted_at IS NULL
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.nickname, u.group_id, c.win_points, c.draw_points, c.loss_points
ORDER BY score DESC;
```

**User play count / win count (for win rate)**:
```sql
SELECT
  COUNT(*) AS plays,
  SUM((m.player1_id=:uid AND m.result='P1_WIN')
   OR (m.player2_id=:uid AND m.result='P2_WIN')) AS wins
FROM game_match m
WHERE (m.player1_id = :uid OR m.player2_id = :uid)
  AND m.deleted_at IS NULL;
```

**Prisma example** (a specific user's valid matches):
```ts
const matches = await prisma.gameMatch.findMany({
  where: {
    deletedAt: null,
    OR: [{ player1Id: uid }, { player2Id: uid }],
  },
  include: { game: true },
});
```
> If it gets slow later, add a score cache column/view then (no premature optimization).

---

## 9. Ops notes

- **Backup**: currently not configured. At minimum, a regular dump is recommended —
  `ssh kaistvm 'mysqldump -uroot madpump' > backup_$(date +%F).sql` (on the VM, root uses socket auth, so no password).
- **Access control**: keep `bind-address=127.0.0.1` (no external exposure). The app uses only `madpump@localhost`; root is for administration.
- **Resetting the DB password** (if lost): on the VM,
  `sudo mysql -e "ALTER USER 'madpump'@'localhost' IDENTIFIED BY '<new_password>'; FLUSH PRIVILEGES;"` → update `server/.env`.
- **Schema reset** (re-init during dev): `npm --workspace @madpump/server run db:reset` (⚠️ deletes all data, then re-migrates + seeds).

---

## 10. Intentional differences vs the original DDL (honest disclosure)

The differences between the pure MySQL DDL in `ERD.md` and the implementation (Prisma). Most are points that **mean the same and only differ in notation**, but the one item where delete behavior actually differs (#7) is marked separately:

1. **`DATETIME` → `DATETIME(3)`**: Prisma defaults to millisecond precision. Same meaning (just more precise).
2. **Added `DEFAULT CURRENT_TIMESTAMP(3)` to `created_at`/`played_at`/`edited_at`**: the DDL had no DEFAULT. A safe fallback that stamps a creation time even if the app doesn't set one (good fallback — it doesn't fabricate missing data).
3. **`before_result`/`after_result` VARCHAR(10) → ENUM**: applies the "value restriction" required by `ERD.md` note #16 consistently to the history columns too, not just `game_match.result` (same domain).
4. **`updated_at` is `@updatedAt`**: auto-updated on row edit.
5. **onUpdate: Cascade** (Prisma default) attached to FKs: since these are surrogate keys (auto-increment) the PK never changes, so effectively a no-op.
6. **BIGINT id ↔ JS `bigint`**: Prisma maps BIGINT to JS `bigint`. **Beware JSON serialization in the API** — `JSON.stringify(bigint)` throws. A serialization helper that converts to string/number right before the server response is needed (e.g. `BigInt.prototype.toJSON = function(){return this.toString()}` or a response mapper). This game's id scale is small, but the column type follows the source of truth (BIGINT).
7. **`fk_cfg_admin` is `ON DELETE SET NULL`** (⚠️ the only differing delete behavior): the original DDL (`ERD.md`) has no ON DELETE clause, so it's implicitly RESTRICT, but this FK alone is implemented as SET NULL. Because `updated_by` is nullable (optional), the intent is to **preserve the `score_config` row even when the admin is deleted, clearing only the editor to NULL** (see §6 table). The other 6 FKs match the DDL's implicit value (RESTRICT). Only this item changes the actual delete result, not just notation.

---

## 11. Related documents
- [`ERD.md`](./ERD.md) — schema **source of truth + design rationale** (entity overview, relationships, full DDL, 17 decision notes, derived data).
- [`TECH_STACK.md`](./TECH_STACK.md) — full tech-stack decisions.
- `server/prisma/schema.prisma` — code source of truth. `server/prisma/migrations/0_init/` — the applied DDL.
