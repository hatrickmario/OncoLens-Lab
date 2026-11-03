# Tasks — arr-11-ci-rapida

> Matriz TDD (CLAUDE.md): CI, configuración, scripts y manifiestos de dependencias → **test después**: test hermético en
> `scripts/ci/__tests__/` o caso de PR en `ci/tests/cases/` en el mismo PR, y la CI verde como evidencia. Las funciones
> puras de los scripts (`esSoloDocumentacion`, `omitiblesDeclarados`, `historiasDelTitulo`, `tocaContratos`) llevan test
> unitario. Todo test que lance un proceso real (git, `contracts:check`, el script de CI) declara un tiempo máximo explícito
> (no los 5 s por defecto de Vitest). Sin `.skip`, `.only` ni aserciones relajadas. Sin historia L1D: commits
> `ci(ARR-11): …`, rama `chore/arr-11-ci-rapida`, PR `[ARR-11] CI más rápida (D-11, D-12, D5-02)` (higiene-proceso no lo
> comprueba: no empieza por `[L1D-nn]`). Implementa: `clinical-platform-dev`.

## plataforma (CI)

### 1. D-11 primero (desbloquea la CI del propio PR)

- [x] 1.1 (test después) Crear `apps/rag-orchestrator/requirements-export.txt` con `torch==2.14.1` y `transformers==5.20.2`
  y sus comentarios de licencia, y cabecera «solo exportación manual a ONNX (ADR-39); nunca en la CI ni en la imagen»;
  quitarlos de `requirements-eval.txt`; actualizar el comentario de la línea 4 de `requirements.txt` `[D-11]`.
- [x] 1.2 (test después) `tests/unit/test_dependencias_de_inferencia.py`: `transformers` y `torch` en
  `requirements-export.txt` y **ni** en `requirements.txt` **ni** en `requirements-eval.txt` (escenario «transformers solo
  está en requirements-export.txt») `[D-11]`. Verifica: Pytest del archivo en verde.
- [x] 1.3 (test después) `eval/configs/adr39-medicion.Dockerfile` copia e instala también `requirements-export.txt`;
  `docs/demo/runbook-demo-S1.md` (venv de los pesos ONNX) y el docstring de `scripts/demo/exportar-modelos.py` piden los dos
  ficheros `[D-11]`.
- [x] 1.4 (test después) `scripts/ci/auditar-dependencias.sh`: `-r "$req/requirements-export.txt"` en `pip-audit`; su test
  o caso existente sigue en verde `[D-11] [US-217 AC-1]`.

### 2. Detector de cambios y agregador

- [ ] 2.1 (test después) `scripts/ci/cambios-paths.yaml` (`documentacion`, `consumidos_por_codigo`,
  `omitibles_en_documentacion`) y `scripts/ci/detectar-cambios.mjs` con `esSoloDocumentacion()` pura y E/S solo en
  `main()`; reutiliza `cargarReglas`/`tocaDisparador` de `eval-trigger.mjs` y `casaConGlob` de `lib/glob.mjs`. Escribe
  `documentacion` y `omitibles` en `GITHUB_OUTPUT`; diff con `git merge-base` + `git diff --no-renames --name-status`; push,
  base vacía/`0000…`, sin merge-base (falla cerrado) o diff vacío → CI completa; configuración
  inválida → código 2 `[D-12.1]`.
- [ ] 2.2 (test después) `scripts/ci/__tests__/detectarCambios.test.mjs`: un escenario por cada uno del requisito
  «Un detector de cambios…» (solo docs, mezcla, documento leído por el código, renombre `git mv` de código a `docs/*.md`, sin merge-base,
  disparador de eval, push, base ilegible, configuración inválida), con repositorio git temporal y tiempo máximo explícito `[D-12.1]`.
- [ ] 2.3 (test después) Test de cobertura de `consumidos_por_codigo`: compara con `git grep` las rutas literales `*.md`
  que leen `scripts/` y `apps/` (y `packages/`) con `consumidos_por_codigo`, nombrando ruta y lector si una no casa
  (riesgo «omitir de más» del design) `[D-12.1]`.
- [ ] 2.4 (test después) `scripts/ci/verificar-needs.mjs`: `omitiblesDeclarados(needs)` y `jobsSinExito` que acepta
  `skipped` solo si `cambios` está en `success` y el job está en su `omitibles`; JSON ilegible → `[]`. Tests unitarios en
  `scripts/ci/__tests__/` con los cuatro escenarios de «ci-ok acepta omitidos…» `[D-12.1] [US-036 AC-1]`.

### 3. Workflow `ci.yml`

- [ ] 3.1 (test después) Job `cambios` (checkout `fetch-depth: 0`, `persist-credentials: false`, `setup-node`, sin
  `npm ci` si el script no lo necesita) y `needs: cambios` + `if: ${{ !contains(fromJSON(needs.cambios.outputs.omitibles), '<job>') }}`
  en cada job de `omitibles_en_documentacion`; `cambios` en `needs` de `ci-ok` `[D-12.1]`.
- [ ] 3.2 (test después) Partir `build-test` en `build-test-node` y `build-test-rag` según la tabla de design D3,
  conservando el nombre y el comando de cada paso; ambos en `needs` de `ci-ok` `[D-12.2]`.
- [ ] 3.3 (test después) `quality` sin `needs: build-test` ni descarga de cobertura; `COBERTURA_INFORMES_XML` vacío. En
  `scripts/quality/cobertura.mjs`, informes XML desde esa variable (defecto: `INFORMES_COBERTURA_XML`) y modo
  `--solo-xml --salida <archivo>` que reutiliza `medirCoberturaDelPr`/`alertasDeCobertura`. Job `cobertura-rag`
  (`needs: [cambios, build-test-rag]`, omitible) que descarga `cobertura-rag-orchestrator` y publica `quality-report-rag`.
  Tests de `cobertura.mjs` para el modo nuevo y el informe ausente `[D-12.3] [US-213 AC-11]`.
