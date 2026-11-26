# Design — l1d-337-contexto-documento-chunk

## Context

Estado de `main` (leído el 2026-11-22):

- `IngestionPipelineService` (`app/application/corpus_ingestion/ingestion_pipeline_service.py`) fragmenta el texto y
  pasa **los mismos fragmentos** a `PassageEmbedder.embeber`, a `SparsePassageEncoder.codificar` y a
  `chunks_del_documento`, que los guarda como `chunk_text`. No existe hoy un «texto que se embebe» distinto del citable.
- `chunk_id = <document_key>@<checksum[:12]>#<índice>` (`seed_corpus/registros.py`). Lo citan la población extraída
  (ADR-47, `{value, chunkId, scope}`) y los conjuntos dorados de `evaluate`.
- `decidir_version` devuelve `OMITIR` para un documento ya `embebido` con el mismo `checksum`: relanzar `ingest` no
  recalcula vectores.
- Todos los chunks llevan `section = "texto_completo"` (`SECCION_UNICA`): con `CORPUS_CHUNKING_STRATEGY = tamano_fijo`
  no hay secciones reales.
- `/rag/query`, el *reranker*, la generación y el NLI leen `chunk_text` de Milvus (`repository.py`, `bge_reranker.py`,
  `rag_orchestrator_service.py`).
- `ingest reindex-sparse` (US-117b) ya recorre los vigentes por páginas y reescribe un solo vector: es el precedente.
- La suite `evaluate` construye su índice en memoria desde el `corpus.yaml` del dataset
  (`composicion_suite.py`: `embedder_pasajes.embeber([c.texto …])`), no desde Milvus.

## Goals / Non-Goals

**Goals:** una variante de contexto por configuración, con el texto citable intacto; un índice por brazo sin tocar el
vigente; una medición de los tres brazos en la misma corrida; nada adoptado sin reporte.

**Non-Goals:** cambiar el valor por defecto; cambiar el esquema de Milvus o del catálogo; que el *reranker* puntúe el
texto con contexto (🔗 L1D-336); detectar secciones en texto plano.

## Decisions

### D1. El prefijo es una entrada del codificador, no un campo almacenado

`texto_a_embeber(contexto, chunk_text)` se calcula justo antes de `embeber` y `codificar` y no se guarda. `chunk_text`
sigue siendo el fragmento original. Así AC-2 se cumple por construcción: ningún lector de Milvus puede recibir el
prefijo porque no está en ningún campo. Se aplica a *dense* y a *sparse* (la búsqueda híbrida usa el mismo texto).

Descartada en una línea: guardar el texto con contexto en un campo nuevo de `corpus_chunks` (cambia el esquema de
US-058, obliga a recrear la colección y abre la puerta a que alguien lo cite).

### D2. Regla pura del prefijo en `app/domain/corpus_seed/contexto_del_chunk.py`

- `VarianteDeContexto` (`ninguno`, `determinista`, `llm`) y `VARIANTE_INICIAL = ninguno`: **único** lugar del valor
  inicial; `Settings` lo lee de ahí (RN-22).
- `contexto_determinista(metadatos, seccion, max_chars) -> str`: título, tipo de fuente, tipo de cáncer y sección, en
  ese orden, separados por un separador fijo y terminados en una línea en blanco. Sin etiquetas en ningún idioma (el
  corpus es bilingüe). Un valor ausente o vacío se omite; la sección `SECCION_UNICA` se omite (no es un encabezado).
  Nunca escribe «No disponible» (ese centinela es de la UI, RN-25).
- `texto_a_embeber(contexto, chunk_text) -> str`: con contexto vacío devuelve `chunk_text` **tal cual** (AC-3).
- `VERSION_DE_LA_PLANTILLA`: constante que cambia si cambia el formato; entra en el nombre de la colección (D4) y en
  el reporte.
- El recorte a `CORPUS_CHUNK_CONTEXT_MAX_CHARS` corta el título, nunca el resto, y es determinista.

