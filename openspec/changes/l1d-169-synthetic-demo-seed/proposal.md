# Proposal — l1d-169-synthetic-demo-seed

## Trazabilidad

L1D-169 · US-039 · FEAT-PL2 (L1D-31) · Sprint 1 · Estimación **3** · historia técnica (PRD §17; OL-01) ·
RN-13 (el seed se niega en `piloto`), RN-14 (sin datos reales en el repo), RN-15 (convenio registrado y opt-out), RN-27 (`no_mapeado`), FR-16 (datos: `patient_opt_out`) ·
readme §6 OL-01 (tarea 8, seed) · readme §6.1 #2 (`entry_method = seed` solo fuera del entorno piloto) · ADR-21 (diagnóstico genérico) ·
DEC-05 (decidida y **validada**, `[S1 resp. 1]`) · DEC-04 (decidida 2026-10-09; *workaround* Q-07 sin efecto) · Q-04 · TBD-17 ·
Fuente del modelo: `docs/architecture/data-model.md` (US-033, archivado en `2026-10-13-l1d-55-contract-schema-freeze`) · `[S1 resp. 14b]` (secretos y *one-shot*, coordinado con L1D-165) · US-039 AC-1…AC-5

> **Decidido (usuario, 2026-10-13, `[S1 resp. 1]`):** la validación clínica de DEC-05 por el "Oncólogo asesor A" está hecha (`docs/decisions/DEC-05-tnm-isup.md`). La paciente (b) siembra su gradación en `clinical.diagnosis_grading` (`gleason_isup`) y `Diagnosis.grade` lleva el texto canónico derivado `"Gleason 4+3=7 · ISUP 3"`; la paciente (a), `nottingham` con `"Nottingham grado 2"`.
>
> **Decidido (refinamiento del S1, 2026-10-13, `backlog/sprints/S1-refinamiento.md` fila L1D-169):** DEC-04 dejó **sin efecto** el *workaround* Q-07 ("solo CIE-10 en el S1"). El AC-4 pasa a la regla general de RN-27: **códigos solo del catálogo** (CIE-10 y, con sus `NOTICE-<estándar>.txt`, LOINC y ATC); sin entrada en el catálogo → código nulo y `mapping_status = no_mapeado`, nunca inventado.

> **Decidido (usuario, 2026-10-14, Gate 1, `[S1 resp. 14b]`, `backlog/sprints/S1-plan.md` §2):**
> como parte de la corrección de privacidad de L1D-165, el seed lee `SEED_*_PASSWORD_FILE` como fuente
> prioritaria (la variable directa solo como respaldo local fuera de Compose), corre como servicio
> *one-shot* `clinical-seed` (las contraseñas no quedan montadas en `clinical-api` en runtime) y
> `assertSeedPermitido()` rechaza también `REAL_ANONYMIZED_ENABLED=true` o
> `REAL_IDENTIFIED_ENABLED=true`, además de `APP_ENV=piloto` o ausente (RN-13).

## Why

El *walking skeleton* del S1 (US-211 login, US-052 contexto del paciente, US-061 análisis) necesita
pacientes y usuarios en la base **sin OCR y sin un solo dato real** (RN-13, RN-14). OL-01 define cinco
pacientes sintéticos que cubren los bordes que los sprints siguientes van a probar: mama HER2+ completa
(a), próstata con serie de PSA, ADT y progresión (b), diagnóstico inactivo y activo (c), opt-out de
`analisis_ia` (d) y mama con faltantes (e). El seed tiene que ser idempotente y **negarse** a correr en el
entorno `piloto`, para que ningún dato `seed` contamine nunca un entorno con datos reales.

## What Changes

