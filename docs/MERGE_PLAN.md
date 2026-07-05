# MADPUMP 머지 방법론 — game-lab 로직 + design-lab 디자인 → main

## TL;DR (5줄)

1. **로직/렌더/입력의 "심장"은 game-lab에서 통째로 이식** → `game-lab/shared/src/games/*` 코어 3종을 main의 빈 `shared/`에 승격하고, `game-lab/client`의 캔버스 렌더러·통합 입력·게임 루프 골격을 main `client/`로 옮긴다.
2. **게임 바깥 화면의 "얼굴"은 design-lab에서 이식** → 승자 시안 하나(1순위 `05-obsidian`)의 `screens/modals/components/theme.css`를 main `client/`로 옮긴다. **인게임 게임화면(Game1~3.tsx)·구코어·mock 권위는 버린다.**
3. **승패 권위는 신규 `server`가 갖는다** → Fastify + Socket.IO 단일 프로세스가 `@madpump/shared`의 `core.create/step`을 서버에서 구동, 큐·방·라이브상태는 인메모리, 최종 결과 1행만 `game_match`에 기록.
4. **세 소스가 실제로 겹치는 교차 작업은 딱 한 곳** — "인게임 캔버스 팔레트 주입"(캔버스는 CSS 변수를 못 읽으므로 승자 `theme.css`의 hex를 JS `RenderPalette`로 1회 미러링). 나머지는 파일 단위 이식이라 충돌 없음.
5. **온라인 전환은 "입력 소스 + 상태 소유자"만 교체** — 로컬 루프(`create→step→render`)는 그대로 두고, 클라는 키입력을 서버로 emit하고 서버 뷰-스냅샷을 받아 렌더만 하는 덤 클라이언트로 시작한다(예측은 선택).

---

## 1. 소스 3개 역할 분해 (KEEP / DROP)

이 저장소에는 **이름이 같지만 구조가 다른 게임 API가 3개** 공존한다. 머지 방법론의 절반은 "어느 API를 정본으로 삼고 나머지를 어떻게 폐기하느냐"다.

| API | 위치 (식별자) | 상태 모양 | 결과 표기 | 판정 |
|---|---|---|---|---|
| **game-lab (정본 채택)** | `game-lab/shared/src/games/*` — 패키지명 `@madpump/shared` | `Game1State.p1/p1Gauge/p1Hold`, `Game2State.rockets/hp/seed`, `Game3State.c/feed/seed/waterLevel` | `GameResult = 'P1'\|'P2'\|'DRAW'\|null` | `GameCore.create/step` (순수·결정적) |
| **design-lab 구코어 (폐기)** | `design-lab/shared/src/games/*` — **패키지명도 `@madpump/shared`(동일)**, 화면에서는 경로 alias `@shared`로 참조 | `Game1State.players.P1.value / derived / elapsedMs` | `MatchResult = 'P1_WIN'\|'P2_WIN'\|'DRAW'` | `createGame1State / tick / game1ActionFromKey` |
| **DB enum (별개 도메인)** | `server/prisma/schema.prisma` | — | `enum MatchResult { P1_WIN, P2_WIN, DRAW }` | 저장용 |

> **정정 (검증 반영):** 세 `shared/` 패키지는 **전부 동일한 npm 이름 `@madpump/shared`**다(3개 `package.json` 확인). design-lab 화면이 쓰는 `@shared`는 **패키지 이름이 아니라 tsconfig/vite의 경로 alias**다 — `05-obsidian/tsconfig.json`의 `"@shared": ["../../shared/src/index.ts"]`, `vite.config.ts`의 `'@shared' → design-lab/shared/src`(주석: "`@madpump/shared` 소스 직접 참조"). 따라서 design-lab의 import가 사라지는 이유는 "이름이 달라서"가 아니라 **`@shared` alias를 삭제하고 `shared/`를 game-lab 버전으로 교체하기 때문**이다. 세 패키지가 동일 이름을 공유하므로 오히려 **이름 충돌 고려가 필요**한데, design-lab `shared/`를 이식 대상에서 완전히 제외하면 런타임에 하나만 남아 충돌은 발생하지 않는다.

### 1-1. KEEP / DROP 표

