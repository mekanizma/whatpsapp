#!/bin/sh
set -e

SESSIONS="${SESSIONS_DIR:-/data/sessions}"

mkdir -p "$SESSIONS"
chown -R node:node "$SESSIONS"

exec gosu node "$@"
