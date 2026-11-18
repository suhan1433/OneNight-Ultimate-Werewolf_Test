FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
# The Render runtime can set NODE_ENV=production. Build tools such as Vite and
# TypeScript are devDependencies, so explicitly include them while building.
RUN npm ci --include=dev
RUN npm install --global pnpm@10.11.0
COPY avalon/package*.json avalon/
COPY avalon/packages/shared/package.json avalon/packages/shared/package.json
COPY avalon/apps/server/package.json avalon/apps/server/package.json
COPY avalon/apps/web/package.json avalon/apps/web/package.json
WORKDIR /app/avalon
RUN npm ci --include=dev
WORKDIR /app
COPY skullking/package*.json skullking/
COPY skullking/packages/shared/package.json skullking/packages/shared/package.json
COPY skullking/apps/server/package.json skullking/apps/server/package.json
COPY skullking/apps/web/package.json skullking/apps/web/package.json
WORKDIR /app/skullking
RUN npm ci --include=dev
WORKDIR /app
COPY spacecrew/package*.json spacecrew/
WORKDIR /app/spacecrew
RUN npm ci --include=dev
WORKDIR /app
COPY rummikub/package*.json rummikub/
COPY rummikub/packages/rules/package.json rummikub/packages/rules/package.json
COPY rummikub/packages/protocol/package.json rummikub/packages/protocol/package.json
COPY rummikub/packages/platform/package.json rummikub/packages/platform/package.json
COPY rummikub/apps/server/package.json rummikub/apps/server/package.json
COPY rummikub/apps/client/package.json rummikub/apps/client/package.json
WORKDIR /app/rummikub
RUN npm ci --include=dev
WORKDIR /app
COPY deception/package.json deception/pnpm-lock.yaml deception/pnpm-workspace.yaml deception/
COPY deception/packages/shared/package.json deception/packages/shared/package.json
COPY deception/apps/server/package.json deception/apps/server/package.json
COPY deception/apps/web/package.json deception/apps/web/package.json
RUN pnpm --dir deception install --frozen-lockfile --prod=false
COPY secret_hitler/package*.json secret_hitler/
COPY secret_hitler/packages/shared-types/package.json secret_hitler/packages/shared-types/package.json
COPY secret_hitler/packages/rules-engine/package.json secret_hitler/packages/rules-engine/package.json
COPY secret_hitler/apps/server/package.json secret_hitler/apps/server/package.json
COPY secret_hitler/apps/client/package.json secret_hitler/apps/client/package.json
RUN npm --prefix secret_hitler ci --include=dev
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
COPY mp3 mp3
COPY avalon avalon
# Role reveal recordings are imported by Avalon's Vite build into dist/avalon/assets.
COPY avalon/avalon_role_mp3 avalon/avalon_role_mp3
COPY skullking skullking
COPY spacecrew spacecrew
COPY rummikub rummikub
COPY deception deception
COPY secret_hitler secret_hitler
COPY game-selector game-selector
COPY game-audio game-audio
# Shared game-switch runtime and type declarations are required by game servers.
COPY game-switch game-switch
# All browser apps share /app/apps/web/dist.
RUN npm run build:render

# Render exposes one public port. Nginx serves the selector and all web apps,
# and routes each Socket.IO endpoint to its own internal game server.
RUN apk add --no-cache nginx gettext
COPY infra/render-nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-start.sh /usr/local/bin/docker-start
RUN chmod +x /usr/local/bin/docker-start \
  && rm -f /etc/nginx/http.d/default.conf /etc/nginx/conf.d/default.conf
ENV NODE_ENV=production
EXPOSE 10000
CMD ["/usr/local/bin/docker-start"]
