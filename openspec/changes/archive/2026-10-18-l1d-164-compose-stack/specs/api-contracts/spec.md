## ADDED Requirements

### Requirement: Health check declarado en ambos specs
Ambos specs MUST declarar `GET /health` con `security: []`, tag `operacion` y `200 HealthStatus` (cerrado, `status` `const ok`, definido en cada spec); el de `rag-orchestrator` SHALL declarar además `503 LlmLocalNoDisponible`. Es aditivo (ADR-26): `info.version` 1.1.0 y ejemplos `health-ok.json` y `rag-health-llm-no-disponible.json` en `index.json`.

#### Scenario: Ambos specs declaran el health con sus ejemplos [US-034 AC-1] [US-034 AC-4]
- **WHEN** `npm run contracts:check` revisa los dos specs y los ejemplos
- **THEN** `GET /health` existe en ambos con `HealthStatus` cerrado, el de `rag-orchestrator` declara el `503` `LOCAL_LLM_UNAVAILABLE`, `health-ok.json` y `rag-health-llm-no-disponible.json` validan contra su `target` y el comando termina con código 0

#### Scenario: El cambio no es incompatible [US-034 AC-1]
- **WHEN** se comparan los specs del change con los de `main` (`oasdiff breaking`, o la comprobación manual equivalente mientras `contracts:breaking` no exista, US-214)
- **THEN** no se reporta ningún cambio incompatible y ambos declaran `info.version: 1.1.0`

### Requirement: Ejemplos de request para las preguntas de fixture del modo fake
`index.json` MUST asociar `rag-query-con-evidencia.json` a `rag-query-request.json` y `rag-query-sin-evidencia.json` a `rag-query-request-sin-evidencia.json`, un request sintético válido contra `RagQueryInternalRequest` que solo difiere en la `query` `[S1 resp. 7]`.

#### Scenario: El request sin evidencia es un ejemplo sintético válido [US-034 AC-6] [S1 resp. 7]
- **WHEN** `contracts:check` valida `rag-query-request-sin-evidencia.json` contra `RagQueryInternalRequest`
- **THEN** el ejemplo valida, cumple `assertExamplesSynthetic()` y solo difiere de `rag-query-request.json` en la `query`

### Requirement: Preguntas de fixture distintas en todos los pares request → RagQueryInternalResponse
Toda entrada de `index.json` con `target` `#/components/schemas/RagQueryInternalResponse` MUST declarar su `request`, cada request de *fixture* SHALL asociarse a una sola respuesta y las `query` (sin espacios en los extremos) de todos esos requests MUST ser distintas, para que el modo `fake` elija sin ambigüedad aunque otros changes añadan pares. Lo verifica `assertFixtureQueriesDistinct()`.

#### Scenario: Cada respuesta fija tiene su pregunta de fixture distinta [US-034 AC-6] [S1 resp. 7]
- **WHEN** `assertFixtureQueriesDistinct()` compara las `query` de todos los requests asociados a una respuesta `RagQueryInternalResponse`
- **THEN** las `query` son distintas entre sí, cada respuesta tiene su `request` y el comando termina con código 0

#### Scenario: Un par nuevo con una pregunta repetida rompe la verificación [US-034 AC-6] [S1 resp. 7]
- **WHEN** un parche añade a `index.json` una tercera respuesta `RagQueryInternalResponse` cuyo `request` tiene la misma `query` que `rag-query-request.json` (o una respuesta `RagQueryInternalResponse` sin `request`)
- **THEN** `assertFixtureQueriesDistinct()` reporta ambos archivos y el comando termina con código distinto de 0

## MODIFIED Requirements

### Requirement: Política de versión del contrato
Ambos specs MUST declarar `info.version` semántico (`MAJOR.MINOR.PATCH`), `1.0.0` al congelar; un cambio incompatible declarado en su change (ADR-26) SHALL subir la *major*; una operación, una respuesta o un código de error nuevos, la *minor*; un cambio solo de texto (descripciones, `message`), la *patch*; y un change que solo añade ejemplos MUST NOT tocar `info.version`. Si dos changes que suben la versión del mismo spec están abiertos a la vez, quien mergea segundo MUST rebasar sobre `main` y conservar el número que tenía asignado.

