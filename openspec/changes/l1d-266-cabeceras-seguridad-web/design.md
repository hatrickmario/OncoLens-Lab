# Design — l1d-266-cabeceras-seguridad-web

## Context

- `apps/web/next.config.ts` no tiene `headers()`; `poweredByHeader: false` ya está.
- `apps/web/proxy.ts` (Next.js 16: `proxy.ts` sustituye a `middleware.ts`) solo cubre `/pacientes/:path*`: redirige
  sin sesión y pone `Cache-Control: no-store`. `/login` y `/api/*` no pasan por él.
- Ya en `main` (US-215): `react/no-danger` como error y `oncolens/no-restricted-imports-en-cliente`. `server-only` en
  todos los módulos de `apps/web/lib/server/`. `esUrlHttpSegura()` en `apps/web/lib/evidence/procedencia.ts`, usada por
  `components/molecules/citation-details.tsx`. Test de build `apps/web/tests/build/url-interna.test.ts` (US-060 AC-5).
- El chat del S6 (`l1d-314`, `l1d-324`, `l1d-325`) depende de esta CSP (ADR-51 §8: sin `unsafe-eval`, Markdown sin HTML
  crudo, `urlTransform` restringido).

## Goals / Non-Goals

**Goals:** CSP con nonce y cabeceras en toda respuesta de `web`; anti-clickjacking, `/login` incluida; lista permitida
de `NEXT_PUBLIC_*` y escaneo de secretos del bundle; regresiones de XSS y de enlaces de cita.

**Non-Goals:** HSTS/TLS (US-144), rate limiting, colector de reportes CSP, WAF, auditoría de dependencias (US-217).

## Decisions

### D1 · CSP dinámica en `proxy.ts`, cabeceras estáticas en `next.config.ts`

El nonce debe ser distinto por request, así que la CSP se construye en `proxy.ts` siguiendo el patrón documentado de
Next.js: genera el nonce, lo pone en la cabecera de **request** `x-nonce` y en `Content-Security-Policy` (para que Next
lo aplique a sus scripts) y en la de respuesta. El *matcher* pasa a toda la app excepto `_next/static`, `_next/image` y
`icon.svg`; la rama de `/pacientes/*` conserva la redirección y el `no-store` (sin cambio de comportamiento). Las
cabeceras sin estado (`nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`) van en `headers()`
de `next.config.ts` para `/:path*`, de modo que también cubren estáticos. Descartadas en una línea: CSP solo en
`next.config` (sin nonce exige `unsafe-inline`); hashes SRI experimentales (no cubren scripts inline de RSC).

### D2 · Directivas

`default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'nonce-<n>';
style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none';
base-uri 'none'; form-action 'self'; frame-ancestors 'none'`. `style-src-attr 'unsafe-inline'` aceptado (P-1, [S6 resp. 19]). La
construcción es una función pura `construirCsp({ nonce, modo, desarrollo })` en `apps/web/lib/server/csp.ts`; en
`next dev` con `solo_informe` añade `'unsafe-eval'` (React Refresh) y emite `Content-Security-Policy-Report-Only`.

### D3 · Nonce y render dinámico

El generador del nonce (16 bytes de `crypto.getRandomValues`, base64) se inyecta en la función de `proxy.ts` para que
los tests lo congelen (regla de determinismo). `app/layout.tsx` lee `headers().get('x-nonce')`, lo que hace dinámicas
todas las páginas (ya lo eran las de `/pacientes` por la cookie; `/login` deja de prerenderizarse, coste aceptable).

### D4 · Configuración (RN-22)

`WEB_CSP_MODO` ∈ {`aplicar`, `solo_informe`}, por defecto `aplicar`; se valida con Zod al arrancar junto al resto de la
configuración de `web` (`instrumentation.ts`) y `solo_informe` con `NODE_ENV=production` aborta nombrando la variable.
Compose, CI y E2E usan la build de producción, así que siempre `aplicar`.

### D5 · Variables públicas y bundle

