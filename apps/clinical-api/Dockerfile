# syntax=docker/dockerfile:1
# Contexto de construcción: la raíz del repositorio (npm workspaces).
FROM node:24.22.0-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/clinical-api/package.json apps/clinical-api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --include-workspace-root --workspace apps/clinical-api
COPY apps/clinical-api apps/clinical-api
# El SDK generado de rag-orchestrator vive fuera de la app y se compila junto con ella (tsconfig.build.json).
COPY packages/api-contracts/src/client/rag-orchestrator packages/api-contracts/src/client/rag-orchestrator
# Los schemas Zod generados del propio contrato (auth.schema.ts) también se compilan con la app.
COPY packages/api-contracts/src/zod/clinical-api packages/api-contracts/src/zod/clinical-api
# El cierre del análisis importa los tipos del cliente de clinical-api y el Zod de la respuesta interna de rag-orchestrator.
COPY packages/api-contracts/src/client/clinical-api packages/api-contracts/src/client/clinical-api
COPY packages/api-contracts/src/zod/rag-orchestrator packages/api-contracts/src/zod/rag-orchestrator
# `catalog:validate` al arrancar (L1D-93): el núcleo del validador, su allowlist y los esquemas del catálogo se compilan con la app.
COPY packages/clinical-catalogs/validator packages/clinical-catalogs/validator
COPY packages/clinical-catalogs/schemas packages/clinical-catalogs/schemas
RUN npm run build --workspace apps/clinical-api

FROM node:24.22.0-alpine3.24 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/clinical-api/package.json apps/clinical-api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace apps/clinical-api && npm cache clean --force
COPY --from=build /app/apps/clinical-api/dist apps/clinical-api/dist
# `serviceVersion` de /health sale de `info.version` de este archivo (US-037): una sola fuente de la versión.
COPY --from=build /app/apps/clinical-api/openapi.yaml apps/clinical-api/openapi.yaml
# Reglas de reemplazo del enmascarado de PII (L1D-203); los formatos (config/pii-formats.json) se montan de solo lectura.
COPY --from=build /app/apps/clinical-api/config apps/clinical-api/config
USER node
WORKDIR /app/apps/clinical-api
CMD ["node", "dist/apps/clinical-api/src/server.js"]
