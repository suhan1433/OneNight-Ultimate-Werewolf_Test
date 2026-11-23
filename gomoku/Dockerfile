FROM node:22-alpine AS build
WORKDIR /app/gomoku
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app/gomoku
ENV NODE_ENV=production PORT=3011
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/gomoku/build ./build
COPY --from=build /app/gomoku/dist ./dist
EXPOSE 3011
CMD ["node", "build/server/index.js"]
