## ADDED Requirements

### Requirement: Un detector de cambios declara qué jobs no aplican a un PR de documentación
La CI MUST ejecutar un job `cambios` (`scripts/ci/detectar-cambios.mjs`) que clasifique el diff contra el merge-base con `git diff --no-renames`; sin merge-base SHALL pedir la CI completa. Si todos los archivos son documentación y ninguno lo lee el código ni es disparador de `eval-required`, SHALL publicar como `omitibles` todos los jobs salvo `secret-scan`, `data-scan`, `lint-lenguaje` y `higiene-proceso`; ante cualquier duda SHALL pedir la CI completa.

#### Scenario: Un PR que solo toca documentación corre solo los escáneres y la higiene [D-12.1]
- **GIVEN** un PR cuyo diff solo cambia archivos de `backlog/`, `docs/` y `openspec/` y algún `*.md` fuera de ellos
- **WHEN** corre la CI
- **THEN** terminan en `success` `cambios`, `secret-scan`, `data-scan`, `lint-lenguaje` y `higiene-proceso`, los demás jobs de `ci.yml` quedan `skipped` y `ci-ok` termina en `success`

#### Scenario: Un PR que mezcla documentación y código corre la CI completa [D-12.1]
- **GIVEN** un PR que cambia `docs/process/ci.md` y un archivo de `apps/clinical-api/src/`
- **WHEN** corre `cambios`
- **THEN** `omitibles` es `[]` y todos los jobs de `ci.yml` se ejecutan

#### Scenario: Un documento que el código lee no cuenta como documentación [D-12.1] (Decidido, usuario, 2026-11-03)
- **GIVEN** un PR que solo cambia `docs/architecture/data-model.md` (o `readme.md`, o un `.md` bajo `data/` o bajo una carpeta de prompts)
- **WHEN** corre `cambios`
- **THEN** `omitibles` es `[]` y la salida nombra la ruta y la lista `consumidos_por_codigo` que la excluyó

#### Scenario: Un disparador de eval-required nunca se omite [D-12.1] [US-074] (Decidido, usuario, 2026-11-03)
- **GIVEN** un PR que solo cambia un `.md` que casa con una ruta de `scripts/ci/eval-trigger-paths.yaml`
- **WHEN** corre `cambios`
- **THEN** `omitibles` es `[]` y `eval-required` ejecuta la suite `evaluate` como en cualquier PR con disparador

#### Scenario: Un renombre de código a documentación corre la CI completa [D-12.1]
- **GIVEN** un PR cuyo único cambio es `git mv scripts/ci/eval-trigger.mjs docs/eval-trigger.md`
- **WHEN** corre `cambios`
- **THEN** el diff con `--no-renames` lista el borrado de `scripts/ci/eval-trigger.mjs` y la alta de `docs/eval-trigger.md`, `omitibles` es `[]` y la salida nombra `scripts/ci/eval-trigger.mjs`

#### Scenario: Sin merge-base el detector falla cerrado [D-12.1]
- **GIVEN** un checkout donde `git merge-base <base> HEAD` no devuelve commit (historia superficial o base inexistente)
- **WHEN** corre `cambios`
- **THEN** `omitibles` es `[]`, la salida nombra «sin merge-base» y el detector nunca recurre a un diff de dos puntos ni a la lista de omitibles

#### Scenario: consumidos_por_codigo cubre todo .md que el código lee [D-12.1]
- **GIVEN** las rutas literales `*.md` que leen los archivos de `scripts/` y `apps/` (incluidos sus tests), obtenidas con `git grep`
- **WHEN** corre el test de cobertura de `consumidos_por_codigo` en `scripts/ci/__tests__/`
- **THEN** cada ruta casa con un glob de `consumidos_por_codigo`, y si una no casa el test falla nombrando la ruta y el archivo que la lee

#### Scenario: Un push a main corre siempre la CI completa [D-12.1] (Decidido, usuario, 2026-11-03)
- **GIVEN** un `push` a `main` que solo cambia documentación
- **WHEN** corre `cambios`
- **THEN** `omitibles` es `[]`

