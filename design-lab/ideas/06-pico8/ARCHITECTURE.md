# idea-06 PICO-8 PLAYGROUND — 아키텍처 & 작업 계약

> 5명의 화면 구현 에이전트가 병렬 작업한다. **이 문서의 소유권 표를 벗어난 파일은 절대 수정하지 마라.**
> 기능 정본: `design-lab/SPEC.md` / 시각 정본: `./PLAN.md` / 게임 로직: `@shared` (재구현 금지)

## 0. 실행

```bash
cd design-lab            # npm workspace 루트
npm install
npm run dev -w madpump-idea-06        # http://localhost:5106
npm run build -w madpump-idea-06
npm run typecheck -w madpump-idea-06
```

⚠️ dev 서버 종료는 반드시 `lsof -ti:5106 | xargs kill` — pkill/killall 광범위 종료 금지.

## 1. 파일 소유권 표

| 에이전트 | 소유(수정 가능) 파일 |
|---|---|
| **auth** | `src/screens/MainLoggedOut.tsx`, `src/screens/Onboarding.tsx`, `src/modals/LoginRequired.tsx` |
| **lobby** | `src/screens/MainLoggedIn.tsx`, `src/screens/GameSelect.tsx`, `src/modals/Settings.tsx`, `src/modals/Online.tsx`, `src/modals/Matching.tsx` |
| **game1** | `src/screens/game/Game1.tsx`, `src/screens/game/ResultOverlay.tsx` |
| **game2** | `src/screens/game/Game2.tsx` |
| **game3** | `src/screens/game/Game3.tsx` |

**그 외 전부 수정 금지** (아키텍트 소유): `src/App.tsx`, `src/main.tsx`, `src/theme.css`,
`src/debug.ts`, `src/state/*`, `src/components/*`, `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`.

- 자기 화면 전용 CSS가 필요하면 **자기 소유 .tsx 파일 안에**(인라인 스타일 또는 같은 파일에서 import하는 화면 전용 css 파일을 `src/screens/…/<이름>.css`로 새로 만들어) 해결하라. theme.css에 추가 금지.
- `ResultOverlay`는 game1 에이전트가 완성하고 game2/game3은 **import만** 한다. props 계약(§5)은 불변.
- 화면 간 연결(라우트/모달 open 콜백)은 이미 스텁에 주석으로 명시 — 시그니처를 지켜라.

## 2. 라우트 & 모달 배선

| 경로 | 화면 | screen id (브리지/testid) |
|---|---|---|
| `/` | 세션 분기: 비로그인 S1 / 로그인 S2 (App.tsx가 자동 분기) | `scr-main-out` / `scr-main-in` |
| `/onboarding` | S5 온보딩 | `scr-onboarding` |
| `/select` | S8 게임 선택 | `scr-game-select` |
| `/game/1` `/game/2` `/game/3` | S9 / S10·S11 / S12 | `scr-game1` `scr-game2` `scr-game3` |

모달(S3 `modal-login-required`, S4 `modal-settings`, S6 `modal-online`, S7 `modal-matching`)은
라우트가 아니라 **각 화면이 useState로 여닫는 컴포넌트**다. S1/S2 → Settings·Online·LoginRequired,
Online → Matching. 로그인 성공 시 S3은 `onLoginSuccess()`로 S1에 알리고 S1이 Online 패널을 연다.

## 3. 상태 API (`src/state/`)

### session.ts — mock 세션 (메모리 전용, localStorage 없음)

```ts
import { useSession, loginWithGoogleMock, submitOnboarding, logout,
         getSession, TAKEN_NICKNAMES } from '../state/session';

const s = useSession();          // { loggedIn, nickname, user, needsOnboarding }
await loginWithGoogleMock();     // 0.5초 지연 → 'onboarding' | 'main' (라우팅 분기용)
submitOnboarding('철수', '1분반'); // {ok:true} | {ok:false, reason:'duplicate'|'empty'}
logout();                        // → '/'가 S1 렌더. 프로필은 메모리 유지(재로그인 시 'main')
```

- 중복 이름: `TAKEN_NICKNAMES` = `'test'` + mock 유저 닉네임 8개 (대소문자 무시).
- `needsOnboarding=true`면 App이 `/onboarding`으로 자동 리다이렉트한다.

### flow.ts — 게임 진입/라운드 진행

