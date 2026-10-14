# Proposal — l1d-55-contract-schema-freeze

## Trazabilidad

L1D-55 · US-033 · FEAT-00 (L1D-5) · Sprint Pre-S1 · Estimación **10** (8 → 10 por `contracts:generate`, `[Pre-S1 resp. 20]`; antes 5 → 8 el 2026-10-11) ·
FR-09, FR-25 (contrato), FR-27 (esquema `AnalysisBasis`), FR-31 (contrato de preguntas de seguimiento), FR-23 (gradación), FR-01 (estado de la cuenta), NFR-13 ·
RN-01, RN-02, RN-03, RN-04, RN-10, RN-11, RN-15, RN-17, RN-19, RN-20, RN-21, RN-23, RN-24, RN-25, RN-28 · AC-05.3 (contrato), AC-11.4 (evento derivado, C-06), AC-T2.1 (esquema) ·
ADR-26, ADR-10, ADR-21, ADR-33, ADR-34, ADR-36 · DEC-05 · PRD v1.4 E-01, E-02, E-03, E-04, E-05, E-07, E-09 ·
Brechas UX-1…UX-8 de `docs/ux/flujo-e2e.md` · `[Pre-S1 resp. 1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]` · `[§15 resp. 3, 4]` ·
Hallazgos del Gate 1, primera y segunda vuelta (contract-keeper, privacy-guardian, clinical-language-auditor) del 2026-10-11;
la segunda vuelta se cierra sin re-gate y la verifica el Gate 2 (`[Pre-S1 resp. 26]`) · US-033 AC-1…AC-18

## Why

El walking skeleton del S1 y todas las historias que consumen la API (US-038, US-041, US-043,
US-052, US-053, US-055, US-058, US-061, US-066, US-110, US-111, US-211, US-213, US-214, US-218,
US-219) necesitan la forma **final** del contrato `EvidenceAnalysis` y del esquema de datos. Si se
congelan después, cada sprint arrastraría cambios incompatibles de contrato y migraciones de datos
(ADR-26). Hoy los contratos solo existen como prosa y YAML 3.0.3 dentro de readme §4.1/§4.2, con
vacíos ya decididos en el refinamiento del Pre-S1 (DEC-05, `422` de Backend 2, registro manual y
gradación, atribución de citas, preguntas de seguimiento, antigüedad de la evidencia, estado de la
cuenta, matriz de permisos, búsqueda sin identidad en la URL) que no están escritos en ningún
artefacto verificable.

## What Changes

- **Nuevo** `apps/clinical-api/openapi.yaml` (OpenAPI 3.1, `info.version: 1.0.0`), transcrito de
  readme §4.1 con los vacíos resueltos:
  - registro manual `POST /platform/patients/{patientId}/biomarkers` y `…/diagnoses` con el cuerpo
    exacto `DiagnosisManualCreate` y la gradación `DiagnosisGradingInput`
    (`gleason_isup | nottingham`); `grade` nunca se escribe a mano: es texto derivado
    (`[Pre-S1 resp. 18]`, DEC-05);
  - `POST`/`GET /platform/evidence-analyses/{analysisId}/follow-ups` con `FollowUpTurn` y sus
    errores completos (`401`, `403`, `404`, `409 LIMITE_SEGUIMIENTO`, `422`, `429`, `502/503/504`)
    (`[Pre-S1 resp. 19, 23]`, FR-31);
  - `POST /platform/patients/search` con la identidad en el cuerpo; `GET /platform/patients` solo
    con filtros sin identidad (`[Pre-S1 resp. 22]`);
  - vista `PatientAdminSummary` (identificación enmascarada, `lifecycleStatus`, `registeredAt`;
    sin datos clínicos) atada al permiso con `x-view-by-permission`, y `x-permission` por operación
    con códigos concretos de la matriz (`publico` solo en el login) (`[Pre-S1 resp. 24, 27, 29]`,
    E-04); el `admin` recibe `403` en vista de caso, documentos, análisis, seguimiento y resumen del
    caso; el descifrado completo para el opt-out es solo por la CLI (B-05), auditado;
  - login `204` sin cuerpo con cookie `HttpOnly; Secure; SameSite=Strict` y `401
    CREDENCIALES_INVALIDAS` con `traceId` (`[Pre-S1 resp. 29]`);
  - referencias opacas a datos del paciente `r1…rN` por petición (nunca UUID) y enlace resuelto en
    `patientDataLinks`, propio de Backend 1; `staleness` y `newerVersionAvailable` neutros en un
    análisis nuevo; `gleasonScore`/`isupGradeGroup` opcionales en la entrada
    (`[Pre-S1 resp. 29]`);
  - `filtersApplied.publishedFromYear` y `AnalysisBasis.sourcesConsulted.filters.publishedFromYear`
    (E-02); descripción de `POST /platform/evidence-analyses` como **evento derivado** (C-06).
