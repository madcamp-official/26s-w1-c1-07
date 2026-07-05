# MADPUMP API·JSON·DB 명세서 (v1 — game-lab 튜닝로직 기준)

> **정본 순위 (읽기 전 필독).** 이 문서는 세 초안(API 표면 · 게임별 JSON · DB 입출력)을 종합한 **하위 파생 문서**다. 충돌 시 상위 정본이 이긴다.
> 1. **`docs/TECH_STACK.md`** (스택·인증·넷코드 방침의 정본)
> 2. **`docs/ERD.md`** → 이를 옮긴 **`/Users/siheom-yong/programming/madpump/26s-w1-c1-07/server/prisma/schema.prisma`** (DB 스키마의 정본. 스키마 변경은 ERD.md를 먼저 고친다)
> 3. **game-lab 게임 코어 코드** (게임 상태·판정 로직의 정본. worktree `.../scratchpad/wt-gametest/game-lab/shared/src/games/*`)
> 4. **이 문서** (위 셋을 조립한 전송·데이터 계약. 위와 어긋나면 위가 맞다)
>
> 코드 근거 경로 주의: `game{1,2,3}/*.ts`, `types.ts`, `render{1,2,3}.ts`, `registry.ts`, `GameScreen.tsx`, `keyboard.ts` = **game-lab worktree** 기준. `schema.prisma` = **main 저장소**(`/Users/siheom-yong/programming/madpump/26s-w1-c1-07/server/prisma/schema.prisma`) 기준 — game-lab worktree엔 없다.

---

## TL;DR (한 화면 요약)

