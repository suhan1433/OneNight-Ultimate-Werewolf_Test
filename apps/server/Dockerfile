FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY packages/shared packages/shared
COPY apps/server apps/server
# Build the browser app into /app/apps/web/dist as well. The Express server
# serves this directory, so Render needs only one Web Service.
COPY apps/web apps/web
RUN npm run build -w @werewolf/shared && npm run build -w @werewolf/server && npm run build -w @werewolf/web
CMD ["npm","run","start","-w","@werewolf/server"]
