# Design — arr-11-ci-rapida

## Context

Estado actual (`.github/workflows/ci.yml`, leído el 2026-11-03): 12 jobs y el agregador `ci-ok` (`if: always()`,
`needs` de todos). `build-test` hace en serie `npm ci`, oasdiff, build, `test:build` de `web`, tests de los workspaces,
catálogo (`catalog:validate`, `version-guard`, `allowlist:check`), `pip install` de `requirements.txt` + `-dev` + `-eval`,
Vitest raíz, Pytest con cobertura (sube `cobertura-rag-orchestrator`), verificación del proveedor de `rag-orchestrator` y
`test:secrets`. `quality` tiene `needs: build-test` solo para descargar el `coverage.xml`. `eval-required` y
`higiene-proceso` «siempre corren» y deciden en su script, para no quedar omitidos frente a `verificar-needs.mjs`, que
falla con cualquier `result !== 'success'`. `e2e.yml` es un workflow aparte, fuera de `ci-ok`.

Hechos que condicionan el diseño (comprobados en el repo):

- El **Vitest raíz** necesita Python con `requirements-eval.txt`: `scripts/ci/__tests__/evalRequired.test.mjs` ejecuta
  `evaluate` de verdad, y oasdiff (`contractsBreakingCasos`). Por eso `build-test-node` también prepara Python.
- Hay `.md` que el código lee: `readme.md` y `docs/architecture/data-model.md` (`scripts/contracts/lib/paths.mjs`,
  `assertDataModelDocument`, `apps/clinical-api/tests/support/matriz-de-permisos.ts`),
  `docs/architecture/adr/ADR-39-modelos-locales.md` (`app/evaluation/chequeo_config.py`) y `data/**/ATTRIBUTION.md`
  (`test_manifiesto_real_de_la_semilla.py`). Un prompt de `rag-orchestrator` también podría ser `.md`. «`*.md` = docs» sin
  excepciones dejaría pasar sin tests cambios que sí los rompen.
- Ningún script de `scripts/contracts/` lee `openspec/` (solo `tasks-destino.mjs`, `pii-scan.mjs` y
  `scripts/quality/check-ac-coverage.mjs`, que es una alerta).
- `tasks-destino.mjs` ya extrae varios `[L1D-nn]` consecutivos (`historiasDelTitulo`), pero no la forma con comas.
- `ci/tests/workflow.test.mjs` exige que **todos** los `requirements*.txt` se instalen antes de Pytest y nombra el job
  `build-test` en 5 tests; `scripts/ci/__tests__/evalRequiredWorkflow.test.mjs` exige `requirements-eval.txt` en
  `eval-required`.

## Goals / Non-Goals

**Goals:** PR de documentación en ~2 min; PR de código de ~22 a ~10 min (D-12, con D-11); sin perder ningún control:
`ci-ok` sigue siendo el único check requerido y sigue fallando cerrado ante todo lo no declarado.

**Non-Goals:** paralelizar Pytest, decidir `eval-required` antes del `pip install`, pre-vuelo local, cambiar la protección
de `main` (D-12, «Fuera de ARR-11»).

## Decisions

### D1 · Detector de cambios: script propio + lista de omitibles que lee `ci-ok` (caro de revertir: protección de `main`)

`scripts/ci/detectar-cambios.mjs --base "$BASE_REF"` calcula el merge-base (`git merge-base <base> HEAD`) y el diff
`git diff --no-renames --name-status <merge-base> HEAD` (sin detección de renombres: un `git mv` de código a
`docs/*.md` aparece como borrado del código más alta del `.md`, y el borrado no es documentación) y escribe en
`$GITHUB_OUTPUT`:

