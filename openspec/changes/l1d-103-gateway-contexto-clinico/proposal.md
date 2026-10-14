# Proposal — l1d-103-gateway-contexto-clinico

## Trazabilidad

L1D-103 · US-052 · FEAT-06a (L1D-16; división propuesta 06a-B1 Gateway) · Sprint 1 · Estimación **5** ·
HU-03 · FR-09 (S1), FR-25 (contrato) · US-054 AC-4 (re-afirmado en el gateway) · RN-10 (allowlist del contexto), RN-22 · AC-05.1, AC-06.2 · FR-01 (guard) ·
OL-03 · ADR-26 (contrato estable) · US-052 AC-1…AC-6 ·
Dependencia hacia adelante del slicing v2 (2026-10-07): `catalogVersion` leído del `manifest.json` del catálogo
versionado, sin el `409` de US-041 (S2); sesión y guard de US-211 (decisión del usuario, 2026-10-07) ·
DoR del S1 ✓ con el *workaround* de US-041 escrito (`backlog/sprints/S1-refinamiento.md` §1) ·
Decidido (usuario, 2026-10-13, `[S1 resp. 3]`): supuestos "(asumido)" del S1 aceptados en bloque; esta historia no
tiene AC "(asumido)" propios, pero se apoya en el escenario A de ADR-40 que usa US-049 (L1D-203) ·
Decidido (usuario, 2026-10-13, `[S1 resp. 7]`): el modo `LLM_PROVIDER=fake` vive en US-034 (L1D-164), no aquí ·
Decidido en el Gate 1 (usuario, 2026-10-14, `backlog/sprints/S1-plan.md` §2): `[S1 resp. 13]` el gateway usa solo
el cliente generado de L1D-105 (hey-api, `fetch` inyectable) sobre su transporte JWT, con `X-Request-Deadline` como
parámetro tipado de la operación · `[S1 resp. 14c]` `/platform/evidence-analyses` exige rol `doctor` en el S1
(`403 PERMISO_DENEGADO` para `admin`, PRD E-04) · `[S1 resp. 14d]` el desidentificador provisional falla cerrado si
`data_origin ≠ sintetico` o `APP_ENV ∉ {local,test}` · `[S1 resp. 17]` las respuestas se validan con el *helper* de
L1D-164 (Ajv2020 sobre el *bundle*) hasta US-214 · corrección del Gate 1: el `traceId` siempre lo genera
`clinical-api`; el `X-Trace-Id` entrante solo va al log y solo si cumple el patrón.

## Why

El walking skeleton del S1 necesita que el oncólogo pueda hacer una pregunta en lenguaje natural sobre su paciente
y que `clinical-api` —único dueño de los datos clínicos— la valide en el borde y envíe a `rag-orchestrator` **solo**
el contexto clínico permitido del caso (diagnóstico, tratamientos previos, eventos, atributos), para que la evidencia
se recupere a la luz de ese caso (HU-03, FR-09). Es el primer punto donde datos del paciente cruzan hacia la IA: una
allowlist explícita y validada contra el esquema cerrado `ClinicalContext` es la defensa estructural de RN-10.

## What Changes

