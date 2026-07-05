# MADPUMP 실행 계획서 (v1 풀 온라인 런칭 + 10게임 확장)

> grilling으로 닫은 결정 전체 + 한 번에 진행할 실행 로드맵. 정본 순위: `TECH_STACK.md` / `ERD.md` 하위의 구현 계획.

---

## 0. 확정 결정 로그 (grilling 결과)

| # | 항목 | 결정 |
|---|---|---|
| D1 | 런칭 스코프 | **C = 풀 온라인** (구글로그인 + 온라인 매칭 + 결과저장 + 리더보드) |
| D2 | 방/큐 저장 | **서버 메모리** (`Map`), DB 아님. 결과만 DB. |
| D3 | 매치 구조 | **3라운드, 항상 완주**(조기 클린치 없음). 매치 승자 = 라운드 다승, 동률=DRAW |
| D4 | 라운드 게임/역할 | **게임 랜덤(라운드마다 서로 다른 것, 균등 분배) + 역할 랜덤** |
| D5 | 스키마 | `game_match`(playerA/B, result) + **`game_round` 신설**. enum→`A_WIN/B_WIN/DRAW`. 게임역할(P1/P2)은 DB 미저장 |
| D6 | 리더보드 | 랭킹=**매치 단위**(승3/무1/패0), 게임별 승률=**라운드 단위** |
| D7 | 넷코드 | **덤 클라이언트**·서버권위·게임2·3 ~30Hz·예측 없음·game3 `t` clamp |
| D8 | 끊김 처리 | **중단 없음** — 서버가 끝까지 연산, 결과 항상 저장. **라운드 서버 자동 카운트다운 진행**. `match:aborted`=안내 알림만 |
| D9 | 게임 선택 화면 | **전면 삭제**(온·오프라인 모두 랜덤). **매치 러너**가 3게임 순차 진행 |
| D10 | 프로필 | 온보딩+설정에서 변경. 저장=**VM 로컬 디스크**(R2 안 씀) |
| D11 | admin | v1=핵심(로그인·점수수정·결과수정·그룹생성·인원목록). 인원 CRUD=fast-follow |
| D12 | 게임 수 | 10개 로직+상수 완성(game-test 브랜치). 게임1~3 런칭 + **게임4~10 fast-follow(병렬)** |
| D13 | 게임4~10 제작 | **완전히 새로 제작**. game-lab 렌더러 재사용/껍데기 금지. 로직·상수만 재사용. 게임별 subagent. 디자인은 PLAN.md/theme.css를 **읽어서 복사**(참조 금지). 자립성 테스트 필수 |
| D14 | 세션 | 서버 인메모리. 닉네임 1~20자 유니크. 분반 DB 시드 |

---

## 1. 아키텍처 2계층 (핵심 불변식)

- **라이브/프로토콜 계층**: `P1/P2` = 그 라운드의 게임 역할(코어 반환). 매 라운드 랜덤. 소켓 이벤트에서 사용.
- **DB 계층**: `A/B` = 고정된 두 참가자 신원. "누가 이겼나"만 저장. 서버가 라운드 끝날 때 역할결과→신원승자 번역.
- **서버 권위**: 모든 판정은 서버 `core.step`. 클라는 입력 전송 + 상태 렌더(덤). 끊겨도 서버가 끝까지 연산.
- **자립성**: main(client/server/shared)은 design-lab/game-lab을 절대 참조 안 함. `scripts/check-standalone.sh`로 강제.

---

## 2. 스키마 변경 (ERD.md 먼저 → schema.prisma → 마이그레이션)

```
enum MatchResult { A_WIN, B_WIN, DRAW }          // P1_WIN/P2_WIN → A_WIN/B_WIN 개명

game_match
  id BIGINT PK · playerA_id FK · playerB_id FK
  result MatchResult · played_at DATETIME · deleted_at DATETIME?

game_round  (신설)
  id BIGINT PK · match_id FK→game_match · round_index INT
  game_type TINYINT FK→game · result MatchResult
  UNIQUE(match_id, round_index)

game  (시드 3행 → 10행으로 확장)
score_config  (승3/무1/패0, admin 수정)
match_edit_history  (result enum도 A/B로)
```