- `documentacion` = `true` si **todos** los archivos cambiados casan con `documentacion` de
  `scripts/ci/cambios-paths.yaml` (`backlog/**`, `docs/**`, `openspec/**`, `**/*.md`) y **ninguno** casa con
  `consumidos_por_codigo` (`readme.md`, `docs/architecture/data-model.md`, `docs/architecture/adr/ADR-39-*.md`,
  `data/**`, `apps/**/prompts/**`, `contracts/**`) ni con un disparador de `scripts/ci/eval-trigger-paths.yaml` (se reutiliza
  `cargarReglas`/`tocaDisparador` de `eval-trigger.mjs` y `casaConGlob` de `lib/glob.mjs`; no se duplican globs).
- `omitibles` = JSON con los jobs de `omitibles_en_documentacion` del YAML (todos los de `ci.yml` salvo `cambios`,
  `secret-scan`, `data-scan`, `lint-lenguaje`, `higiene-proceso` y `ci-ok`) si `documentacion` es `true`; `[]` si no.

Reglas conservadoras (falla hacia «CI completa», no hacia «omitir»): evento `push` → CI completa; base vacía o
`0000000…` → completa; **sin merge-base** (historia superficial, base inexistente) → completa con el motivo «sin
merge-base», nunca un diff de dos puntos; diff vacío → completa; un archivo que no está en ninguna lista → completa. Configuración inválida
(YAML ilegible, job omitible que no existe en `ci.yml`) → código 2 y `cambios` en rojo → `ci-ok` en rojo.

Cada job omitible lleva `needs: cambios` e
`if: ${{ !contains(fromJSON(needs.cambios.outputs.omitibles), '<su nombre>') }}`: la lista del detector es la **única**
fuente; `workflow.test.mjs` comprueba que el conjunto de jobs con ese `if` es exactamente `omitibles_en_documentacion` y
que cada `if` nombra a su propio job.

`verificar-needs.mjs`: `jobsSinExito(needs)` acepta `skipped` en un job **solo** si `needs.cambios.result === 'success'` y
el nombre está en `JSON.parse(needs.cambios.outputs.omitibles)`. `toJSON(needs)` ya incluye `outputs`: no hace falta otra
variable. Un `omitibles` ilegible cuenta como `[]`. El mensaje nombra los omitidos declarados (`omitido por el detector`).

*Alternativas:* (a) **elegida**; (b) `paths-ignore` en el disparador del workflow — `ci-ok` no se crea y el check
requerido queda «pendiente» para siempre (bloquea el merge); (c) `dorny/paths-filter` — acción de terceros con permisos de
lectura del PR, otro SHA que vigilar y sin integración con `verificar-needs` ni con los disparadores de `eval-required`.

### D2 · `openspec/` no dispara `contracts`

Un PR que solo toca deltas de `openspec/` es documentación y `contracts` se omite. Motivo: ningún script de
`contracts:check`, `contracts:generate:check` ni `contracts-breaking.sh` lee `openspec/` (comprobado); el `## Contratos` de
un `design.md` es una **propuesta** que revisa `contract-keeper` en el Gate 1, y el contrato real cambia en `openapi.yaml`
y `contracts/examples/` (contract-first), que nunca son documentación. Si un día un script de contratos lee `openspec/`,
basta con añadir `openspec/**/specs/**` a `consumidos_por_codigo` (configuración, no código).

### D3 · Partición de `build-test`

| `build-test-node` | `build-test-rag` |
|---|---|
| `npm ci` (caché), oasdiff, build de workspaces, `test:build` de `web`, tests de workspaces, `catalog:validate`, `version-guard`, `allowlist:check`, venv de Python (caché) para el Vitest raíz, Vitest raíz, `test:secrets` | `npm ci` (caché; Pytest necesita Node, US-036), venv de Python (caché), Pytest con `--cov` → artefacto `cobertura-rag-orchestrator`, `contracts:verify-provider -- --proveedor rag-orchestrator` |