- [ ] 3.4 (test después) Cachés de design D5: `actions/cache` fijada por SHA (versión vigente comprobada en la fuente) para
  `node_modules` en todos los jobs con `npm ci` (que pasa a `if: cache-hit != 'true'`) y venv `.venv-ci` en
  `build-test-node`, `build-test-rag` y `eval-required` (clave propia); sin `restore-keys`; actualizar
  `cache-dependency-path` de `setup-python` sin `requirements-eval` donde ya no aplique `[D-12.4]`.
- [ ] 3.5 (test después) D5-02: `scripts/ci/contracts-contra-main.sh "$BASE_REF"` con `tocaContratos()` (diff contra la base
  sobre `contracts/examples/**` y `apps/*/openapi.yaml`), `git fetch --no-tags origin main`, `git merge --no-edit --no-ff`
  con identidad local, `npm run contracts:check`; conflicto → mensaje fijo y rutas, sin contenido; fuera de
  `pull_request` o sin rutas → `omitido: …`. Último paso del job `contracts`. Test hermético con repositorio temporal
  (ejemplo invalidado por un commit posterior de `main` → falla; PR sin contratos → omitido; conflicto → mensaje fijo),
  tiempo máximo explícito `[D5-02]`.
- [ ] 3.6 (test después) `ci/tests/workflow.test.mjs`: renombrar las aserciones de `build-test` a `build-test-node` o
  `build-test-rag`; excluir `requirements-export.txt` del test de instalación previa a Pytest y añadir «ningún workflow
  instala `requirements-export.txt`»; añadir los escenarios de los requisitos de detector (`if` ↔ lista), partición,
  `quality` sin `needs` de build, `cobertura-rag`, cachés (SHA, sin `restore-keys`) y D5-02 (solo `pull_request`, sin
  credenciales). Ajustar `scripts/ci/__tests__/evalRequiredWorkflow.test.mjs` si cambia la instalación de
  `eval-required` `[D-12.1…D-12.4] [D-11] [D5-02]`.

### 4. Workflow `e2e.yml` y higiene

- [ ] 4.1 (test después) `e2e.yml`: job `cambios` con el mismo script y `e2e` con `needs: cambios` + `if` sobre
  `omitibles` (o `documentacion == 'true'`); sigue sin secretos, sin `pull_request_target` y fuera de `ci-ok`. Test en
  `workflow.test.mjs` `[D-12.1] [ARR-02 AC-1]`.
- [ ] 4.2 (test después) `historiasDelTitulo` de `scripts/ci/tasks-destino.mjs` acepta `[L1D-1, L1D-2]` además de los
  corchetes consecutivos, sin duplicados; casos en `scripts/ci/__tests__/tasksDestino.test.mjs`: lote con tarea sin destino
  en la segunda historia, destino que es otra historia del lote, `[ARR-11] …` sin comprobación `[D-12.5]`.

### 5. Casos de PR y documentación

- [ ] 5.1 (test después) Casos en `ci/tests/cases/` (`case.json` + `aplicar.sh`): `ac-detector-solo-docs` (detector →
  omitibles completos), `ac-detector-docs-leido-por-codigo` (`docs/architecture/data-model.md` → CI completa) y
  `ac-contratos-contra-main` (D5-02); el comando de cada caso figura tal cual en un paso de `ci.yml`
  `[D-12.1] [D5-02]`.
- [ ] 5.2 (test después) `docs/process/ci.md`: tabla de jobs (`cambios`, `build-test-node`, `build-test-rag`,
  `cobertura-rag`), sección «Detector de cambios» (listas, reglas conservadoras, cómo añadir un omitible o un documento
  leído por el código), cachés y su invalidación, D5-02 («vuelve a ejecutar `contracts` antes del merge si `main` avanzó»),
  `requirements-export.txt`, reportes de calidad (`latest.json` + `cobertura-rag.json`) y paso 2 de «Cómo añadir un job»
  (decidir si es omitible) `[D-12] [D-11] [D5-02]`.
- [ ] 5.3 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
  antes y después, commit `refactor(ARR-11)`.

## humano

- [ ] H-1 Añadir a `.claude/agents/sprint-orchestrator.md` la regla «antes de pedir el merge de un PR que toca
  `contracts/examples/**` o un `openapi.yaml`, si `main` avanzó, volver a ejecutar el job `contracts`» (D5-02; los agentes
  no editan su configuración) · DIFERIDA -> H-1

## cierre

- [ ] 6.1 `openspec validate arr-11-ci-rapida --strict` en verde.
- [ ] 6.2 Vitest raíz (`npx vitest run`), `ci/tests/run-cases.sh` de los casos nuevos y Pytest de
  `test_dependencias_de_inferencia.py` en verde en local.
- [ ] 6.3 PR con la CI completa en verde (0 checks en fallo, 0 pendientes, 0 alertas), `eval-required` sin descargar
  ruedas `nvidia-*` (log del `pip install`), y un PR de prueba de solo documentación (p. ej., el PR `docs` de la oleada O1)
  con `ci-ok` en verde y solo los cuatro jobs de documentación ejecutados.
- [ ] 6.4 Medición tras el merge (design «Medición»): duración de `ci-ok` en 3 PR de código y 3 de documentación frente a
  ~22 min, anotada en el PR y en `docs/process/ci.md`.
- [ ] 6.5 Sin `contracts:verify-provider` ni `run-ai-eval` adicionales: el change no toca APIs, modelo, prompt, umbral,
  catálogo ni corpus (la dependencia movida en D-11 no la importa ningún test ni `evaluate`).
