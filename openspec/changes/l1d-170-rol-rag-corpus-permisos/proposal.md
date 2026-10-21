# Proposal — l1d-170-rol-rag-corpus-permisos

## Trazabilidad

L1D-170 · US-040 · FEAT-PL2 (L1D-31) · Sprint 2 · Estimación **5** · SEG-06 (dueña de la parte de base de datos) ·
AC-T4.4 (parte S1) · OL-01 · RN-10 · ADR-17 · ADR-19 · readme §2.4, §2.5 · `[S1 resp. 14b]` · US-040 AC-1…AC-6 ·
🔗 Relacionada: US-034 AC-3 (sin red hacia `clinical-minio`)

## Por qué

`rag-orchestrator` es el límite de seguridad del sistema: aunque su código tenga un error, nunca debe poder leer
datos clínicos. Hoy los roles, `CONNECTION LIMIT` y `pg_hba` existen (US-035), pero la migración inicial no
contiene ningún `GRANT`/`REVOKE` ni `ALTER DEFAULT PRIVILEGES` ("llegan con US-040") y no hay tests de
*permission denied* en ejecución.

## Qué cambia

- Migración SQL de privilegios tras `init_full_schema` (Prisma, `apps/clinical-api/prisma/migrations/`): `REVOKE ALL`
  de `rag_corpus` y `rag_corpus_migrator` sobre `auth`, `identity`, `clinical`, `audit`, `research` y `public`;
  `ALTER DEFAULT PRIVILEGES FOR ROLE <rol de migraciones de clinical-api>` en esos schemas; `research_writer` con
  solo `INSERT` en `research.episode_snapshot`; *timeouts* del rol `rag_corpus`.
- Batería de tests de acceso: Pytest como `rag_corpus` (y `rag_corpus_migrator`) contra PostgreSQL real de test;
  Vitest para `research_writer`; test estático sobre `docker compose config` para credenciales.
- Job de CI que los corre en cada PR (sobre el PostgreSQL de servicio de ARR-01).

## Capacidades

- `data-model` (ADDED: aislamiento de `rag_corpus` verificado en ejecución; privilegios por defecto; `research_writer` solo inserción).

## Bounded contexts

clinical-platform (migración, Vitest, Compose) · ai-services (Pytest de acceso como `rag_corpus`).

## Dependencias

- ↪ `L1D-277` (ARR-01): PostgreSQL de servicio en la CI para el job de *permission denied*.
- Archivados: L1D-165 (US-035: roles, `pg_hba`, secretos), L1D-168 (US-038: esquema), L1D-114 (DML de `rag_corpus` sobre `corpus`).
- Sin dependencias con otros changes del S2.

## Fuera de alcance

Base de datos separada para el corpus y riesgo residual del mismo servidor (ADR-43, S6); red y `clinical-minio`
(US-034, ya cubierto); `CareTeamMember` (Post-MVP).
