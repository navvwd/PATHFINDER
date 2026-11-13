# PathFinder AI web app - static build served by nginx, /api proxied to the backend.
# Build from the repo root:  docker build -f infrastructure/docker/web.Dockerfile -t pathfinder-web .
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN npm ci --workspace @pathfinder/web --include-workspace-root
COPY apps/web apps/web
RUN npm run build -w @pathfinder/web

FROM nginx:1.27-alpine
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1/healthz || exit 1