| 소스 | KEEP (채택) | DROP (폐기) | 근거 파일 |
|---|---|---|---|
| **game-lab** | ① 코어 3종 `shared/src/games/{types, game1/logic, game2/logic, game3/core+logic}.ts` ② 캔버스 렌더러 `client/src/games/{render1,render2,render3,fencerPose,registry}.ts` ③ 통합 입력 `client/src/input/keyboard.ts` ④ 로컬 게임 루프 골격 `client/src/ui/GameScreen.tsx` ⑤ 코어 테스트(97 tests) | 최소 UI(`MainScreen.tsx`, `index.css`) — design-lab 화면으로 대체 | `shared/src/index.ts`, `client/src/games/registry.ts` |
| **design-lab** | ① 게임 바깥 화면 셸 `screens/{MainLoggedOut,MainLoggedIn,Onboarding,GameSelect}.tsx` ② 모달 `modals/{LoginRequired,Online,Matching,Settings}.tsx` ③ 프리미티브 `components/{Button,Card,Modal,Avatar,LeaderboardTable,PlayerBadge,KeyCap…}.tsx` ④ 테마 `theme.css`(팔레트/폰트/클립·프레임 토큰) ⑤ 결과 오버레이 `screens/game/ResultOverlay.tsx` | **인게임 게임 로직·게임 렌더 전부**: `screens/game/{Game1,Game2,Game3}.tsx`, 구코어 `shared/src/games/*`, 구입력 `attachKeyboardAdapter`, mock 권위(`state/{flow,session}.ts`의 봇·`reportRoundResult`·가짜 로그인) | `ideas/05-obsidian/src/**`, `theme.css`, `Game1.tsx`, `Game2.tsx:45` |
| **main** | 위 둘을 워크스페이스 3칸(`shared`/`client`/`server`, 전부 `@madpump/*`)에 배치 + **신규 `server` 작성** | 현재 빈 스텁(`client/`·`shared/`는 `package.json`만, `server/`는 Prisma만) | 루트 `package.json`(workspaces), `server/prisma/` |

**세 번째 긴장의 정체 (코드 확인):** design-lab의 인게임 화면은 렌더 방식조차 통일돼 있지 않다 — `Game1.tsx`/`Game3.tsx`는 **React DOM**(div·span·CSS)으로, `Game2.tsx`는 **canvas**로 그린다. 게다가 셋 다 **구 API(`players.P1.value`·`derived.timeRemainingMs`)에 못박혀 있어** 신 상태(`Game1State.p1`, `Game2State.rockets/hp`, `Game3State.c/feed`)를 그릴 수 없다. → **design-lab 인게임 렌더는 재활용 불가.** game-lab의 canvas 렌더러 3종은 셋 다 신상태 대응·일관 시그니처(`render(ctx, state, w, h)`)이므로 이걸로 통일 이식한다.

---

## 2. 타깃 모노레포 배치 (파일 매핑)

main은 이미 npm workspaces 모노레포(`shared`/`server`/`client`, 전부 `@madpump/*`)다. game-lab도 같은 규약을 쓰므로 배치는 경로 복사에 가깝다.

### 2-0. 자립·계약 대원칙 (★이 절이 배치의 헌법)

머지에서 절대 어기면 안 되는 불변식 두 개. 아래 2-1~2-3의 모든 "이식"은 이 원칙 위에서만 유효하다.

#### 불변식 A — 자립성: main은 `game-lab`/`design-lab` 없이도 빌드·실행된다

> **원칙: 원본은 "광산", main은 "제품"이다. 머지 = 파일을 main 워크스페이스 안으로 물리 복사(vendor-in)하고, 원본과의 탯줄(경로 참조·alias·심링크·workspace 글롭)을 전부 끊는 것.** 복사가 끝나면 `game-lab`도 `design-lab`도 **폴더째 삭제해도 main이 멀쩡해야 한다.**

이게 왜 중요한가: `design-lab` 시안은 지금 `@shared` alias로 `../../shared/src`(= design-lab 내부)를 가리키고, `game-lab`은 아예 **다른 브랜치(experiment/game-test)에만** 존재한다. 만약 "이식"을 *복사*가 아니라 *원본 폴더를 가리키는 경로 배선*으로 해버리면, 나중에 lab 폴더를 지우는 순간 main이 컴파일조차 안 된다. 그래서 배선이 아니라 **복사 + 탯줄 절단**이어야 한다.

**강제 가드레일 (구현 시 지켜야 할 규칙):**

| 규칙 | 금지 | 허용 |
|---|---|---|
| **워크스페이스 범위** | 루트 `package.json`의 `workspaces`에 `design-lab`/`game-lab`/`ideas/*` 추가 | `["shared","server","client"]` 3칸만 유지(현 상태 그대로) |
| **경로 alias** | `client`의 tsconfig/vite `paths`가 `../../design-lab`·`../../game-lab`·`../../shared`(랩 내부) 를 가리킴 | alias는 **자기 워크스페이스 안**만(`@/…`=client/src). 코어는 `@madpump/shared`(main의 shared)로만 |
| **상대경로 import** | `import … from '../../design-lab/...'` / `'../../game-lab/...'` | main 3워크스페이스 내부 상대경로 + `@madpump/shared` |
| **심링크/글롭** | 랩 폴더로의 symlink, `file:../design-lab` 의존성 | 없음 |

**git 반입 방법(원본이 사는 곳이 다르므로):**
- `game-lab` (다른 브랜치): `git checkout experiment/game-test -- game-lab/` 로 파일만 꺼내 → 필요한 것을 `shared/`·`client/`로 이동 → main에 커밋. 그 후 game-lab 트리는 main에서 버린다.
- `design-lab` (현재 main 트리에 있음): 승자 시안의 `screens/modals/components/theme.css`를 `client/src`로 복사 → import를 로컬 컴포넌트+`@madpump/shared`로 정리 → **`design-lab/` 전체를 main에서 삭제(또는 참조 0을 확인 후 남겨도 무방)**.

