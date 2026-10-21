#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
MOCK_PORT="${E7_NOTIFY_MOCK_PORT:-18123}"
MOCK_LOG="${ROOT}/.e7-notify-mock.log"
NAULITE_URL="${NAULITE_URL:-http://localhost:18082}"

cleanup() {
    if [ -n "${MOCK_PID:-}" ]; then
        kill "${MOCK_PID}" 2>/dev/null || true
    fi
}

trap cleanup EXIT

rm -f "${MOCK_LOG}"
python3 -u -c "
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8', errors='replace')
        with open('${MOCK_LOG}', 'a', encoding='utf-8') as f:
            f.write(body + '\n')
        self.send_response(204)
        self.end_headers()

    def log_message(self, *_):
        return

HTTPServer(('127.0.0.1', ${MOCK_PORT}), Handler).serve_forever()
" &
MOCK_PID=$!
sleep 1

echo "E7 notify mock listening on http://127.0.0.1:${MOCK_PORT}"
echo "Restart control plane with:"
echo "  NAULITE_E7_NOTIFY_WEBHOOK_URL=http://127.0.0.1:${MOCK_PORT}/notify"
echo "Then trigger any pipeline run; this script waits for a POST body."

for _ in $(seq 1 120); do
    if [ -s "${MOCK_LOG}" ]; then
        echo "Received notification payload:"
        tail -1 "${MOCK_LOG}" | jq . 2>/dev/null || tail -1 "${MOCK_LOG}"
        exit 0
    fi

    sleep 2
done

echo "Timed out waiting for E7 notify POST (is NAULITE_E7_NOTIFY_WEBHOOK_URL set on CP?)"
exit 1
