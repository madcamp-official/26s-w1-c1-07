# 26s-w1-c1-07

## 공통과제 I : 웹 기반 프로젝트 (2인 1팀)

**목적:** 공통 과제를 함께 수행하며 웹 개발의 전체 흐름을 빠르게 익히고 협업에 적응하기

**결과물:** 기획부터 배포까지 완료된 웹 서비스와 관련 문서 일체

---

## 팀원

| 이름 | GitHub | 역할 |
|---|---|---|
| 박준서 | bjsbest | 인증(로그인)·코인/베팅/랭킹 경제 시스템, 온라인 매치 진행 UX(9라운드·슬롯머신·리벤지), 추가 게임(11~13) 및 관련 Prisma 마이그레이션·설계 문서(AUTH/COINS/ONLINE_MATCH/GAMES_11_13) 담당 |
| 이종혁 | jonghklee | 모노레포 아키텍처, `shared` 게임 코어 및 클라이언트 렌더링, 서버 권위 온라인 넷코드, 오디오/디자인/테마 시스템, 배포 인프라, 대부분의 설계 문서(TECH_STACK/ERD/DATABASE/API_SPEC/BUILD_PLAN) 담당 |

> 역할은 커밋 주제·각 문서/소스 파일의 최초 저작자·Prisma 마이그레이션 저작자를 근거로 한 "기능 영역 소유" 관점의 분담이며, 두 사람의 `client/src` 작업은 상호 겹칩니다.

---

## 기획안

> 프로젝트 주제, 목적, 핵심 기능, 예상 사용자, 팀원별 역할 등 정리

- **주제:** MADCADE — 두 버튼(Q/W·U/I)만으로 조작하는 1:1 실시간 대전 미니게임 아케이드 웹 플랫폼 (예전 이름 MADPUMP에서 리브랜딩, npm scope `@madcade/*`).
- **목적:** 공통과제 I(2인 1팀 웹 프로젝트)로서 기획부터 배포까지 웹 개발 전체 흐름과 협업을 익히는 것이 1차 목적. 산출물로는 짧고 캐주얼한 1:1 대전을 온라인/오프라인으로 즐기고, 코인 경제와 랭킹으로 경쟁을 유도하는 아케이드형 미니게임 플랫폼을 만든다. 게임 승패 판정은 **서버 권위(server-authoritative)** 로 처리해 랭킹 신뢰성을 확보한다.
- **핵심 기능:**
  - 두 버튼 조작 기반 1:1 대전 미니게임 **13종** 아케이드 (`shared` 게임 코어 game1~13 + 클라 렌더링 화면 Game1~13)
  - 온라인 실시간 매치: 서버 권위 dumb-client 넷코드, **9라운드 슬롯머신** 구성(라운드마다 랜덤 게임·랜덤 역할), 빠른 매칭 큐(FIFO)와 코드룸 입장
  - 오프라인 대전: 한 컴퓨터에서 2인 로컬(Q/W vs U/I) 및 내장 AI와의 **VS BOT** 봇 대전
  - 코인 경제: 시작 30코인, 온라인 매치 베팅·정산, 잠금 게임(9·10번) 해제, 솔로 코인 파밍 미션
  - 리매치(**REVENGE**): 패자가 직전 승자에게 2배 베팅으로 재도전
  - Google 로그인 + 세션 쿠키, 코인 보유량 기준 리더보드, 6종 테마 즉시 전환
- **예상 사용자:** 몰입캠프 참가 수강생을 중심으로 한 캐주얼 게이머. 복잡한 조작 없이 두 버튼(Q/W·U/I)만으로 즐길 수 있어, 같은 공간에서 오프라인 2인 대전을 하거나 온라인으로 빠르게 매칭해 코인 베팅·랭킹 경쟁으로 짧은 대전을 반복하려는 사용자. (공개 도메인이 Cloudflare 터널로 열려 있어 접속에 교내망/VPN이 필수는 아니며, 온라인 대전에는 Google 로그인이 필요하다.)

---

## 기능 명세서

> 구현할 기능을 사용자 관점에서 정리하고, 필수 기능과 선택 기능을 구분

