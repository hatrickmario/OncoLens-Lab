# syntax=docker/dockerfile:1
# Contexto de construcción: la raíz del repositorio (npm workspaces).
FROM node:24.22.0-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/clinical-api/package.json apps/clinical-api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --include-workspace-root --workspace apps/clinical-api
COPY apps/clinical-api apps/clinical-api
RUN npm run build --workspace apps/clinical-api

FROM node:24.22.0-alpine3.24 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/clinical-api/package.json apps/clinical-api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace apps/clinical-api && npm cache clean --force
COPY --from=build /app/apps/clinical-api/dist apps/clinical-api/dist
USER node
WORKDIR /app/apps/clinical-api
CMD ["node", "dist/server.js"]
