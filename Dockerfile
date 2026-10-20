FROM node:22-alpine AS build
WORKDIR /app

# Each game is currently an independent npm workspace.  Install all of them
# before the integrated build writes their static files into apps/web/dist.
COPY . .
RUN npm ci \
  && npm --prefix avalon ci \
  && npm --prefix skullking ci \
  && npm --prefix spacecrew ci \
  && npm --prefix rummikub ci \
  && npm run build

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
