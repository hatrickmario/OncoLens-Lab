# Spec Delta — clinical-catalogs

## ADDED Requirements

### Requirement: Criterios de aplicabilidad de mama y próstata en el catálogo
La versión de catálogo del S3 MUST traer en `<tipo>/aplicabilidad.json` los criterios de aplicabilidad de mama y próstata; cada criterio SHALL declarar `key`, `destination` (entidad y campo del modelo), `studyKey`, `isExclusionary` y `rule` declarativa con su regla de "Parcial", y cada archivo un bloque `validation` con `scope = ["aplicabilidad"]`, `status = "propuesta_revisada"`, rol del revisor, fecha y `catalogHash` (DEC-11).

#### Scenario: El catálogo del S3 lista los criterios de mama y próstata con destino, excluyente y regla [US-121 AC-1] [FR-25] [AC-08.6] (asumido en las claves)
- **GIVEN** `packages/clinical-catalogs` en la versión de catálogo del S3
- **WHEN** el test lista los criterios de `mama/aplicabilidad.json` y `prostata/aplicabilidad.json`
- **THEN** las claves de mama son exactamente {`estado_her2`, `receptores_hormonales`, `estadio`, `linea_tratamiento`, `estado_menopausico`, `ecog`} y las de próstata exactamente {`estado_castracion`, `extension`, `isup`, `linea_tratamiento`, `ecog`, `hrr_brca`}
- **AND** cada criterio tiene `destination`, `studyKey`, `isExclusionary` y `rule`
- **AND** `estado_her2` y `estado_castracion` tienen `isExclusionary = true` y el resto `isExclusionary = false`
- **AND** cada archivo tiene `validation.scope = ["aplicabilidad"]`, `validation.status = "propuesta_revisada"`, rol del revisor, fecha y un `catalogHash` que `catalog:validate` acepta [US-021 AC-1] `[S3 resp. 16]`

### Requirement: Cada criterio declara la clave del estudio con la que se compara
Cada criterio de `aplicabilidad.json` MUST declarar `studyKey`, la clave de `population_criteria` del estudio con la que se compara (la leen L1D-127 y L1D-117); `catalog:validate` MUST terminar con código distinto de 0 nombrando el criterio si `studyKey` falta, no está entre las claves de población declaradas en el catálogo o se repite en otro criterio del mismo archivo.

#### Scenario: Un criterio sin studyKey invalida el catálogo [US-121 AC-1] [FR-25] `[S3 resp. 16]` (asumido en el mecanismo)
- **GIVEN** una copia de `test-apl-1.0.0` en la que `ecog` no declara `studyKey`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 con el código `study_key_ausente` y el mensaje nombra `ecog`

#### Scenario: Un studyKey que no es clave de población invalida el catálogo [US-121 AC-1] [FR-25] `[S3 resp. 16]` (asumido en el mecanismo)
- **GIVEN** una copia de `test-apl-1.0.0` en la que `ecog.studyKey = "ecog_x"`, que no está en `poblacion.json`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 con el código `study_key_inexistente` y el mensaje nombra `ecog`

#### Scenario: Dos criterios con el mismo studyKey invalidan el catálogo [US-121 AC-1] [FR-25] `[S3 resp. 16]` (asumido en el mecanismo)
- **GIVEN** una copia de `test-apl-1.0.0` en la que `estadio` y `ecog` declaran `studyKey = "estadio"`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 con el código `study_key_duplicada` y el mensaje nombra `estadio` y `ecog`

### Requirement: Los criterios de aplicabilidad no llevan puntaje ni ponderación
`catalog:validate` MUST terminar con código distinto de 0 cuando un criterio de aplicabilidad declara un campo de puntaje o ponderación (`peso`, `score`, `weight`), en cualquier nivel del criterio, nombrando el criterio y el campo (RN-28).