#### 불변식 B — 계약 고정: API 봉투는 게임 무관·불변, 게임별 JSON은 폴더별로 분리

> **원칙: "무엇을 주고받는가(전송 봉투)"는 한 번 정해 고정하고, "그 안의 상태가 어떻게 생겼는가(게임별 JSON)"는 게임마다 독립 파일로 분리 저장해 게임이 바뀌어도 봉투는 안 건드린다.**

- **고정 계약(변하지 않음)** — `shared/src/net/events.ts`: 통합 입력 `game:input {code,type,t}` + 상태 봉투 `game:state {gameId, state}` + 생명주기 이벤트. **게임을 추가·수정해도 이 파일은 그대로다.** 이게 "API를 정해놓는다"의 실체.
- **게임별 "이해 방식"(자주 변함)** — 게임 하나 = 폴더 하나로 격리. `shared/src/games/gameN/` 안에 그 게임의 **상태 타입 + 설정(G1/G2/G3) + 코어(create/step)**가 전부 들어있어, 그 게임을 바꾸려면 **그 폴더만** 만진다.
- **분리 저장되는 스키마 파일(제안)** — `shared/schemas/gameN.state.schema.json` (게임별 JSON Schema 1개씩). 코드와 별개로 "이 게임의 상태 JSON은 이렇게 생겼다"를 사람·AI·검증기 모두가 읽는 언어중립 계약으로 못박는다. 게임이 바뀌면 이 파일과 `gameN/` 폴더만 diff에 뜨고, 전송 봉투·다른 게임·DB는 무변경.
- **레지스트리로 조립** — `shared/src/games/registry.ts`가 `gameId → {core, schema, config}`를 매핑. **새 게임 추가 = 폴더 하나 + 스키마 하나 + 레지스트리 한 줄.** 전송·서버 루프 코드는 손대지 않는다(사용자 통찰 "같은 API + JSON 상태"의 구현형).

### 2-1. `shared/` — game-lab 코어를 그대로 승격

| game-lab 원본 | → main 타깃 | 비고 |
|---|---|---|
| `shared/src/games/types.ts` | `shared/src/games/types.ts` | `KeyCode`, `GameInputEvent`, `GameResult`, `GAME_DURATION=10`, `GameCore<S>` 정본 |
| `shared/src/games/game1/logic.ts` | 동일 | `Game1State`, `G1`, `create/step` |
| `shared/src/games/game2/logic.ts` | 동일 | `Game2State`, `Bullet`, `G2`, `seed` |
| `shared/src/games/game3/{core,logic}.ts` | 동일 | `Game3State`, `FencerState`, `DodgeStyle`, `G3FeedEvent`, `seed` |
| `shared/src/index.ts` | 동일 | 배럴 export |
| — (**신규**) | `shared/src/game/palette.ts` | `RenderPalette` — 캔버스 팔레트 주입 타입 (§3) |
| — (**신규**) | `shared/src/game/viewState.ts` | **서버 원본 state → 클라 뷰-스냅샷 투영기** (`seed` 등 권위 전용 필드 제거, §5·§7) |
| — (**신규**) | `shared/src/net/events.ts` | 소켓 이벤트 payload 타입 — client·server 공유 (§5) |
| — (**신규**) | `shared/src/net/result.ts` | `GameResult ↔ MatchResult(DB)` 매핑 유틸 (§7) |
| — (**신규**) | `shared/src/games/registry.ts` | `gameId → {core, schema, config}` 레지스트리. 새 게임 = 폴더+스키마+한 줄 (2-0 불변식 B) |
| — (**신규**) | `shared/schemas/{game1,game2,game3}.state.schema.json` | 게임별 상태 JSON Schema — "이 게임을 이해하는 방식"의 언어중립 계약. 게임이 바뀌면 이 파일+`gameN/`만 수정, 봉투·타게임·DB 무변경 (2-0 불변식 B) |

### 2-2. `client/` — design-lab 셸 + game-lab 렌더러를 소켓에 배선

| 원본 | → main 타깃 | 처리 |
|---|---|---|
| design-lab `screens/*`, `modals/*`, `components/*`, `theme.css` | `client/src/{screens,modals,components}/`, `client/src/theme.css` | **그대로 이식.** import 경로만 정리(`@shared` alias 제거→로컬 컴포넌트/`@madpump/shared`). mock 권위(`flow.ts` 봇·`reportRoundResult`, `session.ts` 가짜 로그인)는 소켓/REST로 교체 |
| game-lab `client/src/games/render{1,2,3}.ts`, `fencerPose.ts`, `registry.ts` | `client/src/game/render*.ts`, `registry.ts` | **그대로 이식** + 팔레트 파라미터화(§3) |
| game-lab `client/src/input/keyboard.ts` | `client/src/game/input/keyboard.ts` | `attachLocalKeyboard` 유지 → `InputSource` 인터페이스 뒤로 (§5) |
| game-lab `client/src/ui/GameScreen.tsx` | `client/src/screens/game/GameHost.tsx` | **로컬 루프를 소켓 루프로 개작**(§5). design-lab `ResultOverlay.tsx`를 결과 표시에 붙임 |
| design-lab `screens/game/{Game1,Game2,Game3}.tsx` | ❌ 이식 안 함 | 구API·구렌더. `GameHost` 하나가 `registry`로 3게임 공용 처리 |

