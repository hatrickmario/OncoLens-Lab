# Tasks — l1d-285-higiene-tests-ci

> Matriz TDD (CLAUDE.md): CI, configuración de lint/cobertura, scripts y Compose → **test después** (fixture de PR en
> `ci/tests/quality/` o `ci/tests/cases/`, o test hermético, en el mismo PR). Contrato y ejemplo → secuencia `contract`.
> La regla AC-17 es un **control de seguridad**: la tarea 1.1 la ejecuta la **sesión principal o el humano**, no un agente.
> Todo test que lance un proceso real (`npm run quality`, `contracts:check`, el script de CI) declara un tiempo máximo
> explícito (no los 5 s por defecto de Vitest). Mocks solo en los bordes; nunca `.skip`, `.only`, `xfail`.

## 1. contratos

- [x] 1.1 **(ejecutada por la sesión principal, revisada por privacy-guardian; commits 93a259bd, 164aea13 y 3e6923ea)** **[SESIÓN PRINCIPAL / HUMANO — control de seguridad RN-14, no delegar a un agente]** En
  `scripts/contracts/rules/assertExamplesSynthetic.mjs`, añadir `esMascaraDeNombre(key, value)` (solo clave `fullNameMasked`
  y valor `^P\. S\.( \d\.)?$`, solo la máscara sintética, design D7, `[S3 resp. 16]`) y usarla en la comprobación de nombre
  de persona, junto a `esMascaraDeDocumento`. Primero los tests en `scripts/contracts/__tests__/rules/assertExamplesSynthetic.test.mjs`
  (en rojo): acepta `"P. S. 1."` y `"P. S."`; rechaza `"María Pérez"`, `"M. Pérez"`, `"Ma. P."`, `"M. P."` y `"P. S. 12."` en
  `fullNameMasked`; rechaza `"P. S."` en `fullName`
  `[US-213 AC-12]` (Q-1). Revisión de `privacy-guardian`. Commit `contract(L1D-285)` propio. Verifica: tests de la regla en verde.
- [x] 1.2 (contract-first, tras 1.1) `pattern: '^\S\.( \S\.)*$'` en `PatientListItem.fullNameMasked` de
  `apps/clinical-api/openapi.yaml`; `info.version` *patch* `1.9.0` → `1.9.1` (`[S3 resp. 16]`); `contracts/examples/patient-page-doctor.json` con
  `"fullNameMasked": "P. S. 1."`; migrar el fixture derivado `apps/web/tests/support/pacientes-ui.ts` (`otroPaciente.fullNameMasked`
  `'Prueba Sintética 2'` → `'P. S. 2.'`, `[S3 resp. 16]`) y comprobar que la suite de `web` sigue en verde. `contracts:check`, `contracts:breaking` (si oasdiff lo marca, excepción justificada,
  ADR-26), `contracts:generate` y commit `contract(L1D-285)`. Verifica: `contracts:check` en verde con el escenario «el
  ejemplo del listado lleva las dos máscaras» `[US-213 AC-12]`.
- [x] 1.3 (test después) Caso de `contracts:check` con `fullNameMasked = "PS1"` → falla nombrando el `pattern` `[US-213 AC-12]`, y
  test de integración de `GET /platform/patients` (Supertest + PostgreSQL real, seed sintético) que valida `fullNameMasked`
  contra el spec (verificación del proveedor, US-214). Casos de `enmascararNombre()` frente al `pattern` con nombre vacío y con
  un carácter astral (`[S3 resp. 16]`; los unitarios actuales de `patients-reglas.test.ts` fijan la salida, no su validez frente
  al `pattern`): el resultado observado se fija en el test y, si no cumple el `pattern`, se reporta al orquestador antes del
  `feat`. Verifica: todos en verde.

## 2. clinical-platform

- [x] 2.1 (hecha con la regla propia `oncolens/tests-sin-pendientes-ni-foco-jest` para `it.todo` y `fit`, corrección de D1) (test después) Fixtures de PR en `ci/tests/quality/` con `it.only`, `it.skip`, `describe.skip`, `xit`, `fit`, `it.todo`
  en tests de `web` y `clinical-api`, y casos de `npm run quality` que esperan fallo con archivo, línea y regla `[US-213 AC-8]`.
  Luego `@vitest/eslint-plugin` (versión exacta) en el bloque de tests de `eslint.config.js` (D1), fuera de `excepciones`.
  Verifica: casos en verde (el job falla donde debe) y `npm run quality` en verde en `main`.
