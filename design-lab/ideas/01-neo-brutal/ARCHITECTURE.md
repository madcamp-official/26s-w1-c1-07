# ARCHITECTURE — madpump-idea-01 "Neo-Brutal Duel Arena"

> 정본 문서: 기능 = `design-lab/SPEC.md` (S1~S12 + QA 체크리스트) / 디자인 = `./PLAN.md`.
> 이 문서는 **구현 에이전트 5명을 위한 계약서**다. 여기 적힌 파일 소유권·API·testid를 위반하면 병렬 작업이 깨진다.

## 0. 명령어

```bash
cd design-lab && npm install            # 워크스페이스 루트에서 1회
npm run dev -w madpump-idea-01          # http://localhost:5101 (strictPort)
npm run build -w madpump-idea-01
npm run typecheck -w madpump-idea-01
```

## 1. 파일 소유권 (절대 준수)

| 담당 | 수정 가능한 파일 | 화면 |
|---|---|---|
| **auth 에이전트** | `src/screens/MainLoggedOut.tsx`, `src/screens/Onboarding.tsx`, `src/modals/LoginRequired.tsx` | S1, S5, S3 |
| **lobby 에이전트** | `src/screens/MainLoggedIn.tsx`, `src/screens/GameSelect.tsx`, `src/modals/Settings.tsx`, `src/modals/Online.tsx`, `src/modals/Matching.tsx` | S2, S8, S4, S6, S7 |
| **game1 에이전트** | `src/screens/game/Game1.tsx`, `src/screens/game/ResultOverlay.tsx` | S9 + 공용 결과 오버레이 |
| **game2 에이전트** | `src/screens/game/Game2.tsx` | S10·S11 |
| **game3 에이전트** | `src/screens/game/Game3.tsx` | S12 |

**그 외 전부 아키텍트 소유 — 구현 에이전트 수정 금지**:
`src/App.tsx`, `src/main.tsx`, `src/theme.css`, `src/debug.ts`, `src/components/*`, `src/state/*`,
`vite.config.ts`, `tsconfig.json`, `index.html`, `package.json`, `../../shared/*`(@madpump/shared).

- 각 스텁 파일 상단 주석에 구현할 기능 목록과 호출할 API가 적혀 있다 — 그대로 따르면 된다.
- 화면 고유 CSS는 자기 파일 안에서 해결(inline style 또는 컴포넌트 내 `<style>`). `theme.css` 추가 금지.
- **게임 로직 재구현 절대 금지** — `@shared`의 createGameNState/tick 계열만 사용.

## 2. 상태 API

### 2.1 `src/state/session.ts` (mock 세션, 메모리 전용 — localStorage 없음)

```ts
import { useSession, mockGoogleLogin, isNicknameTaken, completeOnboarding, logout } from '../state/session';

const session = useSession();
// { loggedIn, nickname, groupName, needsOnboarding, user: { id, avatarColorIndex } | null }

const dest = await mockGoogleLogin();   // 0.5초 지연. 'onboarding' → navigate('/onboarding')
                                        //             'main'       → navigate('/')
isNicknameTaken('test');                // true — S5 중복 에러 ("test" + mock 유저 이름들)
completeOnboarding('철수', '1분반');     // S5 확인 → navigate('/')  (게이트가 S2 렌더)
logout();                               // → navigate('/')  (게이트가 S1 렌더)
```

같은 메모리 세션 안에서 로그아웃 후 재로그인하면 'main'(기존 유저)으로 돌아온다.

### 2.2 `src/state/flow.ts` (진입 플로우 + 매치 진행)

```ts
import {
  useFlow, getFlow,                          // 구독 / 스냅샷
  openModal, closeModal,                     // modal: 'login-required'|'settings'|'online'|'matching'|null
  setRoundConfig, getDefaultRoundConfig,     // S4 (기본 3라운드/60초, min 1 클램프)
  createRoomCode, isValidRoomCode,           // S6 (11자리 숫자 코드)
  cancelMatching,                            // S7 취소 → modal 'online'
  matchFound,                                // 매칭 성사(mock): 봇 배정+매치 시작, gameId 반환
  startOfflineGame,                          // S8 카드 선택: 매치 시작
  reportRoundEnd, nextRound, exitMatch,      // 게임 화면의 라운드 사이클
  getRoundWins, getPlayerDisplays,           // HUD 표시용
} from '../state/flow';
```

`FlowState`: `{ mode, gameId, roundConfig, modal, roomCode, opponent, phase, currentRound, roundResults, matchResult }`
`phase`: `'idle' | 'playing' | 'round-result' | 'match-result'`

**플로우 시나리오 (누가 뭘 호출하나)**