### 2-3. `server/` — 신규 Fastify + Socket.IO + Prisma 권위 루프

| 계층 | 타깃(신규) | 역할 |
|---|---|---|
| HTTP | `server/src/http/{auth,match,leaderboard}.ts` | Google OAuth 콜백(인가코드+세션쿠키, JWT 금지), 매치 기록 조회, 리더보드(REST) |
| 소켓 | `server/src/socket/index.ts` | 큐·방·라이브상태 = **인메모리**(DB에 방/큐 테이블 없음) |
| 권위 루프 | `server/src/game/loop.ts` | `@madpump/shared`의 `core.create/step`을 **서버에서** 구동. **원본 state(seed 포함)는 이 파일 내부에만 존재**(§5·§7) |
| DB | `server/prisma/*` (기존) | 매치 종료 시 `game_match` 1행 기록. `GameResult→MatchResult` 매핑 |

---

## 3. 핵심 긴장 해소: "게임 렌더링" 한 곳만 손댄다

### 문제

- game-lab 렌더러(`render1/2/3.ts`)는 **신 상태를 정확히 그리지만 다크 팔레트가 하드코딩**돼 있다. 확인: `render1.ts` 17개, `render2.ts` 17개, `render3.ts` 20개의 hex 리터럴. **정정(검증 반영):** 렌더러 안의 대표 hex는 `#4da3ff`(P1), `#ff5d5d`(P2) 등이다 — `#10131a`는 렌더러 어디에도 없고 **캔버스 배경 fill(`GameScreen.tsx:63` `ctx.fillStyle='#10131a'`)에만** 존재한다. (배경/타이머 경고색 `#ff5d5d` 등도 `GameScreen`이 소유.)
- design-lab 테마는 CSS 변수(`--p1`, `--p2`, `--bg-0`, `--danger` …, `theme.css`)인데 **캔버스는 CSS 변수를 못 읽는다.** design-lab `Game2.tsx:45`가 이미 이 한계를 실토한다(`// theme.css --p1/--p2와 동일 hex — canvas는 CSS 변수를 못 읽는다`) → hex를 JS로 재복사.

### 해소책 — 렌더러를 "팔레트 주입형"으로 승격

렌더러 시그니처에 팔레트를 인자로 추가하고, 승자 시안의 CSS 변수 hex를 JS 객체로 한 번 미러링해 주입한다. **게임 로직·상태는 한 글자도 안 건드린다.**

```ts
// shared/src/game/palette.ts — 캔버스는 CSS var를 못 읽으므로 JS로 미러링(정본: theme.css)
export interface RenderPalette {
  bg: string           // 캔버스 배경 (원래 GameScreen:63 #10131a → 승자 --bg-1) — 소유: 테마
  p1: string           // P1 진영색 (--p1, 원래 렌더러 #4da3ff) — '절대 불변' 규칙 유지
  p2: string           // P2 진영색 (--p2, 원래 렌더러 #ff5d5d)
  danger: string       // 잔여 3초 경고색 (--danger, 원래 #ff5d5d)
  accent: string       // 게이지/하이라이트 (--gold 등)
  fontDisplay: string  // HUD 숫자 폰트 (--font-display)
}

// 기존:   render(ctx, state, w, h)
// 개작:   render(ctx, state, w, h, pal)   ← pal만 추가, 나머지 동일
export type GameRender<S> =
  (ctx: CanvasRenderingContext2D, state: S, w: number, h: number, pal: RenderPalette) => void
```

작업량은 렌더러당 hex 리터럴 17~20개(+ `GameScreen`이 갖던 배경/타이머 hex)를 `pal.*` 참조로 치환하는 기계적 리팩터 1회다. **게임 밖 UI(로그인/로비/결과/리더보드)는 이미 순수 React+CSS**이므로 design-lab 화면을 그대로 이식하면 끝 — **캔버스 팔레트 주입만이 유일한 교차 작업**이다.

---

## 4. 디자인 시안 선택 전략

**추천: "승자 1개 고정" + "팔레트/폰트/프레임만 토큰화".** 순수 토큰 교체(7개를 CSS 변수만으로 자유 교체)는 **불가능**하다 — 시안마다 화면 파일 구성 자체가 다르기 때문이다.

