FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock turbo.json tsconfig.base.json ./
COPY packages ./packages
RUN yarn install --frozen-lockfile || yarn install
RUN yarn workspace @platform/ui build

FROM nginx:alpine
COPY --from=build /app/packages/ui/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
