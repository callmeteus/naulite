#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
AMI_CACHE="${ROOT}/.lab-ec2-ami.env"
AWS_ENDPOINT="${AWS_ENDPOINT_URL:-http://localhost:4566}"
AWS_REGION="${AWS_REGION:-us-east-1}"
IMAGE_LOCATION="${LAB_EC2_IMAGE_LOCATION:-alpine:3.20}"

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"

if [ -f "${AMI_CACHE}" ]; then
    # shellcheck source=/dev/null
    source "${AMI_CACHE}"

    if [ -n "${LAB_EC2_AMI:-}" ]; then
        STATE=$(aws --endpoint-url="${AWS_ENDPOINT}" ec2 describe-images \
            --region "${AWS_REGION}" \
            --image-ids "${LAB_EC2_AMI}" \
            --query 'Images[0].State' \
            --output text 2>/dev/null || echo missing)

        if [ "${STATE}" = "available" ]; then
            echo "Using cached lab AMI ${LAB_EC2_AMI} (${IMAGE_LOCATION})"
            exit 0
        fi
    fi
fi

UNIQUE="lab-$(date +%s)"
AMI_NAME="naulite-lab-ec2-${UNIQUE}"

echo "Registering MiniStack docker AMI ${IMAGE_LOCATION} as ${AMI_NAME}"
LAB_EC2_AMI=$(aws --endpoint-url="${AWS_ENDPOINT}" ec2 register-image \
    --region "${AWS_REGION}" \
    --name "${AMI_NAME}" \
    --image-location "${IMAGE_LOCATION}" \
    --query 'ImageId' \
    --output text)

printf 'LAB_EC2_AMI=%s\nLAB_EC2_IMAGE_LOCATION=%s\n' "${LAB_EC2_AMI}" "${IMAGE_LOCATION}" >"${AMI_CACHE}"
echo "LAB_EC2_AMI=${LAB_EC2_AMI}"