#### Scenario: Un criterio con campo de puntaje invalida el catálogo [US-121 AC-3] [RN-28] (asumido en el mecanismo)
- **GIVEN** tres copias de `test-apl-1.0.0` en las que `ecog` declara `peso`, `score` o `weight`, respectivamente
- **WHEN** se ejecuta `catalog:validate` sobre cada copia
- **THEN** cada ejecución termina con código distinto de 0 y su mensaje nombra `ecog` y el campo prohibido

#### Scenario: El catálogo del S3 pasa la validación sin campos de puntaje [US-121 AC-3] [RN-28]
- **GIVEN** `packages/clinical-catalogs` en la versión de catálogo del S3
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código 0 y ningún criterio de aplicabilidad tiene `peso`, `score` ni `weight`

### Requirement: La regla de cada criterio se lee del catálogo montado
`rag-orchestrator` MUST leer los criterios de aplicabilidad y sus reglas del catálogo montado en `CLINICAL_CATALOG_PATH` al arrancar, de modo que una versión de catálogo con otra regla cambie el estado calculado con la misma imagen y sin desplegar código (RN-22, NFR-14).

#### Scenario: La misma build carga la regla de ecog de cada versión del catálogo montado [US-121 AC-5] [RN-22] [NFR-14] (soporte)
- **GIVEN** la misma build de `rag-orchestrator` con adapters falsos y dos directorios de catálogo, `test-apl-1.0.0` y `test-apl-1.0.1`, idénticos salvo `ecog.rule.limits.max = 0` en `test-apl-1.0.1` (asumido)
- **WHEN** arranca con cada `CLINICAL_CATALOG_PATH` y se piden los criterios de `mama` por el puerto `CriteriosDeAplicabilidad`
- **THEN** con `test-apl-1.0.0` el criterio `ecog` no trae `limits.max = 0` y con `test-apl-1.0.1` sí
- **AND** el resto de criterios es idéntico en ambas cargas

#### Scenario: Cambiar el rango de ecog en el catálogo cambia el estado sin desplegar código [US-121 AC-5] [RN-22] [NFR-14] (test en L1D-127, `[S3 resp. 16]`)
- **GIVEN** la misma build de `rag-orchestrator` con adapters falsos, el paciente A-M1 (ECOG 1) y `doc-a1` (ECOG 0–1)
- **AND** los directorios de catálogo `test-apl-1.0.0` y `test-apl-1.0.1` del escenario anterior
- **WHEN** se calcula la aplicabilidad de `doc-a1` arrancando con cada `CLINICAL_CATALOG_PATH`
- **THEN** con `test-apl-1.0.0` el criterio `ecog` queda `coincide` y con `test-apl-1.0.1` queda `no_coincide`
- **AND** el resto de criterios no cambia de estado

## MODIFIED Requirements

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

#### Scenario: Falta el destino de un criterio del catálogo de aplicabilidad completo [US-121 AC-2] [RN-29] [AC-04.5] `[S3 resp. 16]`
- **GIVEN** una copia de `test-apl-1.0.0` (FX-08b-a), con la forma completa del criterio, en la que `estado_menopausico` no tiene `destination`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 con el código `destino_ausente`
- **AND** el mensaje nombra `estado_menopausico` y no contiene otros valores del catálogo

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

#### Scenario: Con el catálogo de aplicabilidad, una versión distinta en rag-orchestrator sigue dando 409 sin persistir [US-121 AC-4] [NFR-14] [ADR-38]
- **GIVEN** `clinical-api` con el catálogo `test-apl-1.0.0` y `rag-orchestrator` con `test-apl-1.0.1`, ambos con criterios de aplicabilidad cargados y adapters falsos
- **WHEN** `doc1@test.local` solicita un análisis sobre A-M1
- **THEN** la respuesta es `409` con `error = CATALOG_VERSION_MISMATCH`, válida contra el spec de `clinical-api`
- **AND** no existe ningún `AIAnalysisRecord` con ese `trace_id` y el LLM falso registra cero invocaciones
