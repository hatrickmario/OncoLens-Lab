## ADDED Requirements

### Requirement: Tests desactivados o enfocados hacen fallar la calidad
El job `quality` MUST fallar cuando un archivo de test de `web`, `clinical-api` o `rag-orchestrator` desactiva o enfoca un test (formas de Vitest y de Pytest listadas en los escenarios), nombrando archivo, línea y regla, y MUST dejar cada hallazgo en `reports/quality/latest.json`. Las excepciones de `quality-thresholds.json` SHALL NOT eximir estas reglas.

#### Scenario: Un it.only en un test de clinical-api hace fallar la calidad [US-213 AC-8]
- **GIVEN** el fixture de PR `ci/tests/quality/` con un `it.only` en un test de `apps/clinical-api`
- **WHEN** corre `npm run quality`
- **THEN** termina con código distinto de 0 nombrando el archivo, la línea y `vitest/no-focused-tests`

#### Scenario: Un it.skip, xit o it.todo en web hace fallar la calidad [US-213 AC-8]
- **GIVEN** fixtures con `it.skip`, `xit` y `it.todo` en tests de `apps/web`
- **WHEN** corre `npm run quality`
- **THEN** cada uno falla nombrando el archivo, la línea y `vitest/no-disabled-tests` o `vitest/no-focused-tests`

#### Scenario: Un marcador skip, skipif o xfail en Pytest hace fallar la calidad [US-213 AC-8]
- **GIVEN** fixtures con `@pytest.mark.skip`, `@pytest.mark.skipif`, `@pytest.mark.xfail`, `pytest.skip(` y `pytest.xfail(` en tests de `apps/rag-orchestrator`
- **WHEN** corre `npm run quality`
- **THEN** cada uno falla nombrando el archivo, la línea y `tests-sin-desactivar`, y el hallazgo aparece en `latest.json`

#### Scenario: Las mismas palabras fuera de un archivo de test no alertan [US-213 AC-8] (asumido)
- **GIVEN** un módulo de producción o un comentario de documentación que contiene el texto `pytest.skip(` sin ser un archivo de test
- **WHEN** corre `npm run quality`
- **THEN** no hay hallazgo de `tests-sin-desactivar` para ese archivo

### Requirement: Cada AC de un change activo tiene un test de aceptación tagueado
`scripts/quality/check-ac-coverage` MUST leer los AC de las historias enlazadas en el `proposal.md` de cada change activo de `openspec/changes/` (excluido `archive/`) y MUST emitir en `reports/quality/latest.json` una **alerta** por cada AC sin al menos un test cuyo título termine en `[US-xxx AC-n]` (Vitest, Playwright) o marcado con `@pytest.mark.ac("US-xxx", n)`. El chequeo SHALL NOT hacer fallar el job y SHALL NOT alertar por tests sin tag.

#### Scenario: Un AC sin test tagueado produce una alerta sin fallar [US-213 AC-9] (asumido)
- **GIVEN** un change activo de fixture cuya historia tiene AC-1 y AC-2 y solo existe un test terminado en `[US-900 AC-1]`
- **WHEN** corre `npm run quality`
- **THEN** el job termina con código 0 y `latest.json` contiene una alerta `check-ac-coverage` que nombra `US-900 AC-2` y el change

#### Scenario: El marcador ac de Pytest cuenta como test de aceptación [US-213 AC-9]
- **GIVEN** un change activo de fixture con AC-1 cubierto solo por un test de Pytest con `@pytest.mark.ac("US-900", 1)`
- **WHEN** corre `npm run quality`
- **THEN** no hay alerta para `US-900 AC-1`

#### Scenario: Los unitarios sin tag no alertan [US-213 AC-9]
- **GIVEN** tests unitarios sin tag `[US-xxx AC-n]` en el repositorio
- **WHEN** corre `check-ac-coverage`
- **THEN** no genera alertas por esos tests

#### Scenario: Un marcador ac sin registrar hace fallar Pytest [US-213 AC-9] (asumido)
- **GIVEN** `pyproject.toml` con `--strict-markers` y el marcador `ac` registrado
- **WHEN** un test usa un marcador mal escrito (`@pytest.mark.acc`)
- **THEN** Pytest falla en la recolección nombrando el marcador

