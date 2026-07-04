# idea 05 OBSIDIAN PROTOCOL — 아키텍처 & 에이전트 계약

> 정본: 기능 = `design-lab/SPEC.md` / 비주얼 = `design-lab/ideas/05-obsidian/PLAN.md`.
> 게임 로직은 `@shared` import — **재구현 절대 금지**.
> dev: `npm run dev -w madpump-idea-05` (포트 5105, strictPort).
> 포트 정리는 반드시 `lsof -ti:5105 | xargs kill` — pkill/killall 광범위 사용 금지.

---

## 1. 파일 소유권 표

| 에이전트 | 소유(수정 가능) 파일 |
|---|---|
| **auth** | `src/screens/MainLoggedOut.tsx`, `src/screens/Onboarding.tsx`, `src/modals/LoginRequired.tsx` |
| **lobby** | `src/screens/MainLoggedIn.tsx`, `src/screens/GameSelect.tsx`, `src/modals/Settings.tsx`, `src/modals/Online.tsx`, `src/modals/Matching.tsx` |
| **game1** | `src/screens/game/Game1.tsx`, `src/screens/game/ResultOverlay.tsx` |
| **game2** | `src/screens/game/Game2.tsx` |
| **game3** | `src/screens/game/Game3.tsx` |

**그 외 파일은 전부 아키텍트 소유 — 구현 에이전트 수정 금지**:
`src/App.tsx`, `src/main.tsx`, `src/theme.css`, `src/debug.ts`, `src/state/*`, `src/components/*`,
`index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`.
(부족한 스타일은 인라인 style/컴포넌트 로컬로 해결한다. 공용 파일 변경이 꼭 필요하면 이 문서에 사유를 남기고 최소 diff로.)

### 크로스 에이전트 동결 계약 (시그니처 변경 금지)

- `Settings.tsx`의 `SettingsProps { open; onClose }` — **auth의 S1도 이 모달을 연다.**
- `ResultOverlay.tsx`의 `ResultOverlayProps` — **game2/game3이 import 한다.** (파일 상단 주석 참조)
- `LoginRequired.tsx`의 `LoginRequiredProps { open; onClose; onLoggedIn }` — auth 내부용이지만 App 분기와 맞물리므로 유지 권장.

---

## 2. 라우팅 (src/App.tsx — 수정 금지)

| 경로 | 화면 | 비고 |
|---|---|---|
| `/` | S1 `MainLoggedOut` 또는 S2 `MainLoggedIn` | 세션(loggedIn && user)으로 자동 분기 — 로그인/로그아웃 후 `navigate('/')`만 하면 됨 |
| `/onboarding` | S5 `Onboarding` | |
| `/select` | S8 `GameSelect` | |
| `/game/1` `/game/2` `/game/3` | S9 / S10·S11 / S12 | 모달(S3/S4/S6/S7)은 라우트 아님 — 화면 내부 state로 오픈 |

---

## 3. session API (`src/state/session.ts`)

메모리 전용(mock, localStorage 없음). React 구독은 `useSession()`.

```ts
useSession(): { loggedIn, onboarded, user: SessionUser | null }
loginWithGoogle(): Promise<'onboarding' | 'main'>
  // 0.5초 가짜 지연. 'onboarding' → navigate('/onboarding'), 'main' → navigate('/')
  // 로그아웃 후 재로그인은 프로필이 남아 있어 'main'
isNicknameTaken(name): boolean        // 'test' + mock 유저 닉네임 전부 (QA-S5-03)
completeOnboarding(nickname, 분반명): SessionUser  // 검증은 화면 책임, 성공 후 navigate('/')
logout(): void                         // → S1 (navigate('/') 필요 없음, / 에서 자동 분기)
selfAsMockUser(): MockUser | null      // 리더보드에 나를 포함시킬 때 (id 'me', 0전적)
groupMembers(): MockUser[]             // 내 분반 mock 유저들 (리더보드 풀)
```

S2 리더보드 조립 (lobby):

