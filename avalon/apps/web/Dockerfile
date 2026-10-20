FROM node:22-alpine AS build
WORKDIR /app
COPY avalon/package*.json avalon/tsconfig.base.json ./
COPY avalon/packages/shared/package.json packages/shared/package.json
COPY avalon/apps/web/package.json apps/web/package.json
COPY avalon/apps/server/package.json apps/server/package.json
RUN npm install
COPY avalon/packages/shared packages/shared
COPY avalon/apps/web apps/web
COPY avalon/avalon_mp3 avalon_mp3
COPY avalon/avalon_role_mp3 avalon_role_mp3
COPY game-audio /game-audio
ARG VITE_SOCKET_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV DOCKER_BUILD=true
RUN npm run build -w @werewolf/shared && npm run build -w @werewolf/web
FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
