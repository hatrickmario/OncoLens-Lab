# ci-pipeline Specification

## Purpose
Define el pipeline de CI del repositorio: jobs requeridos y su agregador, escaneos de secretos y de PII, fixtures de PR, auditoría de dependencias y la política de excepciones con caducidad (NFR-13, RN-14).

## Requirements

### Requirement: Cada PR audita las dependencias de los tres servicios
`.github/workflows/ci.yml` MUST tener un job `dependencies`, incluido en `needs` de `ci-ok`, que ejecute `npm audit` sobre el workspace (raíz y workspaces) y `pip-audit` sobre los `requirements*.txt` de `rag-orchestrator`. El job MUST fallar ante un aviso de severidad alta o crítica de `npm` o ante cualquier aviso de `pip-audit` no cubierto por una excepción vigente, nombrando paquete, versión e identificador del aviso.

#### Scenario: Un PR sin dependencias vulnerables pasa el job [US-217 AC-1] [RN-14] (asumido en el umbral)
- **GIVEN** un PR cuyas dependencias no tienen avisos `high` ni `critical` de `npm` ni avisos de `pip-audit`, o solo avisos cubiertos por excepciones vigentes
- **WHEN** corre el job `dependencies`
- **THEN** ejecuta `npm audit --audit-level=high` y `pip-audit` y termina en verde

#### Scenario: Una dependencia con un aviso alto hace fallar el job [US-217 AC-2] (asumido)
- **GIVEN** el fixture de PR que añade al workspace una versión de un paquete con un aviso conocido de severidad alta
- **WHEN** corre el job `dependencies`
- **THEN** termina en rojo nombrando el paquete, la versión instalada y el identificador del aviso

#### Scenario: Un aviso de pip-audit hace fallar el job [US-217 AC-2] (asumido)
- **GIVEN** la salida de `pip-audit` con un aviso sobre un paquete de `requirements.txt`
- **WHEN** se interpreta en el job
- **THEN** termina en rojo nombrando el paquete, la versión y el identificador `PYSEC`/`GHSA`

### Requirement: Las excepciones de auditoría son declarativas y vencen
Una vulnerabilidad sin parche disponible MUST poder registrarse en `security/audit-exceptions.json` con identificador, paquete, motivo, mitigación y fecha de revisión; mientras la fecha no haya pasado el aviso no hace fallar el job. Una excepción vencida o sin alguno de esos campos MUST hacer fallar el job nombrando su identificador. La fecha de hoy MUST inyectarse en el intérprete.

#### Scenario: Una excepción vigente deja pasar el aviso [US-217 AC-3] (asumido)
- **GIVEN** un aviso alto registrado en `security/audit-exceptions.json` con `revisarAntesDe` posterior a la fecha inyectada
- **WHEN** corre el intérprete de la auditoría
- **THEN** termina en verde e imprime la excepción aplicada

#### Scenario: Una excepción vencida hace fallar el job [US-217 AC-3] (asumido)
- **GIVEN** la misma excepción con `revisarAntesDe` anterior a la fecha inyectada
- **WHEN** corre el intérprete de la auditoría
- **THEN** termina en rojo nombrando el identificador de la excepción vencida

#### Scenario: Una excepción sin mitigación se rechaza [US-217 AC-3] (asumido)
- **GIVEN** una excepción sin el campo `mitigacion`
- **WHEN** corre el intérprete de la auditoría
- **THEN** termina en rojo nombrando la excepción y el campo ausente

### Requirement: Dependabot propone actualizaciones de los cuatro ecosistemas
`.github/dependabot.yml` MUST configurar actualizaciones de seguridad y de versión, semanales y agrupadas por ecosistema, para `npm` (raíz y workspaces), `pip` (`apps/rag-orchestrator`), `github-actions` y las imágenes Docker del stack. Sus PRs MUST pasar por la misma CI y MUST NOT mergearse solos.

#### Scenario: La configuración de Dependabot cubre los cuatro ecosistemas [US-217 AC-4] (asumido)
- **GIVEN** `.github/dependabot.yml`
- **WHEN** un test lo inspecciona
- **THEN** declara `npm` en `/`, `pip` en `/apps/rag-orchestrator`, `github-actions` en `/` y `docker` en los directorios de los Dockerfiles, todos con `interval: weekly` y un grupo por ecosistema, y ningún `automerge`

### Requirement: La integración de clinical-api corre en cada PR y bloquea
El job `integration` MUST ejecutar todos los tests de integración de `clinical-api` contra el PostgreSQL de test del Compose en cada PR y MUST figurar en `needs` de `ci-ok`.