- **Nuevo** `apps/rag-orchestrator/openapi.yaml` (OpenAPI 3.1, `info.version: 1.0.0`), transcrito
  de readme §4.2 con `422` como `oneOf` (`TIPO_NO_HABILITADO` | validación) en `/rag/query`,
  `filtersApplied.publishedFromYear`, `RagMeta` estricto (sin campos nulos, `catalogVersion`
  obligatorio) en `/rag/query` y `/rag/follow-up` y `CaseSummaryMeta` (nullable donde no hay
  corpus, `catalogVersion` obligatorio) en `/case/summary` (`[Pre-S1 resp. 32 (D-3)]`), `dataRef`
  `r1…rN` en `ClinicalContext`, sin identidad ni identificadores enlazables (`IDENTIDAD_B2`) y el
  **endpoint propio** `POST /rag/follow-up` (`RagFollowUpRequest`/`RagFollowUpResponse`, sin estado
  entre turnos, `traceId` y seudónimo nuevos por turno, solo modelos locales con datos reales).
  `/rag/query` y su enum de `status` **no cambian** (`[Pre-S1 resp. 19, 29]`).
- **Nuevo** `contracts/schemas/evidence.yaml`: origen único de los ocho schemas compartidos
  (`EvidenceOption`, `DiscardedOption`, `Synthesis`, `SupportedClaim`, `SourceApplicability`,
  `ApplicabilityCriterion`, `ApplicabilitySummary`, `CitedSource`). `Provenance` queda **fuera**:
  cada spec tiene la suya y la de Backend 2 no lleva ids de documento (`[Pre-S1 resp. 25]`).
  `CitedSource` gana `licenseClass` (enum de 4 valores, `[Pre-S1 resp. 21]`), `authors` y
  `sourceUrl` (nullable; `https://`) (UX-1, E-09).
- **Forma del contrato** (`[Pre-S1 resp. 25]`): `required` y `additionalProperties: false` (o
  `unevaluatedProperties: false` en las composiciones) en todo schema cerrado; los bloques de ADR-26
  son obligatorios aunque vayan vacíos; `status = sin_evidencia ⇒ topRelevanceScore = null` con
  `if/then` de JSON Schema 2020-12; `disclaimer` obligatorio y no vacío (`AI_DISCLAIMER_TEXT`).
- **Nuevo** `contracts/examples/` (no normativos: el spec manda) con su mapa `index.json`, que
  asocia cada ejemplo a su schema o a la respuesta de error de su operación.
- **Nuevo** `docs/architecture/data-model.md`: **fuente única** del modelo de datos (DDL y diagrama;
  readme §3.1 solo enlaza, `[Pre-S1 resp. 29]`), con `clinical.diagnosis_grading` (Gleason/ISUP y
  Nottingham), `clinical.analysis_follow_up` (columnas de `meta` y `trace_id`, sin
  `pseudoPatientId` ni identidad), `auth.user.account_status`, matriz de permisos con códigos
  concretos (`audit:read_patient` no para todos), aislamiento del rol `rag_corpus`,
  `corpus.license_class` de 4 valores y la colección Milvus `corpus_chunks` con `EMBEDDING_DIM`.
