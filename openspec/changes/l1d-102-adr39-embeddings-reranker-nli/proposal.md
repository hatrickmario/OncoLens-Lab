# Proposal — l1d-102-adr39-embeddings-reranker-nli

## Trazabilidad

L1D-102 · US-012 · ADR-39 fase A · FEAT-06a (L1D-16) · Sprint 1 (inicio) · Estimación **8** (excepción de tamaño, `[S1 resp. 38]`; era 5) ·
IA-01, NFR-01, NFR-05, TBD-01 · SUP-2 · G-3, G-5, G-6 · RN-13, RN-14, RN-21, RN-22 ·
ADR-5, ADR-10 (readme §3.3, §6.1) · US-012 AC-1, AC-2, AC-3, AC-4, AC-5, AC-9, AC-10, AC-11, AC-12, AC-13 ·
Decidido (usuario, 2026-10-13): `[S1 resp. 3]` (supuestos "(asumido)" aceptados), `[S1 resp. 5]`
(hipótesis A con respaldos B y C medidos), `[S1 resp. 6]` (partida en fase A y fase B; AC-6/7/8
originales pasan a US-224) · `[S1 resp. 10]` (presupuesto de ~16 GB para el LLM, que fija el margen
del resto del stack; **ampliado el 2026-10-20 a un tope de 21 GB para el LLM y 30 GB para el stack**, con el *reranker* bge-reranker-v2-m3) · `[S1 resp. 38]` (las pruebas de *chunking*, solapamiento, estrategia e índice, T2–T5, amplían US-012: 5 → 8) · `[S1 resp. 39]` (ClinicalTrials.gov utilizable con atribución a NLM) · Fuente: `backlog/features/FEAT-06a-analisis-walking-skeleton.md` §US-012,
`backlog/sprints/S1-refinamiento.md` §2 y §5, `backlog/02-adrs.md` §US-012.

## Why

Cambiar el modelo de *embeddings* obliga a reindexar Milvus, y la recuperación del walking skeleton
(US-055), la colección final (US-058) y la indexación del corpus semilla (US-059) necesitan un
modelo, una dimensión dense (`EMBEDDING_DIM`) y un origen del vector sparse fijos **antes** de
indexar. Hoy solo hay una hipótesis (combinación A, `[S1 resp. 5]`) sacada de una investigación
externa **sin latencias medidas en CPU**; la elección debe salir de cifras medidas con un protocolo
fijo, no de la hipótesis.

## What Changes

- **Nuevo** `docs/architecture/adr/ADR-39-modelos-locales.md` (plantilla MADR
  `docs/architecture/adr/_plantilla-madr.md`) con la **fase A**: por candidato de *embeddings*,
  *reranker* y NLI (A, B, C de la tabla de US-012) memoria residente, latencia p95 de su etapa en
  CPU, licencia, versión exacta (revisión del repositorio de origen) y métrica principal
  (recall@10 y MRR total y español → inglés; exactitud NLI sobre pares etiquetados), descartes con
  motivo y cifra, desempates por menor memoria, presupuesto de memoria y de p95 por etapa, y el
  modelo, `EMBEDDING_DIM` y origen del sparse elegidos. Deja la sección de la **fase B** como
  marcador para el change de L1D-274 (US-224). Se añade al índice `docs/architecture/adr/README.md`.
- **Nuevo** mini-dataset sintético `data/eval/adr39-mini/` (entregado en `main`, PR #21: 75 preguntas con ≥ 10 en español contra fuentes en inglés, etiquetadas con
  documento y cita literal; 39 pares afirmación–fragmento para NLI; 27 fuentes de NCI, PMC CC BY y
  ClinicalTrials.gov) con manifiesto `clase: sintetico` y licencia por fuente; lo reutiliza US-072.
- **Nuevo** (`[S1 resp. 38]`) protocolo acotado de **tamaño de chunk, solapamiento, estrategia de
  *chunking* e índice (T2–T5)** sobre el modelo de *embeddings* elegido y el mini-dataset: una prueba por
  factor con los demás fijos, en secuencia, con acierto por documento y cita (AC-10 a AC-12), y descarga
  reproducible de las fuentes con checksum, que no se versionan (AC-13).
- **Nuevo** script de medición repetible en `apps/rag-orchestrator`
  (`python -m app.scripts.adr39_measure`), con la regla de selección (descarte por restricciones
  duras, desempate por memoria, "ningún candidato cumple") en funciones puras con test después.
