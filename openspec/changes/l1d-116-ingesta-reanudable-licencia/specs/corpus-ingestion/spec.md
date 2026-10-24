## ADDED Requirements

### Requirement: Ingesta en lote del corpus con dense y sparse
La CLI `python -m app.scripts.ingest --manifest <ruta>` MUST llevar cada documento admisible a `status = embebido` e `is_current = true`, e indexar sus chunks con `dense_vector` y `sparse_vector` poblados, `is_current = true` y los campos denormalizados copiados del documento (FR-19, OL-02). El origen del *sparse* sale de `SPARSE_VECTOR_SOURCE` (ADR-39, RN-22). Corre con el rol `rag_corpus` (SEG-06). En el S3 la entrada es texto; el PDF llega con US-082.

#### Scenario: Los documentos admisibles de FX-06c-b quedan embebidos con dense y sparse [US-117a AC-1] [FR-19] [OL-02] [readme §3.1]
- **GIVEN** el manifiesto FX-06c-b (`tests/fixtures/ingest-manifest.yaml`), el catálogo y la colección vacíos, el adapter de *embeddings* falso determinista (dense y *sparse*) y `EMBEDDING_DIM = 8`
- **WHEN** se ejecuta `python -m app.scripts.ingest --manifest tests/fixtures/ingest-manifest.yaml`
- **THEN** `i-ct-1`, `i-lit-1`, `i-lit-2` e `i-gl-1` quedan con `status = embebido` e `is_current = true`
- **AND** cada uno de sus chunks en `corpus_chunks` tiene `dense_vector` de dimensión 8 y `sparse_vector` con al menos un término, `is_current = true` y los mismos `source_type`, `language`, `cancer_type_tags`, `population`, `study_design` y `published_year` que su documento

#### Scenario: Los criterios de población estructurados se copian y el resto queda no disponible [US-117a AC-1] [FR-19] [RN-25]
- **GIVEN** el manifiesto FX-06c-b, con `i-ct-1` que trae criterios de elegibilidad estructurados e `i-lit-2` sin datos de población
- **WHEN** se ejecuta la ingesta
- **THEN** `i-ct-1` tiene en `population_criteria` los criterios estructurados del manifiesto con `metadata_source = fuente_estructurada`
- **AND** en `i-lit-2` cada criterio de población vale `no_disponible` (la extracción con LLM es de US-118)

Regresión [RN-10] [SEG-06] activa desde S2 (US-040): la ingesta usa el rol `rag_corpus`, cuyo `SELECT` sobre `auth`, `identity`, `clinical`, `audit` y `research` da *permission denied*.

### Requirement: Ingesta reanudable con checkpoint por documento
La ingesta MUST registrar el avance de cada documento en `corpus.corpus_document` (`status` y `checksum`). Al relanzarla con el mismo manifiesto SHALL omitir sin re-embeber los documentos ya `embebido` con el mismo `checksum` y SHALL procesar solo los restantes, reutilizando su fila a medias. Reprocesar un documento MUST reescribir sus chunks, nunca duplicarlos.

#### Scenario: Una ingesta interrumpida tras el segundo documento solo procesa los restantes al relanzarse [US-117a AC-2] [FR-19]
- **GIVEN** el manifiesto FX-06c-b y una primera ejecución interrumpida a la fuerza durante el tercer documento admisible, después de que el segundo quedó `embebido`
- **WHEN** se ejecuta de nuevo la ingesta con el mismo manifiesto
- **THEN** el adapter de *embeddings* falso solo recibe textos de los documentos que no estaban `embebido` en la primera ejecución
- **AND** al terminar, el número de chunks de cada documento en `corpus_chunks` y el número de filas de `corpus.corpus_document` son los mismos que en una ingesta del mismo manifiesto sin interrupción

#### Scenario: Relanzar una ingesta terminada no cambia nada [US-117a AC-2] (asumido)
- **GIVEN** FX-06c-b ya ingerido por completo y los recuentos de documentos y chunks anotados
- **WHEN** se ejecuta de nuevo la ingesta con el mismo manifiesto
- **THEN** los recuentos no cambian, el adapter de *embeddings* falso registra cero invocaciones y el resumen cuenta los documentos ya embebidos como `omitido`

### Requirement: La ingesta rechaza lo que no tiene licencia aceptada o viene de una fuente excluida
La ingesta MUST aplicar las reglas de admisibilidad de la semilla: fuente en `CORPUS_EXCLUDED_SOURCES` → motivo `fuente_excluida` (antes de la licencia); licencia ausente o fuera de `CORPUS_ACCEPTED_LICENSES` → `sin_licencia` o `licencia_no_aceptada` (RN-21, ADR-36). Todo rechazo SHALL quedar `rechazado_licencia`, SHALL NOT generar chunks ni invocar *embeddings*, y el lote SHALL continuar.

#### Scenario: Un documento CC BY-ND y uno de ESMO se rechazan sin detener el lote [US-117a AC-3] [RN-21] [FR-19]
- **GIVEN** el manifiesto FX-06c-b con `i-nd` (`cc_by_nd`) e `i-esmo` (`source_name = "ESMO"`), y `CORPUS_EXCLUDED_SOURCES = ["NCCN", "ESMO"]`
- **WHEN** se ejecuta la ingesta
- **THEN** `i-nd` queda con `status = rechazado_licencia` y motivo `licencia_no_aceptada`, e `i-esmo` con `status = rechazado_licencia` y motivo `fuente_excluida`
- **AND** ningún chunk de `corpus_chunks` tiene el `document_id` de `i-nd` ni el de `i-esmo`, y el adapter de *embeddings* falso no recibió ninguno de sus textos
- **AND** los documentos admisibles del mismo manifiesto quedan `embebido`

### Requirement: Un fallo de un documento no detiene el lote y el resumen cuenta por estado
Si falla una etapa de un documento, ese documento MUST quedar `error`, no vigente y sin chunks vigentes, y el lote SHALL continuar. La CLI MUST imprimir un resumen JSON con resultado y motivo por documento y contadores por estado (`embebido`, `omitido`, `rechazado_licencia`, `error`), y terminar con código ≠ 0 si hubo `error`. El resumen SHALL NOT contener texto de documentos, URLs, credenciales ni mensajes de excepción.

#### Scenario: Un documento cuya normalización falla queda en error y los demás terminan [US-117a AC-4] (asumido)
- **GIVEN** un manifiesto de test con FX-06c-b más `i-roto`, cuyo texto no es UTF-8 válido
- **WHEN** se ejecuta la ingesta
- **THEN** `i-roto` queda con `status = error`, `is_current = false` y sin chunks vigentes, y su resultado en el resumen nombra la etapa `normalizacion` y la clase del error
- **AND** `i-ct-1`, `i-lit-1`, `i-lit-2` e `i-gl-1` quedan `embebido`, e `i-nd` e `i-esmo` `rechazado_licencia`
- **AND** el resumen trae los contadores `embebido = 4`, `rechazado_licencia = 2`, `error = 1`, `omitido = 0`, la CLI termina con código distinto de 0 y su salida no contiene el texto de ningún documento

#### Scenario: Un documento en error se reintenta en la siguiente ingesta [US-117a AC-4] [US-117a AC-2] (asumido)
- **GIVEN** `i-roto` en `error` tras una ingesta y su texto corregido en el manifiesto
- **WHEN** se ejecuta de nuevo la ingesta
- **THEN** `i-roto` queda `embebido` y los demás documentos ya embebidos cuentan como `omitido`
