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
Si `CLINICAL_CATALOG_PATH` no contiene un `manifest.json` legible, `clinical-api` y `rag-orchestrator` MUST NOT quedar listos y SHALL registrar el evento único `configuracion_invalida` (US-037) con `variable = CLINICAL_CATALOG_PATH` y `motivo = catalogo_no_disponible`, sin la ruta ni el contenido del catálogo. Un catálogo legible que no pasa `catalog:validate` MUST dejar no listo a `clinical-api` (ver escenario).

#### Scenario: Un directorio inexistente impide arrancar a ambos backends [US-041 AC-5] (asumido)
- **GIVEN** `CLINICAL_CATALOG_PATH` apuntando a un directorio inexistente
- **WHEN** arrancan `clinical-api` y `rag-orchestrator`
- **THEN** ninguno queda listo (`/health` ≠ `200` o el proceso termina con código distinto de 0)
- **AND** el log de cada uno contiene una línea con `event = configuracion_invalida`, `variable = CLINICAL_CATALOG_PATH` y `motivo = catalogo_no_disponible`, y no contiene la ruta ni contenido del catálogo

#### Scenario: Un catálogo que no pasa la validación deja no listo a clinical-api [US-001 AC-6] `[S3 resp. 5]` (asumido)
- **GIVEN** `CLINICAL_CATALOG_PATH` apuntando a la copia de `test-1.0.0` en la que `ki67` no tiene `destination`
- **WHEN** arranca `clinical-api`
- **THEN** no queda listo (`/health` ≠ `200` o el proceso termina con código distinto de 0)
- **AND** el log contiene `event = configuracion_invalida`, `variable = CLINICAL_CATALOG_PATH`, `motivo = catalogo_invalido` y el código de la regla, y no contiene la ruta ni contenido del catálogo

#### Scenario: El motivo catalogo_invalido registra el código de la regla incumplida [US-037] [US-001 AC-6]
- **GIVEN** un catálogo legible que no pasa `catalog:validate`
- **WHEN** arranca `clinical-api`
- **THEN** no queda listo y registra `configuracion_invalida` con `motivo = catalogo_invalido` y el código de la regla incumplida
- **AND** el log no contiene la ruta ni el contenido del catálogo

### Requirement: Un catálogo válido se acepta con su versión
`catalog:validate` MUST validar el directorio de catálogo indicado contra los esquemas de `packages/clinical-catalogs/schemas/` y las reglas de RN-29 y, si todo pasa, SHALL terminar con código 0 informando la `catalogVersion` del `manifest.json`; solo una versión aceptada puede montarse en CI y en los backends.

#### Scenario: El catálogo de fixture con todos los destinos pasa la validación [US-001 AC-1] [AC-04.5] [RN-29]
- **GIVEN** el catálogo de fixture `test-1.0.0` (FX-04-a), en el que todos los ítems tienen `destination`
- **WHEN** se ejecuta `catalog:validate` sobre ese directorio
- **THEN** termina con código 0
- **AND** informa `catalogVersion = "test-1.0.0"`

### Requirement: Todo ítem del catálogo con destino lo declara
`catalog:validate` MUST terminar con código distinto de 0 y nombrar el ítem cuando un dato crítico, un criterio de aplicabilidad o una regla de supuestos no declara `destination` (RN-29); esa versión no SHALL aceptarse. El mensaje nombra el ítem y no contiene la ruta ni otros valores del catálogo.

#### Scenario: Un dato crítico sin destino invalida el catálogo [US-001 AC-2] [AC-04.5] [RN-29]
- **GIVEN** una copia de `test-1.0.0` en la que el ítem `ki67` no tiene `destination`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0
- **AND** el mensaje nombra `ki67`
- **AND** la versión no se acepta

#### Scenario: Un criterio de aplicabilidad sin destino invalida el catálogo [US-001 AC-3] [AC-04.5] [RN-29]
- **GIVEN** una copia de `test-1.0.0` cuyo `mama/aplicabilidad.json` contiene el criterio `estado_menopausico` sin `destination`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 y el mensaje nombra `estado_menopausico`

### Requirement: El destino de cada ítem existe en el modelo
`catalog:validate` MUST rechazar con `destino_inexistente`, código distinto de 0 y nombrando el ítem, un `destination` cuya entidad, campo o clave de `match` no está en la allowlist derivada del modelo, que solo admite las entidades clínicas `Diagnosis`, `Exam`, `Biomarker`, `PriorTreatment`, `ClinicalAttribute` y `ClinicalEvent` (RN-29, FR-23, RN-10). También MUST rechazar un `ClinicalAttribute.attribute_key` no declarado en el catálogo.

#### Scenario: Un destino a un campo inexistente invalida el catálogo [US-001 AC-4] [RN-29] [FR-23]
- **GIVEN** una copia de `test-1.0.0` en la que el ítem `estado_menopausico` apunta a `Diagnosis.menopause`
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `estado_menopausico`

#### Scenario: Un destino en la identidad del paciente invalida el catálogo [US-001 AC-4] [RN-29] [RN-10] `[S3 resp. 16]`
- **GIVEN** una copia de `test-1.0.0` en la que el ítem `estado_menopausico` apunta a `PatientIdentity.id_type`, campo que existe en el modelo
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 con el código `destino_inexistente` y el mensaje nombra `estado_menopausico`
- **AND** el mensaje no contiene la ruta ni otros valores del catálogo

