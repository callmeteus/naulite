#!/usr/bin/env bash
set -euo pipefail

# Kills the current control-plane leader container in dogfood for failover drills.
#
# Usage:
#   ./scripts/chaos/kill-leader.sh
#
# Environment:
#   COMPOSE_FILE - path to dogfood compose (default dogfood/docker-compose.yml)
#   COMPOSE_PROJECT_NAME - docker compose project name (default naulite-dogfood)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${ROOT_DIR}/dogfood/docker-compose.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-naulite-dogfood}"

leader_port=""
for port in 18080 18081; do
  status="$(curl -fsS "http://localhost:${port}/cluster/status" | jq -r '.leader.isLeader // empty' 2>/dev/null || true)"
  if [[ "${status}" == "true" ]]; then
    leader_port="${port}"
    break
  fi
done

if [[ -z "${leader_port}" ]]; then
  echo "Nenhum líder encontrado nas portas 18080/18081." >&2
  exit 1
fi

case "${leader_port}" in
  18080) container="control-plane-1" ;;
  18081) container="control-plane-2" ;;
  *)
    echo "Porta de líder desconhecida: ${leader_port}" >&2
    exit 1
    ;;
esac

echo "Matando líder ${container} (porta ${leader_port})..."
docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" stop "${container}"
echo "Aguardando promoção de novo líder..."
sleep 5
curl -fsS "http://localhost:18080/health/ready" || curl -fsS "http://localhost:18081/health/ready"
echo "Failover manual concluído."
