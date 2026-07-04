# ARCHITECTURE — 루프 3 "Clay Toy Battle" (madpump-idea-03)

> 정본 문서: 기능 = `design-lab/SPEC.md` (S1~S12, QA 체크리스트) / 시각 = 이 폴더의 `PLAN.md`.
> 게임 로직은 `@shared`(`@madpump/shared`) import — **재구현 절대 금지**.
> dev 서버: `npm run dev -w madpump-idea-03` → http://localhost:5103

---

## 1. 파일 소유권 표 (병렬 작업 규약)

| 에이전트 | 소유(수정 가능) 파일 |
|---|---|
| **auth** | `src/screens/MainLoggedOut.tsx`, `src/screens/Onboarding.tsx`, `src/modals/LoginRequired.tsx` |
| **lobby** | `src/screens/MainLoggedIn.tsx`, `src/screens/GameSelect.tsx`, `src/modals/Settings.tsx`, `src/modals/Online.tsx`, `src/modals/Matching.tsx` |
| **game1** | `src/screens/game/Game1.tsx`, `src/screens/game/ResultOverlay.tsx` |
| **game2** | `src/screens/game/Game2.tsx` |
| **game3** | `src/screens/game/Game3.tsx` |

**그 외 전부 아키텍트 소유 — 구현 에이전트 수정 금지**:
`src/App.tsx`, `src/main.tsx`, `src/theme.css`, `src/debug.ts`, `src/components/*`, `src/state/*`,
`index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`.

- 자기 소유 파일 **옆에 전용 .css 파일을 새로 만드는 것은 허용** (예: `Game3.css`) — 단 전역 셀렉터(`body`, `:root` 등) 금지.
- 다른 에이전트 소유 파일 import는 허용되는 곳만: game2/game3 → `ResultOverlay` (props 계약 §4.3 유지 전제).
- 스텁 파일 상단 주석에 화면별 요구 testid·구현 힌트가 이미 적혀 있다.

---

## 2. 상태 API

### 2.1 session (`src/state/session.ts`) — mock 세션 (메모리 전용, localStorage 없음)

```ts
import { useSession, mockGoogleLogin, isNicknameTaken, completeOnboarding, logout } from '../state/session';

const session = useSession();
// { loggedIn, nickname, groupName, needsOnboarding, user: { id, avatarColorIndex } | null }

const dest = await mockGoogleLogin();   // 0.5초 가짜 지연 후 세션 생성
// 'onboarding' → navigate('/onboarding')  (최초 로그인)
// 'main'       → navigate('/')            (같은 세션에서 재로그인한 기존 유저)

isNicknameTaken('test')                 // true — S5 중복 에러 시나리오
completeOnboarding('철수', '1분반');     // S5 확인 → 이후 navigate('/')
logout();                               // → 이후 navigate('/') (S1으로 전환)
```

### 2.2 flow (`src/state/flow.ts`) — 게임 진입 플로우 + 매치 진행

```ts
import {
  useFlow, openModal, closeModal,                       // 모달
  setRoundConfig, getDefaultRoundConfig,                // S4 설정
  createRoomCode, isValidRoomCode, cancelMatching, matchFound, // S6·S7 온라인
  startOfflineGame,                                     // S8 오프라인
  reportRoundEnd, nextRound, getRoundWins, exitMatch,   // 라운드 진행
  getPlayerDisplays,                                    // HUD 표시용
} from '../state/flow';
```

`FlowState` 필드: `mode`(online/offline/null), `gameId`(1|2|3|null),
`roundConfig`({roundCount, timePerRoundSec} — 기본 3라운드/60초), `modal`(ModalId|null),
`roomCode`, `opponent`({nickname, avatarColorIndex, isBot}|null),
`phase`('idle'|'playing'|'round-result'|'match-result'), `currentRound`(1-based),
`roundResults`(RoundResult[]), `matchResult`(MatchResult|null).

**핵심 시나리오 (누가 뭘 호출하나)**:

| 상황 | 호출 |
|---|---|
| S1/S2 온라인 버튼 | `session.loggedIn ? openModal('online') : openModal('login-required')` |
| S3 모달 내 로그인 성공 | `await mockGoogleLogin()` → `needsOnboarding`이면 `navigate('/onboarding')`, 아니면 `openModal('online')` (QA-S3-03) |
| S1/S2 오프라인 버튼 | `navigate('/select')` |
| S1/S2/S6 톱니 | `openModal('settings')` |
| S4 확인 | `setRoundConfig({...}); closeModal()` / 기본값: 로컬 입력을 `getDefaultRoundConfig()`로 리셋만 |
| S6 빠른 시작 | `openModal('matching')` |
| S6 코드 생성 | `createRoomCode()` → n초 후 mock 입장 `matchFound()` + `navigate` (타이머 clear 책임은 모달) |
| S6 코드 입력 확인 | `isValidRoomCode(v)` 통과 → `openModal('matching')` |
| S7 성사(mock 타이머) | `const id = matchFound(); navigate(\`/game/${id}\`)` |
| S7 취소 | `cancelMatching()` (→ modal 'online') + 진행 중 setTimeout 전부 clear (QA-S7-05) |
| S8 게임 카드 | `startOfflineGame(n); navigate(\`/game/${n}\`)` |
| 게임: 라운드 종료 | `reportRoundEnd(state.result!)` — flow가 매치 종료(다승제, 동률 DRAW) 판정 |
| ResultOverlay 다음 라운드 | `nextRound()` → 게임 화면은 새 `createGameNState(...)` 생성 |
| 나가기(btn-exit)/메인 | `exitMatch(); navigate('/')` |