- **Nuevo** `apps/clinical-api/prisma/seed.ts` (registrado en `package.json` → `prisma.seed`), idempotente
  (claves naturales deterministas + *upsert*), con:
  - **Guarda de entorno** (`APP_ENV`, `REAL_ANONYMIZED_ENABLED`, `REAL_IDENTIFIED_ENABLED`) evaluada
    **antes de abrir conexión o transacción**: con `APP_ENV=piloto` o ausente, o con cualquier
    `REAL_*_ENABLED=true`, sale con código ≠ 0 sin tocar ninguna tabla (RN-13, `[S1 resp. 14b]`).
  - **Usuarios de demo** `doc1@test.local` (rol `doctor`, `activo`) y `admin@test.local` (rol `admin`,
    `activo`), con `password_hash` Argon2id calculado desde los archivos de `SEED_DOCTOR_PASSWORD_FILE` y
    `SEED_ADMIN_PASSWORD_FILE` (prioritarios; generados por L1D-165) o, solo como respaldo local fuera
    de Compose, desde `SEED_DOCTOR_PASSWORD`/`SEED_ADMIN_PASSWORD`; ninguna contraseña en el repo. Son
    los que usa US-211 (FX-T4a-b).
  - **Servicio *one-shot* `clinical-seed`** en `infra/docker/docker-compose.yml` (imagen de
    `clinical-api`, `restart: "no"`, `clinical-net`, secretos `pg_clinical_api_password`,
    `seed_doctor_password` y `seed_admin_password` según L1D-165 D3): ejecuta `npx prisma db seed` y
    termina; `clinical-api` en runtime no monta las contraseñas del seed `[S1 resp. 14b]`.
  - **Pacientes (a)–(e)** de OL-01 con `data_origin = sintetico`, `source_dataset = seed`,
    `agreement_reference` sintético no nulo y un `care_episode` abierto; datos clínicos con
    `entry_method = seed` y `review_status = verificado`; fechas relativas a un reloj inyectado.
  - **Sin fila en `identity.patient_identity`** en el S1 (slicing v2): la identidad sintética cifrada la
    añade US-046 (S2, AC-6).
  - **Resolución de códigos solo desde el catálogo** (`packages/clinical-catalogs`, versión `1.0.0`):
    una función pura `resolverCodigoDelCatalogo()` (RN-27) devuelve el código y el nombre oficial, o
    `{ codigo: null, mappingStatus: no_mapeado }`; el seed nunca escribe un código literal.
- **Nuevo** subconjunto mínimo de datos en `packages/clinical-catalogs/` (datos, no código; estructura
  de US-041). Este change es el **creador único** de `packages/clinical-catalogs/manifest.json`
  (campo `version = 1.0.0`, `standards`), que leen L1D-103 (`catalogVersion`) y L1D-180/L1D-193
  (que añaden `lenguaje/`); ningún otro change del S1 lo crea. Además: `mama/codigos.json` y
  `prostata/codigos.json` **solo con los códigos que usa el seed**, copiados literalmente de la fuente
  oficial que exige DEC-04, y los avisos `NOTICE-cie10.txt`, `NOTICE-loinc.txt` y `NOTICE-atc.txt` con
  el texto literal de DEC-04. Un código cuya fuente oficial no se pueda verificar **no se incluye**: el
  dato queda `no_mapeado` (AC-4).
- **Nueva** suite de integración Vitest del seed contra el PostgreSQL de test real (arnés de US-038):
  conteos y lecturas SQL por AC.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `data-model`: se **añaden** (ADDED) requisitos del seed sintético con nombres propios, distintos de los
  que añade `l1d-168-initial-schema-migration`: "Seed sintético de demo con pacientes y usuarios de
  OL-01", "Contenido verificable de los pacientes semilla", "Seed idempotente", "Códigos del seed solo
  desde el catálogo versionado", "Seed bloqueado en el entorno piloto" y, por `[S1 resp. 14b]`, "Seed
  bloqueado con datos reales habilitados" y "El seed corre como proceso one-shot". No se modifica ningún requisito
  existente de `openspec/specs/data-model/spec.md` ni de l1d-168.

## Bounded contexts

- **clinical-platform** (único): `apps/clinical-api/prisma/seed.ts`, `apps/clinical-api/prisma/seed/`
  (datos y helpers del seed), `apps/clinical-api/test/seed/`, `apps/clinical-api/package.json` y los
  datos de `packages/clinical-catalogs/`.
- ai-services y frontend: no se tocan.

## Dependencias

- ⛔ **l1d-168-initial-schema-migration (US-038)**: el seed corre sobre el esquema migrado y reutiliza
  su arnés de PostgreSQL de test.