- **Configuración** de `rag-orchestrator`: `EMBEDDING_MODEL`, `EMBEDDING_MODEL_REVISION`,
  `EMBEDDING_DIM`, `SPARSE_VECTOR_SOURCE`, `RERANKER_MODEL`, `RERANKER_MODEL_REVISION`,
  `RERANKER_MAX_PAIRS`, `RERANKER_MAX_LENGTH`, `NLI_MODEL`, `NLI_MODEL_REVISION`,
  `MODEL_QUANTIZATION`, `CORPUS_CHUNK_SIZE`, `CORPUS_CHUNK_OVERLAP`, `CORPUS_CHUNKING_STRATEGY`, `VECTOR_INDEX_TYPE` y
  `VECTOR_INDEX_PARAMS` con los valores elegidos (RN-22). El valor de `EMBEDDING_DIM` vive solo en la
  configuración y en el ADR, nunca en `docs/architecture/data-model.md` (spec `data-model`,
  "Colección Milvus con dimensión parametrizada").
- Sin cambio de contrato: `meta.embeddingModel`, `meta.rerankerModel` y `meta.nliModel` ya existen
  en `apps/rag-orchestrator/openapi.yaml`.

## Capabilities

### New Capabilities
- `ai-evaluation`: protocolo repetible de selección de modelos locales y de *chunking* e índice, fijación en configuración
  de los modelos de recuperación y verificación y de los parámetros de *chunking* e índice antes de indexar, y mini-dataset sintético de
  selección que reutiliza la suite `evaluate` (US-072). Capacidad listada en `openspec/config.yaml`.

### Modified Capabilities
- Ninguna. `data-model` no cambia: la estructura de `corpus_chunks` sigue parametrizada por
  `EMBEDDING_DIM`; este change solo da el valor por configuración (completa US-033 AC-6 sin tocar el
  documento).

## Bounded contexts

- **ai-services** (único): `apps/rag-orchestrator` (script, configuración), `data/eval/adr39-mini/`,
  `docs/architecture/adr/`.

## Dependencias

- El mini-dataset trae su propio manifiesto (`data/eval/adr39-mini/manifest.yaml`); el manifiesto de la
  semilla de L1D-115 (`data/raw/seed/manifest.yaml`) podrá derivar de él. No hace falta el cargador.
- ↪ change de L1D-164 (US-034): imagen Linux arm64 de `rag-orchestrator` para medir en las
  condiciones reales (CPU, sin GPU). Alternativa si aún no existe: ver design.md D2.
- 🔗 Bloquea: change de L1D-114 (US-058) AC-2 (dimensión real) y AC-1 (tipo de índice y parámetros), change de
  L1D-115 (US-059) AC-1 (*embeddings* reales, tamaño y solapamiento de chunk y estrategia), change de L1D-106 (US-055) (adapters reales de recuperación), change de
  L1D-274 (US-224, fase B), US-072 (L1D-235, S2) y US-073 (L1D-236) (baseline con modelos
  fijados), US-014 · ADR-41 (L1D-232, juez local).
- Completa: US-033 AC-6 (`l1d-55-contract-schema-freeze`, archivado) con el valor de la dimensión.
- No bloquea: historias que trabajan contra las interfaces de los adapters con implementaciones
  falsas.

## Fuera de alcance

- Implementar el pipeline o los adapters de producción (`embeddings/`, `reranker/`, `nli/`):
  change de L1D-106 (US-055).
- Runtime, LLM, OCR, p95 extremo a extremo, configuración del LLM y regla de proveedores (RN-12):
  change de L1D-274 (US-224, ex AC-6/7/8).
- Detector de PII (ADR-40), framework de evaluación y juez (ADR-41), *fine-tuning*.
- Poblar el sparse y la búsqueda híbrida (S3, US-112): el ADR solo anota el aporte esperado del
  sparse con consultas en español sobre corpus en inglés.
- Afinar parámetros de Milvus más allá de HNSW frente a FLAT; implementar la ingesta o el *chunker* de producción (US-059, US-117).
- Reabrir la nube para datos reales (RN-12).

## Impact

- Archivos nuevos: `docs/architecture/adr/ADR-39-modelos-locales.md`, `data/eval/adr39-mini/**`,
  `apps/rag-orchestrator/app/scripts/adr39_measure.py`,
  `apps/rag-orchestrator/app/evaluation/model_selection.py`,
  `apps/rag-orchestrator/eval/configs/adr39-fase-a.yaml` y `adr39-fase-a2.yaml`,
  `apps/rag-orchestrator/app/scripts/adr39_fetch_sources.py`, `app/evaluation/chunking_variants.py`,
  `app/evaluation/retrieval_metrics.py`, tests en `apps/rag-orchestrator/tests/`.
- Modificados: `docs/architecture/adr/README.md` (índice), configuración de `rag-orchestrator`
  (`.env.example` y settings), dependencias Python de medición (ONNX Runtime, `optimum`,
  `FlagEmbedding`/`sentence-transformers`), con licencia registrada.
- Pesos de los modelos: fuera del repo, en un volumen de caché; nunca versionados.
