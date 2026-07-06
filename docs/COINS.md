# MADPUMP 코인 시스템 (v1, 2026-07-05)

> 재화 "코인"의 규칙 정본. 상수·헬퍼의 코드 정본은 `shared/src/coins.ts` (client/server 공유).
> DB 스키마는 `docs/ERD.md` v2 (app_user.coins / unlocked_count).

## 1. 기본 규칙

- 모든 유저는 **30코인**으로 시작 (`app_user.coins DEFAULT 30`).
- 용도: ① 오프라인 게임 해금 ② 온라인 매치 베팅 ③ (예정) 테마 구매.

## 2. 온라인 베팅

빠른 시작 / 코드 생성하기 / 코드 입력하기 실행 전에 **"코인 베팅" 창**이 뜬다
(보유 한도 내 정수, 0 허용). 베팅액은 `queue:join` / `room:create` / `room:join`
페이로드의 `bet` 필드로 전달되고 서버가 보유량을 재검증한다(초과 시 `INVALID_BET`).

**정산 (매치 종료 시, `server/src/match.ts` finishMatch):**

| 매치 종류 | 승자 | 패자 | 무승부 |
|---|---|---|---|
| 빠른 시작 (`quick`) | +자기 베팅 | −자기 베팅 | 변동 없음 |
| 코드방 (`code`) | **+패자 베팅** | −자기 베팅 | 변동 없음 |

정산 결과는 `match:end` 메시지에 플레이어별로 실려온다: `coinDelta`(증감), `coinBalance`(잔액).
매치 종료 오버레이가 "+N COIN / −N COIN · 보유 M"으로 표시.

## 3. 오프라인 게임 해금

- 화면 순서(=게임 id) **마지막 2개(9번 스피드 오목 · 10번 줄다리기)만 잠금**, 나머지 8개는 처음부터 오픈.
- 잠긴 2개는 **순서와 무관하게 각각 독립적으로** 해금 가능 (로그인 필요):

| 게임 | 비용 |
|---|---|
| 9번 스피드 오목 | 30코인 |
| 10번 줄다리기 | 50코인 |

- DB엔 **`unlocked_count`** 하나만 저장 — `LOCKABLE_GAME_IDS` 순서의 **비트마스크**(잠금 대상이
  2개라 값 0~3, 스키마 마이그레이션 불필요). `unlockedGameIds(mask)` 헬퍼로 복원한다.
- `POST /api/unlock` (인증 필요, body `{ gameId }`): 지정한 잠긴 게임을 해금 — 서버가
  비용·중복·잔액을 검증하고 조건부 UPDATE로 비트 설정(동시 요청 안전).
  응답 `{ unlockedGameId, coins, unlockedCount }`.
- 비로그인 유저는 기본 **8종**만 플레이 가능, 해금 불가.
- 온라인 매치의 라운드 게임 랜덤 선택(1~10)은 해금과 **무관** (오프라인 전용 제한).

## 4. 코인 노가다 (coin farm) — 솔로 펌프 미션

게임 선택(오프라인) 우하단 **"⛏ 코인 노가다하기"** → `/farm`. 로그인 필수(비로그인은 로그인 모달).
기존 펌프(게임6)의 U/I 레인 문법을 1인용으로 축약한 미션 모드다. 상수 정본: `shared/src/coins.ts`.

- **미션**: 제한시간 **10초**(`FARM_DURATION`) 안에 정답 **25타**(`FARM_TARGET`) 달성 → MISSION COMPLETE, 코인 지급.
- **실패 조건**: ① 시간 안에 25점 미달 → MISSION FAILED ② **틀린 키 1회 = 그 즉시 FAILED** (보상 없음).
- **보상 분포** (`FARM_REWARD_TABLE`, 서버가 추첨 — `POST /api/farm/claim`):

| 코인 | 1 | 2 | 3 | 5 | 10 | 20 | 50 | 100 |
|---|---|---|---|---|---|---|---|---|
| 확률 | 30% | 20% | 15% | 18% | 11% | 5% | 0.9% | 0.1% |

  기댓값 **4.7코인**(≈5), 최소 1 / 최대 100.
- 게임 판정은 클라 계산(로스터 로그인과 같은 신뢰 모델). 서버는 유저당 **5초 쿨다운**
  (`FARM_CLAIM_COOLDOWN_MS`)으로 스팸 호출만 차단하고 액수를 직접 추첨한다.
- 구현: 화면 `client/src/screens/CoinFarm.tsx` / 서버 `POST /api/farm/claim` (`server/src/index.ts`).

## 5. mock (아직 기능 없음)

- **테마 변경하기** (메인 우하단): 테마 상점 모달 — 메모장/하키 테마 각 10,000코인 표시만,
  구매 불가(COMING SOON). `client/src/modals/ThemeShop.tsx`

## 6. API·이벤트 요약

| 위치 | 변경 |
|---|---|
| `GET /api/me` | `coins`, `unlockedCount` 포함 (DB 최신값) |
| `POST /api/login` | 응답에 `coins`, `unlockedCount` |
| `POST /api/unlock` | 잠긴 게임 해금 (body `{ gameId }`; 400: `INVALID_GAME`/`ALREADY_UNLOCKED`/`NOT_ENOUGH_COINS`) |
| `POST /api/farm/claim` | 노가다 보상 추첨·지급 (429: `COOLDOWN`) → `{ reward, coins }` |
| `queue:join` `room:create` `room:join` | `{ bet }` 추가 + ack로 `INVALID_BET` 반환 |
| `match:end` | `coinDelta`, `coinBalance` 추가 (플레이어별 개별 전송) |

마이그레이션: `server/prisma/migrations/20260705130654_coin_system`.
기존 유저는 마이그레이션 시 자동으로 30코인/해금 0 상태가 된다.
