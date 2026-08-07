#!/bin/sh
# First-boot DB seed + wallets (no-op when demo data already exists).
# Brief wait helps after migrate when compose DNS is still settling (Dokploy).
set -eu
cd /app
export BOOTSTRAP_CWD=/app

DB_HOST="${DATABASE_HOST:-}"
if [ -z "$DB_HOST" ] && [ -n "${DATABASE_URL:-}" ]; then
  DB_HOST="$(printf '%s' "$DATABASE_URL" | sed -n 's|.*@\([^:/?]*\).*|\1|p')"
fi
DB_HOST="${DB_HOST:-postgres}"

i=0
while [ "$i" -lt 30 ]; do
  if getent hosts "$DB_HOST" >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

exec yarn workspace @alpacto/database bootstrap:first-boot
