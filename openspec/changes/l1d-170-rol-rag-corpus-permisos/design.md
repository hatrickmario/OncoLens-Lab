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

## Desviaciones y notas de la implementación (clinical-platform)

- **D2 · rol de los privilegios por defecto.** La migración usa `ALTER DEFAULT PRIVILEGES IN SCHEMA …` **sin** `FOR ROLE`: aplica
  al rol que la ejecuta (`clinical_api` en Compose, dueño de la base; `oncolens_test_admin` en los arneses). Así no depende de un
  nombre fijo ni exige ser miembro de otro rol, y cubre el caso del *one-shot* `clinical-migrate` pendiente sin tocar la migración.
  Además de tablas y secuencias cubre funciones, y revoca a `PUBLIC` (data-model §9, medida 4, más `REVOKE ALL ON SCHEMA` de los
  cinco schemas a `PUBLIC`).
- **D4 · timeouts fuera de la migración.** `ALTER ROLE … SET` exige superusuario o `CREATEROLE` y el rol de migraciones es
  `NOCREATEROLE`: los *timeouts* de `rag_corpus` viven en `infra/docker/postgres/initdb/10-roles.sh` (corre una vez al inicializar el
  volumen, como `postgres`). Claves nuevas (RN-22), con valor por defecto en el Compose (30000 y 60000 ms):
  `PG_RAG_CORPUS_STATEMENT_TIMEOUT_MS` y `PG_RAG_CORPUS_IDLE_TX_TIMEOUT_MS`.
  **Acción del usuario:** añadirlas a `infra/docker/.env.example` (el agente no lo toca) y a `docs/operations/claves.md`. En un
  volumen ya inicializado solo surten efecto tras recrearlo (`down -v`) o con un `ALTER ROLE` manual.
- **AC-6 / `research_writer`.** El test se conecta como `research_writer` con la contraseña del archivo `PG_RESEARCH_WRITER_PASSWORD_FILE`
  (que `scripts/test-integration.sh` apunta a `pg_research_writer_password`); `pg_hba` ya admite al rol desde `clinical-net`.
- **AC-2 y AC-3 en clinical-api.** `rag_corpus` solo entra por `corpus-db-net`, así que desde Vitest se verifica por catálogo
  (`has_*_privilege`, con una precondición hostil: un `DEFAULT PRIVILEGES` previo que daría acceso); el *permission denied* en
  ejecución conectado como el rol lo prueba Pytest (sección ai-services).
- **AC-4** se amplió en `scripts/smoke/compose-smoke.sh` (fase 2b, job `stack-smoke`); **AC-5** en
  `infra/docker/__tests__/compose-aislamiento-rag.test.mjs` con la regla `assertRagSinCredencialesClinicas`.
- **CI (tarea 1.5).** No hace falta un job nuevo: `integration` ya corre el Vitest de `clinical-api` (AC-6, AC-2/3 por catálogo) e
  `integration-rag` corre `pytest -m servicios_reales` sobre todo `tests/integration`. Para que el aislamiento no pueda quedar sin
  ejecutarse, `scripts/ci/integracion-rag-orchestrator.sh` exige ahora `US-040:1 US-040:2 US-040:3` en `ACS_REQUERIDOS`, y copia
  `apps/clinical-api/prisma/migrations` al árbol de pruebas.

### Para ai-services (tarea 2.1)

- El arnés de Pytest (`tests/support/pg.py`) crea la base con solo `corpus`; no tiene los schemas clínicos ni Prisma. Para AC-2 y AC-3:
  como `oncolens_test_admin` (dueño de la base de test) crear un schema y una tabla sintética en cada uno de `auth`, `identity`,
  `clinical`, `audit`, `research`, y **después** ejecutar el SQL de
  `apps/clinical-api/prisma/migrations/20261021120000_privilegios_roles/migration.sql` (es SQL puro e idempotente; un `execute` de
  psycopg con el archivo completo sirve). Los privilegios por defecto quedan fijados para ese mismo rol, así que la tabla de AC-3 la
  crea el admin **después** de la migración. La migración tolera la ausencia de `research_writer`.
- Para que AC-3 no sea vacuo, añadir la precondición hostil (`ALTER DEFAULT PRIVILEGES IN SCHEMA clinical GRANT SELECT ON TABLES TO
  rag_corpus` antes de aplicar la migración): sin el `REVOKE` por defecto el test debe fallar.
- `ACS_REQUERIDOS` ya exige `US-040:1`, `US-040:2` y `US-040:3`: el resumen por AC (`@pytest.mark.ac("US-040", n)`) tiene que
  contenerlos o `integration-rag` falla. El simulacro de Pytest de `scripts/ci/__tests__/integracionRag.test.mjs` ya los incluye.
- `tests/integration/` solo se ejecuta con `-m servicios_reales`: marcar los tests con ese marker.

## Pendiente de definir

- D1 (AC-1 con el migrator): asumido según `[S1 resp. 14b]`; confirmar en el Gate 1.
- D2: nombre del rol de migraciones de `clinical-api` en Compose (depende del *one-shot* `clinical-migrate`, sin historia asignada).
