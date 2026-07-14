#!/usr/bin/env sh
set -e

# Bind the Node app to IPv4 loopback so NGINX (upstream 127.0.0.1:3000) can
# reach it. Default HOST=localhost resolves to ::1 on IPv6-enabled images,
# which leaves NGINX unable to proxy (see issue #251).
export HOST="${HOST:-127.0.0.1}"

# Start Node app in background
node dist/index.js &
APP_PID=$!

# Start NGINX in foreground
nginx -g 'daemon off;'

wait $APP_PID


