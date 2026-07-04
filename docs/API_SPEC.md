I've verified all five source files against the drafts (types.ts, game1/2/3.ts, schema.prisma). Key confirmations: `createGame2State` never calls rng (only `tickGame2` at FIRE does); `game3.ts` `pending[a.player]=a.type` trusts the payload's player with no role check; `game1.ts` `tick` sets `DRAW` on `elapsedMs >= timeLimitMs`; `Game2State` has no tick counter (only `elapsedMs`); `GameMatch.id` is BigInt autoincrement with no external-id column. Now synthesizing.

# MADPUMP API 명세서 (v0 초안)

> **목적**: MADPUMP(1:1 대결 웹 미니게임 플랫폼)의 인증·로비·인게임 실시간·데이터흐름·영속화 API를 실행 가능한 수준으로 정의하는 단일 구현 명세.

> **정본 순위 (읽는 사람 필독)**: 이 문서는 **구현 명세 *초안(v0)*이며 검토 대기 상태**다. 상위 정본은 `docs/TECH_STACK.md`(스택·네트워크 모델·구현 우선순위)와 `docs/ERD.md`(DB 스키마 정본, `server/prisma/schema.prisma`는 그 미러)이다. **이 문서와 상위 정본이 충돌하면 상위 정본이 이긴다.** 스키마 변경 제안은 반드시 `docs/ERD.md`를 먼저 갱신한 뒤 `schema.prisma`에 반영한다. 여기서 `(미확정)`으로 표시된 항목은 결정권자 확정 전까지 구현하지 않는다.

---

## 목차

