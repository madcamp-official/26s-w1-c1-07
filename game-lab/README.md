# MADPUMP — 로컬 2인 1:1 미니게임 대전

한 키보드로 두 명이 겨루는 웹 미니게임 3종. 각 판 10초.
P1 = `Q` `W` / P2 = `U` `I` (판정은 `e.code` 기준이라 한글 IME 상태와 무관).

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc --noEmit + vite build
```

## 구조

npm workspaces 모노레포.

```
shared/   게임 코어 = 순수 로직  (state, inputs, dt) => newState  — DOM/소켓 의존 없음
client/   Vite + React. React는 화면 전환·오버레이·프로필만, 게임 루프는 Canvas 2D + rAF
```

게임 하나 = **순수 코어 + 렌더러 + 레지스트리** 세 조각으로 분리.

```
shared/src/
├─ index.ts                공개 API (코어 3종 + 게임3 엔진 타입)
└─ games/
   ├─ types.ts             GameCore, GameInputEvent, GameResult, GAME_DURATION=10
   ├─ game1/logic.ts       숫자 맞추기 (누적 속도 게이지)
   ├─ game2/logic.ts       로켓 피하기 (3방향 발사 + HP)
   └─ game3/
      ├─ core.ts           makeGame3(config) 펜싱 엔진
      └─ logic.ts          게임3 설정(G3) → 코어 생성

client/src/
├─ App.tsx / main.tsx      라우팅 (/  ,  /game/:id)
├─ index.css               메인·게임 화면·프로필 스타일
├─ input/keyboard.ts       로컬 2인 입력 (code+타임스탬프, e.repeat 무시 = 연타만 인정)
├─ ui/MainScreen.tsx       게임 3버튼
├─ ui/GameScreen.tsx       캔버스 게임 루프 + 프로필 + HUD
└─ games/
   ├─ registry.ts          id → { core, render, 안내, profiles }
   ├─ render1.ts / render2.ts / render3.ts
   └─ fencerPose.ts        게임3 캐릭터 치수 + 회피 포즈 곡선
```

게임 코어는 `rand`를 주입받는 순수·결정적 모듈이라, 온라인 모드 추가 시 `server/`
워크스페이스를 만들어 같은 `shared/` 코어로 서버 권위 판정에 재사용할 수 있다.

프로필 사진은 `client/public/profiles/p1.png`(P1)·`p2.jpeg`(P2). 교체하려면 이 두 파일만 바꾸면 된다.

## 게임 규칙

공통: 진입 즉시 "START !" 플래시와 함께 시작 → 10초 카운트다운 →
결과(P1 승 / P2 승 / DRAW) 3초 표시 → 메인 복귀. 좌우에 플레이어 프로필 표시.

**게임1 · 숫자 맞추기** — 타겟/시작 숫자 `[1,1000]` 랜덤(타겟 ≠ 시작).
각 플레이어에 속도 게이지(0~100%). 키를 누르면(keydown) 게이지 **+30%p 누적**(최대 100),
그리고 게이지는 항상 `dg/dt = -16·√g` 로 감쇠. 넘버 증감 속도 = `rate × (게이지/30)`
(게이지 30%면 기준 속도, 100%면 ~3.3배). ⇒ 꾹 누르면 사그라들고 **연타할수록 빨라진다**.
`Q`/`U` 감소, `W`/`I` 증가. **타겟에 맞춘 채 손 떼고 1초 정지하면 승리.**
아무도 못 멈추면 10초 종료 시 더 가까운 쪽 승, 같으면 DRAW.

**게임2 · 로켓 피하기** — 비대칭 대결.
P1(발사대)은 상단을 좌우로 스캔하며 `Q` 방향 반전, `W`로 3방향 부채꼴 발사(쿨 0.25초).
로켓은 개별 랜덤 속도(600~800) + 측벽 1회 반사. P2는 `U`/`I`로 빠르게 좌우 이동,
체력 **HP 3**(피격 시 0.45초 무적). P2 HP 0 → P1 승, 10초 생존 → P2 승.

**게임3 · 펜싱** — 줄다리기 모델: 넉백당한 만큼 상대가 전진, 링 밖으로 밀리면 낙사.
`Q`/`U` 공격(랜덤 시동 딜레이 0.04~0.18초), `W`/`I` 회피(무적창). 공격창에 상대 회피가
겹치면 공격자 넉백(PARRIED), 안 겹치면 피격자 넉백(HIT), 빗나간 회피는 회피자 넉백(WHIFF).
회피 모션 3종(상반신 젖히기 / 허리 꺾기 / 다리찢기)은 매 회피마다 랜덤. 심화 레이어로
**밀물+템포 가속**(시간이 갈수록 링이 좁아지고 쿨타임↓), **리포스트-브레이크**(성공 패링 시
즉발 반격창 + 콤보), **서지-넉백**(경과시간 곡선으로 넉백 배율 초반 ×0.75 → 막판 ×2.1)이 얹혀
"밀당 개막 → 막판 폭발" 아치를 만든다. 링아웃 즉시 승리, 10초 만료 시 접점이 상대 진영에
있는 쪽 승, 정중앙이면 DRAW.
