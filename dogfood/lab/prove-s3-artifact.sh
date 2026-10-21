#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/naulite-lm-lab.sh
source "${ROOT}/lib/naulite-lm-lab.sh"
LM_LAB="$(naulite_lm_lab_dir)"
ENDPOINT="${S3_ENDPOINT_URL:-http://localhost:4566}"
BUCKET="${S3_ARTIFACT_BUCKET:-naulite-lab-artifacts}"
BRANCH="${BRANCH:-master}"
COMMIT_SHA="${COMMIT_SHA:-lab-$(date +%s)}"
APP_NAME="${APP_NAME:-demo-tenant}"
LAB_ARTIFACT_KIND="${LAB_ARTIFACT_KIND:-stub}"

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}"

aws_cli=(aws --endpoint-url="$ENDPOINT")

echo "Ensuring bucket s3://${BUCKET} on ${ENDPOINT}"
"${aws_cli[@]}" s3 mb "s3://${BUCKET}" 2>/dev/null || true

TMP=$(mktemp -d)
TAR_PATH="${TMP}/backend.tar.gz"

if [ "${LAB_ARTIFACT_KIND}" = "stub" ]; then
    echo "lab artifact $(date -Iseconds)" > "${TMP}/bundle.txt"
    tar -czf "${TAR_PATH}" -C "${TMP}" bundle.txt
else
    build_script="${NAULITE_LAB_ARTIFACT_BUILD_SCRIPT:-${LM_LAB}/build-lm-backend-lab-artifact.sh}"
    if [ ! -x "${build_script}" ] && [ ! -f "${build_script}" ]; then
        echo "Missing build script ${build_script}; set NAULITE_LAB_ARTIFACT_BUILD_SCRIPT or LAB_ARTIFACT_KIND=stub"
        exit 1
    fi
    bash "${build_script}" "${TAR_PATH}"
fi

KEY="${BRANCH}/${COMMIT_SHA}/${APP_NAME}/backend.tar.gz"

"${aws_cli[@]}" s3 cp "${TAR_PATH}" "s3://${BUCKET}/${KEY}"
echo "Uploaded s3://${BUCKET}/${KEY}"

rm -rf "${TMP}"
