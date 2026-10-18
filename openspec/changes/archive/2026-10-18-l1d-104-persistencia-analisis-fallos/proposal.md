# Proposal — l1d-104-persistencia-analisis-fallos

## Trazabilidad

L1D-104 · US-053 · FEAT-06a (L1D-16; división propuesta 06a-B1 Gateway) · Sprint 1 · Estimación **5** ·
HU-03 · FR-09 · RN-06 (dueña), RN-02 (`top_relevance_score = null`), RN-22 (`RAG_TIMEOUT_MS` en configuración) ·
NFR-08 · AC-10.4 (RN-06), AC-T1.4, AC-11.4 (parte S1) · IA-09 · ADR-32 (análisis como evento derivado) ·
readme §2.1 (responder solo después del `COMMIT`), readme §6.1 #1 · PRD §10 (`500` si falla la persistencia) ·
OL-03 · US-053 AC-1…AC-6 · cierra la aserción de persistencia de US-052 AC-5 (`filters_applied`) ·
Dependencia hacia adelante del slicing v2 (2026-10-07): el builder de la Base del análisis (US-066) llega en el S2;
en el S1 `analysis_basis` se persiste con la forma final del contrato (US-033 AC-4) y lo que ya devuelve Backend 2 ·
DoR del S1 ✓ con el *workaround* de US-066 escrito (`backlog/sprints/S1-refinamiento.md` §1) ·
Decidido (usuario, 2026-10-13, `[S1 resp. 3]`): supuestos "(asumido)" del S1 aceptados en bloque; esta historia no
tiene AC "(asumido)" propios (los supuestos nuevos de este change se marcan en sus escenarios) ·
Decidido (usuario, 2026-10-13, `[S1 resp. 7]`): `LLM_PROVIDER=fake` vive en US-034 (L1D-164); aquí
`rag-orchestrator` se simula con MSW desde `contracts/examples/` ·
Decidido (usuario, 2026-10-13, `[S1 resp. 9]`): el `disclaimer` lleva solo el literal de B-06, desde
`AI_DISCLAIMER_TEXT` (dueña del literal: US-069, L1D-194) ·
Decidido en el Gate 1 (usuario, 2026-10-14, `backlog/sprints/S1-plan.md` §2): `[S1 resp. 12]` una sola tabla de mapeo
de fallos de `rag-orchestrator` (`LOCAL_LLM_UNAVAILABLE` → `503`; `RETRIEVAL_UNAVAILABLE`, `NLI_UNAVAILABLE`, `422` de
rag y cualquier otro `5xx` → `502 ERROR_SERVICIO_IA`, sin persistir y sin eco; *timeout* → `504`) · `[S1 resp. 13]`
cliente hey-api generado de L1D-105 con `X-Request-Deadline` como parámetro tipado · `[S1 resp. 17]` `clinical-api`
versión por el `500` (ahora **1.4.0**, decisión 58 del plan; `ErrorInterno` lo posee L1D-197, decisión 59), `contracts:generate` antes de `contracts:check`, *helper* de validación de
L1D-164 · `[S1 resp. 18]` `topRelevanceScore` = máximo de los chunks sobre el umbral, calculado por Backend 2 ·
corrección del Gate 1: supuesto fijo en `analysisBasis.assumptions[]` para que las listas vacías del S1 no se lean
como "no se usaron datos / no faltan datos" ·
Validación clínica de los oncólogos asesores (2026-10-14, `backlog/sprints/S1-plan.md` §7): `[S1 resp. 30]` literal
del supuesto fijo de la Base del análisis · `[S1 resp. 35]` el `422 TIPO_CANCER_NO_REGISTRADO` de rag se traduce a
`422` con el mismo código, no a `502` · registro de versiones (decisión 58 del plan, sustituye al de `[S1 resp. 37]`): clinical-api 1.3.0 (L1D-103) →
**1.4.0** en este change.

## Why

RN-06 es la promesa de trazabilidad del producto: todo análisis de evidencia que el oncólogo ve quedó registrado,
con lo que se envió y lo que respondió la IA, **antes** de mostrarse, y un fallo nunca muestra un análisis parcial
ni no trazado (PRD §10, readme §2.1, NFR-08). L1D-103 deja el gateway validando la pregunta y enviando el contexto,
pero con un cierre provisional que responde `502`; este change implementa ese cierre: valida la respuesta interna,
persiste el `AIAnalysisRecord` inmutable en una transacción, responde `200` solo después del `COMMIT` y mapea cada
fallo (persistencia, *deadline*, error entre servicios) a una respuesta genérica sin resultados.

## What Changes

