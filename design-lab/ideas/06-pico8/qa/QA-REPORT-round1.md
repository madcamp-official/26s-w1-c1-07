# QA Report — idea-06 PICO-8 PLAYGROUND (Round 1)

- 대상: `design-lab/ideas/06-pico8` (dev 포트 5106)
- 도구: Playwright chromium headless, viewport 1280x832
- 스크립트: `qa/walk.mjs` / 스크린샷: `qa/round1/NN-*.png`
- 판정: **FAIL** — SPEC 체크리스트 실패 존재 (S12 게임3 전면 정지). 시각 붕괴 0건.

## 요약
- S1~S11 + 온라인 매칭 플로우: **전부 통과** (기능/시각 모두 양호).
- **S12 게임3: 런타임 크래시로 게임 루프가 첫 프레임에 사망 → 게임 진행 불가 (BLOCKER).**
- 경미한 시각 이슈 1건(S5 중복 에러 텍스트 대비 부족).

---

## 화면별 체크리스트 결과

### S1 메인 비로그인 — 통과 (01-s1-main-out.png)
- QA-S1-01~08: MADPUMP 타이틀(글자별 다색), SIGN IN WITH GOOGLE(+G 로고), 온/오프라인 버튼, 설정 키캡 모두 표시. btn-online→S3 모달, btn-google-login→S5, btn-offline→S8, btn-settings→S4 정상.

### S3 로그인 요구 모달 — 통과 (02-s3-login-required.png)
- QA-S3-01~04: "온라인 게임은 로그인이 필요합니다!" 문구, 모달 내 구글 로그인 + 취소하기 표시. 모달 로그인→온보딩(온라인 의도 승계) 정상.

### S5 닉네임 온보딩 — 통과 (03-s5-onboarding.png, 04-s5-dup-error.png)
- QA-S5-01~06: 이름/분반 입력 + 확인 표시. 중복('펌프광인')→err-nickname-dup 표시, 이름 수정 시 에러 해제, 빈 값 제출 방지(disabled), 유니크 제출→S2 이동+인사말 반영.

### S2 로그인 후 메인 — 통과 (05-s2-main-in-leaderboard.png)
- QA-S2-01~08: 닉네임 인사말, 로그아웃, RANKING·1분반 리더보드(TOP3 P/W/W% + 트로피), 내 등수 행(▶YOU 하이라이트), 온/오프라인 버튼 모두 정상.

### S4 설정 모달 — 통과 (06-s4-settings.png)
- QA-S4-01~06: OPTIONS 타이틀, 라운드 수/라운드 당 시간 스테퍼([-]/[+]+number), 단위(round/초), 확인/기본값. 값 변경(2라운드/6초) 저장 후 재오픈 시 유지 확인. 게임 화면 카운트다운이 6으로 표시되어 **설정값 실제 반영 확인**.

### S6 온라인 패널 — 통과 (07-s6-online-code.png)
- QA-S6-01~08: 빠른 시작 CTA, 코드 생성하기(생성 시 11자리 숫자 표시: 66224012647), 복사/톱니, 코드 입력+확인 표시. 빠른 시작→S7 매칭 전환 정상.

### S7 매칭 상태 모달 — 통과 (08-s7-matching-connecting.png, 09-s7-matching-waiting.png)
- QA-S7-01~04: connecting("게임에 접속 중입니다") → waiting("플레이어 대기 중" + 취소하기) → 봇 매칭 성사 → 인게임 자동 전환. 취소 버튼은 waiting 단계에만 노출(원안 충실).

### 온라인 인게임 진입 — 통과 (10-online-ingame.png)
- 봇 매칭 후 game2로 진입. P1=큐에이봇 ▶YOU(블루), P2=질주본능(레드) 색 구분. btn-exit→메인 복귀 정상.

### S8 게임 선택 — 통과 (11-s8-game-select.png)
- QA-S8-01~04: 카트리지 3종(PUMP IT!/DODGE!/EN GARDE!, 시그니처 컬러+도트아트+단자 빗살), ◀BACK(메인 복귀), 즉시 인게임 진입(매칭 없음).