Los metadatos salen del `RegistroDeDocumento` que la ingesta ya construye desde el manifiesto (el mismo que se
escribe en `corpus.corpus_document`), y en la reindexación, del catálogo leído con el rol `rag_corpus`.

### D3. Dónde se aplica

- `IngestionPipelineService._embeber` y `_codificar_sparse` reciben los textos a embeber; `chunks_del_documento`
  sigue recibiendo los fragmentos originales. El servicio recibe por constructor un `ConstructorDeContexto` (puerto de
  aplicación) ya resuelto para la variante: no ramifica por variante dentro del servicio.
- `SeedCorpusLoader` usa el mismo `ConstructorDeContexto` (misma regla, un solo dueño), para que la semilla y la
  ingesta no indexen con variantes distintas.
- `/rag/query` no cambia: la consulta no lleva prefijo.

### D4. Un índice por brazo: colección propia y `ingest reindex-context` (decisión cara de revertir)

Criterios: (a) no tocar el índice vigente ni el catálogo (RN-05); (b) conservar los `chunk_id` (población de ADR-47 y
dorados); (c) los tres índices coexisten para el A/B (§7 del refinamiento); (d) no repetir la extracción de población
con el LLM por cada brazo; (e) sin migración.

| Opción | (a) | (b) | (c) | (d) | (e) | Veredicto |
|---|---|---|---|---|---|---|
| **A. Colección por variante, reindexando desde la de origen** | sí | sí | sí | sí | sí | **Elegida** |
| B. Misma colección, `chunk_id` con sufijo de variante y apagado de los anteriores | no (reescribe `is_current`) | no | no (un solo brazo vigente a la vez) | sí | no (columna de variante en el catálogo) | Descartada: rompe las citas de población y los dorados |
| C. Reingesta completa por brazo con catálogo y colección separados | sí | sí | sí | no (repite metadatos y población) | no (segundo schema o base) | Descartada: cuesta una extracción completa por brazo y toca la frontera de `rag_corpus` |

Con A:

- `ReindexarContexto` (`app/application/corpus_ingestion/reindexar_contexto.py`) lee la colección de origen por
  páginas, pide al catálogo los metadatos de cada `document_id`, recalcula *dense* y *sparse* de los **vigentes** con
  `texto_a_embeber` y escribe en el destino la fila completa con solo los dos vectores sustituidos. Los no vigentes se
  copian tal cual (nunca se recuperan; así el destino conserva el histórico y `NucleoDeVersionado` puede apagarlos o
  reconciliarlos si la variante se adopta).
- Reanudable: antes de procesar una página se descartan los `chunk_id` que ya están en el destino. Eso lo hace también
  idempotente.
- Nunca escribe en el origen ni en el catálogo. Origen y destino iguales → error antes de leer.
- **Origen de la corrida del S7:** la colección de la ingesta de `l1d-119` (la de la corrida base, que no se
  sobrescribe). Es el mismo corpus en la base y en la final (`[S7 resp. 10]`).
- **Variante `llm`:** el documento original no se persiste (los PDF se procesan en memoria), así que la reindexación
  no puede releerlo. El «inicio del documento» que pide D6 sale de los propios chunks vigentes de la colección de
  origen, con la regla `inicio_del_documento()` de D6. Para eso el paginado agrupa por `document_id`: antes de
  generar la frase de un chunk se leen los primeros chunks vigentes de su documento.
- **AC-6 («crea chunks `is_current` nuevos y no borra el histórico»)** se cumple así: los chunks del destino son
  nuevos y vigentes; el origen y sus no vigentes quedan intactos.

### D5. El nombre de la colección identifica la variante

Regla pura `coleccion_de_la_variante(base, variante) -> str` y `exigir_coleccion_de_la_variante(nombre, variante)`:
`ninguno` ↔ nombre sin sufijo de contexto (hoy `corpus_chunks`); las otras ↔ `<base>__ctx_<variante>_v<plantilla>`.
`ingest`, `load_seed_corpus` y `reindex-context` la comprueban al arrancar y fallan nombrando
`CORPUS_CHUNK_CONTEXT` y `MILVUS_COLLECTION_NAME`. No depende de ninguna función de Milvus y se prueba sin él.

