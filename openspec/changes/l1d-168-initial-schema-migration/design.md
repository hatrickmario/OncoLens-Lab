# Design — l1d-168-initial-schema-migration

## Context

- `docs/architecture/data-model.md` es la **fuente única** del modelo (US-033): DDL por schema (§4),
  índices y restricciones (§5), `diagnosis_grading` con DDL literal (§6), `analysis_follow_up` (§7),
  matriz de permisos (§8) y aislamiento de `rag_corpus` (§9). Esta historia lo transcribe a Prisma
  **sin decidir nada nuevo**; si al transcribir aparece un vacío, se para y se reporta (no se
  resuelve en el `schema.prisma`).
- OL-01 (readme §6) fija las tareas técnicas 1–7: multi-schema, `snake_case`/`camelCase`, enums
  nativos con `@map` para tildes, restricciones e índices, `AIAnalysisRecord` inmutable sin
  `updated_at`, entidades v1.1/v1.2 y `DATABASE_URL` con `sslmode=require`.
- DEC-05 está decidida y **validada** por el "Oncólogo asesor A" `[S1 resp. 1]`
  (`docs/decisions/DEC-05-tnm-isup.md`): `diagnosis_grading` con `CHECK` por sistema; `grade`
  derivado.
- Antes de este change no hay `apps/clinical-api/package.json` ni Compose: los crea el change de
  L1D-164 (US-034); los certificados, roles y `pg_hba.conf` vienen del change de L1D-165 (US-035).

## Goals / Non-Goals

**Goals:**
- `schema.prisma` + migración `init_full_schema` que crean las 29 tablas de los 5 schemas
  clínicos y el schema `corpus` vacío, iguales a `data-model.md`.
- Arnés de PostgreSQL de test real reutilizable por toda la integración de `clinical-api`
  (US-213 lo referencia como "el PostgreSQL de test de US-038").
- Suite de integración que prueba AC-1…AC-7 sobre el catálogo de PostgreSQL.

**Non-Goals:**
- Tablas de `corpus` (US-058), roles y `permission denied` (US-040, S2), seed (US-039), cifrado
  en la aplicación (US-046), validación de dominio y derivación de `grade` (US-110, FEAT-01b).

## Decisions

### D1. Transcripción literal de `data-model.md`, con SQL a mano solo donde Prisma no llega
`schema.prisma` declara modelos, columnas, enums, FKs (`onDelete: Restrict` en todas las de
`clinical`) e índices simples/únicos. Lo que Prisma no expresa se añade **a mano** al
`migration.sql` generado, en un bloque final comentado y referenciado a la sección del documento:
- los `CHECK` de `diagnosis_grading` (§6, copiados literalmente) y el de `llm_provider`
  (`local | nube`) en `analysis_follow_up` (lo exige el modelo) y, por coherencia del mismo dominio,
  en `ai_analysis_record`;
- los índices únicos parciales de §5: `care_team_member (patient_id, doctor_id) WHERE is_active`,
  `(patient_id) WHERE is_active AND is_primary`, `care_episode (patient_id) WHERE closed_at IS NULL`,
  `diagnosis_grading (diagnosis_id) WHERE is_reference`;
- la restricción única de `identity.patient_identity (id_type, issuing_country, national_id_hmac)`
  con `NULLS NOT DISTINCT` (PostgreSQL ≥ 15): `issuing_country` es nullable y, sin esa cláusula, dos
  identidades con país nulo y el mismo HMAC no chocarían, lo que anularía AC-6 (asumido; se anota
  para el Gate 1). `legal_representative` no tiene UK en el modelo;
- `CREATE SCHEMA IF NOT EXISTS corpus;` (sin tablas, fuera de `schemas` de Prisma);
- la función y el *trigger* `BEFORE UPDATE` de `clinical.ai_analysis_record` que lanzan
  `RAISE EXCEPTION 'ai_analysis_record es inmutable (RN-06)'`.
Tras editar el SQL, `prisma migrate diff --from-migrations --to-schema-datamodel` debe quedar sin
diferencias (Prisma ignora `CHECK`, índices parciales y *triggers* en el diff, por lo que no los
intenta borrar). `auth.user` usa `@@map("user")` y Prisma lo cita.
Descartadas: (b) escribir el DDL a mano sin Prisma — rompe el cliente tipado y `migrate`;
(c) `prisma db push` — no deja migración versionada.

### D2. Enums nativos (OL-01 tarea 3), `CHECK` donde el documento lo fija, `text` en listas abiertas
Las columnas con lista cerrada en la *Nota* de `data-model.md` → `enum` de Prisma (tipo enumerado de
PostgreSQL), con nombre `snake_case` (`@@map`) y valores en español; `crítico` vía
`critico @map("crítico")`. `clinical_event.mapping_status` admite `n_a` y las demás no: dos enums
(`mapping_status` y `event_mapping_status`) en lugar de uno con `n_a` para todas. Las columnas con
`CHECK` literal en el documento (§6 y `llm_provider`) quedan `text` + `CHECK`; las abiertas o de
catálogo (`cancer_type`, `staging_system` "`TNM_8|riesgo_LLA|...`", `attribute_key`,
`closure_reason`, `setting` "`...|desconocido`") quedan `text`.
Alternativas (esquema caro de revertir):
- **(A, elegida) enums nativos** — la decide OL-01 tarea 3 y la pide AC-7 ("listar los valores de los
  enums"); tipado fuerte en el cliente. Coste: añadir un valor exige `ALTER TYPE … ADD VALUE` (aditivo,
  sin migrar datos).
