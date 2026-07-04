# ARCHITECTURE — idea 02 "NEON COIN-OP" (madpump-idea-02)

> 정본 문서: 기능 = `design-lab/SPEC.md` / 시각 디자인 = 이 폴더의 `PLAN.md`.
> 게임 로직은 `@shared`(@madpump/shared) import — **재구현 절대 금지**.
> dev: `npm run dev -w madpump-idea-02` (포트 5102) / 검증: `npm run build`, `npm run typecheck`.

---

## 1. 파일 소유권 표

| 에이전트 | 소유 파일 (전체 교체 가능) |
|---|---|
| **auth** | `src/screens/MainLoggedOut.tsx`, `src/screens/Onboarding.tsx`, `src/modals/LoginRequired.tsx` |
| **lobby** | `src/screens/MainLoggedIn.tsx`, `src/screens/GameSelect.tsx`, `src/modals/Settings.tsx`, `src/modals/Online.tsx`, `src/modals/Matching.tsx` |
| **game1** | `src/screens/game/Game1.tsx`, `src/screens/game/ResultOverlay.tsx` |
| **game2** | `src/screens/game/Game2.tsx` |
| **game3** | `src/screens/game/Game3.tsx` |

**그 외 전부 아키텍트 소유 — 구현 에이전트 수정 금지** (import만):
`src/App.tsx`, `src/main.tsx`, `src/theme.css`, `src/debug.ts`, `src/state/*`, `src/components/*`,
`index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`.

- 화면 전용 스타일이 필요하면 **자기 소유 파일 옆에 css 파일을 새로 만들어** import (예: `src/screens/game/game1.css`). 공용 `theme.css`는 건드리지 않는다.
- `ResultOverlay`는 game1 에이전트 소유지만 **game2/game3도 그대로 import해서 사용**한다 (계약은 §3.4). game2/game3 에이전트는 ResultOverlay를 수정하지 말고 필요 사항은 game1 에이전트에게 요청.

## 2. 라우팅 (App.tsx — 수정 금지)

| 경로 | 화면 | 비고 |
|---|---|---|
| `/` | S1 `MainLoggedOut` 또는 S2 `MainLoggedIn` | 세션 게이트. `needsOnboarding`이면 `/onboarding`으로 |
| `/onboarding` | S5 `Onboarding` | 비로그인 접근 시 `/`로 리다이렉트 |
| `/select` | S8 `GameSelect` | 로그인 불필요 |
| `/game/1`·`/game/2`·`/game/3` | S9 / S10·S11 / S12 | |

모달 4종(S3·S4·S6·S7)은 App에 **상시 마운트** — 각 모달이 `flow.modal === '<id>'`를 보고 스스로 열림. 열기/닫기는 `openModal(id)` / `closeModal()`.
전역 스캔라인 오버레이(`.crt-overlay`)는 App이 1장 렌더 — 화면에서 중복 렌더 금지.

## 3. state API (아키텍트 소유 — import만)

### 3.1 `src/state/session.ts`

```ts
useSession(): SessionState                    // { loggedIn, nickname, groupName, needsOnboarding, user }
getSession(): SessionState                    // 비-React용 스냅샷
mockGoogleLogin(): Promise<'onboarding'|'main'>  // 0.5초 가짜 지연. 반환값 쪽으로 navigate
isNicknameTaken(name): boolean                // S5 중복 검증 ("test" + mock 유저명)
completeOnboarding(nickname, groupName): void // S5 확인 → 이후 navigate('/')
logout(): void                                // → 이후 navigate('/')
```

### 3.2 `src/state/flow.ts`

```ts
useFlow(): FlowState   // { mode, gameId, roundConfig, modal, roomCode, opponent,
                       //   phase, currentRound, roundResults, matchResult }
getFlow(): FlowState

// 설정 (S4)
setRoundConfig({ roundCount, timePerRoundSec })  // min 1 클램프 저장
getDefaultRoundConfig()                          // { roundCount: 3, timePerRoundSec: 60 }

// 모달
openModal('login-required'|'settings'|'online'|'matching') / closeModal()

// 온라인 (S6·S7)
createRoomCode(): string        // 11자리 숫자 생성 + flow.roomCode 저장
isValidRoomCode(code): boolean  // 숫자만 검증
cancelMatching(): void          // matching → online 복귀 (setTimeout 정리는 모달 책임)
matchFound(gameId?): GameId     // 봇 배정 + 매치 시작 + 모달 닫기 → navigate(`/game/${id}`)

// 오프라인 (S8)
startOfflineGame(gameId): void  // → navigate(`/game/${gameId}`)

// 라운드 진행 (게임 화면)
reportRoundEnd(result: MatchResult): void  // shared state.result 그대로. 마지막 라운드면
                                           // phase='match-result', 아니면 'round-result'
nextRound(): void               // 'round-result' → 'playing', currentRound+1
getRoundWins(flow): { P1, P2 }  // HUD 램프용 승수
exitMatch(): void               // 전부 초기화 → navigate('/')

// 표시
getPlayerDisplays(flow): { P1: PlayerDisplay, P2: PlayerDisplay }
// offline: "PLAYER 1"/"PLAYER 2" · online: 내 닉네임(isYou)+봇 닉네임
```

