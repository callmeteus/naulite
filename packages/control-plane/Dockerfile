FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock turbo.json tsconfig.base.json ./
COPY packages/nodejs/shared/package.json ./packages/nodejs/shared/
COPY packages/nodejs/logger/package.json ./packages/nodejs/logger/
COPY packages/gateway/package.json ./packages/gateway/
COPY packages/control-plane/package.json ./packages/control-plane/
COPY packages/builders/docker/package.json ./packages/builders/docker/
COPY packages/builders/kaniko/package.json ./packages/builders/kaniko/
COPY packages/runtimes/docker/package.json ./packages/runtimes/docker/
COPY packages/runtimes/podman/package.json ./packages/runtimes/podman/
COPY packages/runtimes/containerd/package.json ./packages/runtimes/containerd/
COPY packages/plugins/s3-storage-provider/package.json ./packages/plugins/s3-storage-provider/
COPY packages/plugins/aws-node-provisioner/package.json ./packages/plugins/aws-node-provisioner/
COPY packages/plugins/notification-slack/package.json ./packages/plugins/notification-slack/
COPY packages/plugins/notification-webhook/package.json ./packages/plugins/notification-webhook/

RUN corepack enable && yarn install --frozen-lockfile || yarn install

COPY packages/nodejs/shared ./packages/nodejs/shared
COPY packages/nodejs/logger ./packages/nodejs/logger
COPY packages/gateway ./packages/gateway
COPY packages/control-plane ./packages/control-plane
COPY packages/builders/docker ./packages/builders/docker
COPY packages/builders/kaniko ./packages/builders/kaniko
COPY packages/runtimes/docker ./packages/runtimes/docker
COPY packages/runtimes/podman ./packages/runtimes/podman
COPY packages/runtimes/containerd ./packages/runtimes/containerd
COPY packages/plugins/s3-storage-provider ./packages/plugins/s3-storage-provider
COPY packages/plugins/aws-node-provisioner ./packages/plugins/aws-node-provisioner
COPY packages/plugins/notification-slack ./packages/plugins/notification-slack
COPY packages/plugins/notification-webhook ./packages/plugins/notification-webhook
COPY bootstrap ./bootstrap
COPY scripts ./scripts

RUN yarn workspace @naulite/shared build \
    && yarn workspace @naulite/logger build \
    && yarn workspace @naulite/gateway build \
    && yarn workspace @naulite/builder-docker build \
    && yarn workspace @naulite/builder-kaniko build \
    && yarn workspace @naulite/runtime-docker build \
    && yarn workspace @naulite/runtime-podman build \
    && yarn workspace @naulite/runtime-containerd build \
    && yarn workspace @naulite/plugin-notification-slack build \
    && yarn workspace @naulite/plugin-notification-webhook build \
    && yarn workspace @naulite/control-plane build \
    && yarn workspace @naulite/plugin-s3-storage-provider build \
    && yarn workspace @naulite/plugin-aws-node-provisioner build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV DATABASE_PATH=/data/control-plane.db
ENV NAULITE_PACKAGES_DIR=/app/packages

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/nodejs/shared/dist ./packages/nodejs/shared/dist
COPY --from=build /app/packages/nodejs/shared/package.json ./packages/nodejs/shared/package.json
COPY --from=build /app/packages/nodejs/logger/dist ./packages/nodejs/logger/dist
COPY --from=build /app/packages/nodejs/logger/package.json ./packages/nodejs/logger/package.json
COPY --from=build /app/packages/gateway/dist ./packages/gateway/dist
COPY --from=build /app/packages/gateway/package.json ./packages/gateway/package.json
COPY --from=build /app/packages/control-plane/dist ./packages/control-plane/dist
COPY --from=build /app/packages/control-plane/package.json ./packages/control-plane/package.json
COPY --from=build /app/packages/builders/docker/dist ./packages/builders/docker/dist
COPY --from=build /app/packages/builders/docker/package.json ./packages/builders/docker/package.json
COPY --from=build /app/packages/builders/kaniko/dist ./packages/builders/kaniko/dist
COPY --from=build /app/packages/builders/kaniko/package.json ./packages/builders/kaniko/package.json
COPY --from=build /app/packages/runtimes/docker/dist ./packages/runtimes/docker/dist
COPY --from=build /app/packages/runtimes/docker/package.json ./packages/runtimes/docker/package.json
COPY --from=build /app/packages/runtimes/podman/dist ./packages/runtimes/podman/dist
COPY --from=build /app/packages/runtimes/podman/package.json ./packages/runtimes/podman/package.json
COPY --from=build /app/packages/runtimes/containerd/dist ./packages/runtimes/containerd/dist
COPY --from=build /app/packages/runtimes/containerd/package.json ./packages/runtimes/containerd/package.json
COPY --from=build /app/packages/plugins/s3-storage-provider/dist ./packages/plugins/s3-storage-provider/dist
COPY --from=build /app/packages/plugins/s3-storage-provider/package.json ./packages/plugins/s3-storage-provider/package.json
COPY --from=build /app/packages/plugins/aws-node-provisioner/dist ./packages/plugins/aws-node-provisioner/dist
COPY --from=build /app/packages/plugins/aws-node-provisioner/package.json ./packages/plugins/aws-node-provisioner/package.json
COPY --from=build /app/packages/plugins/notification-slack/dist ./packages/plugins/notification-slack/dist
COPY --from=build /app/packages/plugins/notification-slack/package.json ./packages/plugins/notification-slack/package.json
COPY --from=build /app/packages/plugins/notification-webhook/dist ./packages/plugins/notification-webhook/dist
COPY --from=build /app/packages/plugins/notification-webhook/package.json ./packages/plugins/notification-webhook/package.json
COPY --from=build /app/bootstrap ./bootstrap

RUN mkdir -p /data

EXPOSE 8080

CMD ["node", "packages/control-plane/dist/Server.js"]
