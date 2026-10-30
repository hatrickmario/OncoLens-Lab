## ADDED Requirements

### Requirement: Extracción de la población en abanico, una tarea por documento y criterio
La ingesta MUST ejecutar una tarea por cada criterio del catálogo vigente, con como máximo `POPULATION_EXTRACTION_TOP_K` fragmentos del mismo documento, y guardar por criterio una lista con `value`, `chunkId`, `scope`, versiones y `nliResult` (`metadata_source = extraido_verificado`). El prompt MUST NOT incluir datos de pacientes (RN-21, RN-13).

#### Scenario: Seis llamadas por documento y valores guardados con su fragmento [US-242 AC-1] [FR-19] [ADR-47]
- **GIVEN** `doc-e1`, `test-apl-1.2.0` (6 criterios), `POPULATION_EXTRACTION_TOP_K = 2` y `EXT-OK` de FX-06c-c
- **WHEN** se ingiere `doc-e1`
- **THEN** el adapter de extracción registra 6 llamadas (una por criterio), cada prompt lleva como máximo 2 fragmentos y todos de `doc-e1`
- **AND** `population_criteria.estado_menopausico` guarda los dos valores con `chunkId = ch-e1-1`, `scope = elegibilidad`, las versiones de prompt, modelo y catálogo y `nliResult = entailment`, con `metadata_source = extraido_verificado`

### Requirement: Rechazo de valores de relleno y de fragmentos ajenos
La ingesta MUST rechazar los valores de relleno («not found», «no expresado», `none`) y los valores cuyo `chunkId` no exista en el documento, dejando el criterio con lista vacía y contando cada rechazo por motivo (`relleno`, `chunk_ajeno`) en `valoresRechazados` del resumen (RN-04).

#### Scenario: Relleno y fragmento ajeno dejan la lista vacía [US-242 AC-2] [ADR47-R15] [ADR47-R16] [RN-04]
- **GIVEN** `EXT-RELLENO` y `EXT-AJENO` y la ingesta de `doc-e1`
- **WHEN** se ingiere `doc-e1`
- **THEN** `ecog`, `estadio` y `estado_her2` quedan con lista vacía
- **AND** el resumen cuenta `valoresRechazados = 3` (2 `relleno`, 1 `chunk_ajeno`)

### Requirement: Solo se guardan valores con soporte NLI contra su fragmento
Cada valor MUST verificarse con el NLI contra el fragmento que cita y solo se conserva con `entailment` ≥ `NLI_ENTAILMENT_THRESHOLD`; el resto MUST descartarse y contarse en `valoresSinSoporte` (RN-01, RN-25).

#### Scenario: Un valor sin soporte NLI no se guarda [US-242 AC-3] [RN-01] [RN-25]
- **GIVEN** `EXT-NLI` y el NLI falso en `neutral` para `stage I–III` contra `ch-e1-1`
- **WHEN** se verifica el valor
- **THEN** `estadio` queda con lista vacía
- **AND** el resumen cuenta `valoresSinSoporte = 1`

### Requirement: Deduplicación por valor normalizado
Los valores de un criterio que coincidan tras normalizarse con los sinónimos del catálogo MUST guardarse una sola vez (RN-27).

#### Scenario: Duplicados con distinta capitalización quedan en un valor [US-242 AC-4] [RN-27] [S4 resp. 3]
- **GIVEN** `EXT-DUP` (`postmenopausal women` en `ch-e1-1` y `Postmenopausal women` en `ch-e1-3`)
- **WHEN** se normaliza con los sinónimos del catálogo
- **THEN** `estado_menopausico` guarda un valor, `postmenopausal women`, de `ch-e1-1`

