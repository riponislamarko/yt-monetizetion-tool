#!/usr/bin/env bash
# Auto-deploy for the VPS. Run by the GitHub Actions "deploy" job on every push to main,
# and safe to run by hand:  bash scripts/deploy.sh
#
# Steps: sync to origin/main -> install deps -> migrate DB -> rebuild web -> restart PM2.
set -euo pipefail

# Resolve the repo root from this script's location, so CWD doesn't matter.
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# Ensure node/pnpm/pm2 are on PATH for non-login SSH shells.
export PATH="$PATH:/usr/local/bin:/usr/bin:${HOME}/.local/share/pnpm"

# Public URLs are inlined into the web bundle at build time. Override via env if the domain changes.
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://devarko.xyz}"
export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://devarko.xyz}"

echo "==> Syncing to origin/main"
git fetch --all --prune
git reset --hard origin/main        # exact match to remote (ignored files like apps/api/.env are kept)

echo "==> Installing dependencies"
pnpm install --frozen-lockfile=false

echo "==> Running DB migrations"
set -a; [ -f apps/api/.env ] && . apps/api/.env; set +a
pnpm --filter @yt/db migrate

echo "==> Building web app"
pnpm --filter @yt/web build

echo "==> Restarting PM2"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "==> Deploy complete: $(git rev-parse --short HEAD)"