#### Scenario: El job integration corre los tests de clinical-api en verde en main [ARR-01 AC-1]
- **GIVEN** un PR sobre `main`
- **WHEN** corre la CI
- **THEN** el job `integration` ejecuta la suite de integración de `clinical-api` contra el PostgreSQL de test, termina en verde con el número de tests ejecutados impreso y `ci-ok` depende de él

### Requirement: Los tests servicios_reales de rag-orchestrator corren en la CI
La CI MUST tener un job `integration-rag`, incluido en `needs` de `ci-ok`, que ejecute `pytest -m servicios_reales` de `rag-orchestrator` dentro de las redes `corpus-db-net` y `ai-net` del Compose contra el PostgreSQL de test y el Milvus de test, con secretos ficticios y modelos fingidos, sin publicar puertos de esos servicios al host y sin reintentos.

#### Scenario: Milvus, catálogo, release, scripts y semilla pasan con servicios reales [ARR-01 AC-2]
- **GIVEN** un PR y el Compose de test con PostgreSQL y Milvus
- **WHEN** corre el job `integration-rag`
- **THEN** se ejecutan los 23 casos de Milvus de L1D-106 y los de catálogo, *release*, scripts y carga de semilla, todos en verde, y ningún servicio del Compose publica puerto al host

#### Scenario: Un fallo de un test con servicios reales deja en rojo ci-ok [ARR-01 AC-2]
- **GIVEN** un test `servicios_reales` que falla
- **WHEN** corre la CI
- **THEN** `integration-rag` termina en `failure` y `ci-ok` también, nombrando el job

#### Scenario: El contenedor de Pytest no recibe credenciales clínicas [ARR-01 AC-2] (asumido) [RN-10]
- **GIVEN** el job `integration-rag` en ejecución
- **WHEN** se inspeccionan los secretos y variables del contenedor de Pytest
- **THEN** solo contiene las contraseñas de `rag_corpus`, de `rag_corpus_migrator` y del rol de test `oncolens_test_admin` (solo `CREATEDB`), y ninguna credencial de `clinical`, de cifrado de identidad ni de `clinical-minio`

#### Scenario: Milvus no disponible hace fallar el job en lugar de omitir los tests [ARR-01 AC-2] (asumido)
- **GIVEN** que `milvus-standalone` no queda sano dentro del tiempo de espera
- **WHEN** corre el job `integration-rag`
- **THEN** termina en `failure` nombrando el servicio, sin ejecutar Pytest con tests omitidos

### Requirement: Cada AC de US-058 y US-059 tiene un test ejecutado en la CI
El job `integration-rag` MUST imprimir, por cada test con `@pytest.mark.ac`, su AC y su resultado, de modo que todo AC de US-058 y US-059 tenga al menos un test ejecutado en verde.

#### Scenario: Los siete AC sin ejecución quedan en verde [ARR-01 AC-3]
- **GIVEN** US-058 AC-1, AC-3, AC-4 y US-059 AC-1, AC-3, AC-4, AC-5
- **WHEN** corre el job `integration-rag`
- **THEN** el resumen lista al menos un test ejecutado y en verde para cada uno de esos siete AC

### Requirement: El caso ac2-cited-sources-build se activa con el archivo de L1D-140
Cuando `l1d-140-panel-opcion-citas` se archive, el caso de PR `ac2-cited-sources-build` de L1D-166 MUST dejar de estar pendiente y ejecutarse con el build de `web` en la CI.

#### Scenario: El build de web rompe al eliminar citedSources tras archivar L1D-140 [ARR-01 AC-4]
- **GIVEN** `l1d-140-panel-opcion-citas` archivado y el caso `ac2-cited-sources-build` activo
- **WHEN** se ejecuta el caso en la CI
- **THEN** el build de `web` falla al compilar contra el tipo regenerado sin `citedSources`, como exige el caso

### Requirement: Los E2E de Playwright corren en la CI contra el Compose fingido
Un workflow `.github/workflows/e2e.yml`, separado de `ci.yml`, MUST ejecutar en cada PR y en cada `push` a `main` `npm run test:e2e` contra el Compose en perfil de test con `LLM_PROVIDER=fake`, `MODEL_PROVIDER=fake` y el seed sintético, con Docker en el *runner*, `retries: 1` solo en la CI, *trace* del reintento y el informe como artefacto. Ningún E2E MUST estar marcado con `.skip`, `.only` ni `fixme`. Mientras no cumpla el criterio de estabilidad, el workflow MUST NOT formar parte de `ci-ok`.

