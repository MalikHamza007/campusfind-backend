# CODEX DEPLOYMENT RUNBOOK — Backend API + private bucket storage

You (Codex) have access to the owner's Hostinger KVM2 VPS (~100 GB disk). Deploy the Node/Express API from the **backend repo** and create its
**private bucket storage**. Follow this file top to bottom. Other apps already run on this server: **never modify, restart or remove them.**

Placeholders — fill from the backend repo's `BACKEND_HANDOFF.md` / `.env.example`; ask the owner ONLY for secrets you cannot generate:
`campusfind` = short slug (e.g. `clinic`) · `https://github.com/MalikHamza007/campusfind-backend.git` · `<API_HOST>` = `api.vspark.learn2earntech.com` · `<PORT>` = a free localhost port ·
`<FRONTEND_ORIGIN>` = `https://vspark.learn2earntech.com`.

## 0. Rules
1. Inspect before changing. Back up any file before editing it (`cp file file.bak-$(date +%F)`).
2. Never touch other PM2 apps, Nginx vhosts, certificates, databases or firewall rules. No `pm2 delete all`, no `pm2 restart all`, no `nginx` edits outside the new vhost file.
3. Never print secrets (env values, tokens) in output or commit them. Generate secrets with `openssl rand -hex 32`.
4. Backend code, `.env` and storage are never placed under any web root (Hostinger `public_html`, Nginx `root`). The frontend is deployed separately by the owner.
5. Stop and report if something unexpected blocks you (port in use, DNS missing, MongoDB unreachable) instead of improvising destructively.

## 1. Inspect (read-only)
```bash
node -v; npm -v; pm2 list; df -h /; free -h
sudo nginx -T 2>/dev/null | grep -E "server_name|listen|proxy_pass" | sort -u   # existing sites/ports
ss -tlnp | grep LISTEN                                                           # pick unused <PORT>
dig +short <API_HOST>                                                            # must be this server's IP
```
Need Node >= 20 (use the version already installed; if missing, install via nvm for the app user, not system-wide). If DNS for `<API_HOST>` is not
pointing at the server, report it to the owner (A record) and continue with the non-DNS steps.

## 2. App user and directories
```bash
sudo adduser --system --group --home /srv/campusfind campusfind          # skip if exists
sudo mkdir -p /srv/campusfind/app /var/lib/campusfind/storage
sudo chown -R campusfind:campusfind /srv/campusfind /var/lib/campusfind
sudo chmod 750 /srv/campusfind
```

## 3. Private bucket storage (create it)
The "bucket" is a private directory served ONLY through the API's authenticated 60-second signed links — never by Nginx.
```bash
sudo mkdir -p /var/lib/campusfind/storage/files
sudo chown -R campusfind:campusfind /var/lib/campusfind/storage
sudo chmod 700 /var/lib/campusfind/storage /var/lib/campusfind/storage/files
sudo -u campusfind sh -c 'echo ok > /var/lib/campusfind/storage/.write-test && rm /var/lib/campusfind/storage/.write-test' && echo "writable by app user"
df -h /var/lib/campusfind                                           # confirm free space (target quota: <= 20 GB for this app)
```
- Must NOT be under `/var/www`, `public_html`, or any Nginx `root`/`alias`. Verify: `sudo nginx -T | grep -n "/var/lib/campusfind"` returns nothing.
- Optional nightly backup (owner approval): `tar czf /var/backups/campusfind-storage-$(date +%F).tgz -C /var/lib/campusfind storage` via cron, keep 7.
- Env: `STORAGE_DRIVER=local`, `STORAGE_ROOT=/var/lib/campusfind/storage`.

## 4. Database
Use the `MONGODB_URI` the owner provides (MongoDB Atlas, or an already-secured existing server). Do NOT install or expose a new MongoDB on this
server without explicit owner approval. If Atlas: ensure this server's public IP is in the Atlas IP access list (owner does this in Atlas if you lack access).
Test connectivity from the server before starting the app.