### 3.3 게임 화면 표준 배선 (S9~S12 공통)

```
mount → flow.gameId/phase 확인 (idle이면 startOfflineGame(n)으로 direct-URL 복구 허용)
      → state = createGameNState(...)   // roundConfig 반영: game1은 config 자체,
                                        // game2/3은 { roundDurationMs: timePerRoundSec*1000 }
      → attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, handler)  // @shared
루프   → tick/tickGame2/tickGame3 → setState + setDebugGame(state)    // 매 틱
result → reportRoundEnd(state.result) 1회 (라운드당 1회 가드)
       → <ResultOverlay />가 flow.phase 보고 표시
nextRound 감지 → flow.currentRound 변화 시 새 createGameNState(...)
unmount → 키보드 해제 + setDebugGame(null)
online 모드 → 봇이 P2 입력 대행 (게임별 간단 휴리스틱, 로직은 여전히 @shared 코어)
```

### 3.4 ResultOverlay 계약 (game1 소유, 전 게임 공용)

- `flow.phase === 'round-result'` → `result-overlay` + `result-text` + `btn-next-round`(→`nextRound()`)
- `flow.phase === 'match-result'` → `result-overlay` + `result-text` + `btn-back-main`(→`exitMatch(); navigate('/')`)
- 그 외 → null. 게임 화면은 `<ResultOverlay />`를 컨테이너 안에 넣기만 하면 된다.

### 3.5 debug 브리지 (`src/debug.ts` — QA 필수)

```ts
useDebugScreen('scr-game1')   // 화면 컨테이너 testid 문자열 — 각 화면 최상단에서 호출 (스텁에 포함됨)
setDebugGame(state | null)    // 게임 화면: 매 틱 호출, 이탈 시 null
// window.__MADPUMP__ = { screen, game, session } — session은 자동 동기화
```

## 4. 프리미티브 카탈로그 (`src/components` — import만, 사용법은 각 파일 주석)

| 컴포넌트 | 용도 (PLAN §1.5) |
|---|---|
| `Button` | 네온 보더 버튼. `variant`: `primary`(옐로)/`secondary`(시안)/`tertiary`(muted)/`danger`(에러). `coin`(¢ 아이콘), `arcadeFont`, `block` |
| `CoinButton` | 원형 네온 링 버튼 (설정 톱니 등). `label`(aria), `color` |
| `Card` | 표면 + 헤어라인 + 상단 마퀴 스트립(`marquee`, `marqueeColor`) + 코너 브래킷(`brackets`) |
| `Modal` | 오버레이+본체(브래킷+마퀴+sign-on). `open`, `onClose`(배경/ESC — 생략 시 안 닫힘), `testId`, `accentColor`, `width` |
| `Avatar` | 픽셀 아바타 사각. `colorIndex`(0~7, @shared 호환) 또는 `playerColor` 강제 |
| `LeaderboardTable` | HI-SCORE 테이블. **`lb-top3`/`lb-myrank` testid 내장**. `top3`(@shared LeaderboardEntry[]), `myRank?`. 빈 데이터 = "NO RECORD" |
| `PlayerBadge` | P1 시안/P2 핑크 칩. `you`(점멸 태그), `empty`(S7 "???" 빈 슬롯) |
| `KeyCap` + `useKeyLamp` | 온스크린 키캡(실제 배정 키 표기 — SPEC Q2). `lit` 점등, `useKeyLamp()`로 80ms 플래시 |
| `HudFrame` | 인게임 공통 HUD. **`hud-profile-p1`/`hud-countdown`/`hud-profile-p2` testid 내장**. 라운드 램프+YOU 태그+임박 점멸 자동 |

`theme.css` 유틸: `.font-arcade` `.font-display` `.glow-text` `.glow-box` `.c-*`(색 헬퍼)
`.anim-sign-on` `.anim-blink` `.anim-shake` `.anim-urgent` `.corner-brackets` `.crt-bezel(.urgent)`
`.vanish-grid(.dim)` `.marquee-strip` `.lamp(.lit)` `.neon-input(.error)` `.unit-chip`
— 토큰: `--bg --bg-raised --surface --surface-deep --text --text-muted --accent --accent2 --p1 --p1-dim --p2 --p2-dim --error --win --hairline`

