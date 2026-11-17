# Backend handoff — CampusFind API (for Codex)

**Repo:** https://github.com/MalikHamza007/campusfind-backend · **Target host:** `api.vspark.learn2earntech.com` · **Frontend origin:** `https://vspark.learn2earntech.com`
Follow **[`CODEX_DEPLOY.md`](CODEX_DEPLOY.md)** step by step (app slug `campusfind`, PM2 name `campusfind-api`). This page is the summary.

## What it is
Node/Express/TypeScript API with MongoDB (Atlas), a private bucket on the VPS for uploads, and an OpenStreetMap Nominatim proxy.
- Node ≥ 20 (tested on 22). `npm ci --include=dev && npm run build && npm start` → runs `dist/server.js` (`--include=dev` because TypeScript is needed for the build even if `NODE_ENV=production` is set in the shell).
- Listens on `PORT`, bind `HOST=127.0.0.1` in production (Nginx proxies to it). `trust proxy` is set from `TRUST_PROXY=1`.
- MongoDB **must be a replica set** (claim approvals use transactions) — any Atlas cluster is fine.

## Environment (owner supplies the starred values; generate the rest)
| Variable | Value in production |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` / `HOST` | free localhost port / `127.0.0.1` |
| `MONGODB_URI` ★ | Atlas SRV URI for database `campusfind`; VPS IP must be in Atlas access list |
| `CORS_ORIGINS` | `https://vspark.learn2earntech.com,http://localhost:4200` |
| `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER`, `FILE_LINK_SECRET` | `openssl rand -hex 32` (three different values) |
| `COOKIE_SECURE` | `true` |
| `COOKIE_DOMAIN` | empty (host-only cookie on the API host) |
| `TRUST_PROXY` | `1` |
| `STORAGE_DRIVER` / `STORAGE_ROOT` | `local` / `/var/lib/campusfind/storage` |
| `FILE_LINK_TTL_SECONDS` | `60` |
| `ADMIN_EMAIL` ★, `ADMIN_PASSWORD` ★ | first admin (password: 8–72 chars, upper, lower, number, symbol); remove the password after seeding |
| `SEED_STUDENT_PASSWORD` ★ | only if loading showcase data; remove after |
| `SEED_ALLOW_RESET` | `true` only for the one-time showcase seed on an empty DB, then remove |
| Others | defaults from `.env.example` are fine |

## Storage
Create `/var/lib/campusfind/storage` owned by the app user, `chmod 700`, **not** under any Nginx root/alias. The app creates `files/<yyyy>/<mm>/` itself and sweeps `.part` files at boot. Nginx `client_max_body_size 10m` (largest upload 8 MB). Never add a `location` that serves this directory.

## Health & seed
- `GET /api/health` → `{"status":"ok","db":"up",...}` (503 if Mongo is down).
- Showcase data: `node --env-file=/srv/campusfind/.env dist/scripts/seed.js` (destructive; refuses in production unless `SEED_ALLOW_RESET=true`).
- First admin only: `node --env-file=/srv/campusfind/.env dist/scripts/seed-admin.js` (idempotent).

## Production hints
New PM2 app `campusfind-api` (do not touch other apps), new Nginx vhost for `api.vspark.learn2earntech.com` → `127.0.0.1:<PORT>`, certbot for that host only, `nginx -t` before reload. Do **not** add CORS headers in Nginx — the app sends them (exact origin + `Access-Control-Allow-Credentials: true`). Cookies are `HttpOnly; Secure; SameSite=Lax; Path=/api/auth`.

## Verification (curl)
```bash
curl -s https://api.vspark.learn2earntech.com/api/health
curl -si -X OPTIONS https://api.vspark.learn2earntech.com/api/items -H "Origin: https://vspark.learn2earntech.com" -H "Access-Control-Request-Method: GET" | grep -i access-control
curl -si https://api.vspark.learn2earntech.com/api/health -H "Origin: https://evil.example" | head -1        # 403
curl -s -o /dev/null -w "%{http_code}\n" https://api.vspark.learn2earntech.com/api/auth/me                  # 401
curl -s -c /tmp/cf.jar -X POST https://api.vspark.learn2earntech.com/api/auth/login -H 'Content-Type: application/json' -d '{"email":"<admin>","password":"<pw>"}'
# then upload / signed link / 65 s expiry / RBAC / delete as described in CODEX_DEPLOY.md §8
```
Report back: API URL, git SHA, PM2 name + port, storage path + free space, Nginx file, results of every check above.
