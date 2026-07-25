#!/usr/bin/env bash
# Start pi-web in /pi basePath mode with API pre-warming.
#
# Turbopack + basePath issue: after page compilation, new API routes time out for
# ~30s. This script pre-warms all API routes before the page loads, avoiding the
# hang entirely.
#
# Usage: MSYS_NO_PATHCONV=1 bash scripts/dev-pi.sh

set -euo pipefail

PORT="${PORT:-30141}"
BASE_URL="http://localhost:${PORT}/pi"

echo "=== Starting pi-web (basePath=/pi, port ${PORT}) ==="
echo ""

# Start dev server in background
PI_WEB_BASE_PATH=/pi next dev -p "${PORT}" &
DEV_PID=$!
trap 'kill ${DEV_PID} 2>/dev/null; echo "stopped"' EXIT

# Wait for server to be ready
echo "Waiting for server..."
for i in $(seq 1 30); do
	if curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}" 2>/dev/null | grep -q "200\|404"; then
		break
	fi
	sleep 1
done
echo "Server ready."

# Pre-warm all API routes (hit them before the page)
echo ""
echo "--- Pre-warming API routes ---"

ENDPOINTS=(
	"/pi/api/home"
	"/pi/api/sessions"
	"/pi/api/models"
	"/pi/api/skills"
	"/pi/api/plugins"
	"/pi/api/auth/providers"
	"/pi/api/auth/all-providers"
	"/pi/api/models-config"
	"/pi/api/cwd/validate"
)

for ep in "${ENDPOINTS[@]}"; do
	echo -n "  ${ep} ... "
	STATUS=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "${BASE_URL}${ep}" 2>/dev/null || echo "TIMEOUT")
	echo "${STATUS}"
done

echo ""
echo "=== Pre-warming complete ==="
echo ""
echo "  Local:  http://localhost:${PORT}/pi"
echo "  Press Ctrl+C to stop"
echo ""

# Wait for dev server
wait "${DEV_PID}"