```ts
import { computeLeaderboard, mockMatches, scoreConfig } from '@shared';
const lb = computeLeaderboard([...groupMembers(), selfAsMockUser()!], mockMatches, scoreConfig);
<LeaderboardTable top3={lb.top3} myEntry={lb.entryOf('me')} />
```

## 4. flow API (`src/state/flow.ts`)

```ts
useFlow(): FlowState  // { settings, mode, gameId, opponent, roundIndex, roundResults, matchResult, pendingOnlinePanel }

// 설정 (S4) — QA-S4-06: 이 값이 모든 매치에 실제 반영
DEFAULT_ROUND_CONFIG                    // { roundCount: 3, timePerRoundSec: 60 } (SPEC Q1)
saveSettings({ roundCount, timePerRoundSec })  // 확인 버튼 (min 1 클램프)
  // "기본값" 버튼 = 모달 로컬 입력만 DEFAULT_ROUND_CONFIG로 리셋 (저장 안 함, 모달 유지)

// 매치 시작
startOfflineMatch(gameId)               // S8 카드 클릭 → navigate(gamePath(gameId))
startOnlineMatch(gameId?): GameId       // 매칭 성사 순간. 생략=랜덤 게임(Q8) + 봇 상대 배정
gamePath(gameId)                        // '/game/N'
ensureMatch(gameId)                     // 인게임 마운트 가드 (직접 URL 진입 → 오프라인 폴백)
isBotMatch(): boolean                   // 온라인(=봇 상대)이면 true → P2 봇 입력 구동

// 라운드 진행 (인게임 SN)
reportRoundResult(winner: 'P1'|'P2'|null): { matchOver, matchResult }
  // shared state.result 확정 순간 1회 호출 (result가 'DRAW'면 winner=null)
beginNextRound()                        // btn-next-round
resetFlow()                             // btn-back-main / btn-exit → navigate('/')
getScore(results?)                      // { p1Wins, p2Wins, draws } — HUD 핍/스코어 표기

// S3 → S6 연결 (QA-S3-03)
requestOnlinePanel()                    // auth: S3에서 로그인 성공(dest='main') 직후 호출
consumeOnlinePanelRequest(): boolean    // lobby: S2 마운트 시 확인, true면 Online 패널 즉시 오픈
```

인게임 표준 라운드 루프 (모든 게임 공통):

```
mount → ensureMatch(N) → 시작 카운트다운(3·2·1) → shared create*State(...)
  게임1: createGame1State({...settings}, Math.random)          // timeLimitMs 자동
  게임2: createGame2State({ roundDurationMs: settings.timePerRoundSec * 1000 }, Math.random)
  게임3: createGame3State({ roundDurationMs: settings.timePerRoundSec * 1000 })
→ rAF/interval 루프에서 tick / tickGame2 / tickGame3 + reportGame(state)
→ state.result 확정 → reportRoundResult(...)
→ ResultOverlay 표시 (matchOver=false → beginNextRound() 후 새 라운드 state 생성
                    / true → resetFlow() + navigate('/'))
→ unmount 시 reportGame(null) + 루프 정리
```

키 입력: `attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, onInput)` (@shared) — playerL q/w → 'P1', playerR u/i → 'P2'. 언마운트 시 반환된 해제 함수 호출.
온라인(봇) 모드: P2 입력을 봇 로직(각 게임 에이전트 재량, 간단해도 됨)으로 합성해 같은 액션 파이프에 주입.

## 5. 프리미티브 카탈로그 (`src/components` — 수정 금지, import만)

