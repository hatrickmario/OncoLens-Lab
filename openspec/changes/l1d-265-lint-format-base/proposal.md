# Proposal — l1d-265-lint-format-base

## Trazabilidad

L1D-265 · US-215 · FEAT-PL1 (L1D-30) · Sprint 1 · Estimación **2** · técnica (PRD §17) ·
NFR-13 (calidad y mantenibilidad), NFR-12 (accesibilidad, PRD §7) · US-215 AC-1, AC-2, AC-3, AC-4,
AC-5 · 🔗 Relacionada: US-213 (L1D-263, S2: umbrales y conteo de líneas que dependen del
`printWidth` fijado aquí) · DoR del S1: ✓ (`backlog/sprints/S1-refinamiento.md` §1).

> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos marcados "(asumido)" en los AC se
> aceptan. En esta historia, el del AC-5: `eslint-config-prettier` va al final de la configuración
> de ESLint y desactiva toda regla de estilo que choque con Prettier, de modo que un archivo
> formateado por Prettier nunca recibe un error de estilo de ESLint.

## Why

El S1 crea a la vez el esqueleto de `web`, `clinical-api` y `rag-orchestrator`, y lo escriben varios
agentes en paralelo. Sin una base común de lint y formato:

- los errores reales de React (hooks en condicionales, dependencias omitidas de `useEffect`), de
  TypeScript, de Next.js y de accesibilidad (NFR-12) llegan al PR y solo los detecta, si acaso, la
  revisión de un modelo;
- el estilo se discute en las revisiones y cada agente produce diffs de formato ruidosos;
- el conteo de líneas de US-213 (S2: 100 líneas = alerta, 150 = límite duro) no es estable si el
  ancho de línea cambia de un archivo a otro.

## What Changes

- **Prettier** (raíz): `.prettierrc.json` con `printWidth: 100`, `singleQuote: true`,
  `trailingComma: "all"` y `prettier-plugin-tailwindcss`; `.prettierignore` con lo generado
  (`packages/api-contracts/src/`, incluido `src/zod/`), los `openapi.yaml`, `contracts/`, `reports/`
  y los fixtures de `ci/tests/quality/fixtures/`. Ámbito: código (`ts`, `tsx`, `js`, `jsx`, `mjs`,
  `cjs`, `css`) de `apps/web`, `apps/clinical-api` y `packages/` (design D2).
- **ESLint** (raíz): `eslint.config.js` en *flat config*, compartido: `typescript-eslint` en `web` y
  `clinical-api`; en `web` además `eslint-plugin-react-hooks` (con `rules-of-hooks` y
  `exhaustive-deps` en `error`), `eslint-plugin-jsx-a11y` y `@next/eslint-plugin-next`;
  **seguridad del cliente** (Gate 1, 2026-10-14): `react/no-danger: error` (`eslint-plugin-react`)
  y `no-restricted-imports` que impide importar módulos *server-only* (`**/lib/server/**`,
  `@/lib/server/**`, `server-only`) desde archivos con la directiva `'use client'`, aplicado por una
  regla local que delega en la regla nativa solo en esos archivos (design D1b), con fixtures de CI;
  `eslint-config-prettier` al final. Se ejecuta con `--max-warnings 0` (design D1).
- **Python:** `apps/rag-orchestrator/pyproject.toml` con `[tool.ruff]` `line-length = 100` y
  exclusión de `app/schemas/generated/`; `ruff` con versión exacta en
  `apps/rag-orchestrator/requirements-dev.txt` (design D3).
- **Scripts raíz:** `lint`, `format` y `format:check` (Prettier + `ruff format`), más los auxiliares
  `format:py` y `format:py:check`. `npm run quality` de US-213 los incluirá (S2).
- **CI:** job `quality` en `.github/workflows/ci.yml` (creado por L1D-166) que ejecuta `npm run lint`,
  `npm run format:check` y los tests de fixtures de `ci/tests/quality/`; se añade al `needs:` de
  `ci-ok` (punto de extensión D1 de L1D-166). **El job vive en el `ci.yml` de L1D-166 y lo añade este
  change**; L1D-166 no lo crea.
- **Fixtures** `ci/tests/quality/fixtures/` (hooks, accesibilidad, `dangerouslySetInnerHTML`,
  import de `lib/server/**` desde `'use client'` y su contraejemplo de servidor, sin formato `.ts`/`.tsx`/`.py`,
  formateados) y test `ci/tests/quality/lint-format.test.mjs` (Vitest raíz) para AC-2 a AC-5.
