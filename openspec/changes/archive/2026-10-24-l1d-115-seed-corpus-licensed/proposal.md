# Proposal — l1d-115-seed-corpus-licensed

## Trazabilidad

L1D-115 · US-059 · FEAT-06c (L1D-18), parte S1 · Sprint 1 · Estimación **5** · OL-02 (readme §6,
tarea 7) · FR-19 (semilla) · RN-21 (dueña) · RN-05 (versionado sin borrado) · RN-25 (metadatos
`no_disponible`) · RN-22 · RN-13, RN-14 · AC-06.1 (corpus abierto) · D-09 · ADR-5, ADR-10 ·
ADR-36 (`docs/architecture/adr/ADR-36-fuentes-y-licencias.md`, composición A) · US-059 AC-1…AC-6 ·
Decidido (usuario, 2026-10-13, `[S1 resp. 3]`): los supuestos marcados "(asumido)" en los AC se
aceptan (AC-5, recarga idempotente) · Fuente: `backlog/features/FEAT-06c-corpus-cientifico.md`
§US-059 y §Fixtures (FX-06c-a), `backlog/sprints/S1-refinamiento.md` (fila L1D-115, resp. 3).

## Why

El walking skeleton del S1 necesita un corpus real de mama y próstata sobre el que recuperar una
opción citada, y esa cita solo es legítima si la fuente es pública, de acceso abierto y con una
licencia aceptada (RN-21, D-09). Hoy el catálogo y la colección existen solo como esquema
(change de L1D-114, US-058). Este change carga la **semilla**: unos 10 documentos de NCI PDQ y PMC OA
verificados uno a uno, rechaza lo que no tiene licencia aceptada o viene de una fuente excluida
(NCCN, ESMO), deja los metadatos de población en `no_disponible` cuando la fuente no los publica
estructurados (RN-25) y nunca borra una versión anterior (RN-05).

## What Changes

- **Nuevo** cargador manual `python -m app.scripts.load_seed_corpus` en `apps/rag-orchestrator`
  (no es el `IngestionPipelineService` del S4): lee un manifiesto, evalúa la admisibilidad de cada
  documento, normaliza lo mínimo, fragmenta, calcula el *embedding* dense e inserta en
  `corpus.corpus_document` y en `corpus_chunks` (Milvus); al final publica un `CorpusRelease`.
- **Nuevas** reglas de dominio puras en `app/domain/corpus_seed/`:
  `evaluar_admisibilidad()` (RN-21, D-09), `resolver_criterios_poblacion()` (RN-25) y
  `decidir_version()` (RN-05, idempotencia por `checksum`).
- **Nuevo** manifiesto real `data/raw/seed/manifest.yaml` (~10 documentos de mama y próstata, NCI
  PDQ EN/ES y PMC OA CC0/CC BY/CC BY-SA, licencia verificada por documento según ADR-36) con los
  textos públicos o su URL, más el fixture sintético FX-06c-a
  (`apps/rag-orchestrator/tests/fixtures/seed-manifest.yaml`). Puede derivar de `data/eval/adr39-mini/manifest.yaml` (change de L1D-102), que ya trae fuentes con licencia y atribución.
- **Configuración** (RN-22): `CORPUS_ACCEPTED_LICENSES`, `CORPUS_EXCLUDED_SOURCES`,
  `CORPUS_CUTOFF_DATE`, `CORPUS_CHUNK_SIZE`, `CORPUS_CHUNK_OVERLAP`, `CORPUS_SEED_MANIFEST_PATH` (`[S1 resp. 38]`: tamaño y solapamiento pasan a **tokens** del *tokenizer* del modelo elegido, y se añade `CORPUS_CHUNKING_STRATEGY`, cuando US-012 AC-10 y AC-11 fijen los valores; hasta entonces, valores provisionales).
- Sin cambio de contrato ni de esquema: el cargador es un comando, no un endpoint, y usa las tablas
  y la colección del change de L1D-114.

## Capabilities

