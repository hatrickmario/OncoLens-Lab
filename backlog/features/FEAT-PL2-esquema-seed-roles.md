# FEAT-PL2 — Esquema PostgreSQL completo, seed sintético y roles de base de datos

> Linear: [L1D-31](https://linear.app/l1der-lab-mjbc/issue/L1D-31)

**Talla:** L · **Sprint:** 1 (US-038, US-039) · 2 (US-040) · **Capacidad:** — (plataforma; habilita CAP-02, CAP-04, CAP-11) · T-4 (AC-T4.4, parte S1) · **Recorrido principal:** sí
**Requisitos:** OL-01 completo · FR-17 (campos `retention_*`, esquema) · FR-21 (esquema del caso longitudinal) · FR-16 (datos: `PatientOptOut`) · SEG-06 (rol `rag_corpus`, dueña de la parte de base de datos) · RN-13 (el seed se niega en piloto) · DEC-05 aplicada
**Evidencia:** [→ readme §6 OL-01], [→ readme §3.1], [→ readme §3.2], [→ readme §3.3 #1, #2, #9, #13, #14, #18, #19, #21, #24], [→ readme §2.5 Aislamiento de Backend 2], [→ PRD §11 #6], [→ PRD §18.4 AC-T4.4], [→ PRD §6 RN-13], [→ backlog/01-requisitos.md §14 Q-04, Q-07]
**Dependencias:** ↪ US-033 (esquema congelado) · ↪ US-035 (secretos, roles, `pg_hba.conf`) · ⛔ DEC-05 · escenario más probable (US-038 AC-3, US-039) · ⛔ DEC-04 · workaround Q-07 (US-039 AC-4) · 🔗 Consumida por: todas las Features que leen o escriben PostgreSQL
**Valor:** el caso longitudinal del paciente (diagnóstico, tratamientos previos, eventos, atributos, varias fuentes por dato) es la base de la reconstrucción del caso (P1, P10). Crear todo el esquema desde el S1 —incluidas tablas que se usan después o que quedan fuera del MVP, como `CareTeamMember`— evita migraciones sobre datos clínicos reales. El seed sintético permite demostrar el recorrido sin OCR y sin un solo dato real.
**Stories:** US-038, US-039 (8 puntos, S1) · US-040 (5 puntos, S2)

> **Tablas de funciones diferidas.** `CareTeamMember` (FR-15, Post-MVP por P-02), `PatientOptOut` (control `403` en S5), `AnalysisFeedback` (S4), `EpisodeSnapshot` y `ResearchSubjectMap` (ciclo de vida, Post-MVP) se crean igual en la migración inicial: es la decisión de OL-01 ("esquema completo") y no cuesta capacidad de los sprints que las usan.

---

## US-038 — La migración inicial crea el esquema completo de readme §3.1

> Linear: [L1D-168](https://linear.app/l1der-lab-mjbc/issue/L1D-168)

`FEAT-PL2` · Sprint 1 · Estimación **5** · — (técnica, PRD §17; OL-01) · FR-17, FR-21, FR-16 (datos) · ↪ US-033, US-035 · ⛔ DEC-05 · escenario más probable (AC-3)

## Story
Como equipo de desarrollo, quiero que la primera migración de Prisma cree los cinco
schemas clínicos con todas las tablas, restricciones e índices de readme §3.1, para
que ningún sprint posterior tenga que migrar datos clínicos para agregar una entidad.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un PostgreSQL vacío, cuando se ejecuta
  `npx prisma migrate deploy` con la migración `init_full_schema`, entonces existen los
  schemas `auth`, `identity`, `clinical`, `audit` y `research` con todas las tablas de
  readme §3.1, incluidas `clinical_event`, `prior_treatment`, `clinical_attribute`,
  `clinical_data_source`, `analysis_feedback`, `patient_opt_out` y `care_team_member`,
  y existe el schema `corpus` vacío. `[OL-01]` `[readme §3.1]`
- **AC-2 (borde · tabla reemplazada)** · Dada la migración aplicada, cuando se consulta
  `information_schema.tables`, entonces no existe `patient_consent`. `[OL-01]` `[ADR-18]`
- **AC-3 (borde · diagnóstico genérico y DEC-05)** · Dada la tabla `clinical.diagnosis`,
  cuando se inspeccionan sus columnas, entonces tiene `staging_system`, `stage_value`,
  `performance_scale`, `performance_value`, `histology`, `histology_code`, `grade`,
  `icd10_code` y `mapping_status`. `[ADR-21]` `[Q-04]` · ⛔ DEC-05 · escenario más probable
- **AC-4 (borde · análisis sin evidencia)** · Dado un `AIAnalysisRecord` con
  `evidence_options = []` y `top_relevance_score = null`, cuando se inserta, entonces se
  guarda con `top_relevance_score IS NULL` (no `0.0`); y un `UPDATE` sobre cualquier fila
  de `ai_analysis_record` falla porque la tabla es inmutable. `[ADR-8]` `[readme §6.1 #1]` `[OL-01]`
- **AC-5 (borde · integridad referencial)** · Dado un `Patient` con un `Diagnosis`
  asociado, cuando se intenta borrar el `Patient`, entonces falla por `onDelete: Restrict`.
  `[OL-01]`
- **AC-6 (borde · índice ciego único)** · Dadas dos inserciones en
  `identity.patient_identity` con el mismo `id_type`, `issuing_country` y
  `national_id_hmac`, cuando se ejecuta la segunda, entonces falla por la restricción
  única. `[OL-01]` `[ADR-6]`
- **AC-7 (borde · enums en español)** · Dada la migración, cuando se listan los valores
  de los enums, entonces `entry_method` incluye `seed` y `manual`, `ocr_status` incluye
  `cuarentena_pii` y `requiere_revision_identidad`, `mapping_status` incluye
  `no_mapeado`, `data_origin` incluye `sintetico`, `opt_out_type` incluye
  `analisis_ia`, y `review_status` incluye `rechazado` y `reemplazado`. `[OL-01]` `[readme §3.2]`

## Contexto técnico
`apps/clinical-api/prisma/schema.prisma` con `schemas = ["auth","identity","clinical","audit","research"]`
y `@@schema` por modelo; `snake_case` en la BD (`@@map`/`@map`), `camelCase` en el
cliente; valores con tilde mapeados (`critico @map("crítico")`). `AIAnalysisRecord`
según OL-01 tarea 5 y 5b (`jsonb` para síntesis, aplicabilidad, opciones, descartadas,
`analysis_basis`, `clinical_context_snapshot`, `agent_steps`, `omitted_claims`, etc.;
sin `updated_at`; inmutabilidad con un *trigger* `BEFORE UPDATE` que lanza error). El
schema `corpus` se crea vacío: sus tablas las migra Backend 2 con Alembic (US-058).
`DATABASE_URL` con `sslmode=require`. Tests de integración con Vitest contra un
PostgreSQL de test levantado por Compose (Testcontainers o servicio de CI).

## Non-goals
Tablas del schema `corpus` (US-058). Roles y permisos (US-040). Seed (US-039).

## INVEST
**Small** ✓ un `schema.prisma` transcrito de un DDL ya congelado (US-033) y una migración.
**Testable** ✓ siete aserciones sobre el catálogo de PostgreSQL y restricciones, en un test de integración.

---

## US-039 — El seed sintético carga los pacientes de demo y se niega a correr en el entorno piloto

> Linear: [L1D-169](https://linear.app/l1der-lab-mjbc/issue/L1D-169)

`FEAT-PL2` · Sprint 1 · Estimación **3** · — (técnica, PRD §17; OL-01) · RN-13, RN-14, RN-27, FR-16 (datos) · ↪ US-038 · 🔗 Regresión [RN-10] → US-046 (identidades cifradas del seed, activa desde S2) · ⛔ DEC-05 · escenario más probable (paciente b) · ⛔ DEC-04 · workaround Q-07 (AC-4)

> **Dependencia hacia adelante (slicing v2, 2026-10-07):** US-046 (cifrado e índice ciego) y US-041 (montaje del catálogo) llegan en el S2. En el S1 el seed crea los pacientes (a)–(e) **sin** fila en `identity.patient_identity` (el walking skeleton solo usa el UUID) y toma los códigos CIE-10 del subconjunto versionado en `packages/clinical-catalogs`; las identidades sintéticas cifradas las agrega el seed con US-046 (S2, AC-6).

## Story
Como equipo de desarrollo, quiero un seed idempotente con los cinco pacientes
sintéticos de OL-01 y los usuarios de demo, para demostrar el walking skeleton sin OCR y
sin un solo dato real.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el esquema migrado en un entorno `local`, cuando se
  ejecuta `npx prisma db seed`, entonces existen los pacientes (a) a (e) de OL-01, todos
  con `data_origin = sintetico`, `agreement_reference` no nulo y un
  `CareEpisode` abierto, y sus datos clínicos con `entry_method = seed` y
  `review_status = verificado`. `[OL-01]` `[RN-15]`
- **AC-2 (borde · contenido de los pacientes semilla)** · Dado el seed aplicado, cuando
  se consultan, entonces (a) es mama `TNM_8` IIA, ECOG 1, HER2 3+, receptor de estrógeno
  positivo, con estado menopáusico, histología y grado; (b) es próstata con
  `grade` = grupo ISUP 3, tres valores de PSA fechados, un `PriorTreatment` (ADT) y un
  `ClinicalEvent` de progresión; (c) tiene un `Diagnosis` inactivo y uno activo; (d) tiene
  un `PatientOptOut` de `analisis_ia` con `action = registrado`; (e) es mama sin
  `ClinicalAttribute` de estado menopáusico ni biomarcador Ki-67. `[OL-01]` `[Q-04]`
- **AC-3 (borde · idempotencia)** · Dado el seed ya aplicado, cuando se ejecuta de
  nuevo, entonces el número de filas de `patient`, `patient_identity`, `diagnosis`,
  `biomarker` y `user` no cambia. `[OL-01]`
- **AC-4 (borde · códigos sin permiso confirmado, Q-07)** · Dado DEC-04 sin cerrar,
  cuando se ejecuta el seed, entonces los diagnósticos llevan `icd10_code` del catálogo
  v1, y los biomarcadores y tratamientos quedan con `loinc_code` y `atc_codes` nulos y
  `mapping_status = no_mapeado`. `[Q-07]` `[RN-27]` `[TBD-17]`
- **AC-5 (borde · entorno piloto)** · Dado `APP_ENV=piloto`, cuando se ejecuta el seed,
  entonces aborta con código ≠ 0 antes de abrir una transacción y ninguna tabla cambia
  de número de filas. `[OL-01]` `[RN-13]`

🔗 Regresión [RN-10] → US-046 (AC-6): identidades del seed cifradas, activa desde el S2.

## Contexto técnico
`apps/clinical-api/prisma/seed.ts`: usuario `doctor` y usuario `admin` con contraseñas
de variables de entorno (nunca en el repo). Los códigos se toman de
`packages/clinical-catalogs` (US-041), nunca escritos a mano en el seed. Las identidades
sintéticas se generan con un generador con semilla fija para que los tests sean
reproducibles. Tests de integración con Vitest contra PostgreSQL de test.
Los AC de otras historias que usen pacientes semilla solo afirman lo que lista el AC-2.

## INVEST
**Small** ✓ un script de seed sobre un esquema ya migrado.
**Testable** ✓ cinco tests de integración con conteos y lecturas SQL.

---

## US-040 — El rol `rag_corpus` solo accede al schema `corpus` y la CI lo prueba

> Linear: [L1D-170](https://linear.app/l1der-lab-mjbc/issue/L1D-170)

`FEAT-PL2` · Sprint 2 · Estimación **5** · — (técnica, PRD §17; OL-01) · SEG-06 (dueña de la parte de base de datos), AC-T4.4 (parte S1) · ↪ US-035, US-038 · 🔗 Relacionada: US-034 AC-3 (sin red hacia `clinical-minio`)

## Story
Como responsable de seguridad, quiero que `rag-orchestrator` solo pueda conectarse a
PostgreSQL con el rol `rag_corpus`, limitado al schema `corpus`, y que la CI lo
compruebe en cada PR, para que el servicio de IA nunca pueda leer datos clínicos aunque
su código tenga un error.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el rol `rag_corpus`, cuando ejecuta `CREATE TABLE`,
  `INSERT` y `SELECT` dentro del schema `corpus`, entonces las tres operaciones
  funcionan. `[readme §2.5]` `[ADR-17]`
- **AC-2 (borde · permission denied)** · Dado el rol `rag_corpus`, cuando ejecuta
  `SELECT` sobre cualquier tabla de `auth`, `identity`, `clinical`, `audit` y
  `research`, entonces cada consulta falla con *permission denied* (un caso de test por
  schema). `[AC-T4.4]` `[OL-01]` `[CLAUDE.md]`
- **AC-3 (borde · tablas futuras)** · Dada una tabla nueva creada por el rol de
  `clinical-api` en `clinical` después de los `REVOKE`, cuando `rag_corpus` hace `SELECT`
  sobre ella, entonces falla con *permission denied* (`ALTER DEFAULT PRIVILEGES`).
  `[readme §2.5]`
- **AC-4 (borde · red y TLS)** · Dado `pg_hba.conf`, cuando `rag_corpus` intenta
  conectarse desde `clinical-net` o sin TLS, entonces la conexión es rechazada; y desde
  `corpus-db-net` con TLS y SCRAM, aceptada. `[readme §2.4]` `[SEG-06]`
- **AC-5 (borde · credenciales)** · Dada la definición del servicio `rag-orchestrator`
  en el Compose resuelto, cuando se listan sus variables y secretos, entonces no existe
  ninguna credencial del rol de `clinical-api` ni de `clinical-minio`. `[OL-01]` `[CLAUDE.md]`
- **AC-6 (borde · research solo inserción)** · Dado el rol `research_writer`, cuando
  ejecuta `INSERT` en `research.episode_snapshot`, entonces funciona; y `SELECT` o
  `UPDATE` fallan con *permission denied*. `[OL-01]` `[ADR-19]`

## Contexto técnico
`GRANT`/`REVOKE` y `ALTER DEFAULT PRIVILEGES` en una migración SQL que corre después de
`init_full_schema` con un rol administrador (Prisma no gestiona roles).
`CONNECTION LIMIT` y *timeouts* del rol en la misma migración (readme §2.5). Tests en
la CI: Pytest dentro de la imagen de `rag-orchestrator` conectado como `rag_corpus`
(AC-1 a AC-4) y test estático sobre `docker compose config` (AC-5); AC-6 con Vitest.
El riesgo residual aceptado (mismo servidor) y la base separada se revisan en ADR-43 (S6).

## INVEST
**Small** ✓ una migración de permisos y una batería de tests de acceso denegado.
**Testable** ✓ seis grupos de tests automatizados en la CI.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-11 | readme §3.2: `stage_value` cubre "grupo ISUP (próstata)" | PRD FR-23 / RN-29: TNM y Gleason/ISUP con destinos distintos | PRD con Q-04 / DEC-05: ISUP en `Diagnosis.grade` (US-038 AC-3, US-039 AC-2) |
| C-12 | readme OL-01: "HU-01 a HU-14" | readme §6.0: "HU-01…25" | Sin efecto normativo: historia técnica sin HU (Q-08) |
| C-21 | readme OL-01 seed: códigos CIE-10, LOINC y ATC poblados desde el catálogo | PRD TBD-17 (verificar términos de uso) y decisión Q-07 | Q-07: solo CIE-10 hasta cerrar DEC-04 (US-039 AC-4) |
| P-02 | PRD FR-15, §11 #2: equipo tratante en el MVP | Decisión P-02: autorización por paciente fuera del MVP | Se crea `care_team_member` (esquema completo de OL-01) sin uso en el MVP; ninguna historia de esta Feature lo puebla |
| Slicing v2 | readme OL-01 (S1): rol `rag_corpus` con `REVOKE ALL` y test de *permission denied* en el S1 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): US-040 en el S2; identidad cifrada (US-046) en el S2 | En el S1 `rag-orchestrator` usa el schema `corpus` con datos solo sintéticos; el rol restringido y su test llegan en el S2. El seed del S1 no escribe identidad (ver US-039) |
