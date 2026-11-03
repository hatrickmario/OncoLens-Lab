## ADDED Requirements

### Requirement: Metadatos de la fuente estructurada sin invocar al LLM
Cuando el manifiesto trae los metadatos de un documento desde una fuente estructurada, la ingesta MUST copiarlos a `population_criteria` (y a `study_design`, `trial_phase`, `sample_size` y `primary_endpoint` cuando la fuente los publique), con `metadata_source = fuente_estructurada`, y SHALL NOT invocar al LLM de metadatos para ese documento (FR-19, RN-25).

#### Scenario: Un ensayo con criterios de elegibilidad estructurados no invoca al LLM [US-118 AC-1] [FR-19]
- **GIVEN** el manifiesto FX-06c-b con `i-ct-1` (próstata, criterios de elegibilidad estructurados: estadio metastásico, castración resistente, ECOG 0–1), el LLM de metadatos falso con registro de invocaciones y el NLI falso
- **WHEN** se ejecuta la ingesta
- **THEN** `population_criteria` de `i-ct-1` trae los criterios de elegibilidad de la fuente y `metadata_source = fuente_estructurada`
- **AND** el LLM de metadatos falso registra cero invocaciones para `i-ct-1`

### Requirement: Extracción de metadatos verificada campo a campo contra el texto de la fuente
Sin metadatos estructurados de la fuente, la ingesta MUST pedir al LLM local un JSON por esquema y verificar cada valor, verbalizado de forma determinista, con el NLI contra los chunks del documento. Un valor SHALL conservarse solo con `entailment` ≥ `NLI_ENTAILMENT_THRESHOLD` en algún chunk; si no, MUST quedar no disponible (`no_disponible` en `population_criteria`, `null` en los escalares) sin descartar los demás, con `metadata_source = extraido_verificado` (RN-25, ADR-34, RN-12).

#### Scenario: Los metadatos de un ensayo descrito solo en texto se extraen y verifican [US-118 AC-2] [FR-19] [R-16]
- **GIVEN** `i-lit-1` (mama, PMC OA, `cc_by`, ensayo fase III descrito solo en texto, con `study_design: otro` en el manifiesto = la fuente no lo declara), el LLM de metadatos falso de FX-06c-b que devuelve `study_design = eca`, `trial_phase = III`, `sample_size = 500`, estadio "I–III", HER2 "positivo" y un `primary_endpoint` inventado, y el NLI falso en `entailment` para todos salvo el `primary_endpoint`
- **WHEN** se ingiere `i-lit-1`
- **THEN** `i-lit-1` tiene `study_design = eca`, `trial_phase = III`, `sample_size = 500`, `population_criteria.estadio = "I–III"` y HER2 "positivo" en `population_criteria.biomarcadores`
- **AND** `metadata_source = extraido_verificado`

#### Scenario: Un metadato que no pasa el NLI queda no disponible y los demás se conservan [US-118 AC-3] [FR-19] [RN-25]
- **GIVEN** el `primary_endpoint` inventado que el LLM de metadatos falso propone para `i-lit-1` y el NLI falso en `neutral` para él
- **WHEN** se verifica
- **THEN** `primary_endpoint` de `i-lit-1` queda no disponible (`null`) y ningún chunk ni registro de la ingesta conserva el valor inventado
- **AND** `study_design`, `trial_phase`, `sample_size` y los criterios de población verificados de `i-lit-1` se conservan

#### Scenario: Un documento sin datos de población en el texto deja cada criterio no disponible [US-118 AC-4] [FR-19]
- **GIVEN** `i-lit-2` (mama, `cc_by`, sin datos de población en el texto) y el LLM de metadatos falso que no propone ningún criterio de población para él
- **WHEN** se ingiere `i-lit-2`
- **THEN** cada criterio de población de `i-lit-2` (subtipo, estadio, línea, biomarcadores, edad, ECOG) vale `no_disponible`

#### Scenario: Una propuesta del LLM que no cumple el esquema no aporta ningún metadato [US-118 AC-6] [US-118 AC-2] (asumido)
- **GIVEN** `i-lit-1` y el LLM de metadatos falso en modo "JSON inválido para el esquema"
- **WHEN** se ingiere `i-lit-1`
- **THEN** sus criterios de población valen `no_disponible`, `metadata_source = pendiente`, el documento queda `embebido` y el resumen lo cuenta como `metadatos_pendientes`
- **AND** el NLI falso no recibe ningún par para `i-lit-1`

Regresión [RN-25] activa desde S3 (US-127): la ficha de la fuente muestra "No disponible" para cada metadato ausente.

### Requirement: LLM o NLI no disponibles no impiden indexar el documento
Si el LLM de metadatos o el NLI fallan para un documento, la ingesta MUST indexarlo (`status = embebido`, nunca `error`) con los metadatos en no disponible y `metadata_source = pendiente`, nunca `fuente_estructurada` (RN-25, `[S3 resp. 16]`), y el resumen MUST contarlo en `metadatos_pendientes` con etapa y clase del error, sin excepción, prompt, texto ni salida del LLM (asumido).