### S9 게임1 숫자 맞추기 — 통과 (12-s9-game1-play.png, 13-s9-game1-result.png, 14-s9-game1-match-result.png)
- QA-S9-01~12: 좌우 프로필, TARGET(53), P1/P2 게이지 탑+현재숫자+유지 하트, 색 구분, 카운트다운(매초 감소), q/w·u/i 조작, 배정숫자≠타겟, 타겟 일치 3초 유지→P1 승리(result=P1_WIN, "P1 WIN!"), 다음 라운드→라운드2→매치 종료("P1 WINS THE MATCH!"). 라운드 반복(2라운드) 및 결과 표시 정상.

### S10·S11 게임2 총알 피하기 — 통과 (15-s10-game2-play.png, 16-s10-game2-result.png)
- QA-S10-01~12: 상단 P1(블루 UFO)/하단 P2(레드) 트랙, ATTACKER/DODGER 라벨, 카운트다운, 발사/이동 조작. 플레이 중 P2 피격→P1 라운드 승("P1 WIN!") 판정 정상. Q/W·U/I 온스크린 패드 표시.
- (walk 한계) 라운드가 피격으로 빨리 종료돼 순수 진행 중 스크린샷은 결과 오버레이에 가려짐 — 앱 결함 아님.

### S12 게임3 펜싱 — **실패 (BLOCKER)** (17-s12-game3-play.png, 18-s12-game3-result.png)
- 시각 렌더는 완벽(좌 블루/우 레드 펜서, 그린 칸 무대, 좌우 바다, JUDGE 틱바, 카운트다운, Q/W·U/I 패드).
- **그러나 게임 루프가 첫 프레임에 크래시하여 시뮬레이션이 전혀 진행되지 않음.**
  - 콘솔 pageerror: `dtMs must be >= 0` (shared `game3.ts:199` 가드가 throw).
  - 17번(play)과 18번(result) 스크린샷이 **완전히 동일** — 카운트다운 6 고정, 스코어 0-0, 캐릭터 이동 없음. `window.__MADPUMP__.game.elapsedMs`가 계속 0.
  - P1 공격(q) 반복에도 밀림/링아웃/result-overlay가 발생하지 않음.
- **원인**: `src/screens/game/Game3.tsx:307-308`
  ```
  const frame = (now) => {           // now = requestAnimationFrame 타임스탬프
    const dt = Math.min(100, now - last);   // last = performance.now() (306행)
  ```
  rAF 콜백의 `now`(프레임 시작 시각)가 effect에서 읽은 `last`(performance.now())보다 **작을 수 있어 dt가 음수**가 됨. 음수 dt가 `tickGame3`의 가드에 걸려 throw → throw가 `raf = requestAnimationFrame(frame)`(354행) 앞에서 발생하므로 **루프가 재스케줄되지 않고 영구 정지**.
  - 비교: Game1은 `Math.max(0, now-last)`로 클램프(정상), Game2는 양 끝점 모두 `performance.now()` 사용(정상). Game3만 음수 방어 없음.
- **영향받는 체크리스트**: QA-S12-02(카운트다운 감소 안 함), QA-S12-03~11(틱 판정/밀림 상성/링아웃/타임아웃 전부 미동작). QA-S12-01/S12-12의 정적 렌더만 부분 통과.
- **수정 제안(1줄)**: `const dt = Math.min(100, Math.max(0, now - last));`

---

## 시각 이슈
1. (경미) S5 온보딩 중복 에러 문구 "이미 사용하고 있는 이름입니다"가 `--danger(#FF004D)` on `--surface 퍼플(#7E2553)` 조합으로 **대비 부족, 가독성 낮음** (04-s5-dup-error.png). 기능은 정상. 밝은 색/배경 대비 상향 권장.

## 콘솔 에러
- game3 진입 시 `dtMs must be >= 0` (위 BLOCKER). 그 외 화면에서 console.error/pageerror 없음.
