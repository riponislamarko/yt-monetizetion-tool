# Deploying to a VPS

This project is plain Node.js (the API runs TypeScript via `tsx`, the web is a normal Next.js app), so you run it directly on the VPS with system-installed Postgres, Redis, a process manager (PM2 or systemd), and Nginx for HTTPS.

```
                         ┌──────────────── VPS ────────────────┐
  https://yourdomain ──► │  Nginx (:80/:443, TLS via certbot)   │
                         │   ├── /api/* ─► node API   :3001     │ ──► Postgres (localhost)
                         │   └── /*     ─► next start :3000     │ ──► Redis    (localhost)
                         └──────────────────────────────────────┘
```

> **The one caveat:** the API uses a headless-Chromium (Playwright) *fallback* for a few hard-to-scrape surfaces. Native Chromium needs its browser binary + OS libraries installed (step 6). It's **optional** — the app boots and all 8 tools work without it; a missing browser just degrades that rare fallback to "unavailable" instead of crashing. Install it for full fidelity.

---

## 1. Prerequisites on the VPS

Ubuntu 22.04/24.04, 2 GB RAM minimum (4 GB recommended), a domain with an **A record** pointing at the VPS IP (verify: `dig +short yourdomain.com`).

```bash
ssh youruser@your-vps-ip
sudo apt update && sudo apt upgrade -y

# Firewall: SSH + HTTP + HTTPS only
sudo apt install -y ufw
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw --force enable
```

---

## 2. Install Node 20 + pnpm

```bash
# Node 20 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential git

# pnpm via corepack
sudo corepack enable
corepack prepare pnpm@9.15.9 --activate

node -v   # v20.x
pnpm -v   # 9.15.9
```

---

## 3. Install & configure Postgres

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

# Create the database + user
sudo -u postgres psql <<'SQL'
CREATE USER yttoolkit WITH PASSWORD 'CHANGE_ME_strong_password';
CREATE DATABASE yttoolkit OWNER yttoolkit;
GRANT ALL PRIVILEGES ON DATABASE yttoolkit TO yttoolkit;
SQL
```

Postgres listens on `localhost` only by default — good, leave it that way.

---

## 4. Install Redis

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping   # → PONG
```

Also localhost-only by default. (Cache is optional — the app runs fine if Redis is ever down.)

---

## 5. Get the code & install dependencies

```bash
cd ~
git clone <your-repo-url> yt-toolkit
cd yt-toolkit
pnpm install --frozen-lockfile=false
```

---

## 6. (Optional) Install the Playwright browser + OS deps

Only needed for full scraping-fallback fidelity. The project uses `playwright-core`, which doesn't bundle browsers, so install the matching Chromium into the shared cache:

```bash
# Installs system libs (apt) AND the Chromium build for v1.49.x into ~/.cache/ms-playwright
npx --yes playwright@1.49.1 install --with-deps chromium
```

`playwright-core` finds that browser automatically. Skip this entirely if you don't want it — the app still works.

---

## 7. Configure environment

Create the API env file. The API auto-loads it on start; the DB migrate/purge scripts read the same vars from the shell.

```bash
cp apps/api/.env.example apps/api/.env
nano apps/api/.env
```

Set:

```ini
DATABASE_URL=postgresql://yttoolkit:CHANGE_ME_strong_password@localhost:5432/yttoolkit
REDIS_URL=redis://localhost:6379
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
IP_HASH_SALT=<run: openssl rand -hex 32>
LOG_LEVEL=info
LOOKUP_RETENTION_DAYS=90
# YOUTUBE_API_KEY_1..5 optional — leave blank to run without enrichment
```

> Same-origin setup: the browser calls `https://yourdomain.com/api/...` and Nginx proxies `/api/*` to the API, so there's no CORS. `CORS_ORIGIN` is still set as a belt-and-braces measure.

---

## 8. Run database migrations

The migrate script reads `DATABASE_URL` from the shell, so source the env first:

```bash
set -a && . apps/api/.env && set +a
pnpm --filter @yt/db migrate
```

---

## 9. Build the web app

`NEXT_PUBLIC_API_URL` is **inlined at build time**, so set it for the build. Same-origin means it's just your domain:

```bash
NEXT_PUBLIC_API_URL=https://yourdomain.com \
NEXT_PUBLIC_SITE_URL=https://yourdomain.com \
pnpm --filter @yt/web build
```

(The API doesn't need a build step — it runs from TypeScript source via `tsx`.)

---

## 10. Run both apps with PM2

```bash
sudo npm install -g pm2

# Starts yt-api (:3001) and yt-web (:3000) per ecosystem.config.cjs
pm2 start ecosystem.config.cjs
pm2 save                     # persist the process list
pm2 startup systemd          # prints a command — run it to auto-start on boot
```

Check them:

```bash
pm2 status
pm2 logs yt-api
curl -s localhost:3001/healthz                       # {"status":"ok"}
curl -s localhost:3001/readyz                         # DB + Redis check
curl -s localhost:3000 -o /dev/null -w '%{http_code}\n'   # 200
```

<details>
<summary>Prefer systemd over PM2? (alternative)</summary>

Create `/etc/systemd/system/yt-api.service`:

```ini
[Unit]
Description=YT Toolkit API
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/yt-toolkit/apps/api
ExecStart=/usr/bin/pnpm start
Environment=NODE_ENV=production
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

And `/etc/systemd/system/yt-web.service`:

```ini
[Unit]
Description=YT Toolkit Web
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/yt-toolkit/apps/web
ExecStart=/usr/bin/pnpm start
Environment=NODE_ENV=production
Environment=PORT=3000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Then: `sudo systemctl daemon-reload && sudo systemctl enable --now yt-api yt-web`
(Use `which pnpm` to confirm the `ExecStart` path.)
</details>

---

## 11. Nginx reverse proxy + HTTPS

```bash
sudo apt install -y nginx
```

Create `/etc/nginx/sites-available/yt-toolkit`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # API: every backend route the browser hits is under /api/
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Everything else: the Next.js app
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it and add a free Let's Encrypt cert (certbot rewrites the config to serve HTTPS and sets up auto-renewal):

```bash
sudo ln -s /etc/nginx/sites-available/yt-toolkit /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Open **https://yourdomain.com** — the homepage and all 8 tools should work over HTTPS.

> **Per-IP rate limiting:** the API hashes the client IP, which it reads from `X-Forwarded-For` (set above). If limits look wrong, confirm the API trusts the proxy header (`trustProxy` in the Fastify config).

---

## 12. Day-2 operations

**Update to a new version:**

```bash
cd ~/yt-toolkit
git pull
pnpm install --frozen-lockfile=false

set -a && . apps/api/.env && set +a
pnpm --filter @yt/db migrate                      # idempotent

NEXT_PUBLIC_API_URL=https://yourdomain.com \
NEXT_PUBLIC_SITE_URL=https://yourdomain.com \
pnpm --filter @yt/web build

pm2 restart yt-api yt-web                          # or: systemctl restart yt-api yt-web
```

**Database backup / restore:**

```bash
pg_dump -U yttoolkit -h localhost yttoolkit | gzip > backup-$(date +%F).sql.gz
gunzip -c backup-2026-06-09.sql.gz | psql -U yttoolkit -h localhost yttoolkit
```

**Data-retention purge** (hashed IPs + URLs older than `LOOKUP_RETENTION_DAYS`):

```bash
set -a && . apps/api/.env && set +a
pnpm --filter @yt/db purge
```

Automate backup + purge with cron (`crontab -e`).

---

## 13. Troubleshooting

| Symptom | Fix |
|---|---|
| certbot fails to issue | DNS A record not pointing at the VPS, or port 80 blocked. Check `dig +short yourdomain.com` and `sudo ufw status`. |
| `502 Bad Gateway` | The node app isn't up on 3000/3001. `pm2 status`, `pm2 logs`. |
| `/readyz` not ready | Postgres or Redis down. `systemctl status postgresql redis-server`. |
| Playwright launch errors in logs | Run step 6, or ignore — the fallback is optional and degrades gracefully. |
| Chromium OOM-killed | Add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` (persist in `/etc/fstab`). |
| Changed domain, web still calls old API URL | Rebuild web (step 9) — `NEXT_PUBLIC_*` is baked at build time. |

---

That's it — `git pull` + build + `pm2 restart` is the loop you'll run to deploy and to update.
