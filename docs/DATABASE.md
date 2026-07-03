# MADPUMP DB 문서 (구현·운영·이해용)

> 이 문서는 **실제로 구축된 DB를 이해하고 다루기 위한** 문서다.
> - **설계 근거/정본**은 [`ERD.md`](./ERD.md) (왜 이렇게 생겼는지, 17개 결정 노트).
> - 이 문서(`DATABASE.md`)는 **어떻게 돌아가고, 어떻게 접속·변경·조회하는지**.
> - 스택 전제는 [`TECH_STACK.md`](./TECH_STACK.md).

---

## 0. 30초 요약 (TL;DR)

- **엔진**: MySQL 8.0.46, 문자셋 `utf8mb4`(한글 안전).
- **위치**: KAIST VM(`camp-9`) 안, `localhost:3306` 에만 바인딩(`127.0.0.1`) — **외부·VPN 다른 사용자도 DB엔 직접 못 붙음**. 앱(같은 VM)만 접속.
- **DB/유저**: 데이터베이스 `madpump`, 앱 유저 `madpump@localhost`.
- **스키마 관리**: Prisma. 정본 파일 = `server/prisma/schema.prisma` ← 이건 `ERD.md`의 MySQL DDL을 옮긴 것.
- **테이블 7개**: `user_group` · `app_user` · `admin_account` · `game` · `game_match` · `match_edit_history` · `score_config`.
- **시드**: `game` 3행(숫자 맞추기/총알 피하기/펜싱), `score_config` 1행(승3·무1·패0).
- **내 PC에서 접속**하려면 SSH 터널 한 줄: `ssh -N -L 3306:localhost:3306 kaistvm` (§3 참조).

---

## 1. 어디에, 어떻게 살아있나 (물리 구성)

```
┌ KAIST VM  camp-9 (Ubuntu 22.04, 172.10.8.242 = VPN 내부 전용) ┐
│                                                               │
│   ┌ Node/Fastify 앱 (예정) ┐        ┌ MySQL 8 ┐               │
│   │  @prisma/client        │──TCP──▶│ :3306   │ (127.0.0.1)   │
│   └────────────────────────┘        │ DB=madpump             │
│                                     └─────────┘               │
└───────────────────────────────────────────────────────────────┘
       ▲ SSH 터널 (개발자 PC → VM) 로만 외부에서 접근
```

- MySQL은 **VM 로컬(127.0.0.1)에만** 열려 있다. 같은 캠프망/VPN의 다른 사람도 `3306`엔 직접 못 붙는다 → 앱과 (SSH 터널 쓴) 개발자만 접근.
- 데이터 손실 방지: 지금은 단일 인스턴스(백업 미설정). 운영 메모 §9 참조.

---

## 2. 스키마 관리 방식 (Prisma + 마이그레이션)

**단일 소스 체인:** `ERD.md`(설계) → `server/prisma/schema.prisma`(코드 정본) → `prisma/migrations/*`(적용 이력) → MySQL.

- 스키마를 바꾸려면 **`ERD.md`를 먼저 고치고**, 그 다음 `schema.prisma`에 반영한 뒤 마이그레이션을 만든다. (역순 금지 — 코드만 고치면 정본과 어긋남)
- 적용 이력은 DB의 `_prisma_migrations` 테이블에 기록된다. 현재 적용된 마이그레이션: **`0_init`** (전체 스키마 최초 생성).

---

## 3. 접속 방법 (3가지 상황)

연결 문자열은 `server/.env` 의 `DATABASE_URL` 하나로 관리한다 (`.env`는 **커밋 금지**, 예시는 `server/.env.example`).

### (a) VM 안에서 앱이 직접 — 실제 운영
```
DATABASE_URL="mysql://madpump:<VM_DB_PASSWORD>@localhost:3306/madpump"
```

### (b) 내 PC에서 VM DB로 마이그레이션/조회 — SSH 터널
```bash
# 터미널 1: 터널 유지 (VM localhost:3306 을 내 PC 127.0.0.1:3306 으로)
ssh -N -L 3306:localhost:3306 kaistvm
# 터미널 2:
#   .env → DATABASE_URL="mysql://madpump:<VM_DB_PASSWORD>@127.0.0.1:3306/madpump"
npm --workspace @madpump/server run migrate:deploy
```
> 터널을 쓰면 VM 입장에서 접속이 `localhost`로 보여 `madpump@localhost` 권한과 맞는다. MySQL을 외부에 노출하지 않고도 원격 관리가 된다.