| 시안 | screens 구성 차이 | 사용이력 |
|---|---|---|
| 01-neo-brutal | CSS 분리 없음(컴포넌트 inline) | 루프1 |
| 02-neon-coinop | `main-in.css`/`onboarding.css` 등 화면별 CSS 다수 | — |
| 03-clay-toy | `lobby.css` + 화면별 CSS 혼재 | 루프? |
| 04-broadcast-arena | `auth.css` + `lobby.css` 분리(깔끔) | 루프4 |
| **05-obsidian** | `auth.css` + `lobby.css` 분리, 토큰 체계 완비(팔레트·폰트·클립·ease 변수화) | **루프5(최신)** |
| 06-pico8 | 화면별 CSS 다수 | — |
| 07-gym-class | (screens 목록 미확인) | — |

**1순위 추천: `05-obsidian`.** 근거: ① **가장 최근 사용이력(루프5)**, ② 다크 e스포츠 팔레트가 game-lab 캔버스 렌더(다크 `#10131a` 배경 기반)와 **팔레트 궁합이 즉시 맞아** §3 주입 시 이질감 최소, ③ `theme.css`가 팔레트/폰트/클립/ease를 **완전히 토큰화**해 `RenderPalette` 미러링이 1:1로 떨어짐, ④ `--p1`/`--p2` "절대 불변" 규칙이 game-lab 렌더의 P1(`#4da3ff`)/P2(`#ff5d5d`) 관례와 일치. **2순위: `04-broadcast-arena`**(스포츠 생중계 콘셉트, `auth.css`/`lobby.css` 구조 동일, 루프4 이력).

> **(미확정)** **최종 승자는 사용자 결정 사항**(→ 문서끝 '결정 필요'). 방법론은 "승자 폴더 하나를 `client/src`로 이식 + 그 `theme.css`의 hex를 `RenderPalette`로 미러링"으로 **시안 독립적**이다. 나중에 승자를 바꿔도 **바뀌는 파일은 `theme.css` + `palette.ts` 미러링 1개**뿐이고 게임 로직/렌더 구조는 불변.

---

## 5. 오프라인 → 온라인 전환 방법

### 5-1. 입력 소스 추상화 (LocalKeyboard | RemoteSocket)

game-lab의 로컬 루프(`GameScreen.tsx`)는 3단계다: `create(Math.random)` 1회 → 매 rAF `step(state, queue.splice(0), dt)` → `render`. 이걸 그대로 두고 **입력 공급자와 상태 소유자만 바꾼다.**

```ts
// client/src/game/input/source.ts — 로컬/원격을 같은 인터페이스로
export interface InputSource {
  // GameInputEvent = { code: KeyCode; type: 'down'|'up'; t: number }  (정본: shared/types.ts)
  start(onEvent: (e: GameInputEvent) => void): void  // 이벤트 push 시작
  stop(): void
}
// 오프라인: 기존 attachLocalKeyboard 래핑 (keyboard.ts 그대로)
// 온라인:   내 키입력을 서버로 emit하고, 서버 뷰-스냅샷을 받아 렌더만
```

### 5-2. 서버 권위 루프 vs 덤 클라이언트 렌더

`create`의 `rand()`가 초기 상태(특히 `seed`)를 확정하므로 — game2/game3는 `create`에서 `Math.floor(rand()*4294967296)`로 `seed`를 뽑고(game2/logic.ts:92, game3/core.ts:149), 이후 `step`은 내장 LCG `nextRand(seed)`로만 난수를 쓴다 — **서버가 `create`를 소유하면 이후 전개는 결정적**이다. game1은 `step`에 난수가 아예 없다.

> **결정성의 정확한 조건 (검증 반영 — 중요):** 코어의 "순수·결정적"은 **`(dt 시퀀스, event 시퀀스, seed)`가 동일할 때만** 성립한다. `dt`에 무관한 게 아니다. game1의 gauge sqrt감쇠·value 적분·hold 누적, game3의 knockback 누적은 모두 **dt 경로 의존**이고, game2 충돌 판정도 스텝당 이동량에 좌우된다. 따라서 **서버 틱레이트는 오프라인 튜닝(rAF ~16ms, 60fps)과 정합**되게 잡아야 한다.
>
> **정정:** 오프라인의 `dt = Math.min((now-last)/1000, 0.05)`(GameScreen.tsx:50)에서 **`0.05`(50ms)는 dt "상한(cap)"이지 틱 간격이 아니다** — 실제 오프라인은 rAF ~16ms로 돈다. 서버를 고정 50ms(20Hz)로 돌리면 float 적분 궤적이 달라져 60fps 튜닝과 어긋난다. **→ 서버 권위 루프는 고정 ~16ms(≈60Hz) 틱**으로 돌리고, 클라 스냅샷 전송레이트는 그와 **별개로** 낮춰도 된다(예: 20~30Hz 스냅샷). 즉 "물리 스텝 dt"와 "네트워크 스냅샷 주기"는 분리한다.

