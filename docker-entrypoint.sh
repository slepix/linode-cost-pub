#!/bin/sh
set -e

API_URL="${API_URL:-/postgrest}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__CONFIG__ = {
  apiUrl: "${API_URL}"
};
EOF

node /api/dist/index.js &
API_PID=$!

nginx -g "daemon off;" &
NGINX_PID=$!

wait_for_exit() {
  wait -n 2>/dev/null || true
  kill $API_PID $NGINX_PID 2>/dev/null || true
}

trap wait_for_exit TERM INT

wait $API_PID $NGINX_PID
