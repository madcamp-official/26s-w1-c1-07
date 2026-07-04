# 04 — Broadcast Arena 아키텍처 (구현 에이전트 필독)

> 정본 기능 명세: `design-lab/SPEC.md` (S1~S12 + QA 체크리스트) — 기능은 여기 적힌 대로만.
> 디자인: 이 폴더의 `PLAN.md` (밝음-진지, 주간 스타디움 중계 룩, 스큐 -12° 시그니처).
> 실행: `cd design-lab && npm install && npm run dev -w madpump-idea-04` → http://localhost:5104
> 검증: `npm run typecheck -w madpump-idea-04` / `npm run build -w madpump-idea-04`

---

## 1. 파일 소유권 표

| 에이전트 | 소유(수정 가능) 파일 |
|---|---|
| **auth** | `src/screens/MainLoggedOut.tsx`, `src/screens/Onboarding.tsx`, `src/modals/LoginRequired.tsx` |
| **lobby** | `src/screens/MainLoggedIn.tsx`, `src/screens/GameSelect.tsx`, `src/modals/Settings.tsx`, `src/modals/Online.tsx`, `src/modals/Matching.tsx` |
| **game1** | `src/screens/game/Game1.tsx`, `src/screens/game/ResultOverlay.tsx` |
| **game2** | `src/screens/game/Game2.tsx` |
| **game3** | `src/screens/game/Game3.tsx` |

**그 외 전 파일은 아키텍트 소유 — 구현 에이전트 수정 금지**: `src/App.tsx`, `src/main.tsx`,
`src/theme.css`, `src/debug.ts`, `src/state/*`, `src/components/*`, `index.html`, 설정 파일 일체.

- 화면별 전용 CSS가 필요하면 **자기 소유 화면 파일 옆에 새 CSS 파일**을 만들어 import
  (예: `src/screens/lobby.css`). `theme.css`에 추가 금지.
- `ResultOverlay.tsx`는 game1 에이전트가 정식 구현. game2·game3은 **import만**
  (`import ResultOverlay from './ResultOverlay'`) — props 인터페이스(`ResultOverlayProps`)는 유지.
- 스텁 파일은 각 소유 에이전트가 **파일 전체를 교체**하면 된다. 단 파일 경로·default export·
  컨테이너 testid·`useDebugScreen(...)` 호출은 유지할 것.

## 2. 라우팅 (App.tsx — 수정 금지)

| 경로 | 화면 | 비고 |
|---|---|---|
| `/` | loggedIn ? S2 `MainLoggedIn` : S1 `MainLoggedOut` | needsOnboarding이면 `/onboarding`으로 자동 리다이렉트 |
| `/onboarding` | S5 | 비로그인 시 `/`로 리다이렉트 |
| `/select` | S8 | 로그인 불필요 |
| `/game/1` `/game/2` `/game/3` | S9 / S10·S11 / S12 | 진입 전 flow에 매치 시작이 세팅돼 있어야 함 |

모달 4종(S3/S4/S6/S7)은 App에 전역 마운트 — 라우트 이동 없이 `flow.modal` 값으로 열림/닫힘.

## 3. 상태 API

### 3.1 `src/state/session.ts` (mock 세션 — 메모리 전용)

```ts
const s = useSession();          // { loggedIn, nickname, groupName, needsOnboarding, user }
getSession()                     // 비-React 스냅샷
await mockGoogleLogin()          // 0.5s 지연 → 'onboarding' | 'main' 반환. 반환값대로 navigate
isNicknameTaken(name)            // S5 중복 검증 ('test' + mock 유저 이름들, 대소문자 무시)
completeOnboarding(name, group)  // S5 확인 → 이후 navigate('/')
logout()                         // 세션 초기화 → navigate('/')
```

같은 메모리 세션에서 로그아웃 후 재로그인하면 '기존 유저'(→ `'main'`)로 취급된다.

### 3.2 `src/state/flow.ts` (게임 진입 플로우 + 매치 진행)