```
[서버 loop.ts — 권위, 원본 state(seed 포함) 내부 보관]     [클라 GameHost — 덤 렌더]
state = core.create(serverRng)                              키입력 → input:key emit ──▶ 서버 buf 적재
물리 루프(고정 ~16ms, 60Hz):
  buf = 모아둔 GameInputEvent[]
  state = core.step(state, buf, dt≈0.016)
스냅샷 루프(예: 20~30Hz):
  view = toViewState(state)   ← seed 등 권위 전용 필드 제거(§7)
  ──state:tick(seq, view)──▶                              받은 view를 render(ctx,view,w,h,pal)
  if state.result:  ──match:over(result)──▶               ResultOverlay 표시
```

클라는 **받은 뷰-스냅샷을 렌더러에 그대로 먹이면 끝**이다 — game-lab 렌더러가 이미 `(ctx, state, w, h)` 시그니처이고 **`state.seed`를 전혀 읽지 않으므로**(render1/2/3·fencerPose grep 확인 = 0건), 뷰-스냅샷에서 seed를 빼도 렌더에 아무 지장이 없다. **기본값은 덤 렌더**로 시작한다.

> **(미확정)** 클라 예측(prediction)·보정(reconciliation) 적용 여부와 물리 dt/스냅샷 전송레이트의 최종 값 → '결정 필요'. **예측을 켜려면 클라가 같은 `core`로 앞당겨 step해야 하므로 그때만 seed가 클라에 필요**해지며, 이 경우 §7의 치트 tradeoff를 명시적으로 문서화해야 한다.

### 5-3. 대표 소켓 이벤트 (콜론 규칙) — **뷰-스냅샷 원칙 반영**

```
[C→S] queue:join    { gameId?: 1|2|3 }                       // 없으면 랜덤(빠른시작)
[S→C] match:found   { matchId: string, gameId: 1|2|3, role: 'P1'|'P2' }
[S→C] match:start   { view: <게임별 '뷰 state'> }            // 서버 create 결과에서 seed 제거한 투영본
[C→S] input:key     { code: KeyCode, type: 'down'|'up', t: number }  // = GameInputEvent
[S→C] state:tick    { seq: number, view: <게임별 '뷰 state'> }        // 권위 스냅샷(seed 등 권위 전용 필드 제외)
[S→C] match:over    { matchId: string, result: 'P1'|'P2'|'DRAW' }     // = GameResult
```

> **보안 원칙 (major 검증 반영 — 반드시 API-스펙 파트로 인계):** 원본 `Game2State`/`Game3State`에는 **PRNG 내부상태 `seed`**가 들어있다(game2/logic.ts:56, game3/core.ts:108). 이걸 `state:tick`/`match:start`로 그대로 보내면 **서버 RNG seed가 클라로 새어나가고, 변조 클라가 미래 난수를 예측**할 수 있다 — game2는 로켓 속도/지터, **game3는 공격 시동딜레이(0.04~0.18s)와 회피 스타일**을 예측해 **프레임퍼펙트 패링/회피라는 결정적 치트**가 열린다. 렌더러는 seed를 안 읽으므로(위 grep 확인) 덤 클라에는 애초에 불필요하다. **→ `shared/src/game/viewState.ts`의 `toViewState(state)`가 렌더러가 실제로 읽는 필드만 담은 '뷰 state'를 만들고, 원본 seed 포함 state는 서버 `loop.ts` 내부에만 둔다.** 이벤트명·payload 최종 계약은 API-스펙 파트 소관이므로, 그 파트에 **`seed non-exposure`(및 권위 전용 필드 비노출)**를 명시적으로 인계한다.

> **넷코드 함정 (반드시 명세화):** `GameInputEvent.t`(게임시작 후 경과초)를 **게임3만 실제로 읽는다** — game3 `core.ts`가 `t`로 공격 시동 타이밍을 서브프레임 단위로 판정한다. game1/game2 `step`은 `e.code`/`e.type`만 보고 `e.t`를 무시한다. **→ (미확정)** 온라인에서 클라가 찍은 `t`를 그대로 신뢰할지, 서버 도착시각으로 재스탬프할지 정책 결정 필요. 결정성·공정성이 여기 걸린다(→ '결정 필요').

---

## 6. 단계별 실행 플랜 (step → verify)

