# Proposal — l1d-319-chat-contradicciones

## Trazabilidad

L1D-319 · US-262 · FEAT-12 (L1D-312, bloque 12-B, capacidad A) · Sprint 6 · Estimación **3** · HU-15 · RN-07, RN-08,
RN-26 · ADR-50, ADR-51, ADR-34 · AC-T3.2, AC-02.6 · US-262 AC-1…AC-5 · Fuente:
`backlog/features/FEAT-12-chatbot-mvp.md` §US-262 (fixtures FX-12-a, FX-12-b, FX-12-e `CHAT-CONFLICTO-RESUELVE`, FX-12-f);
sprint: `backlog/sprints/S6-refinamiento.md` (tabla de historias, DoR ✓ 5 AC); decisión:
`docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md`; prompt del usuario: `backlog/sprints/S6-prompt-chatbot.md`
§2.A y §3. Consume US-253 (correcciones con `supersedes_id`, ADR-50). Medido en US-269 (suite `evaluate` del chat).

Decisiones que se respetan (no se reabren):

- **`[S6 resp. 3]`**: capacidad A con LLM local + verificación; lo no soportado se omite (RN-01).
- **RN-08 / AC-T3.2**: el sistema nunca resuelve un conflicto ni modifica el expediente; muestra ambos valores y deja la
  decisión al oncólogo. **RN-26**: el aviso de conflicto no bloquea.
- **ADR-50**: una corrección crea una fila nueva con `supersedes_id`; el valor reemplazado solo se ve en `…/history`.

## Why

Cuando el expediente se contradice (dos estadios en documentos distintos) o fue corregido (HER2 `2+` → `3+`), el oncólogo
necesita verlo en la conversación con los dos valores y sus fuentes, para decidir él cuál es el correcto (`S6-prompt`
§2.A). Hoy el chat de US-260/US-261 trata cada hecho por separado y un LLM podría «elegir» uno de los dos valores en
conflicto sin decirlo.

## What Changes

- **Backend 1 (`clinical-api`)**: al armar `caseFacts[]` (US-260) **calcula los pares** de forma determinista: marca los
  hechos en conflicto (`provenance.conflict` o `requiere_revision` con `conflicts_with_id`) con el `factRef` de su
  contraparte (`CaseFact.conflictWith`) y los corregidos (`supersedesId` no nulo) con `CaseFact.corrected = true`. La
  verbalización del hecho corregido (`verbalizarDatoDelContexto()`, en código) lleva el sufijo fijo «(corregido)». El
  valor reemplazado sigue sin viajar (RN-07). Al volver resuelve cada `factRef` a un `ConversationDataLink` (`factRef`,
  `resourceType`, `resourceId`, `origin`, `relativeDay`, `recordedDate`); **no hay `historyPath`**: `l1d-325` deriva la
  ruta del histórico con `rutaDeHistorico(resourceType, resourceId)` sobre `/api/*`. Solo lectura: el turno nunca escribe
  en `clinical.*`.
- **Backend 2 (`rag-orchestrator`)**, nodo `caso`:
  - Pregunta de contradicciones (regla determinista en `domain/`): los bloques `kind = "conflicto"` (enum cerrado de
    `l1d-316`) se componen con una **función pura, sin LLM**, a partir de los pares que marcó Backend 1: texto con la
    etiqueta «Por conciliar», los dos valores y sus días relativos, y `factRefs` de ambos (≥ 1 `factRef`, RN-01). Sin
    pares → texto fijo «No hay contradicciones registradas en el expediente» y cero llamadas al LLM de generación.
  - Regla del validador para cualquier turno de caso: una afirmación que enlaza a un hecho en conflicto **sin** su
    contraparte se omite antes del NLI y suma 1 a `omittedClaims` (la IA no resuelve, AC-T3.2).
  - Rellena `notices[]` en todo turno con contenido generado (RN-19, glosario §3).