- (B) `text` + `CHECK` en todas — más flexible, pero contradice OL-01 y pierde el tipo en el cliente.
- (C) tablas de catálogo con FK — duplica `packages/clinical-catalogs` (fuente de los catálogos).
La columna *Tipo* de `data-model.md` dice `text` para estas columnas; el documento (§1) delega la
materialización a la migración ("el tipo y la nota mandan") y OL-01 fija enums nativos: no es un
cambio de modelo. Se anota para el Gate 1.

### D3. Tipos y nulabilidad
Mapeo de §1 del documento: `string → text`, `int → integer`, `float → double precision`,
`bytes → bytea`, `timestamp → timestamptz`; `date` como `@db.Date`; `jsonb` con `Json @db.JsonB`;
`prior_analyses_used uuid[]`; `atc_codes` como `text[]` (el documento dice "lista"). Nulabilidad:
la anotada como "nullable" y la que exige el `CHECK` por sistema; el resto `NOT NULL`. IDs `uuid`
**sin** `@default(uuid())` en la base ni en el cliente: los genera la aplicación con un generador
inyectado (determinismo, CLAUDE.md). `created_at` sin `@default(now())` por la misma razón
(asumido; si el Gate 1 prefiere `DEFAULT now()` en la base, es un cambio menor).

### D4. PostgreSQL de test real: servicio `postgres` de Compose con TLS, una base por ejecución
El arnés (`apps/clinical-api/tests/support/db.ts`) toma `TEST_DATABASE_URL` (con `sslmode=require`),
que apunta al rol **`oncolens_test_admin`** de L1D-165 (`CREATEDB` y nada más) sobre la base de
mantenimiento `postgres`; crea una base nueva `${PG_TEST_DB_PREFIX}<id>` con el sufijo inyectado
por el *setup* global (queda como dueño), aplica `prisma migrate deploy`, aplica
`infra/docker/postgres/sql/corpus-schema-grants.sql` de L1D-165 (`USAGE, CREATE` a
`rag_corpus_migrator` y `USAGE` a `rag_corpus` sobre `corpus`, sin `CREATE` para `rag_corpus`) y la
elimina al terminar. **Nunca usa el superusuario**: `postgres` no tiene regla de red y el
`pg_hba.test.conf` del perfil test/CI solo admite a `oncolens_test_admin` en `postgres` y en las
bases con el prefijo validado (`[S1 resp. 14b]`, L1D-165 D2). El arnés de `rag-orchestrator`
(L1D-114) sigue el mismo contrato. Localmente y en la CI usa el servicio `postgres` de
Compose de US-034 con el *override* del perfil test (misma imagen, mismos certificados de US-035). Cada test que inserta filas corre
dentro de una transacción que se revierte, para que los tests sean independientes entre sí.

**Revalidación del prefijo en el arnés (Gate 1, 2ª vuelta).** Antes de conectar, `db.ts` MUST revalidar
`PG_TEST_DB_PREFIX` con **la misma regex que L1D-165** (`^[a-z][a-z0-9_]{2,}$`, importada de una constante
única del arnés, no reescrita a mano) y MUST abortar, nombrando la variable y nunca su valor de conexión, si
`^${PG_TEST_DB_PREFIX}` casa con `${POSTGRES_DB}`, con `postgres` o con cualquier `template*` (`template0`,
`template1` o un prefijo que empiece por `template`). La misma comprobación se repite sobre el nombre generado
`${PG_TEST_DB_PREFIX}<id>` antes del `CREATE DATABASE` y antes del `DROP DATABASE`: el arnés nunca crea ni borra
una base que no sea suya, aunque el `.env` o la CI traigan un prefijo que `setup-secrets.sh` no validó.
`pg` y `@types/pg` (versión exacta, devDependencies) son el cliente del arnés: crear y borrar la base de test y consultar
el catálogo con SQL crudo, que el cliente de Prisma no hace; no entran al runtime. Prisma 7.10.1 (última estable; la
URL va en `prisma.config.ts`).
Descartada: Testcontainers — duplicaría la configuración de TLS y `pg_hba.conf` de US-035 y
divergiría de la imagen de Compose; se puede revisar en US-213 si la CI lo pide (reversible).

### D5. Verificación contra el documento, no contra una lista inventada
El test de AC-1 compara el catálogo con una **lista literal** de las 29 tablas de
`data-model.md` §1 escrita en el test (la higiene de tests prohíbe derivar el esperado del propio
código). Si el modelo cambia, cambia en su change y el test se actualiza en ese mismo change.