#### Scenario: El job de E2E ejecuta todos los E2E en la CI [ARR-02 AC-1]
- **GIVEN** un PR y el workflow `e2e.yml`
- **WHEN** corre el job de E2E
- **THEN** levanta el Compose fingido, ejecuta los E2E de login, panel, aviso de IA, lenguaje no prescriptivo y `sesion-y-origen.spec.ts` sin `.skip`, y termina en verde

#### Scenario: Los reintentos y la traza solo existen en la CI [ARR-02 AC-1]
- **GIVEN** `apps/web/playwright.config.ts`
- **WHEN** se carga con `CI=true` y sin `CI`
- **THEN** con `CI=true` usa `retries: 1` y `trace: 'on-first-retry'`, y sin `CI` usa `retries: 0`

#### Scenario: Un E2E en rojo deja el informe y la traza como artefacto [ARR-02 AC-1]
- **GIVEN** un E2E que falla también en su reintento
- **WHEN** termina el job de E2E
- **THEN** el job termina en `failure` y publica el informe HTML y la traza del reintento como artefacto, sin afectar a `ci-ok`

#### Scenario: La traza y los artefactos no exponen credenciales [ARR-02 AC-1] (asumido) [RN-14]
- **GIVEN** un E2E de login fallido con un usuario de test sintético que se reintenta en la CI
- **WHEN** el job publica la traza como artefacto
- **THEN** la traza no contiene cuerpos de request ni la contraseña de prueba, y el artefacto se publica con retención de 3 días

#### Scenario: Un E2E desactivado se rechaza [ARR-02 AC-1]
- **GIVEN** un archivo de `apps/web/e2e/` con `test.skip`, `test.only` o `test.fixme`
- **WHEN** corre el job de E2E
- **THEN** termina en `failure` nombrando el archivo

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

### Requirement: La CI compila y prueba las tres apps y los contratos en cada PR
`.github/workflows/ci.yml` MUST ejecutarse en cada `pull_request` y en cada `push` a `main`, con `permissions: contents: read` y sin secretos del repositorio. MUST ejecutar build y tests de `web`, `clinical-api` y `rag-orchestrator`, el `vitest` raíz, `test:infra`, `test:secrets`, `contracts:check`, `contracts:generate:check` y el smoke del stack con `LLM_PROVIDER=fake`.

#### Scenario: Un PR sin cambios de contrato ni secretos termina en verde [US-036 AC-1]
- **GIVEN** el fixture `ac1-limpio`: un clon temporal de `main` con un cambio de documentación sin contrato, secretos ni PII
- **WHEN** se ejecutan los comandos de los jobs `build-test`, `contracts`, `secret-scan`, `data-scan` y `stack-smoke`
- **THEN** cada uno termina con código 0, `contracts:check` y `contracts:generate:check` pasan y `ci-ok` queda en `success`

### Requirement: El job de Pytest tiene Node disponible
El job de `ci.yml` que ejecuta `pytest` de `rag-orchestrator` MUST ejecutar `actions/setup-node` y `npm ci` antes de `pytest`, porque el *helper* de validación de respuestas contra el spec (L1D-164) empaqueta el spec con `node scripts/contracts/bundle-json.mjs`.

#### Scenario: El test estático de ci.yml exige Node en el job de Pytest [US-036 AC-1]
- **GIVEN** `ci.yml` parseado por `ci/tests/workflow.test.mjs`
- **WHEN** se busca el job que contiene el paso `pytest`
- **THEN** ese job tiene `actions/setup-node` y `npm ci` en pasos anteriores a `pytest`; si falta alguno, el test falla nombrando el job

### Requirement: El agregador ci-ok solo queda en verde si todos los jobs pasan
El job `ci-ok` MUST depender de todos los jobs de `ci.yml` y MUST terminar en `failure` si alguno no terminó en `success`, incluidos los omitidos y cancelados. Ningún paso SHALL usar `continue-on-error`.

#### Scenario: Un job fallido deja en rojo el agregador [US-036 AC-1]
- **GIVEN** un PR en el que cualquier job de `ci.yml` termina en `failure`, `cancelled` o `skipped`
- **WHEN** se evalúa `ci-ok`
- **THEN** `ci-ok` termina en `failure` y nombra el job que no terminó en `success`

### Requirement: Un cambio incompatible de contrato rompe la CI
El job `contracts` MUST comparar cada `openapi.yaml` del PR con el de la base del PR, ambos empaquetados con sus `$ref` a `contracts/`, con `oasdiff breaking --fail-on ERR`, y MUST fallar ante cualquier cambio de nivel `ERR`, nombrando el proveedor y el cambio. El build de `clinical-api` MUST compilar contra los tipos regenerados desde el spec de `rag-orchestrator`, de modo que un campo eliminado que el código consume rompa la compilación (readme §2.6, ADR-26).