### 필수 기능

- [x] 게임 선택 화면에서 13종의 미니게임 중 원하는 게임을 골라 곧바로 플레이한다. (`client/src/screens/GameSelect.tsx`, `client/src/App.tsx` `/game/1~13`)
- [x] 한 대의 키보드로 두 사람이 즉석에서 1:1 오프라인 대전을 한다 (P1=Q/W, P2=U/I 두 버튼 조작). (`GameSelect` 2P LOCAL 토글 → `startOfflineGame`)
- [x] 빠른 매칭(Quick Start)으로 다른 접속자와 1:1 온라인 실시간 대전을 매칭·플레이한다. (`client/src/modals/Online.tsx` → `client/src/net/online.ts` `joinQueue`)
- [x] 방 코드를 생성하거나 상대의 코드를 입력해 친구와 1:1 온라인 대전을 한다. (`createRoom`/`joinRoom`)
- [x] Google 계정으로 로그인한다 ("Sign in with Google" 버튼으로 ID 토큰 검증 → 세션 쿠키 발급). 온라인 대전은 로그인 필수다. (`client/src/modals/Login.tsx`, `POST /api/auth/google`)
- [x] 여러 라운드로 대전하며 라운드별 승/패와 최종 매치 결과(승/패/무)를 확인한다. (오프라인 best-of `client/src/state/flow.ts`, 온라인 9라운드 고정, 결과 표시 `client/src/screens/game/ResultOverlay.tsx`)

### 선택 기능

- [x] 온라인 대전에 코인을 베팅하고 승패에 따라 코인을 정산받는다. (`Coin Bet` 패널, `shared/src/coins.ts`, `match:end`)
- [x] 코인으로 잠긴 게임을 해제해 플레이한다 (9번 Speed Gomoku 30코인, 10번 Tug of War 50코인). (`POST /api/unlock`, `LOCKABLE_GAME_IDS=[9,10]`)
- [x] 코인 농장(GET FREE COIN)에서 솔로 펌프 미션을 수행해 코인을 번다 (10초/25점, 오답 즉시 실패). (`client/src/screens/CoinFarm.tsx`, `POST /api/farm/claim`)
- [x] 봇(AI)과 1인 대전을 한다. 빠른 매칭에서 3초 내 상대가 없으면 봇으로 폴백된다. (`startBotGame`, `client/src/modals/Matching.tsx` `BOT_FALLBACK_MS=3000`)
- [x] 온라인에서 진 사람이 이전 베팅의 2배를 걸고 승자에게 재대결(REVENGE)을 신청한다 (2배가 없으면 ALL-IN, 무승부는 불가). (`revenge:*` 이벤트, `client/src/net/OnlineController.tsx`)
- [x] 테마(스킨)를 6종 중 골라 사이트 전체 디자인을 즉시 바꾼다 (무료·리로드 없음). (`client/src/modals/ThemeShop.tsx`, `client/src/state/theme.ts`)
- [x] 효과음(SFX, 실시간 합성)과 배경음악(BGM, mp3 스트리밍)을 들으며 플레이한다. (`client/src/audio/*`)
- [x] 라운드 시작 인트로(ROUND 배너·조작 가이드·2·1·START)와 온라인 슬롯머신/VS 매치업 연출을 본다. (`client/src/screens/game/RoundIntro.tsx`, `client/src/net/MatchIntro.tsx`)
- [x] 전체 랭킹(리더보드)을 코인 보유량 순으로 확인한다. (`client/src/modals/Ranking.tsx`, `GET /api/leaderboard`)
- [x] 설정에서 플레이할 게임을 체크박스로 골라 온라인 슬롯머신 후보 풀을 정한다. (`client/src/modals/Settings.tsx`)

---

## IA 및 화면 설계서

> 서비스의 전체 페이지 구조와 페이지 간 이동 흐름; 각 페이지의 주요 UI 구성, 입력 요소, 버튼, 사용자 행동 흐름 등을 간단한 와이어프레임 형태로 정리

