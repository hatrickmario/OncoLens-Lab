## ADDED Requirements

### Requirement: Carga de la semilla solo con documentos de licencia aceptada
El cargador `python -m app.scripts.load_seed_corpus` MUST cargar cada documento admisible del manifiesto de `CORPUS_SEED_MANIFEST_PATH` con `status = embebido` e `is_current = true`, y sus chunks vigentes con los metadatos denormalizados copiados del documento. La admisibilidad SHALL evaluarse por documento con la licencia del manifiesto, nunca inferida de la revista (ADR-36, RN-21).

#### Scenario: La semilla real queda embebida y vigente [US-059 AC-1] [AC-06.1] [OL-02] [FR-19] [RN-21]
- **GIVEN** el manifiesto real `data/raw/seed/manifest.yaml` (~10 documentos de mama y próstata de NCI PDQ y PMC OA con licencia `dominio_publico`, `cc_by` o `cc_by_sa` verificada uno a uno), los *embeddings* y `EMBEDDING_DIM` fijados por ADR-39 y el catálogo y la colección vacíos
- **WHEN** se ejecuta `python -m app.scripts.load_seed_corpus`
- **THEN** cada documento del manifiesto queda con `status = embebido` e `is_current = true`
- **AND** cada uno de sus chunks está en `corpus_chunks` con `is_current = true` y los mismos `source_type`, `language` y `cancer_type_tags` que su documento

### Requirement: CorpusRelease de la semilla con fecha de corte y fuentes excluidas
Al terminar una carga que cambie el conjunto de documentos vigentes, el cargador MUST publicar un `CorpusRelease` con `cutoff_date` de `CORPUS_CUTOFF_DATE`, `excluded_sources` de `CORPUS_EXCLUDED_SOURCES` y una fila de `corpus_release_document` por documento vigente (RN-22, D-09).

#### Scenario: La carga de la semilla real publica un CorpusRelease con NCCN y ESMO excluidas [US-059 AC-1] [OL-02] [FR-19] [D-09]
- **GIVEN** el manifiesto real `data/raw/seed/manifest.yaml`, `CORPUS_EXCLUDED_SOURCES = ["NCCN", "ESMO"]` y el catálogo vacío
- **WHEN** se ejecuta `python -m app.scripts.load_seed_corpus`
- **THEN** existe un `CorpusRelease` con `cutoff_date = CORPUS_CUTOFF_DATE`, `excluded_sources = ["NCCN", "ESMO"]` y exactamente una fila de `corpus_release_document` por documento cargado

### Requirement: Rechazo de documentos con licencia no aceptada o ausente
Un documento cuya licencia esté ausente o no pertenezca a `CORPUS_ACCEPTED_LICENSES` MUST quedar con `status = rechazado_licencia`, SHALL NOT generar ningún chunk en Milvus ni entrar en el `CorpusRelease`, y el cargador SHALL continuar con el resto del manifiesto (RN-21, FR-19). Una licencia ND no existe como `license_class` y se rechaza siempre.

#### Scenario: Un documento CC BY-ND y uno sin licencia se rechazan sin detener la carga [US-059 AC-2] [RN-21] [FR-19]
- **GIVEN** el manifiesto FX-06c-a con `t-nd` (licencia `CC BY-ND`), `t-sin-licencia` (sin licencia) y `t-ok-1`, el adapter de *embeddings* falso determinista y `EMBEDDING_DIM = 8`
- **WHEN** se ejecuta el cargador sobre ese manifiesto
- **THEN** `t-nd` y `t-sin-licencia` quedan con `status = rechazado_licencia` y el reporte de la carga los lista con motivo `licencia_no_aceptada` y `sin_licencia`
- **AND** ningún chunk de `corpus_chunks` tiene el `document_id` de `t-nd` ni el de `t-sin-licencia`, y ninguno de los dos está en `corpus_release_document`
- **AND** `t-ok-1` queda con `status = embebido`

### Requirement: Rechazo de fuentes excluidas aunque declaren licencia
Un documento cuyo `source_name` pertenezca a `CORPUS_EXCLUDED_SOURCES` MUST rechazarse con motivo `fuente_excluida` antes de evaluar su licencia, aunque declare una licencia aceptada, y SHALL NOT generar chunks (RN-21, D-09). La exclusión se compara sin distinguir mayúsculas ni espacios de los extremos.

#### Scenario: Un documento de NCCN con licencia declarada se rechaza por fuente excluida [US-059 AC-3] [RN-21] [D-09]
- **GIVEN** el manifiesto FX-06c-a con `t-nccn` (`source_name = "NCCN"`, texto sintético, licencia declarada `dominio_publico`) y `CORPUS_EXCLUDED_SOURCES = ["NCCN", "ESMO"]`
- **WHEN** se ejecuta el cargador
- **THEN** el reporte de la carga lista `t-nccn` como rechazado con motivo `fuente_excluida`
- **AND** `t-nccn` queda con `status = rechazado_licencia`, sin chunks en `corpus_chunks` y fuera de `corpus_release_document`

### Requirement: Criterios de población desde la fuente estructurada o no disponibles
El cargador MUST copiar a `population_criteria` los criterios que el manifiesto trae de una fuente estructurada, con `metadata_source = fuente_estructurada`, y SHALL registrar cada criterio de población no publicado en forma estructurada como `no_disponible`; en el S1 no hay extracción con LLM y ningún criterio SHALL inferirse del texto (FR-19, RN-25).