```ts
import { useFlow, getFlow, setRoundConfig, resetRoundConfig, DEFAULT_ROUND_CONFIG,
         startMatch, pickRandomGameId, recordRoundResult, advanceRound,
         resetFlow } from '../state/flow';

// S4 설정 모달
setRoundConfig({ roundCount: 5, timePerRoundSec: 30 }); // 확인 버튼 (min 1 클램프)
resetRoundConfig();                                     // 기본값 3라운드/60초 저장

// 매치 시작 — 게임 화면으로 navigate 하기 "전에" 호출
startMatch('offline', 2);                   // S8: 선택 게임으로
startMatch('online', pickRandomGameId());   // S6/S7: 매칭 성사 시 (봇 상대 자동 배정)

// 인게임
const f = useFlow(); // { mode, gameId, roundConfig, currentRound(1-base), roundResults,
                     //   scores:{p1Wins,p2Wins,draws}, matchResult, opponent, playerNames }
const r = recordRoundResult('P1' /* | 'P2' | null(무승부) */);
// → { matchOver, matchResult, scores } — 설정 라운드 수 소화 시 다승제 확정(동률 DRAW)
advanceRound();  // result-overlay "다음 라운드"
resetFlow();     // "메인으로" — 진행 리셋 (roundConfig 설정은 유지)
```

- `playerNames`: 온라인이면 `{P1: 내 닉네임, P2: 봇 닉네임}`, 오프라인이면 `PLAYER 1/2`.
- `flow.opponent`: 온라인 봇 `{nickname, avatarColorIndex}` | null.

### @shared 게임 로직 (재구현 절대 금지)

```ts
// 키보드 (전 게임 공통): playerL q/w → P1, playerR u/i → P2
import { attachKeyboardAdapter, DEFAULT_KEYBOARD_MAP } from '@shared';
const detach = attachKeyboardAdapter(window, DEFAULT_KEYBOARD_MAP, (ev) => {
  // ev = { player:'P1'|'P2', key:'key1'|'key2', phase:'down'|'up' }
});

// 게임1: createGame1State(roundConfig, Math.random) / tick(state, {frame,elapsedMs,actions}, dtMs)
//        game1ActionFromKey(player, key)  — key1=DECREMENT, key2=INCREMENT
// 게임2: createGame2State({ roundDurationMs: cfg.timePerRoundSec*1000 }, Math.random)
//        tickGame2(state, inputs, dtMs)   — inputs는 reduceGame2Inputs로 누적한 Game2Inputs
//        (P1: q=TURN, w=FIRE 엣지 / P2: u,i는 LEFT/RIGHT_DOWN·UP 레벨)
// 게임3: createGame3State({ roundDurationMs: cfg.timePerRoundSec*1000 })
//        tickGame3(state, actions, dtMs)  — q/u=ATTACK, w/i=DODGE, 무입력=NONE, 1초 틱
// 각 state의 result: 'P1_WIN'|'P2_WIN'|'DRAW'|null — null 아니게 되면 라운드 종료
//   → recordRoundResult(result==='DRAW' ? null : result==='P1_WIN' ? 'P1' : 'P2')
```

## 4. 프리미티브 카탈로그 (`src/components/`, barrel `../components`)

| 컴포넌트 | 용도 / 핵심 props |
|---|---|
| `Button` | 픽셀 버튼. `variant='primary'(오렌지 CTA)\|'surface'(퍼플)\|'ghost'(그레이 보조)`, `size='sm'\|'md'\|'lg'`, `pixelFont`(영문 레이블), `overline`(영문 오버라인 2단 스택), 나머지 button 속성 통과(`data-testid` 등) |
| `Card` | 노치 패널. `tone='purple'\|'green'\|'gray'\|'black'`, `title`(픽셀폰트 헤더), `floating`(8px 딥섀도), `notch` |
| `Modal` | 오버레이+본체. `open, onClose(ESC/배경), title, testId, width, closeOnBackdrop, shake`. testId는 본체에 부착 |
| `Avatar` | 이니셜 사각 아바타. `name, colorIndex(0~7), role('P1'\|'P2' 진영색 강제), size` |
| `PlayerBadge` | 인게임 프로필 칩. `role, nickname, isYou(▶YOU 태그)` — hud-profile-p1/p2에 사용 |
| `LeaderboardTable` | HI-SCORE 테이블. `top3: LeaderboardRow[], myRow` — `lb-top3`/`lb-myrank` testid 내장, 빈 배열이면 NO RECORDS 빈 상태 |
| `Keycap` | 온스크린 키캡. `keyLabel, icon, owner('P1'\|'P2' 진영 링), pressed(키 입력 동기화), size` |