| 순간 | 호출 | 담당 |
|---|---|---|
| S1/S2 온라인 버튼 | `loggedIn ? openModal('online') : openModal('login-required')` | auth/lobby |
| S3 로그인 성공 | `await mockGoogleLogin()` → `'main'`이면 `openModal('online')` (QA-S3-03), `'onboarding'`이면 `navigate('/onboarding')` | auth |
| S1/S2 오프라인 버튼 | `navigate('/select')` | auth/lobby |
| S1/S2 설정 버튼 | `openModal('settings')` | auth/lobby |
| S6 빠른 시작 / 코드 참가 | `openModal('matching')` | lobby |
| S6 코드 생성 | `createRoomCode()` → n초 후 `const id = matchFound(); navigate(\`/game/${id}\`)` | lobby |
| S7 성사 (connecting→waiting→성사) | `const id = matchFound(); navigate(\`/game/${id}\`)` | lobby |
| S7 취소 | `cancelMatching()` + 자기 setTimeout 전부 clear | lobby |
| S8 카드 클릭 | `startOfflineGame(n); navigate(\`/game/${n}\`)` | lobby |
| 게임: 라운드 종료 감지 (`state.result !== null`) | `reportRoundEnd(state.result)` — flow가 라운드 다승제/매치 종료 판정 | game* |
| ResultOverlay 다음 라운드 | `nextRound()` 후 새 `createGameNState(...)`로 라운드 재시작 | game* |
| 나가기(btn-exit)/메인으로(btn-back-main) | `exitMatch(); navigate('/')` | game* |

### 2.3 `@shared` (게임 로직 — import 전용, 재구현 금지)

```ts
// 게임1: createGame1State(flow.roundConfig, Math.random) → tick(state, {frame, elapsedMs, actions}, dtMs)
//        입력 변환: game1ActionFromKey(player, key)
// 게임2: createGame2State({ roundDurationMs: flow.roundConfig.timePerRoundSec * 1000 }, Math.random)
//        → reduceGame2Inputs(prev, actions) → tickGame2(state, inputs, dtMs). 렌더는 state.view 사용
// 게임3: createGame3State({ roundDurationMs: flow.roundConfig.timePerRoundSec * 1000 })
//        → tickGame3(state, actions, dtMs). 1초 틱 판정·마지막 입력 채택은 코어가 처리. 연출은 state.lastTick
// 키보드: attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, onInput)  // playerL q/w → P1, playerR u/i → P2
// 리더보드: computeLeaderboard(users, matches, scoreConfig), mockUsers, mockMatches, mockGroups
```

- 모든 게임 state는 `result: MatchResult | null` 필드로 라운드 종료를 알린다 → 그대로 `reportRoundEnd(state.result)`.
- **온라인 모드**(`flow.mode === 'online'`): 상대는 봇. 게임 에이전트가 P2 액션을 주기적으로 생성해 같은 tick에 밀어넣는다 (간단해도 됨 — 예: 게임1은 타겟 향해 초당 2~4회 증감, 게임2는 랜덤 회피/발사, 게임3은 랜덤 행동).
- 오프라인 모드: 키보드 2인 (q/w vs u/i). 역할 랜덤 배정(코인토스)은 라운드 시작 연출로만 표현해도 된다.

## 3. 프리미티브 카탈로그 (`src/components`)

`import { ... } from '../components';` (게임 화면은 `'../../components'`)

| 컴포넌트 | 용도 | 핵심 props |
|---|---|---|
| `Button` | 네오브루탈 버튼 | `variant: primary/secondary/danger/tertiary`, `size: sm/md/lg`, `data-testid` |
| `Card` | 3px 보더+6px 섀도 표면 (+검정 타이틀 스트립) | `title?`, `hero?`, `deco?` |
| `Modal` | 오버레이+타이틀바 모달. ESC/배경 닫기 | `open`, `title`, `onClose?`(생략=배경으로 안 닫힘), `testId`, `width?` |
| `Avatar` | 이니셜 원형 아바타 (palette 0~7) | `name`, `colorIndex`, `size?` |
| `Sticker` | 기울어진 라벨 스티커 | `tilt?`, `bg?`, `color?`, `fontSize?` |
| `Stamp` | WIN/LOSE/TOUCHÉ 판정 스탬프 (등장 애니 내장) | `tone: win/error/accent/p1/p2/ink`, `tilt?`, `fontSize?` |
| `KeyCap` | 온스크린 키캡 (눌림 피드백) | `side: P1/P2`, `keyChar`, `icon?`, `pressed?` |
| `PlayerBadge` | P1/P2 색 고정 플레이어 칩 (+YOU) | `side`, `name`, `avatarColorIndex?`, `isYou?` |
| `LeaderboardTable` | S2 리더보드 (lb-top3/lb-myrank 포함, 빈 상태 처리) | `top3`, `myNickname`, `myEntry` |
| `HudFrame` | **인게임 공통 HUD** — hud-profile-p1/p2, hud-countdown, game-stage, btn-exit, 키캡 열 전부 포함 | `p1`, `p2`, `timeRemainingMs`, `timeTotalMs?`, `roundWins`, `roundCount`, `currentRound`, `onExit`, `keyIcons?`, `pressedKeys?`, `children` |