- **전송 표면은 게임 수와 무관하게 딱 2개다.** `[C→S] game:input`(통합 입력 봉투) + `[S→C] game:state`(통합 상태 봉투). 근거: 전 게임이 같은 `GameCore` 인터페이스(`create`/`step`)와 같은 입력 타입 `GameInputEvent` 하나만 쓴다(`types.ts`). → **게임4를 붙여도 전송·서버 루프 코드는 0줄 수정.**
- **서버가 유일 권위다.** `core.create(seed)`로 초기상태 확정 → `game:input`을 모아 `core.step`으로 전진 → `game:state`를 매 틱 브로드캐스트. 클라는 기본 **덤 렌더**(받은 상태를 그리기만).
- **`game:state`로 나가는 것은 "권위 전체 상태"가 아니라 "렌더 투영(render-projection)"이다.** `seed`(LCG PRNG 내부상태)·숨은 능력치(`p1Rate`/`p2Speed`)·판정 내부 플래그(`resolved` 등)는 **절대 비전송**. 이유: `seed`를 넘기면 상대가 다음 전개(game2 탄 분포, game3 공격 시동 딜레이)를 선계산해 완벽 회피/카운터가 가능(치팅). render1/2/3은 이 필드들을 읽지 않으므로 **제거해도 렌더 무손실**임을 코드로 확인함.
- **입력 스푸핑 방지.** `code`의 P1/P2 인코딩(Q/W=P1, U/I=P2)을 신뢰하지 않는다. 서버가 소켓 세션→`role`을 구해 **슬롯만 취하고 물리키를 role의 것으로 재기입**한 뒤 `step`에 넣는다.
- **DB는 라이브를 모른다.** 진행 중 DB 접근 0회. **매치가 끝나야(`result≠null`) `game_match` 1행 INSERT.** 라운드/틱 상세는 저장 안 함(ERD note #2). `GameResult('P1'/'P2'/'DRAW')` → DB `MatchResult(P1_WIN/P2_WIN/DRAW)` 매핑 필수. **INSERT 커밋 성공 후에만 `match:end` 방송**(가짜 성공 금지).

---

## 목차

- [사용자 3그룹 멘탈모델 ↔ 섹션 매핑](#user-map)
- [§0 공통 봉투 — 같은 API + JSON 상태 (사용자 통찰의 실체)](#s0)
- [§1 인증·세션·프로필 (그룹①, REST)](#s1)
- [§2 로비·방·매칭 (그룹②, Socket.IO)](#s2)
- [§3 인게임 — 게임별 JSON 상태 스키마 (그룹③)](#s3)
- [§4 DB 입출력 — 언제 무엇을 넣고 빼는가](#s4)
- [열린 질문 (미확정 목록)](#open)
- [구현 로드맵](#roadmap)

---

<a id="user-map"></a>
## 사용자 3그룹 멘탈모델 ↔ 섹션 매핑

사용자의 멘탈모델은 3그룹이다: **① 로그인/로그아웃(계정) · ② 게임 접속(방·매칭) · ③ 게임 실행(입력·상태·판정).** 각 그룹이 명세의 어느 표면에 대응하는지:

| 그룹 | 사용자 언어 | 담당 섹션 | 주 표면 | 핵심 산출물 |
|---|---|---|---|---|
| **①** | "로그인/로그아웃, 내 프로필" | **§1** | REST `/auth/*`·`/api/*` | 세션쿠키, `app_user` INSERT/UPDATE |
| **②** | "방 만들기/입장, 빠른 시작" | **§2** | Socket `lobby:*`/`room:*`/`queue:*` | 인메모리 방·큐, 역할(P1/P2) 배정 |
| **③** | "키 누르면 상태 바뀌고 승패" | **§0 + §3** | Socket `match:*`/`round:*`/`game:*` | 통합 봉투, 게임별 상태 JSON, 서버 판정 |
| (횡단) | (사용자에겐 안 보임) | **§4** | Prisma ↔ MySQL | ③의 결과 영속화 + ①의 신원 조회 + 리더보드 |

> 사용자 통찰 — "입력키가 고정이니 **같은 API로 통일**하고 **JSON으로 상태를 보내자**" — 는 §0에서 그대로 실현된다. game-lab이 이미 `GameCore` + `GameInputEvent` 구조로 그 통일을 구현해 두었다.

---

<a id="s0"></a>
## §0 공통 봉투 — 같은 API + JSON 상태 (사용자 통찰의 실체)

### 0.1 설계 원칙: "봉투 통일, 내용은 게임별"

전 게임이 **완전히 동일한 코어 인터페이스**를 공유한다(`shared/src/games/types.ts:18-21`):

```ts
export interface GameCore<S extends { elapsed: number; result: GameResult }> {
  create(rand: () => number): S               // rng로 권위 초기상태 1회 생성(seed 확정)
  step(state: S, events: GameInputEvent[], dt: number): S   // 순수·결정적. 입력배열+dt → 다음 상태
}
```

그리고 입력은 **게임과 무관한 단일 이벤트** 하나뿐이다(`types.ts:1-8`):

```ts
export type KeyCode = 'KeyQ' | 'KeyW' | 'KeyU' | 'KeyI'   // 물리키 4개 고정(P1=Q/W, P2=U/I)
export interface GameInputEvent {
  code: KeyCode              // 눌린 물리키(e.code 기준 → 한글 IME 무관)
  type: 'down' | 'up'        // 눌림/뗌
  t: number                  // 게임 시작 기준 경과초(서브프레임 타이밍 판정용)
}
export type GameResult = 'P1' | 'P2' | 'DRAW' | null   // 승패(진행중=null)
export const GAME_DURATION = 10                        // 전 게임 10초 고정
```

→ 그러므로 **전송 표면은 게임 수와 무관하게 2개면 충분하다:**

| 이벤트 | 방향 | 봉투 | 내용 |
|---|---|---|---|
| **`game:input`** | **[C→S]** | `GameInputMsg`(공용) | `GameInputEvent` + 상관키 `matchId` |
| **`game:state`** | **[S→C]** | `GameStateMsg`(공용) | `matchId`/`round`/`seq` + **게임별 상태의 렌더 투영** |

이 통일이 "새 게임 추가 시 전송 코드 0줄 수정"을 만든다(§0.6).

### 0.2 통합 입력 봉투 `game:input`

```ts
// [C→S] game:input — 전 게임 공용. shared GameInputEvent + 상관키만 덧댐
interface GameInputMsg {
  matchId: string       // 현재 매치 런타임 상관키. sender의 매치와 불일치면 game:reject
  code: KeyCode         // 'KeyQ'|'KeyW'|'KeyU'|'KeyI'. ※서버가 role로 재기입(아래) — 신뢰 안 함
  type: 'down' | 'up'   // 키 눌림/뗌 (game-lab keyboard.ts와 동일 의미: e.repeat 무시, blur 시 held 전부 up)
  t: number             // 클라 보고 경과초(match:go의 t=0 기준). 서버가 틱창으로 clamp
}
```

**안티치트 = 서버가 `code`의 side를 재기입한다.** 코드에서 `code`는 곧 플레이어 정체다(`step`이 `KeyQ/KeyW→P1`, `KeyU/KeyI→P2`로 분기; game1 `logic.ts:121-138`, game2 `logic.ts:105-110`, game3 `core.ts:209-212`). 그대로 믿으면 P2 클라가 `KeyQ`를 보내 **상대(P1)를 조종**할 수 있다. 따라서 서버는 소켓 세션→`role`을 구해 **슬롯만 취하고 물리키를 role의 것으로 덮어쓴다:**

| 클라가 보낸 `code` | 슬롯(의미) | sender=P1이면 → | sender=P2이면 → |
|---|---|---|---|
| `KeyQ` 또는 `KeyU` | 액션 A | `KeyQ` | `KeyU` |
| `KeyW` 또는 `KeyI` | 액션 B | `KeyW` | `KeyI` |

슬롯의 게임별 의미(참고):

| 슬롯 | 게임1 (`game1/logic.ts`) | 게임2 (`game2/logic.ts`) | 게임3 (`game3/core.ts`) |
|---|---|---|---|
| **A** (P1=Q / P2=U) | 숫자 − 방향(`p1Down`) | 발사대 방향반전 / P2 왼쪽이동 | 공격(`tryAttack`) |
| **B** (P1=W / P2=I) | 숫자 + 방향(`p1Up`) | 3방향 발사 / P2 오른쪽이동 | 회피(`tryDodge`) |

> 클라는 자기 로컬 두 키를 슬롯 A/B로 보낸다(권장: canonical하게 Q/W로 전송). **불변식: 클라가 보낸 `code`로 P1/P2를 정하지 않는다.** 클라 로컬 키 바인딩/리매핑 UI는 **(미확정)** — 서버 재기입 규칙만 고정이면 안전하다.

**`t` 신뢰 범위 — 서버가 클램프한다.** 서버는 `t`를 맹신하지 않고 현재 틱창 `[t0, now]`로 clamp한다. 근거(코드 실측): `game3/core.ts:208` `const t = Math.min(Math.max(e.t, t0), now)`. 거짓 `t`는 기껏 현재 틱 안 어디쯤으로만 놓인다(서브프레임 순서 왜곡 한도). game1/game2는 `t`를 소비하지 않아 영향 없음. → "클라 `t`를 clamp"(코드 동작)를 v1 기본으로 채택. 서버 도착시각으로 `t`를 완전 재계산할지는 **(미확정)**.

무효 입력 통지:
```jsonc
// [S→C] game:reject
{ "matchId":"m_9f3a2c",
  "reason": "NOT_YOUR_MATCH" | "STALE_MATCH" | "NOT_PLAYING" | "BAD_KEY" | "AFTER_END" }
```
> 입력은 손실 허용(dropped=한 틱 누락 → 다음 `game:state`가 자가 치유). 신뢰 재전송/입력 `seq`는 v1 미강제 — 필요 시 `game:input`에 `seq:number` 추가 **(미확정)**.

### 0.3 통합 상태 봉투 `game:state` (★ 렌더 투영, 전체 상태 아님)

```ts
// [S→C] game:state — 전 게임 공용. state 내용만 게임별
interface GameStateMsg {
  matchId: string      // 런타임 상관키
  round: number        // 현재 라운드(1-based)
  seq: number          // 브로드캐스트 순번(순서보장·중복무시용, 서버 단조증가)
  state: G1View | G2View | G3View   // ★ 권위 전체 상태가 아니라 "렌더가 읽는 필드만" 추린 투영
}
```
> 클라는 `match:start`에서 이미 `gameId`를 받았으므로 매 틱 봉투에 게임 종류를 다시 싣지 않는다(`state`의 실제 타입은 그 매치의 `gameId`로 결정).

**상태 2계층 모델 (이 문서의 대전제).** 서버 안엔 **권위 전체 상태**(`Game1State`/`Game2State`/`Game3State`)가 그대로 있고, 클라로 나가는 것은 그중 **렌더러가 실제로 소비하는 필드만 추린 투영(`G*View`)**이다. 둘은 다른 물건이다.

| 계층 | 정의 | 소유 | 노출 |
|---|---|---|---|
| **권위 전체 상태** | `core.create/step`가 다루는 TS 객체 원본. `seed`·`rate`·`resolved` 전부 포함 | 서버 전용(인메모리) | **절대 비전송** |
| **렌더 투영 `G*View`** | 위에서 렌더 소비 필드만 `Pick`한 부분집합 | 서버가 매 틱 생성 | `game:state.state`로 브로드캐스트 |

판단 한 줄(글로벌 fallback 원칙): **"클라가 그리는 데 안 쓰는 필드는 안 보낸다."** 이것이 대역폭 절약이자 치팅 방지다. `render{1,2,3}.ts`가 `seed`/`rate`/`resolved`를 **읽지 않음을 코드로 확인**했으므로(§3 각 게임), 투영은 **렌더 무손실**이며 덤렌더·서버권위 모델이 그대로 유지된다.

> **타입 안전.** `G*View = Pick<Game*State, ...>`로 정의하고 렌더러를 `G*View`에 대해 타입핑하면(현재 렌더러가 읽는 필드가 곧 View), 전체 상태(superset)를 넘겨도 View 파라미터에 할당 가능해 오프라인/온라인 양쪽이 같은 렌더러를 공유한다.

**전체 스냅샷 전송(델타 아님).** 2인 규모라 델타 불필요. 게임별 세부 전략은 §3.5.

### 0.4 그룹③ 매치·라운드 생명주기

```jsonc
// [S→C] match:start  (각 플레이어에게 개별 — role이 다르므로)
{ "matchId":"m_9f3a2c", "gameId":3, "role":"P1",
  "totalRounds":1,                                   // 방 설정. 기본 1 (멀티라운드는 (미확정))
  "opponent": { "nickname":"상대", "imageUrl":"…" } }

// [C→S] match:loaded  { matchId }                   // 캔버스·에셋 준비 완료(양쪽 대기)
// [S→C] match:go      { matchId, startAt }          // startAt=서버 클럭 t=0. 이후 game:input.t는 이 기준

// [S→C] round:start  { matchId, round }             // 서버가 core.create(serverRng)로 권위 초기상태 확정(seed 고정)
// [S→C] game:state   { … }  ← 매 틱 브로드캐스트(§0.5 빈도)
// [S→C] round:end    { matchId, round, result, wins }
//        result: 'P1'|'P2'|'DRAW' (GameResult 원문) · wins:{P1,P2} 누적 라운드 승수

// [S→C] match:end   (INSERT 커밋 성공 후에만 — §4.4)
{ "matchId":"m_9f3a2c",
  "gameId":3,
  "result":"P1",                    // 최종 GameResult('P1'|'P2'|'DRAW', null 불가)
  "wins": { "P1":1, "P2":0 },
  "players": { "p1": { "userId":"88", "nickname":"yong" },
               "p2": { "userId":"91", "nickname":"lee"  } },
  "recordedMatchId":"88123",        // game_match.id (INSERT 커밋 후에만 존재). 결과 재조회 유일 키
  "playedAt":"2026-07-04T05:12:33.000Z" }

// [S→C] match:aborted { matchId, reason:"OPPONENT_LEFT"|"OPPONENT_DISCONNECT" }
// [S→C] match:error   { matchId, code:"RESULT_PERSIST_FAILED" }   // INSERT 실패(가짜 성공 금지)
```

> **상관키 규약(문서 전체 일관).** `matchId` = 서버 인메모리 매치 런타임 id(문자열, 예 `"m_9f3a2c"`, **DB 미저장**) · `recordedMatchId` = `game_match.id`(BigInt→문자열, **매치 종료 INSERT 커밋 후에만** 존재).
> **라운드 주의.** `totalRounds>1`(best-of-N)은 서버 오케스트레이션 개념이며 game-lab 코어엔 없다(코어는 10초 1판→`GameResult` 하나). v1 기본 `totalRounds=1`. 멀티라운드 집계·게임2 역할 스왑 정책은 **(미확정, §2.4)**. **어느 경우든 DB엔 최종 매치결과 1행만 남는다**(ERD note #2).

### 0.5 틱/동기화 모델

**서버 권위 step 루프** = game-lab 오프라인 루프(`client/src/ui/GameScreen.tsx:48-60`)를 서버로 옮긴 것:
```
round:start → state = core.create(serverRng)          // seed 확정(권위)
매 틱: dt = min((now - last)/1000, 0.05)               // dt 상한 0.05 — GameScreen.tsx:50 리터럴
       state = core.step(state, drainedInputs, dt)      // 이 틱에 모인 game:input(재기입 완료) 소비
       broadcast game:state { project(state) }          // ★ 투영본 전송(seed 등 제외)
       if (state.result) → round:end                    // GAME_DURATION=10 종료 or 즉시승 조건
```

| 게임 | create 랜덤 | step 랜덤 | 서버 틱/브로드캐스트 | 클라 렌더 | 근거 |
|---|---|---|---|---|---|
| 게임1 | target·시작값·rate | 없음(완전 결정적) | 낮게 OK(≈20Hz) | 덤 렌더 | `game1/logic.ts`(step에 rng 없음) |
| 게임2 | dir·p2Speed·seed | seed로 발사 속도/지터 | **높게 필요(20~30Hz)** | 덤 렌더 + 선택적 보간 | `game2/logic.ts:111-117`(발사 분기 nextRand) |
| 게임3 | seed | seed로 시동딜레이·회피스타일 | **높게 필요(≥30Hz)** — `ATTACK_DURATION` 0.06s / `DODGE_DURATION` 0.1s 창 판정 | 덤 렌더 | `game3/core.ts:190,200-202`(draw) |

- 모든 게임이 **같은 봉투·같은 루프 코드**, 빈도만 다르다.
- `GAME_DURATION=10`(`types.ts:12`) 상수 → v1 전 게임 10초 고정. 방장 "라운드 시간 설정"은 코어 상수와 충돌 → **(미확정)**.
- **`docs/TECH_STACK.md`의 게임3 "1초 틱 가위바위보" 서술은 채택 코드와 불일치.** 채택된 game-lab 코드는 **연속 step + 서브프레임 `t`**(공격창 0.06s)라 1초 틱과 양립 불가. 코드가 근거이므로 **연속 고빈도 틱**을 채택하고, 1초 틱 서술은 폐기 대상 → **(미확정, 기획 정합)**.

### 0.6 통합 봉투가 "새 게임 추가"를 재사용시키는 방식

새 게임 `game4`를 붙일 때:

| 계층 | 새 게임에 필요? | 이유 |
|---|---|---|
| `game:input` 봉투 | ✅ 재사용 | 입력이 `GameInputEvent` 하나뿐 — 게임 무관 |
| 서버 입력 재기입(§0.2) | ✅ 재사용 | 슬롯 A/B → role 매핑은 게임 독립 |
| 서버 step 루프(§0.5) | ✅ 재사용 | `core.step(state, events, dt)` 시그니처 고정(`GameCore`) |
| `game:state` 봉투 | ✅ 재사용 | 투영본 투명 전달, `G4View` 타입만 추가 |
| match/round 생명주기 | ✅ 재사용 | 결과는 `GameResult` 공통 |
| **새로 구현** | ⛳ `shared/`에 `GameCore` 1개 | `create`/`step` 순수 로직 |
| **새로 구현** | ⛳ 클라 렌더러 1개 | `render4(ctx, state, w, h)` — **4인자**(`registry.ts:15` `GameDef.render` 계약, `w=CANVAS_W=800`, `h=CANVAS_H=450`) |
| **새로 구현** | ⛳ 레지스트리 1줄 + 투영 함수 1개 | `GAMES['4']={…}`, `projectG4(state)→G4View` |

→ **전송 코드는 0줄 수정.** 이것이 사용자 통찰의 실제 이득이며, game-lab이 이미 그 구조로 구현돼 있음이 근거다.

---

<a id="s1"></a>
## §1 인증·세션·프로필 (그룹①, REST)

### 1.1 네임스페이스·쿠키 규약

| 구분 | 규약 |
|---|---|
| REST 경로 | `/auth/*` = 브라우저 top-level 내비게이션(OAuth 302 왕복)만 · `/api/*` = 그 외 전부(XHR/fetch, JSON) |
| 인증 | 서버 세션 스토어 키를 담는 **opaque 쿠키**(JWT 금지, `TECH_STACK.md`). 유저/admin 쿠키 이름이 달라 동시 로그인 가능 |

| 쿠키 | 값 | 속성 |
|---|---|---|
| `mp_session` | 유저 세션 id(opaque) | `HttpOnly; Secure(prod); SameSite=Lax; Path=/; Max-Age=<세션수명>` |
| `mp_admin` | admin 세션 id(유저와 독립) | `HttpOnly; Secure(prod); SameSite=Lax; Path=/` |
| `mp_oauth_state` | OAuth state+PKCE 임시 | `HttpOnly; Secure(prod); SameSite=Lax; Max-Age=600; Path=/auth` |

`SameSite=Lax` 이유: 구글 콜백은 top-level GET이라 `Lax`면 쿠키가 실려 오고(`Strict`면 유실), 크로스사이트 fetch POST엔 안 실려 CSRF 1차 방어. 상태변경 REST(`POST/PATCH/DELETE`)+소켓 핸드셰이크는 추가로 `Origin`/`Host` 화이트리스트 검증.

**에러 규약(REST 동기 실패)** — HTTP 상태 + 바디 `{ "error": { "code":"STRING_CODE", "message":"사람용" } }`:

| 상태 | code 예 | 상황 |
|---|---|---|
| 400 | `VALIDATION` | 필드 누락/형식오류 |
| 401 | `UNAUTHENTICATED` | 세션 없음/만료 |
| 403 | `CSRF`/`FORBIDDEN` | Origin 불일치/권한없음 |
| 404 | `NOT_FOUND` | 리소스/방코드 없음 |
| 409 | `ALREADY_ONBOARDED`/`NICKNAME_TAKEN` | 상태·유니크 충돌(`nickname` UNIQUE, `schema.prisma:45`) |
| 413/415 | `IMAGE_TOO_LARGE`/`UNSUPPORTED_MEDIA` | 업로드 용량/MIME |
| 429 | `RATE_LIMITED` | 남용 방지 |
| 502 | `OAUTH_UPSTREAM` | 구글 토큰 교환 실패 |

### 1.2 엔드포인트

**`GET /auth/google/login`** — OAuth 시작
```
(브라우저 top-level, 바디 없음)
→ 302 Location: https://accounts.google.com/o/oauth2/v2/auth?client_id=..&redirect_uri=..
        &response_type=code&scope=openid%20email%20profile&state=<rand>&code_challenge=<pkce>&code_challenge_method=S256
   Set-Cookie: mp_oauth_state=<rand>; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/auth
```

**`GET /auth/google/callback`** — code 교환·세션 발급
```
[GET /auth/google/callback?code=<auth_code>&state=<rand>]  Cookie: mp_oauth_state=<rand>
→ (state 검증 → code→토큰 교환 → 구글 프로필 획득)
   신규(app_user 없음): 세션에 구글프로필 보관(PENDING_ONBOARDING), 302 → /onboarding
   기존 유저: mp_session 발급, 302 → /
   Set-Cookie: mp_oauth_state=; Max-Age=0; Path=/auth
에러: state 불일치 → 403 CSRF · 토큰 교환 실패 → 502 OAUTH_UPSTREAM
```
> **`app_user` 생성 시점.** `nickname`이 NOT NULL+UNIQUE(`schema.prisma:45`)라 콜백 시점엔 확정 닉네임이 없어 곧바로 INSERT하기 애매하다. 구현 선택은 §4.6에 둘: (a) 구글 프로필을 `PENDING_ONBOARDING` 세션에 담아 **온보딩 제출 시 INSERT**, 또는 (b) 콜백 때 임시 닉네임으로 INSERT 후 온보딩에서 UPDATE. **정확한 채택은 (미확정)** — 어느 쪽이든 "가입=INSERT / 닉네임확정=쓰기"의 2단계.

**`GET /api/me`** — 현재 세션 상태(항상 200)
```jsonc
{ "status": "ANON" | "PENDING_ONBOARDING" | "USER",  // 서버가 세션으로 판별
  "user": {                                          // status=USER 일 때만
    "id": "1024",                                    // app_user.id (BigInt→string)
    "nickname": "종혁",                              // app_user.nickname (UNIQUE)
    "email": "forgotmypasswrd044@gmail.com",         // app_user.email
    "imageUrl": "https://cdn../pfp/abc.webp",        // uploaded_image_key→R2 URL, 없으면 google_image_url
    "hasUploadedImage": true,                        // uploaded_image_key != null
    "group": { "id": "3", "name": "1분반" } | null   // group_id 조인(nullable)
  } | null }
```

**`GET /api/groups`** — 분반 목록(공개): `{ "groups": [ { "id":"3", "name":"1분반", "isPublic":true } ] }`

**`POST /api/onboarding`** — 닉네임+분반 제출
```jsonc
// 요청
{ "nickname": "종혁",   // 필수, 1~50자 (VarChar(50) UNIQUE)
  "groupId": "3" }      // 선택(nullable). 무소속 허용
// 200 → GET /api/me 와 동일한 { status:"USER", user }
// 에러: 409 NICKNAME_TAKEN · 409 ALREADY_ONBOARDED · 400 VALIDATION · 404 NOT_FOUND(groupId)
```

**`PATCH /api/me`** — 닉네임 변경 `{ "nickname":"새닉" }` → 200 me. 충돌 409 `NICKNAME_TAKEN`.

**`POST /api/me/profile-image`** (multipart, field `image`)
```
서버: sharp로 256² webp 리사이즈+EXIF 제거 → R2 PUT → app_user.uploaded_image_key 갱신
→ 200 { "imageKey":"pfp/1024_abc.webp",  // R2 오브젝트 키(DB 저장값)
        "imageUrl":"https://cdn../pfp/1024_abc.webp" }
에러: 413 IMAGE_TOO_LARGE · 415 UNSUPPORTED_MEDIA · 401 UNAUTHENTICATED
```
> 원본 바이트는 **R2에만**, DB엔 **키만**(`uploaded_image_key`, `schema.prisma:47`). 클라는 URL만 받는다.

**`DELETE /api/me/profile-image`** → `uploaded_image_key=null` → 이후 `google_image_url` 사용 → 200 me.

**`POST /api/auth/logout`** → 200 `{}` + `Set-Cookie: mp_session=; Max-Age=0; Path=/`

**`POST /api/admin/login` / `POST /api/admin/logout`** (유저와 독립)
```jsonc
// [POST /api/admin/login]  { "loginId":"root", "password":"…" }  → admin_account.login_id / bcrypt(pw_hash)
// 200 {} + Set-Cookie: mp_admin=<sid>; HttpOnly; Secure; SameSite=Lax; Path=/
// 에러: 401 BAD_CREDENTIALS
```

**재접속(v1).** 복구 없음. 소켓이 끊기면 진행 중 매치는 상대에게 `match:aborted` 통지 후 종료(`TECH_STACK.md` §4.3). 인메모리 방/매치 소실.

---

<a id="s2"></a>
## §2 로비·방·매칭 (그룹②, Socket.IO)

### 2.1 핸드셰이크 인증 & 소켓 에러 규약

소켓은 REST와 **같은 쿠키**로 인증한다. `io` 미들웨어가 핸드셰이크의 `mp_session`을 검증:
- `USER` 세션 → 연결 허용, `socket.data.userId`/`nickname` 주입.
- `ANON`/`PENDING` → `connect_error` (payload `{ code:'UNAUTHENTICATED' }`).
- `io` 서버 `cors.origin`을 허용 도메인으로 고정, `credentials:true`. 클라 `io(url,{withCredentials:true})`.

**소켓 동기 실패** = Socket.IO **ack 콜백**으로 반환(요청형 `room:*`/`queue:*`):
```ts
type Ack<T> = { ok: true; data: T } | { ok: false; code: string; message: string }
// 예) socket.emit('room:join', { code }, (ack: Ack<RoomSnapshot>) => { ... })
```
**소켓 비동기 실패**(내가 트리거 안 한 변화) = push: 로비 `lobby:error`, 인게임 무효입력 `game:reject`, 매치 중단 `match:aborted`, 저장실패 `match:error`.

연결 성공 즉시:
```jsonc
// [S→C] lobby:hello
{ "me": { "id":"1024", "nickname":"종혁", "imageUrl":"…" }, "reconnect": false }  // v1 항상 false
```

### 2.2 방 인메모리 객체 (서버 소유, DB 미저장)

```ts
type Role = 'P1' | 'P2'
type RoomStatus = 'waiting' | 'in_match'

interface RoomMember {
  userId: string        // app_user.id
  nickname: string      // 표시용 캐시
  socketId: string      // 현재 소켓 (RoomSnapshot에는 미포함)
  role: Role            // 역할 배정(§2.4)
  ready: boolean        // room:ready 토글
}
interface RoomConfig {
  gameId: 1 | 2 | 3     // Game.id (schema: TinyInt 고정)
  rounds: number        // 방장 설정. v1 기본 1 (멀티라운드는 (미확정))
  // roundSeconds는 v1 무시 — 코어가 GAME_DURATION=10 상수 사용 → (미확정)
}
interface Room {
  code: string          // 서버 발급 숫자 문자열 = Socket.IO room 키
  hostUserId: string    // 방장(설정·시작 권한)
  status: RoomStatus
  config: RoomConfig
  members: RoomMember[]  // 최대 2
  matchId?: string       // status=in_match 일 때 현재 매치 런타임 상관키
}
```

### 2.3 코드방 이벤트 (요청형은 ack 반환)

```ts
// [C→S] room:create   { gameId, rounds? }  → ack Ack<RoomSnapshot>   생성자=host=P1(기본)
// [C→S] room:join     { code }             → ack Ack<RoomSnapshot> | {ok:false, code:'ROOM_FULL'|'NOT_FOUND'}
// [C→S] room:configure{ gameId?, rounds? } → 방장만. 변경 후 room:state 브로드캐스트
// [C→S] room:ready    { ready:boolean }     → 내 ready 토글
// [C→S] room:start                          → 방장만. 2명·양쪽 ready 시 매치 개시(§0.4)
// [C→S] room:leave                          → 퇴장. 남은 1인에게 room:state / 진행중이면 match:aborted
```
```jsonc
// [S→C] room:state  (방 변경 시마다 브로드캐스트 = 단일 정본. RoomSnapshot과 동일 구조, socketId 제외)
{ "code": "48213", "status": "waiting", "hostUserId": "1024",
  "config": { "gameId": 3, "rounds": 1 },
  "members": [
    { "userId":"1024", "nickname":"종혁", "role":"P1", "ready":true },
    { "userId":"2048", "nickname":"상대", "role":"P2", "ready":false }
  ] }
```

**`GET /api/rooms/:code`** (선택) — 입장 전 코드 사전검증. 404 `NOT_FOUND` / 200 `{ code, status, config, memberCount }`.

### 2.4 P1/P2 역할 배정 규칙 (게임2 비대칭 때문에 중요)

게임2는 **P1=발사자(공격), P2=회피자(HP 3)** 로 완전 비대칭(`game2/logic.ts`). 게임1/3은 대칭.
- **기본:** 방장=P1, 입장자=P2 (코드 표기 P1=Q/W, P2=U/I와 일치).
- **게임2 공정성(제안):** 매치가 여러 라운드면 라운드마다 역할 스왑, 최종은 "역할 무관 승수"로 집계. **정확한 스왑 정책은 (미확정).**
- 배정된 `role`은 서버 인메모리에만 존재하며 인게임 입력에서 클라가 위조 불가(§0.2 재기입).
- **불변식:** 매칭 시 배정된 역할 = DB 컬럼. **P1=`player1_id`, P2=`player2_id`.** 종료 INSERT까지 이 대응은 뒤바뀌지 않는다(§4.3).

### 2.5 빠른시작 큐

```ts
// [C→S] queue:join   { gameId }   → 서버 인메모리 대기열 push
// [C→S] queue:leave
// [S→C] queue:waiting { position }                    // 대기중(선택적 순번)
// [S→C] queue:matched { roomCode, role, opponent }    // 같은 gameId 2명 매칭 → 방 자동생성 → 곧 match:start
```
> 큐도 **게임별**(같은 `gameId` 2명이 차면 방 생성). 이후 흐름은 코드방과 동일하게 `match:start`로 합류.

---

<a id="s3"></a>
## §3 인게임 — 게임별 JSON 상태 스키마 (그룹③)

> 이벤트는 §0의 `game:state`(투영 `state`)를 그대로 쓴다. 아래는 각 게임 **권위 전체 상태(코드 원본)**와 그중 **전송되는 투영(`G*View`)**·**비전송 필드·이유**를 정확히 규정한다.
> `render{1,2,3}.ts`가 실제로 읽는 필드를 코드로 확인해 "S→C 전송?" 열을 채웠다(비전송=렌더 미소비 + 치팅/정보우위 방지).

### 3.1 게임1 — `Game1State` (숫자 맞추기 · 누적 속도 게이지)

`game1/logic.ts`. **`seed` 없음 — `create`에서만 rand 사용 → step 완전 결정적.** 숨은 랜덤은 `p1Rate/p2Rate`(42~88) 둘뿐.

```ts
// game1/logic.ts:36-53 (원본)
export interface Game1State {
  target: number            // 맞출 목표 1~1000
  p1: number; p2: number    // 현재 숫자(실수)
  p1Rate: number; p2Rate: number     // 기본 속도(42~88, create 랜덤) — 숨김
  p1Down: boolean; p1Up: boolean; p2Down: boolean; p2Up: boolean  // 키 홀드
  p1Gauge: number; p2Gauge: number   // 속도 게이지 0~100 누적형(keydown +30%p, 항상 sqrt 감쇠)
  p1Hold: number; p2Hold: number     // 손 떼고 타겟 정지-유지 누적(초), ≥1=승
  elapsed: number; result: GameResult
}
```

| 필드 | 타입 | 의미 | 렌더/판정 | S→C 전송? |
|---|---|---|---|---|
| `target` | number(1~1000) | 맞출 목표 | 렌더+판정 | ✅ |
| `p1`/`p2` | number(1~1000) | 현재 숫자(렌더는 `Math.round`) | 렌더+판정 | ✅ |
| `p1Rate`/`p2Rate` | number(42~88) | 게이지 30%p일 때 속도(`speed=rate×gauge/30`). `create` 랜덤 | **판정만** (render1 미소비) | ❌ 숨김 |
| `p1Down`/`p1Up`/`p2Down`/`p2Up` | boolean | 방향 홀드(Q−/W+, U−/I+) | **판정만** (render1 미소비) | ❌ |
| `p1Gauge`/`p2Gauge` | number(0~100) | 속도 게이지 누적 | 렌더(바)+판정 | ✅ |
| `p1Hold`/`p2Hold` | number(초) | 정지-유지 누적. `≥1` 즉시 승 | 렌더(HOLD 바)+판정 | ✅ |
| `elapsed` | number(초) | 경과. `≥10` 종료 시 근접 판정 | 렌더+판정 | ✅ |
| `result` | GameResult | 최종 승패 | 판정 | ✅ |

**투영 `G1View`** = `Pick<Game1State, 'target'|'p1'|'p2'|'p1Gauge'|'p2Gauge'|'p1Hold'|'p2Hold'|'elapsed'|'result'>` (9필드). `render1.ts`가 `rate/down/up`을 읽지 않음을 코드로 확인 → 제거 무손실.

```jsonc
// [S→C] game:state (게임1)
{ "matchId":"m_9f3a2c", "round":1, "seq":148,
  "state": { "target":617, "p1":403, "p2":588,   // p1/p2 정수 반올림(렌더가 어차피 round)
             "p1Gauge":84, "p2Gauge":13, "p1Hold":0, "p2Hold":0.34,
             "elapsed":6.20, "result":null } }
```
크기 ≈ 150~200 B/스냅샷. 20~30Hz면 4~6 KB/s. **전체 스냅샷으로 충분**(델타 오히려 오버헤드).

### 3.2 게임2 — `Game2State` + `Bullet[]` (로켓 피하기 · 비대칭 HP)

`game2/logic.ts`. `create`가 `seed`(uint32)를 뽑고(`:92`), `step`의 W 발사 분기에서 내장 LCG `nextRand(seed)`로 탄 속도/지터를 뽑으며 `seed` 갱신(`:111-117`). 논리 캔버스 **800×450**.

```ts
// game2/logic.ts:37-59 (원본)
export interface Bullet { x:number; y:number; vx:number; vy:number; bounces:number }
export interface Game2State {
  elapsed:number; result:GameResult
  launcherX:number; launcherDir:1|-1      // P1 발사대(좌우 스캔, Q=방향반전)
  p2Speed:number                          // P2 이동속도(create 랜덤 1380~1760) — 숨김
  p2X:number; leftHeld:boolean; rightHeld:boolean   // U/I 홀드 이동
  rockets:Bullet[]; cooldown:number       // W 3방향 부채꼴(쿨 0.25s), 측벽 1회 반사
  seed:number                             // LCG PRNG 내부상태 — ★비전송
  hp:number; iframes:number               // P2 체력 3 / 피격 시 무적 0.45s
}
```

| 필드 | 타입 | 의미 | 렌더/판정 | S→C 전송? |
|---|---|---|---|---|
| `elapsed` | number(초) | 경과. `≥10` → P2 생존승 | 렌더+판정 | ✅ |
| `result` | GameResult | HP 0→`'P1'`, 10초 생존→`'P2'` | 판정 | ✅ |
| `launcherX` | number(px) | 발사대 x(스캔) | 렌더+판정 | ✅ |
| `launcherDir` | `1\|-1` | 스캔 방향(Q 반전) | 렌더+판정 | ✅ |
| `p2Speed` | number(1380~1760) | P2 이동속도. `create` 랜덤 | **판정만** (render2 미소비) | ❌ 숨김 |
| `p2X` | number(px) | P2 위치 | 렌더+판정 | ✅ |
| `leftHeld`/`rightHeld` | boolean | U/I 홀드 | **판정만** (render2 미소비) | ❌ |
| `rockets` | `Bullet[]` | 발사된 로켓 | 렌더+판정 | ✅(부분) |
| `cooldown` | number(초) | 발사 쿨 잔량(0=발사가능) | 렌더(쿨바)+판정 | ✅ |
| `seed` | number(uint32) | **LCG PRNG 내부상태** | **판정만** | ❌ **★비전송** |
| `hp` | number(0~3) | P2 체력 | 렌더(하트)+판정 | ✅ |
| `iframes` | number(초) | 무적 잔여(피격 0.45s) | 렌더(깜빡임)+판정 | ✅ |

**`Bullet` 필드별:**

| 필드 | 타입 | 의미 | 렌더/판정 | 전송? |
|---|---|---|---|---|
| `x`/`y` | number(px) | 탄 위치 | 렌더+판정 | ✅ |
| `vx`/`vy` | number(px/s) | 속도. 렌더가 `atan2(vy,vx)`로 로켓 회전각 계산(`render2.ts:63`) | 렌더(각)+판정(이동) | ✅ |
| `bounces` | number(≤`MAX_BOUNCE`=1) | 측벽 반사 횟수 | **판정만** (render2 미소비) | ❌ 비전송 |

**`seed` 절대 비전송(치팅).** seed를 알면 상대 클라가 `nextRand`를 그대로 돌려 **아직 발사되지 않은 탄의 속도·부채꼴 분포를 미리 계산**해 완벽 회피할 수 있다. 판정은 오직 서버가 seed를 들고 수행.

**투영 `G2View`** — `seed/p2Speed/leftHeld/rightHeld` 제거, `rockets`는 `{x,y,vx,vy}`만(`bounces` 제거):

```jsonc
// [S→C] game:state (게임2)
{ "matchId":"m_9f3a2c", "round":1, "seq":84,
  "state": { "elapsed":4.10, "result":null,
             "launcherX":512, "launcherDir":-1, "p2X":301,
             "rockets":[ {"x":211,"y":180,"vx":-120,"vy":690},
                         {"x":540,"y":96,"vx":260,"vy":641} ],
             "cooldown":0.12, "hp":2, "iframes":0.31 } }
```
크기(게임2가 최대): 발사 쿨 0.25s → 초당 최대 12발, 체류 ~0.6~0.75s → 통상 **동시 9~18발** → 정수 반올림 시 **약 0.8~1.1 KB/스냅샷**, 20~30Hz면 16~33 KB/s.

### 3.3 게임3 — `Game3State` + `FencerState` + `feed[]` (펜싱 · 서지넉백)

`game3/core.ts`(팩토리 `makeGame3`) + `game3/logic.ts`(config). `create`가 `seed` 확보(`:149`), 이후 시동 딜레이·회피 스타일을 LCG로 뽑음. 시각 좌표 없음 — 위치는 정규화 `c`(`EDGE`·`HALF_GAP`). `+c`=P1 우세.

```ts
// game3/core.ts:61-111 (원본)
type DodgeStyle = 'lean'|'waist'|'split'
interface AttackWindow { press:number; start:number; end:number; resolved:boolean; riposte?:boolean }
interface DodgeWindow  { start:number; end:number; resolved:boolean; style:DodgeStyle }
interface G3FeedEvent  { kind:'hit'|'parry'|'whiff'; victim:'P1'|'P2'; t:number; mult?:number }
interface FencerState {
  attacks:AttackWindow[]; dodges:DodgeWindow[]
  attackCdUntil:number; dodgeCdUntil:number
  riposteUntil:number; combo:number
}
export interface Game3State {
  elapsed:number; result:GameResult
  c:number                 // 위치 균형(-EDGE~+EDGE 근사)
  p1:FencerState; p2:FencerState
  feed:G3FeedEvent[]       // 연출 이벤트(hit/parry/whiff, 1.2s 후 소멸)
  seed:number              // LCG PRNG — ★비전송 (core.ts:108)
  waterLevel:number        // 밀물 높이 flood(렌더용)
}
```

**`Game3State` 필드별:**

| 필드 | 타입 | 의미 | 렌더/판정 | 전송? |
|---|---|---|---|---|
| `elapsed` | number(초) | 경과(렌더의 "now" 기준) | 렌더+판정 | ✅ |
| `result` | GameResult | 낙사/10초 종료 시 `c` 부호로 판정 | 판정 | ✅ |
| `c` | number | 위치 균형. **선수 실제 위치 = `c ± HALF_GAP`(P1=`c−0.06`, P2=`c+0.06`)이며, 이 위치가 `effEdge`를 넘으면 해당 선수 낙사.** P1 낙사(→P2승): `c−HALF_GAP < −effEdge`, P2 낙사(→P1승): `c+HALF_GAP > effEdge`(`core.ts:281-288`). 두 임계값이 다르다. `effEdge`는 밀물로 시간 따라 축소. 범위는 `±EDGE` 근사(낙사 직전 스텝에서 `\|c\|`가 EDGE를 살짝 넘을 수 있음) | 렌더(선수 x)+판정 | ✅ |
| `p1`/`p2` | `FencerState` | 선수 상태 | 렌더+판정 | ✅(부분) |
| `feed` | `G3FeedEvent[]` | 최근 판정 연출(1.2s 후 소멸) | **렌더 전용** | ✅ |
| `seed` | number(uint32) | **LCG PRNG 내부상태** | 판정만 | ❌ **★비전송** |
| `waterLevel` | number | 밀물 높이 `flood`(=`EDGE−effEdge`). 렌더가 바다·낙사경고선 | **렌더 전용** | ✅ |

**`FencerState` 필드별:**

| 필드 | 타입 | 의미 | 렌더/판정 | 전송? |
|---|---|---|---|---|
| `attacks` | `AttackWindow[]` | 진행/최근 공격창 | 렌더+판정 | ✅(부분) |
| `dodges` | `DodgeWindow[]` | 진행/최근 회피창 | 렌더+판정 | ✅(부분) |
| `attackCdUntil` | number(초) | 공격 쿨 해제 **절대 게임시각**(`now≥값`이면 준비) | 렌더(쿨칩)+판정 | ✅ |
| `dodgeCdUntil` | number(초) | 회피 쿨 해제 절대시각 | 렌더(쿨칩)+판정 | ✅ |
| `riposteUntil` | number(초) | 리포스트(즉발 반격)창 마감 절대시각(`>now`면 열림) | 렌더(금색 링, `render3.ts:152`)+판정 | ✅ |
| `combo` | number(0~`COMBO_MAX`) | 연속 패링 콤보 단계 | 렌더+판정 | ✅ |

**`AttackWindow`/`DodgeWindow`/`G3FeedEvent`:**

| 필드 | 타입 | 의미 | 렌더/판정 | 전송? |
|---|---|---|---|---|
| `AttackWindow.press` | number(초) | 버튼 누른 시각 → windup 진행도 | 렌더+판정 | ✅ |
| `AttackWindow.start` | number(초) | 판정 시작(=press+시동딜레이 `STARTUP` 0.04~0.18) | 렌더+판정 | ✅ |
| `AttackWindow.end` | number(초) | 판정 끝(start+`ATTACK_DURATION` 0.06) | 렌더+판정 | ✅ |
| `AttackWindow.resolved` | boolean | 판정 처리 완료 플래그 | **판정만** | ❌ |
| `AttackWindow.riposte?` | boolean | 리포스트 발동 여부(넉백 배율용) | **판정만** | ❌ |
| `DodgeWindow.start` | number(초) | 회피 시작 → dodgePose | 렌더+판정 | ✅ |
| `DodgeWindow.end` | number(초) | 회피 끝(무적창 끝, +`DODGE_DURATION` 0.1) | 렌더+판정 | ✅ |
| `DodgeWindow.resolved` | boolean | 판정 처리 플래그 | **판정만** | ❌ |
| `DodgeWindow.style` | `'lean'\|'waist'\|'split'` | 회피 모션. **판정 무관, 순수 시각** | **렌더 전용** | ✅ |
| `G3FeedEvent.kind` | `'hit'\|'parry'\|'whiff'` | 연출 라벨 | 렌더 전용 | ✅ |
| `G3FeedEvent.victim` | `'P1'\|'P2'` | 대상(위치·색) | 렌더 전용 | ✅ |
| `G3FeedEvent.t` | number(초) | 발생 시각(=now). 페이드 `age=elapsed−t` | 렌더 전용 | ✅ |
| `G3FeedEvent.mult?` | number | 넉백 배율. **`hit` 이벤트에서 `mult>1.01`이면 주황(`#ff8a3d`)·확대 강조(`render3.ts:97-100`). `parry`/`whiff`는 `mult`를 담아 보내지만(코어가 항상 `surge` 포함, `core.ts:220`) 색/크기 강조엔 미반영** | 렌더 전용 | ✅ |

**`seed` 절대 비전송(치팅).** seed 유출 시 상대의 다음 공격 시동 딜레이(0.04~0.18 중 어느 값)를 미리 계산해 패링 타이밍을 완벽화할 수 있다. `resolved`/`riposte`는 렌더 미소비 + 전개 정보 유출 최소화로 비전송.

**`feed`는 `game:state`에 포함(별도 이벤트 아님).** 1.2s 뒤 자동 소멸하는 짧은 연출이고 렌더가 매 프레임 `s.feed`를 통째로 읽는다. 스냅샷에 넣으면 **자기완결적**이라 패킷 하나 유실돼도 다음 스냅샷이 자가 치유. 이벤트가 보통 0~4개라 중복 비용 무시 가능.

**투영 `G3View`** — `seed`, 공격창 `resolved/riposte`, 회피창 `resolved` 제거:

```jsonc
// [S→C] game:state (게임3)
{ "matchId":"m_9f3a2c", "round":1, "seq":210,
  "state": {
    "elapsed":7.35, "result":null, "c":0.184, "waterLevel":0.221,
    "p1": { "attacks":[ {"press":7.10,"start":7.19,"end":7.25} ],
            "dodges":[ {"start":7.30,"end":7.40,"style":"waist"} ],
            "attackCdUntil":7.28, "dodgeCdUntil":7.44, "riposteUntil":0, "combo":1 },
    "p2": { "attacks":[], "dodges":[],
            "attackCdUntil":7.05, "dodgeCdUntil":6.90, "riposteUntil":0, "combo":0 },
    "feed":[ {"kind":"parry","victim":"P2","t":7.25,"mult":1.3} ] } }
```
크기: 배열들이 `end>now−0.5`로 prune(`core.ts:273-276`), feed는 `<1.2s`만(`:279`) → **약 500~900 B/스냅샷**.
> `attackCdUntil` 등은 **절대 게임시각**이라 클라는 자기 스냅샷의 `elapsed`를 "now"로 삼아 그대로 비교(offset 재계산 불필요). `c`는 소수 3~4자리만 유효.

### 3.4 비전송 필드 규칙 (불변식) & 게임별 종합표

1. **`seed`·모든 rng 내부상태** → 절대 비전송(예측 치팅). game2/game3 `seed`.
2. **숨은 랜덤 능력치** → 비전송(정보 우위 차단). game1 `p1Rate/p2Rate`, game2 `p2Speed`.
3. **렌더 미소비 판정 내부 플래그·입력상태** → 비전송(대역폭·유출 최소화). game1 `p*Down/p*Up`, game2 `leftHeld/rightHeld/Bullet.bounces`, game3 `resolved/riposte`.
4. **와이어 반올림 허용** → 위치/게이지 등 렌더 전용 수치는 정수/소수 몇 자리로 반올림(덤 렌더라 의미 왜곡 없음 = 좋은 fallback). **단 서버 권위 상태는 풀 정밀도 유지.**

| 게임 | ✅ 보냄(렌더 소비) | ❌ 안 보냄(권위/치팅 방지) |
|---|---|---|
| **1** | `target, p1, p2, p1Gauge, p2Gauge, p1Hold, p2Hold, elapsed, result` | `p1Rate, p2Rate`, `p1Down/p1Up/p2Down/p2Up` |
| **2** | `launcherX, launcherDir, p2X, rockets[{x,y,vx,vy}], cooldown, hp, iframes, elapsed, result` | **`seed`**, `p2Speed`, `leftHeld/rightHeld`, `Bullet.bounces` |
| **3** | `c, waterLevel, p1/p2{attacks[{press,start,end}], dodges[{start,end,style}], attackCdUntil, dodgeCdUntil, riposteUntil, combo}, feed[], elapsed, result` | **`seed`**, `AttackWindow.resolved/riposte`, `DodgeWindow.resolved` |

원칙 한 줄: **"그리는 데 쓰는 것만 내려보내고, 판정에 쓰는 씨앗/능력치/내부 플래그는 서버에 가둔다."**

### 3.5 전체/델타 전송 전략 (게임별 종합)

| 게임 | 상태 크기 | 가변 배열 | 권장 전송 | 근거 |
|---|---|---|---|---|
| 게임1 | 극소(9 스칼라, ~180 B) | 없음 | **전체 스냅샷** | 델타가 오히려 오버헤드 |
| 게임2 | 중(~0.8~1.1 KB) | `rockets[]`(동시 9~18, 최악 40+) | **전체로 시작 → 부하 시 델타** | 배열이 커질 유일 케이스. 델타 도입 시 탄에 서버발급 `Bullet.id` 필요(현재 코드 없음) — **(미확정)** |
| 게임3 | 소(~0.5~0.9 KB) | `attacks/dodges/feed`(짧게 prune) | **전체 스냅샷** | 코어가 이미 `end>now−0.5`/`t<1.2`로 prune |

**JSON 채택 이유:** 상태가 이미 순수 TS 객체(`Game*State`)라 `JSON.stringify(project(state))` 한 줄로 직렬화되고, 클라는 `JSON.parse` 후 그대로 렌더러에 넘긴다(스키마 코드젠 불필요). Socket.IO 기본 인코딩과도 맞고, 최악(게임2) ~33 KB/s로 바이너리 최적화 불필요한 규모.

---

<a id="s4"></a>
## §4 DB 입출력 — 언제 무엇을 넣고 빼는가

> 근거: `schema.prisma`(정본 `docs/ERD.md`), game-lab 코어. `server/src`는 미구현이므로 아래 Prisma 코드는 **스키마에 근거한 제안 예시**(필드명·타입은 실제 스키마와 1:1).

### 4.1 대원칙 — DB는 "라이브"를 모른다

| 데이터 | 예시 | 저장 위치 | 이유 |
|---|---|---|---|
| 라이브 게임 상태 | `Game*State` 전체(`p1Gauge`,`rockets`,`hp`,`c`,`feed`,`seed`…) | **서버 RAM(권위)** | 초당 수십 step으로 변함. DB 쓰면 I/O 폭주·무의미 |
| 입력 이벤트 | `GameInputEvent{code,type,t}` | **서버 RAM(스텝 큐)** | 소켓으로만 흐름. 영속 대상 아님 |
| 신원/사전 | `AppUser`,`UserGroup`,`AdminAccount`,`Game` | **DB(읽기 위주)** | 매치 시작 시 로드 |
| 매치 최종결과 | `GameMatch` 1행 | **DB(종료 시 쓰기 1회)** | 유일하게 영속되는 "결과". 라운드/틱 상세 없음 |
| 감사·설정 | `MatchEditHistory`,`ScoreConfig` | **DB** | admin 편집/점수 가중치 |

> 한 줄: **"게임이 끝나야 비로소 DB에 한 줄이 생긴다."** 진행 중엔 DB를 건드리지 않는다.

### 4.2 매치 생명주기 × DB (a→d)

```
(a) 시작 전   ── SELECT ── app_user / user_group  (신원 로드, 읽기만)
(b) 진행 중   ── 무접촉 ── 서버 RAM에서 core.step 반복, DB 0회
(c) 종료 순간 ── INSERT ── game_match 1행         (결과 확정, 쓰기 1회)
(d) 조회      ── SELECT ── game_match 집계 + score_config  (리더보드/전적)
```

**(a) 시작 전 — 신원 로드:**
```ts
const [p1, p2] = await Promise.all([
  prisma.appUser.findUnique({
    where: { id: player1Id },                 // P1 역할 배정 유저
    select: { id:true, nickname:true, googleImageUrl:true, uploadedImageKey:true, groupId:true },
  }),
  prisma.appUser.findUnique({ where: { id: player2Id }, select: { /* 동일 */ } }),
])
// deletedAt(soft-delete) 유저는 매칭 큐 진입 단계에서 이미 where deletedAt:null 로 배제
```

**(b) 진행 중 — DB 무접촉:** `GAME_DURATION=10`초 동안 서버는 오직 RAM에서만 `create`→`step` 반복. game1은 step 완전 결정적, game2/game3은 `create`가 `seed`(uint32) 확정 후 내장 `nextRand`로만 뽑아 **초기 state(seed 포함)만 있으면 재현 가능**하지만, 그럼에도 DB엔 아무것도 안 쓴다.

### 4.3 결과 매핑 — `GameResult` → DB `MatchResult`

두 표기는 **다르다.** 반드시 매핑한다(`types.ts:10` vs `schema.prisma:22-26`).

| 코어 `state.result` | DB `MatchResult` | 처리 |
|---|---|---|
| `'P1'` | `P1_WIN` | INSERT |
| `'P2'` | `P2_WIN` | INSERT |
| `'DRAW'` | `DRAW` | INSERT |
| `null` | — | **INSERT 안 함**(미종료 = 결과 없음) |

```ts
import { MatchResult } from '@prisma/client'
import type { GameResult } from '@madpump/shared'   // types.ts

function toDbResult(r: GameResult): MatchResult {   // 유일한 매핑 지점
  switch (r) {
    case 'P1':   return MatchResult.P1_WIN
    case 'P2':   return MatchResult.P2_WIN
    case 'DRAW': return MatchResult.DRAW
    default:     throw new Error('cannot persist unfinished match (result=null)')
  }
}
```

**역할 매핑 불변식:** **P1 역할(Q/W) = `player1_id`, P2 역할(U/I) = `player2_id`.** 매칭 시 1회 고정(RAM room 객체)되어 종료 INSERT까지 뒤바뀌지 않는다. 따라서 `state.result==='P1'`이면 승자는 항상 `player1_id`.

### 4.4 INSERT + 방송 순서 (엄격)

**불변식: "커밋 성공 후에만 `match:end` 방송."** 클라가 보는 최종 결과와 DB가 100% 일치.

```ts
try {
  const match = await prisma.gameMatch.create({           // ← 커밋
    data: {
      gameId: room.config.gameId,     // Int @db.TinyInt (1|2|3)
      player1Id: room.player1Id,      // BigInt — P1(Q/W)
      player2Id: room.player2Id,      // BigInt — P2(U/I)
      result: toDbResult(state.result),
      // playedAt 생략 → @default(now()) (schema.prisma:91)
      // deletedAt 생략 → null (soft-delete 전용)
    },
    select: { id: true, playedAt: true, result: true },
  })
  io.to(room.code).emit('match:end', {                    // ← 커밋 이후에만
    matchId: room.matchId,                    // 런타임 상관키
    gameId: room.config.gameId,
    result: state.result,                     // 클라엔 코드표기('P1'/'P2'/'DRAW') 그대로
    wins: room.wins,
    players: { p1: {...}, p2: {...} },
    recordedMatchId: match.id.toString(),     // BigInt → string (JSON 안전)
    playedAt: match.playedAt.toISOString(),
  })
} catch (err) {
  io.to(room.code).emit('match:error', { matchId: room.matchId, code: 'RESULT_PERSIST_FAILED' })
  // 결과는 RAM에 남으므로 재시도 큐로 넘겨 at-least-once 저장 보장
}
```
- 단일 쓰기라 `$transaction` 불필요(통계 캐시 등 부수쓰기 생기면 그때 묶는다 — 도입 여부 (미확정)).
- **나쁜 fallback 금지:** INSERT 실패 시 "성공한 척" 방송하지 않는다. 정본(DB)이 비면 loud하게 `match:error`.

### 4.5 리더보드 / 등수 쿼리 (제안)

점수 = `ScoreConfig`(단일 행 id=1: `winPoints=3`,`drawPoints=1`,`lossPoints=0`, `schema.prisma:123-134`) × 전적. 한 유저가 `player1_id`/`player2_id` 어느 쪽에든 나오므로 **두 역할을 펼쳐(normalize)** 집계한다.

```sql
-- [분반별 리더보드] played CTE = 역할 펼침(3.1·3.2 공용). Prisma는 $queryRaw 권장.
WITH played AS (
  SELECT player1_id AS user_id, game_id,
         CASE result WHEN 'P1_WIN' THEN 'WIN' WHEN 'P2_WIN' THEN 'LOSS' ELSE 'DRAW' END AS outcome
  FROM game_match WHERE deleted_at IS NULL           -- soft-delete 제외
  UNION ALL
  SELECT player2_id AS user_id, game_id,
         CASE result WHEN 'P2_WIN' THEN 'WIN' WHEN 'P1_WIN' THEN 'LOSS' ELSE 'DRAW' END AS outcome
  FROM game_match WHERE deleted_at IS NULL
)
SELECT u.id, u.nickname, u.group_id,
       SUM(p.outcome='WIN')  AS wins,
       SUM(p.outcome='DRAW') AS draws,
       SUM(p.outcome='LOSS') AS losses,
       SUM(CASE p.outcome WHEN 'WIN' THEN cfg.win_points
                          WHEN 'DRAW' THEN cfg.draw_points
                          ELSE cfg.loss_points END) AS points
FROM played p
JOIN app_user u ON u.id = p.user_id AND u.deleted_at IS NULL
CROSS JOIN score_config cfg                          -- 단일 행(id=1)
WHERE u.group_id = :groupId
GROUP BY u.id, u.nickname, u.group_id
ORDER BY points DESC, wins DESC, losses ASC;         -- 동점 tie-break
```

```sql
-- [게임별 승률] ★ played CTE를 반드시 다시 포함(단독 실행 가능하게)
WITH played AS ( /* ↑ 위와 동일한 두 SELECT UNION ALL */ )
SELECT p.game_id, u.id, u.nickname,
       SUM(p.outcome='WIN') AS wins, COUNT(*) AS total,
       ROUND(SUM(p.outcome='WIN')/COUNT(*), 3) AS win_rate
FROM played p
JOIN app_user u ON u.id = p.user_id AND u.deleted_at IS NULL
GROUP BY p.game_id, u.id, u.nickname
ORDER BY p.game_id, win_rate DESC;
```
- 인덱스: `ix_match_p1(player1_id, played_at)`·`ix_match_p2(player2_id, played_at)`·`ix_match_played(played_at)`(`schema.prisma:100-102`)로 유저별/기간별 스캔 뒷받침. **`game_id` 단독 인덱스는 없음** → 게임별 대량 집계가 잦아지면 인덱스 추가 검토(제안).

### 4.6 인증/온보딩 쓰기 & admin

**최초 구글 로그인:** `google_sub`(unique)로 존재 판별, 없으면 INSERT.
```ts
const user = await prisma.appUser.upsert({
  where: { googleSub: profile.sub },     // uq_user_google
  update: { email: profile.email, googleImageUrl: profile.picture },
  create: {
    googleSub: profile.sub, email: profile.email,
    nickname: provisionalNickname(),     // ⚠ nickname NOT NULL+UNIQUE(:45) → 임시값 필요 (미확정 전략)
    googleImageUrl: profile.picture,
    // groupId 없음(nullable) — 온보딩에서 채움
  },
})
```
> `nickname` UNIQUE 제약 때문에 "가입=INSERT / 닉네임확정=UPDATE"가 2단계. 임시 닉네임 전략(예 `user_{id}`) vs PENDING 세션 보관 후 온보딩 INSERT — **(미확정, §1.2)**.

**온보딩:** `prisma.appUser.update({ where:{id}, data:{ nickname, groupId } })`. `nickname` 충돌 `P2002` → 400/409 `NICKNAME_TAKEN`. `groupId`는 `user_group.id` FK(`onDelete:Restrict`).

**admin 결과 수정 = UPDATE + 감사로그 INSERT(원자적):**
```ts
await prisma.$transaction([
  prisma.gameMatch.update({ where: { id: matchId }, data: { result: after } }),
  prisma.matchEditHistory.create({
    data: { matchId, adminId, beforeResult: before, afterResult: after },  // editedAt @default(now())
  }),
])
```

### 4.7 프로필 이미지 — 키만 DB, 바이너리는 R2

| 항목 | 위치 | 필드 |
|---|---|---|
| 업로드 이미지 **키** | DB | `AppUser.uploadedImageKey`(`VarChar(300)`, nullable, `:47`) |
| 업로드 이미지 **바이너리** | Cloudflare R2 | (DB에 없음) |
| 구글 기본 프로필 URL | DB | `AppUser.googleImageUrl`(`VarChar(500)`, nullable, `:46`) |

```ts
function resolveAvatar(u: { uploadedImageKey: string|null; googleImageUrl: string|null }) {
  if (u.uploadedImageKey) return r2PublicUrl(u.uploadedImageKey)  // R2 키 → URL(또는 presigned)
  if (u.googleImageUrl)   return u.googleImageUrl
  return null                                                     // 클라가 이니셜 아바타(좋은 fallback = "이미지 없음"을 정직히)
}
```
> R2 서빙 방식(퍼블릭 버킷 직접 URL vs presigned vs 서버 프록시)은 **(미확정)** — 인프라 결정 후 `r2PublicUrl` 구현.

### 4.8 경계 포맷 & 스키마 갭

| 경계 | 포맷 | 근거 |
|---|---|---|
| DB ↔ 서버 | **Prisma(SQL)** | 타입세이프 ORM, 위 예시 전부 |
| 서버 ↔ 클라 | **JSON**(Socket.IO payload / REST body) | `state.result` 등 직렬화, `BigInt`는 문자열화 |
| 앱 설정 포맷 | **(미확정)** — 스택 문서(`TECH_STACK.md`)에 미지정 | ~~YAML 전용~~ 근거 없음 → 검증된 두 경계만 단정 |

**스키마 갭 판단 — 최종결과만 남는다.** `GameMatch`는 `(gameId, player1Id, player2Id, result, playedAt)` 뿐.

| 게임 | 코어가 아는 것(RAM) | DB에 남는 것 | 버려지는 것 |
|---|---|---|---|
| game1 | `p1,p2,target,p1Gauge,p1Hold,elapsed` | `result`만 | 최종 근접차, 게이지, 정지유지시간 |
| game2 | `hp,iframes,rockets[],elapsed` | `result`만 | 최종 HP 잔량, 생존시간, 명중수 |
| game3 | `c,feed[],p1.combo,waterLevel,seed,elapsed` | `result`만 | 최종 `c`, `feed`, 콤보수, 밀물 |

**v1 판정: 충분하다.** 요구는 "온라인 매치 최종결과 1행"(ERD note #2)이고, 리더보드/승률(§4.5)은 `result`만으로 완전 계산된다. 상세 상태는 렌더 연출용(game3 `feed`는 1.2s 후 소멸)이라 영속 가치 낮음.

**확장은 '제안'만 (정본=ERD.md 먼저 갱신, 임의 변경 금지, `schema.prisma:1-4`):**
- 하이라이트/리플레이 필요 시 → `game_match_detail(match_id, payload JSON)` 별도 테이블 신설 제안.
- 리플레이는 game2/game3가 **`seed`(uint32)+`GameInputEvent[]`만으로 결정적 재현** 가능 → 저용량 리플레이(제안).

### 4.9 한눈 요약 (DB 트리거)

```
쓰기 트리거:
  1) 최초 구글로그인          → app_user  INSERT/upsert (google_sub 없을 때)
  2) 온보딩 완료              → app_user  UPDATE (nickname, group_id)
  3) 매치 종료(result≠null)   → game_match INSERT (커밋 후에만 match:end 방송)
  (admin) 결과 수정           → game_match UPDATE + match_edit_history INSERT (트랜잭션)
읽기 트리거:
  A) 매치 시작 전             → app_user/user_group SELECT (신원)
  B) 리더보드/전적/승률       → game_match 집계 × score_config (raw SQL, played CTE)
절대 규칙:
  · 라이브 state(gauge/hp/c/feed/seed…) DB 금지 — 서버 RAM 권위
  · result 매핑: 'P1'→P1_WIN / 'P2'→P2_WIN / 'DRAW'→DRAW / null→저장안함
  · player1_id=P1(Q/W), player2_id=P2(U/I) — 매칭 시 고정, 뒤바뀌지 않음
  · INSERT 커밋 성공 → 그제서야 match:end. 실패 시 match:error(가짜 성공 금지)
  · 경계: DB↔서버=Prisma/SQL, 서버↔클라=JSON, 앱 설정 포맷=(미확정)
```

---

<a id="open"></a>
## 열린 질문 (미확정 목록)

1. **게임2 역할 스왑 정책** (§2.4) — 라운드마다 스왑 vs 매치 고정, 홀수라운드 시작역할 결정 방식.
2. **멀티라운드(best-of-N)** (§0.4) — v1은 `totalRounds=1` 기본. `rounds>1` 집계 규칙·DB 최종결과 정의는 미정(코어엔 없는 오케스트레이션 개념).
3. **라운드 시간** (§0.5, §2.2) — 코어 `GAME_DURATION=10` 상수 vs 방장 설정값(현재 충돌).
4. **게임3 서버 틱 모델** (§0.5) — `TECH_STACK.md`의 "1초 틱 RPS"는 채택 코드(연속 서브프레임 0.06s 창)와 불일치 → 코드 기준 폐기 필요.
5. **`t` 권위화** (§0.2) — 클라 `t` clamp(코드 동작, v1 채택) vs 서버 도착시각 재계산.
6. **클라 로컬 키 바인딩/리매핑 UI** (§0.2) — 서버 재기입 규칙은 고정, 클라 표시/리매핑은 미정.
7. **게임2 델타 전송** (§3.5) — 도입 시 `Bullet.id`(서버발급) 필요(현재 코드 없음).
8. **최초 로그인 닉네임 전략** (§1.2, §4.6) — PENDING 세션 후 온보딩 INSERT vs 임시닉 INSERT 후 UPDATE.
9. **R2 서빙 방식** (§4.7) — 퍼블릭 URL vs presigned vs 서버 프록시.
10. **입력 `seq`/신뢰 재전송** (§0.2) — v1 미강제, 필요 시 추가.
11. **앱 설정 포맷** (§4.8) — 스택 문서 미지정(YAML 단정 근거 없음).
12. **통계 캐시 테이블** (§4.4) — 도입 시 INSERT를 `$transaction`으로 묶음.

---

<a id="roadmap"></a>
## 구현 로드맵

각 단계는 `step → verify: check` 형태로 검증 가능하게.

1. **shared 코어 이식** → `verify:` game-lab `shared/src/games/*`를 main `shared/`로 이식, 오프라인 97 tests 통과 유지.
2. **투영 함수 + View 타입** → `verify:` `projectG{1,2,3}(state)→G*View` 작성 후 `render{1,2,3}`가 View만으로 렌더됨을 타입체크 + 오프라인 재생으로 확인(seed/rate 없이 렌더 무손실).
3. **서버 권위 루프(단일 매치)** → `verify:` Fastify+Socket.IO에서 `round:start(create)→step 루프→game:state 브로드캐스트`를 봇 2개로 돌려 `result` 도달 확인.
4. **입력 재기입 + `t` clamp** → `verify:` P2가 `KeyQ` 주입 시 P1 조종 불가(재기입) + 위조 `t`가 틱창으로 clamp되는 유닛테스트.
5. **인증/세션(§1)** → `verify:` OAuth 왕복 → `mp_session` → `GET /api/me`가 `USER` 반환, 온보딩 INSERT.
6. **로비/방/큐(§2)** → `verify:` 2 클라 코드방 매칭 → `room:state` 정본 일치 → `match:start` role 개별 전달.
7. **결과 영속(§4)** → `verify:` `result≠null` → `game_match` INSERT 커밋 후에만 `match:end`, 실패 시 `match:error`(가짜 성공 없음).
8. **리더보드(§4.5)** → `verify:` played CTE 집계가 `score_config` 가중치와 일치, 분반/게임별 순위 스냅샷.
9. **디자인 시안 결합** → `verify:` design-lab UI(로그인/로비/매칭/게임선택/결과)를 위 API에 배선, 게임 캔버스만 `game:state` 덤 렌더로 교체.

<!-- notify: API·JSON·DB 통합 명세서 종합 완료 -->