Descartadas en una línea: marca en la descripción o en las propiedades de la colección (depende de la versión de
`pymilvus` y Milvus se finge en los tests); columna en `corpus_document` (el catálogo se comparte entre las tres
colecciones).

Consecuencia: si el usuario adopta una variante, el índice de producción pasa a ser la colección de esa variante
(`MILVUS_COLLECTION_NAME`), no una reescritura de `corpus_chunks`. Va en la enmienda de ADR-39 (H-2).

### D6. Variante `llm`

- Puerto `GeneradorDeContextoDeChunk` en `corpus_ingestion/ports.py`: `generar(documento, chunk) -> str | None`;
  `None` = sin frase utilizable, con el motivo (`salida_invalida` | `llm_no_disponible`). No lanza por un fallo del
  LLM. Síncrono, como `ResolutorDeMetadatos` (la CLI lo ejecuta con `asyncio.run`).
- Implementación en `app/application/corpus_ingestion/contexto_llm.py` sobre el `LlmClient` existente
  (`OpenAICompatibleLlmClient` hacia `LLM_BASE_URL`), con su `PROMPT_VERSION` y su esquema de salida
  (`{"contexto": "<una frase>"}`), junto al código de la ingesta como los prompts de `corpus_metadata` (no en
  `app/prompts/`, que es de la generación de `/rag/query`).
- Entrada del LLM: metadatos del catálogo, el inicio del documento hasta `CORPUS_CHUNK_CONTEXT_LLM_DOC_MAX_CHARS` y el
  chunk. El documento entero no cabe en `OLLAMA_CONTEXT_LENGTH = 8192`.
- **De dónde sale «el inicio del documento»:** de una sola regla pura, `inicio_del_documento(chunks_en_orden,
  max_chars)` (en `contexto_del_chunk.py`): los `chunk_text` vigentes del documento, en el orden del índice de su
  `chunk_id`, concatenados y recortados a `CORPUS_CHUNK_CONTEXT_LLM_DOC_MAX_CHARS`. El solapamiento entre chunks
  contiguos queda repetido; no se intenta deshacerlo. La ingesta (`ingest`) la aplica a los fragmentos que acaba de
  producir y la reindexación (`reindex-context`) a los chunks leídos de la colección de origen: la misma entrada en
  los dos caminos, sin depender de un texto del documento que no se guarda. Solo texto de chunks de ese documento,
  ya admitido por licencia (RN-21).
- Validación: JSON con la única clave, texto no vacío, una sola línea, ≤ `CORPUS_CHUNK_CONTEXT_LLM_MAX_CHARS`.
  Inválida → `None`.
- Composición: `llm` = prefijo determinista + frase. El respaldo es entonces el caso «sin frase», no otra rama.
- Guarda de RN-12: `variable_que_incumple_llm_local` (ya existe en `domain/reglas_proveedor.py`), la misma que usa
  `ingest`. El corpus es público, pero la regla del proyecto es local sin *fallback*.
- Concurrencia: lleva su propio límite, `CORPUS_CHUNK_CONTEXT_LLM_CONCURRENCY`; no reutiliza
  `POPULATION_EXTRACTION_CONCURRENCY`, para no acoplar dos calibraciones.
- La frase **no se persiste**: no hay campo donde guardarla sin cambiar el esquema y la variante es solo de medición.
  El brazo `llm` no es reproducible byte a byte; el reporte lo dice. Si se adoptara, persistirla sería una historia
  nueva.
- La frase nunca llega al usuario ni al LLM de generación, así que no pasa por el filtro de RN-23.

### D7. Medición en `evaluate`

- Módulo nuevo `app/evaluation/brazos_contexto.py` (reglas puras, como `brazos_recuperacion.py`): brazo = variante;
  referencia = `ninguno`; `None` = no medible.