- **Nuevo** módulo único `evidence-analysis` en `apps/clinical-api/src/modules/evidence-analysis/` (CLAUDE.md:
  un solo módulo para gateway, historial, analysis-basis, memoria y stale-detector). Este change crea su esqueleto
  y la parte de **gateway de entrada**:
  - `evidence-analysis.schema.ts`: borde Zod del request, **generado** desde `EvidenceAnalysisRequest` del
    `openapi.yaml` (`patientId` uuid, `query` 1–2000, `sourcesSelected` con al menos una en `true`,
    `filtersApplied`, `questionTemplateId` y `continueWithWarning` opcionales); cuerpo inválido → `422
    CUERPO_INVALIDO` sin llamar a `rag-orchestrator`.
  - `evidence-analysis.controller.ts` → `evidence-analysis.service.ts` → `evidence-analysis.repository.ts`
    (lectura del caso: paciente, diagnóstico activo, último valor por biomarcador, tratamientos previos, eventos,
    atributos; paciente inexistente → `404 NO_ENCONTRADO` sin llamar a `rag-orchestrator`).
  - `ClinicalContextBuilder`: allowlist explícita que produce un `ClinicalContext` con la forma del contrato
    (`additionalProperties: false`), con `clinicalNotes = []` por minimización y `biomarkerTrends`,
    `missingCriticalData` y `priorAnalyses` vacíos en el S1.
  - Ensamblado del `RagQueryInternalRequest` (`traceId`, `query`, `sourcesSelected`, `dataClassification` desde
    `patient.data_origin`, `catalogVersion` desde `manifest.json`, `maxOptions` desde configuración = 1 en el S1,
    `filtersApplied` efectivos, `clinicalContext`) y envío por el **cliente generado (hey-api) de L1D-105**
    `[S1 resp. 13]`, instanciado sobre su transporte `createRagOrchestratorFetch()` (JWT de servicio, sin `Cookie`),
    a `RAG_ORCHESTRATOR_URL` (hostname interno, nunca puerto del host). Este change no crea cliente ni transporte.
  - **`traceId` generado siempre por `clinical-api`** (`IdGenerator` inyectado, `req_` + base62, patrón
    `^req_[A-Za-z0-9]{8,32}$` del contrato). El `X-Trace-Id` entrante **nunca** se copia al body hacia
    `rag-orchestrator`, a `ai_analysis_record` ni a la respuesta; solo se registra en el log como
    `traceIdEntrante`, y solo si cumple el patrón (si no, se descarta sin registrarlo).
  - Ruta `POST /platform/evidence-analyses` montada detrás del guard de sesión de US-211 (`401` antes del
    controlador) y de una comprobación de rol: **solo `doctor`** en el S1 `[S1 resp. 14c]`; `admin` → `403
    PERMISO_DENEGADO` sin leer el caso ni llamar a `rag-orchestrator` (mínimo privilegio, PRD E-04). El RBAC
    completo por permiso `ai_analysis:create` llega con US-045 (S2), que lo cubre por regresión.
- **Puertos declarados para las historias hermanas del mismo módulo** (sin implementarlas): `ContextDeidentifier`
  (US-049, L1D-203), `AnalysisCompletion` (persistencia y respuesta, US-053, L1D-104). El etiquetado de procedencia
  completo y la exclusión de rechazados (US-065) llegan en el S3.
- **El desidentificador provisional falla cerrado** `[S1 resp. 14d]`: si `patient.data_origin ≠ sintetico` o
  `APP_ENV ∉ {local,test}`, lanza antes de cualquier llamada saliente y el gateway responde con el error genérico ya
  declarado (`502 ERROR_SERVICIO_IA`, sin contrato nuevo), sin llamar a `rag-orchestrator` y sin persistir. L1D-203
  lo sustituye por el definitivo, con su `503 DESIDENTIFICACION_NO_DISPONIBLE`.
- **Sin cambios de contrato**: `apps/clinical-api/openapi.yaml` y `apps/rag-orchestrator/openapi.yaml` (congelados
  en US-033) ya declaran el endpoint, `EvidenceAnalysisRequest`, `ClinicalContext`, `RagQueryInternalRequest` y los
  errores `401`/`403` (`PERMISO_DENEGADO`)/`404`/`422`/`502`.

## Capabilities

### New Capabilities

- `evidence-analysis-gateway`: comportamiento del gateway de `clinical-api` para `POST /platform/evidence-analyses`
  —validación en el borde, construcción del contexto clínico por allowlist y request interno hacia
  `rag-orchestrator`—. **Justificación de la capacidad nueva:** la capacidad `evidence-analysis` de la lista de
  `openspec/config.yaml` la crea el change de L1D-106 para el pipeline de `rag-orchestrator` (bounded context
  ai-services); el gateway vive en otro proveedor y otro bounded context (clinical-platform), con su propio
  contrato. Separarlo evita redefinir el `Purpose` de L1D-106 y mezclar requisitos de dos servicios. Las historias
  del mismo módulo de `clinical-api` (US-053 persistencia, US-049 desidentificación) pueden añadir aquí sus
  requisitos con nombres distintos.

### Modified Capabilities