**HUD 표시**: `getPlayerDisplays(flow)` → `{ P1: {name, avatarColorIndex, isYou}, P2: {...} }`
— offline이면 "PLAYER 1"/"PLAYER 2", online이면 내 닉네임(P1, isYou=true) vs 봇.

### 2.3 게임 로직 (@shared) — import만, 재구현 금지

```ts
// 공통
import { DEFAULT_KEYBOARD_MAP, attachKeyboardAdapter, resolveKey } from '@shared';
// 키맵: playerL(P1) q/w, playerR(P2) u/i. attachKeyboardAdapter(window, map, onInput) → 해제 함수 반환.

// 게임1: createGame1State(roundConfig, Math.random) / tick(state, {frame, elapsedMs, actions}, dtMs)
//        game1ActionFromKey('P1','key2') → INCREMENT. state.derived에 렌더용 파생값.
// 게임2: createGame2State({ roundDurationMs: sec*1000 }, Math.random) / tickGame2(state, inputs, dtMs)
//        reduceGame2Inputs(prev, actions)로 Game2Inputs 스냅샷 유지 (P1 엣지, P2 홀드).
//        state.view에 정규화 좌표(0~1)·쿨다운 게이지.
// 게임3: createGame3State({ roundDurationMs: sec*1000 }) / tickGame3(state, actions, dtMs)
//        1초 틱 가위바위보·마지막 입력 채택은 코어가 처리. state.lastTick으로 틱 연출,
//        state.view.p1Cell/p2Cell(+trackLength)로 판자 위치.
// 모든 게임: state.result(MatchResult|null)가 non-null이 되면 reportRoundEnd(state.result) 호출.
// 라운드 시간은 반드시 flow.roundConfig.timePerRoundSec를 넘길 것 (QA-S4-06).
```

리더보드(S2): `computeLeaderboard(mockUsers, mockMatches, scoreConfig)` →
`{ entries, top3, rankOf(id), entryOf(id) }`. 내 mock 신원 매핑은 화면 에이전트 재량
(권장: 내 닉네임은 리더보드에 없는 신규 유저이므로 `entryOf` 결과가 없으면 my=null로 빈 내 행 처리,
또는 온보딩 닉네임과 무관하게 "나"를 top3 밖 가상 엔트리로 넣지 **말 것** — 가짜 데이터 금지.
가장 단순한 정본: top3 + my=null. 내 등수 표기가 필요하므로 `entries`에 내가 없음 → "아직 기록 없음" 문구로 내 행 대체 가능).

### 2.4 debug (`src/debug.ts`) — QA 브리지 (dev 전용, 필수)

```ts
import { useDebugScreen, setDebugGame } from '../debug';
useDebugScreen('scr-game1');   // 화면 마운트 시 (스텁에 이미 있음 — 유지할 것)
setDebugGame(state);           // 게임 화면: 매 틱 호출. 언마운트/이탈 시 setDebugGame(null)
```

`window.__MADPUMP__ = { screen, game, session: {loggedIn, nickname} }` — session은 자동 동기화.

---

## 3. 프리미티브 카탈로그 (`src/components`)

전부 `import { X } from '../components'` (게임 화면은 `'../../components'`).
각 파일 상단 주석에 상세 사용법. 시각 규칙은 PLAN §1 — **순백/순흑 금지, 4px 이하 radius 금지,
윤곽선 대신 클레이 그림자, 젤리 프레스**.

| 컴포넌트 | 용도 | 핵심 props |
|---|---|---|
| `Button` | 클레이 알약 버튼 | `variant`: primary(CTA)/secondary/tertiary(로그아웃)/cancel(취소하기)/google(G로고+라벨 자동), `size`: sm/md/lg |
| `Card` | 클레이 카드 | `tone`: surface/sky/lilac, `interactive`(hover 떠오름 — 게임 선택 카드) |
| `Modal` | 딤+뿅 등장 모달 껍데기 | `testId`(modal-* 부착), `onClose`(배경/ESC — 생략 시 그 경로 닫힘 없음), `width`, `tone` |
| `Avatar` | 이니셜+색 원형 | `name`, `colorIndex`(0~7, mock avatarColorIndex) 또는 `role`('P1'/'P2' 고정색) |
| `LeaderboardTable` | S2 리더보드 (lb-top3/lb-myrank 내장) | `top3: LeaderboardEntry[]`, `my: LeaderboardEntry \| null` — 빈 배열이면 "기록 없음" 빈 상태 |
| `PlayerBadge` | 인게임 HUD 프로필 (P1핑크/P2민트+라벨 병기) | `role`, `name`, `isYou`("나!" 태그), `align`, `data-testid="hud-profile-p1/p2"` |
| `KeyCap` | 온스크린 원형 키캡 (키 각인) | `role`, `keyLabel`('Q'/'W'/'U'/'I'), `icon`, `pressed`(실키 연동 젤리 눌림), `size` |
| `CountdownPill` | 타이머 알약+라운드 칩 (≤5초 pulse) | `remainingMs`, `round`, `totalRounds`, `data-testid="hud-countdown"` |
| `Toast` + `useToast` | 하단 알약 토스트 2초 | `showToast('코드 복사됨!')` → `<Toast message={toast} />` |
| `ClayBlob` | 모서리 장식 블롭 (z-index 0) | `shape`: donut/star/drop, `size`, `style`(위치) |

