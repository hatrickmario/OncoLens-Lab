# Proposal — l1d-168-initial-schema-migration

## Trazabilidad

L1D-168 · US-038 · FEAT-PL2 (L1D-31) · Sprint 1 · Estimación **5** · historia técnica (PRD §17; OL-01) ·
FR-17 (columnas `retention_*`), FR-21 (esquema del caso longitudinal), FR-16 (datos: `patient_opt_out`), FR-23 (gradación) ·
RN-06 (análisis persistido e inmutable), RN-02 (`top_relevance_score = null`), RN-10 (identidad cifrada en `identity`), RN-27 (`no_mapeado`), RN-29 (todo ítem con destino en el modelo) ·
AC-T4.4 (parte S1) · ADR-6, ADR-8, ADR-18, ADR-21 (readme §3.3) · readme §6.1 #1 · DEC-05 (decidida y validada, `[S1 resp. 1]`) · Q-04 · C-11 ·
Fuente del modelo: `docs/architecture/data-model.md` (US-033, L1D-55, archivado en `2026-10-13-l1d-55-contract-schema-freeze`) · `[S1 resp. 14b]` (arnés de test) · US-038 AC-1…AC-7

> **Decidido (usuario, 2026-10-13, `[S1 resp. 1]`):** la validación clínica de DEC-05 por el "Oncólogo asesor A" está hecha (registrada en `docs/decisions/DEC-05-tnm-isup.md`); US-038 no tiene bloqueo y el AC-3 pasa del escenario más probable a la forma decidida (`clinical.diagnosis_grading`).

## Why

Todas las historias que leen o escriben PostgreSQL (el seed US-039, el *walking skeleton* del S1 y
FEAT-01…FEAT-06) necesitan el esquema clínico **final**. OL-01 decide crear el esquema completo en la
primera migración —incluidas tablas que se usan en sprints posteriores o en el Post-MVP, como
`care_team_member`, `patient_opt_out`, `analysis_feedback`, `episode_snapshot` y
`research_subject_map`— para que ningún sprint tenga que migrar datos clínicos para añadir una
entidad. El modelo ya está congelado en `docs/architecture/data-model.md` (US-033); falta
materializarlo en Prisma y en una migración verificada contra un PostgreSQL real.

## What Changes

- **Nuevo** `apps/clinical-api/prisma/schema.prisma` con `schemas = ["auth","identity","clinical","audit","research"]`,
  `@@schema` por modelo, `snake_case` en la base (`@@map`/`@map`) y `camelCase` en el cliente, y
  enums nativos con los valores en español (`critico @map("crítico")`) (OL-01 tareas 1–3).
- **Nueva** migración `init_full_schema` que crea **todas** las tablas de `data-model.md` §4.1–§4.5
  (29 tablas en 5 schemas: 5 `auth`, 2 `identity`, 20 `clinical`, 1 `audit`, 1 `research`), sus FKs (`ON DELETE RESTRICT` en `clinical`), los índices y restricciones
  de §5 (incluidos los parciales y el índice ciego único), la tabla `clinical.diagnosis_grading` con
  los `CHECK` literales de §6 (DEC-05), el *trigger* `BEFORE UPDATE` que hace inmutable
  `clinical.ai_analysis_record`, y el schema `corpus` **vacío** (sus tablas las migra Backend 2 con
  Alembic, US-058). No existe `patient_consent` (ADR-18).
- **Nuevo** arnés de integración de `clinical-api`: PostgreSQL de test real (el que reutilizan
  US-213 y toda la integración de los backends), con `sslmode=require`, migración aplicada con
  `prisma migrate deploy` y una suite de Vitest que verifica los siete AC sobre el catálogo de
  PostgreSQL.
- Actualización de la nota "Validación clínica pendiente" de `data-model.md` §6 a "validada"
  `[S1 resp. 1]` (documental, sin cambio de modelo).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `data-model`: se **añaden** (ADDED) los requisitos de la migración inicial que materializa el
  modelo congelado: esquema completo y schema `corpus` vacío, ausencia de `patient_consent`,
  diagnóstico genérico con gradación DEC-05 y sus `CHECK`, análisis inmutable con
  `top_relevance_score` nulo, integridad referencial `Restrict`, índice ciego único y enums en
  español. No se modifica ningún requisito existente (los actuales describen el documento, no la
  migración).

## Bounded contexts

- **clinical-platform** (único): `apps/clinical-api/prisma/`, `apps/clinical-api/test/` y la nota de
  `docs/architecture/data-model.md` §6.
- ai-services y frontend: no se tocan. `rag-orchestrator` no ve nada de este change salvo que el
  schema `corpus` existe vacío.

## Dependencias

- ↪ **change de L1D-164 (US-034)**: crea `apps/*`, los `workspaces` del `package.json` raíz y el
  servicio `postgres` de Compose (con TLS) sobre el que corren la migración y la integración.
- ↪ **change de L1D-165 (US-035)**: genera los roles de PostgreSQL, los certificados TLS y el
  `pg_hba.conf` que exigen `sslmode=require` (AC-4 de US-035), y el perfil test del arnés: rol
  `oncolens_test_admin` (solo `CREATEDB`), prefijo `PG_TEST_DB_PREFIX` y `corpus-schema-grants.sql`
  con el rol `rag_corpus_migrator`; nunca el superusuario (`[S1 resp. 14b]`).
- ↪ US-033 (L1D-55): esquema congelado — **hecho** (archivado).
- DEC-05: decidida y validada `[S1 resp. 1]` — sin bloqueo.
- 🔗 Consumida por: **change de L1D-169 (US-039)** (seed, ⛔ por este change), **change de L1D-114
  (US-058)** (tablas del schema `corpus`, que exige el schema creado aquí), US-040 (S2, roles y
  `permission denied`) y toda historia que use PostgreSQL.

## Fuera de alcance

- Tablas del schema `corpus` (US-058, Alembic en `rag-orchestrator`).
- Roles, `GRANT`/`REVOKE`, `ALTER DEFAULT PRIVILEGES` y test de *permission denied* de `rag_corpus`,
  y el rol de solo inserción de `research` (US-040, S2; slicing v2). `data-model.md` §9 atribuye
  esas medidas a US-038, pero el Markdown del backlog (Non-goals de US-038, conflicto "Slicing v2"
  de FEAT-PL2) manda: llegan en el S2. Las contraseñas de los roles y el `pg_hba.conf` son de US-035.
- Seed sintético y su negativa en el entorno `piloto` (US-039).
- Cifrado e índice ciego en la aplicación (US-046, S2): aquí solo se crean las columnas `bytea` y la
  restricción única.
- Validación de dominio de la gradación (`422 GRADACION_INCOHERENTE`) y derivación del texto de
  `Diagnosis.grade` (US-110, FEAT-01b): aquí solo los `CHECK` de la base.

## Impact

- Código nuevo en `apps/clinical-api/prisma/` (`schema.prisma`, `migrations/<ts>_init_full_schema/migration.sql`)
  y `apps/clinical-api/test/` (arnés de BD e integración). Dependencias nuevas de `clinical-api`:
  `prisma` y `@prisma/client` con versión exacta.
- Sin cambios de API ni de `contracts/`: no hay sección de contratos.
- Sin cambios de modelo, prompt, umbral, catálogo ni corpus: no aplica la suite `evaluate`.