#### Scenario: Con el LLM de metadatos caído el documento queda embebido y cuenta como metadatos pendientes [US-118 AC-6] (asumido)
- **GIVEN** el LLM de metadatos falso en modo error y `i-lit-1` en el manifiesto
- **WHEN** se ingiere `i-lit-1`
- **THEN** `i-lit-1` queda con `status = embebido`, `is_current = true`, cada criterio de población en `no_disponible` y `metadata_source = pendiente`
- **AND** el resumen de la ingesta cuenta `i-lit-1` en `metadatos_pendientes` y su salida no contiene el texto del documento ni el mensaje del error

#### Scenario: Con el NLI caído no se conserva ningún metadato extraído [US-118 AC-6] [RN-25] (asumido)
- **GIVEN** el NLI falso en modo error y el LLM de metadatos falso de FX-06c-b
- **WHEN** se ingiere `i-lit-1`
- **THEN** `i-lit-1` queda `embebido` con sus criterios de población en `no_disponible`, `trial_phase`, `sample_size` y `primary_endpoint` en `null` y `metadata_source = pendiente`
- **AND** el resumen lo cuenta en `metadatos_pendientes`

### Requirement: El catálogo del corpus admite `metadata_source = pendiente`
La migración Alembic del schema `corpus` MUST ampliar el `CHECK` de `corpus_document.metadata_source` a `fuente_estructurada`, `extraido_verificado` y `pendiente`, y SHALL seguir rechazando cualquier otro valor (data-model §4.6, `[S3 resp. 16]`).

#### Scenario: Tras migrar, el catálogo acepta pendiente y rechaza un valor fuera del dominio [US-118 AC-6] [RN-25] (asumido)
- **GIVEN** el schema `corpus` de test migrado hasta la cabeza de Alembic
- **WHEN** se inserta un `corpus_document` con `metadata_source = pendiente` y otro con `metadata_source = inferido`
- **THEN** el primero se guarda y el segundo falla por `ck_corpus_document_metadata_source`
- **AND** los `CHECK` de la base migrada coinciden con `DOMINIOS_CERRADOS` de `tables.py`

### Requirement: Claves de `population_criteria` alineadas con el `studyKey` del catálogo de aplicabilidad
Las claves y subclaves que la ingesta escribe en `population_criteria` (copia estructurada o extracción verificada) MUST ser las que el catálogo de aplicabilidad nombra en `studyKey` (p. ej. `biomarcadores.her2`); el esquema JSON de la extracción SHALL NOT admitir claves fuera de ese conjunto (FR-19, `[S3 resp. 16]`).

#### Scenario: Todo studyKey del catálogo de test apunta a una clave que la ingesta puede escribir [US-118 AC-2] (asumido)
- **GIVEN** el catálogo de aplicabilidad `test-apl-1.0.0` y el esquema JSON de la extracción de metadatos
- **WHEN** se comprueba la coherencia
- **THEN** cada `studyKey` del catálogo es una clave o subclave que admite el esquema de extracción
- **AND** HER2 "positivo" de `i-lit-1` en FX-06c-b se guarda bajo `population_criteria.biomarcadores.her2`

### Requirement: Muestra reproducible de metadatos extraídos para revisión humana
Al publicar una `CorpusRelease`, la ingesta MUST seleccionar `ceil(N × CORPUS_METADATA_SAMPLE_PCT / 100)` de los N documentos `extraido_verificado` de esa release (leídos del catálogo, incluidos los omitidos de corridas previas), de forma determinista con `CORPUS_METADATA_SAMPLE_SEED`, y SHALL escribir `data/evaluation/corpus-metadatos/<release>.yaml` con cada metadato en `revision = pendiente`. Solo corpus público (TBD-20, RN-14, RN-22).

#### Scenario: De un lote de 20 documentos extraídos al 10 % se seleccionan 2 siempre los mismos [US-118 AC-5] [TBD-20] [FR-19] [M-08.4]
- **GIVEN** un lote sintético de 20 documentos con metadatos `extraido_verificado`, `CORPUS_METADATA_SAMPLE_PCT = 10` y `CORPUS_METADATA_SAMPLE_SEED` fijo
- **WHEN** termina la ingesta
- **THEN** se escribe `data/evaluation/corpus-metadatos/<release>.yaml` con exactamente 2 documentos y cada metadato con `revision = pendiente`
- **AND** al repetir la selección con la misma semilla y los mismos documentos se eligen los mismos 2, en el mismo orden

#### Scenario: Sin documentos extraídos no se escribe muestra [US-118 AC-5] (asumido)
- **GIVEN** una ingesta cuyos documentos son todos `fuente_estructurada` o rechazados
- **WHEN** termina la ingesta
- **THEN** no se escribe ningún archivo en `data/evaluation/corpus-metadatos/` y el resumen indica una muestra de tamaño 0
