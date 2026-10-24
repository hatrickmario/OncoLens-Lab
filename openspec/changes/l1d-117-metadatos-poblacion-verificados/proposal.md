# Proposal — l1d-117-metadatos-poblacion-verificados

## Trazabilidad

L1D-117 · US-118 · FEAT-06c (L1D-18, parte «06c-S3 Ingesta») · Sprint 3 · Estimación **5** · FR-19 (metadatos
estructurados, `extraido_verificado`) · RN-25 · RN-22 · RN-12 · R-16 · TBD-20 (CAL: muestra humana por
`CORPUS_METADATA_SAMPLE_PCT`) · M-08.3, M-08.4 (medidos en US-132) · AC-06.1 (corpus abierto) · OL-02 · ADR-39 fase A
(NLI mDeBERTa; LLM real fuera de los AC) · ADR-34 (verbalización determinista + NLI) · US-118 AC-1…AC-6 ·
`[S3 resp. 13]` (revisor de la muestra: el usuario) · `[S3 resp. 16]` (2026-10-24, Gate 1: `metadata_source =
pendiente` cuando el LLM o el NLI fallan; claves de `population_criteria` por `studyKey` de L1D-126) · 🔗 Regresión [RN-25] → US-127 · 🔗 Consumida por: US-122
(valor del estudio), US-123 · 🔗 Medido en: US-132 (M-08.3, M-08.4) y US-233 (S4, LLM real)

## Por qué

La aplicabilidad del S3 (US-122, US-123) compara al paciente con la población de cada estudio. Hoy
`population_criteria` solo trae lo que el manifiesto publica de forma estructurada; la literatura (PMC OA) describe
población, diseño y endpoint solo en el texto, y quedaría todo `no_disponible`. Extraerlo con un LLM sin verificarlo
metería datos inventados en la comparación (RN-25). Hace falta una extracción que solo conserve lo que el NLI confirma
contra el texto de la fuente y una muestra revisada a mano que mida su exactitud (M-08.4).

## Qué cambia

- **`MetadataExtractionService`** nuevo en `apps/rag-orchestrator/app/application/corpus_metadata/`: para un
  documento sin metadatos estructurados de la fuente, pide al LLM local un JSON por esquema (`study_design`,
  `trial_phase`, `sample_size`, `primary_endpoint` y las seis claves de `population_criteria`), verbaliza cada valor
  de forma determinista y lo verifica con el NLI contra los chunks del propio documento; lo que no llega a
  `NLI_ENTAILMENT_THRESHOLD` se descarta (RN-25).
- **Paso nuevo del `IngestionPipelineService`** de `l1d-116-ingesta-reanudable-licencia`, entre el *chunking* y la
  confirmación `embebido`: fuente estructurada → se copia y el LLM no se invoca; si no, extracción verificada
  (`metadata_source = extraido_verificado`); LLM o NLI caídos (o JSON inválido) → el documento se indexa igual con sus
  criterios `no_disponible`, `metadata_source = pendiente` (nunca `fuente_estructurada`: la fuente no publicó nada,
  RN-25) y el resumen lo cuenta como `metadatos_pendientes` `[S3 resp. 16]`.
- **Claves de `population_criteria` alineadas con `studyKey`**: las claves y subclaves que escribe la extracción
  (`estadio`, `biomarcadores.her2`, …) son las que el catálogo de aplicabilidad de `l1d-126` declara en `studyKey`;
  FX-06c-b usa esas mismas claves y un test de coherencia lo comprueba `[S3 resp. 16]`.
- **Muestra humana reproducible** al terminar la ingesta: `CORPUS_METADATA_SAMPLE_PCT` y
  `CORPUS_METADATA_SAMPLE_SEED` seleccionan documentos `extraido_verificado` y se escribe
  `data/evaluation/corpus-metadatos/<release>.yaml` con cada campo en `pendiente` para que el revisor marque
  `correcto | incorrecto`. Plantilla de revisión y tarea `[HUMANO]` para el usuario `[S3 resp. 13]`; la consume US-132
  AC-4.
