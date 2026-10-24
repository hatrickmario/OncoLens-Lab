# Design — l1d-278-e2e-ci-login-tailwind

## Context

`scripts/e2e/ejecutar.sh` hace secretos → stack fingido (`oncolens-e2e`) → esquema clínico → seed →
`npm run build --workspaces` → Chromium → `playwright test` → `down -v` (~1 min desde cero en local).
`apps/web` no tiene Tailwind ni shadcn; `/login` usa `login.module.css`, `login-form.module.css` y
`campo-con-etiqueta.module.css` (este último solo lo usa `login-form`). `globals.css` define un
subconjunto de los tokens de `docs/ux/sistema-de-diseno.md` §1. Next.js 16 con Turbopack, sin
`webpack()` personalizado (CLAUDE.md).

## Decisions

### D1. Workflow aparte para los E2E
- **Recomendada:** `.github/workflows/e2e.yml` (`pull_request` y `push` a `main`,
  `permissions: contents: read`, acciones por SHA, `timeout-minutes: 30`) que llama a
  `npm run test:e2e` con `CI=true`. `playwright.config.ts` ya decide `retries: process.env.CI ? 1 : 0`
  y `trace: 'on-first-retry'`; el job sube `playwright-report/` y `test-results/` como artefacto con
  **`retention-days: 3`** (repo público: el artefacto es descargable).
- **Informe y trazas sin cuerpos de request ni contraseñas:** un *fixture* de red no basta. Medido con Playwright 1.64,
  la contraseña de un login fallido queda en el título del paso (`Fill "<contraseña>"`, que el informe HTML incrusta en
  base64 en `index.html`, también con todo en verde), en el `fill` del `trace.trace`, en el valor de los `input` de los
  snapshots, en el recurso del `postData` y en `error-context.md` (copiado a `data/`). Por eso hay dos reporters alrededor
  de `html`: `apps/web/e2e/depurador-de-adjuntos.ts` (primero) sustituye el secreto en los títulos de paso y depura cada
  `trace.zip` y adjunto de texto —quitando `postData`, las respuestas de `POST /api/*` y las cabeceras de credenciales— y
  descarta lo que no pueda depurar; `apps/web/e2e/verificador-de-informe.ts` (último, porque el informe se escribe en
  `onExit`) reescanea `playwright-report/` y `test-results/`, zips anidados y el zip incrustado en base64 incluidos, y si
  queda un secreto borra las carpetas y termina la corrida con error (**falla cerrado**). Sin dependencias nuevas (el zip
  se lee y escribe con `node:zlib`). La prueba (`scripts/e2e/integracion/informe.integracion.mjs`) lanza Playwright
  real contra un servidor local mínimo, con sonda de control (sin reporters la contraseña aparece). Los usuarios de los
  E2E son **sintéticos** (dominios de prueba permitidos por el hook de commits, p. ej. `@oncolens.test`; el seed actual
  usa `doc1@test.local`) y su contraseña la genera `setup-secrets.sh` dentro de `scripts/e2e/ejecutar.sh`, en una carpeta
  temporal propia: nunca versionada ni reutilizada fuera de la CI; en CI se enmascara con `::add-mask::`.
- Descartadas: job dentro de `ci.yml` excluido de `needs` de `ci-ok` (contradice el requisito de
  L1D-166 «`ci-ok` depende de todos los jobs»); `continue-on-error` (prohibido por ese mismo spec).

### D2. Criterio de estabilidad para hacerlo requerido
10 ejecuciones consecutivas en verde en `main` sin depender del reintento. Hacerlo requerido (pasarlo
a `ci.yml` y a `ci-ok`, o marcar el check como requerido en la protección de `main`) es una acción
humana posterior (ARR-06 / L1D-282). Un E2E inestable es un bug del sprint (CLAUDE.md), no se pone en
cuarentena.

### D3. Tailwind v4 con los tokens del sistema de diseño como única fuente
`globals.css`: `@import "tailwindcss";` y `@theme` que **referencia** los `--color-*` de `:root`
(los completa con los de §1 que faltan); tipografía: **`system-ui` por ahora** (`--font-sans:
system-ui, …`). El sistema de diseño (§Tipografía) nombra Public Sans pero no trae el archivo
autoalojado (no hay `.woff2` en el repo) y la CSP prohíbe Google Fonts en runtime; Public Sans
autoalojada (`next/font/local`, OFL) queda para otra historia y solo cambia el token. Escala de 4 px, radios 6/8/10, foco visible `outline 3px primary offset 2px`.
shadcn/ui por copia (`components/ui/`, Atomic Design: átomos), sin su CLI en runtime.

