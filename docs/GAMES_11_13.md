# 신규 게임 11·12·13 (v1, 2026-07-06, branch new-games-v1)

> 게임 3종 추가. 화면 UI는 전부 영어. 로직 정본은 `shared/src/games/game{11,12,13}/logic.ts`,
> 화면은 `client/src/screens/game/Game{11,12,13}.tsx`. 통합 지점은 §4.

## 게임 11 — HOT POTATO (폭탄 돌리기)
- 퓨즈 **10초 고정**. elapsed가 10s에 닿는 순간 폭발 → 그때 폭탄을 **든 쪽이 패배**(무승부 없음).
- **Q(P1)/U(P2) = PASS** — 상대에게 넘김. 받은 직후 **0.2초(RECEIVE_CD)** 동안은 다시 못 넘김("패스 딜레이").
- **W(P1)/I(P2) = FAKE** — 페인트 연출(기계 효과 없음, 0.3s 쿨다운).
- **최대 홀드 1.5초** 초과 시 자동 패스. 시작 보유자는 랜덤.
- 화면: 남은 3초부터 카운트다운 숨김, 폭탄이 퓨즈 진행에 따라 검정→주황, 폭발 시 진 쪽에서 폭발 연출.

## 게임 12 — RED LIGHT, GREEN LIGHT (무궁화 꽃이 피었습니다)
- 두 플레이어가 왼쪽 출발선(pos 0)에서 오른쪽 술래/도착선(pos 1)으로 전진.
- **Q/U = RUN**(연타, 관성 있음 — 안 누르면 감속), **W/I = STOP**(급정거, v=0).
- 술래: green(안전) ↔ red(응시·위험), red 직전 **0.2초 예고(turning)**. red 중 속도가 임계값(0.12) 이상이면 **적발 → 즉시 패배**.
- 둘 다 같은 프레임 적발 시 술래에 **더 가까운(pos 큰) 쪽이 잡아먹혀 패배**. red 아닐 때 도착선 도달 = 즉시 승리. 시간 종료 시 더 가까운 쪽 승.
- 튜닝: 한 번의 green으로 결승선에 못 닿게 속도를 낮춰(V_MAX 0.6) 여러 red를 넘어야 도착. 코스팅만으론 0.2s 안에 못 멈춰 → 반드시 급정거로 멈춰야 안전.

## 게임 13 — POT SHOT (박 터뜨리기)
- 중앙에 박(pot)이 상하 왕복(주기 2~3초 랜덤). P1 좌하단 / P2 우하단 대포.
- **Q/U 홀드 = 각도 0~90° 왕복**(0.25s에 90°), 떼면 고정. **W/I 홀드 = 세기 충전**(1초에 MAX), **떼는 순간 발사**. 발사 후 0.4초 재장전.
- 포물선(중력 900) 발사체가 박에 맞으면 +1점. 제한시간 10초 동안 **더 많이 맞힌 쪽 승**.
- 물리 튜닝: 각도 30°→박 하단·45°→중앙·60°→상단(MAX 세기 기준)으로 박의 상하 범위를 커버 → 각도+세기+발사 타이밍의 조준 퍼즐.

## 4. 통합 지점 (게임 1개 추가 시 손댄 곳)
| 구분 | 파일 | 내용 |
|---|---|---|
| 로직 | `shared/src/games/game{11,12,13}/logic.ts` | 코어(create/step, State, G 상수). 신규 |
| 등록 | `shared/src/games/registry.ts` | GameId 유니온 `…\|13`, GAME_CORES, ALL_GAME_IDS |
| 배럴 | `shared/src/index.ts` | game11~13 네임스페이스·G11~13·State·(G12는 isRed/isTelegraph) export |
| 코인 | `shared/src/coins.ts` | GAME_ORDER `[1..13]`. **LOCKABLE 고정 `[9,10]`** (신규는 무료, 비트마스크 의미 보존) |
| 시드 | `server/prisma/seed.ts` | game 11~13 행 + **이름 2단계 upsert**(재번호 이름 충돌 방지) |
| 클라 타입 | `client/src/shell/types.ts` | GameId `…\|13` (shared와 별개 정본) |
| 클라 배열 | `client/src/state/flow.ts`(ALL_GAME_IDS), `client/src/shell/mock.ts`(GAME_IDS) | `[1..13]` |
| 이름 | `client/src/game/gameNames.ts` | 11 HOT POTATO / 12 RED LIGHT, GREEN LIGHT / 13 POT SHOT (영어) |
| 라우트 | `client/src/App.tsx` | import + `/game/{11,12,13}` |
| 인트로 | `client/src/screens/game/RoundIntro.tsx` | COPY 11~13 (영어 문구) |
| 슬롯 | `client/src/net/MatchIntro.tsx` | SPIN_STRIP `[1..13]` |
| 화면 | `client/src/screens/game/Game{11,12,13}.tsx` + `game{N}.css` | 캔버스 렌더(영어 UI). 신규 |

**무수정(레지스트리/데이터 구동):** server의 game-adapter·match·index(sanitizeGames·슬롯 추첨), GameSelect·Settings(ALL_GAME_IDS·GAME_NAMES 구동), GamePictogram(폴백), net/online·useOnlineRender(제네릭).

## 5. 검증
- 3개 코어 헤드리스 시뮬 통과: G11(자동패스·쿨다운·10초 폭발), G12(신중 40:0 무모, 여러 red 넘어 ~2.2s 도착), G13(30/45/60°가 박 하/중/상 커버, 충전-발사-재장전 사이클, 명중 카운트).
- 클라 타입체크·프로덕션 빌드 통과. game.name DB 시드 코드와 일치(13행).
- ⚠️ DB의 `game` 이름이 재번호 이전 매핑으로 남아 있던 것을 seed 2단계 upsert로 교정함. **배포 VM에서도 `db:seed` 필요.**

## 6. 배포 체크리스트
1. `npm install`(신규 의존성 없음) → `npm --workspace @madpump/server run db:seed` (게임 11~13 행 + 이름 교정)
2. 새 마이그레이션 없음(스키마 불변 — game 사전은 시드로만 관리)
3. 클라 재빌드
