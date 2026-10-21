#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
NAULITE_URL="${NAULITE_URL:-http://localhost:18082}"
NAULITE_ADMIN_TOKEN="${NAULITE_ADMIN_TOKEN:-naulite-dev-agent}"
MOCK_PORT="${E7_NOTIFY_MOCK_PORT:-18124}"
MOCK_LOG="${ROOT}/.e7-notify-mock-proof.log"
DEST_NAME="${E7_NOTIFY_DEST_NAME:-lab-e7-mock-proof}"

cleanup() {
    if [ -n "${MOCK_PID:-}" ]; then
        kill "${MOCK_PID}" 2>/dev/null || true
    fi
}

trap cleanup EXIT

rm -f "${MOCK_LOG}"
python3 -u -c "
from http.server import BaseHTTPRequestHandler, HTTPServer

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        with open('${MOCK_LOG}', 'ab') as f:
            f.write(body + b'\n')
        self.send_response(204)
        self.end_headers()

    def log_message(self, *_):
        return

HTTPServer(('127.0.0.1', ${MOCK_PORT}), Handler).serve_forever()
" &
MOCK_PID=$!
sleep 1

echo "Webhook mock on http://127.0.0.1:${MOCK_PORT}/notify"

DEST_JSON=$(curl -fsS -X POST "${NAULITE_URL}/notifications/destinations" \
    -H "Authorization: Bearer ${NAULITE_ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
        --arg name "${DEST_NAME}-$(date +%s)" \
        --arg url "http://127.0.0.1:${MOCK_PORT}/notify" \
        '{name: $name, type: "WEBHOOK", url: $url, enabled: true, allowedKinds: []}')")

echo "${DEST_JSON}" | jq '{id, name, url}'

TEST_JSON=$(curl -fsS -X POST "${NAULITE_URL}/notifications/test" \
    -H "Authorization: Bearer ${NAULITE_ADMIN_TOKEN}")
echo "${TEST_JSON}" | jq .

sleep 1

if [ ! -s "${MOCK_LOG}" ]; then
    echo "FAIL: mock did not receive POST"
    exit 1
fi

echo "PASS: E7-style webhook notification delivered"
tail -1 "${MOCK_LOG}" | jq . 2>/dev/null || tail -1 "${MOCK_LOG}"

echo "Production deploy path also registers NAULITE_E7_NOTIFY_WEBHOOK_URL at CP boot (see NotificationDestinationRuntime)."
