# 구조 & 핵심 계약 (architecture)

## 레이어
```
shared/  게임코어 10종(순수 tick) + 입력계약 + 소켓 이벤트/타입   ← client·server 공용
client/  React SPA. 화면·캔버스 렌더 + 온라인 넷코드(소켓 스토어/훅)
server/  Fastify+Socket.IO 단일 프로세스. 세션·매치러너·Prisma
```

## 게임코어 계약 (shared/src/games)
- `GameCore { create(rand) → state, step(state, GameInputEvent[], dt) → state }`. 순수함수, I/O 없음.
- `GameInputEvent { code:'KeyQ'|'KeyW'|'KeyU'|'KeyI', type:'down'|'up', t, cell? }`. `cell`은 오목 등에서만.
- `GameResult = 'P1'|'P2'|'DRAW'|null`. `GAME_DURATION=10`. 오프라인·온라인이 같은 코어 공유.
- 레지스트리: `shared/src/games/registry.ts`의 `GAME_CORES`(1~10).

## 온라인 넷코드 (서버권위)
- 클라 → 서버: `game:input`(입력키만). 서버가 슬롯(A/B)→역할 물리키로 재기입.
- 서버 → 클라: `game:state`(투영 상태, seed 제거) 60Hz. 클라는 그걸 그리기만.
- 매치: `server/src/match.ts` `MatchRunner`. 3라운드, 라운드마다 랜덤게임, 색(역할)=매치당 고정.
- 소켓 봉투/이벤트명: `shared/src/net/events.ts`(`EV`).

## 인증 / 세션
- 세션쿠키(`mp_session`, httpOnly). 소켓 핸드셰이크도 같은 쿠키로 인증.
- 로그인: `/api/dev/login`(닉네임 스텁) + 구글 OAuth(`/api/auth/google`·`/api/auth/signup`, `GOOGLE_CLIENT_ID` 필요).

## DB (Prisma + MySQL)
- 스키마: `server/prisma/schema.prisma`. 유저(AppUser, googleSub/email/nickname/group), game_match(playerA/B, result), game_round.
- 라이브=역할 P1/P2, DB=슬롯 A/B. 접속: `DATABASE_URL`(server/.env).

## 클라 화면
- 라우트: `/`(메인) `/onboarding` `/select` `/game/1~10`. `App.tsx`.
- 온라인 매치 네비/오버레이: `client/src/net/OnlineController.tsx`. 온라인 스토어: `net/online.ts`, 훅 `useOnlineGame`.
- "내 색(YOU)" 표시: `getPlayerDisplays()`(state/flow.ts)가 온라인 역할을 읽어 판정.

## 자립성 규칙
main(client/server/shared)은 `design-lab`/`game-lab`을 **참조 금지**. 값이 필요하면 복사. 가드: `npm run check:standalone`.