- **Editor:** `.editorconfig` (UTF-8, LF, 2 espacios en TS/JS/JSON/YAML, 4 en Python, salto final).
- **Pasada de formato inicial** sobre el código del S1 ya en `main`, en un commit `style(L1D-265)`
  aislado, sin cambio de comportamiento.

## Capabilities

### New Capabilities

- `code-quality`: verificación estática y formato del código del monorepo (lint de TypeScript,
  React, Next.js y accesibilidad; formato único de TS/JS y Python; ejecución local y en la CI).
  **Justificación de capacidad nueva:** no encaja en ninguna de la lista de `openspec/config.yaml`
  (`platform-observability` es salud y métricas en ejecución; `platform-stack` de L1D-164 es Compose).
  US-213 (S2) añadirá aquí sus umbrales de tamaño y complejidad, dependencias entre capas e higiene de
  tests.

### Modified Capabilities

Ninguna. No escribe en `platform-stack` ni `platform-observability` (L1D-164), ni en `human-control`
(L1D-193). No modifica requisitos de `openspec/specs/` (`api-contracts`, `data-model`).

## Bounded contexts

- **clinical-platform**: configuración raíz (Prettier, ESLint, `.editorconfig`, scripts), job
  `quality` de la CI y lint de `apps/clinical-api`.
- **frontend**: bloque de `apps/web` en `eslint.config.js` (React, hooks, `jsx-a11y`, Next.js,
  Tailwind) y fixtures de AC-2 y AC-3.
- **ai-services**: `ruff format` en `apps/rag-orchestrator`.

## Dependencias

- ↪ **Depende de** `l1d-166-ci-build-contracts-scan` (L1D-166, US-036): `.github/workflows/ci.yml`,
  agregador `ci-ok` y `vitest.config.ts` raíz que recoge `ci/tests/**`. Si este change llega antes,
  la tarea de CI espera (no crea un `ci.yml` propio).
- ↪ **Depende de** `l1d-164-compose-stack` (L1D-164, US-034): `workspaces` del `package.json` raíz y
  esqueleto de `apps/web` (Next.js 16) y `apps/clinical-api`. Los scripts se añaden al mismo
  `package.json` conservando `contracts:*`, `test:infra` y `smoke:compose`.
- 🔗 **Coordinado con** `l1d-193-terminos-prohibidos-rn23` (L1D-193, US-068): `lint:lenguaje` es un
  script y un job propios, **fuera de ESLint** (Non-goal de US-215); `npm run lint` no lo invoca.
- 🔗 **Consumido por** todos los changes del S1 que escriben TS o Python: tras el merge, su PR debe
  pasar `quality`. Por eso conviene que este change entre en la primera oleada tras L1D-164 y L1D-166
  (design, Riesgos).
- 🔗 **Relacionada** US-213 (L1D-263, S2): extiende el job `quality` y `eslint.config.js`.

## Fuera de alcance

- Umbrales de tamaño y complejidad, reglas de dependencias entre capas, `import-linter`, lint de
  complejidad de Ruff y `npm run quality` (US-213, S2).
- Reglas de lenguaje prescriptivo (`lint:lenguaje`, L1D-193 / FEAT-T3).
- Hooks de pre-commit de Git (husky, lint-staged).
- Lint con información de tipos (`recommendedTypeChecked`) y `mypy`/`ruff check` de Python (US-213 si
  se decide).
- Formato de Markdown, YAML y de los `openapi.yaml` congelados (US-033).

## Preguntas abiertas

- **Hooks de `.claude/`** (dueño: **usuario**): ¿debe `pre-commit-gate.sh` correr `npm run lint` y
  `npm run format:check` sobre lo *staged*? Queda abierta; este change no toca `.claude/`
  (design.md D7 y Open Questions).

## Impact

- Archivos nuevos: `.prettierrc.json`, `.prettierignore`, `eslint.config.js`, `.editorconfig`,
  `apps/rag-orchestrator/pyproject.toml` (o su sección `[tool.ruff]` si ya existe),
  `apps/rag-orchestrator/requirements-dev.txt`, `ci/tests/quality/**`.
- Archivos modificados: `package.json` raíz (scripts y `devDependencies` exactas),
  `.github/workflows/ci.yml` (job `quality`, `needs:` de `ci-ok`), `docs/process/ci.md` (job nuevo).
- Sin cambios de API, de esquema ni de modelos: sin `## contratos` ni `## evaluación`.
- Dependencias de desarrollo nuevas (versión exacta, comprobada en la fuente al implementar):
  `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`,
  `@next/eslint-plugin-next`, `eslint-config-prettier`, `globals`, `prettier`,
  `prettier-plugin-tailwindcss`, `ruff`.