#### Scenario: Eliminar citedSources rompe el build y el check de incompatibilidades [US-036 AC-2]
- **GIVEN** el fixture `ac2-cited-sources`: un clon temporal donde se elimina `evidenceOptions[].citedSources` (`EvidenceOption.citedSources`) del spec de `rag-orchestrator` y se regenera `packages/api-contracts`
- **WHEN** se ejecutan `scripts/ci/contracts-breaking.sh` contra la base y el build de `clinical-api`
- **THEN** `contracts-breaking.sh` termina con código distinto de 0 nombrando `rag-orchestrator` y `citedSources`, y `tsc` de `clinical-api` falla al compilar contra el tipo regenerado

### Requirement: Los avisos de oasdiff no rompen la CI
Los avisos de nivel `WARN` de `oasdiff`, incluido `response-body-wrapped-in-one-of-original-preserved` de un `oneOf` aditivo que conserva la variante original, MUST imprimirse y MUST NOT hacer fallar el job `contracts` (ADR-26).

#### Scenario: Un oneOf aditivo que conserva la respuesta original no rompe la CI [US-036 AC-2] [ADR-26]
- **GIVEN** el fixture `ac2-oneof-aditivo`: un clon temporal donde una respuesta `503` del spec de `rag-orchestrator` pasa a ser un `oneOf` que conserva el schema original y añade una variante con un código nuevo
- **WHEN** se ejecuta `scripts/ci/contracts-breaking.sh` contra la base
- **THEN** termina con código 0 e imprime el aviso `response-body-wrapped-in-one-of-original-preserved` con el proveedor

### Requirement: Lo generado desde los specs está al día en cada PR
El job `contracts` MUST instalar `scripts/contracts/requirements-codegen.txt` en un entorno virtual de Python y ejecutar `npm run contracts:generate:check`, que MUST fallar si los tipos TS, los schemas Zod o los modelos Pydantic generados difieren de lo que producen los specs o hay un archivo generado sin versionar `[US-033 AC-16]`. El `vitest` raíz MUST excluir `.claude/**` y `**/node_modules/**`.

#### Scenario: Un archivo generado editado a mano hace fallar la CI [US-036 AC-7] [US-033 AC-16]
- **GIVEN** el fixture `ac7-generado-desactualizado`: un clon temporal que cambia un `openapi.yaml` sin regenerar, o edita a mano `packages/api-contracts/src/types/rag-orchestrator/types.gen.ts`
- **WHEN** el job `contracts` crea el venv con `requirements-codegen.txt` y ejecuta `npm run contracts:generate:check`
- **THEN** termina con código distinto de 0 y nombra la ruta generada que no está al día

#### Scenario: El vitest raíz no recoge copias de los worktrees [US-036 AC-7]
- **GIVEN** un archivo de test bajo `.claude/worktrees/<x>/` y otro bajo un `node_modules/`
- **WHEN** se ejecuta `npx vitest run --reporter=json` en la raíz
- **THEN** ninguno de los dos aparece entre los archivos de test ejecutados

### Requirement: La CI bloquea secretos en el repositorio
El job `secret-scan` MUST escanear con gitleaks, en versión fija, el árbol del PR y los commits del PR, con las reglas por defecto más las de `.gitleaks.toml`. MUST fallar ante una clave privada PEM o una cadena con forma de token, nombrando archivo, línea y regla, y MUST NOT imprimir el valor detectado (`--redact`), porque el log de la CI es público (RN-14, SEG-12). La allowlist de `.gitleaks.toml` MUST ser solo por ruta.

#### Scenario: Una clave privada PEM hace fallar el escaneo y nombra el archivo [US-036 AC-3] [RN-14]
- **GIVEN** el fixture `ac3-pem`: un clon temporal al que se añade un archivo con una clave privada PEM generada en tiempo de ejecución
- **WHEN** se ejecuta el comando del job `secret-scan`
- **THEN** termina con código distinto de 0, el informe nombra la ruta del archivo y la regla `private-key`, y la salida no contiene ninguna línea de la clave

#### Scenario: Una cadena con forma de token hace fallar el escaneo [US-036 AC-3] [RN-14]
- **GIVEN** el fixture `ac3-token`: un clon temporal con un archivo que contiene un token con forma de JWT o de clave de API generado en tiempo de ejecución, añadido y borrado en dos commits del PR
- **WHEN** se ejecuta el comando del job `secret-scan` sobre los commits del PR
- **THEN** termina con código distinto de 0, nombra el archivo y el commit, y la salida muestra el valor redactado

