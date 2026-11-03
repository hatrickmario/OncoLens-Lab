# Proposal — l1d-268-seguimiento-analisis

## Trazabilidad

L1D-268 · US-218 · FEAT-10c (L1D-25) · Sprint 5 (oleada O1) · Estimación **5** · FR-31, FR-09 · RN-01, RN-02, RN-04,
RN-06, RN-11, RN-12, RN-15, RN-22, RN-23, RN-24 · ADR-26, ADR-34, ADR-40 · DEC-22 · US-218 AC-1…AC-8 · US-219 AC-1 (solo
el campo `maxFollowUps`) · `[Pre-S1 resp. 14, 19, 23, 29]` · `[S5 resp. 8, 10, 12, 13]` · Fuente: `backlog/features/FEAT-10c-hasta-3-opciones-por-aplicabilidad.md` §US-218; sprint:
`backlog/sprints/S5-refinamiento.md` §2 (O1, «Nunca» se recorta, `[S5 resp. 3]`) y §3 («Lo que no se reabre»: D-01, RN-23,
RN-24). Diseño UI del sprint: `docs/ux/S5/pantallas-s5.md` S5-04 (la UI es de US-219, L1D-269). Contratos congelados en
US-033 AC-13 (`openspec/specs/api-contracts` «Preguntas de seguimiento ancladas a un análisis» y «Endpoint propio de
seguimiento en Backend 2, sin estado»; `openspec/specs/data-model` «Persistencia de las preguntas de seguimiento»).

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-10-11)** `[Pre-S1 resp. 14]`: seguimiento en el MVP; **10 preguntas por análisis** en
  configuración (`ANALYSIS_FOLLOWUP_MAX = 10`, RN-22); contexto fijo (paciente desidentificado, datos usados por el análisis,
  su pregunta y hallazgos, evidencia del mismo corpus) y se rechaza lo ajeno; **persistencia en Backend 1**
  (`clinical.analysis_follow_up`), `rag-orchestrator` sin estado.
- **Decidido (usuario, 2026-10-29)** `[S4 resp. 1]`: la historia pasa del S4 al S5.
- **`S5-refinamiento.md`** `[S5 resp. 3]`: US-218 en O1 y en la lista «Nunca» del recorte; G-Demo (D-5) recorre **2 preguntas
  de seguimiento con citas**. `[S5 resp. 7]` (D-12): PR **individual** (toca `openapi.yaml` y una RN de privacidad).
- **§5 Stack**: `ANALYSIS_FOLLOWUP_MAX` en `.env.example` es tarea humana `H-1` en el PR `chore` de la oleada (retro S4, M1).
  La suite `evaluate` con modelos locales entra en la corrida nocturna del día 2.
- **Decidido (usuario, 2026-11-03)** `[S5 resp. 8]`: el `403` por opt-out (RN-15) se difiere al S6 con **DEC-22**
  (`docs/decisions/DEC-22-opt-out-403-diferido-s6.md`, ligado a US-148 y G-Piloto); aquí es «Regresión [RN-15] activa desde
  S6 (DEC-22)», nunca un escenario del S5.
- **Decidido (usuario, 2026-11-03)** `[S5 resp. 10]`: (1) `AnalysisBasis.maxFollowUps` (aditivo, valor vigente al crear el
  análisis; el `409 LIMITE_SEGUIMIENTO` es la autoridad) vive en **este** change; `l1d-269` solo lo consume. (2) Las
  excepciones E-18/E-19 de ADR-26 por el `503` del seguimiento quedan aprobadas: `H-2` añade la fila a la tabla de ADR-26
  «Decidido (usuario, 2026-11-03)» y el humano la sube a la rama justo tras el commit `contract(L1D-268)`.
- **Cadena de versiones** `[S5 resp. 10]`: `clinical-api` 1.15.1 (`l1d-306`) → **1.16.0**; `rag-orchestrator` 1.10.1
  (`l1d-306`) → **1.11.0**. Quien rebase renumera y regenera `packages/api-contracts` (nunca fusiona generados a mano).
- **Decidido (usuario, 2026-11-03)** `[S5 resp. 12]`: se persiste el `trace_id` propio de cada turno (`data-model` §7),
  nunca el seudónimo (se corrige el texto de US-218 AC-8).
