# syntax=docker/dockerfile:1
# Contexto de construcción: la raíz del repositorio (npm workspaces).
FROM node:24.22.0-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/clinical-api/package.json apps/clinical-api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --include-workspace-root --workspace apps/web
COPY apps/web apps/web
# Solo el SDK generado de clinical-api para web (sin extensión .js; Turbopack); el resto de packages/ no se necesita.
COPY packages/api-contracts/src/client-web/clinical-api packages/api-contracts/src/client-web/clinical-api
# Los tests no forman parte de la imagen: importan scripts/ del repositorio, que el contexto de build no incluye.
RUN rm -rf apps/web/tests apps/web/vitest.config.ts apps/web/vitest.build.config.ts
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace apps/web

FROM node:24.22.0-alpine3.24 AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static apps/web/.next/static
USER node
CMD ["node", "apps/web/server.js"]