- Ninguna. `api-contracts` y `data-model` no cambian; los requisitos existentes ("Sin identidad ni identificadores
  enlazables en Backend 2", "Schemas cerrados y bloques obligatorios") se **verifican** en los tests, no se
  modifican.

## Bounded contexts

- **clinical-platform** (único): `apps/clinical-api`.
- No toca `ai-services` (usa el contrato de `/rag/query` tal cual) ni `frontend` (la UI y el Route Handler de `web`
  son de US-060, L1D-139).

## Dependencias

- ↪ **Depende de** el change de **L1D-168** (US-038): esquema inicial (tablas `clinical.*`, `patient.data_origin`,
  `ai_analysis_record.filters_applied`) y PostgreSQL real de test.
- ↪ **Depende de** el change de **L1D-169** (US-039): seed sintético con el paciente semilla (b) (próstata, ISUP,
  ADT, progresión) y `doc1@test.local`, y `packages/clinical-catalogs/manifest.json` (creador único; de su campo
  `version` sale `catalogVersion`).
- ↪ **Depende de** el change de **L1D-197** (US-211): guard de sesión de `clinical-api` (AC-6).
- ↪ **Depende de** el change de **L1D-164** (US-034): esqueleto de `apps/clinical-api`, workspaces, Compose,
  `RAG_ORCHESTRATOR_URL` en la red interna y el montaje de solo lectura de `packages/clinical-catalogs` con
  `CLINICAL_CATALOG_PATH`.
- ↪ US-033 (archivado): contratos congelados y cliente TS generado en `packages/api-contracts`.
- 🔗 **Ampliado por** el change de **L1D-203** (US-049): implementa `ContextDeidentifier` (seudónimo criptográfico
  por consulta, enmascaramiento de la pregunta, verificación de fechas relativas, fallo cerrado `503`).
- 🔗 **Ampliado por** el change de **L1D-104** (US-053): implementa `AnalysisCompletion` (validación de la respuesta
  interna, persistencia del `AIAnalysisRecord` antes de responder, mapeo de errores `502`/`504`), incluido
  `filters_applied` persistido que afirma el AC-5.
- ↪ **Depende de** el change de **L1D-105** (US-054): el cliente generado hacia `rag-orchestrator` se instancia
  **sobre** su transporte `createRagOrchestratorFetch()` (`src/infrastructure/rag-orchestrator.http.ts`, firma el JWT
  de servicio con `src/infrastructure/service-jwt.ts` y nunca reenvía `Cookie`); este change no crea transporte ni
  firmador propios, y su test del gateway re-afirma US-054 AC-4 a nivel de `POST /platform/evidence-analyses`.
- 🔗 **Consumido por** el change de **L1D-139** (US-060): Route Handler `app/api/evidence-analyses/route.ts`.

## Fuera de alcance

- Persistencia del `AIAnalysisRecord`, respuesta `200` con `EvidenceAnalysis`, `RAG_TIMEOUT_MS`,
  `X-Request-Deadline` y mapeo de errores de Backend 2: US-053 (L1D-104).
- Seudónimo criptográfico, enmascaramiento de la pregunta y del texto libre, fallo cerrado del detector: US-049
  (L1D-203).
- Etiquetas de procedencia completas y exclusión de `rechazado`/`reemplazado` (RN-07): US-065 (S3).
- Filtros reales e híbrida (S3, US-112, US-114); plantillas (`questionTemplateId`, FEAT-05); faltantes en el
  contexto (FEAT-04 US-006); tendencias de biomarcadores (S2); memoria de análisis previos (FEAT-11c, Post-MVP);
  `Idempotency-Key` (no se implementa en el S1).
- `409` por versión de catálogo (US-041, S2), `tipo_no_habilitado` (US-043, S2), RBAC completo por permiso
  `ai_analysis:create` (US-045, S2; en el S1 solo la comprobación de rol `doctor`, `[S1 resp. 14c]`), `403` por opt-out (US-148, S6), `422 PACIENTE_EGRESADO` (US-198, Post-MVP),
  equipo tratante (US-204, Post-MVP), *rate limit* RN-30 (US-056, S4).

## Impact

- Código: `apps/clinical-api/src/modules/evidence-analysis/` (nuevo), registro de la ruta en la app Express, tests en
  `apps/clinical-api/test/` (Vitest + Supertest + PostgreSQL real de test + MSW hacia `rag-orchestrator` construido
  desde `contracts/examples/`).
- Configuración: `RAG_ORCHESTRATOR_URL`, `ANALYSIS_MAX_OPTIONS` (1 en el S1; nombre asumido), `CLINICAL_CATALOG_PATH`
  (lectura de `manifest.json`), `APP_ENV` (leído por el desidentificador provisional).
- Contratos: ninguno. Las respuestas emitidas (`401`/`403`/`404`/`422`/`502`) se validan contra el spec con el
  *helper* de L1D-164 `[S1 resp. 17]` (no con `contracts:verify-provider`, que llega con US-214).
- Datos: solo seed sintético y fixtures (RN-13, RN-14).