#### Scenario: La versión es semántica en ambos specs [US-033 AC-1]
- **WHEN** `assertSpecVersions()` revisa ambos specs, y un parche pone `info.version: "v1"` en uno de ellos
- **THEN** los reales declaran un `info.version` semántico `MAJOR.MINOR.PATCH` (tras este change, `1.1.0` en ambos) y el parcheado hace terminar el comando con código distinto de 0 nombrando el spec

#### Scenario: Una operación nueva sube la minor [US-034 AC-1]
- **GIVEN** `main` con ambos specs en `1.0.0` y un change que solo añade una operación (`GET /health`) y sus ejemplos
- **WHEN** se comparan los specs del change con los de `main`
- **THEN** ambos declaran `info.version: 1.1.0` (minor) y no hay cambios incompatibles


### Requirement: Permisos por operación y vista del administrador
Cada operación de `clinical-api` MUST declarar `x-permission` con uno o varios códigos concretos de la matriz de `data-model.md`, sin comodines; `publico` SHALL admitirse solo en el login y en `GET /health` (operación interna del healthcheck que `web` nunca reenvía, US-034). `GET /platform/patients/{patientId}` SHALL responder `oneOf` `PatientSummary` o `PatientAdminSummary` (identificación enmascarada, `lifecycleStatus`, `registeredAt`, sin clínica), atado al permiso con `x-view-by-permission` `[Pre-S1 resp. 24, 27, 29]` (E-04).

#### Scenario: Una operación sin permiso declarado o con un código fuera de la matriz rompe la verificación [US-033 AC-17] [Pre-S1 resp. 29]
- **WHEN** un parche quita `x-permission` de `POST …/follow-ups`, usa un código que no está en la matriz, usa el comodín `ai_analysis:*` o pone `publico` en `GET /platform/patients`
- **THEN** `assertOperationsDeclarePermission()` reporta el hallazgo y el comando termina con código distinto de 0

#### Scenario: publico solo se admite en el login y en el health [US-034 AC-1]
- **WHEN** `assertOperationsDeclarePermission()` revisa el spec real, con `publico` en `POST /platform/auth/login` y en `GET /health`, y un parche pone `publico` en `POST /platform/auth/logout`
- **THEN** el real no produce hallazgos y el parcheado reporta `POST /platform/auth/logout` y hace terminar el comando con código distinto de 0

#### Scenario: La vista de la ficha está atada al permiso [US-033 AC-17] [Pre-S1 resp. 27]
- **WHEN** un parche quita `x-view-by-permission` de `GET /platform/patients/{patientId}` o mapea `default` a `PatientSummary`
- **THEN** `assertViewByPermission()` reporta el hallazgo y el comando termina con código distinto de 0

#### Scenario: El listado y la búsqueda no devuelven la identidad en claro [US-033 AC-17] [Pre-S1 resp. 36 (D-7)] [RN-10]
- **WHEN** se revisa `x-view-by-permission` de `GET /platform/patients` y de `POST /platform/patients/search`
- **THEN** mapean `clinical:read` a `PatientListItem` (los ítems de `PatientPage` son `PatientListItem` o `PatientAdminSummary`) (`fullNameMasked`, `nationalIdMasked`, sin `identification`); el nombre y el documento completos solo están en `PatientSummary.identification`, de la ficha; la búsqueda por nombre tiene a US-048 como dueña

#### Scenario: La vista del administrador no tiene datos clínicos [US-033 AC-15] [Pre-S1 resp. 27]
- **WHEN** se valida `patient-summary-admin.json` y un parche le agrega `diagnosis`
- **THEN** el ejemplo original valida con `nationalIdMasked`, `lifecycleStatus` y `registeredAt`, y el parcheado falla por `additionalProperties: false`