- **Un índice por brazo, con dos fuentes según la configuración** (la fuente `indice` de la suite, que añade
  `l1d-336`):
  - **Medición real (`eval/configs/s7-contexto.yaml`, `[S7 resp. 10]`):** cada brazo lee **su colección de Milvus**.
    `ninguno` = la colección de la ingesta de `l1d-119` (la de la corrida base); `determinista` y `llm` = las
    colecciones que `ingest reindex-context` construyó desde ella (D4, D5). La suite no vuelve a embeber el corpus:
    mide exactamente los índices reindexados, y `exigir_coleccion_de_la_variante` rechaza un brazo que apunte a la
    colección de otra variante. Los `chunk_id` coinciden en las tres colecciones, así que las preguntas y sus
    chunks esperados son los mismos en los tres brazos.
  - **CI (`eval/configs/s7-contexto-fake.yaml`):** índice en memoria sobre el dataset sintético de test.
    `composicion_suite.py` calcula `vectores_de_chunks` y los vectores *sparse* con `texto_a_embeber` de D2 (la misma
    función de producción) y los metadatos del `corpus.yaml` del dataset (`titulo`, `cancer`; `source_type` y sección
    si el dataset los trae). El `ChunkSearch` en memoria sigue devolviendo el texto original. Prueba la orquestación
    y la forma del reporte, no la calidad.
- El reporte registra, por brazo, la colección leída, su recuento de chunks vigentes y la variante; y, una vez, la
  colección de origen (`[S7 resp. 10]`).
- **Umbrales (`[S7 resp. 11]`):** los tres brazos corren con los umbrales actuales. Los calibrados entran en la
  corrida final como un brazo más, que aporta `l1d-119`; este change no los mide.
- «Duración de la ingesta y memoria»: en la medición real salen del resumen JSON de cada `reindex-context` (duración,
  recuentos y, en `llm`, chunks con respaldo), que `ai-eval-runner` adjunta al reporte; la colección de `ninguno` no
  se reconstruye y su duración es la de la ingesta de `l1d-119`. En la CI, la suite mide la construcción del índice
  en memoria y la marca de RSS con el reloj inyectado.
- Regla de adopción del reporte: mejora que excluye 0 en el IC pareado **y** p95 de consulta completa ≤
  `p95_evidence_analyses_s` de `eval/configs/metas-iniciales.yaml`. El reporte la evalúa; no cambia nada.
- El p95 de consulta completa de cada brazo se mide sobre esas mismas colecciones.

### D8. Configuración

En `CorpusIngestSettings` (y lo mínimo en los ajustes de la semilla): `CORPUS_CHUNK_CONTEXT`,
`CORPUS_CHUNK_CONTEXT_MAX_CHARS`, `CORPUS_CHUNK_CONTEXT_LLM_MAX_CHARS`, `CORPUS_CHUNK_CONTEXT_LLM_DOC_MAX_CHARS`,
`CORPUS_CHUNK_CONTEXT_LLM_CONCURRENCY`, `CORPUS_CONTEXT_REINDEX_BATCH_SIZE`. Los valores iniciales se declaran una vez
en dominio. No entran en `CLAVES_ADR39` (esas no tienen valor inicial en código y obligarían a `.env.example` antes de
la decisión); pasan a ADR-39 con la enmienda si se adopta.

## Privacidad y ownership

- Todo ocurre dentro de `rag-orchestrator`: schema `corpus` (solo lectura del catálogo en la reindexación, con el rol
  `rag_corpus`) y Milvus. Ningún dato cruza hacia `clinical-api` ni desde él; no hay datos de pacientes, identidad ni
  `clinical-minio`. RN-10 y RN-11 no aplican: el corpus es público.
- El LLM de la variante `llm` recibe solo texto de documentos admitidos por licencia (RN-21) y es local por código
  (RN-12), sin *fallback* a la nube.
- NCCN y ESMO: el prefijo sale del catálogo de documentos admitidos; no introduce contenido de fuentes excluidas.
- *Logs* y resúmenes: solo variante, versiones, recuentos, duración, etapa y clase de error. Nunca prefijos, frases
  del LLM, texto de chunks ni URLs.
- Permisos: no se añade ningún privilegio; no hay DDL ni migración.

## Contratos

