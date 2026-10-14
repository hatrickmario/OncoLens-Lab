# Design — l1d-265-lint-format-base

## Context

`main` tiene solo el `package.json` raíz con `contracts:*` (US-033), `packages/api-contracts/src/`
generado, los `openspec.yaml` congelados y `apps/rag-orchestrator/app/schemas/` generado. En el S1,
L1D-164 crea los `workspaces` y los esqueletos de `web` (Next.js 16 con Turbopack) y `clinical-api`;
L1D-166 crea `.github/workflows/ci.yml` con el agregador `ci-ok` y el `vitest.config.ts` raíz. Este
change fija la base de lint y formato que todos usan (US-215; supuestos aceptados `[S1 resp. 3]`).

Matriz TDD de `CLAUDE.md`: configuración y CI → **test después** (humo o fixture en el mismo PR).

## Goals / Non-Goals

**Goals:** un solo `npm run lint` y un solo `npm run format:check` en la raíz, deterministas, con
código de salida distinto de 0 ante cualquier hallazgo, iguales en local y en la CI (AC-1); errores
de hooks y accesibilidad con archivo, línea y regla (AC-2, AC-3); formato que se corrige solo sin
cambiar comportamiento (AC-4); ESLint y Prettier sin conflictos (AC-5).

**Non-Goals:** umbrales de tamaño y complejidad y capas (US-213); `lint:lenguaje` (L1D-193);
husky; lint con tipos.

## Decisions

### D1 · ESLint: un `eslint.config.js` raíz en *flat config*

```
eslint.config.js
├─ ignores: node_modules, .next, dist, coverage, reports, packages/api-contracts/src/**,
│           apps/rag-orchestrator/**, ci/tests/quality/fixtures/**, .claude/**
├─ @eslint/js recommended                      (todo TS/JS)
├─ typescript-eslint recommended               (apps/web, apps/clinical-api, packages/**)
├─ bloque web  files: apps/web/**/*.{ts,tsx}
│   ├─ eslint-plugin-react-hooks recommended  + rules-of-hooks: error, exhaustive-deps: error
│   ├─ eslint-plugin-jsx-a11y recommended     (alt-text, click-events-have-key-events,
│   │                                          no-static-element-interactions, …)
│   ├─ @next/eslint-plugin-next recommended + core-web-vitals; settings.next.rootDir: apps/web
│   ├─ eslint-plugin-react  react/no-danger: error                       (D1b)
│   ├─ oncolens/no-restricted-imports-en-cliente: error                  (D1b)
│   └─ globals.browser
├─ bloque clinical-api  files: apps/clinical-api/**/*.ts   globals.node
└─ eslint-config-prettier                      (SIEMPRE el último) [US-215 AC-5]
```

- Script raíz: `"lint": "eslint . --max-warnings 0"`. `--max-warnings 0` hace que cualquier
  advertencia de un preset (p. ej. `exhaustive-deps` es `warn` por defecto) falle igual; además
  `rules-of-hooks` y `exhaustive-deps` se fijan en `error` de forma explícita `[US-215 AC-2]`.
- **Next.js 16** ya no trae `next lint`: se usa la CLI de ESLint con el plugin de Next en *flat
  config*. Sin `webpack()` en `next.config` (CLAUDE.md); ESLint no toca el build.
- Los fixtures quedan ignorados en el `npm run lint` normal; el test los lintea con la API de Node
  (`new ESLint({ ignore: false, ... })`) aplicándoles el bloque `web` mediante
  `overrideConfig` con `files: ['ci/tests/quality/fixtures/web/**']`, para no ensuciar la config.
- Alternativas (una línea): `recommendedTypeChecked` (más lento y exige `tsconfig` por paquete;
  candidata para US-213); un `eslint.config.js` por workspace (duplica la base que US-213 extiende);
  Biome (no cubre `jsx-a11y` ni las reglas de Next con la misma fidelidad).

### D1b · Seguridad del cliente: `react/no-danger` e imports *server-only* (Gate 1, 2026-10-14)