### Requirement: La CI bloquea PII en los archivos versionados con formatos configurables
El job `data-scan` MUST escanear todos los archivos de texto que lista `git ls-files` (incluidos `data/`, `contracts/examples/`, los fixtures de `apps/*/test*`, `eval/`, `reports/` y `docs/`), salvo las exclusiones de `config/pii-scan.json`. MUST aplicar los formatos de `config/pii-formats.json` (documento de identidad, teléfono y correo, sin asumir país; RN-22) y MUST fallar ante cada coincidencia, nombrando `ruta:línea` y el id del formato, sin imprimir el valor (RN-14).

#### Scenario: Un documento de identidad en data/ hace fallar el escaneo con archivo y línea [US-036 AC-4] [RN-14]
- **GIVEN** el fixture `ac4-documento`: un clon temporal con `data/notas.json` que en la línea 7 contiene un número sintético con la forma del formato `documento_identidad` precedido de su palabra clave
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** termina con código distinto de 0 e imprime `data/notas.json:7: documento_identidad`, sin el número

#### Scenario: PII fuera de data/ también hace fallar el escaneo [US-036 AC-4] [RN-14]
- **GIVEN** el fixture `ac4-fuera-de-data`: un clon temporal con un documento sintético precedido de su palabra clave en `contracts/examples/evidence-analysis-request.json` y otro en `apps/clinical-api/test/fixtures/paciente.json`, sin entrada en la allowlist
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs` con la raíz por defecto (`git ls-files`)
- **THEN** termina con código distinto de 0 y nombra las dos rutas con su línea y `documento_identidad`, sin el valor

#### Scenario: Un teléfono en data/ hace fallar el escaneo [US-036 AC-4] [RN-14]
- **GIVEN** el fixture `ac4-telefono`: un clon temporal con un archivo en `data/` que contiene un teléfono sintético en formato E.164
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** termina con código distinto de 0 y nombra el archivo, la línea y el formato `telefono`

#### Scenario: Un correo de un dominio reservado no es hallazgo [US-036 AC-4] [RN-14]
- **GIVEN** el fixture `ac4-correo-reservado`: un clon temporal con correos en `@example.com`, `@demo.test`, `@host.local`, `@x.invalid` y `@app.localhost` y uno en otro dominio, sin entrada en la allowlist
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** solo se informa el correo del dominio no reservado, con `ruta:línea: correo` y sin el valor

### Requirement: Los formatos de PII tienen una única fuente
`config/pii-formats.json` MUST ser la única definición de formatos de PII del repositorio, incluida la lista `dominiosExentos` del formato `correo` (`*.test`, `*.local`, `*.invalid`, `*.localhost`, `example.com`, `example.org`, `example.net`; RFC 2606 / RFC 6761), exenta globalmente en el escaneo. Otros consumidores (L1D-203 para enmascarar en ejecución) SHALL reutilizar ese archivo y añadir solo sus reglas de reemplazo, sin redefinir patrones.

#### Scenario: El escáner y el enmascarado leen los mismos formatos [US-036 AC-4] [RN-22]
- **GIVEN** `config/pii-formats.json` con su `version`
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** usa solo los formatos de ese archivo y ningún otro archivo del repositorio define patrones de documento de identidad, teléfono o correo

### Requirement: Las exclusiones del escaneo de PII solo salen de una lista cerrada
Cada exclusión de `config/pii-scan.json` MUST declarar un patrón y un motivo, y su patrón MUST ser idéntico a uno de la lista cerrada `EXCLUSIONES_PERMITIDAS` definida en `scripts/ci/pii-scan.mjs` (lockfiles y binarios por extensión); cualquier otra exclusión MUST hacer fallar el job `data-scan`. Todo lo demás solo se omite por la allowlist, por fixture y valor.

#### Scenario: Una exclusión fuera de la lista cerrada se rechaza [US-036 AC-4] [RN-14]
- **GIVEN** un `config/pii-scan.json` con una exclusión `docs/**` (o cualquier patrón que no sea un lockfile ni un binario de la lista cerrada)
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** termina con código distinto de 0 nombrando la exclusión no permitida

#### Scenario: Una exclusión de lockfile de la lista cerrada se acepta [US-036 AC-4]
- **GIVEN** un `config/pii-scan.json` cuya única exclusión es `**/package-lock.json` con su motivo
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs` sobre un clon sin PII
- **THEN** termina con código 0

