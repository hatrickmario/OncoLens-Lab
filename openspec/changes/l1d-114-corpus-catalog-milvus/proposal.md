# Proposal — l1d-114-corpus-catalog-milvus

## Trazabilidad

L1D-114 · US-058 · FEAT-06c (L1D-18) · Sprint 1 · Estimación **5** · historia técnica (PRD §17; OL-02) ·
FR-19 (esquema de metadatos del corpus) · RN-21 (licencia obligatoria; dueña FEAT-06c) · RN-05 (versionado: `version_group_id`, `is_current`, `superseded_at`; el histórico nunca se borra) · RN-22 (dimensión y parámetros en configuración) ·
ADR-10 (readme §3.3 #5 y #10: metadatos denormalizados y colección con esquema final desde el S1) · ADR-36 (clases de licencia) · ADR-39 fase A (dimensión dense y origen del sparse) ·
Fuente del modelo: `docs/architecture/data-model.md` §4.6–§4.7 (US-033, L1D-55, archivado en `2026-10-13-l1d-55-contract-schema-freeze`) · readme §3.1 · `[S1 resp. 14b]` · US-058 AC-1…AC-5

> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos marcados "(asumido)" en los AC
> de US-058 se aceptan (AC-3: el sparse puede quedar sin poblar en el S1, y si la versión de Milvus no
> lo admite se puebla desde el S1 sin cambiar el esquema; AC-5: el inicializador es idempotente).
>
> **Decidido (usuario, 2026-10-13, `[S1 resp. 5]`):** hipótesis A de ADR-39 —
> **BGE-M3, dense de 1024 (int8) y sparse propio del mismo modelo**—. La dimensión real
> (`EMBEDDING_DIM=1024`) y el origen del sparse (`SPARSE_VECTOR_SOURCE`) los fija la configuración que
> publica el change de L1D-102 (US-012 fase A); si las cifras de la fase A eligen B o C, solo cambia
> esa configuración, no este change (B y C también son de 1024; sin sparse propio, el ADR fija el
> origen). Los tests siguen con `EMBEDDING_DIM=8` (FX-06c-a).
>
> **Decidido (usuario, 2026-10-14, Gate 1, `[S1 resp. 14b]`, `backlog/sprints/S1-plan.md` §2):**
> Alembic del corpus corre como **`rag_corpus_migrator`** (rol de L1D-165: `USAGE, CREATE` solo sobre
> `corpus`) en un servicio *one-shot* `corpus-migrate`; el runtime de `rag-orchestrator` usa
> `rag_corpus` con `USAGE` + DML y sin `CREATE`. Resuelve la pregunta abierta del privilegio DDL de
> `rag_corpus` (design.md, "Pendiente de definir"). Lectura del AC-1 de US-058 ("como `rag_corpus`"):
> la migración la ejecuta el rol de migraciones del corpus; `rag_corpus` es el rol de runtime.

## Why

La recuperación del *walking skeleton* (change de L1D-106, US-055), la carga del corpus semilla
(change de L1D-115, US-059) y, más adelante, la búsqueda híbrida (S3) y la aplicabilidad (S5)
necesitan un catálogo del corpus y una colección de Milvus. OL-02 y ADR-10 deciden crearlos **desde el
S1 con su esquema final** —metadatos de población, diseño y endpoint, versionado y vector sparse— para
no recrear la colección ni reingestar el corpus cuando lleguen esas funciones: cambiar el esquema de
una colección de Milvus obliga a reindexar, lo más caro de revertir del RAG. El modelo ya está
congelado en `data-model.md` §4.6–§4.7 (US-033); falta materializarlo con Alembic y `pymilvus`.

## What Changes

- **Nuevo** catálogo del corpus en `apps/rag-orchestrator/app/infrastructure/catalog/`: proyecto
  Alembic con `version_table_schema = corpus` y la migración `0001_corpus_catalog`, que crea en el
  schema `corpus` (ya creado vacío por el change de L1D-168) las tablas `corpus_document`,
  `corpus_release` y `corpus_release_document` con las columnas de `data-model.md` §4.6, `license NOT
  NULL`, `CHECK` de `license_class` (`dominio_publico | cc_by | cc_by_sa | cc_by_nc`, iguales al enum
  `licenseClass` del contrato) y de `status` (`pendiente | normalizado | embebido | error |
  rechazado_licencia`), y los `CHECK` de los demás dominios cerrados del documento. Se ejecuta como
  **`rag_corpus_migrator`** en el servicio *one-shot* `corpus-migrate` de Compose (imagen de
  `rag-orchestrator`, solo en `corpus-db-net`, único secreto `pg_rag_corpus_migrator_password`);
  `rag-orchestrator` arranca después (`service_completed_successfully`). La migración emite
  `ALTER DEFAULT PRIVILEGES IN SCHEMA corpus GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO
  rag_corpus` (y `USAGE, SELECT` en secuencias), de modo que el runtime `rag_corpus` tiene solo
  `USAGE` + DML `[S1 resp. 14b]`.
- **Nuevo** inicializador de la colección en `apps/rag-orchestrator/app/infrastructure/milvus/`:
  `MilvusRepository.ensure_collection()` crea `corpus_chunks` con `dense_vector` de dimensión
  `EMBEDDING_DIM` (configuración), `sparse_vector`, los campos de `data-model.md` §4.7 (incluidos los
  siete denormalizados), índice vectorial sobre ambos vectores e índices escalares sobre `is_current`
  y `cancer_type_tags`. Es idempotente: si la colección existe, no la borra ni la recrea, y si su
  esquema difiere de la configuración (p. ej., otra dimensión) falla con un error explícito.
- **Nuevos** comandos `python -m app.scripts.migrate_corpus_catalog` (Alembic `upgrade head` como
  `rag_corpus_migrator`; lo ejecuta `corpus-migrate`) y `python -m app.scripts.init_corpus_store`
  (`ensure_collection()`, sin credenciales de PostgreSQL), que el arranque de Compose y la CI usan
  antes de la carga del corpus semilla.
- **Nuevos** tests de integración Pytest contra el PostgreSQL de test —arnés con el contrato de
  L1D-165/L1D-168: rol `oncolens_test_admin` (solo `CREATEDB`), base `${PG_TEST_DB_PREFIX}<id>`,
  `corpus-schema-grants.sql`, Alembic como `rag_corpus_migrator` y runtime como `rag_corpus`, nunca
  el superusuario— y un Milvus de test (servicio de Compose del change de L1D-164), con
  `EMBEDDING_DIM=8`.
- Dependencias nuevas de `rag-orchestrator` con versión exacta: `alembic`, `sqlalchemy`, el *driver*
  de PostgreSQL y `pymilvus` (compatible con la versión de Milvus que fija L1D-164).

## Capabilities

### New Capabilities

- `corpus-ingestion` (capacidad listada en `openspec/config.yaml`; aún sin spec): este change le da
  sus primeros requisitos — catálogo del corpus con licencia obligatoria y versionado, colección
  `corpus_chunks` con esquema final y dimensión desde configuración, e inicialización idempotente. La
  carga de la semilla (change de L1D-115) y la ingesta del S3 añadirán sus propios requisitos a esta
  misma capacidad.

### Modified Capabilities

Ninguna. Los requisitos existentes de `data-model` ("Colección Milvus con dimensión parametrizada",
"Licencia del corpus con cuatro clases") describen el **documento** del modelo y no cambian; este
change los materializa en código sin tocarlos.

## Bounded contexts

- **ai-services**: `apps/rag-orchestrator/` (catálogo Alembic, repositorio de Milvus,
  configuración, scripts de migración e inicialización y tests).
- **clinical-platform** (solo Compose): el servicio *one-shot* `corpus-migrate` en
  `infra/docker/docker-compose.yml`, con los secretos que fija L1D-165 D3.
- clinical-platform y frontend: no se tocan. El schema `corpus` lo crea vacío la migración de Prisma
  del change de L1D-168; los roles `rag_corpus` y `rag_corpus_migrator`, sus contraseñas y el perfil
  test, el change de L1D-165.

## Dependencias

- ↪ **change de L1D-164 (US-034)**: crea `apps/rag-orchestrator`, el servicio `milvus-standalone` (con
  `milvus-etcd` y `milvus-minio`) y la red `corpus-db-net`; fija la versión de Milvus.
- ↪ **change de L1D-165 (US-035)**: genera los roles `rag_corpus` (runtime, `USAGE` + DML) y
  `rag_corpus_migrator` (DDL solo en `corpus`), sus contraseñas `*_FILE`, el `pg_hba.conf`, el perfil
  test (`oncolens_test_admin`, `PG_TEST_DB_PREFIX`) y `corpus-schema-grants.sql` `[S1 resp. 14b]`.
- ↪ **change de L1D-168 (US-038)**: crea el schema `corpus` vacío y fija el contrato del arnés de
  PostgreSQL de test que el arnés Pytest de este change replica.
- ⛔ **change de L1D-102 (US-012 fase A)**, solo para el valor real de `EMBEDDING_DIM` y
  `SPARSE_VECTOR_SOURCE` (AC-2). No bloquea los tests (`EMBEDDING_DIM=8`); sí bloquea crear la
  colección real del entorno de demo. Hipótesis A ya aceptada `[S1 resp. 5]`.
- ↪ US-033 (L1D-55): modelo congelado — **hecho** (archivado).
- ↪ US-040 (S2): `REVOKE ALL` y tests de *permission denied* de `rag_corpus` (dependencia hacia
  adelante del slicing v2; en el S1 solo hay datos sintéticos).
- 🔗 Consumida por: **change de L1D-115 (US-059)** (carga de la semilla) y **change de L1D-106
  (US-055)** (recuperación dense con filtro `is_current` y `cancer_type_tags`).

## Fuera de alcance

- Ingesta automatizada y reanudable, versionado de documentos nuevos y rechazo por licencia en la
  ingesta (US-117, S3); la carga del corpus semilla y su filtro por `CORPUS_ACCEPTED_LICENSES`
  (US-059, change de L1D-115). Aquí la licencia solo se impone como restricción del esquema.
- Poblar el sparse con datos reales y la búsqueda híbrida (S3, US-112).
- Publicar una `CorpusRelease` (US-119, si hay capacidad): la tabla se crea, sin lógica.
- `GRANT`/`REVOKE` del rol `rag_corpus` sobre los schemas clínicos y sus tests de *permission denied*
  (US-040, S2).
- Elegir el modelo de *embeddings* (US-012, change de L1D-102).

## Impact

- Código nuevo en `apps/rag-orchestrator/app/infrastructure/{catalog,milvus}/`, `app/config/settings.py`
  (claves nuevas; nombre canónico `[S1 resp. 17]`), `app/scripts/{migrate_corpus_catalog,init_corpus_store}.py`,
  `tests/support/pg.py` y `tests/integration/corpus_store/`; servicio `corpus-migrate` en el Compose.
- Sin cambios de API ni de `contracts/`: ningún endpoint nuevo ni modificado.
- Sin cambios de modelo, prompt, umbral, catálogo clínico ni contenido del corpus: no aplica la suite
  `evaluate`. Fija la estructura sobre la que se indexará; un cambio posterior de dimensión obliga a
  reindexar (lo gobierna ADR-39).