#### Scenario: Una base ilegible o un diff vacío piden la CI completa [D-12.1] (Decidido, usuario, 2026-11-03)
- **GIVEN** un evento sin base válida (vacía o `0000000…`) o un diff sin archivos
- **WHEN** corre `cambios`
- **THEN** `omitibles` es `[]` y la salida nombra el motivo

#### Scenario: Una configuración inválida del detector deja en rojo la CI [D-12.1] (Decidido, usuario, 2026-11-03)
- **GIVEN** un `cambios-paths.yaml` ilegible o que declara omitible un job que no existe en `ci.yml`
- **WHEN** corre `cambios`
- **THEN** el job termina con código 2 nombrando la clave inválida, y `ci-ok` termina en `failure`

#### Scenario: La lista de omitibles y los if de los jobs no divergen [D-12.1]
- **GIVEN** `ci.yml` y `cambios-paths.yaml`
- **WHEN** corre `ci/tests/workflow.test.mjs`
- **THEN** el conjunto de jobs con `needs: cambios` y un `if:` sobre `needs.cambios.outputs.omitibles` es exactamente `omitibles_en_documentacion`, cada `if` nombra a su propio job y ni `secret-scan` ni `data-scan` están en la lista

### Requirement: ci-ok acepta omitidos solo si el detector los declaró
El agregador `ci-ok` (`scripts/ci/verificar-needs.mjs`) MUST seguir dependiendo de todos los jobs de `ci.yml` y MUST aceptar `skipped` en un job solo si `cambios` terminó en `success` y lo incluyó en `omitibles`. Todo otro `skipped`, `cancelled` o `failure` SHALL dejarlo en `failure` nombrando el job. `ci-ok` SHALL seguir siendo el único check requerido de `main`.

#### Scenario: Un omitido declarado no rompe el agregador [D-12.1]
- **GIVEN** `needs` con `cambios` en `success`, `omitibles = ["build-test-node"]` y `build-test-node` en `skipped`, y el resto en `success`
- **WHEN** corre `verificar-needs.mjs`
- **THEN** sale con 0 y nombra `build-test-node` como omitido por el detector

#### Scenario: Un omitido no declarado sigue siendo fallo [D-12.1] [US-036 AC-1]
- **GIVEN** `needs` con `cambios` en `success`, `omitibles = []` y `contracts` en `skipped`
- **WHEN** corre `verificar-needs.mjs`
- **THEN** sale con 1 y nombra `contracts` como `skipped`

#### Scenario: Un detector fallido no autoriza ningún omitido [D-12.1] (Decidido, usuario, 2026-11-03)
- **GIVEN** `needs` con `cambios` en `failure` y los jobs omitibles en `skipped`
- **WHEN** corre `verificar-needs.mjs`
- **THEN** sale con 1 y nombra `cambios` y cada job `skipped`

#### Scenario: Una lista de omitibles ilegible cuenta como vacía [D-12.1] (Decidido, usuario, 2026-11-03)
- **GIVEN** `needs.cambios.outputs.omitibles` que no es un JSON de lista de cadenas
- **WHEN** corre `verificar-needs.mjs`
- **THEN** ningún `skipped` se acepta y sale con 1

### Requirement: El workflow E2E lee el mismo detector
`.github/workflows/e2e.yml` MUST ejecutar el mismo `scripts/ci/detectar-cambios.mjs` en un job `cambios` y SHALL omitir el job `e2e` cuando el detector declara el PR como documentación. El workflow conserva sus reglas: sin secretos, sin `pull_request_target`, acciones por SHA y fuera de `ci-ok`.

#### Scenario: Un PR de documentación no levanta el Compose de E2E [D-12.1]
- **GIVEN** un PR que solo cambia `backlog/` y `openspec/`
- **WHEN** corre el workflow E2E
- **THEN** `cambios` termina en `success` y `e2e` queda `skipped`