- **Decidido (usuario, 2026-11-03)** `[S5 resp. 13]`: los supuestos del change quedan aceptados, entre ellos las señales del
  clasificador `fuera_de_contexto` (D7) con el escenario de la pregunta comparativa legítima.

## Why

El oncólogo necesita aclarar una opción o un criterio de un análisis ya validado sin repetirlo entero (P6, JTBD 4). El
contrato quedó congelado en el Pre-S1, pero ningún backend lo implementa: G-Demo («análisis con debate de varias
preguntas», PRD E-17) no puede cerrarse sin este endpoint. Cada respuesta debe cumplir las mismas garantías que el análisis:
citas solo del corpus recuperado en ese turno, soporte NLI, persistencia antes de responder, desidentificación con seudónimo
nuevo y la memoria del análisis como contexto rotulado, nunca como cita ni soporte.

## What Changes

- **`clinical-api` (módulo `evidence-analysis`, un solo módulo):** `POST /platform/evidence-analyses/{analysisId}/follow-ups`
  y `GET …/follow-ups`. El POST valida (pregunta normalizada con la regla de US-250, límite `ANALYSIS_FOLLOWUP_MAX`,
  análisis `con_evidencia`), arma el request de `/rag/follow-up` desde el **snapshot desidentificado del análisis** con un
  `pseudoPatientId` y un `traceId` nuevos, la pregunta enmascarada (ADR-40) y `analysisMemory` (el análisis de origen como
  memoria rotulada, con `outcomesSince` enmascarado), recibe la respuesta completa, calcula `isNewSource` y
  `patientDataLinks`, **persiste el turno** en `clinical.analysis_follow_up` y responde `201 FollowUpTurn`. El GET lista
  los turnos en orden.
- **`rag-orchestrator`:** `POST /rag/follow-up` sin estado sobre el pipeline existente (recuperación, *reranker*, umbral
  RN-02, generación, validación de citas, soporte NLI, filtro RN-23). Prompt **nuevo** de seguimiento con la memoria en un
  bloque rotulado no citable; clasificador determinista `fuera_de_contexto` más una regla del prompt; sin segundo loop
  (`queryRewrite = no_aplica`, ya en spec). Normaliza la pregunta con `normalizar_pregunta()` (US-250).
- **Contratos (aditivos, ADR-26):** la `description` de `FollowUpCreate.question` y `RagFollowUpRequest.question`
  declara la normalización (como hizo US-250 con `query`); ejemplos nuevos `follow-up-sin-evidencia.json` y
  `rag-follow-up-sin-evidencia.json`. **`AnalysisBasis.maxFollowUps`** (entero ≥ 1, opcional solo por los análisis
  históricos; `"maxFollowUps": 10` en `con-evidencia-s4-tres-opciones.json`) para el contador «n de 10» de US-219
  `[S5 resp. 10]`. **Vacío del contrato congelado:** el `503` de `/rag/follow-up` solo admite `LOCAL_LLM_UNAVAILABLE` y
  el de `POST …/follow-ups` solo `LlmLocalNoDisponible`, pero el seguimiento falla cerrado igual que el análisis (NLI,
  recuperación, salida inválida, desidentificación). Se alinean con `/rag/query` y `POST /platform/evidence-analyses`
  convirtiendo el `503` en un `oneOf` que conserva la alternativa original. `oasdiff` 1.33.0 (medido 2026-11-03 con
  `scripts/ci/contracts-breaking.sh` sobre una copia) da **0 ERR** y un **WARN** por proveedor
  (`response-body-wrapped-in-one-of-original-preserved`, no rompe): no hace falta entrada en
  `contracts-breaking-excepciones.json`. La decisión aprobada (E-18/E-19) se registra en la tabla de ADR-26 (`H-2`).
- **Configuración:** `ANALYSIS_FOLLOWUP_MAX` en las Settings de `clinical-api` (RN-22), única fuente del límite y del
  `maxFollowUps` de la Base; `.env.example` → `H-1`.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `evidence-analysis-gateway`: requisitos nuevos del seguimiento en `clinical-api` (endpoint, límite, contexto anclado y
  desidentificado por turno, persistencia antes de responder, `isNewSource`, lectura del hilo, fallos de Backend 2).