**화면 목록** — 라우팅은 `client/src/App.tsx`(6개 경로)와 `client/src/state/flow.ts`의 상태(전역 모달 host)를 축으로 돈다.

| 구분 | 화면 (컴포넌트) | 경로/트리거 | 목적 · 주요 UI |
|---|---|---|---|
| 페이지 | 메인(비로그인) `MainLoggedOut` | `/` (미로그인) | 어트랙트 타이틀. MADCADE 네온 로고·INSERT COIN 블링크, Play Online→로그인 필요 모달, Play Offline→`/select`, Login, 🎨 Theme |
| 페이지 | 메인(로그인) `MainLoggedIn` | `/` (로그인) | 로비. 닉네임·코인 잔액·Logout, Play Online→온라인 모달, Play Offline, HI-SCORE 리더보드(TOP3+내 순위)→랭킹 모달, Change Theme |
| 페이지 | 게임 선택 `GameSelect` | `/select` | 캐비닛 그리드(card-gameN), 2P LOCAL/VS BOT 토글, 잠금 카드 언락바(`POST /api/unlock`), GET FREE COIN→`/farm`, ◀ Back |
| 페이지 | 코인 팜 `CoinFarm` | `/farm` (로그인 필요) | U/I 단일 레인 솔로 미션. Start/Play again/Exit, 보상 표시 |
| 페이지 | 게임 플레이 `Game1~Game13` | `/game/:id` | 오프라인·봇 대전. ◀ Exit, HudFrame(P1/P2·라운드 램프·타이머), 키캡, ResultOverlay·RoundIntro |
| 페이지 | 온라인 게임 디스패처 `OnlineGame` | `/online/game/:gameId` | 라이브 서버 매치 전용. 컨텍스트 있으면 해당 GameN 렌더, 없으면 `/`로 복귀 |
| 모달 | 로그인 필요 `LoginRequired` | 비로그인 온라인 시도 | CREDIT REQUIRED. Login→로그인 모달, Cancel/ESC |
| 모달 | 로그인 `Login` | Login 클릭 | Google Sign-In(GIS) 버튼. 성공 시 세션 생성 |
| 모달 | 온라인 패널 `Online` | Play Online(로그인 상태) | 코인 베팅 + Quick Start / Create code / Enter code, ⚙→Settings |
| 모달 | 매칭 `Matching` | Quick Start 후 | connecting→대기→상대 발견 상태, 3초 내 미매칭 시 봇 대체, Cancel |
| 모달 | 설정 `Settings` | 온라인 패널 ⚙ | 온라인 슬롯 후보 게임 체크박스(enabledGames), Save |
| 모달 | 랭킹 `Ranking` | HI-SCORE 클릭 | 전체 코인 랭킹(내 정보행+순위 리스트) |
| 모달 | 테마 상점 `ThemeShop` | Change Theme | 6종 테마 카드, 즉시 전환 |
| 오버레이 | 매치 인트로 `MatchIntro` | 온라인 phase `slot` | VS 매치업 2s → 9릴 슬롯머신 스핀 → 확정 보드 3s |
| 오버레이 | 라운드 인트로 `RoundIntro` | 라운드 시작 직전 | ROUND 배너→가이드→2·1·START (오프라인은 roundIntroGate로 sim 정지) |
| 오버레이 | 결과 `ResultOverlay` | 라운드/매치 종료 | round-result(WINNER·Next round) / match-result(FINAL·라운드 표·To main) |
| 오버레이 | 온라인 종료·리매치 `OnlineController` | 온라인 매치 종료 | YOU WIN/LOSE/DRAW·코인 정산·REVENGE / OPPONENT LEFT |

**이동 흐름**