- [x] 2.2 (test después) Fixtures de `vi.mock('./…')`, `vi.mock('@/…')`, `vi.mock('@oncolens/…')` y `vi.mock('@prisma/client')` →
  falla `mock-solo-en-bordes`; `vi.mock` del SDK de MinIO → pasa `[US-213 AC-10]`. Regla `no-restricted-syntax` (D4). Si el
  código vigente la viola: corregir (≤ 2 operaciones) o excepción con caducidad e ID de deuda. Verifica: casos en verde.
- [x] 2.3 (test después) `packages/test-support/msw/` (workspace npm, D5) con `handlerDesdeEjemplo()`; test que demuestra que una
  clave de `sobrescribir` ausente en `rag-query-con-evidencia.json` hace fallar el test con el campo y el ejemplo
  `[US-213 AC-10]` [ADR-26]; regla de `dependency-cruiser` `test-support-solo-en-tests`. Migrar al arnés un test de
  integración existente de `clinical-api` hacia `rag-orchestrator` como prueba de uso. Verifica: tests de `clinical-api` en verde.
- [x] 2.4 (test después) `scripts/quality/check-ac-coverage` (D3) y fixture con un change activo `US-900` (AC-1 cubierto, AC-2 sin
  test; AC-1 cubierto solo con `@pytest.mark.ac`) → alerta solo para `US-900 AC-2`, job con código 0 `[US-213 AC-9]`.
  Verifica: caso en verde y `latest.json` con la alerta.
- [x] 2.5 (test después, RN-22) Claves `coverage.changedLinesWarn` (80, P-2) y `coverage.alertPaths` en `quality-thresholds.json`,
  validadas por `umbrales.mjs` (ausente o no numérica → falla con el nombre); `@vitest/coverage-v8` y LCOV en `web` y
  `clinical-api`; `diff-cover` contra `origin/main` y normalizador hacia `latest.json` (D6). Fixture: service con 5/10 líneas
  cubiertas → alerta 50 con umbral leído, job con código 0; archivo de `scripts/` sin alerta `[US-213 AC-11]`. Verifica: casos en verde.
- [x] 2.6 (test después) AC-13: ampliar el `docker` falso de `scripts/ci/__tests__/integracionRag.test.mjs` con `pull` y los modos
  `pull_503_una_vez`, `pull_503_siempre`; casos: recupera al segundo intento con espera configurada; falla con
  «integracion-rag: no se pudo descargar la imagen de milvus-etcd» sin «no quedaron sanos» ni `up`; Milvus sin salud tras
  `pull` correcto conserva el mensaje de salud; Pytest se invoca una vez `[US-213 AC-13]` [S3 resp. 14]. Tiempo máximo explícito.
  Luego `descargar_imagenes()` en `scripts/ci/integracion-rag-orchestrator.sh` con `INTEGRACION_RAG_PULL_INTENTOS` (3) y
  `INTEGRACION_RAG_PULL_ESPERA_BASE_S`, documentadas en la cabecera de variables del script (D8). Verifica: test hermético en verde.
- [ ] 2.7 **[HECHA en código; falta el job real `integration-rag` del PR en verde — no verificable sin PR]** (test después) **Verificación previa (`[S3 resp. 16]`):** confirmar que `gcr.io/etcd-development/etcd:v3.5.34` incluye
  `etcdctl` (p. ej., `docker run --rm --entrypoint etcdctl gcr.io/etcd-development/etcd:v3.5.34 version`), porque el
  *healthcheck* lo usa; si no lo trae, parar y reportar. Luego `milvus-etcd` → `gcr.io/etcd-development/etcd:v3.5.34` en `infra/docker/docker-compose.yml` y caso que
  comprueba con `compose config` que ninguna imagen viene de `quay.io` y que el *healthcheck* se conserva `[US-213 AC-13]`.
  Revisión de `privacy-guardian` (toca Compose). Verifica: el job real `integration-rag` del PR en verde.
- [x] 2.8 (test después) El job `quality` de `.github/workflows/ci.yml` ejecuta la cobertura y los chequeos nuevos y publica
  `reports/quality/latest.json` como artefacto; `workflow.test.mjs` lo comprueba. Verifica: test de workflow en verde.
- [x] 2.9 (sin cambios: nada que extraer ni inlinear en los archivos tocados) Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y
  después, commit `refactor(L1D-285)`.

## 3. ai-services