- `evidence-analysis`: requisitos nuevos de `/rag/follow-up` (sin estado, memoria no citable, sin evidencia sin LLM,
  fuera de contexto, lenguaje prohibido, normalización de la pregunta).
- `analysis-basis`: «La Base declara el tope de preguntas de seguimiento» (`maxFollowUps`, `[S5 resp. 10]`).
- `api-contracts`: campo aditivo `AnalysisBasis.maxFollowUps` y `503` del seguimiento alineado con el del análisis.

**Bounded contexts:** contratos · clinical-platform · ai-services (frontend: ninguno; la UI es US-219).

## Dependencias

- ↪ Contrato congelado (US-033 AC-13, en `main`); pasarela y registro del análisis (US-052/US-053), desidentificación de la
  pregunta (ADR-40, `l1d-205-adr40-deteccion-pii`), pipeline `/rag/query` (US-055), soporte NLI (US-064), términos
  prohibidos (US-068), hasta 3 opciones (US-134); todo en `main`.
- ⛔ **`l1d-306-pregunta-nfc`** (US-250, misma oleada O1) solo para las tareas de normalización: reutiliza
  `normalizarPregunta()` / `esquemaPreguntaNormalizada` (`packages/clinical-language`) y `normalizar_pregunta()`
  (`app/domain/pregunta.py`). El resto del change no espera.
- 🔗 Coordinación con **`l1d-305-rn23-voz-propia-nivel-b`** (US-249, O1): el seguimiento usa el verificador común de RN-23;
  la lista ampliada (nivel B) le llega sola al mergearse. Sin bloqueo.
- 🔗 Consumida por: `l1d-269-hilo-seguimiento-ui` (US-219, hilo en la UI, O2; consume `maxFollowUps`) y US-142 (G-Demo,
  O4). Medida en: US-140.
- 🔗 Regresión [RN-15] activa desde S6 (DEC-22, US-148) · Regresión [RN-17] → US-198 (Post-MVP).

## Fuera de alcance

- La UI del hilo, el contador y los mensajes (US-219); «ampliar la antigüedad» en `sin_evidencia` (US-220, S6): la parte
  de UI del AC-3 es de esas historias.
- El `403` por opt-out de `analisis_ia` (RN-15): Regresión [RN-15] activa desde S6 (DEC-22), con **US-148** (dueña de
  RN-15) y G-Piloto; en el S5 solo hay datos sintéticos `[S5 resp. 8]`. El `403` por RBAC (`follow_ups:*`) sí se verifica
  aquí.
- `422 PACIENTE_EGRESADO` (RN-17, US-198 Post-MVP). Seguimiento sobre análisis `sin_evidencia` (non-goal: `422
  ANALISIS_SIN_EVIDENCIA`). Streaming de contenido (TBD-08). Memoria entre análisis y conversaciones guardadas como
  contexto de un análisis nuevo (US-189…US-191, US-255, S6). Agente de sub-consultas (Post-MVP).

## Impact

- `apps/clinical-api/openapi.yaml` (1.16.0: descripción, `503` del seguimiento y `AnalysisBasis.maxFollowUps`),
  `apps/rag-orchestrator/openapi.yaml` (1.11.0: descripción y `503` del seguimiento), `contracts/examples/` (+2,
  `con-evidencia-s4-tres-opciones.json` con `maxFollowUps` e `index.json`); generados solo vía `contracts:generate`;
  `docs/architecture/adr/ADR-26-contrato-congelado-y-excepciones-declaradas.md` (fila E-18/E-19, `H-2`).
- `apps/clinical-api/src/modules/evidence-analysis/` (`follow-up.*` dentro del módulo y el armado de la Base, que copia
  `ANALYSIS_FOLLOWUP_MAX` a `maxFollowUps`), `src/config/secciones.ts`, rutas; tests en `tests/integration/evidence-analysis/`.
- `apps/rag-orchestrator/app/api/` (router nuevo), `app/application/` (caso de uso de seguimiento sobre
  `RAGOrchestratorService`), `app/domain/` (clasificador y regla de memoria), `app/prompts/seguimiento.py`; fakes en
  `tests/support/`.
- Sin migración (la tabla existe desde US-038), sin dependencias nuevas. **Prompt nuevo → `ai-eval-runner`.**
