## MODIFIED Requirements

### Requirement: Generación reproducible desde los specs
`npm run contracts:generate` MUST generar desde ambos specs tipos TS, Zod y Pydantic en las rutas de design.md D6 y el extracto no normativo de readme §4, marcados como no editables. `contracts:generate:check` SHALL fallar si queda una diferencia o un archivo sin versionar, y `contracts:check` si el extracto no coincide con el spec `[Pre-S1 resp. 20, 28]`. `npm run contracts:breaking` MUST comparar ambos specs con los de `origin/main` mediante `scripts/ci/contracts-breaking.sh` y `npm run contracts:verify-provider` MUST ejecutar la verificación del proveedor (US-214). El Zod generado MUST ser estricto `[Pre-S1 resp. 33 (D-4)]` y MUST incluir los refinamientos generados de los `if/then`, `anyOf` y `allOf` con `unevaluatedProperties: false` del spec; una construcción que el generador no sepa traducir MUST hacer fallar `contracts:generate`.

#### Scenario: Generar dos veces no produce diferencias [US-033 AC-16] [Pre-S1 resp. 20]
- **WHEN** se ejecuta `contracts:generate:check` sobre el repositorio recién generado y versionado
- **THEN** termina con código 0 sin diferencias

#### Scenario: El Zod generado rechaza propiedades desconocidas [US-033 AC-16] [Pre-S1 resp. 33 (D-4)]
- **WHEN** se valida con el Zod generado de `rag-orchestrator` un ejemplo al que se añade una propiedad no declarada en un objeto cerrado
- **THEN** la validación falla (`z.strictObject`)

#### Scenario: Una edición a mano de lo generado se detecta [US-033 AC-16] [Pre-S1 resp. 20]
- **WHEN** se edita a mano `packages/api-contracts/src/zod/clinical-api/zod.gen.ts` o un modelo de `apps/rag-orchestrator/app/schemas/generated/` y se ejecuta `contracts:generate:check`
- **THEN** termina con código distinto de 0 y lista el archivo modificado

#### Scenario: Lo generado desactualizado o editado a mano rompe la CI [US-214 AC-4] [NFR-13]
- **GIVEN** un PR que cambia un `openapi.yaml` sin regenerar, o que edita a mano `packages/api-contracts/src/` (incluido `src/zod/`) o `apps/rag-orchestrator/app/schemas/generated/`
- **WHEN** corre `npm run contracts:generate:check` en la CI
- **THEN** termina con código distinto de 0 y lista cada archivo modificado

#### Scenario: El extracto del readme es generado y no normativo [US-033 AC-16] [Pre-S1 resp. 28]
- **WHEN** `contracts:check` compara el bloque entre `<!-- contracts:readme-extract:start -->` y `<!-- contracts:readme-extract:end -->` de readme §4 con la salida de `contracts:readme-extract`
- **THEN** coinciden, el bloque contiene `POST /platform/patients/{patientId}/documents`, `POST /platform/evidence-analyses` y `GET /platform/patients/{patientId}` y lo precede la marca "extracto generado, no normativo"

#### Scenario: Un extracto del readme editado a mano rompe la verificación [US-033 AC-16] [Pre-S1 resp. 28]
- **WHEN** se edita a mano una línea del extracto del readme
- **THEN** `assertReadmeExtractInSync()` reporta el hallazgo y el comando termina con código distinto de 0

#### Scenario: Eliminar o volver obligatorio un campo rompe contracts:breaking [US-214 AC-5] [ADR-26]
- **GIVEN** un clon temporal en el que se elimina un campo de un schema de respuesta, o se añade a `required` un campo de un schema de request, de cualquiera de los dos specs
- **WHEN** se ejecuta `npm run contracts:breaking` contra `origin/main`
- **THEN** termina con código distinto de 0 nombrando el proveedor y el cambio

#### Scenario: Un cambio incompatible declarado como excepción de ADR-26 pasa [US-214 AC-5] (asumido)
- **GIVEN** el mismo cambio declarado en `scripts/ci/contracts-breaking-excepciones.json` con su E-n, motivo y change, y citado en el `design.md` del change
- **WHEN** se ejecuta `npm run contracts:breaking`
- **THEN** termina con código 0 e imprime la excepción aplicada

#### Scenario: El Zod generado rechaza lo que el generador no traduce [US-214 AC-6] [RN-02] [Pre-S1 resp. 33]
- **GIVEN** los ejemplos de `contracts/examples/` y los parches negativos de `scripts/contracts/__fixtures__/parches/`
- **WHEN** se validan con el Zod generado, incluidos sus refinamientos
- **THEN** los ejemplos pasan y se rechazan `sin_evidencia` con `topRelevanceScore: 0.0`, un `CitedSource` o `FollowUpCitedSource` con una propiedad no evaluada y un objeto que no cumple ninguna rama de su `anyOf`