Sin cambios. `apps/rag-orchestrator/openapi.yaml`, `apps/clinical-api/openapi.yaml`, `contracts/examples/` y lo
generado no se tocan; `oasdiff` no aplica; compatible con ADR-26. La variante no se expone en `meta` de `/rag/query`:
es una propiedad del índice, trazada por el nombre de la colección y por el reporte.

## Dependencias y colaboradores

| Módulo | Estado | Depende de |
|---|---|---|
| `domain/corpus_seed/contexto_del_chunk.py` | nuevo | nada (regla pura) |
| `application/corpus_ingestion/ports.py` | modificado | añade `ConstructorDeContexto`, `GeneradorDeContextoDeChunk`, `AlmacenDeReindexacionDeContexto` |
| `application/corpus_ingestion/contexto_llm.py` | nuevo | puerto `LlmClient` |
| `application/corpus_ingestion/reindexar_contexto.py` | nuevo | puertos del almacén, `PassageEmbedder`, `SparsePassageEncoder`, `ConstructorDeContexto`, lector del catálogo |
| `application/corpus_ingestion/ingestion_pipeline_service.py` | modificado | `ConstructorDeContexto` por constructor |
| `application/seed_corpus/seed_corpus_loader.py` | modificado | ídem |
| `infrastructure/milvus/repository.py` | modificado | implementa `AlmacenDeReindexacionDeContexto` |
| `scripts/ingest.py`, `scripts/load_seed_corpus.py` | modificados | raíz de composición y guarda de D5 |
| `config/settings.py` | modificado | constantes de dominio |
| `evaluation/brazos_contexto.py`, `composicion_suite.py`, armado del reporte | nuevo / modificados | `texto_a_embeber` de dominio; fuente `indice` de la suite (`l1d-336`) |

Reglas extraídas a funciones con nombre: `contexto_determinista()` (RN-25), `texto_a_embeber()` (RN-04),
`inicio_del_documento()` (RN-21),
`exigir_coleccion_de_la_variante()` (RN-22), `validar_frase_de_contexto()` (RN-21).

Fakes que se tocan y su test de contrato:

- `PassageEmbedder` y `SparsePassageEncoder` falsos: sin cambio de contrato; los tests registran el texto recibido.
- Almacén vectorial falso de los tests de ingesta: gana las operaciones de `AlmacenDeReindexacionDeContexto`; pasa el
  mismo test de contrato que `MilvusRepository` (paginado sin repetir ni omitir, `lote` fuera de rango → `ValueError`,
  ids presentes, escritura completa).
- `GeneradorDeContextoDeChunk` falso (determinista, guionado): mismo test de contrato que la implementación sobre el
  `LlmClient` falso: `None` ≠ cadena vacía, nunca lanza por un fallo del LLM.

## Evaluación

Cambia el corpus indexado: dispara `eval-required` y la suite con LLM real. Métricas de OL-06 afectadas: recall@10
(total y es→en), MRR, «sin evidencia» (falsos «sin evidencia» y preguntas sin respuesta), p95 de consulta completa.
Se vigilan sin esperar cambio, porque el texto citable no cambia: precisión de citas y fidelidad. Reporte versionado
en `reports/eval/` producido por `run-ai-eval`; ninguna cifra fuera de él. La variante `llm` se mide **después** de la
determinista y solo como brazo.

## Risks / Trade-offs

- [El prefijo repetido acerca entre sí los chunks del mismo documento y puede empeorar el orden dentro de un
  documento] → es justo lo que mide el A/B; por defecto sigue `ninguno`.
- [Tres colecciones en la máquina de 32 GB] → una reindexación a la vez, comprobación de disco del §7 del
  refinamiento, y las colecciones de brazo se borran al cerrar la decisión (tarea humana).
- [La variante `llm` cuesta una llamada por chunk] → reanudable, con concurrencia acotada, y se corre al final.
- [Sin secciones reales, el prefijo determinista es hoy título + tipo de fuente + tipo de cáncer] → ver «Pendiente de
  definir».