- **Contrato**: **no sube versión ni añade campos** (glosario S6 §1). Consume el contrato de `l1d-316` 1.12.0
  (`CaseFact.conflictWith?`, `CaseFact.corrected?`, `ChatBlock` con `kind = conflicto`) y el de `l1d-315` 1.24.0
  (`ConversationDataLink`, sin `historyPath`). Añade, un fichero por caso, `contracts/examples/chat-turn-caso-conflicto.json`
  y `chat-turn-caso-sin-contradicciones.json`; `CHAT-CONFLICTO-RESUELVE` es un fixture del LLM falso en
  `apps/rag-orchestrator/tests/fixtures/llm/`, no un ejemplo del contrato.

## Capabilities

### New Capabilities

- Ninguna propia. Los requisitos se añaden (ADDED, títulos distintos) a `patient-chat`, la capacidad que crea
  `l1d-316-chat-turn-langgraph` para el comportamiento del turno y del grafo de FEAT-12.

### Modified Capabilities

- Ninguna de `openspec/specs/`. Reutiliza sin cambiar `case-timeline` (`provenance.conflict`, exclusión de
  `reemplazado`), `human-control` (histórico por `supersedes_id`, US-253) y `deidentification` (días relativos).

## Bounded contexts

`clinical-platform` (cálculo de pares `conflictWith`/`corrected` en `caseFacts`, `ConversationDataLink`, invariante de
solo lectura) · `ai-services` (composición pura de bloques `conflicto`, respuesta sin contradicciones, regla del
validador, `notices[]`) · `contratos` (solo añade los ejemplos `chat-turn-caso-conflicto.json` y `chat-turn-caso-sin-contradicciones.json`). Sin `frontend`: el aviso visible
es de `l1d-324` y la ruta al histórico de `l1d-325`.

## Dependencias

- ↪ `l1d-317-chat-caso-situacion` (US-260): `caseFacts[]` con `factRef`, tabla `factRef → recurso`, validador de enlaces +
  NLI, `omittedClaims`, fixture `P-CHAT`.
- ↪ (transitivas) `l1d-316-chat-turn-langgraph` (US-259: grafo, `/chat/turn`, contrato rag 1.12.0 con
  `CaseFact.conflictWith?`/`corrected?` y `ChatBlock.kind = conflicto`) y `l1d-315-conversacion-paciente` (US-258:
  contrato clinical-api 1.24.0 con `ConversationTurn` y `ConversationDataLink`, persistencia, seed `P-CHAT`).
- 🔗 Convive con `l1d-318-chat-examen-tratamiento-periodo` (US-261): ambos amplían el nodo `caso`; sin orden obligatorio,
  el segundo en entrar rebasa.
- ↪ ya en `main`: correcciones con `supersedes_id` e histórico (US-253, ADR-50), `provenance.conflict` en la vista de caso.
- 🔗 `l1d-324` (US-267) pinta los bloques `conflicto` y `l1d-325` deriva la ruta del histórico (requisitos suyos) ·
  Medido en: `l1d-326` (US-269).
- 🔗 Regresión [RN-23] → US-068 · Regresión [RN-12] → US-050 · Regresión [RN-15] activa desde S6 → US-148.

## Fuera de alcance

- Resolver, conciliar o marcar un conflicto desde el chat; cualquier escritura en la historia clínica (`S6-prompt` §3).
- Clasificar el dato como `por_conciliar` en los faltantes (US-263).
- Mostrar el valor reemplazado en el chat: solo el enlace a `…/history`.
- La UI del aviso (US-267) y la suite `evaluate` del chat (US-269).

## Impact

- `apps/clinical-api/src/modules/evidence-analysis/` (submódulo `conversation`: `case-facts.builder.ts`, `data-links.ts`).
- `apps/rag-orchestrator/app/domain/chat/` (reglas puras de contradicciones), `app/application/chat/` (nodo `caso`),
  `app/config` (texto fijo).
- `contracts/examples/chat-turn-caso-conflicto.json` y `chat-turn-caso-sin-contradicciones.json` (nuevos); fixture `apps/rag-orchestrator/tests/fixtures/llm/chat-conflicto-resuelve.json`. Sin cambios en `apps/*/openapi.yaml` ni en `packages/api-contracts/`.
- No cambia el prompt `chat-caso` (la composición de conflictos es determinista); sin `evaluate` obligatorio.
