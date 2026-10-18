## ADDED Requirements

### Requirement: Rol de migraciones del corpus rag_corpus_migrator
El documento y el script de inicialización de roles MUST describir y crear el rol `rag_corpus_migrator` (`[S1 resp. 14b]`): `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, `USAGE, CREATE` **solo** sobre `corpus`, ningún privilegio sobre `auth`, `identity`, `clinical`, `audit`, `research` ni `public`, y `pg_hba` limitado a `hostssl` desde `corpus-db-net`. Su contraseña es un secreto `*_FILE` del *one-shot* de Alembic.

#### Scenario: Solo el rol de migraciones tiene CREATE, y solo en corpus [US-035 AC-1] [US-058 AC-1] [S1 resp. 14b]
- **WHEN** se revisan `docs/architecture/data-model.md` §9, `infra/docker/postgres/initdb/10-roles.sh` y `infra/docker/postgres/sql/corpus-schema-grants.sql`
- **THEN** conceden `USAGE, CREATE` a `rag_corpus_migrator` solo `ON SCHEMA corpus`, a `rag_corpus` solo `USAGE ON SCHEMA corpus`, y ningún `GRANT … CREATE` nombra a `rag_corpus` ni concede a `rag_corpus_migrator` privilegios sobre otro schema

#### Scenario: El rol de migraciones no puede crear ni leer fuera de corpus [US-035 AC-4] [RN-10] [S1 resp. 14b]
- **GIVEN** el stack levantado con los secretos de `scripts/setup-secrets.sh` y un cliente `psql` efímero en `corpus-db-net` con la contraseña de `rag_corpus_migrator` y `sslmode=require`
- **WHEN** el smoke test ejecuta `CREATE TABLE corpus.smoke_t(id int)`, `CREATE TABLE clinical.smoke_t(id int)` y `SELECT` sobre una tabla de `clinical`
- **THEN** la primera funciona (y el smoke la elimina), y las otras dos fallan con *permission denied*

### Requirement: El runtime rag_corpus no tiene privilegios DDL
`rag_corpus` MUST conservar solo `USAGE` + DML sobre `corpus` (requisito "Aislamiento del rol rag_corpus", sin cambios) y MUST NOT tener `CREATE` en ningún schema (`[S1 resp. 14b]`).

#### Scenario: El runtime rag_corpus no puede crear objetos [US-035 AC-4] [S1 resp. 14b]
- **GIVEN** el mismo stack y un cliente `psql` efímero en `corpus-db-net` como `rag_corpus` con `sslmode=require`
- **WHEN** el smoke test ejecuta `CREATE TABLE corpus.smoke_t(id int)`
- **THEN** falla con *permission denied* y el schema `corpus` no cambia

Regresión [RN-10] [SEG-06] activa desde S2 (US-040): con `rag_corpus` y con `rag_corpus_migrator`, `SELECT` sobre `auth`, `identity`, `clinical`, `audit` y `research` → *permission denied*.
