# missngoc.services/api/Dockerfile — build từ thư mục gốc repo:
#   docker build -f missngoc.services/api/Dockerfile -t missngoc/grader-api:1.0.0 .
# Một image dùng cho cả api, worker và migrate (chỉ khác lệnh chạy).

FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json package-lock.json ./
COPY missngoc.webapp/packages/core/package.json missngoc.webapp/packages/core/
COPY missngoc.webapp/apps/web/package.json missngoc.webapp/apps/web/
COPY missngoc.services/api/package.json missngoc.services/api/

# Thư viện chạy thật (không có công cụ build)
FROM base AS prod-deps
RUN npm ci --omit=dev --workspace missngoc.api --workspace @missngoc/core --no-audit --no-fund
COPY missngoc.services/api/prisma missngoc.services/api/prisma
RUN cd missngoc.services/api && npx prisma generate

# Build TypeScript
FROM base AS build
RUN npm ci --workspace missngoc.api --workspace @missngoc/core --no-audit --no-fund
COPY missngoc.webapp/packages/core missngoc.webapp/packages/core
COPY missngoc.services/api missngoc.services/api
RUN npm run build -w @missngoc/core \
 && cd missngoc.services/api && npx prisma generate && npx nest build

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./
COPY --from=build /repo/missngoc.webapp/packages/core/package.json missngoc.webapp/packages/core/
COPY --from=build /repo/missngoc.webapp/packages/core/dist missngoc.webapp/packages/core/dist
COPY --from=build /repo/missngoc.services/api/package.json missngoc.services/api/
COPY --from=build /repo/missngoc.services/api/prisma missngoc.services/api/prisma
COPY --from=build /repo/missngoc.services/api/dist missngoc.services/api/dist
RUN mkdir -p /data/uploads && chown -R node:node /data
WORKDIR /repo/missngoc.services/api
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