- **Implementa el puerto `AnalysisCompletion`** del módulo `evidence-analysis` de `apps/clinical-api` (declarado por
  L1D-103) y reemplaza su adaptador provisional `502`:
  - `validarRespuestaInterna()`: defensa en el borde con el schema Zod **generado** de `RagQueryInternalResponse`;
    una respuesta que no valida → `502 ERROR_SERVICIO_IA`, sin persistir.
  - `topRelevanceScore` tomado del campo homónimo de la respuesta de Backend 2, que lo calcula como el **máximo de
    los chunks sobre el umbral** `[S1 resp. 18]`; Backend 1 no lo recalcula y preserva `null` (nunca `0.0`, RN-02),
    con la comprobación de coherencia `sin_evidencia ⇒ null y evidenceOptions = []`.
  - Base del análisis mínima del S1 detrás del puerto `AnalysisBasisBuilder` (adaptador `BaseDelAnalisisS1`, que
    US-066 reemplaza en el S2): forma final del contrato con lo que ya devuelve Backend 2, más un **supuesto fijo**
    en `assumptions[]` leído de configuración (`ANALYSIS_BASIS_S1_ASSUMPTION_TEXT`, nunca un literal en el código,
    `[S1 resp. 30]`):
    "Datos del paciente recibidos como contexto. Esta versión no verifica su completitud ni la ausencia de datos clínicamente relevantes.", para que
    `patientDataUsed = []` y `missingCriticalData = []` no se lean como "no se usaron datos" ni "no faltan datos".
    El literal pasa `lint:lenguaje` (L1D-193).
  - `persistirAnalisis()` en `evidence-analysis.repository.ts`: un `INSERT` en `clinical.ai_analysis_record` dentro de
    una transacción Prisma; **la respuesta se construye desde lo persistido y se envía solo tras el `COMMIT`**.
  - Mapeo de errores de Backend 2 en **una sola tabla** con nombre propio (`mapearFalloRag()`, `[S1 resp. 12]`):
    `503 LOCAL_LLM_UNAVAILABLE` → `503`; `503 RETRIEVAL_UNAVAILABLE`, `503 NLI_UNAVAILABLE`, `422` de rag,
    `401` y cualquier otro `5xx`, error de red o respuesta inválida → `502 ERROR_SERVICIO_IA`; **excepción**
    `[S1 resp. 35]`: `422 TIPO_CANCER_NO_REGISTRADO` de rag (defensa en profundidad de L1D-106) → `422
    TIPO_CANCER_NO_REGISTRADO` con el mensaje fijo de `error-tipo-cancer-no-registrado.json` (L1D-103), sin eco;
    *timeout* → `504`;
    fallo de persistencia → `500`. Ningún fallo persiste registro, devuelve `evidenceOptions` ni hace eco del cuerpo
    de Backend 2. Cada fila tiene su escenario.
  - *Deadline*: `RAG_TIMEOUT_MS` (configuración, RN-22) aborta la llamada; `X-Request-Deadline`
    (`ahora + RAG_TIMEOUT_MS`, reloj inyectado) se pasa como **parámetro tipado** de la operación del cliente hey-api
    generado de L1D-105 `[S1 resp. 13]`, sobre su transporte `createRagOrchestratorFetch()`.
- **Contrato (aditivo):** `POST /platform/evidence-analyses` declara hoy `502`/`503`/`504` pero **no** el `500` que
  exigen PRD §10 y el AC-2. Se añade `"500"` que referencia el `ErrorInterno` existente (`error: const ERROR_INTERNO`, lo posee L1D-197), el ejemplo
  `contracts/examples/error-interno-analisis.json` y su entrada en `index.json`; `info.version` **1.3.0 (L1D-103) → 1.4.0**
  (decisión 58 del plan). El extracto generado de `readme.md` §4 se regenera (nunca a mano).
- Sin cambio de esquema: `clinical.ai_analysis_record` (inmutable, `top_relevance_score` nullable) lo crea L1D-168.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `evidence-analysis-gateway` (capacidad **nueva** del change en curso L1D-103, aún no archivada): este change le
  **añade** requisitos con nombres distintos (persistencia antes de responder, fallos sin resultados, *deadline*,
  sin evidencia persistido, evento derivado). No redefine su `Purpose` ni modifica sus requisitos.
- `api-contracts` y `data-model`: sin delta. El `500` es una respuesta nueva de una operación existente (cambio
  aditivo, política de versión ya especificada en "Política de versión del contrato"); "Registro de análisis
  inmutable y sin puntaje cuando no hay evidencia" (L1D-168) se **verifica** aquí, no se modifica.

## Bounded contexts

- **clinical-platform** (único): `apps/clinical-api/src/modules/evidence-analysis/`.
- **contratos**: `apps/clinical-api/openapi.yaml` (respuesta `500`), `contracts/examples/`.
- No toca `ai-services` (consume `/rag/query` tal cual) ni `frontend` (el panel muestra el `500` genérico vía US-060
  / US-061).

## Dependencias

