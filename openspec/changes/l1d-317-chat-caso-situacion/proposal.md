# Proposal — l1d-317-chat-caso-situacion

## Trazabilidad

L1D-317 · US-260 · FEAT-12 (L1D-312, bloque 12-B, capacidad A) · Sprint 6 · Estimación **5** · HU-15, HU-16 · FR-21 ·
RN-01, RN-06, RN-07, RN-10, RN-11, RN-12, RN-19, RN-23, RN-24 · ADR-34, ADR-51 · AC-02.1, AC-02.4, AC-02.5, AC-02.6,
AC-T1.2 · US-260 AC-1…AC-7 · `[S6 resp. 3]` · Fuente: `backlog/features/FEAT-12-chatbot-mvp.md` §US-260 (fixtures
FX-12-a, FX-12-b, FX-12-e, FX-12-f); sprint: `backlog/sprints/S6-refinamiento.md` (`[S6 resp. 3]`, tabla de historias);
decisión: `docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md` §1, §5, §6. Medido en US-269 (suite `evaluate`
del chat).

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-11-06)** `[S6 resp. 3]`: capacidad A con **LLM local + verificación**. El LLM recibe el caso
  desidentificado; cada afirmación lleva enlace al dato del paciente, verbalización determinista y NLI contra los hechos
  (ADR-34); lo no soportado se omite (RN-01, RN-10, RN-11, RN-12).
- **ADR-51**: el turno se resuelve en el grafo LangGraph de `rag-orchestrator` (nodo `caso`) con estado efímero; Backend 1
  persiste el turno antes de responder (RN-06) y es el único que conoce la tabla `factRef → recurso`.
- **D-01**: análisis del caso, nunca recomendación; RN-23 y RN-19 en cada turno.

## Why

Hoy el oncólogo tiene que recorrer la ficha y la vista de caso dato por dato para entender la situación de su paciente
(AS-IS P1, P4). Con el chat pregunta «¿cuál es la situación actual?» o «¿cómo ha evolucionado el PSA?» y recibe un resumen
en el que **cada afirmación enlaza al dato que la respalda** y pasa el NLI contra la verbalización determinista de ese
dato; lo que el LLM inventa o no enlaza se omite y se cuenta (AC-02.5, AC-T1.2).

## What Changes

- **Backend 1 (`clinical-api`)**: construye `caseFacts[]` a partir de la vista de caso (`timeline`, `priorTreatments`,
  `attributes`, `biomarkerSeries`, `provenance`) solo con datos vigentes (excluye `rechazado` y `reemplazado`, RN-07).
  Cada hecho lleva un `factRef` opaco por turno (`f1`, `f2`…), su verbalización determinista (ADR-34) y su día relativo;
  sin identidad, sin UUID y sin fechas absolutas (RN-10, RN-11). La tabla `factRef → (recurso, id, sourceDocumentId,
  fecha absoluta)` vive solo en Backend 1 y se usa para devolver `dataLinks` con la fecha tomada del registro, nunca del
  LLM. Los `dataLinks` de una serie salen en orden ascendente de día relativo (AC-02.4).
- **Backend 2 (`rag-orchestrator`)**: nodo `caso` del grafo de `l1d-316-chat-turn-langgraph`. El LLM local devuelve
  afirmaciones atómicas con `factRefs` (formato de US-245); el validador exige ≥ 1 `factRef` válido del turno y NLI
  `entailment` contra la verbalización de esos hechos. Sin enlace → se omite sin invocar NLI; sin soporte → se omite. Cada
  omisión suma a `omittedClaims` (RN-01, AC-T1.2). Prompt nuevo `chat-caso@0.1.0`.
- **Contrato**: **no sube versión** (glosario S6 §1). Consume el contrato de `l1d-316-chat-turn-langgraph` (rag
  1.12.0: `CaseFact` con `factRef`/`verbalization`/`relativeDay|null`, `ChatBlock` con el enum cerrado de 8 `kind` y
  `factRefs?`, `notices[]`) y el de `l1d-315-conversacion-paciente` (clinical-api 1.24.0: `ConversationTurn.dataLinks[]`
  de tipo `ConversationDataLink`). No añade ni redefine campos. Añade el ejemplo `contracts/examples/chat-turn-caso-situacion.json`
  (un fichero por caso; respuesta de `CHAT-CASO-OK`). `CHAT-CASO-INVENTA` y `CHAT-CASO-SIN-ENLACE` son salidas del LLM
  antes del filtro: van como fixtures del LLM falso en `apps/rag-orchestrator/tests/fixtures/llm/`, no como ejemplos del contrato.