```
[온라인] '/' 메인
  → (비로그인) Play Online → 로그인 필요 모달 → Google 로그인 → 온라인 패널
  → (로그인)   Play Online → 온라인 패널
  → 코인 베팅 + Quick Start(joinQueue) 또는 Create/Enter code
  → 매칭 모달  [3초 내 미매칭 → 봇 대체 → '/game/:id']
  → MatchIntro(VS → 슬롯머신 9릴 → 확정)  → '/online/game/:gameId'
  → RoundIntro(ROUND·가이드·카운트다운) → 게임 플레이
  → ResultOverlay(라운드 결과, 서버 주도 자동 진행) × 9라운드
  → OnlineController(match-end: 승패·코인 정산·REVENGE) → To main '/'

[오프라인] '/' 메인 → Play Offline → '/select' GameSelect
  → 2P LOCAL / VS BOT 토글 → 캐비닛 클릭(매칭 생략) → '/game/:id'
  → RoundIntro → 플레이 → ResultOverlay(Next round × best-of) → match-result → To main '/'

[부가] GameSelect GET FREE COIN → '/farm'(로그인 시) · HI-SCORE → 랭킹 모달 · Change Theme → 테마 상점
```

<!-- Figma 링크 또는 이미지 첨부 -->

---

## DB 스키마

> 필요한 테이블, 주요 필드, 데이터 타입, 테이블 간 관계를 정리

- **엔진/구성**: MySQL 8 (KAIST VM 내부 `localhost:3306`, `utf8mb4`), Prisma로 관리.
- **테이블 7개**: `app_user`(유저) · `admin_account`(관리자) · `game`(게임 사전) · `game_match`(매치 결과) · `game_round`(라운드 결과) · `match_edit_history`(수정 감사) · `score_config`(점수 설정).
- **핵심 규칙**: 온라인 매치만 기록 · soft delete(`deleted_at`) · 점수/랭킹은 저장 안 하고 조회 시 집계 · 매치는 여러 라운드로 구성되며 게임 종류(`game_type`)는 라운드 단위로 기록 · 매치 결과는 `enum MatchResult { A_WIN, B_WIN, DRAW }` (매치 고정 슬롯 playerA/playerB 기준).

> 정본 스키마는 `server/prisma/schema.prisma`입니다(테이블/ENUM 기준). 상세 문서 `docs/DATABASE.md`의 일부 표기(`user_group`, `P1_WIN/P2_WIN`)는 구버전이라 현재 스키마와 다를 수 있습니다.

📄 상세: **[docs/DATABASE.md](docs/DATABASE.md)** (구현·접속·조회) · **[docs/ERD.md](docs/ERD.md)** (설계 정본·근거)

```bash
# 스키마 적용 + 시드 (SSH 터널로 VM DB 사용 시)
ssh -N -L 3306:localhost:3306 kaistvm &        # 터널
npm --workspace @madcade/server run migrate:deploy
npm --workspace @madcade/server run db:seed
```

---

## API 문서

> API 주소, 요청 방식, 요청값, 응답값, 에러 상황을 정리

인증은 REST·소켓 모두 동일 세션 쿠키(`mp_session`)를 사용한다. 소켓 핸드셰이크에서 세션이 없으면 `UNAUTHENTICATED`로 연결이 거부된다.

### REST (Fastify — `server/src/index.ts`)

| Method | Endpoint | 설명 | 요청 | 응답 |
|---|---|---|---|---|
| POST | `/api/auth/google` | Google ID 토큰(GIS credential) 검증 후 `googleSub` 기준 find-or-create 로그인, 세션 쿠키 발급 | `{ credential }` | `200 { status:'USER', user }` / `400 VALIDATION` / `401 INVALID_CREDENTIAL` |
| GET | `/api/me` | 현재 세션 사용자 조회(코인/해제 수는 DB 최신값) | 쿠키 | `200 { status:'USER', user }` \| `{ status:'ANON', user:null }` |
| POST | `/api/unlock` | 잠긴 오프라인 게임 개별 해제(코인 차감, 매치 중 차단) | 쿠키 + `{ gameId }` | `200 { status:'OK', unlockedGameId, coins, unlockedCount }` / `401` / `409 IN_MATCH·CONFLICT` / `400 INVALID_GAME·ALREADY_UNLOCKED·NOT_ENOUGH_COINS` |
| POST | `/api/farm/claim` | 코인 파밍 미션 보상 수령(서버 확률표 추첨, 쿨다운) | 쿠키 | `200 { status:'OK', reward, coins }` / `401` / `429 COOLDOWN(retryAfterMs)` |
| GET | `/api/leaderboard` | 전체 사용자 코인 랭킹(코인↓→승↓→userId↑, 동점 공동 순위) | 쿠키 | `200 { status:'OK', myUserId, entries:[{ userId, nickname, coins, wins, draws, losses, rank }] }` / `401` |
| POST | `/api/auth/logout` | 세션 파기 및 쿠키 삭제 | 쿠키 | `200 {}` |
| GET | `/api/health` | 헬스체크(현재 방/대기열 수) | — | `200 { ok:true, rooms, queue }` |

