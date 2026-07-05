# MADPUMP 로그인 설계 — 로스터 로그인 (v2, 2026-07-05)

> 이 문서는 **로그인 방식이 구글 OAuth → 로스터 로그인으로 바뀐 배경과 현재 설계의 정본**이다.
> 협업자와 AI 에이전트는 인증 관련 작업 전에 이 문서를 먼저 읽을 것.
> 스키마 정본은 `docs/ERD.md`(v2), 구현은 `server/src/index.ts` + `client/src/modals/Login.tsx`.

## 1. 왜 구글 OAuth를 폐기했나

- 배포 환경이 **학교 내부망(KCLOUD)** 이고, 클라이언트는 VPN을 통해서만 접속한다.
- 구글 로그인(GIS)은 브라우저가 `accounts.google.com` 에 접속할 수 있어야 하는데,
  **내부망 정책상 외부 접근이 막혀 있어 OAuth 흐름 자체가 동작하지 않는다.**
- 어차피 플레이어가 몰입캠프 수강생(55명)으로 한정되므로, **정교한 인증을 포기**하고
  "분반 → 명단에서 자기 이름 선택" 방식으로 대체했다. 비밀번호/토큰 검증은 없다.
  (보안상 누구나 아무 이름으로 로그인할 수 있음 — 내부망 한정 서비스라 의도적으로 수용한 트레이드오프)
- 구글 OAuth 구현 전체가 필요해지면: `main` 브랜치의 커밋 `21c8f5c`(OAuth 로그인 구현)에 있다.

## 2. 로그인 흐름 (현재)

```
[S1 메인] "로그인" 버튼
  → [로그인 모달 1단계] "몇 분반인가요?" — 1분반 / 2분반 / 3분반   (GET /api/roster)
  → [로그인 모달 2단계] "유저 선택" — 분반 멤버 버튼 그리드
  → 멤버 클릭 → POST /api/login { userId } → 세션 쿠키(mp_session) 발급 → S2 메인
```

- 비로그인 상태에서 "온라인 게임하기" → 로그인 요구 모달(S3) → "로그인" → 같은 모달 체인,
  성공 시 온라인 패널(S6)로 연속 진입.
- 세션은 서버 인메모리(`server/src/sessions.ts`) — 서버 재시작 시 재로그인 필요.
- 새로고침 시 `GET /api/me` 로 세션 복원 (`client/src/main.tsx` → `restoreSession()`).
- 온보딩(닉네임 입력) 화면은 폐기 — 닉네임/분반이 명단에 고정돼 있어 불필요.

## 3. API

| 메서드/경로 | 인증 | 설명 |
|---|---|---|
| `GET /api/roster` | 불필요 | 분반 목록 + 분반별 멤버 `{ id, nickname }` (로그인 다이얼로그용) |
| `POST /api/login` `{ userId }` | 불필요 | 해당 유저로 즉시 세션 발급. 없는 id면 404 |
| `GET /api/me` | 쿠키 | 세션 유저 `{ id, nickname, imageUrl, groupName }` 또는 `ANON` |
| `POST /api/auth/logout` | 쿠키 | 세션 파기 |
| `GET /api/leaderboard` | 쿠키 | 내 분반 랭킹 (game_match 집계 × score_config) |

제거된 엔드포인트: `POST /api/dev/login`, `POST /api/auth/google`, `POST /api/auth/signup`.
제거된 의존성: `google-auth-library`.

## 4. DB 변경 (마이그레이션 `20260705120000_roster_login`)

- `app_user`에서 제거: `google_sub`, `email`, `google_image_url` (+ 유니크 `uq_user_google`)
- 닉네임 유니크 변경: 전역 `uq_user_nickname` → **분반 단위** `uq_user_group_nick(group_id, nickname)`
  - 이유: 같은 이름이 다른 분반에 존재한다 (1분반 "이서진", 3분반 "이서진")
- 유저 생성 경로 변경: 회원가입 없음 → **`prisma/seed.ts` 가 분반 3개 + 멤버 55명을 시드** (멱등 upsert)

### 적용 절차 (DB가 있는 곳 — VM 또는 로컬)

```bash
npm install                                            # google-auth-library 제거 반영
npm --workspace @madpump/server run migrate:deploy     # 로스터 마이그레이션 적용
npm --workspace @madpump/server run db:seed            # 분반 3개 + 55명 시드
npm --workspace @madpump/server run db:cleanup-groups  # (선택) 1분반/2분반/3분반 외 정크 그룹 삭제
```

⚠️ 마이그레이션의 `CREATE UNIQUE INDEX uq_user_group_nick` 은 기존에 같은 (분반, 닉네임)
중복 행이 있으면 실패한다. 기존 데이터는 전부 테스트 데이터이므로, 실패 시 가장 간단한 해법은
초기화 후 재시드: `npm --workspace @madpump/server run db:reset` (migrate reset + seed 자동 실행).

## 5. 분반별 로스터 (정본: `server/prisma/seed.ts`)

명단 수정은 seed.ts의 `ROSTER` 를 고치고 `db:seed` 재실행 (upsert라 몇 번 돌려도 안전).
로그인 다이얼로그는 DB를 읽으므로(`GET /api/roster`) 클라 코드 수정 불필요.

- **1분반 (16명)**: 이지민, 박준서, 라태형, 이종혁, 유나연, 유영석, 김태현, 권순호, 이유담, 안종화, 허서준, 이서진, 정서영, 이예원, 김희서, 주성민
- **2분반 (19명)**: 박서윤, 최재윤, 김민재, 이예지, 김경원, 이재준, 양우현, 주영준, 박지민, 황시우, 박채훈, 박소요, 원건희, 이서영, 임유빈, 박도현, 박정준, 김도현, 김도연
- **3분반 (20명)**: 손기환, 김윤서, 양호성, 정유진, 김민, 조예준, 안소희, 이서진, 강우현, 송재훈, 이지오, 김재훈, 임성진, 박지호, 조준호, 김규민, 서영빈, 김혜리, 박수현, 박민수

## 6. 관련 파일 지도

| 영역 | 파일 | 역할 |
|---|---|---|
| 서버 | `server/src/index.ts` | `/api/roster`, `/api/login`, `/api/me`, `/api/leaderboard` |
| 서버 | `server/src/sessions.ts` | 인메모리 세션 (sid 쿠키 → userId/nickname/groupName) |
| 서버 | `server/prisma/seed.ts` | 분반·로스터·게임 사전·점수 설정 시드 (**명단 정본**) |
| 서버 | `server/prisma/migrations/20260705120000_roster_login/` | 구글 컬럼 제거 마이그레이션 |
| 클라 | `client/src/modals/Login.tsx` | 로그인 모달 2단계 (분반 → 멤버), `openLoginModal()` |
| 클라 | `client/src/state/session.ts` | `restoreSession` / `fetchRoster` / `loginAs` / `logout` |
| 클라 | `client/src/modals/LoginRequired.tsx` | S3 로그인 요구 모달 → 로그인 모달 체인 |
