#!/bin/sh
# Wait for Postgres DNS + TCP, then run migrations with retries.
# Dokploy/Compose often report postgres healthy while embedded DNS is briefly unavailable (EAI_AGAIN).
set -eu

MAX_ATTEMPTS="${MIGRATE_MAX_ATTEMPTS:-30}"
SLEEP_SECS="${MIGRATE_RETRY_SLEEP:-2}"

# Host from DATABASE_URL (postgresql://user:pass@host:port/db) — default compose service name.
DB_HOST="${DATABASE_HOST:-}"
if [ -z "$DB_HOST" ] && [ -n "${DATABASE_URL:-}" ]; then
  DB_HOST="$(printf '%s' "$DATABASE_URL" | sed -n 's|.*@\([^:/?]*\).*|\1|p')"
fi
DB_HOST="${DB_HOST:-postgres}"

echo "Waiting for database host '${DB_HOST}' (DNS + port 5432)..."
i=0
while [ "$i" -lt 60 ]; do
  if getent hosts "$DB_HOST" >/dev/null 2>&1; then
    if command -v node >/dev/null 2>&1; then
      if node -e "
const net = require('net');
const s = net.connect(5432, process.argv[1], () => { s.end(); process.exit(0); });
s.on('error', () => process.exit(1));
setTimeout(() => process.exit(1), 2000);
" "$DB_HOST" 2>/dev/null; then
        echo "Database reachable at ${DB_HOST}:5432"
        break
      fi
    else
      break
    fi
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$i" -ge 60 ]; then
  echo "WARN: ${DB_HOST} not confirmed after 60s — attempting migrate anyway"
fi

echo "Ensuring target database exists..."
if ! yarn --cwd /app workspace @alpacto/database exec node /usr/local/bin/ensure-database.mjs; then
  echo "❌ ensure-database failed"
  exit 1
fi

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "▶ migrate attempt ${attempt}/${MAX_ATTEMPTS}"
  if yarn workspace @alpacto/database migrate; then
    echo "✅ Migrations applied"
    exit 0
  fi
  echo "Migrate failed; retrying in ${SLEEP_SECS}s..."
  sleep "$SLEEP_SECS"
  attempt=$((attempt + 1))
done

echo "❌ Migrate failed after ${MAX_ATTEMPTS} attempts"
exit 1