#### Scenario: Un destino a una clave de ClinicalAttribute no declarada invalida el catálogo [US-001 AC-4] [RN-29]
- **GIVEN** una copia de `test-1.0.0` en la que un ítem apunta a `ClinicalAttribute` con `attribute_key = "menopausia_x"`, que no está declarada en el catálogo
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra el ítem

#### Scenario: Un cambio del modelo que elimina un campo de destino rompe la validación [US-001 AC-4] [RN-29] (asumido)
- **GIVEN** la allowlist regenerada desde un esquema del modelo de test sin el campo `performance_value` de `Diagnosis`
- **WHEN** se ejecuta `catalog:validate` sobre `test-1.0.0`, cuyo ítem `ecog` apunta a ese campo
- **THEN** termina con código distinto de 0 y el mensaje nombra `ecog`

### Requirement: Las reglas condicionales son declarativas y completas
Un ítem condicional MUST declarar `whenConditionUnknown` (`faltante` o `no_aplica`) y su `condition` SHALL referenciar una clave de ítem existente del mismo tipo de cáncer, con un operador declarativo (igualdad, pertenencia o prefijo); `catalog:validate` MUST terminar con código distinto de 0 si no se cumple. El catálogo no admite código ejecutable (AC-04.4).

#### Scenario: Una condición que referencia una clave inexistente invalida el catálogo [US-001 AC-5] (asumido)
- **GIVEN** una copia de `test-1.0.0` en la que `her2_ish.condition.item = "her2_ihc_x"`
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `her2_ish`

#### Scenario: Un ítem condicional sin whenConditionUnknown invalida el catálogo [US-001 AC-5] (asumido)
- **GIVEN** una copia de `test-1.0.0` en la que `her2_ish` tiene `condition` y no declara `whenConditionUnknown`
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `her2_ish`

### Requirement: Contenido de datos críticos del catálogo del S3
La versión de catálogo del S3 MUST traer en `<tipo>/datos-criticos.json` exactamente los ítems de mama y próstata de FR-23, cada uno con `destination` y `estado = "propuesta"` hasta que DEC-01 los revise; `gleason_isup` SHALL apuntar a `Diagnosis.grade` (DEC-05), `tnm` a `Diagnosis.stage_value`, y HER2 IHQ e ISH se distinguen por `Exam.exam_type` en el `match`.

#### Scenario: El catálogo del S3 lista exactamente las claves de datos críticos [US-001 AC-7] [FR-23] [TBD-12] [DEC-05]
- **GIVEN** `packages/clinical-catalogs` en la versión de catálogo del S3
- **WHEN** el test lista las claves de `mama/datos-criticos.json` y `prostata/datos-criticos.json`
- **THEN** mama es exactamente {`histologia`, `grado`, `tnm`, `re`, `rp`, `her2_ihq`, `her2_ish`, `ki67`, `estado_menopausico`, `ecog`, `tratamientos_previos`, `brca_germinal`}
- **AND** próstata es exactamente {`psa_serie`, `gleason_isup`, `tnm`, `sitios_metastasicos`, `estado_castracion`, `tratamientos_previos`, `ecog`, `hrr_brca`}
- **AND** cada ítem tiene `destination` y `estado = "propuesta"`
- **AND** `gleason_isup` apunta a `Diagnosis.grade` y `tnm` a `Diagnosis.stage_value`

#### Scenario: HER2 IHQ e ISH se distinguen por el tipo de examen [US-001 AC-7] `[S3 resp. 5]`
- **GIVEN** la versión de catálogo del S3
- **WHEN** el test lee el `destination` de `her2_ihq` y de `her2_ish`
- **THEN** ambos apuntan a `Biomarker` con el mismo nombre de biomarcador y `match` con valores distintos de `Exam.exam_type`
- **AND** `catalog:validate` termina con código 0 sobre la versión del S3

### Requirement: Integridad de una versión revisada del catálogo
Si un archivo declara el bloque `validation` (`scope` como array con valores `datos_criticos`, `matriz_item_campo` o `aplicabilidad`, `status`, `reviewerRole`, `date`, `catalogHash`), `catalog:validate` MUST recalcular el hash canónico del contenido cubierto por `scope` y terminar con código distinto de 0 si difiere; también MUST rechazar un ítem con `estado` fuera de `propuesta | pendiente | revisado` (AC-04.4, P-03).

#### Scenario: Modificar un ítem de una versión revisada sin versión nueva invalida el catálogo [US-001 AC-8] [AC-04.4] [P-03] (asumido)
- **GIVEN** `test-1.1.0` con `validation.status = "propuesta_revisada"`, `scope = ["datos_criticos", "matriz_item_campo"]` y su `catalogHash`
- **WHEN** se cambia `minValues` de `psa_serie` sin cambiar la versión y se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 por `catalogHash` distinto

#### Scenario: Modificar un criterio de aplicabilidad de una versión revisada invalida el catálogo [US-001 AC-8] [AC-04.4] `[S3 resp. 16]` (asumido)
- **GIVEN** `test-1.1.0` cuyo `mama/aplicabilidad.json` declara `validation.scope = ["aplicabilidad"]` y su `catalogHash`
- **WHEN** se cambia el `destination.field` del criterio `estado_menopausico` sin cambiar la versión y se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 con el código `hash_distinto`

#### Scenario: Un estado de ítem desconocido invalida el catálogo [US-001 AC-8] (asumido)
- **GIVEN** una copia de `test-1.0.0` en la que `ki67.estado = "aprobado"`
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `ki67`
