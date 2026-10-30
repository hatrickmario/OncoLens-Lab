# Design — l1d-292-poblacion-abanico-ingesta

## Context

`l1d-117-metadatos-poblacion-verificados` (merged; aún sin archivar) deja en `app/application/corpus_metadata/` el
`MetadataExtractionService` (una llamada por documento, un valor por criterio) y reglas en
`app/domain/corpus_metadata/` (`campos.py`, `verbalizacion.py`, `verificacion.py`, `origen.py`). ADR-47 (2026-10-29,
`[S4 resp. 3]`) decide pasar a una tarea por (documento, criterio) con lista acotada. Este change **sustituye la parte de
`population_criteria`** de esa extracción; los escalares (`study_design`, `trial_phase`, `sample_size`,
`primary_endpoint`) siguen con el servicio de US-118. La forma de lista, la marca `pendiente` y la migración 0005 son de US-241
(`l1d-291-poblacion-lista-contrato-migracion`).

## Goals / Non-Goals

**Goals:** orquestador determinista por (documento, criterio); rechazo, NLI, deduplicación y tope como reglas puras;
reintento único; caché por versión; concurrencia acotada; contadores en el resumen; todo valor en configuración.
**Non-Goals:** ver `proposal.md` (extracción doble, revisión humana, respaldo en la consulta, contrato, cálculo de estados).

## Decisions

**D1 · Orquestador en `application/corpus_metadata/population_fanout.py`.** `asyncio.gather` + `asyncio.Semaphore(
POPULATION_EXTRACTION_CONCURRENCY)`. Depende solo de puertos: `LlmClient`, `NliClassifier`, un puerto de recuperación
por documento (`DocumentChunkRetriever`), `Clock` y un puerto de caché sobre el catálogo. Descartada: agente (ADR-47).

**D2 · Una fuente por llamada.** La tarea se construye con `documento_id` + criterio; el recuperador filtra por
documento; el código fija la fuente al guardar, nunca el modelo.

**D3 · Selección de k fragmentos.** Búsqueda existente con la etiqueta del criterio, limitada al documento, unida a las
secciones típicas (Métodos, Elegibilidad, Población); se recortan a `POPULATION_EXTRACTION_TOP_K`.

**D4 · Reglas puras (`app/domain/corpus_metadata/poblacion_abanico.py`).** `rechazar_relleno()` (lista de marcadores
«not found», «no expresado», `none`…), `validar_chunk()` (el `chunkId` pertenece al documento y el valor aparece, como
subcadena normalizada, en el fragmento; si no: `chunk_ajeno`), `verificar_nli()` (verbalización determinista ADR-34 y
`soporta()` con `NLI_ENTAILMENT_THRESHOLD`; sin soporte → `valoresSinSoporte`), `deduplicar()` (valor normalizado con
sinónimos del catálogo; conserva el primero de mayor alcance), `aplicar_tope()` **por fragmento y criterio**: agrupa por
`chunkId` y conserva en cada grupo como máximo `POPULATION_MAX_VALUES_PER_CRITERION` valores (leído de configuración,
nunca el literal 3), en orden elegibilidad, subgrupo, mención y, a igual alcance, el de la salida; los demás suman
`valoresFueraDelTope` y `truncado = true`. Los valores de otros fragmentos del mismo criterio no cuentan para ese tope
(ADR-47: la respuesta une los fragmentos citados sin `maxItems`). El esquema de salida de cada tarea lleva además
`maxItems` = la misma clave; el tope al persistir es la defensa ante un adapter que no respete el esquema. Sin reloj ni
aleatoriedad directos.

**D5 · Salida cortada y reintento único.** `finish_reason = length` → un reintento con otra semilla
(`POPULATION_EXTRACTION_RETRIES = 1`); si también se corta, el criterio se guarda con la marca
`{"status": "pendiente", "values": []}` dentro de `population_criteria` (forma de US-241, D5 de `l1d-291`), los demás se
guardan, el documento queda `embebido` y `finishReasonLength` suma 2 (RN-26: no bloquea). El respaldo de US-244 lee esa
marca por criterio (no `metadata_source`, que es por documento). Una salida inválida nunca descarta lo ya
validado.

