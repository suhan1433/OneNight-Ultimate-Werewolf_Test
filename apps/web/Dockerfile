FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm install --global pnpm@10.11.0 \
  && npm ci --include=dev \
  && npm --prefix avalon ci --include=dev \
  && npm --prefix skullking ci --include=dev \
  && npm --prefix spacecrew ci --include=dev \
  && npm --prefix rummikub ci --include=dev \
  && pnpm --dir deception install --frozen-lockfile --prod=false
ARG VITE_SOCKET_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN npm run build:render
FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
