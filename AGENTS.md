# AGENTS.md — MADPUMP

AI 에이전트가 이 레포에서 작업하기 전에 읽는 진입점. (사람도 읽으면 좋음)
**세션 시작 시 `context/` 폴더를 먼저 읽어라** — 지금까지의 진행상황·결정·누가 뭘 하는지가 거기 있다.

## 이 프로젝트가 뭔가
1v1 2버튼(온라인=U·I) 미니게임 대전. npm workspaces 모노레포.
- `shared/` — 게임코어 10종(순수 `tick`)+통합 입력계약+소켓 이벤트/타입 (`@madpump/shared`)
- `client/` — React18+Vite SPA. 화면·캔버스 렌더·온라인 넷코드
- `server/` — Fastify+Socket.IO 단일 프로세스. 세션쿠키 인증·서버권위 매치러너·Prisma(MySQL)
- `docs/` — 명세(API_SPEC/MERGE_PLAN/BUILD_PLAN/ERD/DEPLOY)
- `context/` — **진행상황·결정·현재작업** (에이전트 공유 컨텍스트)
- `design-lab/`, `game-lab/` — 참고용 실험 폴더. **main 코드는 이걸 참조하면 안 됨**(삭제해도 빌드돼야 함)

## 명령어
```bash
npm install                              # 루트에서 1회 (workspaces)
npm run dev -w @madpump/client           # 클라 개발 → localhost:5173
npm --prefix server run dev              # 서버 개발(tsx watch) → localhost:3000
npm --prefix client run build            # 클라 프로덕션 빌드(client/dist)
npm --prefix shared run typecheck        # 타입체크 (shared/server/client 각각)
npm --prefix server run typecheck
npm --prefix client run typecheck
npm run check:standalone                 # 자립성 가드(main이 lab 폴더 참조 안 하는지)
bash scripts/deploy.sh                   # 배포 (먼저 cp deploy.env.example deploy.env)
```
DB: `docker compose up -d`(로컬 MySQL 3307) / prisma는 `server/`에서(`npm --prefix server run prisma:generate`, `db:seed`). 배포는 `docs/DEPLOY.md` 참고.

## 코드 컨벤션
- 게임 로직/판정은 **`shared` 코어만** 사용(재구현 금지). 화면은 캔버스 직접 렌더.
- 온라인 입력은 **U/I 두 키만**. 서버가 슬롯→역할 물리키로 재기입(안티치트).
- 넷코드 = 서버권위 "덤 클라"(예측 없음). 클라는 서버 state를 그리고 입력만 전송.
- 주변 코드 스타일·주석 밀도·네이밍을 그대로 따를 것.

## 경계
- ✅ 항상: 커밋 전 `typecheck` + `build` + `check:standalone` 통과 확인. 작업 전 `git pull`.
- ⚠️ 물어보고: `git push`, 배포(`deploy.sh`), **공유 VM DB 마이그레이션/리셋**, 외부로 나가는 행위.
- 🚫 절대: `.env`·`deploy.env`·SSH키 등 **비밀 커밋 금지**. main에서 `design-lab`/`game-lab` 참조 금지.

## 커밋
- 작은 단위로. 메시지는 한국어(레포 관습). push 전 `git pull --rebase`.
- 여럿(사람+여러 AI)이 같은 main을 만진다 → `context/now.md`에 **지금 뭐 하는지** 적고 시작할 것.

## 배포처
KAIST VM(내부망) → **http://172.10.8.242**. 서버가 client/dist 정적서빙+API+소켓 단일 프로세스.
