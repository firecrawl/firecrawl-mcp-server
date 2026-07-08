#!/usr/bin/env sh
set -e

node dist/index.js &
APP_PID=$!

shutdown() {
  kill "$APP_PID" 2>/dev/null || true
}
trap shutdown INT TERM EXIT

nginx -g 'daemon off;' &
NGINX_PID=$!

wait -n "$APP_PID" "$NGINX_PID"
EXIT_CODE=$?
shutdown
exit "$EXIT_CODE"