- **`react/no-danger: error`** (de `eslint-plugin-react`, solo esa regla; no se activa su preset para
  no solapar con `react-hooks` y `typescript-eslint`): `dangerouslySetInnerHTML` es la vía de XSS
  sobre texto generado por IA o extraído de documentos; si algún día hace falta, se pide con un
  `eslint-disable-next-line` justificado y revisado por privacy-guardian en el Gate 2.
- **`no-restricted-imports` en código `'use client'`.** La regla nativa no puede limitarse por
  directiva (los bloques de *flat config* seleccionan por ruta y un componente cliente puede vivir
  en cualquier carpeta). Por eso una regla local mínima,
  `scripts/quality/eslint-rules/no-restricted-imports-en-cliente.mjs` (plugin `oncolens`), comprueba
  si el `Program` empieza con la directiva `'use client'` y, solo entonces, delega en
  `builtinRules.get('no-restricted-imports').create(context)` con las mismas opciones:
  `patterns: [{ group: ['**/lib/server/**', '@/lib/server/**', 'server-only'], message:
  'Un módulo \'use client\' no puede importar código del servidor (lib/server/**, server-only)' }]`.
  Cubre `import` estático, `export … from` e `import()` dinámico (lo que cubre la regla nativa). Es
  la primera barrera (en el lint, con archivo y línea); la segunda sigue siendo el paquete
  `server-only` que importan los módulos de `lib/server/` (L1D-139 D4) y que rompe el build.
- **Fixtures** (`ci/tests/quality/fixtures/web/`): `dangerously-set.tsx` (→ `react/no-danger`,
  `severity: 2`), `cliente-importa-server.tsx` (`'use client'` + `import … from
  '@/lib/server/clinical-api'` → `oncolens/no-restricted-imports-en-cliente`) y su contraejemplo
  `servidor-importa-server.tsx` (sin directiva, mismo import → sin error), para que la regla no se
  convierta en una prohibición global.
- Alternativa descartada: `no-restricted-imports` sobre carpetas (`components/**`, `hooks/**`), que
  deja pasar un `'use client'` fuera de ellas y bloquea Server Components legítimos dentro.

### D2 · Prettier: ámbito limitado al código

- `.prettierrc.json`: `printWidth: 100`, `singleQuote: true`, `trailingComma: "all"`,
  `plugins: ["prettier-plugin-tailwindcss"]` con `tailwindStylesheet` apuntando a la hoja global de
  `apps/web` (Tailwind v4) cuando exista.
- Scripts: `"format": "prettier --write <globs> && npm run format:py"`,
  `"format:check": "prettier --check <globs> && npm run format:py:check"`, con
  `<globs>` = `"apps/web/**/*.{ts,tsx,js,jsx,mjs,cjs,css}" "apps/clinical-api/**/*.{ts,js,mjs,cjs}"
  "packages/**/*.{ts,tsx,js,mjs,cjs}"`. `prettier --check` imprime la ruta de cada archivo sin
  formatear `[US-215 AC-4]`.
- `.prettierignore`: `packages/api-contracts/src/` (incluye `src/zod/`), `**/openapi.yaml`,
  `contracts/`, `reports/`, `ci/tests/quality/fixtures/`, `.next/`, `dist/`, `coverage/`.
- **Fuera del ámbito a propósito:** Markdown, YAML y JSON. Los `openapi.yaml` están congelados
  (US-033) y su reformateo alteraría `contracts:generate:check` y el extracto del readme; el JSON de
  `packages/clinical-catalogs` es dato versionado. Se puede ampliar con su propio PR.
- **`components/ui/**` de shadcn se formatea** (no se excluye): el código copiado por la CLI de
  shadcn es nuestro desde que entra al repo; excluirlo crearía dos estilos y un borde de conteo para
  US-213. Revertir cuesta una línea en `.prettierignore`. (El backlog lo dejaba "si se decide".)

### D3 · Python: `ruff format`

- `apps/rag-orchestrator/pyproject.toml` (lo crea este change si no existe; si existe, añade la
  sección): `[tool.ruff] line-length = 100`, `target-version` según `.python-version` (3.13, L1D-166),
  `extend-exclude = ["app/schemas/generated"]` (Pydantic generado: reformatearlo rompería
  `contracts:generate:check`).