## 5. Get code and configure
```bash
sudo -u campusfind git clone https://github.com/MalikHamza007/campusfind-backend.git /srv/campusfind/app        # or `git pull` if it exists
cd /srv/campusfind/app && sudo -u campusfind npm ci --include=dev && sudo -u campusfind npm run build
sudo -u campusfind install -m 600 /dev/null /srv/campusfind/.env   # create empty env, chmod 600
```
Fill `/srv/campusfind/.env` from `.env.example` — production values:
```
NODE_ENV=production
PORT=<PORT>
HOST=127.0.0.1
MONGODB_URI=<from owner>
CORS_ORIGINS=<FRONTEND_ORIGIN>,http://localhost:4200
JWT_ACCESS_SECRET=<openssl rand -hex 32>
REFRESH_TOKEN_PEPPER=<openssl rand -hex 32>
FILE_LINK_SECRET=<openssl rand -hex 32>
STORAGE_DRIVER=local
STORAGE_ROOT=/var/lib/campusfind/storage
FILE_LINK_TTL_SECONDS=60
COOKIE_SECURE=true
COOKIE_DOMAIN=
TRUST_PROXY=1
BCRYPT_ROUNDS=12
UNIVERSITY_NAME=Green Valley State University
ALLOWED_EMAIL_DOMAINS=campusfind.edu.pk
CAMPUS_BOUNDS=31.4900,74.3000,31.5500,74.4000
NOMINATIM_USER_AGENT=CampusFind/1.0 (university lost-and-found; https://github.com/MalikHamza007/campusfind-backend)
ADMIN_EMAIL=<from owner>
ADMIN_PASSWORD=<from owner, then remove from env after seeding>
SEED_STUDENT_PASSWORD=<from owner, only if loading the showcase data; remove after>
SEED_ALLOW_RESET=<true ONLY for the first showcase seed, then remove>
```
Then seed once (compiled scripts, no dev dependencies needed):
- Showcase data for judging (wipes CampusFind collections — empty DB only): `cd /srv/campusfind/app && sudo -u campusfind node --env-file=/srv/campusfind/.env dist/scripts/seed.js`
- Or only the first super admin (idempotent, safe on every deploy; promotes an existing `ADMIN_EMAIL` account to super_admin): `sudo -u campusfind node --env-file=/srv/campusfind/.env dist/scripts/seed-admin.js`

Afterwards delete `ADMIN_PASSWORD`, `SEED_STUDENT_PASSWORD` and `SEED_ALLOW_RESET` from the env file.

## 6. PM2 (new, isolated process)
```bash
sudo -u campusfind pm2 start dist/server.js --name campusfind-api --cwd /srv/campusfind/app --env production \
  --node-args="--env-file=/srv/campusfind/.env"        # or an ecosystem file that loads /srv/campusfind/.env
sudo -u campusfind pm2 save
pm2 list                                           # other apps must be untouched
curl -s http://127.0.0.1:<PORT>/api/health
```
Boot persistence (`pm2 startup`) only if the existing apps already use it and it will not disturb them; otherwise tell the owner.

## 7. Nginx (new vhost only) and TLS
Create `/etc/nginx/sites-available/campusfind-api` (symlink into `sites-enabled`):
```nginx
server {
  listen 80;
  server_name <API_HOST>;
  client_max_body_size 10m;                         # largest upload is 8 MB (claim evidence)
  location / {
    proxy_pass http://127.0.0.1:<PORT>;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
```
```bash
sudo nginx -t && sudo systemctl reload nginx        # NEVER reload if -t fails
sudo certbot --nginx -d <API_HOST> --redirect        # only when DNS resolves here; do not touch other certs
```
Do not add CORS headers in Nginx — the app handles CORS (avoids duplicate headers).

## 8. Verify (all must pass; paste results, redact secrets)
```bash
curl -s https://<API_HOST>/api/health                                   # {"status":"ok","db":"up"}
curl -si -X OPTIONS https://<API_HOST>/api/health -H "Origin: <FRONTEND_ORIGIN>" \
  -H "Access-Control-Request-Method: GET" | grep -i "access-control"    # allow-origin = <FRONTEND_ORIGIN>, allow-credentials: true
curl -si https://<API_HOST>/api/health -H "Origin: https://evil.example" | head -1   # 403
curl -s -o /dev/null -w "%{http_code}\n" https://<API_HOST>/api/auth/me              # 401 without a session
```
Then, with a seeded student and the admin (see `docs/LIVE_STORAGE_CHECK.md` for the exact sequence used locally):
login (`POST /api/auth/login`) → upload a small PNG (`POST /api/files`, multipart `purpose=item_image`) and a PDF (`purpose=claim_evidence`) → the response contains a 60 s `url` (or `POST /api/files/:id/signed-url`) → fetch `https://<API_HOST><url>` (200, correct Content-Type, `nosniff`, `no-store`) → wait 65 s and fetch again (410) → a different student requesting the PDF's link gets 404 → `GET /api/files?all=true` as a student returns only their own files → delete the unused file (`DELETE /api/files/:id`) and confirm its object is gone from `/var/lib/campusfind/storage/files/<yyyy>/<mm>/`. Confirm no `.part` leftovers.
Also: `GET /api/map/search?q=library` with a bearer token returns results (`source` live or cache) — this proves outbound HTTPS to nominatim.openstreetmap.org works.
Also: `pm2 list` still shows the previous apps online; `sudo nginx -T | grep server_name` still lists their domains.

## 9. Redeploy and rollback
Redeploy: `cd /srv/campusfind/app && sudo -u campusfind git pull && sudo -u campusfind npm ci --include=dev && sudo -u campusfind npm run build && sudo -u campusfind pm2 restart campusfind-api`.
Rollback: `git checkout <previous-sha>` + rebuild + restart `campusfind-api` only. To remove this deployment: stop/delete `campusfind-api`, remove the vhost and symlink
(`nginx -t` + reload); **leave `/var/lib/campusfind/storage` in place unless the owner says delete.**

## 10. Report back to the owner
Provide: API URL, deployed git SHA, PM2 name + port, storage path + free space, Nginx file path, health/CORS/upload/expiry/RBAC results, anything
unfinished (DNS, Atlas allowlist, secrets needed). Do not claim success for any check you did not run.