### Requirement: vi.mock solo sobre bordes arquitectónicos
El job `quality` MUST fallar con la regla `mock-solo-en-bordes`, nombrando el módulo, cuando un test de `web` o `clinical-api` llama `vi.mock` sobre una ruta relativa (`./`, `../`), un alias propio (`@/`, `@oncolens/`) o `@prisma/client`; `vi.mock` de paquetes de terceros que son borde (clientes HTTP, SDK de MinIO) MUST permitirse.

#### Scenario: vi.mock de un módulo propio hace fallar la calidad [US-213 AC-10]
- **GIVEN** fixtures con `vi.mock('./patients.repository')`, `vi.mock('@/lib/server/patients')` y `vi.mock('@prisma/client')`
- **WHEN** corre `npm run quality`
- **THEN** cada uno falla con `mock-solo-en-bordes` nombrando el módulo, el archivo y la línea

#### Scenario: vi.mock de un cliente de terceros que es borde se permite [US-213 AC-10]
- **GIVEN** un test con `vi.mock` del SDK de MinIO
- **WHEN** corre `npm run quality`
- **THEN** no hay hallazgo de `mock-solo-en-bordes`

### Requirement: Handlers de HTTP saliente construidos desde los ejemplos del contrato
Los tests de integración que necesitan HTTP saliente MUST usar los handlers de MSW de `packages/test-support/msw/` en `web` y `clinical-api`, y los de `respx` de `apps/rag-orchestrator/tests/support/http.py` en `rag-orchestrator`, construidos desde `contracts/examples/` (ADR-26); un handler con un campo que no existe en su ejemplo MUST hacer fallar su propio test.

#### Scenario: Un handler de MSW con un campo ajeno al ejemplo hace fallar su test [US-213 AC-10] [ADR-26]
- **GIVEN** un handler de `packages/test-support/msw/` construido desde `contracts/examples/rag-query-con-evidencia.json` al que se añade un campo que no existe en el ejemplo
- **WHEN** corre el test que lo usa
- **THEN** el test falla nombrando el campo y el ejemplo de origen

#### Scenario: Un handler de respx con un campo ajeno al ejemplo hace fallar su test [US-213 AC-10] [ADR-26]
- **GIVEN** un handler de `tests/support/http.py` construido desde un ejemplo de `contracts/examples/` con un campo añadido
- **WHEN** corre el test de Pytest que lo usa
- **THEN** el test falla nombrando el campo y el ejemplo de origen

### Requirement: Cobertura de líneas cambiadas como alerta
El job `quality` MUST escribir en `reports/quality/latest.json` el porcentaje de líneas cambiadas cubiertas por archivo cambiado frente a `origin/main`, y MUST emitir una **alerta** bajo `coverage.changedLinesWarn` (RN-22) en las rutas de `coverage.alertPaths` (`app/domain/**` de `rag-orchestrator`, `*.service.ts` de `clinical-api`, `apps/web/lib/**`). El job SHALL NOT fallar por cobertura ni aplicar un umbral global; una clave ausente o no numérica MUST hacerlo fallar con su nombre.

#### Scenario: Un service con líneas cambiadas sin cubrir alerta sin fallar [US-213 AC-11] (asumido)
- **GIVEN** un PR de fixture que cambia 10 líneas de un `*.service.ts` de `clinical-api` y los tests cubren 5, con `coverage.changedLinesWarn` en `quality-thresholds.json`
- **WHEN** corre el job `quality`
- **THEN** termina con código 0 y `latest.json` contiene el archivo, el porcentaje 50 y una alerta con el umbral leído de la configuración

#### Scenario: Un archivo fuera de las rutas acotadas no alerta por cobertura [US-213 AC-11] (asumido)
- **GIVEN** un PR que cambia sin cubrir un archivo de `scripts/`
- **WHEN** corre el job `quality`
- **THEN** `latest.json` puede registrar su porcentaje, pero no emite alerta de cobertura y el job no falla

#### Scenario: La clave de cobertura ausente hace fallar con su nombre [US-213 AC-11] [RN-22] (asumido)
- **GIVEN** `quality-thresholds.json` sin `coverage.changedLinesWarn`
- **WHEN** corre `npm run quality`
- **THEN** falla nombrando la clave `coverage.changedLinesWarn`
