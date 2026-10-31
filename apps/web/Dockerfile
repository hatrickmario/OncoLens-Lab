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
# Los tipos generados del contrato (import type) también los comprueba el tsc del build.
COPY packages/api-contracts/src/types/clinical-api packages/api-contracts/src/types/clinical-api
# Los schemas Zod generados del contrato (login: zLoginBody y los de error) también se compilan con web.
COPY packages/api-contracts/src/zod/clinical-api packages/api-contracts/src/zod/clinical-api
# Filtro RN-23 del panel (US-246): solo el verificador puro y la lista versionada, rutas relativas intactas
# (hasta D4-22, que lo reemplazaría por un subpath público de clinical-language).
COPY packages/clinical-language/src packages/clinical-language/src
COPY packages/clinical-catalogs/lenguaje/terminos-prohibidos.json packages/clinical-catalogs/lenguaje/terminos-prohibidos.json
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