#### Scenario: Un PR de código ejecuta los E2E [D-12.1] [ARR-02 AC-1]
- **GIVEN** un PR que cambia `apps/web/`
- **WHEN** corre el workflow E2E
- **THEN** `e2e` se ejecuta contra el Compose fingido como hasta ahora

### Requirement: build-test se parte en un job de Node y uno de rag-orchestrator en paralelo
La CI MUST sustituir `build-test` por `build-test-node` (build, test de build de `web`, tests de los workspaces, Vitest raíz, catálogo y `test:secrets`) y `build-test-rag` (dependencias de Python, Pytest con cobertura y verificación del proveedor de `rag-orchestrator`), sin `needs` entre ellos y ambos en los `needs` de `ci-ok`. Ningún paso SHALL perderse en la partición.

#### Scenario: Los dos jobs corren en paralelo y entran en ci-ok [D-12.2]
- **GIVEN** `ci.yml`
- **WHEN** corre `ci/tests/workflow.test.mjs`
- **THEN** `build-test` no existe, `build-test-node` y `build-test-rag` no se necesitan entre sí y ambos están en los `needs` de `ci-ok`

#### Scenario: Ningún paso de build-test se pierde [D-12.2] [US-001 AC-4] [US-060 AC-5]
- **GIVEN** `ci.yml` partido
- **WHEN** corre `ci/tests/workflow.test.mjs`
- **THEN** `build-test-node` ejecuta `catalog:validate`, `catalog:allowlist:check`, `test:build` después del build de los workspaces, el Vitest raíz y `test:secrets`, y `build-test-rag` ejecuta Pytest con `--cov` y `contracts:verify-provider -- --proveedor rag-orchestrator`

#### Scenario: El job de Pytest instala Node y los requirements de la CI antes [D-12.2] [US-036 AC-1] [L1D-102]
- **GIVEN** `build-test-rag`
- **WHEN** corre `ci/tests/workflow.test.mjs`
- **THEN** `setup-node` y `npm ci` (o la restauración de su caché) y la instalación de cada `requirements*.txt` salvo `requirements-export.txt` van antes del paso de Pytest

#### Scenario: Un test en rojo en cualquiera de los dos deja en rojo ci-ok [D-12.2] [US-036 AC-1]
- **GIVEN** un PR con un test de Pytest en rojo y los tests de Node en verde
- **WHEN** corre la CI
- **THEN** `build-test-rag` termina en `failure` y `ci-ok` termina en `failure` nombrándolo

### Requirement: quality corre en paralelo y la cobertura de Python consume el informe de build-test-rag
El job `quality` MUST no depender de ningún job de build ni de tests. La cobertura de líneas cambiadas de Python (US-213 AC-11) SHALL medirse en un job `cobertura-rag` que dependa de `build-test-rag`, descargue su `coverage.xml` y use la misma función de `scripts/quality/cobertura.mjs`; nunca SHALL fallar por un porcentaje bajo.

#### Scenario: quality arranca sin esperar a los builds [D-12.3]
- **GIVEN** `ci.yml`
- **WHEN** corre `ci/tests/workflow.test.mjs`
- **THEN** `quality` solo tiene `needs: cambios`, no descarga `cobertura-rag-orchestrator` y genera los LCOV de `web` y `clinical-api` antes de `quality:report`

#### Scenario: La cobertura de Python se mide con el informe de build-test-rag [D-12.3] [US-213 AC-11]
- **GIVEN** un PR que cambia líneas de `apps/rag-orchestrator/app/` y `build-test-rag` publicó `cobertura-rag-orchestrator`
- **WHEN** corre `cobertura-rag`
- **THEN** descarga el informe, mide el porcentaje de líneas cambiadas por archivo contra `origin/main` con `medirCoberturaDelPr` y publica `reports/quality/cobertura-rag.json` como artefacto, con la misma forma de hallazgo que `latest.json`