- `ruff` con versión exacta en `apps/rag-orchestrator/requirements-dev.txt`.
- Scripts raíz `format:py` / `format:py:check` → `node scripts/quality/ruff.mjs [--check]`, que
  ejecuta `ruff format [--check] apps/rag-orchestrator` y, si `ruff` no está en el `PATH`, **falla**
  con `ruff no encontrado: pip install -r apps/rag-orchestrator/requirements-dev.txt` (falla
  cerrado; nunca omite en silencio).
- Solo formato; `ruff check` y la complejidad son de US-213.

### D4 · CI: job `quality` en el `ci.yml` de L1D-166

```
quality   npm ci → setup-python (.python-version) → pip install -r apps/rag-orchestrator/requirements-dev.txt
          → npm run lint → npm run format:check → npx vitest run ci/tests/quality
ci-ok     needs: [..., quality]
```

- El nombre `quality` es el del AC-1; US-213 añadirá `npm run quality` al mismo job. Acciones por SHA
  y versiones de L1D-166 (D1 de ese change); sin `continue-on-error`.
- Quien llegue segundo a `ci.yml` integra el `needs:` sin borrar el del otro (L1D-166 D1).

### D5 · Verificación por fixtures (`ci/tests/quality/`)

| AC | Fixture | Aserción |
|---|---|---|
| AC-1 | árbol del repo | `npm run lint` y `npm run format:check` salen con 0 (ejecutados por el job; el test de humo `lint-format.test.mjs` los lanza con `execa`/`child_process`) |
| AC-2 | `fixtures/web/hook-condicional.tsx`, `fixtures/web/effect-sin-dependencia.tsx` | mensajes con `ruleId` `react-hooks/rules-of-hooks` y `react-hooks/exhaustive-deps`, `severity: 2`, `filePath` y `line` esperados |
| AC-3 | `fixtures/web/img-sin-alt.tsx`, `fixtures/web/div-clicable.tsx` | `jsx-a11y/alt-text`; `jsx-a11y/click-events-have-key-events` y `jsx-a11y/no-static-element-interactions` |
| AC-4 | `fixtures/formato/sin-formato.ts`, `.tsx`, `.py` | copia a un directorio temporal; `--check` falla y nombra el archivo; tras `--write`/`ruff format`, `--check` pasa; comportamiento igual: el `.ts` exporta una función pura cuyo resultado es idéntico antes y después, el `.py` tiene `ast.dump` idéntico (`python -I`) |
| AC-3 (seguridad, D1b) | `fixtures/web/dangerously-set.tsx`, `cliente-importa-server.tsx`, `servidor-importa-server.tsx` | `react/no-danger` y `oncolens/no-restricted-imports-en-cliente` con `severity: 2`, `filePath` y `line`; el contraejemplo sin directiva no produce mensajes |
| AC-5 | `fixtures/formato/formateado.tsx` y `.ts` (salida de Prettier) | ESLint con la config raíz no devuelve ninguna regla de estilo; `npx eslint-config-prettier <archivos>` (CLI de comprobación del paquete) sale con 0 |

### D6 · Pasada de formato inicial

Al final, `npm run format` sobre el código que ya esté en `main`, en un commit `style(L1D-265)` que
solo cambia espacios, comillas y comas (sin cambios de lógica; tests en verde antes y después). No
toca lo generado (excluido) ni los `openapi.yaml`.

### D7 · Hooks de Claude Code

Ninguno de `.claude/hooks/` corre hoy lint ni formato (`pre-commit-gate.sh` revisa secretos, PII,
higiene de tests y `openspec validate`). Este change **no** modifica `.claude/`: el control es el
job `quality`, y los implementadores corren `npm run lint` y `npm run format` antes de cada commit
(lo documenta `docs/process/ci.md`). Si se quiere el control antes del commit, es una pregunta para
el humano (ver Open Questions).

## Privacidad y ownership

