FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/rules-engine/package.json packages/rules-engine/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /data && chmod 700 /data && chown node:node /data
ENV NODE_ENV=production PORT=3007 DATA_DIR=/data
USER node
EXPOSE 3007
VOLUME ["/data"]
CMD ["npm","start"]