| # | Step | Verify (검증기준) |
|---|---|---|
| **1** | **코어 승격**: game-lab `shared/src/games/*` → main `shared/`. 코어 테스트(97 tests)도 이식. `viewState.ts`/`palette.ts`/`net/*` 스텁 생성 | `--filter @madpump/shared test` 전부 통과 + `import {G1,G2,makeGame3} from '@madpump/shared'` 타입체크 OK |
| **2** | **클라 셸 이식(오프라인 먼저)**: 승자 시안 `screens/modals/components/theme.css` 이식 + game-lab 렌더러/입력/`GameHost` 이식, `InputSource=LocalKeyboard`로 배선. 팔레트 주입(§3) | 브라우저에서 로그인(mock)→로비→게임선택→**게임1·2·3이 로컬 2인으로 동작**하고 승패가 뜬다. 렌더가 승자 테마 팔레트로 그려진다 |
| **3** | **서버 소켓 왕복**: Fastify+Socket.IO 기동, 인메모리 큐/방, `queue:join→match:found→match:start`. 서버가 `core.create` 소유, 클라 `InputSource=RemoteSocket`. **뷰-스냅샷 투영(seed 제거) 적용** | 두 탭 접속 → 매칭 성사 → 서버가 보낸 `state:tick(view)`를 두 클라가 렌더. `input:key` 왕복 확인. **payload 덤프에 `seed` 필드가 없음** |
| **4** | **게임별 온라인 판정**: 서버 권위 `step` 루프(**고정 ~16ms**) + `match:over`. game3의 `e.t` 스탬핑 정책 확정 | **동일 `(event + dt)` 프레임 트레이스를 재생하면 서버 `result` == 오프라인 로컬 시뮬 `result`가 일치**(game1 결정적, game2/3 seed 공유로 재현). ※ 결정성은 "동일 dt 시퀀스" 전제 — 20Hz 서버로 60fps 트레이스를 재생하면 불일치가 정상. ResultOverlay 정상 |
| **5** | **DB 기록/리더보드**: `match:over` 시 `game_match` 1행 insert(`GameResult→MatchResult` 매핑), `score_config`로 점수 집계 REST | `game_match` 행 생성 확인, 리더보드 화면이 실제 DB 집계로 렌더(mock 아님) |
| **6** | **인증**: Google OAuth 인가코드+세션쿠키(JWT 금지), admin 별도 ID/PW(bcrypt). design-lab `session.ts` mock을 실 API로 교체 | 실제 구글 로그인→온보딩(닉네임 unique)→`app_user` 생성. 미로그인 시 온라인 진입 차단(`LoginRequired` 모달) |

각 단계는 **이전 단계가 관측 가능하게 동작한 뒤**에만 다음으로 간다. **2단계에서 오프라인이 먼저 완전히 돌아가는 게 핵심** — 렌더·입력·코어 이식이 검증된 상태에서 소켓만 얹는다.

> **탯줄 절단 테스트 (불변식 A 강제 — 2단계 종료 게이트 + 최종 게이트 필수):** 클라 셸 이식이 끝난 직후, 원본 폴더를 잠시 치우고 빌드가 그대로 통과하는지 확인한다.
> ```bash
> # 랩 폴더를 임시로 밖으로 이동(삭제 대신 안전하게)
> mv design-lab ../_park_design-lab 2>/dev/null; git stash -u 2>/dev/null
> mv /tmp/game-lab-src ../_park_game-lab 2>/dev/null   # 반입 후 원본 흔적
> npm ci && npm run -ws build && npm run -ws test       # ← 여기서 통과해야 자립 성공
> # 참조 잔존 스캐너(하나라도 잡히면 실패):
> grep -rn "design-lab\|game-lab\|@shared\b\|\.\./\.\./\(shared\|game-lab\|design-lab\)" client/src server/src shared/src
> ```
> 빌드가 깨지거나 grep이 뭔가 잡으면 **아직 탯줄이 안 끊긴 것** — 그 import를 로컬 복사본 또는 `@madpump/shared`로 바꾼 뒤 재시도. 통과하면 랩 폴더를 되돌리고(또는 영구 삭제) 다음 단계로.

---

## 7. 리스크 / 주의