- ↪ **change de L1D-164 (US-034)**: workspaces de `apps/*`, PostgreSQL de Compose y el montaje de solo
  lectura de `packages/clinical-catalogs` en `clinical-api` y `rag-orchestrator` con
  `CLINICAL_CATALOG_PATH` (declarada en `.env.example`).
- ↪ **l1d-165-secrets-setup-scripts (US-035)**: genera los secretos locales, entre ellos
  `seed_doctor_password` y `seed_admin_password`, y fija en su D3 que solo los recibe `clinical-seed`
  (`[S1 resp. 14b]`); los tests de integración usan el arnés del perfil test (L1D-168).
- DEC-05: decidida y validada `[S1 resp. 1]` · DEC-04: decidida (2026-10-09) — sin bloqueo.
- 🔗 Adopta de **change de L1D-197 (US-211)** (decidido, usuario, 2026-10-20) el *hasher* `createPasswordHasher()` y el usuario `doc1@test.local`, que 197 ya crea como *fixture* local de tests; 197 ya no consume este seed. 🔗 Consumida por: **change de
  L1D-103 (US-052)** (pacientes semilla y `catalogVersion` desde `manifest.json`), **changes de L1D-180
  y L1D-193** (`manifest.json` sobre el que añaden `lenguaje/`),
  **change de L1D-203 (US-049)** (pacientes semilla), US-061 y los E2E del S1.
- 🔗 Regresión [RN-10] → US-046 (AC-6, S2): identidades sintéticas cifradas del seed.

## Fuera de alcance

- Identidad cifrada e índice ciego de los pacientes semilla (US-046, S2).
- Montaje del catálogo en los backends con `CLINICAL_CATALOG_PATH` de solo lectura (lo hace L1D-164);
  `409` por versión distinta entre backends (US-041, S2); validador del catálogo (US-042). Aquí solo se
  versionan `manifest.json` y los datos mínimos que el seed lee.
- Cuentas `doc2@test.local` (desactivado) y `lector@test.local` (rol de prueba): son *fixtures* de test
  de US-211/US-045, no datos del seed (ver Pendiente 1).
- Control `403` por opt-out (S5/S6, FEAT-T4c): aquí solo se siembra la marca de (d).
- `care_team_member`: el seed no lo puebla (P-02, Post-MVP).

## Pendientes de definir

1. **Usuarios de demo adicionales** (dueño: PO; afecta: US-211 AC-2). US-039 pide `doctor` y `admin`;
   FX-T4a-b añade `doc2@test.local` (desactivado). Supuesto de este change: `doc2` lo crea el test de
   US-211, no el seed. Si se prefiere que lo siembre el seed, se añade sin cambiar los AC.
2. ~~**Origen de las contraseñas del seed**~~ **Resuelto `[S1 resp. 14b]`:** `SEED_*_PASSWORD_FILE`
   (archivos de `scripts/setup-secrets.sh`, L1D-165) como fuente prioritaria; `SEED_*_PASSWORD` solo
   como respaldo local fuera de Compose; sin ninguna de las dos, o con el archivo vacío, el seed aborta
   con un error que nombra la variable (nunca su valor).
3. **Quién crea el subconjunto de `packages/clinical-catalogs` en el S1** (dueño: PO; afecta: US-041).
   FEAT-PL3 dice que "el S1 usa el subconjunto CIE-10 del catálogo como datos del seed", pero ninguna
   historia del S1 lo crea. Supuesto: lo crea este change con la estructura de US-041 y solo los códigos
   del seed; US-041 (S2) lo amplía y añade el `409`. **Resuelto (Gate 1, 2ª vuelta):** este change es
   el creador único de `manifest.json`; el montaje es de L1D-164.

## Impact

- Código nuevo en `apps/clinical-api/prisma/` y `apps/clinical-api/test/seed/`; datos nuevos en
  `packages/clinical-catalogs/`. Dependencia nueva de `clinical-api`: `argon2` (versión exacta) si US-211
  no la ha añadido antes.
- Sin cambios de API ni de `contracts/`.
- Catálogo: se **crea** su primer subconjunto. Como el catálogo aún no alimenta ningún análisis en el S1
  (L1D-164 lo monta, pero en el S1 solo se lee la `version` de `manifest.json`) y no hay baseline de `evaluate`, la suite OL-06 se registra como
  "no aplica en S1" en `design.md` §Evaluación.