### Requirement: La allowlist de PII es por fixture y por valor, sin PII en claro
Cada entrada de `config/pii-allowlist.json` MUST tener la forma `{ fixture, clase: sintetico, rutas: [globs], valores: [{ formato, sha256 }], motivo }`, donde `sha256` es el hash del valor normalizado, de modo que la allowlist no contiene PII en claro. Un hallazgo SHALL omitirse solo si su ruta casa con un glob de `rutas` **y** el par (formato, sha256 del valor normalizado) está en `valores` de esa misma entrada.

#### Scenario: Solo se omiten los valores sintéticos listados de un fixture [US-036 AC-4] [OL-06]
- **GIVEN** el fixture `ac4-allowlist`: un archivo en `ci/tests/cases/ac4-allowlist/` con el documento y el teléfono sintéticos de FX-T4a-a, cuyos hashes están en la entrada `fixture: FX-T4a-a` con `clase: sintetico`, y un tercer valor sintético sin hash en la entrada
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** los dos valores con hash no se informan y el tercero se informa con `ruta:línea: <formato>`, sin el valor, y el código es distinto de 0

#### Scenario: Un valor listado fuera de los globs de su entrada se informa [US-036 AC-4] [RN-14]
- **GIVEN** el mismo valor sintético de FX-T4a-a, con su hash en la allowlist, copiado en `docs/notas.md`
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** termina con código distinto de 0 y nombra `docs/notas.md` con su línea y formato

### Requirement: Las entradas de la allowlist de PII se validan
Una entrada de `config/pii-allowlist.json` sin `clase: sintetico`, con `valores` o `rutas` vacíos, o con un glob más amplio que un directorio de fixture MUST hacer fallar el job `data-scan`, nombrando la entrada. Los globs iniciales son `backlog/features/FEAT-T4a-*.md`, `apps/clinical-api/prisma/seed/**`, `apps/clinical-api/test/**/deidentification/**`, `openspec/changes/*-desidentificacion-*/**`, `openspec/specs/deidentification/**` y `ci/tests/cases/ac4-allowlist/**`.