- ⛔ **Bloqueado por** el change de **L1D-103** (US-052): crea el módulo `evidence-analysis`, el flujo hasta la
  llamada a `rag-orchestrator`, el mapa `dataRef → entidad` y el puerto `AnalysisCompletion`. Este change se
  implementa en la misma rama de oleada siguiente.
- ↪ **Depende de** el change de **L1D-168** (US-038): `clinical.ai_analysis_record` con *trigger* de inmutabilidad y
  `top_relevance_score` nullable; PostgreSQL real de test.
- ↪ **Depende de** el change de **L1D-105** (US-054): el cliente hey-api generado y `createRagOrchestratorFetch()`
  son el único cliente y transporte hacia `rag-orchestrator`; `X-Request-Deadline` es parámetro tipado de la
  operación `[S1 resp. 13]`.
- ↪ **Depende de** L1D-106 / L1D-180 (US-055 / US-064): declaran en `/rag/query` los `503` `RETRIEVAL_UNAVAILABLE` y
  `NLI_UNAVAILABLE` (`[S1 resp. 12]`); sus ejemplos alimentan los MSW de la tabla de mapeo.
- ↪ **Depende de** el change de **L1D-197** (US-211): `ErrorInterno` (`responses` y `schemas`) y su ejemplo `error-interno.json`; este change solo añade el `500` a `evidence-analyses` (decisión 59 del plan).
- ↪ **Depende de** el change de **L1D-169** (US-039): paciente semilla (a) y `doc1@test.local`.
- ↪ **Depende de** el change de **L1D-164** (US-034): esqueleto de `clinical-api`, configuración, `info.version`
  1.1.0 y el *helper* de validación de respuestas contra el spec
  (Ajv2020 sobre el *bundle*) que usan los tests hasta US-214.
- ↪ **Depende de** el change de **L1D-103** (US-052): gateway, puerto `AnalysisCompletion`, `ErrorAnalisisNoProcesable`
  con `TIPO_CANCER_NO_REGISTRADO` y su ejemplo `error-tipo-cancer-no-registrado.json`, e `info.version` 1.3.0 (este
  change sube a **1.4.0**, decisión 58 del plan). L1D-106 aporta `rag-tipo-cancer-no-registrado.json` para el MSW.
- 🔗 **Relacionado** con el change de **L1D-203** (US-049): `query_text` y `clinical_context_snapshot` se persisten en
  su versión desidentificada, sin `pseudoPatientId`.
- 🔗 **Relacionado** con L1D-106 / L1D-275 (US-055 / US-225): sus ejemplos `rag-query-con-evidencia.json` y
  `rag-query-sin-evidencia.json` alimentan los MSW de este change.
- 🔗 **Consumido por** el change de **L1D-139** (US-060) y por US-061 (L1D-140): Route Handler y panel.
- 🔗 **Produce para** US-088 (S3, evento derivado en el timeline) · **Medido en** US-073 (M-06.2).

## Fuera de alcance

- Builder completo de la Base del análisis (US-066, S2); faltantes en el registro (FEAT-04 US-006).
- Historial, `GET /platform/evidence-analyses/{id}`, re-ejecución y marcas de desactualizado (FEAT-11a).
- Streaming de progreso (ADR-42, S4).
- `409` de catálogo (US-041, S2), `429` y semáforo (US-056, S4), verificación RN-12 `llm_provider` contra
  `dataClassification` (US-050, S6), `403` opt-out (US-148, S6). En el S1, un `409` o `429` de rag se mapea a
  `502 ERROR_SERVICIO_IA` sin persistir, con escenario (Gate 1, 2ª vuelta); sus códigos propios llegan por regresión. El `503
  LOCAL_LLM_UNAVAILABLE` sí entra aquí (`[S1 resp. 12]`).
- Timeline que muestra el análisis como evento derivado (US-088, S3); aquí solo se afirma que no se escribe
  `ClinicalEvent`.
- Validación, construcción del contexto y envío (L1D-103); desidentificación (L1D-203).

## Impact

- Código: `apps/clinical-api/src/modules/evidence-analysis/` (`analysis-completion.ts`, `analysis-basis.ts`, service y
  repository ampliados), tests en `apps/clinical-api/test/` (Vitest + Supertest + PostgreSQL real de test + MSW).
- Configuración: `RAG_TIMEOUT_MS` (propuesta 30000, RN-22), `AI_DISCLAIMER_TEXT` (literal de US-069),
  `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT` (supuesto fijo de la Base del análisis del S1).
- Contratos: `apps/clinical-api/openapi.yaml` (`500`, `info.version` 1.4.0, decisión 58 del plan), `contracts/examples/error-interno-analisis.json`,
  `index.json`, `readme.md` (extracto generado del §4); cliente y Zod regenerados.
- Datos: solo seed sintético y fixtures FX-06a (RN-13, RN-14).
