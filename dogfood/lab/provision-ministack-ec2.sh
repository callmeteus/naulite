#!/usr/bin/env bash
set -euo pipefail

LAB_DIR="$(cd "$(dirname "$0")" && pwd)"
NAULITE_URL="${NAULITE_URL:-http://localhost:18082}"
NAULITE_ADMIN_TOKEN="${NAULITE_ADMIN_TOKEN:-naulite-dev-agent}"

if [ -z "${LAB_EC2_AMI:-}" ]; then
    bash "${LAB_DIR}/ensure-ministack-lab-ami.sh"
    # shellcheck source=/dev/null
    source "${LAB_DIR}/.lab-ec2-ami.env"
fi

AMI_ID="${LAB_EC2_AMI:-ami-0abcdef1234567890}"
INSTANCE_TYPE="${LAB_EC2_INSTANCE_TYPE:-t3.micro}"
REGION="${AWS_REGION:-us-east-1}"
AGENT_PORT="${LAB_EC2_AGENT_PORT:-9471}"
LAB_EC2_BACKEND_PUBLISH_PORT="${LAB_EC2_BACKEND_PUBLISH_PORT:-$((AGENT_PORT + 10))}"
export LAB_EC2_BACKEND_PUBLISH_PORT
LAB_TARGET_ENV="${LAB_TARGET_ENV:-${LAB_DIR}/.lab-target.env}"
PREVIEW_BRANCH="${PREVIEW_BRANCH:-}"
REPO_ROOT="$(cd "${LAB_DIR}/../.." && pwd)"
AGENT_RUNTIME="${NAULITE_LAB_AGENT_RUNTIME:-docker}"
AGENT_BINARY="${REPO_ROOT}/packages/agent/zig-out/bin/naulite-agent"
DOCKER_COMPOSE_PROJECT="ec2-lab-${AGENT_PORT}"

if [ -f "${HOME}/.nvm/nvm.sh" ]; then
    # shellcheck source=/dev/null
    source "${HOME}/.nvm/nvm.sh"
fi

NODE_BIN="${NODE_BIN:-$(command -v node)}"

if [ -z "${NODE_BIN}" ]; then
    echo "node not found in PATH (load nvm or set NODE_BIN)"
    exit 1
fi

echo "Provisioning MiniStack EC2 via ${NAULITE_URL}/nodes/provision"
PROVISION_JSON=$(curl -fsS -X POST "${NAULITE_URL}/nodes/provision" \
    -H "Authorization: Bearer ${NAULITE_ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
        --arg amiId "$AMI_ID" \
        --arg instanceType "$INSTANCE_TYPE" \
        --arg region "$REGION" \
        --arg previewBranch "$PREVIEW_BRANCH" \
        '{
            instanceType: $instanceType,
            amiId: $amiId,
            region: $region,
            labels: (
                { "lab": "ministack-ec2" }
                + (if $previewBranch != "" then { "preview_branch": ($previewBranch | ascii_downcase) } else {} end)
            ),
            capabilities: ["docker"]
        }')")

echo "$PROVISION_JSON" | jq .

TARGET=$(echo "$PROVISION_JSON" | jq -r '.nodeId')
PROVISION_ID=$(echo "$PROVISION_JSON" | jq -r '.id')
CLOUD_ID=$(echo "$PROVISION_JSON" | jq -r '.cloudInstanceId // empty')

echo "TARGET=${TARGET} provisionId=${PROVISION_ID} cloudInstanceId=${CLOUD_ID}"
mkdir -p "$(dirname "$LAB_TARGET_ENV")"
printf 'TARGET=%s\nCLOUD_INSTANCE_ID=%s\nPROVISION_ID=%s\n' "$TARGET" "$CLOUD_ID" "$PROVISION_ID" >"${LAB_TARGET_ENV}"

if [ -n "${CLOUD_ID}" ] && [ "${LAB_VERIFY_RUNINSTANCES:-1}" = "1" ]; then
    export CLOUD_INSTANCE_ID="${CLOUD_ID}"
    export PROVISION_ID
    bash "${LAB_DIR}/verify-ministack-runinstances-lab.sh"
