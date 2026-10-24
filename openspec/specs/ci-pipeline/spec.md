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