- **Fixture FX-06c-b ampliada**: LLM de metadatos falso y NLI falso de la Feature (`i-lit-1` con `primary_endpoint`
  inventado y `neutral`), y un lote sintético de 20 documentos para la muestra.
- **Migración Alembic del schema `corpus`** (`0003_metadata_source_pendiente`): amplía el `CHECK` de
  `corpus_document.metadata_source` a `fuente_estructurada|extraido_verificado|pendiente` (y `DOMINIOS_CERRADOS` en
  `tables.py` y `docs/architecture/data-model.md` §4.6) `[S3 resp. 16]`. Sin cambio de contrato HTTP ni de Milvus: las
  columnas existen desde US-058 y `metadata_source` no se expone en ningún `openapi.yaml`.

## Capacidades

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

- `corpus-ingestion` (ADDED: metadatos de la fuente estructurada sin LLM; extracción verificada por NLI con descarte
  por campo; LLM o NLI no disponibles no impiden indexar y dejan `metadata_source = pendiente`; el catálogo admite el
  valor `pendiente`; muestra humana reproducible). El requisito de la semilla
  «Criterios de población desde la fuente estructurada o no disponibles» (US-059) no cambia: el cargador de la semilla
  sigue sin LLM y queda como regresión.

## Bounded contexts

- **ai-services**: `apps/rag-orchestrator` (servicio de aplicación, prompt y esquema JSON, regla de verificación,
  selección de la muestra, migración Alembic del schema `corpus`, configuración, fixtures y tests Pytest) y `data/evaluation/corpus-metadatos/` (plantilla y
  muestra, corpus público).
- **clinical-platform**: no se toca.
- **frontend**: no se toca.

## Dependencias

- ↪ `l1d-116-ingesta-reanudable-licencia` (S3, en preparación): `IngestionPipelineService`, CLI `ingest`, resumen por
  estado, *checkpoint* y FX-06c-b. Este change añade un paso y un contador al resumen; va **después** de L1D-116.
- 🔗 `us-117b-versionado-sparse-semilla` (S3): sin solape; una versión nueva (`i-gl-1-v2`) pasa por el mismo paso de
  metadatos. Sin orden obligatorio entre ambos.
- ↪ `l1d-180-soporte-nli-descartadas` (archivado) y `us-231b-adapter-nli-smoke-semilla` (código del adapter ya en
  `main`): puertos `LlmClient` y `NliClassifier`, regla `soporta()`, adapter mDeBERTa y `NLI_ENTAILMENT_THRESHOLD`.
- 🔗 Produce para: `l1d-127-estado-criterio-estructurado` y `l1d-128-aplicabilidad-textual-citada` (leen
  `population_criteria` y `metadata_source`; sus tests siembran el catálogo, así que pueden avanzar en paralelo; un
  documento `pendiente` tiene todos sus criterios `no_disponible`).
- ↔ `l1d-126-criterios-aplicabilidad-catalogo`: define `studyKey` por criterio (Q1 de L1D-127); las claves de
  `population_criteria` de este change y de FX-06c-b son las que nombra `studyKey` `[S3 resp. 16]`.
- ⛔ ADR-39: la fase A (NLI) está aceptada; el LLM real no hace falta para los AC (adaptadores falsos). La medición con
  modelos reales es de US-233 (S4).

## Fuera de alcance

- Ingesta reanudable, licencias, fallo aislado (US-117a, L1D-116); versionado y `--reindex-sparse` (US-117b).
- Medición de exactitud y cobertura con LLM real y sus metas: US-132 (M-08.3, M-08.4) y US-233 (S4). La validación
  clínica de los criterios: sesión de oncólogos del S4.
- Reintentar la extracción de los documentos con `metadatos_pendientes` sin reingerirlos: deuda (ver `design.md`,
  Pendientes).
- Entrada PDF (US-082, S5); `CorpusRelease` en la Base del análisis (US-119, `si-hay-capacidad`).
- Representación de «solo para un subgrupo» en `population_criteria` (Q2 de L1D-127): no se extrae en el S3.
