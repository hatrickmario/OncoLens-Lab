# Proposal — us-117b-versionado-sparse-semilla

## Trazabilidad

US-117b · FEAT-06c (parte S3, «06c-S3 Ingesta») · Sprint 3 · Estimación **3** ·
**Linear: pendiente (sin issue; workspace en el límite).** El nombre sigue el precedente de `us-231b-adapter-nli-smoke-semilla`:
cuando exista el issue se renombra a `l1d-<nn>-versionado-sparse-semilla`; mientras tanto los commits usan el alcance `US-117b`.
FR-19 (ingesta como entregable) · RN-05 (versionado sin borrado; la recuperación de vigentes es de US-055) · RN-22 · SEG-06 ·
AC-06.1 (corpus abierto) · OL-02 · ADR-5 · ADR-10 · ADR-39 fase A (`SPARSE_VECTOR_SOURCE=modelo_embeddings`) ·
US-117b AC-1 (antes US-117 AC-4), AC-2 (antes US-117 AC-5) · `[S3 resp. 2]` (partición de US-117) ·
Regresión [RN-05] → US-059 AC-6 · Consumida por: US-112 (*sparse* poblado)

## Why

US-117a (L1D-116) entrega el pipeline de ingesta reanudable con *dense* y *sparse*, pero falta que una versión nueva
de un documento reemplace a la vigente sin borrarla cuando entra por ese pipeline (RN-05), y la semilla del S1 sigue con
`sparse_vector` vacío (US-058 AC-3, D4 de L1D-114). Sin ambas cosas el corpus pierde historia al reingerir y la búsqueda
híbrida (US-112) no cubriría la semilla.

## What Changes

- La ingesta de US-117a detecta la versión nueva de un documento (mismo `version_group_id` que una vigente y `checksum`
  distinto), la inserta como fila nueva vigente y, en la misma operación, marca la anterior `is_current = false` con
  `superseded_at` (reloj inyectado) y apaga sus chunks en Milvus, **sin borrar filas ni chunks** (RN-05, ADR-5). Reutiliza
  la regla ya vigente del cargador de la semilla (L1D-115), no la duplica.
- Nueva opción `ingest --reindex-sparse`: recorre los chunks **vigentes** de `corpus_chunks`, calcula su vector *sparse*
  con el adapter de *embeddings* (BGE-M3, ADR-39) y reescribe solo `sparse_vector`; `chunk_id`, `dense_vector` y los demás
  campos no cambian. Idempotente y con salida distinta de 0 si Milvus o el modelo fallan.
- Sin cambios de esquema (ni Alembic ni colección), sin cambios de API ni de `openapi.yaml`.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `corpus-ingestion`: el requisito «Una versión nueva no borra el histórico» pasa a cubrir también la ingesta del S3
  (MODIFIED, con el escenario de `i-gl-1-v2`); se añaden los requisitos de la reindexación *sparse* de los chunks vigentes.

## Bounded contexts

- **ai-services** (`apps/rag-orchestrator`): único contexto tocado. Ni `clinical-platform` ni `frontend`.

## Dependencias

- ↪ **L1D-116 (US-117a)** — change en preparación en paralelo: `IngestionPipelineService`, el script
  `python -m app.scripts.ingest`, el *checkpoint* por documento, el puerto/adapter *sparse* de BGE-M3 y FX-06c-b
  (`i-gl-1`, `i-gl-1-v2`). Este change no cubre sus AC (reanudación, licencias, fallo aislado, AC-1 del *happy path*).
- ↪ `l1d-114` / `l1d-115` (archivados): esquema con `sparse_vector`, `marcar_no_vigentes` y la regla de versionado de la semilla.
- ⛔ ADR-39 (modelo *sparse*): **resuelto** en la fase A (`SPARSE_VECTOR_SOURCE=modelo_embeddings`); los tests usan un
  adapter *sparse* falso determinista.
- 🔗 Produce para: US-112 (búsqueda híbrida, Post-S3).

## Fuera de alcance

- Reanudación, control de licencias, fallo aislado y *happy path* de la ingesta (US-117a, L1D-116).
- Metadatos de población, diseño y endpoint extraídos (US-118, L1D-117). Entrada PDF (US-082, S5).
- Búsqueda híbrida y uso del *sparse* en la recuperación (US-112). `CorpusRelease` publicada por la ingesta (US-119, `si-hay-capacidad`).
- Reindexar el *sparse* de chunks no vigentes (el histórico se conserva tal cual; no se recupera, RN-05).
- Las deudas sin ID de L1D-115 (unificar la regla de licencias, ingesta que falla cerrado, `license_class` nullable).

## Impact

- `apps/rag-orchestrator/app/application/` (servicio de ingesta de US-117a: rama de versión nueva y caso de uso de
  reindexación *sparse*), `app/scripts/ingest.py` (flag `--reindex-sparse`), `app/infrastructure/milvus/repository.py`
  (lectura paginada de vigentes y reescritura del *sparse* por `chunk_id`).
- Corpus: la semilla pasa a tener *sparse* poblado → la suite `evaluate` se ejecuta para confirmar que el *dense* no cambia.
- Rol `rag_corpus` y schema `corpus` exclusivamente (SEG-06); ningún dato clínico.