fi

REGISTERED_ID=$(curl -fsS -H "Authorization: Bearer ${NAULITE_ADMIN_TOKEN}" \
    "${NAULITE_URL}/nodes" 2>/dev/null | jq -r --arg port "${AGENT_PORT}" \
    '.[] | select(.agentUrl != null and (.agentUrl | test(":" + $port + "$"))) | .id' | head -1)

if [ "${REGISTERED_ID}" = "${TARGET}" ] && curl -fsS "http://127.0.0.1:${AGENT_PORT}/health" >/dev/null 2>&1; then
    echo "Agent on port ${AGENT_PORT} already registered as ${TARGET}"
else
    if curl -fsS "http://127.0.0.1:${AGENT_PORT}/health" >/dev/null 2>&1; then
        echo "Recycling agent on port ${AGENT_PORT} for ${TARGET}"
        fuser -k "${AGENT_PORT}/tcp" 2>/dev/null || true
        docker compose -p "${DOCKER_COMPOSE_PROJECT}" -f "${LAB_DIR}/ec2-lab-agent.compose.yml" down 2>/dev/null || true
        sleep 2
    fi

    if [ "${AGENT_RUNTIME}" = "docker" ]; then
        if [ ! -x "${AGENT_BINARY}" ]; then
            echo "Missing agent binary at ${AGENT_BINARY}. Run: yarn workspace @naulite/agent build (or zig build in packages/agent)."
            exit 1
        fi

        fuser -k "${AGENT_PORT}/tcp" 2>/dev/null || true
        sleep 1

        CP_DOCKER_URL="${NAULITE_URL}"
        CP_DOCKER_URL="${CP_DOCKER_URL//127.0.0.1/host.docker.internal}"
        CP_DOCKER_URL="${CP_DOCKER_URL//localhost/host.docker.internal}"

        # Control-plane on the host must reach the published agent port on loopback, not host.docker.internal.
        AGENT_PUBLIC_URL="http://127.0.0.1:${AGENT_PORT}"

        echo "Starting EC2 lab agent container as node ${TARGET} on host port ${AGENT_PORT}"
        NAULITE_CP_URL="${CP_DOCKER_URL}" \
        NAULITE_DEV_AGENT_ID="${TARGET}" \
        NAULITE_DEV_AGENT_HOSTNAME="ec2-lab-${AGENT_PORT}" \
        LAB_EC2_AGENT_PORT="${AGENT_PORT}" \
        LAB_EC2_BACKEND_PUBLISH_PORT="${LAB_EC2_BACKEND_PUBLISH_PORT}" \
        AGENT_URL="${AGENT_PUBLIC_URL}" \
        docker compose -p "${DOCKER_COMPOSE_PROJECT}" -f "${LAB_DIR}/ec2-lab-agent.compose.yml" up -d --build
    else
        echo "Starting lab agent on host as node ${TARGET} on port ${AGENT_PORT}"
        mkdir -p "${REPO_ROOT}/data/dev-agent"
        NAULITE_CP_PORT="${NAULITE_CP_PORT:-18080}" \
        NAULITE_DEV_AGENT_ID="${TARGET}" \
        NAULITE_AGENT_PORT="${AGENT_PORT}" \
        nohup "${NODE_BIN}" "${REPO_ROOT}/scripts/dev-agent.mjs" >"${REPO_ROOT}/data/dev-agent/ec2-lab-agent.log" 2>&1 &
    fi
fi

for _ in $(seq 1 60); do
    if curl -fsS -H "Authorization: Bearer ${NAULITE_ADMIN_TOKEN}" \
        "${NAULITE_URL}/nodes" | jq -e --arg id "$TARGET" '.[] | select(.id == $id) | .status == "online"' >/dev/null 2>&1; then
        echo "Node ${TARGET} is online"
        exit 0
    fi

    sleep 2
done

echo "Timed out waiting for node ${TARGET} to register"
exit 1