## Decisión posterior: ai_analysis_record anulable por estado y tipo (Gate 2, aprobada por el humano)

Los metadatos de modelo (`llm_provider`, `llm_model`, `embedding_model`, `reranker_model`, `nli_model`, `prompt_version`)
y de recuperación (`corpus_release`, `retrieval_params`) de `clinical.ai_analysis_record` son anulables y los `CHECK`
nombrados de `data-model.md` §4.3 fijan cuándo: `tipo_no_habilitado`, `resumen_caso`, `con_evidencia`, coherencia de
`top_relevance_score` (RN-02) y `evidence_options = '[]'` fuera de `con_evidencia`. También se relajan, por sentido clínico,
`diagnosis` (estadio y desempeño), `care_episode.closure_reason/closed_by` (con `care_episode_cierre_ck`) y `patient`
(`source_dataset`, `agreement_reference`). `clinical.analysis_follow_up` comparte el *trigger* de inmutabilidad.
**Se modifica `init_full_schema` y no se añade otra migración** porque la inicial aún no está desplegada en ningún entorno
(solo bases de test efímeras): el historial no pierde información y evita una migración de corrección en el mismo sprint.

## Privacidad y ownership

- **Fronteras:** este change no mueve datos entre servicios. Solo `clinical-api` (dueño de
  PostgreSQL) aplica la migración. `rag-orchestrator` no recibe credenciales nuevas; solo verá el
  schema `corpus` vacío (sus tablas, US-058). Sin acceso a `clinical-minio`.
- **Identidad (RN-10):** `identity.*` solo tiene `bytea` `*_ciphertext` y `national_id_hmac`;
  ninguna columna en claro (escenario de AC-6). El cifrado llega con US-046.
- **Desidentificación (RN-11):** `clinical_context_snapshot` y `analysis_follow_up` no tienen
  columna de `pseudoPatientId` ni de identidad (tal como el modelo).
- **Aislamiento de `rag_corpus`:** las medidas de `data-model.md` §9 llegan con US-040 (S2). Riesgo
  aceptado en el slicing v2: en el S1 solo hay datos sintéticos. La migración no contiene ningún
  `GRANT`; los `REVOKE` y `ALTER DEFAULT PRIVILEGES` (incluido `REVOKE ALL ON SCHEMA public FROM
  PUBLIC`) son de US-040.
- **Datos (RN-13, RN-14):** los tests insertan únicamente filas sintéticas creadas en el test
  (`id_type = sintetico`, `data_origin = sintetico`, HMAC y *ciphertext* de bytes fijos de prueba);
  ningún dato real ni identificador real.
- **Logs:** el arnés no registra filas ni valores; solo nombres de tablas y restricciones.

## Contratos

Sin cambios en `apps/clinical-api/openapi.yaml`, `apps/rag-orchestrator/openapi.yaml` ni
`contracts/`. El esquema materializa los campos que los contratos ya exponen (US-033); los mapeos
`snake_case` ↔ `camelCase` son de los repositories de cada historia. Proveedor/consumidor: n/a.
Compatibilidad ADR-26: sin efecto.

## Dependencias y colaboradores

| Módulo | Acción | Depende de |
|---|---|---|
| `apps/clinical-api/prisma/schema.prisma` | crea | `data-model.md` (fuente), Prisma |
| `apps/clinical-api/prisma/migrations/<ts>_init_full_schema/migration.sql` | crea (generado + bloque manual) | `schema.prisma`, `data-model.md` §5, §6 |
| `apps/clinical-api/tests/support/db.ts` | crea | `TEST_DATABASE_URL` (`oncolens_test_admin`), `PG_TEST_DB_PREFIX`, `prisma migrate deploy`, `corpus-schema-grants.sql` de L1D-165; generador de nombres inyectado |
| `apps/clinical-api/tests/integration/schema/*.test.ts` | crea | arnés de BD; SQL crudo sobre `information_schema`/`pg_catalog` |
| `docs/architecture/data-model.md` §6 | edita la nota de validación | `[S1 resp. 1]` |

Sin services ni reglas de dominio: no se extraen métodos de dominio. Prisma no se mockea; la BD es
real.

## Risks / Trade-offs

- **Prisma y SQL manual:** un `migrate dev` posterior podría intentar "corregir" el SQL manual. Se
  mitiga con D1 (`migrate diff` sin diferencias en la CI) y con los tests de AC-3/AC-4/AC-5.
- **Versión de Prisma y `multiSchema`:** confirmar si la versión fijada lo requiere en
  `previewFeatures` (OL-01 tarea 1); versión exacta en `package.json`.
- **`sslmode=require` en tests:** depende de los certificados de US-035; sin ellos, el arnés falla
  con un mensaje que nombra la variable ausente, nunca un valor.
- **Discrepancia documental:** `data-model.md` §9 dice que las seis medidas de `rag_corpus` "las
  implementa US-038"; el backlog (Non-goals, slicing v2) las asigna a US-040 (S2). Se sigue el
  backlog; la corrección del texto de §9 se propone al humano (no se edita aquí).