### (c) 로컬 docker로 개발 — VM과 무관
```bash
docker compose up -d      # 루트의 docker-compose.yml → 127.0.0.1:3307
# .env → DATABASE_URL="mysql://madpump:devpass@127.0.0.1:3307/madpump"
npm --workspace @madpump/server run migrate:deploy
npm --workspace @madpump/server run db:seed
```

**VM DB 비밀번호**는 저장소에 없다. `server/.env`(VM), 그리고 별도 보관처에만 있다. 분실 시 §9의 재설정 절차.

---

## 4. ER 다이어그램

```mermaid
erDiagram
    user_group ||--o{ app_user : "소속(선택)"
    game ||--o{ game_match : "게임 종류"
    app_user ||--o{ game_match : "player1"
    app_user ||--o{ game_match : "player2"
    game_match ||--o{ match_edit_history : "수정이력"
    admin_account ||--o{ match_edit_history : "수정자"
    admin_account ||--o{ score_config : "최종수정자(선택)"

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

## 5. 테이블별 상세 (구현된 대로)

각 테이블의 Prisma 모델명 ↔ 실제 테이블명(snake_case)은 `@@map` 으로 연결돼 있다.

### 5.1 `user_group` — 분반/그룹 (Prisma: `UserGroup`)
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT AI | PK | 그룹 ID |
| name | VARCHAR(100) | UNIQUE `uq_group_name` | 그룹명(예: 몰입캠프 1분반) |
| is_public | BOOLEAN | NOT NULL, default 1 | 공개 여부 |
| created_at | DATETIME(3) | NOT NULL, default now | 생성일시 |

### 5.2 `app_user` — 구글 로그인 유저 (Prisma: `AppUser`)
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT AI | PK | 유저 ID |
| google_sub | VARCHAR(64) | UNIQUE `uq_user_google` | 구글 OAuth `sub` |
| email | VARCHAR(255) | NOT NULL | 구글 이메일 (유니크 아님) |
| nickname | VARCHAR(50) | UNIQUE `uq_user_nickname` | 닉네임(전역 유니크) |
| google_image_url | VARCHAR(500) | NULL | 구글 프로필(매 로그인 갱신, 기본값) |
| uploaded_image_key | VARCHAR(300) | NULL | 업로드 사진 스토리지 키(있으면 우선) |
| group_id | BIGINT | NULL, FK→user_group | 소속 분반(무소속 가능) |
| created_at | DATETIME(3) | default now | 가입일시 |
| deleted_at | DATETIME(3) | NULL | soft delete 시각 |

- 프로필 사진이 **2컬럼**인 이유·표시 우선순위·업로드 파이프라인은 `ERD.md` note #12.
- 계정 삭제/재가입 시 유니크 마스킹 로직은 `ERD.md` note #9 (앱 로직, DDL 무변경).

### 5.3 `admin_account` — 관리자 (Prisma: `AdminAccount`)
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT AI | PK | 관리자 ID |
| login_id | VARCHAR(50) | UNIQUE `uq_admin_login` | 로그인 아이디 |
| pw_hash | VARCHAR(255) | NOT NULL | bcrypt 해시 |
| created_at | DATETIME(3) | default now | 생성일시 |

- 유저(구글 OAuth)와 **완전히 분리된** 인증. JWT 아님, 세션 쿠키(`TECH_STACK.md`).

### 5.4 `game` — 게임 종류 사전 (Prisma: `Game`)
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | TINYINT | PK (**AI 아님**) | 코드의 게임번호(1/2/3)와 고정 매핑 |
| name | VARCHAR(50) | UNIQUE `uq_game_name` | 게임 이름 |
| is_active | BOOLEAN | default 1 | 배포 전 숨김/임시중단 스위치 |

- **코드 미러** 테이블. 새 게임 = 코드 배포 + 시드 1행 추가(`ERD.md` note #15).

### 5.5 `game_match` — 매치 결과 (Prisma: `GameMatch`)
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT AI | PK | 매치 ID |
| game_id | TINYINT | FK→game | 게임 종류 |
| player1_id | BIGINT | FK→app_user | Player 1 |
| player2_id | BIGINT | FK→app_user | Player 2 |
| result | ENUM('P1_WIN','P2_WIN','DRAW') | NOT NULL | 매치 결과(원자값) |
| played_at | DATETIME(3) | default now | 매치 일시 |
| deleted_at | DATETIME(3) | NULL | admin soft delete |

- **온라인 매치만** 기록(오프라인 제외, `ERD.md` note #2). 라운드 상세는 저장 안 함(note #8).
- 인덱스: `ix_match_p1(player1_id, played_at)`, `ix_match_p2(player2_id, played_at)`, `ix_match_played(played_at)`.
- **앱 검증 필수**: `player1_id ≠ player2_id` (자기 자신과 매치 금지, `ERD.md` note #14).

### 5.6 `match_edit_history` — 매치 수정 감사 로그 (Prisma: `MatchEditHistory`)
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT AI | PK | 이력 ID |
| match_id | BIGINT | FK→game_match | 대상 매치 |
| admin_id | BIGINT | FK→admin_account | 수정한 관리자 |
| before_result | ENUM(...) | NOT NULL | 이전 결과 |
| after_result | ENUM(...) | NOT NULL | 이후 결과 |
| edited_at | DATETIME(3) | default now | 수정 일시 |

- admin이 매치 결과를 바꿀 때마다 **1행 append** (`ERD.md` note #5). 인덱스 `ix_meh_match(match_id, edited_at)`.

### 5.7 `score_config` — 점수 설정 (Prisma: `ScoreConfig`)
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | TINYINT | PK | **항상 1** (단일 행) |
| win_points | INT | default 3 | 승리 점수 |
| draw_points | INT | default 1 | 무승부 점수 |
| loss_points | INT | default 0 | 패배 점수 |
| updated_at | DATETIME(3) | @updatedAt | 수정 일시(자동) |
| updated_by | BIGINT | NULL, FK→admin_account | 수정한 관리자 |

- admin이 런타임에 수정 가능. 점수는 **조회 시점 집계**라, 가중치를 바꾸면 과거 매치까지 소급 재계산됨(v1 의도, `ERD.md` note #17).

---

## 6. 관계(FK)와 삭제 동작

| FK | 참조 | onDelete | 의미 |
|---|---|---|---|
| app_user.group_id | user_group.id | Restrict | 멤버 있는 그룹은 삭제 차단(내보내기는 group_id=NULL) |
| game_match.game_id | game.id | Restrict | 매치가 있는 게임종류 삭제 차단 |
| game_match.player1_id | app_user.id | Restrict | (유저는 soft delete라 실제 하드삭제 없음) |
| game_match.player2_id | app_user.id | Restrict | 〃 |
| match_edit_history.match_id | game_match.id | Restrict | 〃 |
| match_edit_history.admin_id | admin_account.id | Restrict | 〃 |
| score_config.updated_by | admin_account.id | **SetNull** | 관리자 삭제돼도 설정 행은 유지, 수정자만 NULL |

> 실제로는 유저·매치가 전부 **soft delete**(`deleted_at`)라서 하드 삭제가 거의 없다 → 위 Restrict들은 사고 방지용 안전장치다.

---

## 7. 시드 데이터 (`server/prisma/seed.ts`)

멱등 upsert. `npm --workspace @madpump/server run db:seed` 로 실행.

| 테이블 | 시드 내용 |
|---|---|
| game | `(1,'숫자 맞추기',1)`, `(2,'총알 피하기',1)`, `(3,'펜싱',1)` |
| score_config | `(1, win=3, draw=1, loss=0)` |

- 재실행해도 안전: `game`은 이름만 동기화, `score_config`는 admin이 바꾼 값 보존(덮어쓰지 않음).

---

## 8. 파생 데이터는 테이블이 아니라 "조회"다

점수·승률·랭킹·인원수는 **저장하지 않고 매번 집계**한다(분반 수십 명 규모라 충분, `ERD.md` §4). 예시:

**유저 점수 + 분반 리더보드** (삭제 매치 제외):
```sql
SELECT u.id, u.nickname, u.group_id,
  COALESCE(SUM(
    CASE
      WHEN (m.player1_id = u.id AND m.result = 'P1_WIN')
        OR (m.player2_id = u.id AND m.result = 'P2_WIN') THEN c.win_points
      WHEN m.result = 'DRAW'                              THEN c.draw_points
      ELSE                                                     c.loss_points
    END
  ), 0) AS score