- **Nuevo** `package.json` raíz mínimo (`"type": "module"`) con:
  - `npm run contracts:check`: lint OpenAPI 3.1, validación de ejemplos con un validador JSON
    Schema 2020-12 y reglas puras con nombre propio (forma, vocabulario v1.0, identidad, lenguaje
    prescriptivo, aviso, anclaje de afirmaciones, datos sintéticos, descripciones normativas,
    permisos y vista por permiso, errores sin eco);
  - `npm run contracts:generate`, **mínimo** (`[Pre-S1 resp. 20]`): tipos TS en
    `packages/api-contracts/src/types/<proveedor>/`, Zod en `packages/api-contracts/src/zod/<proveedor>/`,
    modelos Pydantic en `apps/rag-orchestrator/app/schemas/generated/` (datamodel-code-generator)
    y el extracto no normativo de readme §4 (`contracts:readme-extract`, `[Pre-S1 resp. 28]`); lo
    generado nunca se edita a mano;
  - `npm run contracts:generate:check`: `contracts:generate` y falla si queda cualquier diferencia o
    archivo nuevo sin versionar en las rutas generadas.
  Sus tests aplican **parches** (JSON Patch) sobre los specs y ejemplos reales; no hay copias
  completas de los specs como *fixtures*.
- **Modificado** readme: §4.1 y §4.2 reemplazan el YAML por enlaces a los `openapi.yaml` y los
  ejemplos JSON por enlaces a `contracts/examples/` (no normativos), y §4 conserva en YAML tres
  endpoints representativos (carga de documento, `POST /platform/evidence-analyses`, ficha del
  paciente) como **extracto generado, no normativo**, que `contracts:check` verifica
  (`[Pre-S1 resp. 28]`); se reescribe la frase "forman parte del spec completo en `docs/api/`, a
  generar desde el código"; §3.1 sustituye el DDL **y el diagrama** por el enlace a
  `docs/architecture/data-model.md` (`[Pre-S1 resp. 29]`).
- **Regla para las historias siguientes:** cada historia que agregue un endpoint lo añade al spec
  del proveedor en su propia tarea `## contratos` (cambio aditivo, ADR-26). Antes de la primera
  implementación del S1, el spec de `clinical-api` ya contiene: `POST /platform/auth/login`,
  `POST /platform/auth/logout`, `GET /platform/patients`, `POST /platform/patients/search`,
  `GET /platform/patients/{patientId}`, `POST …/documents` (transcrito de §4.1) y
  `POST /platform/evidence-analyses`, además de los vacíos resueltos de registro manual y
  seguimiento. Es requisito del delta ("Versión del contrato y operaciones del S1").
- Sin endpoints implementados, migraciones, Prisma ni código de producto. No hay **BREAKING**: es
  el primer contrato publicado (`1.0.0`). Política de `info.version` (requisito del delta):
  *major* para un cambio incompatible declarado en su change (ADR-26), *minor* para uno aditivo y
  *patch* para descripciones y ejemplos.

### Cambios que esta propuesta introduce en las historias (los aplica la sesión principal en el Markdown)

Aplicados por la sesión principal el 2026-10-11/12 (este change se alinea con ellos):

- **US-033:** estimación 8 → 10; AC-8 sobre lo **generado** además del `$ref` en el spec crudo,
  con la lista de ocho schemas; AC-12: `licenseClass` con 4 valores; AC-13: `POST /rag/follow-up`
  y `analysis_follow_up` con `trace_id` y versiones, sin seudónimo ni identidad; AC-16
  (generación); **AC-17** (reglas transversales del contrato) y **AC-18** (aislamiento de
  `rag_corpus` y `data-model.md` fuente única), INVEST y entregables.
- **US-211:** login `204` sin cuerpo; `account_status`; cuerpo de error `CREDENCIALES_INVALIDAS`
  con `traceId`.
