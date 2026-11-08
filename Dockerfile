FROM node:22-alpine AS build
WORKDIR /app

# Each game is an independent workspace (deception uses pnpm). Install all of them
# before the integrated build writes their static files into apps/web/dist.
COPY . .
COPY game-audio game-audio
RUN npm install --global pnpm@10.11.0 \
  && npm ci --include=dev \
  && npm --prefix avalon ci --include=dev \
  && npm --prefix skullking ci --include=dev \
  && npm --prefix spacecrew ci --include=dev \
  && npm --prefix rummikub ci --include=dev \
  && pnpm --dir deception install --frozen-lockfile --prod=false \
  && npm run build:render

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache nginx gettext
COPY --from=build /app /app
COPY infra/render-nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-start.sh /usr/local/bin/docker-start
RUN chmod +x /usr/local/bin/docker-start \
  && rm -f /etc/nginx/http.d/default.conf /etc/nginx/conf.d/default.conf

ENV NODE_ENV=production
EXPOSE 10000
CMD ["/usr/local/bin/docker-start"]