- 게임 화면(S9~S12)은 **반드시 HudFrame으로 감싼다** — 인게임 testid 6종(hud-*, game-stage, btn-exit)이 여기서 나온다.
- `ResultOverlay`(game1 에이전트 소유, `src/screens/game/ResultOverlay.tsx`)는 game2/3도 import해 쓴다.
  props 계약: `{ kind: 'round'|'match', winner: PlayerRole|null, p1Name, p2Name, onNextRound?, onBackToMain }`
  — result-overlay / result-text / btn-next-round / btn-back-main testid를 책임진다. **시그니처 변경 금지.**
- theme.css 유틸 클래스: `.nb-box`, `.nb-box--sm`, `.nb-box--hero`, `.hazard`(해저드 스트라이프),
  `.title-strip`, `.nb-input`(`--error` 변형), `.lb-table`, `.blink-steps`, `.label-caps`, `.font-display`, `.font-mono`.
  CSS 변수: `--bg --surface --surface-sunken --ink --ink-muted --accent --highlight --p1 --p1-tint --p2 --p2-tint --error --win` (PLAN §1.1).

## 4. 라우팅 (App.tsx — 수정 금지)

| 경로 | 렌더 | 비고 |
|---|---|---|
| `/` | loggedIn ? S2 : S1 (needsOnboarding이면 `/onboarding`으로) | 세션 게이트 |
| `/onboarding` | S5 | 비로그인 시 `/`로 리다이렉트 |
| `/select` | S8 | 로그인 불필요 |
| `/game/1`,`/game/2`,`/game/3` | S9 / S10·S11 / S12 | 진입 전 `startOfflineGame`/`matchFound` 필요 |

모달 4종(S3·S4·S6·S7)은 App이 항상 마운트, `flow.modal` 값으로 개폐. 열기/닫기는 `openModal/closeModal`만 사용.

## 5. data-testid 레지스트리 (전 시안 공통 — QA 자동화가 이 id로 찾는다)

| 분류 | testid | 위치(담당) |
|---|---|---|
| 화면 | `scr-main-out` S1(auth) · `scr-main-in` S2(lobby) · `scr-onboarding` S5(auth) · `scr-game-select` S8(lobby) · `scr-game1` S9(game1) · `scr-game2` S10/11(game2) · `scr-game3` S12(game3) | 스텁에 이미 존재 — 유지 |
| 모달 | `modal-login-required` S3 · `modal-settings` S4 · `modal-online` S6 · `modal-matching` S7 | Modal `testId` prop — 스텁에 존재 |
| 버튼/입력 | `btn-online`, `btn-offline`, `btn-google-login`, `btn-settings` → S1(auth)·S2(lobby) 각자 / `btn-quickstart`, `btn-code-create`, `input-code`, `room-code-display`, `btn-matching-cancel` → lobby / `input-nickname`, `btn-nickname-submit`, `err-nickname-dup` → auth / `btn-settings-save` → lobby / `btn-exit` → HudFrame 제공 |
| 인게임 | `hud-countdown`, `hud-profile-p1`, `hud-profile-p2`, `game-stage` → HudFrame 제공 / `result-overlay`, `result-text`, `btn-next-round`, `btn-back-main` → ResultOverlay 제공 |
| 리더보드 | `lb-top3`, `lb-myrank` → LeaderboardTable 제공 |
| 게임 카드 | `card-game1`, `card-game2`, `card-game3` → S8(lobby) |

주의: `btn-google-login`은 S1과 S3 양쪽에 존재할 수 있다(같은 id 허용 — QA는 보이는 것을 클릭).
`btn-settings`는 S1·S2의 원형 톱니 버튼.

## 6. 디버그 브리지 (dev 전용, QA 필수 — `src/debug.ts`)

```ts
window.__MADPUMP__ = {
  screen:  string,        // 현재 화면 컨테이너 testid ('scr-main-out' 등)
  game:    object | null, // @shared 게임 state 그대로 (틱마다 최신)
  session: { loggedIn: boolean, nickname: string | null },
}
```

- `screen`: 각 화면의 `useDebugScreen('scr-...')`이 갱신 — **스텁에 이미 있으니 지우지 말 것.**
- `game`: 게임 에이전트가 **매 틱** `setDebugGame(state)` 호출, 라운드 재시작 시 새 state로, 언마운트 시 `setDebugGame(null)`.
- `session`: main.tsx의 `initDebugBridge()`가 sessionStore 구독으로 자동 갱신 — 신경 쓸 것 없음.

## 7. 완료 기준

각 에이전트는 자기 화면의 SPEC QA 체크리스트(QA-S*-*) 전 항목 + PLAN §2 해당 절의 레이아웃/연출을 구현한다.
제출 전: `npm run typecheck -w madpump-idea-01` && `npm run build -w madpump-idea-01` 통과 확인.