- [x] 3.1 (hecha: `ci/tests/quality/higiene-pytest.test.mjs`, 5 casos en verde; los fixtures se escriben en un directorio temporal porque el hook `pre-commit-gate.sh` prohíbe commitear `skip`/`xfail` bajo `tests/`; Ruff `PT` ejecutado por `quality` (`ruff-pt.mjs`) con `per-file-ignores` de `tests/**`; **deuda: historia nueva de deuda por crear para los 298 hallazgos (PT018 268, PT011 22, PT001 5, PT006 3); no es US-232, que es funciones de clinical-api > umbrales**, ver design D2) (test después) Fixtures en `ci/tests/quality/` con `@pytest.mark.skip`, `skipif`, `xfail`, `pytest.skip(` y `pytest.xfail(`
  en tests de `rag-orchestrator`, y un módulo no-test con el texto `pytest.skip(` que no alerta `[US-213 AC-8]`. Luego Ruff `PT`
  en `apps/rag-orchestrator/pyproject.toml` y `scripts/quality/check-pytest-hygiene.py` (AST, regla `tests-sin-desactivar`,
  D2) invocado desde `quality.mjs`. Verifica: casos en verde.
- [x] 3.2 (hecha: `tests/unit/test_marcadores_estrictos.py`; sin `--strict-markers` el caso falla, demostrado) (test después) Marcador `ac` registrado con `--strict-markers` en `pyproject.toml`; test de que un marcador mal escrito
  falla en la recolección `[US-213 AC-9]`. Verifica: suite de Pytest en verde.
- [x] 3.3 (hecha: `tests/unit/test_handler_desde_ejemplo.py`, 7 casos; sin la comprobación de clave ausente 2 fallan, demostrado) (test después) `tests/support/http.py`: `handler_desde_ejemplo()` sobre `respx` desde `contracts/examples/` (D5); test de
  que un campo añadido ausente en el ejemplo hace fallar con el campo y el ejemplo `[US-213 AC-10]` [ADR-26]. Verifica: en verde.
- [x] 3.4 (hecha SIN `diff-cover` por la corrección de D6: solo `pytest-cov==7.1.0` (MIT, 2026-03-21; adición aprobada por sprint-S3); `cobertura.mjs` lee la Cobertura XML; build-test publica `coverage.xml` y quality lo descarga; con un cambio de `app/domain/` `latest.json` trae `{lineasCambiadas: 2, lineasCubiertas: 1, porcentaje: 50}` y la alerta) (test después) `pytest-cov` y `diff-cover` (versión exacta, `requirements-dev.txt`) con salida Cobertura XML para D6
  `[US-213 AC-11]`. Verifica: `npm run quality` en verde con el porcentaje de `rag-orchestrator` en `latest.json`.
- [x] 3.5 (sin cambios: nada que extraer ni inlinear en los archivos tocados) Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y
  después, commit `refactor(L1D-285)`.

## 4. cierre

- [ ] 4.1 (parte ai-services verificada: pytest de rag-orchestrator 2134 passed, `npm run quality` 0 errores, `test:quality` 145 passed, `contracts:verify-provider` 193 respuestas, `openspec validate --strict` válido; faltan suites de `clinical-api`/`web` y `run-cases.sh`, que en este entorno falla 5 casos por falta de `gitleaks`) `openspec validate l1d-285-higiene-tests-ci --strict` en verde; `npm run quality`, `ci/tests/run-cases.sh`, suites de
  `clinical-api`, `web` y `rag-orchestrator` en verde; `contracts:verify-provider` en verde (hubo cambio de contrato). Sin
  `run-ai-eval` (no toca modelo, prompt, umbral de IA, catálogo ni corpus).
- [ ] 4.2 `.env.example`: sin variables nuevas de aplicación (las de `integracion-rag` viven en el script y en `ci.yml`); si
  aparece alguna, el agente la reporta y la aplica el humano.