**D6 · Caché por versión.** Clave: documento + criterio + `POPULATION_PROMPT_VERSION` + modelo + versión del catálogo.
Acierto → 0 llamadas. Lo registra el catálogo del corpus junto al valor (versiones por valor, forma de US-241).

**D7 · Dependencia de forma (US-241, `l1d-291-poblacion-lista-contrato-migracion`).** La escritura usa la forma de lista
de `population_criteria` y su marca `pendiente`. Si `l1d-291` no está mergeado al empezar, este change se apila sobre su
PR de migración 0005; no se define aquí un esquema paralelo.

**D8 · Sustitución parcial de US-118.** El paso de metadatos de la ingesta delega `population_criteria` a este
orquestador; `MetadataExtractionService` conserva los escalares. Los tests de `l1d-117` cambian solo si su AC cambió
(con `Test-Removal:`).

## Dependencias y colaboradores

- Crea: `application/corpus_metadata/population_fanout.py`, `prompts/poblacion_v1.txt`, `domain/corpus_metadata/poblacion_abanico.py`,
  fakes de FX-06c-c en `tests/support/` (`FakePopulationLlm` con `EXT-*`, recuperador falso por documento, NLI falso).
- Modifica: `IngestionPipelineService` y `reporte.py` (contadores), `CorpusIngestSettings`, `apps/rag-orchestrator/.env.example`
  (valores de US-240), `app/domain/corpus_metadata/campos.py` (claves desde `studyKey` del catálogo vigente).
- Bounded context único: `ai-services`. Sin cambios en `clinical-api` ni `web`.

## Privacidad y ownership

- Solo corpus público con licencia aceptada (RN-21, ADR-36); ningún paciente, ni sintético, en el prompt (RN-13, RN-14).
- Corre en la CLI de `rag-orchestrator` con el rol `rag_corpus` (schema `corpus`) y Milvus; sin acceso a datos clínicos
  ni a `clinical-minio` (RN-10). LLM local, sin *fallback* a la nube (RN-12).
- *Logs* y resumen (regla común l1d-291…294): criterio, `chunkId` (ID del corpus público), `finish_reason`, longitudes y
  contadores; nunca valor, prompt, salida del LLM ni texto de fragmentos (RN-14). Lo verifica un test con `caplog` (1.12).

## Contratos

Sin cambios en `openapi.yaml` ni en `contracts/examples/`: la ingesta es una CLI interna. La forma de lista y su
migración 0005 pertenecen a US-241 (contrato aditivo, ADR-26). oasdiff sin diferencias.

## Evaluación

Cambia **prompt** (nuevo, `poblacion_v1`), la configuración de extracción y el contenido de `population_criteria` del
corpus. `ai-eval-runner` ejecuta la suite `evaluate` (OL-06) en el PR y adjunta el reporte; con adapters falsos no mueve
métricas. La medición con LLM real (precisión y cobertura por criterio, duplicados, `finish_reason=length` = 0) es de
US-233b.

## Risks / Trade-offs

- Carga: 6+ llamadas por documento; la concurrencia se calibra con US-240.
- Solapamiento con `l1d-117` en `population_criteria`; se resuelve con D8.
- Reindexación por versión (AC-7) puede ser costosa; candidata del S5 para un runbook.

## Pendientes de definir

Ninguno bloqueante. (a) Resuelto: el criterio `pendiente` se guarda como `{"status": "pendiente", "values": []}` y el
lector de US-241 lo acepta (D5). Confirmar con el humano: (b) el origen de la lista de criterios (catálogo
`test-apl-1.2.0` en test, el vigente en ejecución).