theme.css 유틸 클래스: `.clay .clay-sm .clay-lg`(볼륨) `.sunken`(홈) `.jelly`(프레스)
`.pop-in .breath .squash .shake .pulse`(모션) `.num`(Baloo 2 tabular) `.screen`(풀스크린 컨테이너).
CSS 변수: PLAN §1.1 팔레트 전부 + `--radius(-lg/-sm)`, `--shadow-clay(-sm/-lg/-pressed)`,
`--shadow-sunken`, `--spring`, `--dim`, `--font-ui/num/body`.

---

## 4. 계약 (전 에이전트 준수)

### 4.1 data-testid 레지스트리 (전 시안 공통 — QA 자동화가 사용, 누락 금지)

| 분류 | testid → 위치 |
|---|---|
| 화면 컨테이너 | `scr-main-out`(S1) `scr-main-in`(S2) `scr-onboarding`(S5) `scr-game-select`(S8) `scr-game1`(S9) `scr-game2`(S10/11) `scr-game3`(S12) |
| 모달 | `modal-login-required`(S3) `modal-settings`(S4) `modal-online`(S6) `modal-matching`(S7) — Modal의 `testId` prop |
| 버튼/입력 | `btn-online` `btn-offline` `btn-google-login` `btn-settings` `btn-quickstart` `btn-code-create` `btn-code-join` `input-code` `room-code-display` `btn-matching-cancel` `input-nickname` `btn-nickname-submit` `err-nickname-dup` `btn-settings-save` `btn-exit` |
| 인게임 | `hud-countdown` `hud-profile-p1` `hud-profile-p2` `game-stage` `result-overlay` `result-text` `btn-next-round` `btn-back-main` |
| 리더보드 | `lb-top3` `lb-myrank` (LeaderboardTable 내장) |
| 게임선택 카드 | `card-game1` `card-game2` `card-game3` |

### 4.2 디버그 브리지 명세 (dev 전용, QA 필수)

`window.__MADPUMP__ = { screen: 현재 화면 id 문자열, game: 현재 게임의 최신 state 객체(@shared state 그대로) or null, session: {loggedIn, nickname} }`
— 화면 전환마다 `useDebugScreen(id)`(스텁 유지), 게임 틱마다 `setDebugGame(state)` 갱신.

### 4.3 ResultOverlay 계약 (game1 소유, game2/game3 소비)

`<ResultOverlay onNextRound={() => …새 라운드 state 생성…} />`
— flow.phase가 'round-result'/'match-result'가 아니면 null 렌더.
props 시그니처(`onNextRound?: () => void`)를 깨지 말 것. testid 4종
(`result-overlay` `result-text` `btn-next-round` `btn-back-main`)은 이 컴포넌트 책임.

### 4.4 인게임 공통 (S9~S12)

- `btn-exit` 좌상단 상시 (나가기 알약: `exitMatch(); navigate('/')`).
- 라운드 배지 "R1/3"은 CountdownPill의 `round`/`totalRounds`로.
- P1=`--p1` 딸기핑크(좌) / P2=`--p2` 민트(우) 절대 고정 + "P1"/"P2" 라벨 병기 (주석 16:1713).
- 라운드 시간은 `flow.roundConfig.timePerRoundSec` 필수 반영, 종료 시 `reportRoundEnd(state.result!)`.
- 온라인 모드(봇 상대)여도 게임 코어는 동일 — 봇 입력은 게임 에이전트가 랜덤/간단 휴리스틱으로
  액션을 흘려 넣는다 (SPEC §0.3: 온라인도 로컬 코어+봇 허용).

### 4.5 빌드 게이트

작업 후 반드시 통과: `cd design-lab && npm run build -w madpump-idea-03 && npm run typecheck -w madpump-idea-03`

---

## 5. 라우트 맵 (App.tsx — 수정 금지)

| 경로 | 화면 |
|---|---|
| `/` | loggedIn+needsOnboarding → `/onboarding` 리다이렉트 / loggedIn → S2 / 아니면 S1 |
| `/onboarding` | S5 (비로그인이면 `/`로) |
| `/select` | S8 (로그인 불필요) |
| `/game/1` `/game/2` `/game/3` | S9 / S10·S11 / S12 |
| 모달 4종 | 라우트와 무관하게 `flow.modal`로 열림 (전역 호스트) |
