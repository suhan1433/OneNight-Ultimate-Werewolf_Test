FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w @werewolf/shared && npm run build -w @werewolf/server
CMD ["npm","run","start","-w","@werewolf/server"]
