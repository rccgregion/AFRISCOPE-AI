FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 DATABASE_PATH=/app/.data/afriscope
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && mkdir -p /app/.data && chown -R node:node /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/supabase ./supabase
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
VOLUME ["/app/.data"]
CMD ["node", "dist-server/index.js"]
