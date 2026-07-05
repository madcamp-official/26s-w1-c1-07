# 배포 가이드

서버는 단일 프로세스로 **client/dist 정적 서빙 + REST API + Socket.IO** 를 모두 처리한다.
현재 배포처: KAIST VM (내부망) → **http://172.10.8.242**

---

## git 에 올리는 것 vs 각자 로컬(비밀)

| 구분 | 어디에 | 예시 |
|---|---|---|
| **코드 전체** | git | client / server / shared |
| **배포 스크립트** | git | `scripts/deploy.sh` |
| **배포 설정 *예시*** | git | `deploy.env.example`, `server/.env.example` |
| **로컬 개발 DB** | git | `docker-compose.yml` |
| — 아래는 **커밋 금지, 각자 보유** — | | |
| **배포 대상/포트** | 로컬 `deploy.env` | `DEPLOY_HOST`, `PORT`, `CLIENT_ORIGIN` |
| **DB 접속정보(비밀번호)** | VM 의 `server/.env` | `DATABASE_URL` |
| **SSH 개인키** | 각자 `~/.ssh/` | VM 접속키 (공개키는 VM `authorized_keys` 에 등록) |

> 원칙: 값이 **비밀**이거나 **사람마다 다르면** git 에 넣지 않는다. git 에는 *형식/예시*만.

서버가 런타임에 읽는 env: `PORT`, `CLIENT_ORIGIN`, `COOKIE_SECURE`(index.ts), `DATABASE_URL`(prisma).

---

## 공동작업자 배포 절차

1. **SSH 접근 확보(1회)**: 자기 공개키를 VM `~/.ssh/authorized_keys` 에 등록하고, `~/.ssh/config` 에 별칭 추가:
   ```
   Host kaistvm
     HostName 172.10.8.242
     User root
     IdentityFile ~/.ssh/id_ed25519
   ```
2. **배포 설정(1회)**: `cp deploy.env.example deploy.env` 후 값 확인(대개 그대로 OK).
3. **배포**: `bash scripts/deploy.sh`
   → client 빌드 → rsync(비밀 제외) → 원격 `npm install` + tmux 서버 재기동 → health 확인.

`deploy.sh` 는 `server/.env` 를 **rsync 에서 제외**하므로 VM 의 DB 설정을 덮어쓰지 않는다.

---

## VM 최초 세팅(1회 — 이미 완료됨. VM 재구축 시에만)

1. Node 20+, MySQL 8 설치. `madpump` DB/유저 생성.
2. `server/.env` 작성: `DATABASE_URL="mysql://madpump:<VM_DB_PASSWORD>@localhost:3306/madpump"`
3. 스키마 반영 + 시드: `npm --prefix server run prisma:generate && npx --prefix server prisma db push && npm --prefix server run db:seed`
4. 이후엔 `scripts/deploy.sh` 로만 갱신.

로컬에서 개발 DB가 필요하면 `docker compose up -d` (127.0.0.1:3307) 후 `server/.env` 의 `DATABASE_URL` 을 3307 로.
