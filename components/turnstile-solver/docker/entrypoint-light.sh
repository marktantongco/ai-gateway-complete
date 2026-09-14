#!/bin/bash
set -e

PORT="${SOLVER_PORT:-8088}"
SECRET="${SOLVER_SECRET:-turnstile123}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"
CAPTCHA_TIMEOUT="${CAPTCHA_TIMEOUT:-30}"
PAGE_LOAD_TIMEOUT="${PAGE_LOAD_TIMEOUT:-30}"
PROXY_SERVER="${PROXY_SERVER:-}"
PROXY_FILE="${PROXY_FILE:-}"
LOG_LEVEL="${LOG_LEVEL:-20}"

CMD="solver --port ${PORT} --secret ${SECRET} --max-attempts ${MAX_ATTEMPTS} --captcha-timeout ${CAPTCHA_TIMEOUT} --page-load-timeout ${PAGE_LOAD_TIMEOUT} --log-level ${LOG_LEVEL} --browser chromium --headless"

if [ -n "$PROXY_SERVER" ]; then
  CMD="${CMD} --proxy-server ${PROXY_SERVER}"
fi

if [ -n "$PROXY_FILE" ] && [ -f "$PROXY_FILE" ]; then
  CMD="${CMD} --proxies ${PROXY_FILE}"
fi

echo "Starting turnstile_solver: ${CMD}"
exec ${CMD}