- **US-045 AC-6** y **US-222 AC-4:** `admin` con `PatientAdminSummary` y `403` en lo clínico;
  descifrado completo solo por la CLI, auditado; `patients:reveal_identity` llega con US-222.
- **US-218:** AC-6 ampliado, AC-8 nuevo (seudónimo y `traceId` por turno, Backend 2 sin estado),
  contexto técnico con `/rag/follow-up`.
- **US-110:** AC-2 y AC-3 con `grading` estructurada; `gleasonScore`/`isupGradeGroup` opcionales.
- **PRD FR-31 y §17**, **flujo-e2e UX-6** y **CLAUDE.md** (`data-model.md` y `openapi.yaml` como
  fuentes).

### Cómo se verifica cada AC

| AC | Verificación |
|---|---|
| AC-1 | `contracts:check`: lint 3.1, `assertEvidenceAnalysisShape()`, `assertClosedSchemas()`, `assertCamelCaseProperties()`, `assertSpecVersions()` + parches |
| AC-2 | `assertNoV1Vocabulary()` + parches |
| AC-3 | `assertExamplesValid()`, `assertNoEvidenceImpliesNullScore()` + parches |
| AC-4 | `assertAnalysisBasisComplete()` + parches |
| AC-5 | revisión documental de `data-model.md` + `assertDataModelDocument()` (tabla presente; readme sin DDL ni diagrama) + parches |
| AC-6 | revisión documental + `assertDataModelDocument()` (`EMBEDDING_DIM` sin literal) + parche |
| AC-7 | `assertDerivedEventDescription()` + parche |
| AC-8 | `assertSharedSchemasSingleOrigin()` (spec crudo) + `assertSharedTypesIdenticalAcrossProviders()` (lo generado) + parche |
| AC-9 | `assertRagTipoNoHabilitado()` + parches |
| AC-10 | `assertManualEntryEndpoints()` + parches |
| AC-11 | `assertDiagnosisGrading()` + ejemplos + parches |
| AC-12 | `assertCitedSourceAttribution()` + ejemplos + parches; `license_class` en revisión documental |
| AC-13 | `assertFollowUpContract()` (contrato, sin estado, pregunta enmascarada, RN-12) + parches; datos: `assertDataModelDocument()` |
| AC-14 | `assertPublishedFromYear()` + parche |
| AC-15 | revisión documental + `assertDataModelDocument()` (`account_status`, matriz, CLI auditada) + ejemplo admin + parches |
| AC-16 | `contracts:generate:check` + `assertReadmeExtractInSync()` + parches de edición a mano |
| AC-17 | reglas transversales (lenguaje, aviso, anclaje, descripciones, errores cerrados y sin eco, identidad en B2, identidad fuera de URL y cabeceras, `x-permission`, vista por permiso, ejemplos sintéticos), cada una con su parche |
| AC-18 | revisión documental + `assertDataModelDocument()` (seis medidas de aislamiento; readme enlaza) + parches |

## Capabilities

### New Capabilities

- `api-contracts`: contrato público de `clinical-api` e interno de `rag-orchestrator`
  (forma de `EvidenceAnalysis`, `AnalysisBasis`, `CitedSource`, `FollowUpTurn`, registro
  manual, búsqueda, errores) y su verificación y generación automáticas (`contracts:check`,
  `contracts:generate`). **Justificación:** ninguna de las capacidades de `openspec/config.yaml`
  posee el contrato como tal; `evidence-analysis` describirá el *comportamiento* del análisis
  (umbral, citas, NLI) y no debe duplicar la forma del payload ni la verificación del spec, que
  comparten todos los endpoints y que US-036/US-214 ampliarán (CI, oasdiff, verificación del
  proveedor).
- `data-model`: esquema de datos congelado (PostgreSQL por schema, colección Milvus y matriz de
  permisos) como documento fuente que las migraciones de US-038 y US-058 implementan.
  **Justificación:** es transversal a `patients-identity`, `case-timeline`, `auth-session` y
  `corpus-ingestion`; repartirlo duplicaría la definición de tablas compartidas.