#### Scenario: Una construcción no traducible hace fallar la generación [US-214 AC-6] (asumido)
- **GIVEN** un spec temporal con un `if/then` sobre una forma que el generador de refinamientos no reconoce
- **WHEN** se ejecuta `npm run contracts:generate`
- **THEN** termina con código distinto de 0 nombrando el schema y la construcción

## ADDED Requirements

### Requirement: Verificación automática del proveedor en los tests de integración
Los tests de integración de `clinical-api` y de `rag-orchestrator` MUST validar cada respuesta contra el `openapi.yaml` de su servicio sin que el test lo pida: código declarado, cabeceras obligatorias y cuerpo. Un incumplimiento MUST hacer fallar el test nombrando proveedor, método, plantilla, código y ruta JSON, sin imprimir el valor.

#### Scenario: Las suites de ambos proveedores pasan con la verificación activa [US-214 AC-1] [NFR-13]
- **GIVEN** los specs de `main` y el PostgreSQL de test
- **WHEN** se ejecuta `npm run contracts:verify-provider`
- **THEN** las suites de integración de `clinical-api` y de `rag-orchestrator` terminan en verde y el reporte indica, por proveedor, cuántas respuestas se verificaron

#### Scenario: topRelevanceScore 0.0 en sin_evidencia hace fallar al proveedor [US-214 AC-2] [RN-02] [ADR-26]
- **GIVEN** un adapter falso de `rag-orchestrator` que devuelve `status: sin_evidencia` con `topRelevanceScore: 0.0`
- **WHEN** corre el test de `POST /rag/query` con la verificación activa
- **THEN** falla nombrando `rag-orchestrator`, `POST /rag/query`, `200` y `/topRelevanceScore`

#### Scenario: Un campo no declarado en EvidenceAnalysis hace fallar al proveedor [US-214 AC-2] [ADR-26]
- **GIVEN** una respuesta de `POST /platform/evidence-analyses` a la que se añade un campo no declarado en `EvidenceAnalysis`
- **WHEN** corre el test de `clinical-api` con la verificación activa
- **THEN** falla nombrando `clinical-api`, la plantilla, el código y la ruta JSON del campo

#### Scenario: Una respuesta con un código no declarado hace fallar al proveedor [US-214 AC-1]
- **GIVEN** un endpoint que responde con un código de estado que su operación no declara
- **WHEN** corre su test con la verificación activa
- **THEN** falla nombrando el código no declarado y la operación

### Requirement: contracts:verify-provider corre en cada PR
`npm run contracts:verify-provider` MUST ejecutar ambas suites de integración con la verificación activa, y la CI MUST ejecutarlo en cada PR en jobs que forman parte de `ci-ok`.

#### Scenario: La CI ejecuta la verificación del proveedor en jobs bloqueantes [US-214 AC-1]
- **GIVEN** `.github/workflows/ci.yml`
- **WHEN** se inspeccionan los jobs `integration` y `build-test`
- **THEN** ejecutan `contracts:verify-provider` (o sus suites con `CONTRACT_VERIFY=strict`) y ambos figuran en `needs` de `ci-ok`

### Requirement: Las respuestas de error también son contrato
Las respuestas `401`, `403`, `409` y `422` de los endpoints existentes MUST cumplir el schema de error que declara su operación (incluido `TIPO_NO_HABILITADO` en `422`); un error cuya forma o código no esté declarado MUST hacer fallar el test.

#### Scenario: Los errores declarados cumplen su schema [US-214 AC-3] [B-10]
- **GIVEN** los tests existentes que provocan `401`, `403`, `409` y `422` (`TIPO_NO_HABILITADO`)
- **WHEN** corren con la verificación activa
- **THEN** cada cuerpo cumple el schema de error declarado y el test pasa

#### Scenario: Un error con un código de error no declarado hace fallar el test [US-214 AC-3]
- **GIVEN** un endpoint que responde `422` con un `code` que no está en el enum de errores de su operación
- **WHEN** corre su test con la verificación activa
- **THEN** falla nombrando la operación, `422` y `/code`

### Requirement: Los consumidores solo llaman a los proveedores con clientes generados
El código de `apps/web` (Route Handlers y `lib/server`) y de `apps/clinical-api` MUST llamar a `clinical-api` y a `rag-orchestrator` solo mediante los clientes generados de `packages/api-contracts`; `contracts:check` MUST rechazar un `fetch` o un cliente HTTP directo hacia esos servicios fuera de los transportes declarados.

#### Scenario: Un fetch directo a rag-orchestrator rompe contracts:check [US-214 AC-1] (asumido)
- **GIVEN** un archivo de `apps/clinical-api/src/` que llama con `fetch` a una URL de `rag-orchestrator` fuera del cliente generado
- **WHEN** se ejecuta `npm run contracts:check`
- **THEN** termina con código distinto de 0 nombrando el archivo y la línea