| 컴포넌트 | 용도 / 핵심 props |
|---|---|
| `Button` | variant `primary`(시안 발광)·`secondary`·`ghost`·`google`, `overline`(영문 상단행), `testId` |
| `Card` | 코너컷 패널. `overline`, `accent('p1'/'p2')`, `hoverable`, `testId` |
| `Modal` | 오버레이+blur+코너컷+발광 톱라인. `open`, `onClose`(ESC/배경), `closeOnBackdrop`, `topline('cyan'/'magenta')`, `overline`, `title`, `width`, `testId` |
| `Avatar` | 헥사곤 이니셜. `name`, `colorIndex`(MockUser.avatarColorIndex), `size`, `side('p1'/'p2' 진영 보더)` |
| `LeaderboardTable` | `top3`, `myEntry` — **lb-top3 / lb-myrank testid 자동 부착**, 빈 상태 내장 |
| `PlayerBadge` | HUD 프로필. `side`, `name`, `you`, `wins`, `totalRounds`, `testId`(hud-profile-p1/p2) |
| `KeyCap` | `[Q]` 키 칩. `label`, `desc`, `side`, `active`(실입력 점등) |

theme.css 유틸 클래스: `.overline` `.display`(스큐, 영문/숫자만) `.display-noskew` `.num`(tabular)
`.cornercut` `.cornercut-sm` `.hex` `.brackets`(코너 브래킷, `--bracket-color`)
`.screen` `.topbar` `.logotype` `.chip(--p1/--p2/--ok)` `.input(--error)` `.field-error`
`.count-pop`(카운트다운 펄스) `.heartbeat`(마지막 5초 명멸) `.dots`(대기 점멸) `.modal--warn`.

디자인 규칙 요약 (PLAN §1): P1=시안 `--p1` / P2=마젠타 `--p2` 절대 불변. 골드는 랭크 문맥 전용.
radius 금지(코너컷), 두꺼운 보더 금지(1px 발광), 스캔라인/글리치 금지, 한글 스큐 금지.

## 6. data-testid 레지스트리 (QA 자동화 — 전부 부착 필수)

| 구분 | testid | 위치(담당) |
|---|---|---|
| 화면 | `scr-main-out` `scr-main-in` `scr-onboarding` `scr-game-select` `scr-game1` `scr-game2` `scr-game3` | 스텁에 부착 완료 — 유지할 것 |
| 모달 | `modal-login-required` `modal-settings` `modal-online` `modal-matching` | 스텁의 Modal testId로 부착 완료 |
| S1/S2 | `btn-online` `btn-offline` `btn-google-login` `btn-settings` | auth·lobby |
| S5 | `input-nickname` `btn-nickname-submit` `err-nickname-dup` | auth |
| S6/S7 | `btn-quickstart` `btn-code-create` `btn-code-join` `input-code` `room-code-display` `btn-matching-cancel` | lobby |
| S8 | `card-game1` `card-game2` `card-game3` | lobby |
| 인게임 | `hud-countdown` `hud-profile-p1` `hud-profile-p2` `game-stage` `btn-exit` | game1/2/3 각자 |
| 결과 | `result-overlay` `result-text` `btn-next-round` `btn-back-main` | ResultOverlay가 부착 (game1 소유) |
| 리더보드 | `lb-top3` `lb-myrank` | LeaderboardTable이 자동 부착 |

## 7. 디버그 브리지 (`src/debug.ts` — dev 전용, QA 필수)

`window.__MADPUMP__ = { screen, game, session }`

- `screen`: 현재 화면 id 문자열 (`scr-*`). 모달은 screen을 바꾸지 않는다.
  → 각 화면 최상단의 `useScreenBridge('scr-xxx')`가 처리 (스텁에 이미 있음 — 지우지 말 것).
- `game`: 현재 게임의 최신 state(@shared state 그대로) or null.
  → 게임 화면이 **매 틱** `reportGame(state)`, 언마운트 시 `reportGame(null)`.
- `session`: `{ loggedIn, nickname }` — 세션 스토어에 자동 구독되어 있음. 손댈 것 없음.

## 8. 검증 명령

```bash
cd /Users/siheom-yong/programming/madpump/26s-w1-c1-07/design-lab
npm run typecheck -w madpump-idea-05   # tsc --noEmit (strict, noUnusedLocals)
npm run build -w madpump-idea-05
npm run dev -w madpump-idea-05         # http://localhost:5105
```