```ts
const f = useFlow();
// FlowState: { mode, gameId, roundConfig{roundCount,timePerRoundSec}, modal, roomCode,
//              opponent{nickname,avatarColorIndex,isBot}|null, phase, currentRound,
//              roundResults, matchResult }
// phase: 'idle' | 'playing' | 'round-result' | 'match-result'

// 모달
openModal('login-required' | 'settings' | 'online' | 'matching'); closeModal();

// 설정 (S4)
setRoundConfig({ roundCount, timePerRoundSec });  // min 1 클램프 저장
getDefaultRoundConfig();                          // {3, 60} — '기본값' 버튼용
DEFAULT_ROUND_CONFIG;

// 온라인 (S6·S7)
createRoomCode(): string;        // 11자리 숫자 코드 생성 + flow.roomCode 세팅
isValidRoomCode(code): boolean;  // 숫자만 검증 (분반 제한 없음)
cancelMatching();                // matching → online 모달 복귀 (setTimeout 정리는 모달 책임)
matchFound(gameId?): GameId;     // 봇 배정 + 매치 시작 + 모달 닫기 → navigate(`/game/${id}`)

// 오프라인 (S8)
startOfflineGame(gameId);        // 매치 시작 → navigate(`/game/${gameId}`)

// 라운드 진행 (게임 화면)
reportRoundEnd(state.result!);   // shared state의 MatchResult 그대로. phase 전이는 자동:
                                 //   라운드 남음 → 'round-result' / 다 채움 → 'match-result'(다승제, 동률 DRAW)
nextRound();                     // 'round-result' → 'playing', currentRound+1. 호출 후 새 게임 state 생성
exitMatch();                     // 매치 필드 전부 초기화 → navigate('/')
getRoundWins(f);                 // { P1: n, P2: n } — 스코어 버그용
getPlayerDisplays(f);            // { P1: {name, avatarColorIndex, isYou}, P2: ... }
                                 //   offline: PLAYER 1/2 · online: 내 닉네임(YOU) vs 봇
```

### 3.3 게임 화면 공통 패턴 (S9~S12)

```tsx
// 1) 가드: flow.gameId !== N || flow.phase === 'idle' → <Navigate to="/select" replace />
// 2) 라운드 시작: flow.roundConfig 반영해 게임 state 생성
//    G1: createGame1State({...flow.roundConfig}, Math.random)
//    G2: createGame2State({ roundDurationMs: flow.roundConfig.timePerRoundSec * 1000 })
//    G3: createGame3State({ roundDurationMs: flow.roundConfig.timePerRoundSec * 1000 })
// 3) 입력: attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, ev => ...) — 해제 함수 cleanup 필수
//    (playerL q/w → P1, playerR u/i → P2. 온라인 모드의 봇은 화면이 간단한 랜덤 입력 mock으로 구동)
// 4) 루프: rAF(G1·G2) 또는 rAF+코어 1s 틱(G3) → newState = tick*(state, inputs, dt)
//    매 틱 setDebugGame(newState)  ← QA 필수 / 언마운트 시 setDebugGame(null)
// 5) 종료: newState.result !== null → reportRoundEnd(newState.result) (1회만)
//    flow.phase !== 'playing'이면 <ResultOverlay flow={flow} players={...} onNextRound={...} onBackMain={...} />
//    onNextRound = () => { nextRound(); 새 state 생성 }  /  onBackMain = () => { exitMatch(); navigate('/') }
// 6) 나가기: btn-exit → exitMatch(); navigate('/')
```

@shared 게임 API 요약 (재구현 절대 금지, import만):
- **G1**: `createGame1State(config: RoundConfig, rng)` / `tick(state, InputFrame<Game1Action>, dtMs)`
  / `game1ActionFromKey(player, 'key1'|'key2')` (key1=↓, key2=↑) / `state.derived`(matched·holdProgress·timeRemainingMs)
- **G2**: `createGame2State(Partial<Game2Config>?, rng?)` / `tickGame2(state, Game2Inputs, dtMs)`
  / `reduceGame2Inputs(prev, Game2Action[])`, `GAME2_IDLE_INPUTS` — P1 q=TURN·w=FIRE(엣지),
  P2 u/i=LEFT/RIGHT_DOWN·UP(레벨, keydown/keyup 모두 전달) / 렌더는 `state.view` 비율 좌표
- **G3**: `createGame3State(Partial<Game3Config>?)` / `tickGame3(state, Game3Action[], dtMs)` —
  q·u=ATTACK, w·i=DODGE. 1초 틱 윈도우·마지막 입력 채택은 코어 처리. 연출은 `state.lastTick`

## 4. 프리미티브 카탈로그 (`src/components` — import 전용)

