# Agent Deploy Runbook

A self-contained deployment guide so **any teammate's AI agent** can deploy MADPUMP without prior context.
Do the steps top to bottom. Everything here is English-only and reproducible from committed `main`.

> TL;DR — from the repo root: `bash scripts/deploy.sh` → wait for `✅ 4/4 deploy complete` → verify both URLs below.

---

## 1. What this deploys

A **single Node process** (`server/`) that does all three at once:
- serves the built client (`client/dist`) as static files,
- serves the REST API (Fastify),
- serves the realtime match layer (Socket.IO).

There is **no separate frontend host** and **no Docker in prod** — the client is built locally and rsynced to the VM, where the server runs it.

### Where it runs / how it's reached
| Surface | URL | Path |
|---|---|---|
| Public | `https://madcade.madcamp-kaist.org` | Cloudflare tunnel → VM `localhost:8080` |
| Internal (KAIST net) | `http://172.10.8.242` | KCLOUD opens inbound `:80` → **iptables redirect** `80→8080` |

The app listens on **8080** (the cloudflared tunnel only allows ports 1024–65535, so it can't bind 80 directly). `deploy.sh` installs a kernel `iptables` `PREROUTING` redirect `80→8080` so the internal `http://172.10.8.242` (port 80) still reaches the app. That redirect is cleared on reboot/redeploy, so it is re-applied on every deploy (idempotent).

Host: KAIST VM, SSH alias **`kaistvm`** → `172.10.8.242` (user `root`), deploy path `/root/madpump`. VM hostname is `camp-9`.
> Note: `172.10.8.242` is **internal-network only** and does not answer ICMP (ping). Test reachability with SSH, not ping.

---

## 2. Prerequisites (one-time per operator)

1. **SSH access to the VM.** Your public key must be in the VM's `~/.ssh/authorized_keys`, and you need this in `~/.ssh/config`:
   ```
   Host kaistvm
     HostName 172.10.8.242
     User root
     IdentityFile ~/.ssh/id_ed25519   # your key
   ```
   Verify: `ssh -o BatchMode=yes -o ConnectTimeout=8 kaistvm 'echo SSH_OK; hostname'` → prints `SSH_OK` / `camp-9`.

2. **`deploy.env`** in the repo root (git-ignored — not committed). Copy the template and keep these values:
   ```bash
   cp deploy.env.example deploy.env
   ```
   For the current KAIST VM, `deploy.env` should read:
   ```
   DEPLOY_HOST=kaistvm
   DEPLOY_PATH=/root/madpump
   PORT=8080
   CLIENT_ORIGIN=https://madcade.madcamp-kaist.org,http://172.10.8.242
   COOKIE_SECURE=
   ```
   `CLIENT_ORIGIN` is comma-separated; the server splits it into an array for CORS + Socket.IO (public HTTPS domain **and** internal HTTP IP served at once). `COOKIE_SECURE` is **empty** so internal HTTP login still works (the public side is HTTPS and works without Secure).

3. **Node 20+** locally (for the client build) and on the VM (already installed).

### Secrets — never commit these
| Secret | Location |
|---|---|
| SSH private key | your `~/.ssh/` |
| DB connection (`DATABASE_URL` incl. password) | the VM's `server/.env` (rsync **excludes** it — never overwritten) |
| Deploy target/port | your local `deploy.env` (git-ignored) |

---

## 3. Deploy

From the repo root:
```bash
bash scripts/deploy.sh
```
It runs 4 steps and is safe to re-run:
1. **build client** — `npm --prefix client run build` (tsc + vite → `client/dist`).
2. **rsync** code to `kaistvm:/root/madpump` with `--delete`, **excluding** `node_modules`, `.git`, `design-lab`, `game-lab`, `*.log`, and all secrets (`.env`, `server/.env`, `deploy.env`).
3. **remote install + restart** — `npm install` on the VM, kill/recreate the `madpump` tmux session running `npm --prefix server run start` with `PORT/NODE_ENV/CLIENT_ORIGIN/COOKIE_SECURE`, then re-apply the `iptables` 80→8080 redirect.
4. **health check** — `curl http://localhost:8080/api/health` on the VM.

Expected tail: `✅ 4/4 deploy complete → https://madcade.madcamp-kaist.org,http://172.10.8.242`.

### Verify after deploy
```bash
# from anywhere with internet:
curl -s https://madcade.madcamp-kaist.org/api/health          # → {"ok":true,...}
# from inside the KAIST network (or via the VM):
ssh kaistvm 'curl -s http://localhost:8080/api/health'
```
A healthy response is JSON like `{"ok":true,"rooms":0,"queue":0}`.

---

## 4. Database (only when rebuilding the VM — normally skip)

The prod MySQL lives **inside the VM** (not in `docker-compose.yml`, which is local-dev only). First-time VM setup:
```bash
# on the VM, with server/.env containing DATABASE_URL="mysql://madpump:<pw>@localhost:3306/madpump"
npm --prefix server run prisma:generate
npx --prefix server prisma db push
npm --prefix server run db:seed          # seeds the 13 games + class rosters + score config
```
The seed is idempotent (upsert). After that, ship updates only via `scripts/deploy.sh`.

---

## 5. Troubleshooting

| Symptom | Check |
|---|---|
| `DEPLOY_HOST is required` | `deploy.env` missing — `cp deploy.env.example deploy.env`. |
| rsync/ssh hangs or `Permission denied` | SSH not set up — re-run the §2.1 verify command; confirm your key is in the VM's `authorized_keys`. |
| `http://172.10.8.242` times out but the tunnel works | iptables redirect missing — re-run `scripts/deploy.sh` (it re-adds it), or on the VM: `iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8080`. |
| CORS / socket errors from one origin | make sure that origin is in `CLIENT_ORIGIN` (comma-separated) in `deploy.env`, then redeploy. |
| Login works on HTTPS but not internal HTTP | `COOKIE_SECURE` must be empty (Secure cookies are dropped over plain HTTP). |
| Need server logs | `ssh kaistvm 'tail -n 100 /root/madpump/server.log'` or `ssh kaistvm 'tmux attach -t madpump'`. |

---

## 6. Quick reference

```bash
# reachability
ssh -o BatchMode=yes -o ConnectTimeout=8 kaistvm 'echo SSH_OK; hostname'
# deploy
bash scripts/deploy.sh
# health
curl -s https://madcade.madcamp-kaist.org/api/health
ssh kaistvm 'curl -s http://localhost:8080/api/health'
# logs / restart
ssh kaistvm 'tail -n 100 /root/madpump/server.log'
ssh kaistvm 'tmux kill-session -t madpump'   # deploy.sh recreates it
```
