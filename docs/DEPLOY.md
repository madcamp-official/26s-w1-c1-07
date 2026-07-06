# Deployment Guide

The server handles **static serving of client/dist + REST API + Socket.IO** all in a single process.
Current deployment target: KAIST VM (internal network) → **http://172.10.8.242**

---

## What goes into git vs each person's local (secrets)

| Category | Where | Example |
|---|---|---|
| **All code** | git | client / server / shared |
| **Deploy script** | git | `scripts/deploy.sh` |
| **Deploy config *example*** | git | `deploy.env.example`, `server/.env.example` |
| **Local dev DB** | git | `docker-compose.yml` |
| — below is **do not commit, each person keeps** — | | |
| **Deploy target/port** | local `deploy.env` | `DEPLOY_HOST`, `PORT`, `CLIENT_ORIGIN` |
| **DB connection info (password)** | VM's `server/.env` | `DATABASE_URL` |
| **SSH private key** | each person's `~/.ssh/` | VM access key (public key registered in VM `authorized_keys`) |

> Principle: if a value is **secret** or **differs per person**, don't put it in git. Only the *format/example* goes in git.

Env the server reads at runtime: `PORT`, `CLIENT_ORIGIN`, `COOKIE_SECURE` (index.ts), `DATABASE_URL` (prisma).

---

## Collaborator deployment procedure

1. **Secure SSH access (once)**: register your public key in the VM's `~/.ssh/authorized_keys`, and add an alias to `~/.ssh/config`:
   ```
   Host kaistvm
     HostName 172.10.8.242
     User root
     IdentityFile ~/.ssh/id_ed25519
   ```
2. **Deploy config (once)**: run `cp deploy.env.example deploy.env`, then check the values (usually fine as-is).
3. **Deploy**: `bash scripts/deploy.sh`
   → build client → rsync (excluding secrets) → remote `npm install` + restart tmux server → health check.

`deploy.sh` **excludes `server/.env` from rsync**, so it doesn't overwrite the VM's DB settings.

---

## VM initial setup (once — already done. Only when rebuilding the VM)

1. Install Node 20+, MySQL 8. Create the `madpump` DB/user.
2. Write `server/.env`: `DATABASE_URL="mysql://madpump:<VM_DB_PASSWORD>@localhost:3306/madpump"`
3. Apply schema + seed: `npm --prefix server run prisma:generate && npx --prefix server prisma db push && npm --prefix server run db:seed`
4. After that, update only via `scripts/deploy.sh`.

If you need a dev DB locally, run `docker compose up -d` (127.0.0.1:3307), then set `DATABASE_URL` in `server/.env` to 3307.