**Desviación (visual-check, aceptada por sprint-S2, 2026-10-21):** `globals.css` importa solo
`tailwindcss/theme.css` y `tailwindcss/utilities.css` (sin preflight) en lugar de `@import "tailwindcss"`:
el preflight quitaba tamaño y peso a h1-h3, listas, `dl`, `button` y `summary` de la pantalla de análisis
(aún en CSS Modules). Los átomos de `components/ui/` declaran `box-border`. Se adopta el preflight
completo cuando se migre el resto de pantallas del S2; hasta entonces las pantallas en CSS Modules
conservan sus estilos. La dependencia `@radix-ui/react-slot` no se instala (sin uso, YAGNI) y
`@radix-ui/react-label` queda en 2.1.15 (versiones posteriores con menos de 14 días de antigüedad).
Componentes propios: `Button` con variantes `primario`/`secundario`/`fantasma`; `Card` con `variante: 'plana' | 'elevada'`.
`cn()` usa `extendTailwindMerge` con los radios y la sombra de los tokens propios (tailwind-merge no los conoce).
`tests/ui/globals-css.test.ts` exige la ausencia del preflight mientras exista algún `*.module.css` bajo `apps/web`;
al migrar la última pantalla ese test se retira con `Test-Removal: ya no hay CSS Modules` y se adopta el preflight.

### D4. Migración sin cambio de comportamiento
Se conservan textos (`lib/mensajes`), `id`/`aria-labelledby`, `role="alert"` del error, nombres
accesibles y el `<form>`; por eso `tests/ui/login-*.test.tsx` y los E2E de login no cambian sus
aserciones. El diálogo de login es el único con sombra (§1 Elevación).

## Privacidad y ownership

Sin cambios de flujo de datos: el navegador sigue hablando solo con `web`; la contraseña solo viaja en
el cuerpo de `POST /api/auth/login`. `rag-orchestrator` no interviene.

**Seguridad web:**
- Validación: el formulario sigue usando el schema Zod compartido de login en cliente y servidor.
- Sin variables `NEXT_PUBLIC_` nuevas. Sin módulos `server-only` nuevos.
- Sin texto del LLM ni del corpus en esta pantalla; sin `dangerouslySetInnerHTML`.
- CSP y cabeceras: Tailwind v4 compila a una hoja estática (sin estilos en línea inyectados en runtime), compatible con
  `style-src 'self'` + nonce cuando US-144 defina la CSP (hoy pendiente). El visual-check verifica 0 violaciones de la
  política que haya. Sin fuentes ni recursos de terceros.
- Dependencias nuevas: las 7 de Impact, versiones exactas; resultado de `npm audit` en el PR (job de
  `l1d-267` si ya existe; si no, adjunto).

## Componentes y patrones

- Átomos nuevos `components/ui/{card,input,label,button,alert}.tsx` (copias de shadcn ajustadas a los
  tokens); `lib/utils.ts` con `cn()`.
- `organisms/login-form.tsx` se mantiene como **un** organismo (`'use client'`, ya lo es) y deja de
  usar `CampoConEtiqueta`, que se borra (su único consumidor pasa a `Label` + `Input`).
- `app/login/page.tsx` sigue siendo RSC.
- Sin patrones nuevos (ni hooks, ni providers, ni compound components): no hay evidencia (YAGNI).
  Límite de 150 líneas por componente.
- Referencia de pantalla: `docs/ux/S2/pantallas-s2.md` S2-01 (estructura de S1-01 con `Card`,
  `Input`, `Label`, `Button`, `Alert`). Desviación: el pie y los avisos `?motivo=` de S2-01 quedan para
  US-044 (l1d-198).

## Contratos

Sin cambios de contrato.

## Dependencias y colaboradores

`login-form` depende de los átomos `ui/*` y de `lib/mensajes`; `ejecutar.sh` gana un modo CI (sin
`--mantener`, salida de Playwright en formato `github` + `html`) y deja de heredar `COMPOSE_PROJECT_NAME` y
`ONCOLENS_SECRETS_DIR` del entorno. Compila solo `@oncolens/clinical-language` (lo único que importan los E2E; `web` y
`clinical-api` se compilan en sus imágenes).

## Risks / Trade-offs

- Primera adopción de Tailwind: puede alterar estilos globales (preflight) del resto de pantallas en
  CSS Modules. Mitigación: visual-check también de la pantalla de análisis a 1280 px y E2E en verde.
- Tiempo del job E2E en el *runner* (build de imágenes): caché de capas de Docker de Actions si supera
  15 min.

## Open Questions

Ninguna. (Tipografía resuelta: `system-ui` hasta que exista Public Sans autoalojada, D3.)
