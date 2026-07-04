# QA Report — idea-06 PICO-8 PLAYGROUND (Round 2)

- 대상: `design-lab/ideas/06-pico8` (dev 포트 5106)
- 도구: Playwright chromium headless, viewport 1280x832
- 스크립트: `qa/walk.mjs` / 스크린샷: `qa/round2/NN-*.png`
- 판정: **PASS** — SPEC 체크리스트 실패 0건, 시각 붕괴 0건.

## 요약
- 자동 워크스루 19단계 전부 통과 (`failures: 0`).
- **Round 1 BLOCKER(S12 게임3 크래시) 수정 확인** — `Game3.tsx:308`이 `Math.min(100, Math.max(0, now - last))`로 음수 dt를 클램프. 게임3가 정상 진행되어 링아웃 판정(RING_OUT)까지 도달.
- **Round 1 경미 시각 이슈(S5 중복 에러 대비 부족) 수정 확인** — 에러 문구가 `--danger` 채움 배경 + 흰 텍스트(픽셀폰트)로 변경되어 고대비 가독 확보 (04-s5-dup-error.png).
- 신규 결함 없음.

---

## 화면별 체크리스트 결과

### S1 메인 비로그인 — 통과 (01-s1-main-out.png)
- QA-S1-01~08: MADPUMP 글자별 다색 타이틀, `PRESS ANY BUTTON TO PUMP` 점멸 태그, SIGN IN WITH GOOGLE(+G 로고), 온/오프라인 CTA, 설정 키캡 표시. btn-online→S3 모달, btn-google-login→S5, btn-offline→S8, btn-settings→S4 정상.

### S3 로그인 요구 모달 — 통과 (02-s3-login-required.png)
- QA-S3-01~04: `LOGIN REQUIRED!` 타이틀 + 자물쇠 스프라이트, "온라인 게임은 로그인이 필요합니다!" 문구, 모달 내 구글 로그인 + 취소하기. 모달 로그인→온보딩(온라인 의도 승계) 정상.

### S5 닉네임 온보딩 — 통과 (03-s5-onboarding.png, 04-s5-dup-error.png)
- QA-S5-01~06: `NEW PLAYER!` + "What's your name?", 이름/분반 입력 2행, 빈 값 제출 방지(확인 disabled + "이름과 분반을 모두 입력하세요"), 신입 캐릭터 스프라이트. 중복('펌프광인')→err-nickname-dup(고대비 채움 배경), 수정 시 에러 해제, 유니크 제출→S2 이동 + 인사말 반영.

### S2 로그인 후 메인 — 통과 (05-s2-main-in-leaderboard.png)
- QA-S2-01~08: 닉네임 인사말, 로그아웃, RANKING·1분반 그린 리더보드(TOP3 P/W/W% + 트로피 스프라이트), 내 등수 행(▶YOU 오렌지 링 하이라이트), 온/오프라인 CTA 정상.

### S4 설정 모달 — 통과 (06-s4-settings.png)
- QA-S4-01~06: OPTIONS 타이틀, 라운드 수/라운드 당 시간 스테퍼([-]/[+]+number), 단위(round/초), 확인/기본값. 값 변경(2라운드/6초) 저장→재오픈 유지 확인. 게임 카운트다운 6 표시로 **설정값 실제 반영 확인**.

### S6 온라인 패널 — 통과 (07-s6-online-code.png)
- QA-S6-01~08: QUICK START 빠른 시작 CTA(번개), 코드 생성(11자리: 11118896502 옐로), 복사/톱니 키캡, 코드 입력+확인. 빠른 시작→S7 매칭 전환 정상. 코드 미생성 시 복사 disabled 규칙 준수.

### S7 매칭 상태 모달 — 통과 (08-s7-matching-connecting.png, 09-s7-matching-waiting.png)
- QA-S7-01~04: connecting("게임에 접속 중입니다", NOW LOADING) → waiting("플레이어 대기 중" + 블루 캐릭터 VS ? 슬롯 + 취소하기) → 봇 매칭 성사 → 인게임 자동 전환. 취소 버튼 waiting 단계에만 노출.

