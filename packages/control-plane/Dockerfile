FROM node:22-bookworm-slim AS build



WORKDIR /app



RUN apt-get update \

    && apt-get install -y --no-install-recommends python3 make g++ \

    && rm -rf /var/lib/apt/lists/*



COPY package.json yarn.lock turbo.json tsconfig.base.json ./

COPY packages/shared/package.json ./packages/shared/

COPY packages/control-plane/package.json ./packages/control-plane/

COPY packages/plugins/s3-storage-provider/package.json ./packages/plugins/s3-storage-provider/
COPY packages/plugins/aws-node-provisioner/package.json ./packages/plugins/aws-node-provisioner/



RUN corepack enable && yarn install --frozen-lockfile || yarn install



COPY packages/shared ./packages/shared

COPY packages/control-plane ./packages/control-plane

COPY packages/plugins/s3-storage-provider ./packages/plugins/s3-storage-provider
COPY packages/plugins/aws-node-provisioner ./packages/plugins/aws-node-provisioner
COPY bootstrap ./bootstrap



RUN yarn workspace @platform/shared build \

    && yarn workspace @platform/plugin-s3-storage-provider build \

    && yarn workspace @platform/plugin-aws-node-provisioner build \

    && yarn workspace @platform/control-plane build



FROM node:22-bookworm-slim AS runtime



WORKDIR /app



ENV NODE_ENV=production

ENV HOST=0.0.0.0

ENV PORT=8080

ENV DATABASE_PATH=/data/control-plane.db

ENV PLATFORM_PACKAGES_DIR=/app/packages



RUN apt-get update \

    && apt-get install -y --no-install-recommends ca-certificates \

    && rm -rf /var/lib/apt/lists/*



COPY --from=build /app/node_modules ./node_modules

COPY --from=build /app/packages/shared/dist ./packages/shared/dist

COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json

COPY --from=build /app/packages/control-plane/dist ./packages/control-plane/dist

COPY --from=build /app/packages/control-plane/package.json ./packages/control-plane/package.json

COPY --from=build /app/packages/plugins/s3-storage-provider/dist ./packages/plugins/s3-storage-provider/dist

COPY --from=build /app/packages/plugins/s3-storage-provider/package.json ./packages/plugins/s3-storage-provider/package.json

COPY --from=build /app/packages/plugins/aws-node-provisioner/dist ./packages/plugins/aws-node-provisioner/dist

COPY --from=build /app/packages/plugins/aws-node-provisioner/package.json ./packages/plugins/aws-node-provisioner/package.json

COPY --from=build /app/bootstrap ./bootstrap



RUN mkdir -p /data



EXPOSE 8080



CMD ["node", "packages/control-plane/dist/Server.js"]