- [Solape con `l1d-336-reranker-ventanas-chunk` y `l1d-335` en `settings.py`, la suite y `eval-trigger-paths.yaml`] →
  este change va el último de la cadena (`l1d-334` → `l1d-329` → `l1d-331` → `l1d-336` → `l1d-335` → este) y rebasa
  sobre `l1d-335`.
- [La variante `llm` de la reindexación ve el inicio del documento reconstruido desde los chunks, con el solapamiento
  repetido] → es la misma entrada que en la ingesta (D6); el brazo sigue sin ser reproducible byte a byte.
- [El dataset de pares de US-276 aún no existe] → la tarea de la configuración real depende de `l1d-334`.

## Migration Plan

Sin migración. Por defecto nada cambia. Para medir: crear la colección de la variante (`init_corpus_store` con
`MILVUS_COLLECTION_NAME`), `ingest reindex-context`, y apuntar `MILVUS_COLLECTION_NAME` al brazo. Vuelta atrás:
restaurar `CORPUS_CHUNK_CONTEXT = ninguno` y el nombre de colección original; el índice de origen nunca se tocó.

## Pendiente de definir

1. **Sección del chunk (afecta a AC-1; dueño: usuario).** Hoy todos los chunks tienen `section = texto_completo`.
   Este change usa la sección cuando existe y la omite cuando no. Detectar encabezados en el texto plano (por
   ejemplo, las líneas «Title», «Eligibility» de los registros de ClinicalTrials.gov) queda fuera; si se quiere
   dentro, es alcance nuevo (heurística por fuente y sus tests).
2. **Ruta y formato de los pares de paráfrasis (dueño: `l1d-334`).** `s7-contexto.yaml` apunta al dataset que ese
   change fije.
3. **Valor por defecto y enmienda de ADR-39 (dueño: usuario, tras la corrida final).** Incluye qué colección queda
   como índice de producción (D5) y si el *reranker* debe ver el contexto (🔗 L1D-336).

## Notas de la implementación (secciones 1 y 2)

Lo que se concretó o se desvió de lo descrito arriba; el código manda sobre esta lista.

- **D2 (valores iniciales):** `CORPUS_CHUNK_CONTEXT_MAX_CHARS` 300, `_LLM_MAX_CHARS` 300, `_LLM_DOC_MAX_CHARS` 4000 (≈ 1000 tokens: con el
  chunk de 1024 y el prompt cabe en `OLLAMA_CONTEXT_LENGTH = 8192`), `_LLM_CONCURRENCY` 4 y `CORPUS_CONTEXT_REINDEX_BATCH_SIZE` 64, todos en
  `domain/corpus_seed/contexto_del_chunk.py`. Formato del prefijo: `título | tipo de fuente | tipo de cáncer | sección` y una línea en blanco;
  las etiquetas de cáncer del catálogo (`mama,prostata`) salen como `mama, prostata`. `VERSION_DE_LA_PLANTILLA = 1`.
- **D6 (puerto del generador):** `generar` devuelve `FraseDeContexto(frase, motivo)` y no `str | None`: el motivo (`salida_invalida` |
  `llm_no_disponible`) tiene que llegar al resumen y `None` solo no lo lleva. Contrato igual: una cadena vacía nunca es una frase y nunca lanza
  por un fallo del LLM. El constructor `ConstructorDeContexto.textos_a_embeber(metadatos, fragmentos, secciones, pendientes)` recibe los
  fragmentos de UN documento y los índices pedidos (`pendientes`): la reindexación reanudada solo llama al LLM por los que faltan, pero el
  «inicio del documento» sale siempre de todos los fragmentos vigentes.
- **D4 (reindexación):** el catálogo entra por `LectorDePoblacionDelCorpus` (sin ningún método de escritura); un chunk vigente cuyo documento no
  está vigente en el catálogo se reindexa sin contexto y se cuenta en `vigentes_sin_registro` (RN-25: no se inventa). Los chunks de un documento
  se agrupan por `document_id` contiguo en el orden de la lectura (`chunk_id` = `<document_id>#<n>`). La CLI abre el origen con
  `MilvusRepository.abrir_existente()` (nunca lo crea) y crea el destino si no existe, como `ingest`.
