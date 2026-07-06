# 온라인 매치 — 9라운드 슬롯 + 리벤지 (v1, 2026-07-06, branch online-match)

> 온라인 매치(빠른 시작·코드방 공통)의 매치 구조와 리벤지 제도의 정본.
> 코인 정산 규칙 자체는 `docs/COINS.md`, 프로토콜 타입은 `shared/src/net/events.ts`.

## 1. 매치 구조: 9라운드 + 슬롯머신

- 온라인 매치는 **항상 9라운드** (설정의 라운드 수 UI는 제거됨 — 게임 체크박스만 남음).
- 매치 성사 시 서버가 **슬롯 3릴** = 게임 3개를 추첨해 `match:start`의 `slotGames`로 내려준다.
  - **라운드 r의 게임 = `slotGames[(r-1) % 3]`** → 릴1 = 1·4·7라운드, 릴2 = 2·5·8, 릴3 = 3·6·9.
  - 후보 풀 = 방 설정 게임 체크박스(빠른시작은 전체 10종). **풀 ≥ 3이면 서로 다른 3개**,
    풀이 1~2개면 그 안에서 중복 허용.
- **인트로 타임라인** (서버 `INTRO_MS`=4.7s 동안 1라운드 시작을 지연):
  | 시각 | 연출 (클라 `MatchIntro.tsx`) |
  |---|---|
  | 0s | 슬롯 3릴 스핀 시작 (게임 픽토그램 스트립 회전) |
  | 1.2s / 1.5s / 1.8s | 릴1→2→3 **0.3초 간격** 순차 정지 |
  | 2.5s | **VS 화면**: 양측 닉네임·색·베팅 코인 2초 공개 |
  | 4.7s | 서버 `round:start` → 3초 카운트다운 → 1라운드 |
- **ALL-IN 표시**: 베팅액 = 참가 시점 보유 전액이면 `match:start`의 `yourAllIn/oppAllIn`이 true →
  VS 화면에 빨간 ALL-IN 뱃지. (리벤지 여부와 무관하게 모든 매치에 적용)
- match:end의 코인 정산 규칙은 기존과 동일 (quick: ±자기 베팅 / code: 승자가 패자 베팅 흡수).

## 2. 리벤지 매치

패자가 직전 승자에게 **각자 직전 베팅의 2배**를 걸고 재도전하는 제도.

### 스테이크 규칙
- `stake = min(직전 자기 베팅 × 2, 현재 보유 코인)` — **2배가 안 되면 보유 전액 ALL-IN**.
- 신청자(패자)든 수락자(승자)든 동일 규칙. 단 **보유 0이면 참여 불가**
  (패자: REVENGE 버튼 미노출 / 승자: 신청 자체가 거부됨).
- 정산 방식(quick/code)은 **원 매치의 종류를 상속**한다 (같은 방에서 재시작).

### 흐름
```
match:end ─ 패자에게 revenge:{stake, allIn} 자격 동봉 (없으면 null → 버튼 미노출)
  → 패자 [REVENGE] 클릭 → revenge:request (ack)
     ├─ 승자가 방을 떠남/접속 끊김/코인 0 → ack 실패 → 패자는 자동으로 메인 복귀 (명세 2c)
     └─ OK → 승자에게 revenge:offer { fromNickname, yourStake/allIn, oppStake/allIn, timeoutMs }
  → 승자 다이얼로그 "{패자} 님이 베팅 코인의 2배를 걸고 리벤지 매치를 신청하셨습니다…"
     ├─ [수락] → revenge:result{accepted:true} 양측 → 같은 방에서 새 매치 (슬롯 재추첨, 베팅=스테이크)
     ├─ [거절] → revenge:result{DECLINED} → 양측 메인 복귀
     ├─ 10초 무응답 → revenge:result{TIMEOUT} (서버 `REVENGE_TIMEOUT_MS`)
     └─ 패자 [취소] → revenge:result{CANCELLED}
```

### 자격 (match:end의 revenge가 non-null일 조건)
1. 무승부가 아니고 내가 패자
2. **내가 직전 매치의 리벤지 신청자가 아님** — 연속 신청 금지 (명세 2e)
   - 원 승자가 리벤지에서 패배한 경우: 그는 신청자가 아니었으므로 신청 가능 (명세 2f)
3. 정산 후 보유 코인 ≥ 1