- No cruza ninguna frontera de datos: herramientas de desarrollo que leen código fuente del repo.
  `rag-orchestrator` no gana acceso a nada; `ruff` solo lee y reescribe sus `.py`.
- Sin datos clínicos, sin PII y sin secretos en fixtures: componentes y funciones triviales con
  textos neutros (RN-14). Las salidas de ESLint/Prettier/Ruff en la CI solo imprimen rutas, líneas y
  reglas.
- **Seguridad web** (toca la configuración de `apps/web`): sin variables `NEXT_PUBLIC_` nuevas; sin
  módulos *server-only* nuevos; no cambia cómo se renderiza el texto del LLM o del corpus ni la CSP
  ni las cabeceras (US-216, S6); `jsx-a11y` y el plugin de Next no añaden código al bundle. Las
  dependencias nuevas son solo `devDependencies`: `npm audit --omit=dev` no cambia y el resultado
  de `npm audit` completo se adjunta al PR.

## Contratos

Sin cambios de API: ningún `openapi.yaml` ni `contracts/examples/` cambia; lo generado
(`packages/api-contracts/src/`, `app/schemas/generated/`) queda excluido de ESLint, Prettier y Ruff
para que `contracts:generate:check` siga byte a byte. ADR-26 no aplica.

## Dependencias y colaboradores

| Módulo | Nuevo / modifica | Depende de | Nota |
|---|---|---|---|
| `eslint.config.js` | nuevo | plugins de D1 | base que US-213 extiende |
| `.prettierrc.json`, `.prettierignore` | nuevos | `prettier-plugin-tailwindcss` | `printWidth: 100` lo supone US-213 |
| `.editorconfig` | nuevo | — | solo para personas |
| `scripts/quality/ruff.mjs` | nuevo | `ruff` en el `PATH` | falla cerrado si falta |
| `apps/rag-orchestrator/pyproject.toml`, `requirements-dev.txt` | nuevo / modifica | — | `[tool.ruff]` |
| `package.json` raíz | modifica (de L1D-164) | — | `lint`, `format`, `format:check`, `format:py`, `format:py:check` |
| `.github/workflows/ci.yml` | modifica (de L1D-166) | — | job `quality`, `needs:` de `ci-ok` |
| `ci/tests/quality/**` | nuevo | Vitest raíz (L1D-166), API de ESLint y Prettier | fixtures de AC-2…AC-5 |
| `docs/process/ci.md` | modifica (de L1D-166) | — | describe el job `quality` |

Sin reglas de dominio que extraer.

## Risks / Trade-offs

- **Código del S1 que entra antes que este change** puede no pasar el lint → la pasada D6 lo
  formatea y los errores reales de lint se corrigen en este PR (o se reportan al dueño si cambian
  lógica). Mitigación: planificar este change en la primera oleada tras L1D-164 y L1D-166.
- **Presets que cambian entre versiones** (p. ej. `react-hooks` v7 añade reglas del React Compiler
  al `recommended`) → versiones exactas, comprobadas en la fuente al implementar; si un preset trae
  reglas que el código del S1 no cumple, se decide en el PR (activarlas y corregir, o dejarlas para
  US-213), nunca desactivarlas en silencio.
- **`ruff` fuera del `PATH` en local** → `scripts/quality/ruff.mjs` falla con instrucción clara.
- **`prettier-plugin-tailwindcss` sin hoja de Tailwind** aún (si `web` no la tiene en el S1) → el
  plugin funciona sin `tailwindStylesheet`; se fija cuando exista.

## Open Questions

- ¿Debe `pre-commit-gate.sh` (`.claude/hooks/`) correr `npm run lint` y `npm run format:check`
  sobre lo *staged* para que los agentes vean el fallo antes del commit, y no solo en la CI? Fuera de
  alcance por defecto (Non-goal: "la CI y los hooks de Claude Code ya cubren el control"); requiere
  aprobación del humano porque toca `.claude/`. **Abierta para el humano** (dueño: usuario) tras el
  Gate 1 (2026-10-14); hasta su respuesta, `.claude/` no se toca.