- [핵심 요약 (TL;DR)](#핵심-요약-tldr)
- [사용자 멘탈모델 ↔ 명세 구조 매핑](#사용자-멘탈모델--명세-구조-매핑)
- [0. 공통 규약 (전 섹션 공유 — 한 번 정의하고 참조)](#0-공통-규약)
- [1. 인증·세션·프로필 API (로그인/로그아웃 그룹)](#1-인증세션프로필-api)
- [2. 로비·방·매칭 API (게임 접속 그룹)](#2-로비방매칭-api)
- [3. 인게임 실시간 프로토콜 (게임 실행 그룹)](#3-인게임-실시간-프로토콜)
- [4. 네트워킹 방법론 & 데이터 흐름 (개념 — Q1·Q2 정면 답변)](#4-네트워킹-방법론--데이터-흐름)
- [5. 영속화·DB 쓰기 경로 & 스키마 갭 분석](#5-영속화db-쓰기-경로--스키마-갭-분석)
- [열린 질문 / 결정 필요 (미확정 총괄)](#열린-질문--결정-필요)
- [구현 로드맵 (TECH_STACK §6 우선순위)](#구현-로드맵)

---

## 핵심 요약 (TL;DR)

- **(Q2 네트워크 방법론)** 보편 모델은 5가지 — (A) 서버권위+상태브로드캐스트, (B) 서버권위+클라예측/보정, (C) 결정적 락스텝, (D) 롤백(GGPO), (E) 클라권위/릴레이. **MADPUMP는 (A)/(B)만 채택**한다: 게임1·게임3 = (A) 덤 클라, 게임2 = (B) 보간(예측은 v1 선택). (C)/(D)는 과설계·분산권위라 기각, (E)는 승패가 분반 랭킹에 반영되므로 치팅 노출로 명시적 기각.
- **(Q1 데이터 흐름)** **서버 RAM = 권위 원본, Socket.IO = 실시간 전달 통로, DB = 영구 기록만.** "DB에 저장해두고 양쪽으로 보낸다"는 실시간 게임엔 부적합(지연·권위 흐림·휘발성 데이터 적재). DB는 매치 **시작 시 신원 read**와 **매치 종료 시 결과 1행 write**에만 개입한다. 진행 중엔 DB 무접촉.
- **전송 전략**: 게임1·3 = **전체 스냅샷/이산 이벤트**(상태가 작아 델타 불필요), 게임2 = **20Hz 전체 스냅샷**(2인 규모라 델타 불필요). **입력-only(락스텝)는 안 씀.**
- **직렬화 포맷**: **JSON 채택**(Socket.IO 기본, TS 플레인 객체와 변환비용 0). **YAML은 네트워크 payload로 절대 사용 안 함** — 설정/문서 전용. 대량화 시 MessagePack은 추후 고려(제안).
- **불변식**: 모든 판정은 **서버 권위**. 클라는 **'입력'만 보내고 '결과'는 절대 못 보낸다**. 세 게임 코어가 순수·결정적 `tick(state, inputs, dt)` 함수라 "서버 권위"가 "같은 함수를 서버에서 한 번 더 호출"로 저렴하게 성립한다.

---

## 사용자 멘탈모델 ↔ 명세 구조 매핑

사용자가 그린 3그룹 멘탈모델이 이 명세의 어느 섹션으로 커버되는지:

| 사용자 멘탈모델 그룹 | 커버 섹션 | 주요 표면 | 핵심 이벤트/엔드포인트 |
|---|---|---|---|
| **① 로그인 / 로그아웃** (계정·프로필) | §1 인증·세션·프로필 | REST `/auth/*`(302 왕복), `/api/*`(JSON) | `GET /auth/google/login`, `GET /auth/google/callback`, `GET /api/me`, `POST /api/onboarding`, `POST /api/auth/logout`, admin login/logout |
| **② 게임 접속** (방·매칭·상대만남) | §2 로비·방·매칭 | Socket.IO `room:*` / `queue:*` / `lobby:*` + REST 코드 사전검증 1개 | `room:create`, `room:join`, `room:state`, `room:configure`, `room:ready`, `room:start`, `queue:join`, `queue:matched`, `GET /api/rooms/:code` |
| **③ 게임 실행** (틱·입력·판정) | §3 인게임 실시간 프로토콜 | Socket.IO `match:*` / `round:*` / `game:*` | `match:start`, `round:start`, `game:input`/`game:move`, `game:state`/`game:tick`, `round:end`, `match:end` |
| **(횡단) 왜 이렇게 오가나** | §4 네트워킹 방법론·데이터흐름 | 개념 + Q1/Q2 답변 | 방법론 taxonomy, full/delta/input-only, JSON/YAML |
| **(횡단) 무엇이 남나** | §5 영속화·스키마갭 | REST 리더보드/전적 + DB 쓰기 경로 | `GET /api/leaderboard`, `GET /api/matches/:id`, `game_match` INSERT |

---

## 0. 공통 규약

전 섹션이 공유하는 규칙과 payload를 여기서 한 번 정의하고, 이후 섹션은 이를 참조한다.

### 0.1 경로·전송 네임스페이스

| 접두 | 용도 | 전송 |
|---|---|---|
| `/auth/*` | 브라우저가 **직접 내비게이션**(리다이렉트 왕복)하는 OAuth 진입/콜백만 | 302 응답, XHR 아님 |
| `/api/*` | 그 외 모든 애플리케이션 REST API | XHR/fetch, JSON |
| `/socket.io/*` | 실시간 방·게임 | WebSocket(Socket.IO) |

**Socket.IO 이벤트 네임스페이스(콜론 규칙):** `lobby:*`(연결 직후 부트스트랩/에러), `room:*`(코드방 생명주기), `queue:*`(빠른시작 매칭), `match:*`(매치 개시/종료), `round:*`(라운드 경계), `game:*`(인게임 틱/입력). 방향 표기: `[C→S]` 클라→서버, `[S→C]` 서버→클라(보통 room 브로드캐스트).

### 0.2 식별자 직렬화 & matchId 규약 (충돌 제거)

- **BigInt → 문자열.** `AppUser.id`, `UserGroup.id`, `GameMatch.id` 등은 Prisma `BigInt`라 JSON 수 안전범위를 넘을 수 있어 **항상 문자열로 직렬화**한다(예: `"1024"`). `gameId`(1|2|3), `role`('P1'|'P2'), `result`는 코드 리터럴 그대로(`types.ts`).
- **`matchId` vs `recordedMatchId` (인메모리 id를 DB 조회 키로 쓰지 않는다):**
  - `matchId` = **서버 인메모리 매치 런타임 id**(문자열, 예: `"m_9f3a2c"`). 진행 중인 모든 소켓 이벤트(`match:start`/`round:*`/`game:*`/`match:end`)의 상관키. **DB에 저장되지 않으며 재시작 시 소실**된다(스키마에 이 문자열을 담을 컬럼이 없음 — `GameMatch.id`는 `BigInt @default(autoincrement())`뿐).
  - `recordedMatchId` = **DB `game_match.id`(BigInt→문자열)**. 매치 종료 시 INSERT가 커밋되어야 비로소 존재한다(§5.5). **결과 재조회 REST의 유일한 조회 키**는 이 값이다(`GET /api/matches/:recordedMatchId`). 인메모리 `matchId`로 DB를 조회하지 않는다.

### 0.3 인증·쿠키

- **인증 = Google OAuth 인가 코드 플로우(서버 처리) + 서버측 세션 + 세션 쿠키.** access/refresh 토큰·`client_secret`은 **서버에만** 존재. **JWT 금지**(`TECH_STACK.md §2`). 쿠키엔 **불투명 세션 ID만** 담고 사용자 데이터는 서버에 둔다.
- **admin은 완전 분리 인증**: `admin_account`(login_id/pw_hash, bcrypt), 별도 쿠키/세션 네임스페이스.

| 쿠키 | 소유 | 속성 |
|---|---|---|
| `madpump_sid` | 유저 세션 | `HttpOnly; Secure(prod); SameSite=Lax; Path=/` |
| `madpump_admin_sid` | admin 세션 | `HttpOnly; Secure(prod); SameSite=Lax; Path=/` |
| `mp_oauth_state` | OAuth state/PKCE 임시 | `HttpOnly; Secure(prod); SameSite=Lax; Max-Age=600; Path=/auth` |

`SameSite=Lax` 선택 이유: OAuth 콜백은 구글에서 **top-level GET 내비게이션**으로 돌아오므로 `Lax`면 쿠키가 실려 오고(`Strict`는 콜백에서 쿠키 유실), 크로스사이트 fetch POST엔 쿠키가 안 실려 CSRF 1차 방어가 된다. 유저/admin 쿠키 **이름이 다르므로 같은 브라우저에서 동시 로그인 가능**(서로 독립).

### 0.4 CSRF / Origin 방어 (REST·소켓 대칭)

상태 변경(`POST/PATCH/DELETE`)과 소켓 핸드셰이크에 동일한 태세를 적용한다:

1. **`SameSite=Lax` 쿠키**(0.3).
2. **Origin/Referer 허용목록 검증** — 모든 상태변경 REST와 **Socket.IO 핸드셰이크(`io.use`)**에서 `Origin` 헤더를 허용 도메인 화이트리스트와 대조해 불일치 시 거부. 소켓은 쿠키가 WS 업그레이드에 자동 동봉되고 SOP가 fetch와 달라 **CSWSH(Cross-Site WebSocket Hijacking)** 위험이 있으므로, `SameSite=Lax`만으로 방어하지 않고 **Origin 검증을 필수**로 둔다.
3. **상태변경 REST 커스텀 헤더 요구** — `X-Requested-With: madpump` 헤더가 없으면 거부(단순 폼 위조 차단). `Content-Type: application/json` 강제. **아래 모든 변경계 REST 예시에는 이 헤더가 포함된다**(본문 없는 logout/delete 포함).
4. **OAuth 콜백 CSRF** — 로그인 시작 시 난수 `state`(+PKCE `code_challenge`, 제안)를 `mp_oauth_state`에 저장하고 authorize URL에 심어, 콜백에서 불일치면 `OAUTH_STATE_MISMATCH`.
5. (제안, 미확정) 강한 보증 필요 시 double-submit CSRF 토큰 추가.

### 0.5 에러 규약 (전 섹션 통일)

- **REST**: HTTP 상태코드 + 본문 `{ "error": { "code": "<UPPER_SNAKE>", "message": "..." } }`.
- **Socket ack**: 성공 `{ "ok": true, ... }` / 실패 `{ "ok": false, "error": { "code": "<UPPER_SNAKE>", "message": "..." } }`.
- **비동기 소켓 실패**(내가 트리거하지 않은 변화): push 이벤트 — 로비 `lobby:error`, 인게임 무효입력 `game:reject`, 매치 중단 `match:aborted`, 영속화 실패 `match:error`.

**통일 에러 코드 사전** (섹션 간 중복/충돌 제거):

| code | HTTP/맥락 | 의미 |
|---|---|---|
| `UNAUTHENTICATED` | 401 / `connect_error` | 세션 쿠키 없음/만료 |
| `FORBIDDEN` | 403 / ack | 권한 없음(방장 아님·당사자 아님 등) |
| `OAUTH_STATE_MISMATCH` | 400 | state 불일치/만료(CSRF 차단) |
| `OAUTH_CODE_INVALID` | 400 | code↔token 교환 실패 |
| `OAUTH_UPSTREAM_ERROR` | 502 | 구글 token/userinfo 호출 실패 |
| `OAUTH_NOT_CONFIGURED` | 503 | 서버 OAuth 환경변수 누락 |
| `ACCOUNT_SUSPENDED` | 403 | (미확정) 영구차단 정책 채택 시 `deleted_at` 존재 계정 |
| `ALREADY_ONBOARDED` | 409 | 세션이 이미 `USER`인데 온보딩 호출 |
| `NICKNAME_TAKEN` | 409 | `uq_user_nickname` 충돌 |
| `NICKNAME_INVALID` | 422 | 길이/형식 위반(하드 한계 ≤50자) |
| `GROUP_NOT_FOUND` | 422(온보딩)/404(리더보드) | `groupId` 미존재 |
| `NO_UPLOADED_IMAGE` | 404 | 삭제할 업로드 이미지 없음 |
| `FILE_TOO_LARGE` | 413 | 업로드 용량 초과 |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | 허용 안 된 MIME |
| `INVALID_IMAGE` | 422 | 이미지 디코딩 실패 |
| `STORAGE_UPLOAD_FAILED` | 502 | R2 업로드 오류 |
| `INVALID_CREDENTIALS` | 401 | admin ID 없음/PW 불일치(구분 안 함) |
| `TOO_MANY_ATTEMPTS` | 429 | (제안) 로그인 시도 제한 |
| `ROOM_NOT_FOUND` | 404 / ack | 코드의 방 없음 |
| `ROOM_FULL` | ack | 정원(2명) 초과 |
| `ALREADY_IN_ROOM` | ack | 이미 다른 방/큐 참여 중 |
| `ALREADY_IN_QUEUE` | ack | 이미 큐 대기 중 |
| `INVALID_CONFIG` | ack | `gameId` 미지정/`RoundConfig` 범위 밖 |
| `NOT_READY` | ack | 시작 조건(2명·양쪽 ready·설정 완료) 미충족 |
| `MATCH_NOT_FOUND` | 404 | 없는 매치/soft-deleted |
| `USER_NOT_FOUND` | 404 | 없는 유저 |
| `INTERNAL` | 500 / ack | 서버 내부 오류 |

### 0.6 공유 payload 객체 (한 번 정의)

이후 섹션은 아래 객체를 이름으로 참조한다.

- **`PublicProfile`** — 상대에게 공개 가능한 프로필. `avatarUrl` 대신 **`imageUrl`로 명칭 통일**(초안의 `avatarUrl`/`imageUrl` 이중 명칭 제거).
  ```json
  { "userId": "2048", "nickname": "상대", "imageUrl": "https://cdn.madpump.app/avatars/2048/def.webp" }
  ```
- **`SelfProfile`** — 본인. `PublicProfile` + `hasUploadedImage`(+ `/api/me`에선 `email`, `group`, `createdAt`).
- **`RoundConfig`** — `{ "roundCount": 3, "timePerRoundSec": 30 }` (`types.ts`, 방장 설정).
- **`RoundResult`** — `{ "roundIndex": 0, "winner": "P1" | "P2" | null }` (`types.ts`, `winner:null`=무승부 라운드).
- **`MatchSummary`** — `{ "gameId", "config", "rounds": RoundResult[], "result": MatchResult }` (`types.ts`).
- **`imageUrl` 해석 규칙 (프로필 직렬화 공통 — 좋은 fallback)**: `uploaded_image_key`(있으면 R2 서빙 URL) → `google_image_url` → 둘 다 없으면 **`imageUrl` 필드 생략/`null`**. 클라는 이니셜/플레이스홀더로 표시하되 **없는 사진을 지어내지 않는다.** 서버 내부 값 `uploaded_image_key`는 **API로 노출하지 않는다**(`ERD.md note #12` "DB엔 키만 저장").

### 0.7 이벤트 카탈로그 (통일 — 중복 이름 제거)

초안들이 같은 개념에 다른 이름을 쓰던 것을 통일한다: 초안의 `game:match_over`/`game:round_over` → **`match:end`/`round:end`**, 초안의 `game:event` → 게임별 **`game:state`(1·2)/`game:tick`(3)** 으로 흡수.

| 이벤트 | 방향 | 맥락 | 정의 |
|---|---|---|---|
| `lobby:hello` | S→C | 연결 직후 | 본인 부트스트랩 |
| `lobby:error` | S→C | 로비 비동기 실패 | §0.5 |
| `room:create/join/configure/ready/start/leave` | C→S | 코드방 | §2.3 |
| `room:state` | S→C | 코드방 | 단일 정본 스냅샷 |
| `queue:join/leave` | C→S | 빠른시작 | §2.4 |
| `queue:waiting/matched` | S→C | 빠른시작 | §2.4 |
| `match:start` | S→C(개별) | 매치 개시 | §3.1 |
| `match:loaded` / `match:go` | C→S / S→C | 게임2 틱 동기화 | §3.1 |
| `round:start` / `round:countdown` / `round:end` | S→C | 라운드 경계 | §3.1 |
| `game:input` | C→S | 게임1·2 입력 | §3.3/§3.4 |
| `game:move` | C→S | 게임3 입력 | §3.5 |
| `game:state` | S→C | 게임1·2 권위 스냅샷 | §3.3/§3.4 |
| `game:tick` | S→C | 게임3 윈도우 판정 | §3.5 |
| `game:reject` | S→C | 무효 입력 통지 | §3.7 |
| `match:end` | S→C | 매치 종료(+`recordedMatchId`) | §3.1/§5.5 |
| `match:aborted` | S→C | 중단(이탈/끊김) | §2.7 |
| `match:error` | S→C | 영속화 실패 | §5.5 |

---

## 1. 인증·세션·프로필 API

> 근거: `TECH_STACK.md §2·§4.3·§6-1` · `schema.prisma`(`AppUser`/`UserGroup`/`AdminAccount`) · `ERD.md note #9·#12·#13`. 모든 판정은 서버 권위.

### 1.1 세션 상태 (서버가 구분하는 4가지)

| 상태 | 의미 | `app_user` 행 | 쿠키 |
|---|---|---|---|
| `ANON` | 미인증 | 없음 | 없음 |
| `PENDING_ONBOARDING` | OAuth 성공, 닉네임 미작성 → **DB 유저 미생성** | **아직 없음** | `madpump_sid`(온보딩 대기) |
| `USER` | 온보딩 완료, 정식 로그인 | 있음(`deleted_at IS NULL`) | `madpump_sid` |
| `ADMIN` | admin 로그인 | (별개 네임스페이스) | `madpump_admin_sid` |

> **`app_user` 생성 시점**: `nickname`은 **NOT NULL + UNIQUE**(`schema.prisma`)라 닉네임 없이 행을 만들 수 없다. 따라서 **OAuth 콜백 시점엔 행을 만들지 않고** 구글 프로필(sub/email/picture)을 `PENDING_ONBOARDING` 세션에 담아 두었다가, **온보딩 제출(`POST /api/onboarding`) 시점에 INSERT** 한다. `group_id`는 nullable이라 분반 선택은 **선택 사항**(무소속 허용).

**세션 저장소 (미확정):** 스택이 **단일 프로세스**이고 세션 테이블이 없으므로 **인메모리 세션 스토어**를 기본안으로 제안. 서버 재시작 시 전원 로그아웃되지만 v1 허용(끊김 "그냥 두기" 정책과 동일 결의). 무중단 배포/수평 확장이 필요해지면 세션 테이블/외부 스토어로 승격 — **결정 필요**. 서버측 유휴 만료 제안: 유저 14일, admin 8시간(미확정).

### 1.2 인증 필수 여부 (요청별)

`허용 상태`는 **해당 인증 네임스페이스 기준**이다. 유저 세션 상태(ANON/PENDING/USER)와 admin 세션 상태(admin 없음/ADMIN)는 서로 독립이며, admin 행의 상태는 **admin 네임스페이스 기준**이다(유저 세션 유무와 무관 — §1.5 동시 로그인 허용과 일치).

| 엔드포인트 | 인증 요구 | 허용 상태 |
|---|---|---|
| `GET /auth/google/login` | ❌ 공개 | `ANON` |
| `GET /auth/google/callback` | ❌ 공개(state 검증) | `ANON`/`PENDING` |
| `GET /api/me` | ⚠️ 선택(항상 200, 상태 반영) | 전부 |
| `POST /api/auth/logout` | ✅ 세션 필요 | `PENDING`/`USER` |
| `GET /api/groups` | ❌ 공개(온보딩 드롭다운) | 전부 |
| `POST /api/onboarding` | ✅ 온보딩 대기 세션 | `PENDING_ONBOARDING`만 |
| `PATCH /api/me` | ✅ 유저 | `USER` |
| `POST /api/me/profile-image` | ✅ 유저 | `USER` |
| `DELETE /api/me/profile-image` | ✅ 유저 | `USER` |
| `DELETE /api/me` | ✅ 유저 | `USER` |
| `POST /api/admin/login` | ❌ 공개(자격증명 검증) | **admin 세션 없음** (유저 세션과 독립) |
| `POST /api/admin/logout` | ✅ admin | **`ADMIN`** (유저 세션과 독립) |
| Socket.IO 핸드셰이크(§1.6) | ✅ 유저 세션 + Origin 검증 | `USER` |

미인증으로 인증 필수 접근 시 → `401 UNAUTHENTICATED`. 상태 불일치(이미 온보딩 끝난 세션이 `/api/onboarding` 호출) → `409 ALREADY_ONBOARDED`.

### 1.3 Google OAuth 로그인 왕복

```
[클라 브라우저]                     [MADPUMP 서버]                    [Google]
  1. "구글로 로그인" 클릭
     ── GET /auth/google/login ───────▶ state(+PKCE) 생성·저장(mp_oauth_state)
                                         authorize URL 구성
     ◀────── 302 Location: accounts.google.com ──
  2. ── 사용자 구글 동의 ────────────────────────────────────────▶ 로그인/동의
     ◀────── 302 /auth/google/callback?code=..&state=.. ──
  3. ── GET /auth/google/callback ─▶ state 검증
                                     code → token 교환(서버, client_secret) ─▶ Google
                                     userinfo(sub,email,picture) 조회 ────────▶ Google
                                     google_sub 조회:
                                       · 있으면 → google_image_url UPDATE, USER 세션
                                       · 없으면 → PENDING_ONBOARDING 세션(행 미생성)
                                     Set-Cookie: madpump_sid + mp_oauth_state 소거
     ◀── 302 / (기존유저) 또는 /onboarding (신규) ──
  4. SPA가 GET /api/me 로 상태 확인 → 화면 분기
```

- **클라 역할**: 버튼→`/auth/google/login` 내비게이션, 콜백 후 `/api/me`로 상태 조회 후 라우팅. OAuth `code`·토큰을 **다루지 않음**.
- **서버 역할**: `state`/PKCE 검증, code↔token 교환, userinfo 조회, `google_sub` 매칭, **`google_image_url`만 UPDATE**(업로드본 보호 — `ERD.md note #12`), 세션 발급.
- **필요 scope**: `openid email profile` (`picture` 클레임 = `google_image_url`).
- **재가입 경로 (미확정)**: soft-delete 계정은 `google_sub`이 `deleted:<id>:...`로 마스킹돼(`ERD.md note #9`) 신규 `google_sub`과 매칭 안 됨 → 콜백에서 신규로 판정되어 온보딩부터 다시. 영구 차단이 목표면 마스킹 대신 로그인 시 `deleted_at` 체크(`ACCOUNT_SUSPENDED`) — 결정 필요.

### 1.4 엔드포인트 상세

#### `GET /auth/google/login` — OAuth 시작
요청: `GET /auth/google/login` (헤더/바디 없음, 브라우저 top-level 내비게이션)
응답 302:
```
HTTP/1.1 302 Found
Location: https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=https%3A%2F%2Fmadpump.app%2Fauth%2Fgoogle%2Fcallback&response_type=code&scope=openid%20email%20profile&state=<random>&code_challenge=<pkce>&code_challenge_method=S256
Set-Cookie: mp_oauth_state=<random>; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/auth
```
에러: `503 OAUTH_NOT_CONFIGURED`.

#### `GET /auth/google/callback` — 콜백·세션 발급
요청: `GET /auth/google/callback?code=<auth_code>&state=<random>` (`Cookie: mp_oauth_state=<random>`)
응답 302 (기존 유저):
```
HTTP/1.1 302 Found
Location: /
Set-Cookie: madpump_sid=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/
Set-Cookie: mp_oauth_state=; Max-Age=0; Path=/auth
```
응답 302 (신규 유저 → 온보딩):
```
HTTP/1.1 302 Found
Location: /onboarding
Set-Cookie: madpump_sid=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/
Set-Cookie: mp_oauth_state=; Max-Age=0; Path=/auth
```
> **일관성 수정**: 신규 유저 콜백도 기존 유저와 동일하게 `mp_oauth_state` 소거 헤더를 포함한다(state는 `Max-Age=600` 자동만료되지만 두 경로 처리를 대칭으로 맞춤).

에러: `400 OAUTH_STATE_MISMATCH`, `400 OAUTH_CODE_INVALID`, `502 OAUTH_UPSTREAM_ERROR`, `403 ACCOUNT_SUSPENDED`(미확정, 영구차단 정책 채택 시). 실패 시 302 `/login?error=<code>` 리다이렉트 UX 대안 가능(제안).

#### `GET /api/me` — 현재 로그인 사용자 조회
요청: `GET /api/me` (`Cookie: madpump_sid=<opaque>`)
응답 200 (USER):
```json
{
  "status": "USER",
  "user": {
    "id": "1024", "nickname": "매드펌프", "email": "player@gmail.com",
    "group": { "id": "3", "name": "7분반" },
    "imageUrl": "https://cdn.madpump.app/avatars/1024/ab12.webp",
    "hasUploadedImage": true,
    "createdAt": "2026-07-04T09:12:00.000Z"
  }
}
```
응답 200 (PENDING_ONBOARDING):
```json
{ "status": "PENDING_ONBOARDING",
  "google": { "email": "player@gmail.com", "suggestedImageUrl": "https://lh3.googleusercontent.com/.../=s256-c" } }
```
응답 200 (ANON): `{ "status": "ANON" }`
- `imageUrl`은 §0.6 해석 규칙. `group` 없으면 필드 생략(무소속 — 좋은 fallback). **에러 없음**(항상 200; 세션 만료도 `status:"ANON"`으로 표현).

#### `POST /api/auth/logout` — 로그아웃(세션 파기)
요청:
```
POST /api/auth/logout
Cookie: madpump_sid=<opaque>
X-Requested-With: madpump
```
응답 204: `Set-Cookie: madpump_sid=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/`
- 서버측 세션 레코드 삭제 + 쿠키 소거. `PENDING_ONBOARDING`도 동일 파기(온보딩 취소). 에러 `401 UNAUTHENTICATED`(멱등 원하면 204로 흡수 가능, 제안).

#### `GET /api/groups` — 분반 목록(온보딩 드롭다운)
요청: `GET /api/groups`
응답 200:
```json
{ "groups": [ { "id": "1", "name": "1분반", "isPublic": true }, { "id": "3", "name": "7분반", "isPublic": true } ] }
```
- (제안, 미확정) 공개(`is_public=true`) 분반만 노출, 비공개는 코드/초대로 참여.

#### `POST /api/onboarding` — 최초 온보딩(닉네임+분반)·`app_user` 생성
요청:
```
POST /api/onboarding
Cookie: madpump_sid=<opaque>            (PENDING_ONBOARDING 세션 필수)
Content-Type: application/json
X-Requested-With: madpump

{ "nickname": "매드펌프", "groupId": "3" }    // groupId는 null/생략 가능(무소속)
```
응답 201: `{ "user": { ...SelfProfile 형태, imageUrl=구글 기본, hasUploadedImage:false } }`
- 서버: 세션의 구글 프로필 + 입력값으로 INSERT(`google_sub`,`email`,`nickname`,`google_image_url`,`group_id`), 세션을 `USER`로 승격.
- 에러: `409 NICKNAME_TAKEN`(주의: MySQL 기본 콜레이션 `utf8mb4_0900_ai_ci`면 대소문자/악센트 무시 비교라 "Mad"/"mad" 충돌 가능 — 검증도 동일 기준으로, 미확정), `422 NICKNAME_INVALID`(하드 한계 ≤50자 `VARCHAR(50)`; 세부 규칙 미확정), `422 GROUP_NOT_FOUND`, `409 ALREADY_ONBOARDED`, `401 UNAUTHENTICATED`.
- (제안) 프리체크 `GET /api/onboarding/nickname-available?nickname=...` → `{ "available": true }` (경합은 최종 INSERT 409로 확정).

#### `PATCH /api/me` — 닉네임/분반 변경 (제안, 미확정)
요청:
```
PATCH /api/me
Cookie: madpump_sid=<opaque>
Content-Type: application/json
X-Requested-With: madpump

{ "nickname": "새닉네임", "groupId": "5" }   // 변경할 필드만
```
응답 200: `/api/me`의 `user`와 동일. 에러: `409 NICKNAME_TAKEN`, `422 NICKNAME_INVALID`, `422 GROUP_NOT_FOUND`, `401 UNAUTHENTICATED`.
- **(미확정)** 닉네임 변경 허용/쿨다운(리더보드 정체성 영향) — 결정 필요.

#### `POST /api/me/profile-image` — 프로필 이미지 업로드(R2)
요청:
```
POST /api/me/profile-image
Cookie: madpump_sid=<opaque>
Content-Type: multipart/form-data; boundary=...
X-Requested-With: madpump

(part name="image", filename="me.jpg", Content-Type: image/jpeg, <바이너리>)
```
서버 파이프라인(`TECH_STACK.md §2`, `ERD.md note #12`):
1. MIME/크기 검증(제안: `image/jpeg|png|webp`, 최대 8MB — 미확정).
2. **sharp**: EXIF orientation 반영 회전 → **256×256 webp** → **모든 메타데이터/EXIF 제거**(`.rotate().resize(256,256).webp()`).
3. R2(S3 호환) PUT. 키 예: `avatars/<userId>/<uuid>.webp`.
4. `app_user.uploaded_image_key`만 UPDATE(**DB엔 키만**). `google_image_url`은 불변.

응답 200: `{ "imageUrl": "https://cdn.madpump.app/avatars/1024/ab12.webp", "hasUploadedImage": true }`
- 에러: `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `422 INVALID_IMAGE`, `502 STORAGE_UPLOAD_FAILED`, `401 UNAUTHENTICATED`.
- **(미확정)** 서빙 전략(비공개 버킷 프록시 `GET /api/users/:id/avatar` vs 공개/서명 URL). 응답 `imageUrl`은 그 전략에 맞춘 값(§5.7).

#### `DELETE /api/me/profile-image` — 업로드 이미지 제거(구글 기본 복귀) (제안)
요청: `DELETE /api/me/profile-image` (`Cookie: madpump_sid`, `X-Requested-With: madpump`)
응답 200: `{ "imageUrl": "https://lh3.googleusercontent.com/.../=s256-c", "hasUploadedImage": false }`
- `uploaded_image_key` NULL로, (선택) R2 객체 삭제. 에러: `401 UNAUTHENTICATED`, `404 NO_UPLOADED_IMAGE`(멱등 원하면 200 흡수).

#### `DELETE /api/me` — 자기 탈퇴(soft delete) (제안)
요청: `DELETE /api/me` (`Cookie: madpump_sid`, `X-Requested-With: madpump`)
응답 204: 세션 파기 + 쿠키 소거.
- 서버: `deleted_at = now()` + `nickname`/`google_sub`/`email` 마스킹으로 유니크 해방(`ERD.md note #9`). **주의**: 마스킹 접두 `deleted:<id>` 만으로 유니크 보장되며 원값 결합 시 `VARCHAR(50)` 초과로 STRICT 모드 UPDATE 실패 가능 → 원값을 붙이지 말거나 절단(`DATABASE.md` 구현 노트). 매치 이력 FK는 `id` 기준이라 안전. 에러: `401 UNAUTHENTICATED`.

### 1.5 admin 로그인 (별도 ID/PW, bcrypt)

admin은 `app_user`/구글과 무관한 `admin_account`(login_id/pw_hash) 자격증명이며 세션 쿠키도 분리(`madpump_admin_sid`).

#### `POST /api/admin/login`
요청:
```
POST /api/admin/login
Content-Type: application/json
X-Requested-With: madpump

{ "loginId": "root", "password": "••••••••" }
```
응답 204: `Set-Cookie: madpump_admin_sid=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/`
- 서버: `admin_account`에서 `login_id` 조회 → **bcrypt.compare** (`pw_hash VARCHAR(255)`). 존재/불일치를 **동일 응답**(계정 열거 방지). 에러: `401 INVALID_CREDENTIALS`, `429 TOO_MANY_ATTEMPTS`(제안, 미확정).

#### `POST /api/admin/logout`
요청: `POST /api/admin/logout` (`Cookie: madpump_admin_sid`, `X-Requested-With: madpump`)
응답 204: admin 세션 파기 + 쿠키 소거. 에러 `401 UNAUTHENTICATED`.

> admin 세션은 유저 세션과 별개(쿠키 이름 다름)이므로 같은 브라우저에서 유저/admin **동시 로그인 가능**. admin 전용 콘솔 API(그룹/매치/점수 수정)는 이후 "admin API" 섹션에서 `madpump_admin_sid` 요구로 정의.

### 1.6 Socket.IO 핸드셰이크 인증 (게임/방 소켓 진입 게이트)

REST 로그인 세션 쿠키를 **핸드셰이크에서 재사용**(별도 토큰 없음). 서버 `io.use` 미들웨어가:
1. `handshake.headers.cookie`의 `madpump_sid`를 파싱해 세션 조회 → `app_user`(`deleted_at IS NULL`) 확정, `socket.data.user = { userId, nickname, imageUrl, groupId }` 바인딩.
2. **`handshake.headers.origin`을 허용목록과 대조**(CSWSH 방어, §0.4). 실패 시 거절.
- **[C→S]** 연결: `io(url, { withCredentials: true })`로 쿠키 자동 동봉. 추가 payload 없음.
- **[S→C] `connect_error`** (인증/Origin 실패):
  ```json
  { "message": "UNAUTHENTICATED", "data": { "code": "UNAUTHENTICATED" } }
  ```
  세션이 `USER`가 아니면(온보딩 미완료 포함) 거절 → 클라는 `/login`/`/onboarding`으로. 정상 시 이후 방/게임 이벤트는 서버가 바인딩한 `userId`를 신뢰해 **서버 권위 판정 주체**로 사용.

### 1.7 이 섹션 미확정 요약
세션 저장소 · soft-delete 후 정책(재가입/영구차단) · 닉네임 규칙·콜레이션 · 프로필 이미지 서빙/허용 MIME·용량 · 비공개 분반 노출. (제안) OAuth PKCE, admin rate-limit, double-submit CSRF. → [열린 질문](#열린-질문--결정-필요) 참조.

---

## 2. 로비·방·매칭 API

"게임에 들어가기까지"의 접속·방·매칭 계층. 실제 틱/입력/상태 브로드캐스트는 §3, 결과 영속화는 §5.

### 2.0 설계 원칙

- **소켓 우선(socket-first).** 방/큐/매치 상태는 전부 서버 인메모리(스키마에 room/queue/session 모델 없음)이고 Socket.IO room 멤버십과 원자적으로 변해야 하므로, 방 생성/입장/설정/시작/매칭은 **모두 소켓 이벤트**로 처리한다. REST는 소켓을 열기 전 "코드 사전검증" read 하나만 둔다(§2.3).
- ack 규약·에러 코드·프로필 직렬화(`imageUrl`)·Origin 검증은 **§0 공통 규약**을 따른다.

### 2.1 소켓 연결 + 인증

§1.6과 동일 게이트(`madpump_sid` 세션 검증 + Origin 허용목록). 핸드셰이크(개념):
```
GET /socket.io/?EIO=4&transport=websocket
Cookie: madpump_sid=<opaque>
Origin: https://madpump.app        ← io.use에서 허용목록 대조(CSWSH 방어)
```
- **[S→C] `lobby:hello`** — 인증 성공 직후 본인 요약 push(§0.6 `imageUrl` 규칙 적용):
  ```json
  { "userId": "1024", "nickname": "종혁", "imageUrl": "https://cdn.madpump.app/avatars/1024/abc.webp", "groupId": "7" }
  ```
  v1은 재접속 복구가 없으므로 진행 중이던 방/매치 상태는 싣지 않는다(`TECH_STACK.md §4.3`).
- **[S→C] `disconnect`** (내장) — 서버는 이 소켓이 속한 방/큐를 정리한다(§2.7). *(초안에서 여기 붙어 있던 `imageUrl` 해석 규칙은 §0.6 프로필 직렬화 공통 규약으로 이동 — disconnect와 무관.)*

### 2.2 인메모리 방 객체 모델 (제안)

DB 테이블이 없으므로 방은 `Map<code, Room>` + `Map<socketId, roomId>`로 관리.

```ts
interface Room {
  roomId: string;              // 내부 고유 id (예: "room_7f3a2b")
  code: string | null;         // 코드방=6자리 숫자 문자열, 빠른시작 자동방=null
  origin: 'CODE' | 'QUICK';
  hostUserId: string;          // 방장(코드방에서만 의미) — BigInt→string
  players: RoomPlayer[];       // 최대 2
  gameId: GameId | null;       // 설정 전 null (1|2|3)
  config: RoundConfig | null;
  rngSeed: number | null;      // match:start 시 발급 (용도 한정 — §3.1·§4.3)
  phase: RoomPhase;
  createdAt: number;
}
interface RoomPlayer {
  userId: string; socketId: string /*내부용, 외부 미노출*/;
  role: PlayerRole; nickname: string; imageUrl?: string;
  ready: boolean; connected: boolean; // v1: 끊기면 false로만, 복구 안 함
}
type RoomPhase = 'WAITING' | 'CONFIGURING' | 'READY' | 'IN_MATCH' | 'FINISHED' | 'ABORTED';
```

**P1/P2 역할 배정 (게임2 비대칭이라 중요):**
- **코드방:** 방장 = **P1**, 입장자 = **P2**(방장이 게임/설정 결정권을 가지므로 고정 앵커).
- **빠른시작:** 큐에 **먼저 진입 = P1**, 나중 = **P2**.
- **(미확정 — v1 구현 전 확정 대상으로 승격)** 게임2는 P1=공격자/P2=회피자로 **고정 비대칭**이라, 매치 전체 역할이 로비 진입 순서로 고정되면 랭킹에 반영되는 비대칭 게임에서 **체계적 역할 유불리**가 생긴다. 최소한 `match:start` 전에 각 클라에 **자기 역할(공격/회피)을 노출·인지**시켜야 하며, 공정성 확보 방안(라운드별 role swap 후 합산, 또는 매치당 2세트로 양쪽이 공수 1회씩)을 확정해야 한다. → [열린 질문](#열린-질문--결정-필요).

### 2.3 코드방 (Code Room)

#### `GET /api/rooms/:code` — 입장 전 코드 사전검증 (유일한 REST)
UX용 사전 확인. **권위 판정 아님**(실제 입장은 `room:join`).
요청: `GET /api/rooms/482913` (`Cookie: madpump_sid`)
응답 200:
```json
{ "exists": true, "joinable": true, "phase": "WAITING", "hostNickname": "종혁", "playerCount": 1, "gameId": null }
```
에러: `404 ROOM_NOT_FOUND`, `401 UNAUTHENTICATED`, 또는 `200 + "joinable": false`(정원 초과/진행 중).

#### `[C→S] room:create`
payload `{}`. 방장이 방 생성 → 서버가 **6자리 숫자 코드** 충돌 없이 발급 → 소켓을 `room=code`에 join → role=P1(`WAITING`).
ack: `{ "ok": true, "roomId": "room_7f3a2b", "code": "482913", "role": "P1", "phase": "WAITING" }`
에러: `ALREADY_IN_ROOM`.

#### `[C→S] room:join`
payload `{ "code": "482913" }`. 서버 검증(존재·정원<2·진행 전) → `socket.join(code)` → role=P2 → `room:state` 브로드캐스트.
ack: `{ "ok": true, "roomId": "room_7f3a2b", "role": "P2" }`
에러: `ROOM_NOT_FOUND`, `ROOM_FULL`, `ALREADY_IN_ROOM`.

#### `[S→C] room:state`
상태 변화 시 `room=code` 전체에 브로드캐스트하는 **단일 정본 스냅샷**.
```json
{
  "roomId": "room_7f3a2b", "code": "482913", "origin": "CODE",
  "hostUserId": "1024", "phase": "CONFIGURING",
  "gameId": 3, "config": { "roundCount": 3, "timePerRoundSec": 30 },
  "players": [
    { "userId": "1024", "nickname": "종혁", "imageUrl": "https://cdn.madpump.app/avatars/1024/abc.webp", "role": "P1", "ready": false, "connected": true },
    { "userId": "2048", "nickname": "상대", "imageUrl": "https://cdn.madpump.app/avatars/2048/def.webp", "role": "P2", "ready": false, "connected": true }
  ]
}
```
트리거: create/join/leave/configure/ready/disconnect 등 모든 변화. `gameId`/`config`는 설정 전 `null`.

#### `[C→S] room:configure` (방장 전용)
payload `{ "gameId": 2, "config": { "roundCount": 3, "timePerRoundSec": 20 } }`
서버: `socket.data.user.userId === room.hostUserId` 확인, `gameId∈{1,2,3}`·`roundCount≥1`·`timePerRoundSec` 범위(제안 5~120, 미확정) 검증 → 갱신 → `room:state`. 게임 변경 시 양쪽 `ready`는 false 리셋.
에러: `FORBIDDEN`, `INVALID_CONFIG`.

#### `[C→S] room:ready`
payload `{ "ready": true }`. 자신의 준비 토글 → `room:state`.

#### `[C→S] room:start` (방장 전용)
payload `{}`. 서버 조건 검사(2명·양쪽 ready·`gameId`·`config` 확정). 통과 시 `rngSeed` 발급 → `phase='IN_MATCH'` → 각 소켓에 **개별** `match:start`(role 다름) 송출(§3.1).
에러: `FORBIDDEN`, `NOT_READY`, `INVALID_CONFIG`.

#### `[C→S] room:leave`
payload `{}`. 자발 퇴장 → 남은 참가자에 `room:state`(대기), 진행 중이면 `match:aborted`(§2.7).

### 2.4 빠른시작 (Quick Start)

서버 인메모리 대기 큐 → 2명 차면 방 자동 생성. 서로 다른 게임을 붙이면 안 되므로 **게임별 큐**(제안). `RoundConfig`는 빠른시작 기본값(제안: `roundCount:3`, `timePerRoundSec`=게임별 기본 — 미확정).

- **[C→S] `queue:join`** payload `{ "gameId": 1 }` → ack `{ "ok": true, "status": "QUEUED", "gameId": 1 }`. 에러: `ALREADY_IN_QUEUE`, `ALREADY_IN_ROOM`, `INVALID_CONFIG`.
- **[S→C] `queue:waiting`** (선택) `{ "gameId": 1, "sinceMs": 3200 }` — 대기 UI 하트비트.
- **[C→S] `queue:leave`** payload `{}` → ack `{ "ok": true }`.
- **[S→C] `queue:matched`** — 2명 매칭 시 **양쪽에** 송출(상대 공개). 서버는 자동 방(`origin:'QUICK'`, `code:null`) 생성 + 두 소켓 room join:
  ```json
  { "roomId": "room_9c1e04", "role": "P1", "gameId": 1, "opponent": { "userId": "2048", "nickname": "상대", "imageUrl": "https://cdn.madpump.app/avatars/2048/def.webp" } }
  ```
  빠른시작은 ready 게이트를 생략하고 곧바로 `match:start`가 이어진다. **단, 게임2 비대칭 역할 인지 단계는 §2.2 미확정 대상**(공수 노출 없이 바로 시작하면 안 됨).

### 2.5 이탈·취소·한쪽 드롭 (v1: 재접속 없음)

`TECH_STACK.md §4.3` "끊김은 그냥 두기".

| 상황 | phase | 서버 처리 | 통지 |
|---|---|---|---|
| 대기 중 방장 leave/disconnect | WAITING/CONFIGURING | 방 파기(방장 승계 미구현) | 남은 소켓에 `room:state`(빈 방)/방 종료 |
| 대기 중 게스트 이탈 | WAITING/CONFIGURING | player 제거, P1 유지 | `room:state` |
| 큐 대기 중 disconnect | — | 큐에서 제거 | 없음 |
| 매치 중 한쪽 이탈/끊김 | IN_MATCH→ABORTED | 매치 중단, 방 정리, **DB 미기록**(§5.5) | 남은 소켓에 `match:aborted` |
| 취소(합의/방장 취소) | 임의 | 방/매치 정리 | `match:aborted{reason:CANCELLED}` 또는 `room:state` |

**[S→C] `match:aborted`**:
```json
{ "matchId": "m_9f3a2c", "reason": "OPPONENT_DISCONNECTED", "byUserId": "2048" }
```
`reason ∈ { OPPONENT_LEFT, OPPONENT_DISCONNECTED, CANCELLED }`. **v1은 중단 매치를 `game_match`에 기록하지 않는다** — 깨끗한 `result`가 없는데 `P1_WIN` 등으로 채우면 없는 결과를 지어내는 나쁜 fallback. "몰수승" 정책은 **(미확정)**.

### 2.6 오프라인 모드 (무엇이 필요 없는가)

오프라인 = 한 컴퓨터 2인, 키보드 2벌(`playerL={q,w}→P1`, `playerR={u,i}→P2`, `keyboard.ts`). 같은 shared 코어를 로컬 실행.
**필요 없는 것:** 소켓 연결/핸드셰이크, `room:*`/`queue:*`/`match:*`, `match:start` 패킷(클라가 직접 `createGameNState(config, Math.random)`로 로컬 초기화), `rngSeed` 동기화(한 프로세스라 rng 공유), 서버 권위 판정, **`game_match` DB 기록**(온라인만 기록).
**공유하는 것:** shared 게임 코어 로직뿐. `RoundConfig`는 로컬 UI에서 주입.

### 2.7 이 섹션 미확정 요약
게임2 라운드별 역할 교대/공정성 · 중단 시 몰수승 · `timePerRoundSec` 범위 · 빠른시작 기본 `roundCount`/게임별 기본 라운드시간 · 게임2 밸런스 수치. → [열린 질문](#열린-질문--결정-필요).

---

## 3. 인게임 실시간 프로토콜

방이 구성되고 매치가 시작된 뒤부터 결과 확정까지의 실시간 규약. 필드명은 `types.ts` 및 각 `games/gameN.ts` 실제 타입에 맞춘다.

### 3.0 서버 권위 루프

모든 게임은 **서버 권위**로 판정(승패가 분반 랭킹 반영, 외부 확산 목표 → 클라 판정 불신). 공통 루프:
```
[C→S] 입력 전송 (game:input / game:move) — '입력'만, '결과'는 절대 아님
  → 서버가 shared 코어 tick(state, inputs, dt) 실행 (client와 동일 함수, 두 번 구현 금지)
  → [S→C] 서버가 권위 상태/이벤트 브로드캐스트 (game:state / game:tick)
  → 클라는 받은 상태로 Canvas 렌더 (게임2만 보간, 1·3은 그대로 표시)
```
코어 시그니처: 게임1 `tick(state, InputFrame<Game1Action>, dtMs)`, 게임2 `tickGame2(state, Game2Inputs, dtMs)`, 게임3 `tickGame3(state, Game3Action[], dtMs)`.

**핵심 구조 — 코어는 한 라운드만 시뮬한다 (라운드 오케스트레이터 필수).** 세 코어 state(`Game1State`/`Game2State`/`Game3State`)는 전부 **한 라운드**만 시뮬하며 `roundCount`를 소비하지 않는다. 따라서 서버에 **코어 위의 라운드 오케스트레이터**를 둔다:
- `RoundConfig.roundCount`만큼 라운드를 반복하며 각 라운드 코어의 `state.result`(=`RoundResult`)를 인메모리 `rounds[]`에 누적.
- 모든 라운드 종료 후 **(제안) `shared`에 추가할 순수 함수 `aggregateMatch(rounds: RoundResult[]): MatchResult`** 로 최종 `MatchResult`를 확정(라운드 다득제/best-of-N — **집계 공식 미확정**).
- `match:end` 방송과 `game_match` INSERT는 **최종 `MatchResult` 확정 시점에만** 일어난다. **코어 1라운드 `state.result`를 매치 결과로 오해하면 안 된다.**

**역할 배정**: §2.2 규칙(코드방 방장=P1, 빠른시작 선착=P1). 게임2 비대칭 공정성은 (미확정). 배정 결과는 `match:start`의 `role`로 각 소켓 개별 통지.

**끊김**: v1 재접속 복구 없음. `disconnect` 시 남은 쪽 몰수승 vs 매치 무효(DRAW)는 **(미확정)** — v1 기본은 §2.5대로 **DB 미기록**.

### 3.1 매치 생명주기 이벤트 시퀀스 (세 게임 공통)

#### `[S→C] match:start` — 매치 개시 (각 소켓 개별 송출, `role`이 다름)
```json
{
  "matchId": "m_9f3a2c",
  "gameId": 2,
  "role": "P1",
  "config": { "roundCount": 3, "timePerRoundSec": 20 },
  "rngSeed": 2894771233,
  "self":     { "userId": "1024", "nickname": "종혁", "imageUrl": "https://cdn.madpump.app/avatars/1024/abc.webp" },
  "opponent": { "userId": "2048", "nickname": "상대", "imageUrl": "https://cdn.madpump.app/avatars/2048/def.webp" },
  "gameConfig": {
    "fieldWidth": 100, "fieldHeight": 100, "attackerY": 10, "dodgerY": 90,
    "attackerSpeed": 40, "dodgerSpeed": 50, "attackerHalfWidth": 4, "dodgerHalfWidth": 4,
    "bulletRadius": 1.5, "bulletSpeedMin": 60, "bulletSpeedMax": 140,
    "fireCooldownMs": 400, "roundDurationMs": 20000
  },
  "serverTickMs": 50,
  "startAtEpochMs": 1751600000000
}
```

| 필드 | 타입/값 | 의미·근거 |
|---|---|---|
| `matchId` | string | 서버 인메모리 매치 런타임 id(§0.2). **DB `game_match.id`가 아님**. |
| `gameId` | 1\|2\|3 | `types.ts`. |
| `role` | 'P1'\|'P2' | 수신 소켓 본인 역할. **게임2 비대칭이라 필수**. |
| `config` | `RoundConfig` | 방장 지정(코드방) 또는 기본값(빠른시작). |
| `rngSeed` | number(32bit uint) | **용도 한정** — 아래 "rngSeed 규약" 참조. **v1 기본 경로에선 서버만 소비**하며 클라 필수가 아님. |
| `self`/`opponent` | `PublicProfile` | §0.6. |
| `gameConfig` | 게임별 config | 게임1=상수(`GAME1_HOLD_TO_WIN_MS` 등), 게임2=`Game2Config`(수치 전부 임시값 — `DEFAULT_GAME2_CONFIG`, 미확정), 게임3=`Game3Config`. **`roundDurationMs` 매핑은 아래 참조.** |
| `serverTickMs` | number\|null | 게임2=50(`GAME2_TICK_MS`), 게임3=1000(`tickIntervalMs`), 게임1=이벤트 기반이라 `null`. |
| `startAtEpochMs` | number | 카운트다운 동기화용 시작 시각(제안). |

**`roundDurationMs` 매핑 (초안 nit 확정):** `RoundConfig.timePerRoundSec`는 매치 단위 방장 설정 하나뿐인데, 코어별 소비가 다르다 — 게임1은 `timeLimitMs = timePerRoundSec*1000`(`createGame1State`), 게임2/게임3은 자기 `Config.roundDurationMs`(RoundConfig에서 파생하지 않음)를 쓴다. **확정: 서버가 `gameConfig` 구성 시 `roundDurationMs = config.timePerRoundSec * 1000`을 게임2·3 Config에 주입한다**(방장 설정이 세 게임에 균일 반영, `TECH_STACK.md §4.3` "방장만 라운드 설정"과 일치). 게임2/3의 코어 기본값(20s/30s)은 서버가 주입하지 않을 때의 fallback일 뿐이다.

**`rngSeed` 규약 (초안 major 확정 — 게임별로 의미가 다르다):**
- **게임1 (init-only rng, 안전):** `createGame1State(config, rng)`가 **초기화에서만 rng 3회** 호출(타겟→P1시작값→P2시작값, `game1.ts`). 이후 진행엔 랜덤 없음. 같은 시드면 클라 표시 초기값이 서버와 안전하게 일치한다. (또는 서버가 초기 3값을 직접 스냅샷으로 내려도 동치 — §4.3에서 하나로 통일 서술.)
- **게임2 (init은 rng 미사용, "결정적 초기화" 성립 안 함):** `createGame2State`는 **rng를 한 번도 호출하지 않는다**(rng를 state에 보관만 함). rng는 **`tickGame2`의 FIRE 시점에만** 소비돼 총알 `vy ∈ [min,max)`를 뽑는다(`game2.ts`). 게임2 넷코드 모델은 "서버 20Hz 권위 시뮬 브로드캐스트 + 클라 보간"이므로 **클라는 seed로 game2 권위 시뮬을 돌리지 않는다.** 시드만 공유해도 클라 FIRE 입력 타이밍(네트워크 지연)이 서버 권위 틱과 어긋나 rng 호출 순서·횟수가 갈라져 총알 속도/개수가 desync 난다. 따라서 **`rngSeed`는 서버 권위 시뮬에서만 소비**하고, 클라에는 (선택적) 예측/연출용으로만 쓰되 **서버 브로드캐스트가 항상 정본**이다.
- **게임3 (rng 미사용):** `game3.ts` "랜덤 요소 없음", `_rng` 무시. 시그니처 통일상 전달만.

#### `[C→S] match:loaded` → `[S→C] match:go` (게임2 틱 동기화)
- **[C→S] `match:loaded`** `{ "matchId": "m_9f3a2c" }` — 클라 렌더러/코어 초기화 완료.
- **[S→C] `match:go`** `{ "matchId": "m_9f3a2c", "startAtEpochMs": 1751600000500 }` — 양쪽 loaded 후 서버가 실제 틱 시작 시각 확정. (게임1·3 생략 가능.)

#### `[S→C] round:start` — 라운드 초기 상태 시드
```json
{ "roundIndex": 0, "startsAtServerMs": 1751600000000, "initialState": { "…": "게임별 초기 스냅샷 (§3.3~3.5)" } }
```
- `initialState`: 게임1=`target`+양쪽 시작 `value`(rng 3회 결과), 게임2=시작 좌표(공격자/회피자 x, 총알 없음), 게임3=`startDistanceFromEdge`. **게임1·2의 rng는 서버가 소유**하며 결과 상태를 내려보낸다.
- 카운트다운은 `round:start` 직전 `round:countdown` 또는 `startsAtServerMs`로 클라 계산(둘 중 택1은 **미확정**).

#### `[S→C] round:countdown` (선택)
`{ "roundIndex": 0, "count": 3 }` — 3→2→1→0(시작) 매초. 없으면 `startsAtServerMs`로 대체.

#### `[S→C] round:end` — 라운드 종료 (코어 `state.result !== null` 시)
```json
{ "roundIndex": 0, "winner": "P1", "reason": "RING_OUT", "score": { "P1": 1, "P2": 0 } }
```
- `winner: PlayerRole | null`(null=무승부 라운드, `RoundResult.winner`).
- `reason`: 게임3=`state.resultReason`(`'RING_OUT'|'TIMEOUT'`, `game3.ts` 실존 필드), 게임1=`'HOLD_COMPLETE'|'TIMEOUT'`(코어엔 사유 필드 없음 — 서버 파생), 게임2=`'HIT'|'SURVIVE_TIMEOUT'`(코어엔 사유 필드 없음 — 서버 파생. `Game2State`는 `result`만 가짐).
- `score`: 누적 라운드 승수(표시용).

#### `[S→C] match:end` — 매치 종료 & 최종 결과
`roundCount`만큼 라운드가 끝나 오케스트레이터가 `aggregateMatch`로 최종 `MatchResult`를 확정하고, **`game_match` INSERT 커밋이 성공한 뒤**(§5.5) 방송한다.
```json
{
  "matchId": "m_9f3a2c",
  "result": "P1_WIN",
  "recordedMatchId": "5567",
  "summary": {
    "gameId": 2,
    "config": { "roundCount": 3, "timePerRoundSec": 20 },
    "rounds": [ { "roundIndex": 0, "winner": "P1" }, { "roundIndex": 1, "winner": "P2" }, { "roundIndex": 2, "winner": "P1" } ],
    "result": "P1_WIN"
  }
}
```
- `result`: `MatchResult`(`types.ts` = `schema.prisma` enum).
- `recordedMatchId`: 방금 insert된 `game_match.id`(BigInt→string). **INSERT 성공 분기에서만 존재**(§5.5). DB엔 라운드별 상세가 없으므로 `summary.rounds`는 응답 전용(미영속).
- INSERT 실패 시엔 이 이벤트 대신 `match:error`(§5.5) — DB에 없는 결과를 확정 결과로 방송하지 않는다.

### 3.2 틱/입력 동기화 모델

| | 게임1 숫자 | 게임2 총알 | 게임3 펜싱 |
|---|---|---|---|
| 서버 tick 주체 | 이벤트 반영 + 판정 | 20Hz 고정 시뮬 | 1초 틱 윈도우 판정 |
| 클라 입력 이벤트 | `game:input` (엣지) | `game:input` (엣지/홀드) | `game:move` (윈도우당) |
| 서버 브로드캐스트 | `game:state` (변경 시/저빈도) | `game:state` (20Hz 스냅샷) | `game:tick` (윈도우 경계) |
| 클라 예측/보정 | 불필요 | 필요(보간; 예측 제한적) | 불필요 |
| rng 소유 | 서버(초기화 3회) | 서버(발사마다) | 없음 |

- **입력 시퀀스 번호 `seq`**: **모든 `[C→S]` 입력**(`game:input` 및 `game:move`)에 단조 증가 `seq`를 붙인다. 서버는 다음 스냅샷에 `lastAckSeq`를 포함하고 `game:reject`도 `seq`를 에코해 유실/중복을 참조한다. (게임3 `game:move`는 `seq` + `windowIndex` 둘 다 가짐 — §3.5.)
- **진행 지표**: 게임3은 `tickIndex`(`Game3TickEvent.tickIndex` 실존 필드). **게임2는 `elapsedMs`를 진행 지표로 그대로 사용한다** — `Game2State`에는 tick 카운터 필드가 없다(초안의 `tick`은 코어 필드가 아니라 서버가 `elapsedMs / GAME2_TICK_MS`로 합성하는 파생값이므로 스냅샷 진행 지표로는 실존 필드 `elapsedMs`를 쓴다). 게임1은 `elapsedMs`/서버 `stateSeq`.
- **게임2 예측(제한적):** 클라가 자기 입력을 즉시 로컬 반영해 렌더하되, **예측 대상은 P2 회피자 위치(및 P1 자동이동/TURN 위치)로 한정**한다. **FIRE는 예측하지 않는다** — `tickGame2`는 FIRE 입력을 받은 틱에 `state.rng()`로 vy를 뽑아 총알을 생성하므로(단일 함수라 위치 예측만 분리 불가), 클라가 공유 코어로 자기 FIRE를 예측하면 서버와 다른 vy·id의 로컬 총알이 필연 생성돼 "총알 예측 안 함/서버 id 보간 매칭" 원칙과 어긋난다. 총알은 항상 서버 스냅샷을 권위로 삼아 위치만 보간한다. (공유 코어를 "위치-only 예측"에 그대로 재사용할 수 없다 — FIRE→rng 총알 결합 때문.)
- **게임1·3 예측 불필요:** 게임1은 ±1 이벤트 왕복 지연이 체감 무해, 게임3은 1초 틱이라 지연 여유 큼 → 서버 확정 상태 그대로 표시.

### 3.3 게임1 "숫자 맞추기" — 이벤트 기반

넷코드 하. `game1ActionFromKey` 매핑상 **key1=DECREMENT, key2=INCREMENT**(`GAME1_KEY_ACTION`).

**[C→S] `game:input`** — 증감 엣지(키 누름마다 1건):
```json
{ "seq": 42, "action": { "gameId": 1, "type": "INCREMENT" } }
```
- `type: 'INCREMENT'|'DECREMENT'`(`Game1ActionType`). `player`는 서버가 소켓→role로 채운다(위조 방지, §3.7).
- 서버는 `InputFrame<Game1Action>`으로 감싸 권위 `tick`: `value = clamp(value ± 1, 1, 100)`(`GAME1_MIN_VALUE`~`GAME1_MAX_VALUE`).
- 내 role의 액션만 반영. 과도 연타는 값이 [1,100] 클램프라 왜곡 불가(rate limit은 제안).

**[S→C] `game:state`** — 전체 상태 스냅샷(값 변경 시/저빈도 제안 100ms). 상태가 작아 **전체 스냅샷 고정**(델타 불필요):
```json
{
  "stateSeq": 128, "lastAckSeq": 42, "target": 57,
  "players": {
    "P1": { "value": 57, "holdProgress": 0.62, "matched": true },
    "P2": { "value": 51, "holdProgress": 0, "matched": false }
  },
  "timeRemainingMs": 21400
}
```
- `target`=`Game1State.target`, `value`=`Game1PlayerState.value`, `holdProgress`=`holdMs/3000`(`GAME1_HOLD_TO_WIN_MS`), `matched`=`Game1PlayerDerived.matched`, `timeRemainingMs`=`Game1Derived.timeRemainingMs`.
- **승패 규칙(초안 minor 확정)**: **승리는 `holdMs >= 3000`(→ `round:end reason:HOLD_COMPLETE`)**, 그 외 **라운드 시간 종료(`elapsedMs >= timeLimitMs`) 시 `DRAW`(→ `round:end reason:TIMEOUT`)**. `game1.ts tick`이 두 경우 모두 `state.result`를 세팅한다. 클라는 `holdProgress` 게이지만 표시하고 승패는 미판정.

### 3.4 게임2 "총알 피하기" — 20Hz 실시간 시뮬

넷코드 상. 서버 `GAME2_TICK_MS=50`(20Hz) 고정 틱으로 위치·투사체·충돌 권위 시뮬 후 스냅샷 브로드캐스트. 클라 보간 렌더.

**[C→S] `game:input`** — 비대칭 입력(`Game2Action.type` 6종). P1 엣지 `TURN`/`FIRE`, P2 홀드 down/up `LEFT_DOWN`/`LEFT_UP`/`RIGHT_DOWN`/`RIGHT_UP`:
```json
{ "seq": 300, "action": { "gameId": 2, "type": "FIRE" } }
{ "seq": 71,  "action": { "gameId": 2, "type": "LEFT_DOWN" } }
```
- 서버는 매 20Hz 틱마다 도착 액션을 `reduceGame2Inputs(prev, actions)`로 접어 `Game2Inputs{p1Turn,p1Fire,p2Left,p2Right}` 생성 후 `tickGame2`. P1 엣지는 매 틱 리셋, P2 홀드는 down/up 유지.
- **역할 강제는 서버가 한다(§3.7):** `reduceGame2Inputs`가 `(a.player, a.type)`을 보긴 하지만 **클라가 보낸 `a.player`를 그대로 신뢰**하므로, 서버가 **소켓 인증→role로 `action.player`를 무조건 덮어쓴 뒤** 코어에 넣어야 크로스-role 조작이 차단된다.
- **발사 쿨다운**: `FIRE`는 `attacker.cooldownMs <= 0`일 때만 총알 생성(`fireCooldownMs=400`). 쿨다운 중 발사는 서버가 무시(큐잉 없음).

**[S→C] `game:state`** — 20Hz 권위 스냅샷(공격자 x·dir, 회피자 x, 총알 배열):
```json
{
  "elapsedMs": 12000, "lastAckSeq": 300,
  "attacker": { "x": 63.2, "dir": 1 },
  "dodger": { "x": 48.7 },
  "bullets": [ { "id": 12, "x": 63.2, "y": 41.5 }, { "id": 13, "x": 30.0, "y": 78.9 } ],
  "remainingMs": 8000
}
```
- 진행 지표는 **`elapsedMs`**(코어 실존 필드; §3.2). `attacker.x`/`attacker.dir`(1|-1)/`dodger.x`: 논리 좌표(`fieldWidth×fieldHeight` 기본 100×100). 클라는 `gameConfig`로 정규화.
- `bullets[]`: `{ id, x, y }`. **`vy`는 전송 안 함** — 서버 rng 소유라 클라는 두 스냅샷 사이 위치를 선형 보간만. `id`(`nextBulletId` 단조 증가)로 프레임 간 총알 추적·보간 매칭.
- (대안) `Game2View`의 정규화값(`attackerXRatio`/`dodgerXRatio`/`bullets[{id,xRatio,yRatio}]`/`remainingMs`/`fireReadyRatio`)을 그대로 실어보내도 됨(제안). 보간 정밀도를 위해 논리 좌표 우선 권장.

**충돌·승패**: 서버 코어(`tickGame2`)만 판정 — 총알이 회피자 히트박스(`dodgerHalfWidth + bulletRadius`)를 스치면 `P1_WIN`, `roundDurationMs` 생존 시 `P2_WIN`(충돌 우선). 클라는 피격을 연출만 예측, 확정은 `round:end`(`reason:'HIT'|'SURVIVE_TIMEOUT'` — 서버 파생 사유).

### 3.5 게임3 "펜싱" — 1초 틱

넷코드 최하. 서버 `tickIntervalMs=1000` 윈도우로 양쪽 입력 모아 상성 동시판정. **랜덤 없음**. **key1=ATTACK, key2=DODGE**, 무입력=`NONE`(클라가 NONE 보낼 필요 없음).

**[C→S] `game:move`** — 윈도우당 행동:
```json
{ "seq": 88, "windowIndex": 5, "action": { "gameId": 3, "type": "ATTACK" } }
```
- `seq`(§3.2 통일 규약) + `windowIndex`(귀속될 `tickIndex`, 경계 정합성 검사용).
- **윈도우 내 다중 입력**: 마지막 채택(`game3.ts pending[player]=a.type`).
- **입력 마감/지각**: 서버가 윈도우 경계(매 1000ms)에서 그때까지의 마지막 행동으로 판정. 경계 넘겨 도착한 지각 `game:move`는 **다음 윈도우**로 귀속(이미 지난 윈도우 재판정 안 함). 아무 입력 없으면 `NONE`.
- **역할 강제는 서버가 한다(§3.7):** `game3.ts`는 `pending[a.player]=a.type`로 payload의 player를 그대로 신뢰하므로 코어 자체 role 게이팅이 없다. 서버가 소켓→role로 덮어써야 안전.

**[S→C] `game:tick`** — 윈도우 판정 결과(`Game3TickEvent` + 거리):
```json
{
  "tickIndex": 5,
  "moves": { "P1": "ATTACK", "P2": "DODGE" },
  "pushed": "P1", "clash": false, "fell": null,
  "distance": { "P1": 1, "P2": 3 }
}
```
- `moves: Record<PlayerRole, Game3Move>`(`'ATTACK'|'DODGE'|'NONE'`). `pushed: PlayerRole|null`(상성 `LOSES_TO`: ATTACK<DODGE, DODGE<NONE, NONE<ATTACK; 같으면 null). `clash = pushed===null`. `fell: PlayerRole|null`(이 틱 낙사 — `distanceFromEdge < 0`, 시작 `startDistanceFromEdge=3`이라 4번째 밀림). `distance`=각 `Game3PlayerState.distanceFromEdge`(0=벼랑 끝, 생존).
- `fell !== null`이면 곧 `round:end reason:'RING_OUT'`. 라운드 시간(`roundDurationMs`) 종료 시 `pushedCount` 큰 쪽 패배, 동률 DRAW(`reason:'TIMEOUT'`, `judgeTimeout`).

### 3.6 매치 종료 → 영속화 & 결과 화면 재조회

- 서버가 마지막 `round:end` 후 오케스트레이터가 `aggregateMatch`로 `MatchResult` 확정 → **`game_match` INSERT 커밋 성공** → `match:end`(§3.1, `recordedMatchId` 포함) 방송. 상세 쓰기 경로·실패 처리는 §5.5.
- **결과 화면 재조회(REST)** — 새로고침/재진입 대비. **조회 키는 `recordedMatchId`(DB PK)** 이며 인메모리 `matchId`가 아니다(§0.2).

**`GET /api/matches/:recordedMatchId`** — 매치 결과 조회
요청: `GET /api/matches/5567` (`Cookie: madpump_sid`)
응답 200:
```json
{
  "recordedMatchId": "5567",
  "gameId": 3,
  "result": "P1_WIN",
  "players": {
    "P1": { "userId": "101", "nickname": "june" },
    "P2": { "userId": "205", "nickname": "sora" }
  },
  "playedAt": "2026-07-04T08:12:33.000Z"
}
```
- 서버는 `game_match`를 `id = :recordedMatchId AND deleted_at IS NULL`로 조회(존재하지 않는 문자열 컬럼에 의존하지 않음). `player1_id/player2_id`가 곧 P1/P2.
- 에러: `401 UNAUTHENTICATED`, `403 FORBIDDEN`(당사자 아님 — 제안), `404 MATCH_NOT_FOUND`(없음/soft-deleted).
- `rounds[]` 라운드 상세는 DB에 없으므로 REST로 반환하지 않는다(§5.8 갭1). 재진입 시엔 최종 `result`만 노출(좋은 fallback: "라운드 상세 없음").

### 3.7 부정행위 방지 (서버 권위의 구체 규칙)

세 게임 공통 불변식 — **클라는 '입력'만 보내고 '결과'는 절대 못 보낸다.**
1. **결과 미신뢰**: 클라가 승패/점수/충돌을 담은 어떤 메시지를 보내도 서버는 무시. 승패는 오직 서버 코어의 `state.result`에서만 나온다.
2. **role 위조 차단 — 유일한 방어선은 서버의 덮어쓰기다(초안 major 확정).** `[C→S]` 액션의 `player`를 클라가 지정해도 서버가 **소켓 인증→role 매핑으로 `action.player`를 무조건 덮어쓴 뒤** 코어에 전달한다. **코어의 role 게이팅은 위조 방지가 아니다** — `game3.ts`는 `pending[a.player]=a.type`로, `reduceGame2Inputs`는 `(a.player,a.type)` 조합으로 **클라가 보낸 `a.player`를 그대로 신뢰**한다. 즉 P1 클라가 `{player:'P2', type:'LEFT_DOWN'}`을 위조하면 코어는 그대로 `p2Left=true`로 회피자를 조종한다. 서버 덮어쓰기를 생략하면 상대 조작 익스플로잇이 성립하므로, 구현자는 반드시 서버에서 role을 강제해야 한다.
3. **액션 유효성**: 내 role 허용 액션만 수용 — 게임1 `INCREMENT`/`DECREMENT`, 게임2 P1은 `TURN`/`FIRE`·P2는 `LEFT/RIGHT_DOWN/UP`, 게임3 `ATTACK`/`DODGE`. 그 외 `type`은 `game:reject`.
4. **쿨다운·클램프**: 게임2 `fireCooldownMs=400`은 서버 상태 기준이라 연타 우회 불가. 게임1 값은 서버가 `[1,100]` 클램프(`clampValue`).
5. **틱 윈도우 강제**: 게임3 지난 윈도우 재판정 불가(지각→다음 윈도우). 게임2는 20Hz 서버 틱에서만 상태 진행 — 입력 스팸으로 시뮬 앞당김 불가.
6. **[S→C] `game:reject`** — 무효 입력 통지(디버그·안티치트):
   ```json
   { "seq": 305, "reason": "COOLDOWN_ACTIVE" }
   ```
   `reason`: `WRONG_ROLE | INVALID_ACTION | COOLDOWN_ACTIVE | RATE_LIMITED | STALE_WINDOW`. 무효 입력은 상태 미반영·조용히 폐기하되 UI 보정용으로 통지(플레이 필수 아님 — 미구현 시 서버는 그냥 무시). `seq`로 참조(게임3은 `windowIndex`도 병행 참조 가능).

### 3.8 이 섹션 미확정 요약
온라인 P1/P2 배정 규칙 · 게임2 라운드별 교대 · 매치 result 집계 공식(`aggregateMatch`, best-of-N) · 끊김 시 몰수/무효 · 카운트다운 이벤트 vs `startsAtServerMs`. → [열린 질문](#열린-질문--결정-필요).

---

## 4. 네트워킹 방법론 & 데이터 흐름

> 두 질문에 정면으로 답한다. **Q2** — 온라인 실시간 게임은 보통 어떻게 네트워킹하나, 우리는 뭘 골라야 하나. **Q1** — 게임 데이터가 서버/DB/양 클라 사이를 실제로 어떻게 오가나.
> 결론: 이 프로젝트는 **서버 권위**가 이미 확정(`TECH_STACK.md §3·§4.1`)이고 세 게임이 전부 순수·결정적 `tick(state,inputs,dt)=>newState`라 그 결정이 저렴하게 성립한다. 실시간 게임 상태는 **DB에 저장하지 않는다** — 서버 RAM이 권위 원본, DB는 신원·게임사전·매치 최종결과 1행만.

### 4.1 (Q2) 네트워크 방법론 taxonomy — 5가지 보편 모델

#### (A) 서버 권위 + 상태 브로드캐스트 ("덤 클라")
- **정의**: 서버가 유일하게 시뮬. 클라는 입력만 올리고 서버 상태 스냅샷을 **그대로 그린다**(판정 로직 안 돌림).
- **장/단**: 가장 단순·치팅 강함·동기화 문제 없음 / 내 입력이 RTT만큼 늦게 반영(고빈도 이동 게임 손맛↓).
- **적합도**: 게임1·게임3 **최적**(4.1.7).

#### (B) 서버 권위 + 클라 예측/보정
- **정의**: 서버 권위 유지하되 클라가 자기 입력을 로컬에서 미리 시뮬(예측)해 즉시 그리고, 서버 스냅샷이 오면 어긋난 부분을 되감아 재적용(reconcile). 원격 개체는 과거 스냅샷 사이를 보간.
- **장/단**: 서버 권위(치팅 방지) 유지 + 즉각 반응 / 예측·정정 로직 복잡, 클라·서버 동일 시뮬 함수 필요.
- **적합도**: 게임2에만 이득. 우리 코어가 shared 함수라 "동일 시뮬" 전제가 공짜. 단 2인 규모라 **v1은 보간까지만, 예측은 선택(제안)**.

#### (C) 결정적 락스텝
- **정의**: 아무도 상태를 안 보냄. 전원 입력만 교환하고 각자 동일 결정적 시뮬. RTS 고전.
- **장/단**: 대역폭 극소 / 완전 결정성 필수(1비트만 갈라져도 데스싱크), 매 틱 전원 입력 대기(최저속 대기), 분산 권위.
- **적합도**: **기각**(최저속 대기·분산 권위가 랭킹 신뢰성과 상충).

#### (D) 롤백 넷코드(GGPO식)
- **정의**: 상대 입력을 예측해 즉시 진행, 다르면 롤백 후 재시뮬.
- **장/단**: 프레임 단위 반응 최고 / 매우 복잡·결정성 요구.
- **적합도**: **기각(과설계)**. 가장 빠른 게임2도 20Hz 고정 틱이라 롤백 불필요.

#### (E) 클라 권위 / 순수 릴레이
- **정의**: 클라가 판정, 서버는 중계만.
- **장/단**: 구현 최쉬움 / **클라가 결과 조작 가능(치팅 무방비)**.
- **적합도**: **명시적 기각**. 승패가 분반 랭킹 반영 + 외부 확산 목표라 클라 판정 불신(`TECH_STACK.md §3`). 이 프로젝트가 (A)/(B)를 택한 근본 이유.

#### 4.1.5 비교 요약

| 모델 | 권위 | 전송 | 체감지연 | 치팅내성 | 복잡도 | 이 프로젝트 |
|---|---|---|---|---|---|---|
| (A) 서버권위+브로드캐스트 | 서버 | 상태 | 중(RTT) | 강 | 낮음 | **게임1·3 채택** |
| (B) 서버권위+예측/보정 | 서버 | 상태+입력 | 낮음 | 강 | 중 | **게임2 채택(보간 필수, 예측 제안)** |
| (C) 락스텝 | 분산 | 입력 | 높음(최저속 대기) | 약 | 중 | 기각 |
| (D) 롤백 | 분산 | 입력 | 매우낮음 | 약 | 매우높음 | 기각(과설계) |
| (E) 클라권위/릴레이 | 클라 | 자유 | 낮음 | **없음** | 최저 | **기각(치팅)** |

#### 4.1.6 왜 "순수·결정적 tick"이 서버 권위를 저렴하게 만드나
세 코어가 전부 부작용 없는 순수 함수이고 `shared/`에 산다. 이 한 설계가:
1. **서버·클라가 같은 코드**를 돌린다(두 번 구현 금지). 서버=권위 판정용, 클라=렌더/예측용 import → 재구현 데스싱크 원천 차단.
2. **결정적** — 같은 초기 state+입력열+`dt`면 항상 같은 결과. 유일 비결정 요소는 주입식 `rng`뿐: 게임1=init 3회(값을 서버가 확정), 게임2=발사마다(서버 권위 rng가 vy 확정 → 클라는 스냅샷 vy를 그림), 게임3=랜덤 없음.
3. **오프라인/온라인 같은 코어** — 코어는 자기가 어디서 도는지 모른다.
→ **서버 권위 = "같은 함수를 서버에서 한 번 더 호출".** 그래서 (A)/(B)가 저비용.

#### 4.1.7 게임별 모델 배정 (`TECH_STACK.md §4.2`)

| 게임 | 넷코드난이도 | 권위 판정 | 클라 모델 |
|---|---|---|---|
| 게임1 숫자 | 하(이벤트) | 클라 ±1 이벤트만 전송, 서버가 현재값+3초 유지 타이머 판정 | 덤 클라 (A). 저빈도·이산이라 RTT 무의미 |
| 게임3 펜싱 | 최하(1초 틱) | 서버 1초 윈도우 입력 수집→상성 판정→브로드캐스트 | 덤 클라 (A). 판정주기 1000ms≫RTT라 지연 흡수 |
| 게임2 총알 | 상(실시간) | 서버 20Hz 고정 틱(`GAME2_TICK_MS=50`) 위치·투사체·충돌 시뮬 후 브로드캐스트 | (B): 보간 필수, 자기 개체 예측은 제안(미확정) |

### 4.2 전송 형식 & 전략

#### 4.2.1 무엇을 보내나 — full snapshot vs delta vs input-only

| 전략 | 정의 | 장점 | 단점 | 언제 |
|---|---|---|---|---|
| **전체 스냅샷** | 매 전송마다 상태 전체 | 단순·무상태(패킷 하나로 완전 복원), 유실/재접속 강함 | 상태 크면 대역폭 낭비 | 상태가 작거나 저빈도 |
| **델타** | 직전 대비 바뀐 필드만 | 대역폭 절약 | 기준 스냅샷 놓치면 복원 불가·복잡 | 상태 크고 고빈도 |
| **입력만** | 상태 대신 입력만, 각자 재시뮬 | 최소 대역폭 | 완전 결정성/데스싱크 관리(=락스텝/롤백) | 참가자 많고 상태 거대 |

**이 프로젝트 권장**:
- **게임1·3**: 상태가 아주 작다(게임1=타겟+양쪽 `{value, holdMs}`; 게임3=양쪽 `{distanceFromEdge, pushedCount}`+마지막 틱 이벤트) → **전체 스냅샷**(게임1 `game:state`) 또는 **이산 이벤트**(게임3 `game:tick`)로 충분. 델타 불필요.
- **게임2**: 20Hz 전체 스냅샷(`game:state`). 총알 배열이 커질 수 있으나 2인 규모라 충분. 과다 시 델타 도입(제안).
- **입력만(락스텝)은 안 씀**(4.1(C) 기각).

#### 4.2.2 신뢰성·순서 — Socket.IO(TCP) 위에서 공짜로 얻는 것
Socket.IO 단일 프로세스(내부 TCP/WebSocket)라 **순서 보장 + 신뢰 전달**이 전송 계층에서 이미 성립 → UDP 넷코드처럼 시퀀스·ack·재전송·재정렬을 직접 구현할 필요 없음. 필요 시 이벤트 ack 콜백으로 수신 확인 가능(실시간 입력엔 보통 불필요 — 다음 스냅샷이 곧 사실을 알려줌). 트레이드오프: TCP head-of-line 블로킹으로 순간 지연이 튈 수 있으나 20Hz·2인 규모에선 수용 가능. UDP로 갈 이유 없음.

#### 4.2.3 직렬화 포맷 — JSON vs YAML vs 바이너리
- **JSON (채택)**: Socket.IO 기본, 디버깅/문서화 유리, 상태·액션이 이미 TS 플레인 객체라 변환비용 0. 2인 규모엔 충분. **모든 payload 예시가 JSON인 이유.**
- **바이너리(MessagePack 등)**: 고빈도·대량 필드일 때 크기·파싱 이득. 게임2 총알 폭증으로 20Hz JSON이 부담되면 그때 전환 고려(제안). 현재 불필요.
- **YAML (실시간 전송엔 안 씀)**: YAML은 **사람이 손으로 쓰는 설정 파일**용(주석·앵커·들여쓰기 가독성). 실시간 와이어에 안 쓰는 이유 — (1) 파싱이 JSON보다 느리고 무거움, (2) 들여쓰기 민감 문법이라 기계 대 기계 스트리밍에 취약, (3) Socket.IO 미지원. → **YAML은 이 프로젝트에서 설정/문서 전용**(예: 밸런스 튜닝 파일), **네트워크 payload로는 절대 사용 안 함.**

#### 4.2.4 핵심 개념 3가지
- **틱레이트**: 서버가 시뮬을 초당 몇 번 돌리나. 게임2=20Hz, 게임3=1Hz(판정 윈도우), 게임1=이벤트 기반. 높을수록 부드럽지만 대역폭·CPU↑.
- **보간**: 스냅샷 사이 빈 시간을 직전 두 스냅샷을 잇는 위치로 채워 부드럽게. 게임2에서 50ms 스냅샷을 60fps로. 대가로 화면은 서버보다 살짝 과거(렌더 지연).
- **지연 보상(lag compensation)**: 서버가 플레이어가 봤던 과거 시점을 되짚어 억울한 판정을 줄임. 우리 게임엔 정밀 히트스캔이 없어 **v1 미도입(미확정)**. 게임2 충돌은 서버가 자기 시뮬 시점 기준 판정(터널링 방지 포함)하고 그 결과를 권위로 삼는다.

### 4.3 (Q1) 데이터 흐름 — 서버 / DB / 양 클라 사이를 무엇이 오가나

#### 4.3.1 먼저 오해부터: "DB에 저장해두고 양쪽으로 보낸다"는 실시간 게임에 안 맞는다
사용자가 그린 그림("게임 상태를 DB에 넣고 → DB가 양쪽으로 보낸다")은 부적합. 세 이유:
1. **지연**: DB write/read는 디스크·트랜잭션 거쳐 수~수십 ms. 20Hz로 왕복하면 틱 예산을 다 먹음. 상태는 **RAM에서 오가야** 함.
2. **권위**: DB는 규칙을 모르는 저장소, 승패를 **판정** 못 함. 판정은 서버 프로세스(코어 `tick`). DB 중계로 쓰면 권위가 흐려짐.
3. **용량·수명**: 라이브 상태는 매 틱 바뀌고 매치 끝나면 버려도 되는 휘발성. DB에 쌓으면 초당 수십 row 무의미 적재. **스키마에 방/세션/라이브상태/라운드별 상세 테이블이 없다**(테이블 7개, `game_match`는 최종 결과 1행만).

**올바른 그림**: **서버 RAM = 권위 원본, Socket.IO = 실시간 전달 통로(양쪽 브로드캐스트), DB = 영구 기록만(신원·게임사전·매치 최종결과).** 방·매칭 큐도 서버 인메모리.

DB가 담는 것(`schema.prisma`): (a) 신원 `app_user`/`user_group`(매치 시작 시 read), (b) 게임 사전 `game`(id 1/2/3, 시드 3행, 정적 참조), (c) 매치 종료 결과 1행 `game_match(game_id, player1_id, player2_id, result, played_at)`(온라인만, 최종 `MatchResult` 하나, 라운드 상세 없음). 부수: `match_edit_history`(admin 감사), `score_config`(점수 가중치 단일행 id=1).

#### 4.3.2 한 매치의 데이터 흐름 (라운드 오케스트레이터 반영)

```
[매치 시작]
  DB(app_user, user_group) --읽기--> 서버가 양쪽 신원 로드
  서버: 라운드 오케스트레이터 생성 + 인메모리 매치 런타임(matchId) 준비   ← DB 쓰기 없음
  서버 --match:start(S→C, 개별)--> 양쪽 클라 (config·역할·gameConfig·상대정보)

[라운드 반복] r = 0 .. roundCount-1   (DB 접근 전혀 없음 — 전부 RAM + 소켓)
  서버 --round:start--> createGameNState(config, seededRng) 로 라운드 초기 상태
  클라 --game:input / game:move (C→S)--> 서버
  서버: 권위 tick() 실행 (게임2=20Hz 고정틱 / 게임3=1초 윈도우 / 게임1=이벤트+타이머)
  서버 --game:state / game:tick (S→C)--> 양쪽 클라 (권위 스냅샷/이벤트)
  코어 state.result 확정(=RoundResult) → 서버 --round:end--> 양쪽, rounds[]에 누적

[매치 종료 — 최종 결과 확정]
  서버: aggregateMatch(rounds[])로 MatchResult 확정            (코어 1라운드 결과 ≠ 매치 결과)
  서버 --INSERT 1행 (await 커밋 성공까지)--> DB(game_match)    ← 게임플레이 유일한 DB 쓰기
  서버 --match:end(S→C, recordedMatchId 포함)--> 양쪽 클라     (INSERT 성공 후에만 방송; §5.5)

[사후 조회]
  클라 --GET /api/leaderboard / GET /api/matches/:recordedMatchId--> 서버가 DB read/집계 --> 응답
```

> **초안 major 확정**: 코어 `state.result`(=라운드 결과)와 매치 최종 `MatchResult`를 분리한다. `roundCount:3`이어도 첫 라운드가 끝나는 순간 INSERT되지 않는다 — 오케스트레이터가 `roundCount`만큼 라운드를 돌려 `RoundResult[]`를 모으고 `aggregateMatch`로 최종 결과를 확정한 **그 시점**에만 `match:end`/INSERT가 일어난다.

##### 진행 중 이벤트 상세 (정의는 §3, 여기선 흐름 관점)

- **[C→S] `game:input` / `game:move`**: 클라 입력. payload는 §3.3~3.5. `player`/`gameId`는 서버가 소켓 인증→role로 **덮어써 재검증**(스푸핑 방지, §3.7) — payload의 role은 신뢰하지 않는다.
- **[S→C] `game:state`**: 서버 권위 스냅샷(게임2 20Hz, 게임1 저빈도). `rng`·`config`·`view`는 전송 제외(`rng`는 직렬화 비대상; `config`는 `match:start`에서 1회; `view`는 클라가 재계산). 게임2 총알 `vy`는 미전송(서버 rng 확정, 클라 보간).
- **[S→C] `game:tick`**: 게임3 1초 윈도우 판정(`Game3TickEvent` + 양쪽 `distanceFromEdge`).
- **[S→C] `match:end`**: 종료 통보(§3.1). 예시는 §3.1 참조 — **게임2엔 사유 필드가 없다**(초안 minor 확정: `Game2State`는 `result`만; `'HIT'` 같은 값은 코드에 없음). 게임별 `round:end.reason`은 게임3만 코어 실존 필드(`resultReason:'RING_OUT'|'TIMEOUT'`)이고 게임1·2 사유는 **코어 밖 서버 파생 필드**임을 명시한다.

#### 4.3.3 `rngSeed`의 용도 (초안 nit 확정)
`match:start`의 `rngSeed`는 **v1 기본 경로에서 클라 필수가 아니다.** v1은 게임1=덤 클라(서버가 확정한 초기 3값/스냅샷을 그대로 받음), 게임2=보간-only(서버 스냅샷의 총알을 그대로 그림)라 **클라가 코어 rng를 로컬로 돌리지 않으므로 seed가 실제로 쓰이지 않는다.** seed는 **(선택적) 클라 예측(모델 B, 게임2 미확정) 및 리플레이 재현용**에서만 의미가 있다. 게임1 초기값은 "서버가 결과 값을 직접 스냅샷으로 내려준다"로 서술을 통일한다(seed 재현과 값 직송 중 값 직송 채택 — 덤 클라 원칙과 일치).

---

## 5. 영속화·DB 쓰기 경로 & 스키마 갭 분석

> 근거: `schema.prisma`(정본 `docs/ERD.md`), `types.ts`, `games/{game1,game2,game3}.ts`, `TECH_STACK.md §4.2~4.4`. 원칙: 모든 승패 판정·DB 쓰기는 서버에서만. 클라는 DB에 직접 쓰지 않는다.

### 5.1 매치 생명주기 × DB 상호작용 (개관)

| 단계 | 시점 | DB 연산 | 대상 | 트랜잭션 | 실패 시 |
|---|---|---|---|---|---|
| (a) 매치 시작 전 | 소켓 연결/방 입장, 세션→유저 확정 | **SELECT** | `app_user`(+`user_group`) | 불필요(읽기) | 유저 없음/`deleted_at != NULL` → 입장 거부, 매치 미생성 |
| (b) 진행 중 | 라운드 틱 루프 전체 | **없음(DB 무접촉)** | 방·매치·큐 전부 인메모리 | — | 서버 재시작 = 진행중 매치 소실(§5.8) |
| (c) 매치 종료 | 최종 `MatchResult` 확정 순간 | **INSERT 1행** | `game_match(game_id, player1_id, player2_id, result, played_at)` | v1 단일 INSERT라 명시 트랜잭션 불요(§5.5) | INSERT 실패 → 미기록+`match:error`(§5.5) |
| (d) 리더보드 조회 | 등수 화면 요청 시 | **집계 SELECT** | `game_match`+`score_config`+`app_user` | 불필요(읽기) | — |

핵심: **온라인 매치의 "최종 결과 한 줄"만 DB에 남는다.** 오프라인은 서버·DB 무경유 → `game_match` 미기록(`ERD.md note #2`).

### 5.2 서버 인메모리 상태 (형태·수명, 제안)

```ts
interface Room {
  code: string | null;          // 코드방=숫자 문자열, 빠른시작=null(내부 roomId 사용)
  gameId: GameId;
  hostUserId: bigint;
  config: RoundConfig;
  players: { P1?: bigint; P2?: bigint };  // 역할 배정(§2.2/§3.0)
  match?: MatchRuntime;
}
interface MatchRuntime {
  matchId: string;              // 인메모리 런타임 id(§0.2) — DB로 안 감
  rounds: RoundResult[];        // 라운드별 승자 누적(메모리에만)
  currentRoundIndex: number;
  gameState: Game1State | Game2State | Game3State;  // 현재 라운드 코어 state
  seed?: number;                // (선택) 게임2 예측/리플레이용
}
const rooms = new Map<string, Room>();
const quickMatchQueue: Map<GameId, bigint[]> = new Map();  // 게임별 큐
```
- **생성**: 코드방=`room:create` / 빠른시작=큐 2명. **파기**: 매치 종료 INSERT 완료 후, 또는 양쪽 disconnect. **수명 = 프로세스 수명**(§5.8).

### 5.3 (a) 매치 시작 전 — 신원/그룹 로드 (SELECT)
```ts
const u = await prisma.appUser.findFirst({
  where: { id: userId, deletedAt: null },   // soft-delete 유저 입장 불가
  select: { id: true, nickname: true, googleImageUrl: true, uploadedImageKey: true, groupId: true },
});
if (!u) throw RoomError('USER_NOT_FOUND');
```
- `deleted_at IS NULL` 필터 필수. `group_id`는 리더보드 귀속 판단용이나 매치 **기록에는 저장 안 됨**(리더보드는 조회 시점 유저 소속으로 집계, §5.8 갭).

### 5.4 (b) 진행 중 — DB 무접촉
라운드 틱 루프(게임3=1초 윈도우 / 게임1=±이벤트 / 게임2=20Hz)는 **DB를 전혀 안 건드린다**. 판정은 순수 코어 `tick`이 인메모리 state 위에서 수행하고 결과를 `game:state`/`game:tick`으로 브로드캐스트만. DB I/O가 틱 루프에 없어 지연·락 걱정 없음.

### 5.5 (c) 매치 종료 — `game_match` INSERT (권위 쓰기 경로)

**쓰기 순서 확정 (초안 major 수정 — INSERT 커밋 후에만 결과 방송):**
```
(1) 오케스트레이터가 aggregateMatch(rounds[])로 최종 MatchResult 확정
(2) game_match INSERT를 await로 커밋 성공까지 확인   ← recordedMatchId(BigInt PK) 여기서 확보
(3) 그 후에야 recordedMatchId를 담아 match:end(S→C) 방송
```
INSERT가 실패하면 **정상 결과(match:end)를 방송하지 않는다** — 클라가 DB에 없는 결과를 확정 결과로 받지 않도록. 대신 `match:error`(unrecorded/재시도 실패)를 보낸다. `match:end.recordedMatchId`는 **INSERT 성공 분기에서만 존재**(optional).

```ts
// 온라인 매치 최종 결과 확정 시점, 서버(방 핸들러) 단독 실행
const match = await prisma.gameMatch.create({
  data: {
    gameId,          // Int @db.TinyInt (1|2|3) — Game 사전 FK
    player1Id,       // BigInt — AppUser FK (인메모리 Room.players.P1)
    player2Id,       // BigInt — AppUser FK (인메모리 Room.players.P2)
    result,          // MatchResult enum
    // playedAt 생략 → @default(now())
  },
  select: { id: true },
});
// 커밋 성공 확인 후에만:
io.to(room).emit('match:end', { matchId, result, recordedMatchId: String(match.id), summary });
```
- **넣는 컬럼**: `game_id, player1_id, player2_id, result` (+ `played_at` 자동). `deleted_at`=NULL.
- **P1/P2 매핑**: 인메모리 `players.P1/P2` → `player1_id/player2_id`. `result`는 이 역할 기준(`P1_WIN`=player1 승). 온라인 역할 배정 규칙(방장=P1?/랜덤?) **미확정** — 확정 후 이 매핑 고정.
- **트랜잭션**: v1은 단일 INSERT라 명시 `$transaction` 불요(단일 문 원자적). *단 §5.8 라운드 테이블 확장을 채택하면* `game_match`+`game_round[]`를 한 트랜잭션으로 묶어 부분 기록 방지.

**[S→C] `match:error`** (INSERT 실패 시):
```json
{ "matchId": "m_9f3a2c", "reason": "PERSIST_FAILED", "retryable": true }
```
- 서버는 로그 + 1회 재시도(제안), 그래도 실패면 미기록으로 두되 **확정 결과 방송은 하지 않는다**(loud 실패, 가짜 매치 없음). 클라는 "결과 기록 실패" UX로 표시.

**중단/끊김 (v1 "그냥 두기", §2.5)**: 매치 도중 한쪽 소켓 끊김 → 재접속 복구 없음 → 방 파기, **INSERT 안 함**(미완결=미기록, 랭킹에 존재하지 않는 것으로 정직 처리). 몰수승 도입 여부 **미확정**(도입 시 §5.8 종료사유 컬럼과 함께 결정).

### 5.6 (d) 리더보드/등수 조회 — 집계 SELECT + `score_config`
`game_match`가 player1/player2 분리라 "유저 관점"으로 접으려면 UNION 필요 → `$queryRaw` 권장(MySQL 8 윈도우 함수 가능).

**`GET /api/leaderboard`** — 분반 리더보드
요청: `GET /api/leaderboard?groupId=7&gameId=3` (gameId 생략 시 전체 합산; `Cookie: madpump_sid`)
응답 200:
```json
{
  "groupId": "7", "gameId": 3,
  "scoreConfig": { "winPoints": 3, "drawPoints": 1, "lossPoints": 0 },
  "rows": [
    { "rank": 1, "userId": "42", "nickname": "네오", "wins": 12, "draws": 3, "losses": 4, "plays": 19, "winRate": 0.63, "points": 39 },
    { "rank": 2, "userId": "51", "nickname": "핌프", "wins": 9, "draws": 1, "losses": 8, "plays": 18, "winRate": 0.50, "points": 28 }
  ]
}
```
에러: `400 BAD_REQUEST`(groupId 누락/형식, gameId≠1|2|3), `401 UNAUTHENTICATED`, `404 GROUP_NOT_FOUND`, `403 GROUP_FORBIDDEN`(비공개 그룹 비소속 접근 — 제안).

**집계 SQL (제안)** — 유저 관점 정규화 후 가중치:
```sql
SELECT
  u.id AS user_id, u.nickname AS nickname,
  COALESCE(SUM(o.outcome = 'WIN'), 0)  AS wins,
  COALESCE(SUM(o.outcome = 'DRAW'), 0) AS draws,
  COALESCE(SUM(o.outcome = 'LOSS'), 0) AS losses,
  COALESCE(SUM(CASE o.outcome
      WHEN 'WIN'  THEN c.win_points
      WHEN 'DRAW' THEN c.draw_points
      ELSE c.loss_points END), 0)      AS points
FROM app_user u
CROSS JOIN score_config c              -- 단일 행 id=1 (win=3/draw=1/loss=0)
LEFT JOIN (
  SELECT player1_id AS user_id, game_id,
         CASE result WHEN 'P1_WIN' THEN 'WIN' WHEN 'P2_WIN' THEN 'LOSS' ELSE 'DRAW' END AS outcome
  FROM game_match WHERE deleted_at IS NULL
  UNION ALL
  SELECT player2_id AS user_id, game_id,
         CASE result WHEN 'P2_WIN' THEN 'WIN' WHEN 'P1_WIN' THEN 'LOSS' ELSE 'DRAW' END AS outcome
  FROM game_match WHERE deleted_at IS NULL
) o ON o.user_id = u.id
       /* AND o.game_id = :gameId  (gameId 필터 시에만) */
WHERE u.group_id = :groupId AND u.deleted_at IS NULL
GROUP BY u.id, u.nickname
ORDER BY points DESC, wins DESC, nickname ASC;
```
- **필수 필터 2개**: `game_match.deleted_at IS NULL`(admin 소프트삭제 매치 배제), `app_user.deleted_at IS NULL`(탈퇴 유저 배제).
- **게임별**: `game_id` 필터로 `plays = wins+draws+losses`, `winRate = wins / NULLIF(plays,0)`(`TECH_STACK §4.4` "게임 타입별" 충족 — `game_id`가 그 역할).
- **등수**: `RANK() OVER (ORDER BY points DESC, wins DESC)`(MySQL 8) 또는 앱에서 부여. 타이브레이크 (제안, 미확정) points→wins→nickname.
- **DRAW**: 양쪽 `draws+1`, 각자 `draw_points`. 매치 0인 유저는 LEFT JOIN+COALESCE로 0/0/0/0점 정직 노출(가짜 실적 없음).
- **BigInt**: `user_id`/`group_id` 문자열 직렬화.

**`GET /api/users/:userId/matches`** — 개인 전적(드릴다운, 선택)
요청: `GET /api/users/51/matches?limit=20&cursor=10420`
응답 200:
```json
{
  "userId": "51",
  "items": [
    { "recordedMatchId": "10482", "gameId": 3, "opponentId": "42", "opponentNickname": "네오",
      "outcome": "LOSS", "result": "P1_WIN", "playedAt": "2026-07-04T05:12:33.000Z" }
  ],
  "nextCursor": "10399"
}
```
- 쿼리: `WHERE (player1_id = :id OR player2_id = :id) AND deleted_at IS NULL ORDER BY played_at DESC` → 인덱스 `ix_match_p1(player1_id, played_at)`/`ix_match_p2(player2_id, played_at)` 활용. `outcome`은 `:id`의 역할로 `result`를 접어 계산. 에러: `401 UNAUTHENTICATED`, `404 USER_NOT_FOUND`.

### 5.7 프로필 이미지 — R2 키 ↔ 바이너리 분리
- **저장 정본**: `app_user.uploaded_image_key`(R2 오브젝트 키, `VARCHAR(300)`)에 **키 문자열만**. webp 바이너리는 R2에(서버 sharp 256² webp+EXIF 제거 후 업로드). 업로드 없으면 `NULL`이고 `google_image_url`이 대체.
- **조회(2안, 미확정)**: (1) **서명 URL(권장)** — 응답에 R2 presigned GET(TTL 예 1h)을 `imageUrl`로, DB 키 미노출. (2) **프록시** `GET /api/users/:userId/avatar` — R2 스트리밍/302 redirect(비공개 버킷 유지 시).
- **우선순위(§0.6)**: `uploaded_image_key` → `google_image_url` → `imageUrl: null`(가짜 기본 이미지를 실제 사진인 척 넣지 않음).

**`GET /api/users/:userId/avatar`** (프록시 방식, 제안):
- `302 Found → Location: <R2 presigned URL>`(업로드 존재) / `<google_image_url>`(업로드 없음) / `404 NO_AVATAR`(둘 다 NULL, 클라 플레이스홀더) / `401 UNAUTHENTICATED`.

### 5.8 스키마 갭 분석 (`docs/ERD.md`가 정본 — 전부 변경 제안)

**갭 1 — 라운드별 상세(`MatchSummary.rounds[]`)가 버려진다 (핵심).** `game_match`는 최종 `result` 하나만. `types.ts`의 `rounds[]`·`config`는 영속화 안 됨.
- **v1 충분성**: 리더보드·등수·전적(승/무/패·게임별 승률)은 **최종 result + game_id만으로 완전 산출**(§5.6) → **v1 충분**. 라운드 상세는 재시청/리플레이/밸런싱 통계(v1 범위 밖)에만 필요.
- **(제안, v2)**:
  ```sql
  CREATE TABLE game_round (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    match_id    BIGINT NOT NULL,               -- FK game_match(id)
    round_index INT    NOT NULL,               -- RoundResult.roundIndex
    winner      ENUM('P1','P2') NULL,          -- NULL = 무승부 라운드
    UNIQUE (match_id, round_index),
    FOREIGN KEY (match_id) REFERENCES game_match(id)
  );
  ```
  채택 시 §5.5 INSERT를 `game_match`+`game_round[]` 한 트랜잭션으로 묶는다.

**갭 2 — 매치 `config` 미저장.** 방장의 `roundCount`/`timePerRoundSec`(+게임2 임시 밸런스)이 안 남아 "어떤 설정의 결과인지" 재현 불가. **(제안)** `round_count TINYINT`, `time_per_round_sec SMALLINT`(또는 `config_json JSON`) 추가. v1 리더보드엔 불필요 → 보류 가능.

**갭 3 — 종료 사유·비대칭 역할 미기록.** 게임3 `resultReason`, 게임2 피격/타임아웃, 몰수승 여부가 미저장. 게임2는 비대칭이라 "누가 어떤 역할"이 결과 해석에 중요한데 `player1_id/player2_id`가 곧 역할인지 스키마 명세 없음. **(제안)** `result_reason ENUM(...)`, `role_swapped BOOLEAN`. 온라인 P1/P2 배정 규칙 확정과 함께 결정.

**갭 4 — 인메모리 방/매치 → 재시작 시 진행중 매치 소실.** 방·큐·매치 런타임이 전부 프로세스 메모리라 배포·크래시·재시작 시 진행 중 매치는 사라짐(미기록).
- **허용 범위(초안 minor 수정)**: v1 정책이 "끊김=그냥 두기" + 단일 프로세스 + 매치가 초 단위로 짧음 → **v1 허용**(진행중 소실 ≈ 끊김과 동급, 미기록으로 정직). **단 "완결 매치 무손실"은 §5.5의 쓰기 순서(INSERT 커밋 성공 후 방송)를 전제로만 성립한다** — 결과 확정~INSERT 커밋 사이 크래시 창에서는 아직 커밋 안 된 매치만 잃으며, 그건 §5.5 순서상 **아직 클라에도 확정 통지(match:end)되지 않은 상태**가 되도록 정렬돼 있어 "본 결과가 사라지는" 모순이 없다.
- **주의**: 다중 인스턴스 수평 확장 시 인메모리 방이 인스턴스에 갇혀 이 가정이 깨짐 → 방/세션을 외부 스토어(Redis 등)로 빼는 아키텍처 변경(v1 범위 밖).

**갭 5 — 오프라인 매치 원천 미기록.** `game_match`는 온라인만. v1 스펙상 오프라인은 랭킹 비대상 → **갭 아님(의도된 설계)**. 문서로 못박음.

**요약 판단**: v1 런칭엔 **현 `game_match`(최종 결과 + game_id + soft-delete)만으로 충분** — 리더보드/등수/게임별 승률/감사수정이력이 전부 커버(§5.6, `match_edit_history`, `score_config`). 갭 1~4는 v2 후보이며, 채택 시에도 정본은 `docs/ERD.md`이므로 **ERD 먼저 갱신 후 `schema.prisma` 반영**.

---

## 열린 질문 / 결정 필요

`(미확정)`으로 표시된 항목을 결정권자 판단이 필요한 순으로 모았다.

### A. 인증·세션·프로필 (§1)
1. **세션 저장소**: 인메모리(기본안) vs 세션 테이블 — 무중단 배포/수평확장 필요 시 승격.
2. **soft-delete 후 정책**: 재가입 허용(마스킹) vs 영구 차단(`deleted_at` 체크 → `ACCOUNT_SUSPENDED`). `ERD.md note #9`.
3. **닉네임 규칙**: 길이 하한/허용문자/변경 허용·쿨다운, 콜레이션 유니크 대소문자 무시 여부(리더보드 정체성 영향).
4. **프로필 이미지**: 서빙 경로(서버 프록시 vs 공개/서명 URL), 허용 MIME·최대 용량.
5. **비공개 분반**(`is_public=false`)의 온보딩 노출/참여 방식.
6. (제안) OAuth PKCE 병행, admin 로그인 rate-limit, double-submit CSRF 토큰.

### B. 로비·방·매칭 (§2)
7. **게임2 비대칭 역할 공정성 (v1 구현 전 확정 대상으로 승격)**: 라운드별 role swap 후 합산 / 매치당 2세트 공수 교대 등. 최소한 `match:start` 전 각 클라에 자기 공수 역할 노출(빠른시작은 ready 게이트도 생략하므로 특히 중요).
8. **온라인 P1/P2 배정 규칙**: 코드방 방장=P1 / 빠른시작 선착=P1(제안) 확정 — DB `player1_id/player2_id` 매핑 고정에 필요(§5.5).
9. **중단/끊김 시 몰수승 정책**: v1 기본 미부여(DB 미기록). 도입 시 종료사유 컬럼(갭3)과 함께.
10. **`timePerRoundSec` 허용 범위**, 빠른시작 기본 `roundCount`/게임별 기본 라운드시간.

### C. 인게임 실시간 (§3)
11. **매치 result 집계 공식**: `shared`에 추가할 순수 함수 `aggregateMatch(rounds): MatchResult`의 규칙(라운드 다득제/best-of-N, 타이 처리). §3.0·§5.5·§5.8 갭1과 직결.
12. **카운트다운**: `round:countdown` 이벤트 vs `startsAtServerMs` 클라 계산 중 택1.
13. **게임2 밸런스 수치**(`DEFAULT_GAME2_CONFIG` 임시값) 확정 — 확정 시 §5.8 갭2와 함께 저장 여부.
14. **게임2 자기 개체 예측 도입 여부**(모델 B의 예측 단계) — v1은 보간-only 기본, 플레이테스트 후 결정. seed 클라 소비 여부와 연동(§4.3.3).
15. **지연 보상(lag compensation)** v1 미도입 확정 여부.

### D. 데이터흐름·영속화 (§4·§5)
16. **점수 공식 가중치**(`score_config` win/draw/loss) 및 리더보드 타이브레이크.
17. **스키마 갭 1~4** 채택 여부(라운드 상세 테이블, config 저장, 종료사유/역할 컬럼, 인메모리 재시작 대응) — 채택 시 `docs/ERD.md` 선행 갱신.

---

## 구현 로드맵

`TECH_STACK.md §6` 우선순위에 맞춘 "무엇부터" 순서. 각 단계는 `단계 → 검증(verify)` 형태로 둔다.

| 순번 | 구현 대상 | 이 문서 근거 | 검증 기준 |
|---|---|---|---|
| 1 | **모노레포 + 소켓 왕복 + 구글 로그인** | §0 공통 규약, §1.3~1.6 | `/auth/google/*` 왕복으로 `madpump_sid` 발급 → `GET /api/me`가 `USER` 반환; 소켓 핸드셰이크가 세션+Origin 검증 통과 |
| 2 | **온보딩 + 분반** (`POST /api/onboarding`, `GET /api/groups`) | §1.4 | 신규 유저가 닉네임 제출 시 `app_user` INSERT + 세션 `USER` 승격; 중복 닉네임 `409 NICKNAME_TAKEN` |
| 3 | **코드방** (`room:create/join/configure/ready/start`, `GET /api/rooms/:code`) | §2.3 | 2인 입장 → `room:state` 동기화 → 방장 `room:start`가 `NOT_READY` 게이트 통과 시 양쪽에 개별 `match:start`(role 다름) |
| 4 | **게임3 온라인** (1초 틱, `game:move`/`game:tick`) + 라운드 오케스트레이터 | §3.0·§3.5, `aggregateMatch` | 서버 1초 윈도우 상성 판정이 `game3.ts`와 일치; role 위조(`player` 스푸핑)를 서버 덮어쓰기로 차단(§3.7) |
| 5 | **게임1 온라인** (`game:input`/`game:state`) | §3.3 | ±1 이벤트 → 서버 `[1,100]` 클램프 + `holdMs>=3000` 승리 / 타임아웃 `DRAW`(§3.3) |
| 6 | **매치 기록 + 리더보드** (`game_match` INSERT, `GET /api/leaderboard`) | §5.5·§5.6 | INSERT 커밋 성공 후에만 `match:end`(recordedMatchId) 방송; 리더보드가 `score_config` 가중치로 집계 |
| 7 | **오프라인 모드** (로컬 2인, shared 코어 직접) | §2.6 | 소켓/DB 무경유로 세 게임 로컬 플레이; `game_match` 미기록 확인 |
| 8 | **게임2 온라인 + 빠른시작** (20Hz 시뮬 브로드캐스트, 보간; `queue:*`) | §3.4·§2.4 | 서버 권위 20Hz 스냅샷(총알 `vy` 미전송, 클라 보간); FIRE 예측 금지; 비대칭 역할 공정성(열린질문 7) 반영 |
| 9 | **admin** (`POST /api/admin/login`, 콘솔 API) | §1.5 | `madpump_admin_sid`로 분리 인증; `match_edit_history` 감사 기록 |

각 단계는 "버그 고쳐"가 아니라 "재현 테스트 후 통과"로 검증한다. 게임 로직은 shared 코어의 결정성을 단위 테스트로, 네트워크 계층은 서버 권위 판정이 클라 위조 입력을 무시하는지(§3.7)를 통합 테스트로 확인한다.

<!-- notify: API 명세서 5개 섹션 종합 완료 -->