FROM app_user u
CROSS JOIN score_config c                        -- 단일 행
LEFT JOIN game_match m
  ON (m.player1_id = u.id OR m.player2_id = u.id)
 AND m.deleted_at IS NULL
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.nickname, u.group_id, c.win_points, c.draw_points, c.loss_points
ORDER BY score DESC;
```

**유저 플레이 수 / 승수(승률 계산용)**:
```sql
SELECT
  COUNT(*) AS plays,
  SUM((m.player1_id=:uid AND m.result='P1_WIN')
   OR (m.player2_id=:uid AND m.result='P2_WIN')) AS wins
FROM game_match m
WHERE (m.player1_id = :uid OR m.player2_id = :uid)
  AND m.deleted_at IS NULL;
```

**Prisma 예시** (특정 유저의 유효 매치):
```ts
const matches = await prisma.gameMatch.findMany({
  where: {
    deletedAt: null,
    OR: [{ player1Id: uid }, { player2Id: uid }],
  },
  include: { game: true },
});
```
> 나중에 느려지면 그때 점수 캐시 컬럼/뷰를 추가한다(성급한 최적화 금지).

---

## 9. 운영 메모

- **백업**: 현재 미설정. 최소한 정기 덤프 권장 —
  `ssh kaistvm 'mysqldump -uroot madpump' > backup_$(date +%F).sql` (VM에선 root가 socket 인증이라 무암호).
- **접근 제어**: `bind-address=127.0.0.1` 유지(외부 노출 금지). 앱은 `madpump@localhost`만 사용, root는 관리용.
- **DB 비밀번호 재설정**(분실 시): VM에서
  `sudo mysql -e "ALTER USER 'madpump'@'localhost' IDENTIFIED BY '<새비번>'; FLUSH PRIVILEGES;"` → `server/.env` 갱신.
- **스키마 리셋**(개발 중 초기화): `npm --workspace @madpump/server run db:reset` (⚠️ 데이터 전부 삭제 후 재마이그레이션+시드).

---

## 10. 원본 DDL 대비 의도적 차이 (정직 고지)

`ERD.md`의 순수 MySQL DDL과 구현(Prisma) 사이의 **의미가 같지만 표기가 다른** 지점들. 데이터 의미를 바꾸지 않는 범위:

1. **`DATETIME` → `DATETIME(3)`**: Prisma 기본이 밀리초 정밀도. 의미 동일(더 정밀할 뿐).
2. **`created_at`/`played_at`/`edited_at` 에 `DEFAULT CURRENT_TIMESTAMP(3)` 추가**: DDL엔 DEFAULT가 없었음. 앱이 값을 안 넣어도 생성시각이 박히는 안전한 fallback(좋은 fallback — 없는 데이터를 지어내지 않음).
3. **`before_result`/`after_result` VARCHAR(10) → ENUM**: `ERD.md` note #16의 "값 제한" 요구를 `game_match.result`뿐 아니라 이력 컬럼에도 일관 적용(도메인이 동일).
4. **`updated_at` 은 `@updatedAt`**: 행 수정 시 자동 갱신.
5. **onUpdate: Cascade**(Prisma 기본)가 FK에 붙음: 대리키(auto-increment)라 PK가 바뀔 일이 없어 사실상 무동작.
6. **BIGINT id ↔ JS `bigint`**: Prisma는 BIGINT를 JS `bigint`로 매핑한다. **API에서 JSON 직렬화 시 주의** — `JSON.stringify(bigint)`는 에러. 서버 응답 직전 문자열/숫자로 변환하는 직렬화 헬퍼가 필요(예: `BigInt.prototype.toJSON = function(){return this.toString()}` 또는 응답 매퍼). 이 게임의 id 규모는 작지만 컬럼 타입은 정본(BIGINT)을 따랐다.

---

## 11. 관련 문서
- [`ERD.md`](./ERD.md) — 스키마 **정본 + 설계 근거**(엔티티 개요, 관계, 전체 DDL, 17개 결정 노트, 파생 데이터).
- [`TECH_STACK.md`](./TECH_STACK.md) — 전체 기술 스택 결정.
- `server/prisma/schema.prisma` — 코드 정본. `server/prisma/migrations/0_init/` — 적용된 DDL.