- **Tests con servicios reales:** los de integración de la reindexación corren sobre memoria y, donde existe el Compose de test
  (`integration-rag`), sobre el PostgreSQL `corpus` y el Milvus reales como origen (`fabrica_de_montaje`); el contrato del puerto
  `AlmacenDeReindexacionDeContexto` lo cumplen igual el almacén falso y `MilvusRepository` (caso `milvus` con `servicios_reales`). Nada de eso
  se pudo ejecutar contra Milvus real en el desarrollo local.
- **1.12 (humo del subcomando):** `python -m tests.support.reindex_contexto_cli` ejecuta `ingest.main` en un proceso aparte con los adapters
  falsos inyectados (el subcomando real no tiene un modo falso por entorno, y no se añadió uno al código de producción).
- **D7 (suite):** el brazo de contexto es un `Brazo` con `CORPUS_CHUNK_CONTEXT`; la referencia sigue siendo `A0` y declara `ninguno`. La mejora
  que decide la regla de adopción es el recall@10 total (diferencia pareada por pregunta, IC 95 % por bootstrap con la semilla de la
  configuración); el MRR se informa. `mejora_fuera_del_ruido: null` (con el motivo `no_medible`) cuando falta el intervalo o el p95. En la corrida real la duración
  de la construcción del índice y los chunks con respaldo salen de `--resumenes-de-contexto <json>` (`{brazo: resumen de reindex-context}`, validado
  contra la variante de cada brazo); la memoria sale de `--memoria-del-stack` (ya existente). Una colección de brazo que no corresponde a su variante
  aborta la corrida; un brazo de contexto con colección propia SÍ consume la población (los `chunk_id` no cambian), a diferencia del brazo de 512 tokens.
- **Prefijo del brazo en memoria (CI):** omite el tipo de fuente porque `DocumentoCorpus` del dataset no lo trae (solo título y cáncer); la forma del
  informe no cambia y la calidad no se mide ahí. `reindex-sparse` rechaza una colección con marca de contexto (Gate 2).
- **Veredicto de adopción (Gate 2, lote R2; H-2):** **Decidido (usuario, 2026-11-26): opción B.** La adopción del contexto exige en el
  código la misma regla que los brazos de L1D-335: el informe calcula `adoptable` con `decidir_adopcion`
  (`app/evaluation/adopcion_del_brazo.py`) y un brazo NO es adoptable si (a) retrocede en recall o MRR por la tolerancia de retroceso,
  (b) aumenta los falsos «sin evidencia» por esa misma tolerancia o (c) su viabilidad es `no_viable` frente a los topes de ADR-39. Una
  medición ausente da `adoptable: null` con su motivo (null ≠ 0.0), nunca `true`. Se mantiene la regla propia del contexto
  (`mejora_fuera_del_ruido`: IC pareado del recall@10 que excluye 0; p95 de consulta completa ≤ `p95_evidence_analyses_s`), que sigue
  informándose por separado; `adoptable` es verdadero solo si se cumplen la regla de contexto y `decidir_adopcion`. Sigue siendo una
  señal del informe: adoptar lo decide el usuario (H-2). Alternativas descartadas: **A** (dejarlo como está: permitiría marcar como
  cumplidor a un brazo con retrocesos o fuera de los topes de memoria, contra ADR-45) y **C** (exigirlo solo en la decisión humana de
  H-2: dejaría dos reglas de adopción distintas en el código del mismo sprint). Trabajo: el armado de la comparación calcula hoy
  retroceso, falsos «sin evidencia» y viabilidad para los brazos de contexto, pero solo llama a `decidir_adopcion` para los brazos
  de pares o reescritura; la sección 6 de `tasks.md` lo extiende.
- **RN-22:** `corpus_metadata_llm_temperature` pasó de `CorpusIngestSettings` a `AjustesDeContextoLlm` (mismo nombre, valor y variable de entorno)
  para que la reindexación `llm` use la misma temperatura; no se añade ninguna variable a `.env.example` ni a Compose más allá del bloque de H-1.