`config/public-env.allowlist.json` = `{ "variables": [] }` (cada entrada futura: `nombre` + `justificacion`).
`scripts/ci/public-env.mjs` busca `NEXT_PUBLIC_[A-Z0-9_]+` en `apps/web/**/*.{ts,tsx,mjs,js}` (sin `node_modules` ni
`.next`) y en `apps/web/.env*` y `infra/docker/*.env*`; imprime nombre y archivo, nunca valor. Se añade al job
`quality`. El escaneo del bundle se suma a `apps/web/tests/build/` reutilizando la carga de reglas de `.gitleaks.toml`
(si `gitleaks` está instalado en la CI, `gitleaks dir apps/web/.next/static --no-banner`; si no, las regex del toml) más
los centinelas, con la utilidad de recorrido de `url-interna.test.ts` extraída a un helper compartido.

### D6 · Texto y enlaces

Sin cambios de render: el panel ya muestra texto plano. Este change añade los tests de regresión (AC-3, AC-5) y, si
`citation-details.tsx` no pone `rel="noopener noreferrer"` y `target="_blank"` en todos los casos, lo corrige. Para el
chat, la regla queda escrita para `l1d-324`/`l1d-325`: Markdown solo con `react-markdown` + `rehype-sanitize`, sin
`rehype-raw`, con `urlTransform` que devuelve `''` si `esUrlHttpSegura()` es falso.

## Componentes y patrones

Sin componentes nuevos. `layout.tsx` sigue siendo RSC; no se añade ningún `'use client'` ni provider. Sin patrones nuevos.

## Dependencias y colaboradores

- Nuevo `apps/web/lib/server/csp.ts` (`server-only` no aplica: lo importa `proxy.ts`, que corre en el *runtime* del
  proxy; sin dependencias de E/S): `construirCsp()` pura y `generarNonce()` inyectable.
- `proxy.ts` depende de `csp.ts` y de `lib/server/sesion.ts` (ya existente).
- `instrumentation.ts`/config de `web`: lectura de `WEB_CSP_MODO`, única fuente del valor.
- `scripts/ci/public-env.mjs` lee `config/public-env.allowlist.json`; sin otras dependencias.

## Privacidad y ownership

- No cruza ningún dato nuevo de frontera: el cambio es de cabeceras y de CI. `rag-orchestrator` y `clinical-api` no se
  tocan; `rag-orchestrator` sigue sin acceso a datos clínicos ni a `clinical-minio`.
- La redirección sin sesión sigue sin copiar la ruta del paciente a la URL (RN-10); `no-store` se mantiene en
  `/pacientes/*`.
- **Seguridad web:** sin validación nueva (no hay formularios ni endpoints nuevos). Variables `NEXT_PUBLIC_` nuevas:
  ninguna, y la lista permitida queda vacía. Módulos `server-only`: sin cambios; la regla de lint queda como regresión.
  Texto del LLM y del corpus: texto plano, sin HTML crudo; Markdown solo con `rehype-sanitize`. CSP y cabeceras: este
  change las crea; los changes de UI del S6 MUST NOT añadir `unsafe-eval`/`unsafe-inline` a `script-src`. Dependencias
  nuevas: ninguna. Los scripts de CI y los tests nunca imprimen valores de secretos ni de variables.
- Referencia UX: no cambia pantallas (`docs/ux/` sin desviaciones).

## Contratos

Sin cambios de `openapi.yaml` ni de `contracts/examples/`: las cabeceras de transporte no forman parte del contrato. El
fixture de AC-3 se deriva en el test de `contracts/examples/con-evidencia-s1.json` (no se añade un ejemplo con HTML al
contrato). Compatible con ADR-26.

## Risks / Trade-offs

- `'strict-dynamic'` + nonce exige render dinámico: `/login` deja de ser estática (latencia mínima, sin caché que perder).
- Una librería del chat (assistant-ui) que use `eval` o estilos inline rompería la CSP: lo detecta el spike `l1d-314`
  antes de adoptarla; la CSP no se relaja por una librería sin ADR.
- Next.js podría inyectar algún script sin nonce en una versión futura: el E2E de consola sin violaciones lo detecta.