| 컴포넌트 | 용도 / 주요 props |
|---|---|
| `Button` | `variant='primary'`(네이비 스큐+골드 hover) `'secondary'`(흰 스큐) `'google'`(G 로고 관례형) `'text'` · `size='md'|'lg'` · `testId` `disabled` `onClick` |
| `Card` | 방송 패널: `accent='navy'|'gold'|'p1'|'p2'|'none'` `accentSide='top'|'left'` `tab`(스큐 헤더) `tabTone` `hoverGold`(S8 카드) `onClick` `testId` |
| `Modal` | 딤+와이프 인 카드. `testId` `tab`(예 'MATCH RULES') `tabTone='navy'|'live'` `onClose`(배경클릭+ESC, 생략 시 안 닫힘) `width` |
| `SkewTab` | 스큐 라벨 탭. `tone='navy'|'live'|'gold'|'p1'|'p2'` |
| `Avatar` | 이니셜+색 원형. `name` `colorIndex(0~7)` 또는 `team='p1'|'p2'` `size` |
| `PlayerBadge` | 팀 컬러 네임플레이트. `role='P1'|'P2'` `name` `isYou`(YOU 태그) `tone='pill'|'light'` `testId` |
| `ScoreBug` | 인게임 상단 스코어 버그 — **hud-profile-p1/p2·hud-countdown testid 내장**. `players` `roundWins` `currentRound` `roundCount` `timeRemainingMs` |
| `LeaderboardTable` | STANDINGS 순위표 — **lb-top3·lb-myrank testid 내장**, 빈 상태 '기록 없음'. `top3` `my` |
| `KeyCap` | 온스크린 키 인디케이터. `keyLabel='q'` `hint='↓'` `team` `active`(점등) `size` |
| `LiveBadge` | LIVE pill (레드 점 펄스). `label` |
| `Ticker` | 하단 풀폭 네이비 티커(fixed). `items?` — 쓰는 화면은 컨테이너에 `paddingBottom:'var(--ticker-h)'` |
| `Toast` / `useToast()` | 짧은 피드백. `const {toast, showToast} = useToast()` → `{toast}` 렌더 |

각 파일 상단 주석에 상세 사용법 있음. 디자인 토큰은 `theme.css`의 CSS 변수
(`--bg --surface --strip --ink --ink-sub --line --gold --live --p1 --p1-tint --p2 --p2-tint ...`)와
유틸 클래스(`.skew .unskew .label .tnum .display .wordmark .input .wipe-in .flip-roll`)를 사용.
골드는 승리/1위/MVP 전용 — 평시 화면에 쓰지 말 것 (PLAN §1.1).

## 5. data-testid 레지스트리 (전수 준수 — QA 자동화가 이 id로 찾는다)

| 분류 | testid → 위치 |
|---|---|
| 화면 컨테이너 | `scr-main-out`(S1) `scr-main-in`(S2) `scr-onboarding`(S5) `scr-game-select`(S8) `scr-game1`(S9) `scr-game2`(S10/11) `scr-game3`(S12) |
| 모달 | `modal-login-required`(S3) `modal-settings`(S4) `modal-online`(S6) `modal-matching`(S7) — Modal의 `testId`로 본체 카드에 부착 |
| 버튼/입력 | `btn-online` `btn-offline` `btn-google-login` `btn-settings` `btn-quickstart` `btn-code-create` `btn-code-join` `input-code` `room-code-display` `btn-matching-cancel` `input-nickname` `btn-nickname-submit` `err-nickname-dup` `btn-settings-save` `btn-exit` |
| 인게임 | `hud-countdown` `hud-profile-p1` `hud-profile-p2`(이상 ScoreBug 내장) `game-stage` `result-overlay` `result-text` `btn-next-round` `btn-back-main`(이상 ResultOverlay 내장) |
| 리더보드 | `lb-top3` `lb-myrank`(LeaderboardTable 내장) |
| 게임선택 카드 | `card-game1` `card-game2` `card-game3` |

- `btn-google-login`은 S1의 버튼에. S3 모달 내부 구글 버튼은 modal-login-required 내에서
  구별 가능하므로 testId 없이 variant='google'만 써도 되지만, QA 편의상 S1 쪽이 정본.
- `btn-settings`는 S1·S2의 원형 설정 버튼(각 화면이 부착 — 화면마다 1개).

## 6. 디버그 브리지 (dev 전용, QA 필수 — `src/debug.ts`)

`window.__MADPUMP__ = { screen, game, session }`

- `screen`: 화면 컨테이너 testid 문자열. 각 화면이 `useDebugScreen('scr-...')` 호출(스텁에 포함 — 유지).
- `game`: 현재 게임의 최신 @shared state 그대로. 게임 화면이 **매 틱** `setDebugGame(state)`,
  이탈/언마운트 시 `setDebugGame(null)`.
- `session`: `{loggedIn, nickname}` — `initDebugBridge()`(main.tsx)가 자동 동기화. 신경 쓸 것 없음.

## 7. mock 전제 (SPEC §0.3)

- 서버 없음. 구글 로그인 = 0.5초 가짜 지연 → 메모리 세션 (localStorage 사용 안 함).
- 온라인 매칭 = S7 연출(connecting→waiting, 1.5초) 후 **봇 상대**와 로컬 게임.
  봇 입력은 각 게임 화면이 가벼운 랜덤/휴리스틱 mock으로 생성 (게임 로직 자체는 @shared).
- 오프라인 = 한 키보드 2인 (playerL q/w vs playerR u/i).
- 리더보드 등 데이터 없는 자리는 빈 상태를 정직하게 (`기록 없음`) — 가짜 데이터 금지.
