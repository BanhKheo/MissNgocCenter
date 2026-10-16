# missngoc.webapp/apps/web/Dockerfile — build từ thư mục gốc repo:
#   docker build -f missngoc.webapp/apps/web/Dockerfile -t missngoc/grader-web:1.0.0 .
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY missngoc.webapp/packages/core/package.json missngoc.webapp/packages/core/
COPY missngoc.webapp/apps/web/package.json missngoc.webapp/apps/web/
COPY missngoc.services/api/package.json missngoc.services/api/
RUN npm ci --workspace missngoc.web --workspace @missngoc/core --no-audit --no-fund
COPY missngoc.webapp missngoc.webapp
RUN npm run build -w missngoc.web

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/missngoc.webapp/apps/web/dist /usr/share/nginx/html