## 5. data-testid 레지스트리 (전 시안 공통 — 반드시 준수)

| 분류 | testid | 위치 (소유 에이전트) |
|---|---|---|
| 화면 | `scr-main-out` | S1 MainLoggedOut (auth) — 스텁에 있음 |
| | `scr-main-in` | S2 MainLoggedIn (lobby) |
| | `scr-onboarding` | S5 Onboarding (auth) |
| | `scr-game-select` | S8 GameSelect (lobby) |
| | `scr-game1` / `scr-game2` / `scr-game3` | S9/S10·11/S12 (game1/2/3) |
| 모달 | `modal-login-required` | S3 (auth) — Modal `testId`로 지정 |
| | `modal-settings` / `modal-online` / `modal-matching` | S4/S6/S7 (lobby) |
| 버튼/입력 | `btn-online`, `btn-offline`, `btn-google-login`(S1과 S3 모달 양쪽), `btn-settings` | S1·S2 (auth/lobby) |
| | `btn-quickstart`, `btn-code-create`, `btn-code-join`, `input-code`, `room-code-display` | S6 (lobby) |
| | `btn-matching-cancel` | S7 (lobby) |
| | `input-nickname`, `btn-nickname-submit`, `err-nickname-dup` | S5 (auth) |
| | `btn-settings-save` | S4 (lobby) |
| | `btn-exit` | 인게임 좌상단 나가기 (game1/2/3 각자) |
| 인게임 | `hud-countdown`, `hud-profile-p1`, `hud-profile-p2` | HudFrame 내장 — 게임 화면이 HudFrame 사용 |
| | `game-stage` | CRT 베젤 스테이지 (game1/2/3 각자 — 스텁에 있음) |
| | `result-overlay`, `result-text`, `btn-next-round`, `btn-back-main` | ResultOverlay 내장 (game1) |
| 리더보드 | `lb-top3`, `lb-myrank` | LeaderboardTable 내장 — S2가 사용 |
| 게임 카드 | `card-game1`, `card-game2`, `card-game3` | S8 (lobby) |

## 6. 디버그 브리지 명세 (dev 전용, QA 자동화 필수)

```
window.__MADPUMP__ = {
  screen:  string,          // 현재 화면 컨테이너 testid ('scr-main-out' 등) — 화면 전환마다 갱신
  game:    object | null,   // 현재 게임의 최신 state (@shared 로직 state 그대로) — 게임 틱마다 갱신
  session: { loggedIn: boolean, nickname: string | null },  // 자동 동기화
}
```

구현은 `src/debug.ts`가 전담 — 화면은 `useDebugScreen(id)`, 게임은 `setDebugGame(state)`만 호출하면 된다.

## 7. @shared 핵심 import 요약

```ts
import {
  // 키보드 (SPEC 행10: playerL q/w = P1, playerR u/i = P2)
  DEFAULT_KEYBOARD_MAP, attachKeyboardAdapter, resolveKey,
  // 게임1: tick(state, InputFrame<Game1Action>, dtMs). key1=DECREMENT, key2=INCREMENT
  createGame1State, tick, game1ActionFromKey, GAME1_HOLD_TO_WIN_MS,
  // 게임2: tickGame2(state, Game2Inputs, dtMs). reduceGame2Inputs로 down/up → 스냅샷
  createGame2State, tickGame2, reduceGame2Inputs, GAME2_IDLE_INPUTS,
  // 게임3: tickGame3(state, Game3Action[], dtMs). q/u=ATTACK, w/i=DODGE. lastTick으로 연출
  createGame3State, tickGame3,
  // 리더보드/mock
  computeLeaderboard, mockUsers, mockMatches, mockGroups, scoreConfig,
} from '@shared';
```

주의: 게임2·3의 라운드 시간은 config의 `roundDurationMs`로 넣는다(`flow.roundConfig.timePerRoundSec * 1000`). 게임1은 `createGame1State(flow.roundConfig, Math.random)`.

## 8. 디자인 규칙 요약 (PLAN §1 — 구현 시 상기)

- P1=시안 `--p1` / P2=핑크 `--p2` **절대 고정**. 채움은 `--p1-dim`/`--p2-dim` + 2px 보더.
- 네온 절제: 화면당 발광 3군데 이하. `--accent`(옐로)는 "지금 눌러야 할 것" 하나에만.
- radius 0 기본 (키캡 6px, 코인 버튼 원형, CRT 베젤 12px만 예외). 하드 오프셋 섀도 금지 — 그림자는 전부 글로우.
- 점멸/플리커는 `steps()` — 부드러운 fade/pulse 금지. `prefers-reduced-motion` 대응은 theme.css가 처리.
- 글리치 연출은 승패 순간에만.
