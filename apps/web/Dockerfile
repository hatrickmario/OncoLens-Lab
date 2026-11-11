# syntax=docker/dockerfile:1
# Contexto de construcción: la raíz del repositorio (npm workspaces).
FROM node:24.22.1-alpine3.24 AS build
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
# Preguntas guiadas del panel (L1D-324): el RSC lee solo estos JSON del catálogo versionado (`catalogo-guiadas.ts`,
# `server-only`); un test comprueba que cada JSON importado tiene su COPY.
COPY packages/clinical-catalogs/manifest.json packages/clinical-catalogs/manifest.json
COPY packages/clinical-catalogs/escalas.json packages/clinical-catalogs/escalas.json
COPY packages/clinical-catalogs/lenguaje/marcos-de-pregunta.json packages/clinical-catalogs/lenguaje/marcos-de-pregunta.json
COPY packages/clinical-catalogs/mama/plantillas.json packages/clinical-catalogs/mama/plantillas.json
COPY packages/clinical-catalogs/mama/codigos.json packages/clinical-catalogs/mama/codigos.json
COPY packages/clinical-catalogs/mama/datos-criticos.json packages/clinical-catalogs/mama/datos-criticos.json
COPY packages/clinical-catalogs/prostata/plantillas.json packages/clinical-catalogs/prostata/plantillas.json
COPY packages/clinical-catalogs/prostata/codigos.json packages/clinical-catalogs/prostata/codigos.json
COPY packages/clinical-catalogs/prostata/datos-criticos.json packages/clinical-catalogs/prostata/datos-criticos.json
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace apps/web

FROM node:24.22.1-alpine3.24 AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static apps/web/.next/static
USER node
CMD ["node", "apps/web/server.js"]