- **Prompt** `chat-caso@0.1.0` construido con el `PromptBuilder` de `l1d-108-prompt-instrucciones-datos` (instrucciones
  en sistema, hechos y pregunta en bloques delimitados).
- **Avisos**: Backend 2 rellena `notices[]` en el turno (RN-19, glosario §3); Backend 1 los persiste y la UI solo los pinta.
- **Fixture** FX-12-b `P-CHAT`: lo crea `l1d-315-conversacion-paciente` (glosario §3); este change lo consume.

## Capabilities

### New Capabilities

- `patient-chat`: conversación del oncólogo sobre su paciente (FEAT-12). Este change aporta los requisitos de la
  capacidad A (situación, resumen y evolución del caso con enlaces a datos y verificación). La crea
  `l1d-316-chat-turn-langgraph` (US-259, que entra antes); los requisitos de este delta son distintos por título y se
  añaden a ella (ADDED; en el bulk-archive se aplican tras los de `l1d-316`). El registro de la conversación en Backend 1
  lo especifica `l1d-315-conversacion-paciente` en su propia capacidad. Se justifica como capacidad nueva porque el chat
  no encaja en `evidence-analysis` (no es un análisis de evidencia) ni en `case-timeline` (no es la vista de caso).

### Modified Capabilities

- Ninguna. Reutiliza sin cambiar: `case-timeline` (exclusión de `rechazado`/`reemplazado`), `deidentification`
  (contexto sin fechas absolutas ni identidad) y `analysis-basis` (verbalización determinista, ADR-34).

## Bounded contexts

`clinical-platform` (construcción de `caseFacts`, tabla de `factRef` y `dataLinks`) · `ai-services` (nodo `caso`,
validador de enlaces + NLI, prompt `chat-caso@0.1.0`, `notices[]`) · `contratos` (solo añade el ejemplo
`chat-turn-caso-situacion.json`; sin cambios de esquema ni de versión). Sin
`frontend`: la UI del chat es US-267.

## Dependencias

- ↪ `l1d-108-prompt-instrucciones-datos` (L1D-108): `PromptBuilder` y `PromptBuilder.memoria()`; va antes que todo el chat.
- ↪ `l1d-316-chat-turn-langgraph` (US-259): grafo, `/chat/turn`, contrato rag 1.12.0 (`CaseFact`, `ChatBlock`,
  `notices[]`), ejemplo `chat-turn-caso-ok.json`, registro de hilos.
- ↪ `l1d-315-conversacion-paciente` (US-258): endpoints de conversación, persistencia del turno antes de responder,
  contrato clinical-api 1.24.0 (`ConversationTurn`, `ConversationDataLink`), errores `503` y el seed sintético `P-CHAT`.
- ↪ ya en `main`: vista de caso `GET …/case` (US-088/US-090, US-094), desidentificación (US-049), NLI (US-063/US-064),
  afirmaciones atómicas (US-245), correcciones con `supersedes_id` (US-253, ADR-50), seed sintético (US-254).
- 🔗 Regresión [RN-23] → US-068 · Regresión [RN-12] → US-050 · Regresión [RN-15] activa desde S6 → US-148 (opt-out en
  todo turno con LLM del chat; no es escenario de este change).

## Fuera de alcance

- `POST …/case-summary` y `/case/summary` (FEAT-02c, `si-hay-capacidad`): el chat no los implementa.
- Preguntas sobre un examen, tratamiento o periodo concreto y la distinción documentado/interpretación (US-261), y
  contradicciones y correcciones (US-262).
- Faltantes (capacidad B) y evidencia (capacidad C), la UI del chat (US-267) y la suite `evaluate` del chat (US-269).
- Mostrar o reutilizar conversaciones anteriores (Post-MVP).

## Impact

- `apps/clinical-api/src/modules/evidence-analysis/` (submódulo `conversation`: constructor de hechos del caso).
- `apps/rag-orchestrator/app/application/chat/` (nodo `caso`), `app/prompts/chat_caso.py`, `app/domain/` (validación de
  enlaces del caso).
- `contracts/examples/chat-turn-caso-situacion.json` (nuevo) y fixtures `apps/rag-orchestrator/tests/fixtures/llm/chat-caso-inventa.json` y `chat-caso-sin-enlace.json`. Sin cambios en `apps/*/openapi.yaml` ni en `packages/api-contracts`.
- Cambia un prompt: suite `evaluate` en el PR.