#### Scenario: Un documento con criterios estructurados los conserva y uno sin ellos queda no_disponible [US-059 AC-4] [FR-19] [RN-25]
- **GIVEN** el manifiesto FX-06c-a con `t-ok-1` (mama, NCI PDQ, sin `population_criteria` estructurados) y `t-ok-2` (próstata, con `estadio: metastasico` y `linea: primera` estructurados)
- **WHEN** se ejecuta el cargador
- **THEN** `t-ok-2` tiene `population_criteria.estadio = metastasico`, `population_criteria.linea = primera` y `metadata_source = fuente_estructurada`
- **AND** en `t-ok-1` cada criterio de población (subtipo, estadio, línea, biomarcadores, edad, ECOG) vale `no_disponible`

### Requirement: Recarga idempotente por checksum
Volver a ejecutar el cargador con el mismo manifiesto MUST dejar sin cambios el número de documentos de `corpus.corpus_document` y el de chunks de `corpus_chunks`: un documento cuyo `checksum` ya existe en su `version_group_id` SHALL omitirse sin reinsertar ni re-embeber (asumido, aceptado `[S1 resp. 3]`). Al omitirlo, el cargador MUST reconciliar Milvus con el catálogo: apagar los chunks de versiones no embebidas del grupo y encender los de la versión vigente del catálogo (M1). Una versión reemplazada puede reingresar si el grupo queda sin vigente (M2, aceptado). Las revistas de ESMO (ESMO Open, Annals of Oncology) MUST rechazarse como fuente excluida por nombre, host o DOI (P1).

#### Scenario: Una segunda carga con el mismo manifiesto no cambia los recuentos [US-059 AC-5] [S1 resp. 3]
- **GIVEN** la semilla de FX-06c-a ya cargada y el recuento de documentos y de chunks anotado
- **WHEN** se ejecuta de nuevo el cargador con el mismo manifiesto
- **THEN** el número de filas de `corpus.corpus_document` y el de entidades de `corpus_chunks` son los mismos que antes
- **AND** el adapter de *embeddings* falso registra cero invocaciones en la segunda carga

### Requirement: Una versión nueva no borra el histórico
Cuando llega un documento con el mismo `version_group_id` que uno vigente y distinto `checksum`, el cargador MUST insertarlo como nueva fila con `is_current = true`, marcar la versión anterior con `is_current = false` y `superseded_at` (reloj inyectado), marcar sus chunks con `is_current = false`, y SHALL NOT borrar ninguna fila ni ningún chunk (RN-05, ADR-5).

#### Scenario: La versión 2 de un documento lo reemplaza como vigente sin borrar la versión 1 [US-059 AC-6] [RN-05] [ADR-5]
- **GIVEN** `t-ok-1` cargado y vigente, y el reloj de test congelado
- **WHEN** se carga `t-ok-1-v2` (mismo `version_group_id`, contenido y `checksum` distintos)
- **THEN** `t-ok-1-v2` queda con `is_current = true` y `status = embebido`
- **AND** `t-ok-1` queda con `is_current = false` y `superseded_at` igual a la hora del reloj congelado, y todos sus chunks tienen `is_current = false`
- **AND** el número de filas de `corpus.corpus_document` aumentó exactamente en 1 y los chunks de `t-ok-1` siguen existiendo en `corpus_chunks`

### Requirement: Un rechazo retira la versión vigente del grupo
Un documento rechazado por licencia o fuente excluida MUST retirar la versión `embebido` y vigente de su grupo (`version_group_id`) sin borrar nada, y si no puede retirarla su resultado SHALL ser `error`, no `rechazado` (RN-21, RN-05; decidido por el usuario, 2026-10-20).

#### Scenario: Un documento embebido que vuelve con CC BY-ND deja su grupo sin versión vigente [US-059] [RN-21] [RN-05]
- **GIVEN** `t-ok-1` cargado, `embebido` y vigente, y el reloj de test congelado
- **WHEN** el manifiesto trae el mismo documento (mismo `version_group_id`) con licencia `CC BY-ND 4.0` o con su fuente en `CORPUS_EXCLUDED_SOURCES`
- **THEN** el reporte lo marca `rechazado` con `retirada_de_vigente = true`
- **AND** la versión anterior queda con `is_current = false` y `superseded_at` igual a la hora del reloj, ninguno de sus chunks de `corpus_chunks` es vigente y todos siguen existiendo
- **AND** el número de filas de `corpus.corpus_document` solo aumenta (la fila del rechazo) y se publica una `CorpusRelease` nueva que no incluye la versión retirada

#### Scenario: Si apagar la versión vigente falla el resultado es error y nada cambia [US-059] [RN-05]
- **GIVEN** `t-ok-1` cargado y vigente, y Milvus caído al apagar chunks
- **WHEN** el mismo documento vuelve rechazado
- **THEN** el reporte lo marca `error` (no `rechazado`), la versión sigue vigente en el catálogo y no se escribe la fila de rechazo

#### Scenario: Un documento retirado que vuelve con el mismo texto y la licencia corregida queda vigente [US-059] [RN-21] [RN-05]
- **GIVEN** `t-ok-1` retirado por un rechazo (sin versión vigente en su grupo)
- **WHEN** el manifiesto trae el mismo texto con una licencia aceptada
- **THEN** `t-ok-1` vuelve a `is_current = true` con `superseded_at` nulo, sus chunks son vigentes y la `CorpusRelease` nueva lo incluye
