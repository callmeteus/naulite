FROM node:22-alpine AS build

ARG VITE_ADMIN_API_URL=/api
ENV VITE_ADMIN_API_URL=$VITE_ADMIN_API_URL

WORKDIR /app
COPY package.json yarn.lock turbo.json tsconfig.base.json ./
COPY assets ./assets
COPY packages ./packages
COPY scripts ./scripts
RUN yarn install --frozen-lockfile || yarn install
RUN yarn workspace @naulite/shared build \
    && yarn workspace @naulite/sdk build \
    && yarn workspace @naulite/ui-frontend build

FROM nginx:alpine
COPY packages/ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/ui/packages/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