### 구현 위치
| 계층 | 파일 | 내용 |
|---|---|---|
| 프로토콜 | `shared/src/net/events.ts` | `MatchStartMsg.slotGames/bets/allIn`, `MatchEndMsg.revenge`, `revenge:*` 5종 |
| 서버 | `server/src/match.ts` | 9라운드·슬롯 추첨·INTRO_MS·match:end 자격 계산·postMatch 기록 |
| 서버 | `server/src/rooms.ts` | `Member.allIn`, `Room.postMatch`(리벤지 창구)·`revengeRequesterUserId` |
| 서버 | `server/src/index.ts` | `revenge:request/respond/cancel` 핸들러, `takeRevengePending`(이중 처리 방지), leaveRoom 연동 |
| 클라 | `client/src/net/online.ts` | phase `'slot'`, revengePhase/offer/closed 상태, 액션 3종 |
| 클라 | `client/src/net/MatchIntro.tsx` | 슬롯 연출 + VS 화면 (reduce-motion 대응) |
| 클라 | `client/src/net/OnlineController.tsx` | REVENGE 버튼/대기/수락 다이얼로그, 무산 시 메인 복귀 |
| 클라 | `client/src/components/HudFrame.tsx` | 온라인 매치 중 라운드 표기(n/9) 보정 |

### 테스트 노브 (E2E 전용 — 운영 기본값 불변)
`MATCH_COUNTDOWN_MS` `MATCH_ROUND_GAP_MS` `MATCH_INTRO_MS` `REVENGE_TIMEOUT_MS` 환경변수로
서버 타이밍을 단축할 수 있다 (`server/src/match.ts`, `index.ts`).

## 3. 결정 사항 기록 (사용자 확정)
- 9라운드 고정 → 설정 모달의 라운드 수 UI 제거 (2026-07-06)
- 슬롯 3칸 서로 다른 게임, 코드방은 체크박스 풀 (풀 < 3이면 중복 허용)
- 리벤지 스테이크: 2배 미만 보유 시 ALL-IN 허용 + 모든 매치에서 전액 베팅 ALL-IN 표시
- 승자 응답 타임아웃 10초
- (합의된 기본값) 무승부는 리벤지 없음 / 거절·취소·타임아웃 시 양측 메인 복귀 /
  리벤지 매치도 새 슬롯으로 9라운드

## 4. E2E 회귀 테스트

`server/e2e/online-match.e2e.ts` — 소켓 클라이언트 2개로 명세 전 항목을 실서버 검증(약 7분).

```bash
# 터미널 1: 단축 타이밍 서버
cd server && MATCH_COUNTDOWN_MS=300 MATCH_ROUND_GAP_MS=300 MATCH_INTRO_MS=500 REVENGE_TIMEOUT_MS=3000 npx tsx src/index.ts
# 터미널 2
cd server && npx tsx e2e/online-match.e2e.ts
```
⚠️ 유저 1~6의 코인을 덮어쓰므로 로컬 DB 전용. (최신 통과: 121개 검증 전부 ✅)

## 5. Opus 심층 리뷰 반영 (2026-07-06)

5개 렌즈(동시성·상태머신·명세·통합·코인엣지) 병렬 리뷰 → 이중 적대검증으로 확정한 8건 수정 완료.

| 결함 | 수정 |
|---|---|
| 리벤지 '취소'/'메인'의 낙관적 teardown이 승자 '수락'과 경합 시 코인 상실 | 취소를 서버 확정(revenge:result) 기반으로 — 수락이 이기면 그대로 매치 진입, 코인 손실 없음 |
| requestError가 매치 간 초기화 안 됨 → 다음 화면 오배너 | match-end/slot 진입 시 초기화 (`OnlineController.tsx`) |
| REVENGE 더블클릭 → 2번째 PENDING ack이 '승자 이탈'로 오인 | in-flight 가드(`requesting`)+버튼 disabled |
| settleCoins 비대칭 클램프 → 코드방 제로섬 깨져 코인 무단 생성 | transfer 클램프(승자=패자 실제 차감분, `db.ts`) + `/api/unlock` 매치중 차단 |
| aborted가 종료상태로 보호 안 됨 → 이어지는 game:state가 이탈 통지를 덮음 | `isTerminal()` 가드로 종료 후 라운드 이벤트 무시 (`online.ts`) |
| 취소 에코가 teardown 재발화(이중 leaveRoom) | `goMain`의 `leavingRef` 단일 실행 가드 |
| 리벤지 카운트다운 첫 250ms 과대 표시 | `nowTick=performance.now()` 초기화 + 상한 클램프 |
| 모바일 슬롯 3릴이 ≤360px에서 넘침 | overlay overflow 차단 + ≤360px 릴 축소 (`match-intro.css`) |