#### Scenario: Una cobertura baja de Python es alerta, no error [D-12.3] [US-213 AC-11]
- **GIVEN** líneas cambiadas de Python por debajo de `coverage.changedLinesWarn`
- **WHEN** corre `cobertura-rag`
- **THEN** el reporte lleva la alerta y el job termina en `success`

#### Scenario: Un informe de cobertura ausente es un paso roto [D-12.3] [US-213 AC-11] (Decidido, usuario, 2026-11-03)
- **GIVEN** que el artefacto `cobertura-rag-orchestrator` no contiene `coverage.xml`
- **WHEN** corre `cobertura-rag`
- **THEN** el job termina en `failure` nombrando el informe que falta

### Requirement: Las dependencias de Node y de Python se restauran de caché por hash de sus manifiestos
Los jobs que instalan dependencias MUST restaurar `node_modules` (raíz, `apps/*`, `packages/*`) con una clave exacta del sistema, `.nvmrc` y el hash de `package-lock.json`, y el entorno virtual de Python con una clave exacta de `.python-version` y los `requirements*.txt` que instala ese job. Con acierto de caché SHALL omitir la instalación; sin acierto, instalar como hoy.

#### Scenario: Un PR sin cambios de dependencias reutiliza la caché [D-12.4]
- **GIVEN** una caché de `main` con el mismo `package-lock.json` y los mismos `requirements*.txt`
- **WHEN** corre un job de build
- **THEN** la restauración informa acierto y no se ejecutan `npm ci` ni `pip install`

#### Scenario: Cambiar un manifiesto invalida su caché [D-12.4]
- **GIVEN** un PR que cambia `package-lock.json` o un `requirements*.txt`
- **WHEN** corre un job de build
- **THEN** la clave no coincide, se ejecuta `npm ci` o `pip install` completo y no se restaura ninguna caché parcial

#### Scenario: La caché no usa claves parciales ni acciones sin fijar [D-12.4] [US-036 AC-6]
- **GIVEN** `ci.yml` y `e2e.yml`
- **WHEN** corre `ci/tests/workflow.test.mjs`
- **THEN** todo `actions/cache` está fijado por SHA de commit, ninguno declara `restore-keys` y ninguna clave incluye `requirements-export.txt`

### Requirement: higiene-proceso acepta PR de lote con varias historias en el título
`scripts/ci/tasks-destino.mjs` MUST reconocer como historias del PR todos los `L1D-nn` del inicio del título, en corchetes consecutivos (`[L1D-1][L1D-2]`, `[L1D-1] [L1D-2]`) o separados por comas en un corchete (`[L1D-1, L1D-2]`), y SHALL comprobar el `tasks.md` del change activo de cada una. Un título sin `[L1D-nn]` inicial no se comprueba.

#### Scenario: Un PR de lote comprueba el tasks.md de cada historia [D-12.5]
- **GIVEN** el título `[L1D-110, L1D-113] Faltantes en el prompt` y una tarea abierta sin destino en el `tasks.md` de `l1d-113-*`
- **WHEN** corre `higiene-proceso`
- **THEN** el job falla nombrando el archivo y la línea de `l1d-113-*`

#### Scenario: Una historia del lote no vale como destino de otra del mismo lote [D-12.5] (Decidido, usuario, 2026-11-03)
- **GIVEN** el título `[L1D-110][L1D-113] …` y en `l1d-110-*` una tarea `DIFERIDA -> L1D-113`
- **WHEN** corre `higiene-proceso`
- **THEN** el job falla: el destino es una historia del propio PR

#### Scenario: Un PR sin historia en el título no se comprueba [D-12.5]
- **GIVEN** un PR titulado `[ARR-11] CI más rápida` o `docs: …`
- **WHEN** corre `higiene-proceso`
- **THEN** `tasks-destino` informa que no es un PR de historia y sale con 0

### Requirement: Las dependencias de exportación de modelos quedan fuera de la CI
`torch` y `transformers` MUST vivir solo en `apps/rag-orchestrator/requirements-export.txt`, que ningún workflow instala; `requirements.txt` y `requirements-eval.txt` SHALL no contenerlos. La auditoría de dependencias SHALL cubrir también `requirements-export.txt` sin instalarlo.