### Socket.IO 이벤트 (`shared/src/net/events.ts` `EV` · `server/src/index.ts` · `server/src/match.ts`)

ack 규약: `{ ok:true, data } | { ok:false, code, message }`.

| 방향 | 이벤트 | 설명 |
|---|---|---|
| S→C | `lobby:hello` | 연결 직후 내 정보 전송 `{ me, reconnect }` |
| C→S | `room:create` / `room:join` / `room:configure` / `room:ready` / `room:start` / `room:leave` | 코드 방 생성·참가·게임풀 설정·준비·시작·나가기 (변경 시 `room:state` 브로드캐스트) |
| C→S | `queue:join` / `queue:leave` | 빠른 시작 전역 FIFO 대기열 참가/이탈(2명 모이면 매치 시작) |
| S→C | `queue:matched` | 빠른 매칭 성사 통지 `{ roomCode, role, opponent }` |
| S→C | `match:start` | 매치 시작(개별) `{ matchId, you, totalRounds(9), slotGames(9), yourBet, oppBet, ... }` |
| S→C | `round:start` | 라운드 시작(개별) `{ round, gameId, role, countdownMs, showGuide }` |
| C→S | `game:input` | 게임 입력 봉투 `{ matchId, code, type, t, cell? }` |
| S→C | `game:state` | 서버 권위 상태 렌더 투영 `{ round, seq, state }` (BROADCAST_EVERY 틱) |
| S→C | `round:end` / `match:end` | 라운드/매치 종료(승자·코인 정산·revenge 정보) |
| S→C | `match:aborted` | 상대 이탈로 매치 중단 `{ reason:'OPPONENT_LEFT' }` |
| C↔S | `revenge:request` / `revenge:offer` / `revenge:respond` / `revenge:cancel` / `revenge:result` | 재대결(2배 베팅) 요청·제안·응답·취소·성립 통지 |

📄 상세: **[docs/API_SPEC.md](docs/API_SPEC.md)** · **[docs/ONLINE_MATCH.md](docs/ONLINE_MATCH.md)**

---

## 배포 결과물

> 접속 가능한 링크, 실행 방법, 주요 구현 내용

- **서비스 URL:** 공개 https://madcade.madcamp-kaist.org (Cloudflare 터널 → VM `localhost:8080`) · 내부망 http://172.10.8.242 (KAIST 네트워크 전용, iptables `80→8080` 리다이렉트)
- **아키텍처:** 단일 Node 프로세스(`server/`)가 정적 `client/dist` + REST(Fastify) + Socket.IO를 함께 서빙. 개발 모드에서는 클라(Vite :5173)가 별도 서버(:3000)에 붙는다.
- **실행 방법:**

