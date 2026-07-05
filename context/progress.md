# 진행상황 (progress)

> 큰 변화가 생기면 갱신. 마지막 갱신: 2026-07-05

## ✅ 완료
- **모노레포 구현**: client(React18+Vite) / server(Fastify+Socket.IO) / shared(게임코어). 자립 구조(lab 폴더 미참조).
- **미니게임 10종**: 숫자맞추기·로켓피하기·펜싱·공룡달리기·몬스터포격전·펌프·스피드오목·마그마총격·줄다리기·라이트사이클. 코어(shared)+화면(client) 완비.
- **온라인 멀티플레이**: 서버권위 매치러너(60Hz 틱), 3라운드(라운드마다 랜덤 게임 / **색=역할은 매치당 고정**), 세션쿠키 인증, 코드방/빠른시작, 끊김=끝까지연산, 결과 game_match/game_round DB기록.
- **온라인 입력 U/I 전용**: 접속자는 U(주)·I(보조) 두 키로 자기 역할 캐릭터 조종. 하단 바가 내 역할(색) 컨트롤만 표시("YOU·파랑/빨강").
- **오목 커서**: 서버 브로드캐스트 대신 클라 로컬 파생 + 놓은 칸만 전송.
- **구글 OAuth 로그인 + 분반 리더보드**: (팀원 작업) `/api/auth/google`·`/api/auth/signup`, 분반별 전적 집계 `/api/leaderboard`. ※ 동작하려면 `GOOGLE_CLIENT_ID` env + DB 스키마 반영 필요.
- **배포**: `scripts/deploy.sh` → KAIST VM(http://172.10.8.242). `docs/DEPLOY.md`.

## 🔧 진행/확인 필요
- 구글 로그인 실동작: 클라/서버에 `GOOGLE_CLIENT_ID` 세팅 + VM DB에 OAuth 스키마(googleSub/email/group 등) 반영됐는지 확인.
- 리더보드 실집계 배선(mock→실DB) 상태 확인.

## ⬜ 남음 / 아이디어
- 인터넷 공개(현재 KAIST 내부망만) → cloudflared 등 HTTPS 터널. HTTPS면 `COOKIE_SECURE=1`.
- 프로필 이미지 최적화(p1.png 3.7MB / p2.jpeg 3.1MB — 리사이즈 필요).
- admin 콘솔.