theme.css 공용 클래스: `.px-font`(픽셀폰트) `.px-blink`(점멸) `.px-snap-in`(화면 등장)
`.px-pop`(모달 팝) `.px-shake`(에러 셰이크) `.px-pulse`(카운트다운 펄스) `.px-overlay`
`.px-input`(+`.is-error`) `.px-error-text` `.px-keycap`. CSS 변수는 PLAN §1.1 토큰 그대로
(`--bg --surface --surface-2 --surface-3 --text --text-dim --text-soft --accent --accent-2
--p1 --p2 --ok --danger --flesh --pink`, `--shadow-hard --shadow-float`, `--notch-4 --notch-8`).

**디자인 규칙(PLAN §1) 요약**: PICO-8 16색 밖 색 금지 · radius 0(노치만) · blur 0 하드섀도 ·
steps(n) 애니만 · 8px 그리드 · P1=블루/P2=레드 절대 불변 · 픽셀폰트는 10px 미만 금지.

## 5. testid 레지스트리 (QA 자동화 — 전부 필수)

| 구역 | testid |
|---|---|
| 화면 컨테이너 | `scr-main-out`(S1) `scr-main-in`(S2) `scr-onboarding`(S5) `scr-game-select`(S8) `scr-game1`(S9) `scr-game2`(S10/11) `scr-game3`(S12) |
| 모달 | `modal-login-required`(S3) `modal-settings`(S4) `modal-online`(S6) `modal-matching`(S7) |
| 버튼/입력 | `btn-online` `btn-offline` `btn-google-login` `btn-settings` `btn-quickstart` `btn-code-create` `btn-code-join` `input-code` `room-code-display` `btn-matching-cancel` `input-nickname` `btn-nickname-submit` `err-nickname-dup` `btn-settings-save` `btn-exit` |
| 인게임 | `hud-countdown` `hud-profile-p1` `hud-profile-p2` `game-stage` `result-overlay` `result-text` `btn-next-round` `btn-back-main` |
| 리더보드 | `lb-top3` `lb-myrank` (LeaderboardTable에 내장) |
| 게임선택 카드 | `card-game1` `card-game2` `card-game3` |

주의: `btn-google-login`은 S1과 S3 모달 양쪽에 존재할 수 있음(각자 부착). `btn-settings`는
S1/S2 우상단. `btn-exit`는 인게임 상시 우상단 나가기 키캡(누르면 `resetFlow()` 후 `/`).

`ResultOverlay` props 계약 (불변 — game2/3이 그대로 사용):

```ts
interface ResultOverlayProps {
  winner: 'P1' | 'P2' | null;          // 이번 라운드 승자 (null=무승부)
  matchOver: boolean;                   // recordRoundResult 반환값
  matchResult: MatchResult | null;      // 〃
  onNextRound: () => void;              // 게임 화면이 새 라운드 state 생성 + advanceRound()는 오버레이 내부에서 호출됨
}
```

## 6. 디버그 브리지 (dev 전용, QA 자동화 필수)

```ts
window.__MADPUMP__ = {
  screen: string,   // 현재 화면 id (위 화면 컨테이너 testid 문자열)
  game: object|null,// 현재 게임의 최신 state (@shared state 그대로)
  session: { loggedIn: boolean, nickname: string|null },
}
```

- 화면 전환: 각 화면이 `useDebugScreen('scr-...')` 호출 — **스텁에 이미 배선돼 있으니 교체 시 유지하라.**
- 게임 틱: 게임 화면에서 매 틱 `setDebugGame(state)`, 언마운트 시 `setDebugGame(null)` (`src/debug.ts`).
- 세션: 자동 (session store 구독).

## 7. QA 통과 기준

`design-lab/SPEC.md`의 QA-S*-* 체크리스트 전부. 자기 화면 완성 후
`npm run typecheck -w madpump-idea-06 && npm run build -w madpump-idea-06`가 깨지지 않아야 한다.