---

## 3. 실행 로드맵 (2트랙 병렬)

### 트랙 A — 백엔드/온라인 (순차, 내가 주도)
| P | 작업 | 검증 |
|---|---|---|
| A0 | ERD.md 갱신 + schema.prisma(game_round·enum개명·game 10행) + 로컬 docker MySQL migrate/seed | 마이그레이션 성공, seed 10게임 |
| A1 | 서버 뼈대: Fastify+Socket.IO, `shared/src/net/events.ts` 통합봉투, **개발용 로그인 스텁**, 핸드셰이크+`lobby:hello` | 두 탭 소켓 연결 |
| A2 | 로비: 코드방(room:*)+빠른시작(글로벌 FIFO queue) + room:state 브로드캐스트 | 두 탭 매칭 성사 |
| A3 | **매치 러너 + 게임1 온라인 수직 슬라이스**: 서버 권위 step 루프, 3라운드 랜덤·역할랜덤·자동 카운트다운, game:input/state, 끊김=끝까지연산, match:end→game_match+game_round INSERT | 로그인→매칭→온라인 플레이→결과 DB저장→리더보드 반영 |
| A4 | 게임2·3 온라인화(같은 봉투 재사용) + ~30Hz | 3게임 온라인 |
| A5 | 진짜 구글 OAuth + 세션쿠키 + 온보딩(닉네임·분반) → 스텁 교체 | 실제 로그인 |
| A6 | 프로필(온보딩+설정, VM 로컬디스크) + admin 핵심(점수·결과수정·그룹생성·인원목록) | 프로필 변경·admin 동작 |
| A7 | VM 배포: KAIST VM 서버+DB, 원격 2인 테스트 | 실기기 원격 플레이 |

### 트랙 B — 콘텐츠 (병렬, subagent 팀)
| P | 작업 | 검증 |
|---|---|---|
| B0 | 게임4~10 로직+상수 main `shared/`로 vendor-in, GameId 1~10 확장 | typecheck |
| B1 | **게임4~10 화면 7개 완전 신규 제작**(게임별 subagent, 네온 신규 UI, 로직·상수만 재사용, design-lab 참조 0) | 빌드+브라우저+자립성 테스트 |
| B2 | 매치 러너에 편입(게임 풀 = is_active 전체) | 랜덤 매치에 새 게임 등장 |

**런칭(토요일) = A0~A5 + 게임1~3.** 게임4~10(B1)·admin 확장·프로필 고도화는 직후 fast-follow.

---

## 4. 게임4~10 제작 규칙 (D13 상세)

각 게임 = 전용 subagent + 개별 지시문. 규칙:
1. `@madpump/shared`의 `gameN.create/step` + `GN` 상수 **그대로 사용**(로직 재구현 금지).
2. game-lab 렌더러 **재사용/복붙/껍데기 금지** — 화면·렌더링 **완전 신규 제작**.
3. 디자인 = `design-lab/ideas/02-neon-coinop/PLAN.md`(정본)·`theme.css`(토큰)를 **읽어서 값만 main으로 복사**. **design-lab 경로 import 절대 금지.**
4. 네온 시스템(HudFrame·KeyCap·Button·CRT베젤·theme 토큰, 이미 main에 복사됨) 재사용.
5. 게임1~3 화면을 배선 패턴 참고로 읽되 코드 복사 아님.
6. **자립성 검증**: `check-standalone.sh` + 탯줄절단(design-lab 치우고 빌드).

---

## 5. 검증 게이트 (모든 단계 공통)
- 각 단계는 **관측 가능하게 동작**한 뒤 다음으로.
- `npm run check:standalone` 상시 통과(design-lab/game-lab 참조 0).
- 온라인 판정은 "동일 입력열 재생 시 서버 결과 == 로컬 시뮬"으로 결정성 확인.