#### Scenario: Los globs iniciales de la allowlist se aceptan [US-036 AC-4]
- **GIVEN** `config/pii-allowlist.json` con los seis globs iniciales, cada uno en una entrada con `clase: sintetico` y al menos un valor
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs` sobre un clon sin otra PII
- **THEN** termina con código 0

#### Scenario: Una entrada de allowlist inválida hace fallar el escaneo [US-036 AC-4] [RN-14]
- **GIVEN** una entrada de `config/pii-allowlist.json` sin `clase: sintetico`, otra sin `valores` y otra con el glob `backlog/**` (o `apps/clinical-api/test/**`)
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs` con cada una
- **THEN** termina con código distinto de 0 nombrando la entrada y el motivo (sin marca, sin valores, glob más amplio que un directorio de fixture)

### Requirement: Los datasets de evaluación declaran la clase de datos sintetico
El job `data-scan` MUST verificar que todo archivo bajo las raíces de `config/dataset-roots.json` (por defecto `data/eval/` y `data/evaluation/`) esté cubierto por el manifiesto más cercano (`manifest.json` o `manifest.yaml`) o por su propia cabecera con `clase: sintetico`; si no, MUST fallar con el mensaje "dataset sin clase de datos `sintetico`" y la ruta (RN-13).

#### Scenario: Un dataset de evaluación sin marca hace fallar la CI [US-036 AC-5] [RN-13] (asumido) [S1 resp. 3]
- **GIVEN** el fixture `ac5-sin-clase`: un clon temporal con `data/evaluation/preguntas.jsonl` sin manifiesto ni cabecera con `clase: sintetico`
- **WHEN** se ejecuta `scripts/ci/dataset-class-check.mjs`
- **THEN** termina con código distinto de 0 e imprime `data/evaluation/preguntas.jsonl: dataset sin clase de datos \`sintetico\``

#### Scenario: Un dataset con manifiesto sintetico pasa [US-036 AC-5] [RN-13] (asumido) [S1 resp. 3]
- **GIVEN** un clon temporal con `data/eval/mini/manifest.json` que declara `clase: sintetico` y sus archivos en la misma carpeta
- **WHEN** se ejecuta `scripts/ci/dataset-class-check.mjs`
- **THEN** termina con código 0

### Requirement: main no admite merges con la CI en rojo
La rama `main` MUST exigir PR y el *status check* `ci-ok` en verde antes de mergear, sin *bypass* para administradores. `scripts/ci/check-branch-protection.sh` MUST verificar, en solo lectura, esas condiciones y fallar nombrando la que falte. Ningún agente SHALL cambiar la configuración del repositorio; la aplica el humano administrador.

#### Scenario: Un PR con la CI en rojo no se puede mergear [US-036 AC-6] (asumido) [S1 resp. 3]
- **GIVEN** un PR de prueba desde la rama `ci/selftest-ac6` con `ci-ok` en `failure`
- **WHEN** se intenta mergear a `main`
- **THEN** GitHub lo impide por el *status check* requerido `ci-ok`, y `check-branch-protection.sh` termina con código 0 informando PR obligatorio, `ci-ok` requerido y sin *bypass*

#### Scenario: La verificación falla si falta el check requerido [US-036 AC-6] (asumido) [S1 resp. 3]
- **GIVEN** una respuesta de la API de GitHub, servida desde un archivo de fixture, en la que `main` no exige `ci-ok`
- **WHEN** se ejecuta `check-branch-protection.sh` con esa respuesta
- **THEN** termina con código distinto de 0 y nombra `ci-ok` como check requerido ausente

### Requirement: Las exenciones de los escáneres son declarativas, tienen motivo y no ocultan el caso original
Los formatos de `config/pii-formats.json` MUST tener un `patron` neutro; sus exenciones (`prefijosExentos`, `contextosExentos`, `dominiosExentos`, `correosExentos`) MUST aplicarse solo en `scripts/lib/formatosPii.mjs`, que comparten el escáner de PII y `assertExamplesSynthetic`. Cada exención MUST tener un test de que el caso original se sigue detectando. El `.gitleaks.toml` MUST acotar cada entrada de su allowlist por ruta exacta, regla y forma del valor.

#### Scenario: Un número con el prefijo centinela no es hallazgo pero el mismo número sin prefijo sí [US-036 AC-4] [RN-14]
- **GIVEN** una línea con `"nationalId": "SINT-<dígitos>"` y otra con el mismo número sin prefijo tras `documento`
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** solo se informa la segunda con `ruta:línea: documento_identidad`

#### Scenario: Una coincidencia dentro de una URL no es hallazgo pero fuera de una URL sí [US-036 AC-4] [RN-14]
- **GIVEN** `https://corpus.oncolens.test/documentos/CDR<dígitos>` y, en otra línea, `documentos/CDR<dígitos>` fuera de una URL
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** solo se informa la segunda

#### Scenario: El buzón institucional exento no exime a otros buzones de su dominio [US-036 AC-4] [RN-14]
- **GIVEN** `correosExentos` con el buzón de consultas de la CIE de la OMS y un correo de otra persona en el mismo dominio
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** solo se informa el segundo

### Requirement: Las siglas de documento de identidad se detectan con límite de palabra
`config/pii-formats.json` MUST incluir como palabras clave de `documento_identidad` las siglas `CC`, `C.C.`, `TI`, `T.I.`, `CE`, `C.E.`, `NUIP`, `ID` y `HC` y las expresiones `tarjeta de identidad` e `historia clínica`. Las de hasta cuatro caracteres MUST exigir límite de palabra y no casar tras `_`.

#### Scenario: Cada sigla precede a un documento detectado [US-036 AC-4] [RN-14]
- **GIVEN** líneas como `CC <dígitos>`, `C.C. <dígitos con puntos>`, `ID: <dígitos>`, `TI <dígitos>` y `tarjeta de identidad <dígitos>`
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** cada línea se informa como `documento_identidad`, y `nct_id: NCT<dígitos>` no

### Requirement: La clase de datos no admite exenciones por extensión
`scripts/ci/dataset-class-check.mjs` MUST exigir la clase `sintetico` a todo archivo bajo las raíces de evaluación, sea cual sea su extensión. La búsqueda del manifiesto MUST detenerse en la raíz configurada y, si el manifiesto más cercano declara otra clase, MUST fallar sin consultar la cabecera del archivo.

#### Scenario: Un archivo de documentación sin manifiesto falla [US-036 AC-5] [RN-13]
- **GIVEN** `data/eval/p/README.md` sin manifiesto en su directorio ni en sus ancestros hasta la raíz
- **WHEN** se ejecuta `scripts/ci/dataset-class-check.mjs`
- **THEN** termina con código distinto de 0 nombrando la ruta

### Requirement: Un caso de PR pendiente no puede quedar pendiente tras archivar su dependencia
En `ci/tests/cases/<caso>/case.json`, `pendiente` MUST ser `{ motivo, hastaQueSeArchive: [changes] }`; `ci/tests/run-cases.sh` MUST contar como FALLA un caso pendiente cuando alguno de esos changes esté en `openspec/changes/archive/`, y con `--estricto` MUST fallar mientras exista algún caso pendiente.

#### Scenario: Con la dependencia archivada el caso pendiente falla [US-036 AC-2]
- **GIVEN** un caso con `pendiente.hastaQueSeArchive: ["l1d-999-consumidor"]` y `openspec/changes/archive/<fecha>-l1d-999-consumidor/`
- **WHEN** se ejecuta `ci/tests/run-cases.sh`
- **THEN** el caso se informa como FALLA y el código de salida es 1

### Requirement: contracts-breaking compara todos los proveedores sin repetir su lista
`scripts/ci/contracts-breaking.sh` MUST obtener los proveedores de `PROVIDERS` (`scripts/contracts/lib/specs.mjs`) y MUST imprimir `<proveedor>: comparado` por cada uno.

#### Scenario: Cada proveedor aparece como comparado [US-036 AC-2]
- **GIVEN** la base `HEAD`
- **WHEN** se ejecuta `scripts/ci/contracts-breaking.sh HEAD`
- **THEN** la salida contiene `<proveedor>: comparado` para cada elemento de `PROVIDERS`

### Requirement: Los checkouts de la CI no persisten credenciales
Todo paso `actions/checkout` de los workflows MUST declarar `persist-credentials: false`.

#### Scenario: El test estático detecta un checkout sin persist-credentials [US-036 AC-1]
- **GIVEN** `ci.yml` y `ci-selftest.yml` parseados por `ci/tests/workflow.test.mjs`
- **WHEN** se revisan los pasos `actions/checkout`
- **THEN** cada uno tiene `with.persist-credentials: false`; si falta, el test falla

### Requirement: integration-rag descarga sus imágenes de forma resiliente y distingue la descarga de la salud
El job `integration-rag` MUST ejecutar `compose pull` antes de `compose up --no-build`, con hasta `INTEGRACION_RAG_PULL_INTENTOS` intentos (3) y espera creciente (RN-22), reintentando solo la descarga, nunca Pytest ni la salud. Agotados los intentos, MUST fallar con "integracion-rag: no se pudo descargar la imagen de <servicio>" y SHALL NOT emitir "no quedaron sanos en <n>s", reservado a la espera de salud. `milvus-etcd` MUST usar `gcr.io/etcd-development/etcd:v3.5.34`.

#### Scenario: Un 503 transitorio en la descarga se recupera con un reintento [US-213 AC-13] [S3 resp. 14]
- **GIVEN** el test hermético con un `docker` falso cuyo `compose pull` falla con `503 Service Unavailable` en el primer intento y termina bien en el segundo
- **WHEN** se ejecuta `integracion-rag-orchestrator.sh`
- **THEN** el log registra dos llamadas a `pull` antes de un único `up --no-build`, la espera entre ellas es la configurada y el script continúa hasta Pytest

#### Scenario: La descarga que falla siempre termina con el mensaje de descarga, no con el de salud [US-213 AC-13] [S3 resp. 14]
- **GIVEN** el `docker` falso con `compose pull` que falla con `503` en los 3 intentos para `milvus-etcd`
- **WHEN** se ejecuta el script
- **THEN** termina con código distinto de 0 y "integracion-rag: no se pudo descargar la imagen de milvus-etcd", no aparece "no quedaron sanos" y nunca se llama a `up` ni a Pytest

#### Scenario: Un servicio sin salud tras descargar sigue fallando con el mensaje de salud [US-213 AC-13]
- **GIVEN** el `docker` falso con `pull` correcto y `milvus-standalone` que no queda sano
- **WHEN** se ejecuta el script
- **THEN** termina con "no quedaron sanos en <n>s" nombrando el servicio, sin el mensaje de descarga y sin reintentar el `up`

#### Scenario: Los tests de Pytest no se reintentan [US-213 AC-13]
- **GIVEN** el `docker` falso con `pull` correcto y Pytest en rojo
- **WHEN** se ejecuta el script
- **THEN** Pytest se invoca una sola vez y el job termina en `failure`

#### Scenario: etcd se descarga desde gcr.io con la misma versión [US-213 AC-13] [S3 resp. 14]
- **GIVEN** `infra/docker/docker-compose.yml`
- **WHEN** se resuelve `compose config` del servicio `milvus-etcd`
- **THEN** su imagen es `gcr.io/etcd-development/etcd:v3.5.34`, ninguna imagen del Compose viene de `quay.io` y el *healthcheck* `etcdctl endpoint health` se conserva