Ambos en `needs` de `ci-ok` y en `omitibles_en_documentacion`. Se conserva el nombre de cada paso, así
`workflow.test.mjs` («cada comando de los fixtures de PR figura tal cual en un paso») sigue valiendo. *Descartada:* poner
el Vitest raíz en `build-test-rag` (ya tiene Python): deja `build-test-rag` en ~10 min y `build-test-node` en ~4.

### D4 · `quality` en paralelo y `cobertura-rag` aparte (US-213 AC-11)

`quality` pierde `needs: build-test` y el paso de descarga; corre `quality:report` con
`COBERTURA_INFORMES_XML=` vacío (solo LCOV de `web` y `clinical-api`). La lista de informes esperados pasa a leerse de esa
variable, con el valor actual como defecto (un solo dueño: `INFORMES_COBERTURA_XML` en `cobertura.mjs`).

Job nuevo `cobertura-rag` (`needs: [cambios, build-test-rag]`, omitible): checkout con `fetch-depth: 0`, descarga
`cobertura-rag-orchestrator` y ejecuta `node scripts/quality/cobertura.mjs --solo-xml --salida reports/quality/cobertura-rag.json`,
que llama a la **misma** `medirCoberturaDelPr` con solo el informe XML y escribe el bloque `cobertura` con la
forma de `latest.json`; lo sube como artefacto `quality-report-rag`. Nunca falla por cobertura (alerta); falla si falta el
informe (paso roto, como hoy). `design-principles-reviewer` lee los dos reportes (se documenta en `docs/process/ci.md`).

*Alternativas:* (a) **elegida** (camino crítico ≈ máx(`build-test-rag` + ~1 min, `build-test-node`, `quality`));
(b) `quality` con `needs: build-test-rag` — un reporte, pero ~8 + 5 = 13 min; (c) `quality` sondea la API de artefactos —
exige `actions: read` y lógica de espera en el YAML.

### D5 · Cachés

- **Node:** `actions/cache` (fijada por SHA, versión vigente comprobada en la fuente al implementar) sobre `node_modules`,
  `apps/*/node_modules` y `packages/*/node_modules`; clave `node-${{ runner.os }}-${{ hashFiles('.nvmrc', 'package-lock.json') }}`
  sin `restore-keys` (una caché parcial con `npm ci` saltado sería un árbol inconsistente). En acierto se omite `npm ci`
  (`if: steps.<id>.outputs.cache-hit != 'true'`). `setup-node` mantiene `cache: npm` para los fallos de caché. Los `dist/`
  no se cachean (los genera el build). Se aplica en todos los jobs que hoy hacen `npm ci`.
- **Python:** venv `.venv-ci` en la raíz con clave
  `venv-${{ runner.os }}-${{ hashFiles('.python-version', 'apps/rag-orchestrator/requirements.txt', 'apps/rag-orchestrator/requirements-dev.txt', 'apps/rag-orchestrator/requirements-eval.txt') }}`,
  compartida por `build-test-node`, `build-test-rag` y `eval-required` (este instala solo `requirements` + `eval`: clave
  propia). `requirements-export.txt` **no** entra en la clave ni en la CI. `setup-python` mantiene `cache: pip` (ruedas
  descargadas); el ahorro grande es el venv instalado.
- **Seguridad:** las cachés de un PR se escriben en el ámbito de su ref y no pueden envenenar las de `main` (GitHub las
  aísla por rama); no se usa `pull_request_target` ni secretos.

### D6 · Títulos de lote en `higiene-proceso`

`historiasDelTitulo` acepta además `[L1D-1, L1D-2]` (coma y espacios dentro de un corchete), sin duplicados y en el orden
del título; los formatos actuales no cambian. `verificar-commits-tdd.mjs` ya agrupa el orden por clave de commit y no
cambia. Un título sin `[L1D-nn]` inicial sigue sin comprobarse (PR `docs`, `chore` y este mismo, `[ARR-11]`).

### D7 · D-11: dependencias de exportación fuera de la CI

