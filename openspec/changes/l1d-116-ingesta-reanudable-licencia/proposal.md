# Proposal — l1d-116-ingesta-reanudable-licencia

## Trazabilidad

L1D-116 · US-117a · FEAT-06c (L1D-18) · Sprint 3 · Estimación **5** · FR-19 (ingesta como entregable) · RN-21 ·
RN-22 · RN-05 (solo como regresión: nada se borra) · AC-06.1 (corpus abierto) · OL-02 · readme §3.1 · ADR-36
(fuentes y licencias, decidido) · ADR-39 (BGE-M3 *dense* + *sparse*, fase A aceptada) · SEG-06 ·
US-117a AC-1…AC-4 · partición de US-117 `[S3 resp. 2]` · 🔗 Regresión [RN-21] → US-059 · 🔗 Produce para:
US-117b, US-118

## Por qué

El corpus del S1 se cargó con un cargador manual de la semilla (US-059), que no está pensado para lotes grandes:
si se corta a mitad hay que repetirlo y no indexa el *sparse*. La aplicabilidad del S3 (US-121…US-125) y el
corpus de ≥ 20 documentos por tipo (US-120, S4) necesitan una ingesta automática, reanudable y que nunca deje
entrar una fuente que no podemos usar (RN-21).

## Qué cambia

- **CLI nueva** `python -m app.scripts.ingest --manifest <ruta>` en `apps/rag-orchestrator`: lee un manifiesto de
  ingesta, valida licencia y fuente excluida por documento, normaliza, trocea, embebe *dense* y *sparse*, inserta en
  `corpus_chunks` y en `corpus.corpus_document`, y termina con un resumen JSON con contadores por estado.
- **Reanudable con *checkpoint* por documento** en `corpus_document.status` y `checksum`: una ingesta interrumpida
  solo procesa al relanzarse los documentos que no llegaron a `embebido`, y el número de chunks por documento es el
  mismo que sin interrupción.
- **Fallo aislado**: un documento cuya normalización falla queda `error` y el lote sigue.
- **Vector *sparse* poblado** en cada chunk que indexa esta ingesta, con el origen que fija ADR-39
  (`SPARSE_VECTOR_SOURCE=modelo_embeddings`, BGE-M3): adapter real y adapter falso determinista para los tests.
- **Fixture FX-06c-b** (`tests/fixtures/ingest-manifest.yaml` y sus textos sintéticos) sin `i-gl-1-v2`, que queda
  en un manifiesto aparte para US-117b (ver `design.md`, D6).
- Entrada en **texto**: con PDF reales la ingesta necesitará `TextExtractionService` (US-082, L1D-63, S5); en el S3
  se prueba con el *fixture* de texto `[S3 resp. 2]`.
- Sin cambio de contrato HTTP ni de esquema del catálogo o de Milvus (US-058 ya creó `sparse_vector` y el enum de
  `status`).

## Capacidades

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

- `corpus-ingestion` (ADDED: ingesta en lote con licencia y fuente excluida por documento; reanudación por
  *checkpoint*; fallo aislado con resumen por estado; *dense* y *sparse* poblados en cada chunk ingerido). Los
  requisitos de la semilla (US-059) no cambian y quedan como regresión.

## Bounded contexts

- **ai-services**: `apps/rag-orchestrator` (servicio de aplicación de la ingesta, puerto y adapters del *sparse*,
  CLI, configuración, fixtures y tests Pytest).
- **clinical-platform**: no se toca (ni `clinical-api` ni Compose; la CLI corre como el cargador de la semilla).
- **frontend**: no se toca.

## Dependencias

- ↪ `l1d-114-corpus-catalog-milvus` y `l1d-115-seed-corpus-licensed` (archivados, en `main`): catálogo, colección,
  reglas de admisibilidad, *chunking* y versionado que esta ingesta reutiliza.
- ↪ `l1d-170-rol-rag-corpus-permisos` (archivado): la ingesta corre con el rol `rag_corpus` (SEG-06).
- ⛔ ADR-36 (decidido) y ADR-39 fase A (aceptada, *sparse* de BGE-M3): no bloquean.
- ↪ US-082 · L1D-63 (S5): solo para la entrada PDF; fuera de este change.
- 🔗 Produce para: `us-117b-versionado-sparse-semilla` (versionado sin borrado y `--reindex-sparse` de la semilla,
  sobre este servicio y este adapter *sparse*) y el change de L1D-117 · US-118 (metadatos de población).

## Fuera de alcance

- Versionado de una versión nueva de un documento ya ingerido (`i-gl-1-v2`) y `ingest --reindex-sparse` de la
  semilla del S1: **US-117b** (`us-117b-versionado-sparse-semilla`).
- Extracción y verificación de metadatos de población, diseño y endpoint con LLM + NLI y la muestra humana: US-118
  (L1D-117). Aquí solo se copian los criterios estructurados del manifiesto y el resto queda `no_disponible`, como
  en la semilla.
- Entrada PDF y OCR: US-082 (L1D-63, S5).
- Búsqueda híbrida que use el *sparse*: US-112. `CorpusRelease` como insumo de la Base del análisis: US-119
  (`si-hay-capacidad`).
- Unificar el cargador de la semilla con esta ingesta (deuda sin ID de L1D-115): no se reescribe
  `load_seed_corpus`.
