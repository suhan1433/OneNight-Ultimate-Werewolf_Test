FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
# The Render runtime can set NODE_ENV=production. Build tools such as Vite and
# TypeScript are devDependencies, so explicitly include them while building.
RUN npm ci --include=dev
COPY avalon/package*.json avalon/
COPY avalon/packages/shared/package.json avalon/packages/shared/package.json
COPY avalon/apps/server/package.json avalon/apps/server/package.json
COPY avalon/apps/web/package.json avalon/apps/web/package.json
WORKDIR /app/avalon
RUN npm ci --include=dev
WORKDIR /app
COPY bloodbound/package*.json bloodbound/
COPY bloodbound/packages/shared/package.json bloodbound/packages/shared/package.json
COPY bloodbound/apps/server/package.json bloodbound/apps/server/package.json
COPY bloodbound/apps/web/package.json bloodbound/apps/web/package.json
WORKDIR /app/bloodbound
RUN npm ci --include=dev
WORKDIR /app
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
COPY mp3 mp3
COPY avalon avalon
COPY bloodbound bloodbound
COPY game-selector game-selector
# All browser apps share /app/apps/web/dist: /werewolf, /avalon and /bloodbound.
RUN npm run build -w @werewolf/shared && npm run build -w @werewolf/server && npm run build -w @werewolf/web \
  && npm --prefix avalon run build \
  && npm --prefix bloodbound run build \
  && cp game-selector/index.html apps/web/dist/index.html \
  && cp game-selector/launcher.css apps/web/dist/launcher.css

# Render exposes one public port. Nginx serves the selector and all web apps,
# and routes each Socket.IO endpoint to its own internal game server.
RUN apk add --no-cache nginx gettext
COPY infra/render-nginx.conf.template /etc/nginx/http.d/default.conf.template
CMD ["sh", "-c", "envsubst '$PORT' < /etc/nginx/http.d/default.conf.template > /etc/nginx/http.d/default.conf && RUN_STANDALONE_SERVER=true PORT=3001 node apps/server/dist/server.js & RUN_STANDALONE_SERVER=true PORT=3002 node avalon/apps/server/dist/server.js & RUN_STANDALONE_SERVER=true PORT=3003 node bloodbound/apps/server/dist/server.js & nginx -g 'daemon off;'"]