### 온라인 인게임 진입 — 통과 (10-online-ingame.png)
- 봇 매칭 후 game3로 진입. P1=큐에이봇 ▶YOU(블루), P2=펌프광인(레드) 색 구분, JUDGE 틱바, 카운트다운, Q/W(블루 링)·U/I(레드 링) 패드. btn-exit→메인 복귀 정상.

### S8 게임 선택 — 통과 (11-s8-game-select.png)
- QA-S8-01~04: SELECT YOUR GAME + ◀BACK, 카트리지 3종(PUMP IT!/DODGE!/EN GARDE!, 시그니처 컬러 라벨+도트아트+단자 빗살), 하단 안내 바. 즉시 인게임(매칭 없음), 로그인 무관 도달.

### S9 게임1 숫자 맞추기 — 통과 (12-s9-game1-play.png, 13-s9-game1-result.png, 14-s9-game1-match-result.png)
- QA-S9-01~12: P1/P2 프로필, TARGET 대형 옐로 판넬, 좌(블루)/우(레드) 세로 게이지 탑+현재숫자+유지 하트 3칸, 색 구분, 카운트다운(매초 감소), q/w·u/i 조작, 배정숫자≠타겟. 타겟 일치 3초 유지→P1 승리(result=P1_WIN, "P1 WIN!"). 다음 라운드→라운드2→매치 종료("P1 WINS THE MATCH!"). 라운드 반복(2R) 및 결과 표시 정상.

### S10·S11 게임2 총알 피하기 — 통과 (15-s10-game2-play.png, 16-s10-game2-result.png)
- QA-S10-01~12: 상단 P1(블루 UFO 자동 왕복)/하단 P2(레드) 트랙, ATTACKER·Q/W / DODGER·U/I 라벨, 카운트다운, 발사/이동 조작. 플레이 중 P2 피격→P1 라운드 승("P1 WIN!") 판정 정상.
- (walk 한계, 앱 결함 아님) 라운드가 피격으로 빨리 종료돼 순수 진행 스크린샷(15)이 결과 오버레이에 가려짐. 오버레이 뒤로 상/하 트랙·캐릭터는 정상 렌더 확인됨.

### S12 게임3 펜싱 — **통과 (Round 1 BLOCKER 해소)** (17-s12-game3-play.png, 18-s12-game3-result.png)
- QA-S12-01~12: 좌 블루/우 레드 펜서(찌르기 포즈), 8칸 그린 무대 + 좌우 블루 바다, JUDGE 틱바, 카운트다운(정상 감소), Q/W·U/I 검·방패 패드.
- **게임 루프 정상 진행 확인**: P1 공격(q) 반복 → P2 밀림 → 링아웃. `resultReason=RING_OUT`, `result=P1_WIN`, "P1 WIN!" + SPLASH! 낙하 연출(레드 캐릭터가 바다로 추락)까지 정상 도달 (18).
- Round 1의 `dtMs must be >= 0` 크래시 재현 안 됨(콘솔 pageerror 0건). 수정처: `src/screens/game/Game3.tsx:308` 음수 dt 클램프.

### 메인 복귀 — 통과 (19-k-back-to-main.png / 19b-back-settled.png)
- 게임3 종료 후 btn-back-main→scr-main-in 복귀. bridge.screen=scr-main-in assert 통과.

---

## 시각 이슈
- **없음.** Round 1의 S5 중복 에러 대비 부족 이슈는 해소됨(채움 배경 고대비).

## 참고 (앱 결함 아님)
1. 스크린샷 `19-k-back-to-main.png`가 스테이터스 바만 남고 본문이 비어 보임 — **QA 하네스 타이밍 아티팩트**. walk가 `scr-main-in` waitFor 직후 0ms에 캡처하여 PLAN §1.4의 화면 전환 스냅인(steps(4) 200ms, 콘텐츠가 아래서 위로 스냅) 중간 프레임을 잡음. 600ms 세틀 후 재캡처(`19b-back-settled.png`)에서 타이틀·인사말·메뉴·리더보드 전부 정상 렌더 확인. 앱 렌더링 결함 아님.
2. 게임2 순수 진행 스크린샷이 결과 오버레이에 가려지는 것도 walk 진행 속도 문제(라운드 조기 종료)로, 앱 결함 아님.

## 콘솔 에러
- 전 화면 console.error/pageerror 0건 (Round 1의 game3 dtMs 에러 사라짐).
