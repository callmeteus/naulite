FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json yarn.lock turbo.json tsconfig.base.json ./
COPY packages/nodejs/shared/package.json ./packages/nodejs/shared/
COPY packages/nodejs/logger/package.json ./packages/nodejs/logger/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/ui/packages/backend/package.json ./packages/ui/packages/backend/

RUN corepack enable && yarn install --frozen-lockfile || yarn install

COPY packages/nodejs/shared ./packages/nodejs/shared
COPY packages/nodejs/logger ./packages/nodejs/logger
COPY packages/sdk ./packages/sdk
COPY packages/ui/packages/backend ./packages/ui/packages/backend
COPY scripts ./scripts

RUN yarn workspace @naulite/shared build \
    && yarn workspace @naulite/logger build \
    && yarn workspace @naulite/sdk build \
    && yarn workspace @naulite/ui-backend build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/nodejs/shared/dist ./packages/nodejs/shared/dist
COPY --from=build /app/packages/nodejs/shared/package.json ./packages/nodejs/shared/package.json
COPY --from=build /app/packages/nodejs/logger/dist ./packages/nodejs/logger/dist
COPY --from=build /app/packages/nodejs/logger/package.json ./packages/nodejs/logger/package.json
COPY --from=build /app/packages/sdk/dist ./packages/sdk/dist
COPY --from=build /app/packages/sdk/package.json ./packages/sdk/package.json
COPY --from=build /app/packages/ui/packages/backend/dist ./packages/ui/packages/backend/dist
COPY --from=build /app/packages/ui/packages/backend/package.json ./packages/ui/packages/backend/package.json

EXPOSE 3001

CMD ["node", "packages/ui/packages/backend/dist/Server.js"]