### Requirement: Tope de valores por fragmento y criterio con orden determinista
Cada criterio MUST guardar como máximo `POPULATION_MAX_VALUES_PER_CRITERION` valores **por fragmento** (`chunkId`), leído de configuración, en orden `elegibilidad`, `subgrupo`, `mencion` y, a igual alcance, el de la salida; los valores de otros fragmentos del mismo criterio no cuentan para ese tope; si se supera, MUST registrar `truncado = true` y `valoresFueraDelTope` (RN-22, ADR-47).

#### Scenario: Cuatro valores se reducen a tres [US-242 AC-5] [RN-22]
- **GIVEN** `EXT-CUATRO` (4 valores de `linea_tratamiento` en el mismo fragmento: 2 de elegibilidad y 2 menciones) y `POPULATION_MAX_VALUES_PER_CRITERION = 3`
- **WHEN** se guarda `linea_tratamiento`
- **THEN** quedan 3 valores de ese fragmento: los 2 de elegibilidad y la primera mención de la salida
- **AND** se registran `truncado = true` y `valoresFueraDelTope = 1`

### Requirement: Salida cortada con reintento único y criterio pendiente
Si una llamada termina con `finish_reason = length`, la ingesta MUST reintentar una sola vez con otra semilla; si el reintento también se corta, el criterio MUST guardarse con la marca `{"status": "pendiente", "values": []}` en `population_criteria` (forma de US-241), los demás criterios se guardan, el documento queda `embebido` y `finishReasonLength` suma las llamadas cortadas (RN-26).

#### Scenario: El reintento recupera la salida cortada [US-242 AC-6] [ADR47-R4]
- **GIVEN** `EXT-CORTE` (primera llamada truncada, segunda como `EXT-OK`)
- **WHEN** se ingiere el documento
- **THEN** ese criterio tiene exactamente 2 llamadas, la segunda con otra semilla, y sus valores quedan guardados

#### Scenario: Dos cortes dejan el criterio pendiente sin bloquear el documento [US-242 AC-6] [RN-26]
- **GIVEN** `EXT-CORTE-2` (las dos llamadas truncadas)
- **WHEN** se ingiere el documento
- **THEN** ese criterio queda guardado como `{"status": "pendiente", "values": []}` y los demás se guardan
- **AND** el documento queda `embebido` y el resumen cuenta `finishReasonLength = 2`

### Requirement: Caché de la extracción por versión
La ingesta MUST NOT invocar al extractor para un documento y criterio ya extraídos con las mismas versiones de prompt, modelo y catálogo; un cambio de `POPULATION_PROMPT_VERSION` MUST volver a extraer todos los criterios (ADR-47).

#### Scenario: Misma versión 0 llamadas, otra versión 6 [US-242 AC-7] [ADR-47] [ADR47-R8]
- **GIVEN** `doc-e1` ya extraído
- **WHEN** se vuelve a ingerir con las mismas versiones
- **THEN** el adapter registra 0 llamadas
- **AND** al cambiar `POPULATION_PROMPT_VERSION` y reingerir, registra 6 llamadas

### Requirement: Concurrencia acotada y una fuente por llamada
La extracción MUST ejecutarse con a lo sumo `POPULATION_EXTRACTION_CONCURRENCY` llamadas simultáneas y ninguna llamada MUST contener fragmentos de más de un documento (RN-22).

#### Scenario: Doce llamadas, nunca más de dos simultáneas y ninguna mezclada [US-242 AC-8] [RN-22] [ADR47-R16]
- **GIVEN** `doc-e1` y `doc-e2` y `POPULATION_EXTRACTION_CONCURRENCY = 2`
- **WHEN** se ingieren
- **THEN** el adapter registra 12 llamadas y nunca más de 2 simultáneas
- **AND** ninguna llamada lleva fragmentos de los dos documentos

Regresión [RN-21] activa desde S3 (US-059): la ingesta rechaza licencia no aceptada o fuente excluida antes de extraer.
Regresión [RN-25] activa desde S3 (US-127): la ficha de la fuente muestra "No disponible" ante criterios sin valor verificado.