- [x] 4.3 (test después; decisión del usuario, 2026-10-24, carrera de CI detectada en el PR #195) **Carrera de tests en
  `scripts/ci/__tests__`:** `integracionRag.test.mjs` escribe `zz_sin_versionar_prueba.txt` en el árbol real mientras
  `evalRequired.test.mjs` copia el árbol (ENOENT, *flaky*). Corregir sin `.skip` ni reintentos silenciosos: el test de
  integración deja de escribir en el árbol real (directorio temporal) o, si no es posible, se serializa. Un test/fixture
  demuestra la carrera resuelta (p. ej., repetir N veces en paralelo ambos tests) con tiempo máximo explícito
  `[US-213 AC-13]`. Verifica: los dos archivos juntos, N veces, en verde.

## 5. deuda: higiene de tests, post-S3

Menores del Gate 2 (vuelta 1, design-principles-reviewer #13–#20) que no bloquean el PR y se tratan después del S3:

- [ ] 5.1 (deuda: higiene de tests, post-S3) Menores del design-principles-reviewer (Gate 2, vuelta 1 y re-gate), uno por línea,
  con ubicación y refactor mínimo; se asignan a la historia de deuda del S4 y no cambian comportamiento en este change:
  - #13 `scripts/quality/cobertura.mjs:89-93`, `medirLineasCambiadas` con dos formatos (LCOV y Cobertura XML) detrás de un `if`:
    recibir mapas ya parseados (`archivo → línea → veces`) y que cada formato se parsee en su propio módulo.
  - #14 `eslint.config.js` (comentario de `bloqueMockSoloEnBordes`): dice que admite excepciones con caducidad, pero
    `REGLAS_EXCEPTUABLES` (`umbrales.mjs`) solo admite reglas de tamaño; corregir el comentario o ampliar la lista con decisión.
  - #15 `ci/tests/quality/higiene-de-tests.test.mjs:72-80` pasa en vacío cuando no hay excepciones vigentes (sin caso que
    fabrique una); `packages/test-support/tests/handlerDesdeEjemplo.test.ts:29-35` usa el `status` 200 por defecto sin
    comprobarlo: añadir una excepción de fixture y un caso con `status` distinto de 200.
  - #16 `scripts/quality/cobertura.mjs`: faltan tests de la guarda `enHunk`, del `SF` absoluto de LCOV y de varios *hunks*
    en un mismo archivo.
  - #17 diferencias entre `handlerDesdeEjemplo` (TS) y `handler_desde_ejemplo` (Python): `sobrescribir` vacío, patrones
    `:id` en la URL y validación del cuerpo contra el esquema; alinear ambos o documentar la diferencia.
  - #18 hecho: `rmSync(enlace, { force: true })` en `integracionRag.test.mjs` (commit `d385f571`).
  - #19 `docs/process/ci.md`, fila del job `quality` (ver 5.2).
  - #20 unos 16 archivos de handlers MSW manuales (`web`, `clinical-api`) y unos 10 de `respx` sin migrar al arnés
    `handlerDesdeEjemplo`; y una regla `no-restricted-imports` que impida `msw` directo fuera de `packages/test-support`.
  - m-4 `scripts/quality/eslint-rules/tests-sin-pendientes-ni-foco-jest.mjs`: `cursor.skip(1)` (cualquier objeto con
    `.skip(`) da falso positivo y no se cubren `it.each([...]).skip` / `.only`; acotar el objeto al contexto del test.
  - m-5 `scripts/quality/check-ac-coverage.mjs`: un tag con letra (`[US-213b AC-8]`) no cubre la sección sin letra
    (`US-213`); aceptar el tag con letra contra la sección de la historia entera.
  - m-7 test de coherencia entre `GLOBS_DE_TESTS` y `PATRON_DE_TEST` (`scripts/quality/archivos-de-test.mjs`): que ambas
    definiciones clasifiquen igual un conjunto de rutas de ejemplo.
  - m-8 `cargar_ejemplo` de Python (`apps/rag-orchestrator/tests/support/http.py`): alinear su validación con la regex
    `.json` simple y la comprobación con `realpath` de TS (la hace ai-services).
  - m-9 evidencia del rojo del commit de `enmascararNombre` (`ß`, `f1ea5c8a` antes del último rebase): en el cuerpo del PR, revirtiendo
    `inicialEnMayuscula` y mostrando `Received "SS. G."`.
  - **Deuda de estilo de Pytest (Ruff `PT`): 298 hallazgos** (PT018 268, PT011 22, PT001 5, PT006 3) ignorados solo en
    `tests/**` por `per-file-ignores`; destino: `backlog/sprints/S3-deuda.md`, fila «estilo pytest PT» (la añade la sesión
    principal; el ID lo asigna al crear el issue). No se amplía el `per-file-ignores`. El comentario equivalente en
    `apps/rag-orchestrator/pyproject.toml` es de ai-services.
- [ ] 5.2 (deuda) `docs/process/ci.md`, fila del job `quality` (cobertura, higiene y AC): fuera de los paths de este
  implementador; la actualiza quien tenga `docs/process/`.
- [ ] 5.3 (deuda, historia de altas del S6) `minLength` y `pattern` de `fullName` en el contrato de altas de pacientes.