### Modified Capabilities

- Ninguna (`openspec/specs/` está vacío).

## Impact

- **Bounded contexts:** `clinical-platform` (spec de `clinical-api`, modelo PostgreSQL de
  `auth`/`identity`/`clinical`/`audit`/`research`, matriz de permisos), `ai-services` (spec de
  `rag-orchestrator`, schema `corpus`, Milvus, Pydantic generado). `frontend`: no se toca código;
  `docs/ux/flujo-e2e.md` es la referencia contrastada (UX-1…UX-8).
- **Archivos nuevos:** `apps/clinical-api/openapi.yaml`, `apps/rag-orchestrator/openapi.yaml`,
  `contracts/schemas/evidence.yaml`, `contracts/examples/*.json` e `index.json`,
  `docs/architecture/data-model.md`, `package.json` raíz, `scripts/contracts/` (check, generate,
  readme-extract, reglas, parches de mutación y tests), lo generado en
  `packages/api-contracts/src/types/<proveedor>/` y `src/zod/<proveedor>/` y en
  `apps/rag-orchestrator/app/schemas/generated/`.
- **Archivos modificados:** `readme.md` §3.1, §4.1, §4.2 (commit `docs(L1D-55)`; el extracto
  generado entra en el commit `contract(L1D-55)` de lo generado).
- **Dependencias nuevas (dev, versiones fijadas en design.md D2 y D6):** `@redocly/openapi-core`,
  `ajv`, `ajv-formats`, `fast-json-patch`, `vitest`, `@hey-api/openapi-ts`; en Python,
  `datamodel-code-generator` en `scripts/contracts/requirements-codegen.txt`.

## Dependencias

- ↪ **L1D-54 (US-011 · DEC-05)** — decidida el 2026-10-09; es un registro de decisión, sin change
  de código. Se aplica aquí (AC-5, AC-11) y se amplía con Nottingham (`[Pre-S1 resp. 18]`). No
  bloquea.
- AC-6 sin bloqueo: la dimensión del vector la fija ADR-39 y la aplica US-058 (L1D-114) en el S1.
- 🔗 Consumida por (changes por crear): US-038 (L1D-168, migración y seed), US-036 (L1D-166, CI),
  US-214 (L1D-264, `contracts:breaking` y `contracts:verify-provider`), US-213 (L1D-263, mocks desde
  `contracts/examples/`), US-058 (L1D-114), US-110 (L1D-90), US-211, US-041, US-043, US-052,
  US-053, US-055, US-061, US-066, US-068 (lista de términos prohibidos), US-069 (literal del aviso),
  US-111 y las de FR-31 (US-218, US-219).
- Discrepancia anotada: Linear no registra la relación con L1D-54 (solo `relatedTo` L1D-264);
  manda el Markdown.

## Fuera de alcance

- Implementar endpoints, migraciones Prisma o Alembic, colección Milvus real (US-038, US-058).
- Decidir modelos o la dimensión del *embedding* (ADR-39).
- `contracts:breaking` (oasdiff), `contracts:verify-provider` e integración en la CI (US-214,
  US-036): **pendientes**; aquí solo `contracts:check`, `contracts:generate` mínimo y su
  verificación.
- Empaquetado de `packages/api-contracts` como *workspace* y clientes HTTP generados (US-214 y la
  historia de monorepo).
- Endpoints de la tabla de readme §4.1 que no están en la lista del S1: los añade cada historia
  en su `## contratos`.
- Campos fuera de readme §4.1/§4.2 no decididos en el refinamiento (p. ej., página en
  `Provenance`, V-11; puntajes parciales de Nottingham): se anotan como vacío para su Feature, no
  se improvisan.
- Marcadores de cita en línea (UX-3), cola global de revisión (UX-4): decididos "sin cambio".
- `patients:reveal_identity` (US-222, S6, cambio aditivo) y los códigos `413`/`415` de documentos
  (FEAT-01b): anotados, no se congelan aquí.