```bash
# ── 로컬 개발 (Node 20+) ─────────────────────────────
npm install                                     # 루트 workspaces(client/server/shared) 일괄 설치
docker compose up -d                            # (선택) 로컬 MySQL 8 → 127.0.0.1:3307

cp server/.env.example server/.env              # DATABASE_URL 설정 (docker면 mysql://madpump:devpass@127.0.0.1:3307/madpump)
cp client/.env.example client/.env              # VITE_GOOGLE_CLIENT_ID (빌드타임 주입, Google 로그인용)

npm --prefix server run prisma:generate
npm --prefix server run migrate:deploy          # 커밋된 마이그레이션 적용
npm --prefix server run db:seed                 # 게임 13종 사전 + 점수설정 시드 (idempotent)

npm --prefix server run dev                     # tsx watch → http://localhost:3000
npm --prefix client run dev                     # vite → http://localhost:5173

# ── 배포 (KAIST VM, ~/.ssh/config에 kaistvm 별칭 필요) ─
cp deploy.env.example deploy.env                # DEPLOY_HOST/PATH · PORT · CLIENT_ORIGIN · COOKIE_SECURE · GOOGLE_CLIENT_ID
                                                #  prod(터널) 값: PORT=8080 ·
                                                #  CLIENT_ORIGIN=https://madcade.madcamp-kaist.org,http://172.10.8.242 ·
                                                #  COOKIE_SECURE=(빈값: 내부 HTTP 로그인 유지) · GOOGLE_CLIENT_ID 필수
bash scripts/deploy.sh                           # client 빌드 → rsync → VM install/prisma → tmux 재기동 → iptables 80→8080 → /api/health

# 배포 검증
curl -s https://madcade.madcamp-kaist.org/api/health   # → {"ok":true,...}
```

📄 상세: **[docs/AGENT_DEPLOY.md](docs/AGENT_DEPLOY.md)** · **[docs/DEPLOY.md](docs/DEPLOY.md)**

---

## 회고 문서

> 개발 과정에서의 어려움, 해결 방법, 역할 분담, 다음에 개선할 점 (KPT 방법론 참고)

### Keep

- 협업을 할 때 스프레드시트를 이용해 소통하고, 해야 할 일을 스택처럼 쌓아 실시간으로 한 방식이 효과적이었다.
- 프로젝트 기획을 할 때 빠르게 MVP를 만들고 버전 업을 계속하는 방식으로 프로토타이핑을 빠르게 할 수 있었다.

### Problem

- AI 에이전트를 이용해 작업하면 역할 분담의 경계가 모호해질 수 있다. 스택 방식의 할 일 관리도 같은 분류 안의 작업일 때만 유효하고, 다른 작업일 때는 결국 책임만 넘기는 형태가 될 수 있었다.
- 대분류가 정해져있지 않아 업무가 중간에 중복되는 경우가 있었다.

### Try

- 역할 분담을 대분류 설정과 세부 태스크를 위한 스택 관리의 2단계로 나누어 중복 업무를 방지해보려고 한다.
- 담당을 확정한 후에는 할일 공유를 루틴화해야겠다.
- 다음 주차부터는 프로젝트 시작 전에 실제 역할 분담을 확실히 정하고 프로젝트에 착수해야겠다

---

## 참고 자료

- [SDD(스펙 주도 개발) 이해하기](https://news.hada.io/topic?id=21338)
- [Software Design Document Best Practices](https://www.atlassian.com/work-management/project-management/design-document)
- [IA 정보구조도 작성 방법](https://brunch.co.kr/@nyonyo/7)
- [기획자 화면설계서 작성법](https://brunch.co.kr/@soup/10)
- [Figma 와이어프레임 가이드](https://www.figma.com/ko-kr/resource-library/what-is-wireframing/)
- [무료 Figma 와이어프레임 키트](https://www.figma.com/ko-kr/templates/wireframe-kits/)
- [ERD/DB 설계 총정리](https://inpa.tistory.com/entry/DB-%F0%9F%93%9A-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8%EB%A7%81-%EA%B0%9C%EB%85%90-ERD-%EB%8B%A4%EC%9D%B4%EC%96%B4%EA%B7%B8%EB%9E%A8)
- [API 명세서 작성 가이드라인](https://velog.io/@sebinChu/BackEnd-API-%EB%AA%85%EC%84%B8%EC%84%9C-%EC%9E%91%EC%84%B1-%EA%B0%80%EC%9D%B4%EB%93%9C-%EB%9D%BC%EC%9D%B8)
- [좋은 README 작성하는 방법](https://velog.io/@sabo/good-readme)
- [단기 프로젝트 회고 KPT 방법론](https://velog.io/@habwa/%EB%8B%A8%EA%B8%B0-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%ED%9A%8C%EA%B3%A0-KPT-%EB%B0%A9%EB%B2%95%EB%A1%A0)
