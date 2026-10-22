# clinical-catalogs Specification

## Purpose
Define el montaje del catálogo clínico versionado en ambos backends, la comprobación de versión (409 ante una versión distinta) y los tipos de cáncer habilitados, con su respuesta tipo_no_habilitado sin invocar a la IA (RN-20, RN-29).

## Requirements

### Requirement: Catálogo clínico v1 versionado y compartido
`packages/clinical-catalogs` MUST contener `manifest.json` con `version`, `cancerTypes` y `standards`, y por cada tipo habilitado `codigos.json`, `sinonimos.json`, `tendencias.json` (estado `propuesta`) y los archivos con esquema `datos-criticos.json`, `aplicabilidad.json` y `plantillas.json`, todos válidos contra su esquema JSON. Ambos backends SHALL leer la versión efectiva del `manifest.json` montado en `CLINICAL_CATALOG_PATH`, y el análisis persistido MUST registrar esa versión.

#### Scenario: El análisis queda ligado a la versión del catálogo montado [US-041 AC-1] [NFR-14] [ADR-38] [AC-T1.4]
- **GIVEN** `packages/clinical-catalogs` en la versión `1.0.0` montado en ambos backends (`CLINICAL_CATALOG_PATH`, `CLINICAL_CATALOG_VERSION=1.0.0`) y `rag-orchestrator` en modo test con LLM falso
- **WHEN** `doc1@test.local` solicita un análisis sobre el paciente semilla (a)
- **THEN** la respuesta es `200` y el `AIAnalysisRecord` persistido tiene `catalog_version = "1.0.0"`

#### Scenario: Los archivos del catálogo cumplen su esquema [US-041 AC-1] [ADR-29]
- **WHEN** el test recorre `packages/clinical-catalogs`
- **THEN** existen `manifest.json` y, para `mama` y `prostata`, los seis archivos por tipo, cada uno válido contra su esquema en `packages/clinical-catalogs/schemas/`

### Requirement: Versión de catálogo distinta entre backends responde 409 sin invocar a la IA
`rag-orchestrator` MUST comparar `catalogVersion` del request con la versión de su catálogo como primer paso de `/rag/query` y, si difieren, responder `409 CATALOG_VERSION_MISMATCH` sin recuperar ni invocar al LLM; `clinical-api` SHALL responder `409` con `error = CATALOG_VERSION_MISMATCH` y no persistir ningún `AIAnalysisRecord`.

#### Scenario: rag-orchestrator rechaza una versión distinta sin invocar al LLM [US-041 AC-2] [NFR-14] [OL-02]
- **GIVEN** `rag-orchestrator` con el catálogo `1.0.0` y adapters falsos que cuentan invocaciones
- **WHEN** recibe un `RagQueryInternalRequest` con `catalogVersion = "1.0.1"`
- **THEN** responde `409` con `error = CATALOG_VERSION_MISMATCH`, válido contra su spec
- **AND** los adapters de embeddings, Milvus, LLM y NLI registran cero invocaciones

#### Scenario: clinical-api propaga el 409 de catálogo y no persiste el análisis [US-041 AC-2] [NFR-14] [ADR-38]
- **GIVEN** `clinical-api` con el catálogo `1.0.1` y `rag-orchestrator` (simulado desde `rag-catalog-version-mismatch.json`) respondiendo `409`
- **WHEN** `doc1@test.local` solicita un análisis sobre el paciente semilla (a)
- **THEN** la respuesta es `409` con `error = CATALOG_VERSION_MISMATCH`, válida contra el spec de `clinical-api`
- **AND** no existe ningún `AIAnalysisRecord` con ese `trace_id`

### Requirement: Catálogo de solo lectura y cambiable sin reconstruir
El catálogo MUST montarse de solo lectura en ambos backends y la versión informada por `/health` SHALL cambiar con el directorio apuntado por `CLINICAL_CATALOG_PATH`, sin reconstruir la imagen.

#### Scenario: Escribir en el catálogo montado falla [US-041 AC-3] [ADR-38]
- **GIVEN** el contenedor de `clinical-api` en marcha con el Compose del proyecto
- **WHEN** un proceso dentro del contenedor intenta crear un archivo en `CLINICAL_CATALOG_PATH`
- **THEN** la escritura falla con error de sistema de archivos de solo lectura

#### Scenario: Otra versión del catálogo se informa sin reconstruir la imagen [US-041 AC-4] [NFR-14] [RN-22]
- **GIVEN** la misma imagen de `clinical-api` y un directorio de catálogo sintético con `manifest.json` en versión `1.0.1`
- **WHEN** arranca con `CLINICAL_CATALOG_PATH` apuntando a ese directorio
- **THEN** `GET /health` responde `200` con `catalogVersion = "1.0.1"`, válido contra `HealthStatus`

### Requirement: Sin catálogo los backends no quedan listos
Si `CLINICAL_CATALOG_PATH` no contiene un `manifest.json` legible, `clinical-api` y `rag-orchestrator` MUST NOT quedar listos y SHALL registrar el evento único `configuracion_invalida` (US-037) con `variable = CLINICAL_CATALOG_PATH` y `motivo = catalogo_no_disponible`, sin la ruta ni el contenido del catálogo.

#### Scenario: Un directorio inexistente impide arrancar a ambos backends [US-041 AC-5] (asumido)
- **GIVEN** `CLINICAL_CATALOG_PATH` apuntando a un directorio inexistente
- **WHEN** arrancan `clinical-api` y `rag-orchestrator`
- **THEN** ninguno queda listo (`/health` ≠ `200` o el proceso termina con código distinto de 0)
- **AND** el log de cada uno contiene una línea con `event = configuracion_invalida`, `variable = CLINICAL_CATALOG_PATH` y `motivo = catalogo_no_disponible`, y no contiene la ruta ni contenido del catálogo