#### Scenario: La CI no descarga las ruedas de CUDA [D-11] [S5 resp. 6]
- **GIVEN** un PR que activa `eval-required` y `build-test-rag`
- **WHEN** corren sus `pip install`
- **THEN** ninguno instala `torch`, `transformers` ni paquetes `nvidia-*`, y no hay `No space left on device`

#### Scenario: transformers solo está en requirements-export.txt [D-11]
- **GIVEN** los `requirements*.txt` de `rag-orchestrator`
- **WHEN** corre `tests/unit/test_dependencias_de_inferencia.py`
- **THEN** `transformers` y `torch` están en `requirements-export.txt` y no están en `requirements.txt` ni en `requirements-eval.txt`

#### Scenario: Ningún workflow instala requirements-export.txt [D-11]
- **GIVEN** los workflows de `.github/workflows/`
- **WHEN** corre `ci/tests/workflow.test.mjs`
- **THEN** ningún paso instala `requirements-export.txt` y el test de instalación previa a Pytest lo excluye por nombre

#### Scenario: pip-audit también revisa requirements-export.txt [D-11] [US-217 AC-1]
- **GIVEN** `scripts/ci/auditar-dependencias.sh`
- **WHEN** corre el job `dependencies`
- **THEN** `pip-audit --no-deps --disable-pip` recibe `-r requirements-export.txt` junto a los otros tres y no instala nada

#### Scenario: La medición de ADR-39 sigue pudiendo exportar modelos [D-11]
- **GIVEN** `eval/configs/adr39-medicion.Dockerfile` y `docs/demo/runbook-demo-S1.md`
- **WHEN** se leen
- **THEN** ambos instalan `requirements-eval.txt` y `requirements-export.txt` para exportar los pesos ONNX

### Requirement: Un PR que toca ejemplos o specs de contrato se valida contra la punta actual de main
En un `pull_request` cuyo diff toca `contracts/examples/**` o un `apps/*/openapi.yaml`, el job `contracts` MUST fusionar la punta actual de `origin/main` sobre el checkout y ejecutar `contracts:check` sobre el resultado, sin credenciales. Un conflicto SHALL fallar con un mensaje fijo, sin imprimir contenido. Si el diff no toca esas rutas, el paso SHALL imprimir `omitido:` y su motivo.

#### Scenario: Un ejemplo que main volvió inválido hace fallar el PR [D5-02]
- **GIVEN** un PR que añade un ejemplo en `contracts/examples/` sin un campo que un commit posterior de `main` volvió requerido
- **WHEN** corre (o se vuelve a ejecutar) el job `contracts`
- **THEN** el paso de D5-02 falla con el error de `contracts:check` que nombra el ejemplo y el campo

#### Scenario: Un PR que no toca contratos no fusiona main [D5-02]
- **GIVEN** un PR que solo cambia `apps/web/` y no toca `contracts/examples/**` ni `apps/*/openapi.yaml`
- **WHEN** corre el job `contracts`
- **THEN** el paso imprime `omitido: el PR no toca ejemplos ni specs` y sale con 0

#### Scenario: Un conflicto con main se informa sin contenido [D5-02] [RN-14] (Decidido, usuario, 2026-11-03)
- **GIVEN** un PR con ejemplos en conflicto con `main`
- **WHEN** corre el paso de D5-02
- **THEN** falla con «el PR tiene conflictos con main: actualiza la rama» y la lista de rutas en conflicto, sin imprimir su contenido

#### Scenario: El paso no usa credenciales ni disparadores privilegiados [D5-02] [US-036 AC-1]
- **GIVEN** `ci.yml`
- **WHEN** corre `ci/tests/workflow.test.mjs`
- **THEN** el checkout de `contracts` sigue con `persist-credentials: false`, no hay `secrets.*` ni `pull_request_target` y el paso solo corre en `pull_request`