### New Capabilities
- `corpus-ingestion`: carga del corpus científico al catálogo `corpus` y a Milvus — admisibilidad
  por licencia y fuente, metadatos de población, versionado sin borrado, idempotencia y
  `CorpusRelease`. Capacidad listada en `openspec/config.yaml`. Este change añade solo los
  requisitos del **cargador de la semilla**; la ingesta reanudable del S4 (US-117…US-120) los
  ampliará. El esquema (US-058) vive en `data-model`.

### Modified Capabilities
- Ninguna. `data-model` ("Licencia del corpus con cuatro clases", "Colección Milvus con dimensión
  parametrizada") no cambia: el cargador lo respeta.

## Bounded contexts

- **ai-services** (único): `apps/rag-orchestrator` (script, dominio, aplicación, adapters de
  catálogo/Milvus/*embeddings*, configuración), `data/raw/seed/`.

## Dependencias

- ↪ change de L1D-114 (US-058): migración Alembic de `corpus` y `MilvusRepository.ensure_collection()`
  con su esquema final. Sin él no hay dónde insertar.
- ↪ change de L1D-164 (US-034): esqueleto de `rag-orchestrator`, PostgreSQL y Milvus en Compose y en
  la CI (tests de integración).
- ⛔ change de L1D-102 (US-012 fase A, ADR-39): solo **AC-1** (smoke con *embeddings* reales y
  `EMBEDDING_DIM` real). AC-2…AC-6 se verifican con el adapter falso (`EMBEDDING_DIM = 8`). Desde `[S1 resp. 38]`, los valores de `CORPUS_CHUNK_SIZE`, `CORPUS_CHUNK_OVERLAP` y `CORPUS_CHUNKING_STRATEGY` los fija US-012 AC-10 y AC-11; no bloquean los tests.
- ↪ change de L1D-106 (US-055): coordina el puerto de *embeddings* y `MilvusRepository` (ver
  design.md D6); no bloquea.
- 🔗 Lo consumen: change de L1D-102 (su mini-dataset `data/eval/adr39-mini/` ya trae su propio manifiesto y
  no depende de este change; `[S1 resp. 38]`),
  change de L1D-106 (US-055, recuperación sobre la semilla en la demo), US-117 (S4).
- 🔗 Relacionada: US-007 (ADR-36, decidido).

## Fuera de alcance

- `extraido_verificado` (LLM + NLI + muestra humana) y la curación de población de ADR-36
  decisión 5: US-118 (S4).
- Ingesta reanudable, *sparse*, lista de fuentes admitidas (`CORPUS_ALLOWED_SOURCES`), ≥ 20
  documentos por tipo y regla de PubMed en la ingesta automática: US-117, US-120 (S4).
- Persistir originales en `corpus-raw` / `corpus-normalized`: US-117 (S4).
- Recuperar solo chunks vigentes: US-055 AC-3 (dueña).
- Traducción de citas (V-10). NCCN y ESMO: solo como fuente no incluida (`excluded_sources`), nunca
  su contenido, ni siquiera en fixtures (el fixture `t-nccn` es texto sintético).

## Impact

- Nuevos: `apps/rag-orchestrator/app/scripts/load_seed_corpus.py`,
  `app/application/seed_corpus/{seed_corpus_loader.py,ports.py}`,
  `app/domain/corpus_seed/{admisibilidad.py,poblacion.py,versionado.py,chunking.py}`,
  `app/infrastructure/catalog/corpus_document_repository.py`, `data/raw/seed/**`,
  `apps/rag-orchestrator/tests/fixtures/seed-manifest.yaml`, tests Pytest.
- Modificados: configuración de `rag-orchestrator` (*settings* y `.env.example`);
  `app/infrastructure/milvus/milvus_repository.py` (método de inserción, coordinado con L1D-106).
- Datos: solo textos públicos con licencia que permite redistribuirlos; nunca PHI ni identificadores
  de paciente en `data/` (RN-13, RN-14).
