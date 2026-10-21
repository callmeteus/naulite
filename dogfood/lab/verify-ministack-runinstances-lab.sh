#!/usr/bin/env bash
set -euo pipefail

CLOUD_INSTANCE_ID="${CLOUD_INSTANCE_ID:-}"
PROVISION_ID="${PROVISION_ID:-}"
NAULITE_URL="${NAULITE_URL:-http://localhost:18082}"
NAULITE_ADMIN_TOKEN="${NAULITE_ADMIN_TOKEN:-naulite-dev-agent}"
LAB_SIMULATE_USERDATA="${LAB_SIMULATE_USERDATA:-1}"

if [ -z "${CLOUD_INSTANCE_ID}" ]; then
    echo "CLOUD_INSTANCE_ID is required"
    exit 1
fi

INSTANCE_SUFFIX="${CLOUD_INSTANCE_ID}"
if [[ "${INSTANCE_SUFFIX}" != i-* ]]; then
    INSTANCE_SUFFIX="i-${INSTANCE_SUFFIX}"
fi

CONTAINER=""
for _ in $(seq 1 30); do
    CONTAINER=$(docker ps --format '{{.Names}}' | rg "ministack-ec2-.*-${INSTANCE_SUFFIX}$" | head -1 || true)

    if [ -n "${CONTAINER}" ]; then
        break
    fi

    sleep 1
done

if [ -z "${CONTAINER}" ]; then
    export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
    export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
    AWS_ENDPOINT="${AWS_ENDPOINT_URL:-http://localhost:4566}"
    AWS_REGION="${AWS_REGION:-us-east-1}"
    STATE=$(aws --endpoint-url="${AWS_ENDPOINT}" ec2 describe-instances \
        --region "${AWS_REGION}" \
        --instance-ids "${INSTANCE_SUFFIX}" \
        --query 'Reservations[0].Instances[0].State.Name' \
        --output text 2>/dev/null || echo missing)

    if [ "${STATE}" = "running" ]; then
        echo "RunInstances API: instance ${INSTANCE_SUFFIX} is ${STATE} (no docker-backed container; use LAB_EC2_IMAGE_LOCATION=alpine:3.20)"
        exit 0
    fi

    echo "MiniStack EC2 container not found for ${INSTANCE_SUFFIX} (describe state=${STATE})"
    exit 1
fi

echo "RunInstances container: ${CONTAINER}"

if [ -n "${PROVISION_ID}" ]; then
    PROVISION_JSON=$(curl -fsS -H "Authorization: Bearer ${NAULITE_ADMIN_TOKEN}" \
        "${NAULITE_URL}/nodes/provisions/${PROVISION_ID}")
    echo "$PROVISION_JSON" | jq '{id, status, cloudInstanceId, nodeId, provider}'
fi

if [ "${LAB_SIMULATE_USERDATA}" = "1" ]; then
    echo "Lab userData hook (MiniStack does not execute EC2 userData): writing marker in instance"
    docker exec "${CONTAINER}" sh -c "mkdir -p /var/lib/naulite && printf '%s\n' '${PROVISION_ID:-lab}' > /var/lib/naulite/userdata-lab.ok"
    MARKER=$(docker exec "${CONTAINER}" cat /var/lib/naulite/userdata-lab.ok)
    echo "userdata-lab.ok=${MARKER}"
fi

echo "verify-ministack-runinstances-lab: ok"