`torch==2.14.1` y `transformers==5.20.2`, con su comentario de licencia, pasan a `requirements-export.txt` (cabecera:
«solo exportación manual a ONNX, ADR-39; nunca en la CI ni en la imagen»). `adr39-medicion.Dockerfile` copia e instala
`requirements-eval.txt` **y** `requirements-export.txt`. `test_dependencias_de_inferencia.py`: `transformers` (y `torch`)
están en `requirements-export.txt` y **ni** en `requirements.txt` **ni** en `requirements-eval.txt`. `workflow.test.mjs`
(«instala cada `requirements*.txt` antes de Pytest») excluye explícitamente `requirements-export.txt` y gana el test
inverso: ningún paso de ningún workflow instala `requirements-export.txt`. `auditar-dependencias.sh` añade
`-r requirements-export.txt` (`pip-audit --no-deps --disable-pip` no instala nada: no descarga CUDA). El comentario de la
línea 4 de `requirements.txt` y el docstring de `scripts/demo/exportar-modelos.py` apuntan al fichero nuevo.
*Descartadas (D-11):* `torch` CPU desde `download.pytorch.org` y liberar disco en el runner.

### D8 · D5-02: `contracts:check` contra `main` fusionado

El checkout de un `pull_request` es el *merge ref* calculado **cuando se disparó** el evento; si después entra en `main`
un cambio que vuelve requerido un campo (#271, #274), los ejemplos del PR (#276) siguen verdes. Paso nuevo, último del job
`contracts`: `scripts/ci/contracts-contra-main.sh "$BASE_REF"`. Solo en `pull_request` y solo si el diff toca
`contracts/examples/**` o `apps/*/openapi.yaml` (si no, imprime `omitido: el PR no toca ejemplos ni specs` y sale con 0).
Hace `git fetch --no-tags origin main`, `git merge --no-edit --no-ff origin/main` con identidad local de la CI (sin
credenciales: el checkout es `persist-credentials: false` y el repositorio es público) y `npm run contracts:check`. Un
conflicto falla con «el PR tiene conflictos con main: actualiza la rama» sin imprimir contenido. **Volver a ejecutar** el
job `contracts` antes del merge revalida contra la punta de `main` de ese momento (el *merge ref* no cambia en un
re-run; este paso sí). *Descartada:* «Require branches to be up to date» en la protección — obliga a actualizar **todos**
los PR (D-12 la deja fuera; ver Pendientes).

## Dependencias y colaboradores

- **Crea:** `scripts/ci/detectar-cambios.mjs` (+ `__tests__/detectarCambios.test.mjs`), `scripts/ci/cambios-paths.yaml`,
  `scripts/ci/contracts-contra-main.sh` (+ test hermético con repositorio temporal), `apps/rag-orchestrator/requirements-export.txt`,
  casos de PR en `ci/tests/cases/` (ver tasks).
- **Modifica:** `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `scripts/ci/verificar-needs.mjs`,
  `scripts/ci/tasks-destino.mjs` (`historiasDelTitulo`), `scripts/quality/cobertura.mjs` (`--solo-xml`, informes desde
  configuración), `scripts/ci/auditar-dependencias.sh`, `ci/tests/workflow.test.mjs`,
  `scripts/ci/__tests__/evalRequiredWorkflow.test.mjs` (si cambia la instalación), `requirements-eval.txt`,
  `requirements.txt` (comentario), `adr39-medicion.Dockerfile`, `test_dependencias_de_inferencia.py`,
  `docs/demo/runbook-demo-S1.md`, `scripts/demo/exportar-modelos.py` (docstring), `docs/process/ci.md`.
- **Reutiliza, no duplica:** `cargarReglas`/`tocaDisparador` de `eval-trigger.mjs` y `casaConGlob` de `lib/glob.mjs`,
  `valorDeArgumento` de `lib/cli.mjs`, `medirCoberturaDelPr` y `alertasDeCobertura` de `cobertura.mjs`.
- **Reglas con nombre propio:** `esSoloDocumentacion(archivos, reglas)`, `omitiblesDeclarados(needs)` (en
  `verificar-needs.mjs`), `tocaContratos(archivos)`. Funciones puras con su test unitario; E/S (git, `GITHUB_OUTPUT`) solo
  en `main()`.

## Privacidad y ownership

No cruza ninguna frontera de datos: no toca `web`, `clinical-api` ni `rag-orchestrator` en tiempo de ejecución, ni datos
clínicos, ni `clinical-minio`. `rag-orchestrator` sigue sin acceso a datos clínicos (sin cambios en Compose, redes ni roles).
RN-14 (repositorio público): sin secretos del repositorio, sin `pull_request_target` ni `workflow_run`, acciones por SHA,
`permissions: contents: read` en ambos workflows, `persist-credentials: false` en todo checkout; el detector y el paso de
D5-02 imprimen **rutas**, nunca contenido de archivos; el título del PR sigue entrando por `PR_TITLE` (variable de entorno,
nunca interpolado). Los escáneres de secretos y PII (`secret-scan`, `data-scan`) **nunca** son omitibles, tampoco en los PR
de documentación. RN-12/RN-13 sin cambios. D-11 reduce superficie: la CI deja de descargar ~4 GB de terceros.

## Contratos

Sin cambios en `apps/*/openapi.yaml` ni en `contracts/examples/`: no hay proveedor ni consumidor afectados (ADR-26 intacto).
D5-02 solo **endurece la verificación** de los contratos existentes.

## Riesgos / Trade-offs

- **Omitir de más** (un `.md` que el código lee y no está en `consumidos_por_codigo`) → mitigado por la lista de
  excepciones, la regla «desconocido → completa», el push a `main` siempre completo y un test que recorre `scripts/` y `apps/` con
  `git grep` de lecturas de `*.md` y compara cada ruta con `consumidos_por_codigo` (escenario «consumidos_por_codigo cubre
  todo .md que el código lee»; caso de PR `ac-docs-leido-por-codigo`).
- **Renombre de código a documentación** → `--no-renames`: el origen borrado entra al diff y fuerza la CI completa
  (escenario del renombre).
- **Caché de `node_modules` inconsistente** (p. ej., un `postinstall` que dependa del entorno) → clave exacta sin
  `restore-keys`; si aparece un fallo atribuible a la caché, se arregla (bug del sprint), no se reintenta.
- **Doble mantenimiento del `if:` y la lista** → una sola fuente (la salida del detector) y test del workflow.
- **`cobertura-rag` añade un job** → ~1 min fuera del camino crítico de `build-test-node`.
- **Conflicto de requisito al archivar con `l1d-166`** → anotado en proposal; lo concilia ARR-10.

## Medición

Tras el merge: duración de `ci-ok` en 3 PR de código y 3 de documentación del S5 frente a la línea base (~22 min, CI de
`main` 41581630153), anotada en el PR y en `docs/process/ci.md` (como la medición de L1D-166).

## Pendientes de definir

- ~~Solapamiento con ARR-10~~ — **Decidido (usuario, 2026-11-03, `[S5 resp. 14]`):** D-11 y D5-02 los implementa este
  change; ARR-10 queda con la conciliación (y el archivado) y los puntos no cambian (ARR-10 sigue en 2, total 90).
- **Regla del orquestador para D5-02** (dueño: humano): «volver a ejecutar `contracts` antes de pedir el merge de un PR que
  toca `contracts/examples/**` si `main` avanzó» va en `.claude/agents/sprint-orchestrator.md`, fuera de este change
  (los agentes no editan su configuración). Afecta: eficacia de D5-02 sin «up to date» obligatorio.
- **SHA de `actions/cache`** (dueño: implementador): versión vigente comprobada en la fuente, fijada por SHA de 40
  caracteres con el tag en comentario.
