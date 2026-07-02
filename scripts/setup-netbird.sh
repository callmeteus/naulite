#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NB_DIR="$ROOT/infra/netbird"

if [[ -z "${NETBIRD_DOMAIN:-}" ]]; then
    echo "NETBIRD_DOMAIN is required." >&2
    echo "Example: export NETBIRD_DOMAIN=vpn.example.com" >&2
    exit 1
fi

mkdir -p "$NB_DIR"
cd "$NB_DIR"

if [[ -f config.yaml && -f docker-compose.yml ]]; then
    echo "NetBird already initialized in infra/netbird/."
    echo "Remove config.yaml and docker-compose.yml to re-run setup."
    exit 0
fi

echo "Running official NetBird getting-started.sh in infra/netbird/ ..."
echo "Use reverse proxy option [0] Traefik for production (TLS via Let's Encrypt)."
echo ""

curl -fsSL https://github.com/netbirdio/netbird/releases/latest/download/getting-started.sh | bash

echo ""
echo "NetBird stack files are in infra/netbird/."
echo "Start everything from the platform root:"
echo "  docker compose up -d"