| 리스크 | 내용 | 완화 |
|---|---|---|
| **원본 폴더 참조 잔존 (자립성 붕괴)** | 이식을 *복사*가 아니라 *경로 배선*으로 하면(`@shared` alias·`../../design-lab`·`../../game-lab`·workspaces에 랩 추가) 나중에 `design-lab`/`game-lab` 폴더 삭제 시 main이 빌드 불가 | **불변식 A(2-0)** — vendor-in 복사 + 탯줄 절단. 워크스페이스는 3칸 고정, alias는 자기 워크스페이스 안만, 코어는 `@madpump/shared`로만. **§6 "탯줄 절단 테스트"를 2단계·최종 게이트로 강제**(랩 폴더 치우고 `npm run -ws build` 통과 + 참조 grep 0) |
| **seed 클라 노출 (치트 벡터)** | 원본 `Game2State`/`Game3State`에 PRNG `seed` 포함. state를 통째로 보내면 변조 클라가 game3 시동딜레이·회피, game2 로켓난수를 예측 → 프레임퍼펙트 치트 | **뷰-스냅샷 투영**: 렌더러가 읽는 필드만 담아 전송(seed 제거), 원본은 서버 `loop.ts` 내부 전용. API-스펙 파트에 `seed non-exposure` 인계. 예측 클라를 켤 때만 seed 노출의 tradeoff를 명시 문서화 |
| **결정성 = dt 시퀀스 의존 (dt 무관 아님)** | 서버를 20Hz(50ms)로 돌리면 game1 적분·game3 knockback·game2 충돌 입도가 60fps 튜닝과 어긋남. `0.05`는 dt cap이지 틱 간격이 아님 | 서버 물리 루프를 **고정 ~16ms(≈60Hz)**로. 네트워크 스냅샷 주기는 분리(예: 20~30Hz). step4 검증은 "동일 `(event+dt)` 트레이스 재생 시 일치"로 규정 |
| **구/신 상태 혼동** | design-lab `Game1State`(`players.P1.value`, `derived`, `elapsedMs`)와 game-lab `Game1State`(`p1`, `p1Gauge`, `p1Hold`, `elapsed`)가 **동명이형**. 잘못 import하면 조용히 깨짐 | main `shared`에는 game-lab 버전만 존재. design-lab `shared`는 **이식 대상 완전 제외**, `@shared` alias 삭제. 세 패키지가 동일 npm 이름(`@madpump/shared`)이므로 폴더 교체로 유일본만 남김 |
| **결과 표기 3종** | `GameResult('P1'/'P2'/'DRAW')` ↔ design-lab `MatchResult('P1_WIN'…)` ↔ DB enum(`P1_WIN`…) | `shared/src/net/result.ts` 단일 매핑: `'P1'→'P1_WIN'`, `'P2'→'P2_WIN'`, `'DRAW'→'DRAW'`. 저장·표시 경계에서만 변환 |
| **create를 클라가 부르면 갈라짐** | game2/3는 `create`의 `seed`, game1은 `create` 난수(target·시작값·rate)만 공유하면 결정적 | `core.create`는 **오직 서버**가 호출. 클라는 `match:start`로 받은 뷰-스냅샷에서만 시작 |
| **game3 `e.t` 타이밍** | game3만 서브프레임 `e.t`로 판정. 온라인에서 클라 스탬프 신뢰 시 조작·비결정 위험 | **(미확정)** 서버 재스탬프 vs 신뢰 정책을 4단계 전 확정. game1/2는 무관(`e.t` 미사용) |
| **라운드 모델 불일치** | design-lab `flow.ts`는 다라운드 best-of + `timePerRoundSec` 가변. game-lab 코어는 **고정 10초 단판**(`GAME_DURATION=10`), DB `game_match`는 **매치당 결과 1행** | 매치=서버가 N라운드 오케스트레이션, 각 라운드=game-lab 10초 코어, DB엔 최종 매치 결과만. **(미확정)** `timePerRoundSec` 가변 존중 vs 10초 고정 |
| **캔버스 vs CSS 테마 경계** | 캔버스는 CSS 변수를 못 읽음(`Game2.tsx:45` 실증) | 팔레트 hex를 `RenderPalette` JS 객체로 **1회 미러링**, `theme.css`를 정본으로 주석 고정. 테마 변경 시 두 곳 동시 갱신 규칙 |
| **시안 화면 구성 차이** | 05는 `auth.css`/`lobby.css` 분리, 02/06은 화면별 CSS 다수 — 순수 토큰 교체로는 시안 못 바꿈 | 승자 1개를 폴더째 고정 이식. 교체는 `theme.css`+`palette.ts` 미러링 단위로만 (§4) |

---

## 결정 필요 (사용자/리드 판단 — 구현 전 확정)

| # | 항목 | 선택지 | 걸린 것 |
|---|---|---|---|
| **D1** | **디자인 승자 시안** | `05-obsidian`(1순위) / `04-broadcast-arena`(2순위) / 기타 | 방법론은 시안 독립적 — 확정만 하면 폴더 이식+팔레트 미러링 1회. §4 |
| **D2** | **game3 `e.t` 스탬핑 정책** | (a) 클라 스탬프 신뢰 / (b) 서버 도착시각 재스탬프 / (c) 서버 검증 후 클램프 | game3 판정 결정성·공정성·치트 내성. §5-3, 4단계 전 필수 |
| **D3** | **클라 예측(prediction) on/off** | (a) 덤 렌더만(기본) / (b) 예측+보정 | off면 seed 완전 비노출 유지 가능. **on이면 seed 노출 tradeoff를 감수·문서화**해야 함. §5-2·§7 |
| **D4** | **서버 물리 틱레이트 + 스냅샷 주기** | 물리 고정 ~16ms(권장) / 스냅샷 20·30·60Hz | 결정성(60fps 튜닝 정합) + 대역폭. §5-2, step4 검증 전제 |
| **D5** | **라운드 시간 모델** | (a) 10초 고정(`GAME_DURATION`) / (b) `timePerRoundSec` 가변 존중 | 매치 오케스트레이션·UI 라운드 표시. §7 |
| **D6** | **뷰-스냅샷 필드 계약** (API-스펙 파트로 인계) | `toViewState`가 담을 정확한 필드셋(게임별) | `seed` 등 권위 전용 필드 비노출 보장. §5-3 |

<!-- notify: 머지 방법론 종합 문서 완료 -->