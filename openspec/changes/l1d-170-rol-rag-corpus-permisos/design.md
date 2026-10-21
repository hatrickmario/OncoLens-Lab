# Design — l1d-170-rol-rag-corpus-permisos

## Contexto

- Roles creados por `infra/docker/postgres/initdb/10-roles.sh` (US-035): `clinical_api`, `research_writer`,
  `rag_corpus` (con `CONNECTION LIMIT`), `rag_corpus_migrator`, `oncolens_test_admin`.
- `corpus-schema-grants.sql`: `USAGE, CREATE ON SCHEMA corpus` a `rag_corpus_migrator`; `USAGE` a `rag_corpus`;
  el DML de `rag_corpus` lo concede el migrator con `ALTER DEFAULT PRIVILEGES` (L1D-114).
- `pg_hba.conf.template`: `rag_corpus` solo `hostssl` desde `corpus-db-net` con SCRAM; sin TLS, `reject`.
- `init_full_schema`: "Sin GRANT/REVOKE: los roles y el permission denied de rag_corpus llegan con US-040".
- Requisitos vigentes: "Aislamiento del rol rag_corpus" (documento), "El runtime rag_corpus no tiene privilegios DDL"
  con "Regresión [RN-10][SEG-06] activa desde S2 (US-040)".

## Decisiones

**D1 · AC-1 adaptado al reparto de `[S1 resp. 14b]`.** El AC-1 literal pide que `rag_corpus` haga `CREATE TABLE` en
`corpus`; desde el S1 el DDL es del *one-shot* `rag_corpus_migrator` y el runtime **no** tiene `CREATE` (requisito
vigente). Se especifica: `rag_corpus_migrator` crea la tabla y `rag_corpus` hace `INSERT` y `SELECT` sobre ella; y
`rag_corpus` sigue sin poder `CREATE`. No reabre la decisión del S1; pendiente de confirmar en el Gate 1.

**D2 · Privilegios por defecto sobre el rol que migra `clinical-api`.** `ALTER DEFAULT PRIVILEGES FOR ROLE
<rol de migraciones de clinical-api> IN SCHEMA auth, identity, clinical, audit, research REVOKE ALL ON TABLES,
SEQUENCES, FUNCTIONS FROM PUBLIC` (y explícitamente de `rag_corpus`, `rag_corpus_migrator`). Hoy Compose no migra
el esquema clínico (falta el *one-shot* `clinical-migrate`): la migración nombra el rol con el que corre
`prisma migrate` en el arnés de test y en el Compose; si es distinto en cada entorno, se parametriza (RN-22).
Descartada: `REVOKE` tabla por tabla (no cubre tablas futuras, AC-3).

**D3 · Dónde vive el SQL.** Migración de Prisma `2026102xxxxxxx_privilegios_roles` ejecutada por el rol de
migraciones (no por `postgres`); los `REVOKE` sobre roles que no existen fallan → la migración comprueba su
existencia (`DO $$ … IF EXISTS`) para que el arnés de test sin algún rol no rompa. Los arneses de test
(`tests/support/db.ts`, `tests/integration/corpus_store`) aplican la misma migración.

**D4 · *Timeouts*.** `ALTER ROLE rag_corpus SET statement_timeout = :valor` e `idle_in_transaction_session_timeout`,
con los valores en configuración (`PG_RAG_CORPUS_STATEMENT_TIMEOUT_MS`, `PG_RAG_CORPUS_IDLE_TX_TIMEOUT_MS`, RN-22);
el `CONNECTION LIMIT` ya existe (US-035).

**D5 · Tests en ejecución, uno por schema.** Pytest (`tests/integration/permisos/`) se conecta como `rag_corpus` con
TLS a la base de test y ejecuta `SELECT` sobre una tabla de cada schema prohibido (casos parametrizados); espera
`psycopg.errors.InsufficientPrivilege`. AC-4 (red/TLS): test de humo contra Compose (cliente efímero en
`clinical-net` y sin TLS → rechazo de `pg_hba`; en `corpus-db-net` con TLS → acepta). AC-5: test estático sobre
`docker compose config --format json`. AC-6: Vitest + PostgreSQL de test como `research_writer`.

## Privacidad y ownership

- Este change **refuerza** el límite: `rag-orchestrator` no puede leer `auth`, `identity`, `clinical`, `audit` ni
  `research`, ni tablas futuras; no tiene credenciales de `clinical_api` ni de `clinical-minio`. Ningún dato cruza
  fronteras nuevas. Los tests usan solo la base de test con datos sintéticos; los mensajes de error no se registran
  con contenido de filas.

## Contratos

Sin cambios de API (ningún `openapi.yaml` ni ejemplo). Proveedor/consumidor: no aplica.

## Dependencias y colaboradores

- `apps/clinical-api/prisma/migrations/<nueva>/migration.sql`; `docs/architecture/data-model.md` §9 (citar la migración).
- `apps/rag-orchestrator/tests/integration/permisos/` (conexión como `rag_corpus` vía `app.infrastructure.catalog.conexion`).
- `apps/clinical-api/tests/integration/schema/` (research_writer); `infra/docker/__tests__/` (Compose resuelto, `pg_hba`).
- `.github/workflows/`: job de *permission denied* sobre el PostgreSQL de servicio de ARR-01.

## Tests

Test después (matriz: migraciones, Compose, CI), pero el test de cada AC se escribe en el mismo PR y debe fallar
antes de aplicar la migración (evidencia útil para el Gate 2 aunque no es TDD estricto).

## Riesgos

- El rol que ejecuta `prisma migrate` aún no está fijado en Compose (`clinical-migrate` pendiente): si cambia, los
  `DEFAULT PRIVILEGES` no cubren sus objetos. Mitigación: test de AC-3 creando la tabla con ese mismo rol.

## Pendiente de definir

- D1 (AC-1 con el migrator): asumido según `[S1 resp. 14b]`; confirmar en el Gate 1.
- D2: nombre del rol de migraciones de `clinical-api` en Compose (depende del *one-shot* `clinical-migrate`, sin historia asignada).
