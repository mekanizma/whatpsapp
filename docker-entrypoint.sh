#!/bin/sh
set -e

SESSIONS="${SESSIONS_DIR:-/data/sessions}"

echo "[entrypoint] WhatsApp AI starting (user=$(id -u), node=$(node -v 2>/dev/null || echo missing))"

mkdir -p "$SESSIONS"

# Volume mount izinleri root olabilir — chown başarısız olsa da devam et
if ! chown -R node:node "$SESSIONS" 2>/dev/null; then
  echo "[entrypoint] chown skipped for $SESSIONS (volume permissions); continuing"
  chmod -R u+rwX "$SESSIONS" 2>/dev/null || true
fi

if [ ! -f /app/backend/dist/index.js ]; then
  echo "[entrypoint] FATAL: /app/backend/dist/index.js not found — build failed?"
  exit 1
fi

exec gosu node "$@"
