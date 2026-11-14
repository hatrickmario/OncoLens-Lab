# Proposal — l1d-321-chat-relevancia-faltante

## Trazabilidad

L1D-321 · US-264 · FEAT-12 (L1D-312, bloque 12-B, capacidad B) · Sprint 6 · Estimación **3** · HU-18 · RN-01, RN-02,
RN-04, RN-23, RN-24, RN-29 · AC-T1.2 · US-264 AC-1…AC-6 · `[S6 resp. 7]` · ADR-51 · Fuente:
`backlog/features/FEAT-12-chatbot-mvp.md` §US-264 (fixtures FX-12-b, FX-12-c, FX-12-e, FX-12-f); sprint:
`backlog/sprints/S6-refinamiento.md` (`[S6 resp. 7]`); decisión: `docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md`.
Medido en US-269 (suite `evaluate` del chat).

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-11-06)** `[S6 resp. 7]`: **LLM limitado al catálogo y la evidencia**. La explicación de por
  qué importa un dato faltante cita el corpus y pasa NLI; sin soporte se omite. No se inventan requisitos clínicos.
- **ADR-51**: el turno se resuelve en el grafo LangGraph de `rag-orchestrator` (nodo `faltantes`) con estado efímero.
- **RN-02 / US-238**: sin chunks sobre el umbral tras el único bucle de reescritura → «sin evidencia» sin invocar al LLM
  de generación.
- **D-01**: explicación de la relevancia según el catálogo y la evidencia, nunca indicación de solicitar o tratar (RN-23).

## Why

Tras ver los faltantes clasificados (US-263), el oncólogo necesita valorar si vale la pena conseguir un dato. Si la IA
explica la relevancia «de memoria», puede inventar requisitos clínicos. Con este change la respuesta separa lo que dice
el catálogo versionado (determinista) de lo que dice la evidencia recuperada (citada y verificada con NLI), y omite lo que
no tiene soporte.

## What Changes

- **Backend 2 (`rag-orchestrator`)**: subintención `relevancia` dentro del nodo `faltantes` del grafo
  (`l1d-316-chat-turn-langgraph`):
  - Identificación determinista del dato crítico preguntado contra `datos-criticos.json` (etiquetas y `sinonimos.json`
    del tipo de cáncer); sin coincidencia → respuesta «no es un dato crítico del catálogo vigente», sin bloque `catalogo`
    y sin LLM (AC-5).
  - Bloque `kind = "catalogo"` determinista (exento de cita, glosario §3): el dato es crítico en el catálogo (con su
    versión) y los criterios de `aplicabilidad.json` cuyo `destination` coincide con el del dato. Si ningún criterio lo
    usa (hoy, Ki-67 en `mama/aplicabilidad.json` 1.1.0), el bloque lo dice con un texto fijo, sin contenido clínico
    inventado.
  - Consulta al corpus con la etiqueta del ítem y el tipo de cáncer por la recuperación existente (umbral + único bucle de
    reescritura, US-238). Sin chunks sobre el umbral → solo bloque `catalogo` + aviso «sin evidencia», cero llamadas al
    LLM de generación (RN-02).
  - Con evidencia: prompt nuevo `chat-relevancia@0.1.0`, construido con el `PromptBuilder` de
    `l1d-108-prompt-instrucciones-datos`. La explicación del LLM va en bloques `kind = "evidencia"`, cada uno con ≥ 1
    `ChatCitation` a un chunk recuperado **en este turno** (RN-04, RN-24), sin términos prohibidos (RN-23) y con NLI
    `entailment` (RN-01); sin soporte, se omite. Cada omisión suma a `omittedClaims`. Si no queda ninguna afirmación,
    bloque `limitacion` determinista «La evidencia recuperada no explica la relevancia de este dato».
  - Rellena `notices[]` en el turno (RN-19, glosario §3).
- **Contrato**: **no sube versión** (glosario S6 §1); consume el contrato de `l1d-316` 1.12.0 (`ChatBlock` con
  `kind ∈ {catalogo, evidencia, limitacion}` del enum cerrado, `ChatCitation`, `omittedClaims`, `notices[]`). Ejemplos
  nuevos `contracts/examples/chat-turn-relevancia-*.json` (FX-12-e), uno por caso.
- Patrones de enrutado «¿por qué importa…?» añadidos a la regla pura de enrutado de `l1d-316` (un solo dueño).

## Capabilities

### New Capabilities

- Ninguna. La capacidad `patient-chat` la crea `l1d-316-chat-turn-langgraph`.

### Modified Capabilities

- `patient-chat`: requisitos nuevos (ADDED) de la subintención `relevancia` del turno `faltantes`; títulos distintos de
  los de `l1d-316`, `l1d-317`, `l1d-318` y del change de US-263, y se aplican tras ellos en el bulk-archive. Reutiliza sin
  cambiar `evidence-analysis` (validador de citas, NLI y términos prohibidos), `clinical-catalogs` (lectura de
  `datos-criticos.json`, `aplicabilidad.json` y `sinonimos.json`) y `completeness`.

## Bounded contexts

`ai-services` (nodo, regla de identificación del dato, bloque `catalogo`, prompt, validación) · `contratos` (ejemplos).
Sin cambios de `clinical-platform` más allá de lo que trae US-258/US-263 (Backend 1 ya envía `completeness` en el turno).
Sin `frontend` (US-267).

## Dependencias

- ↪ `l1d-108-prompt-instrucciones-datos` (L1D-108): `PromptBuilder` del prompt `chat-relevancia@0.1.0`.
- ↪ `l1d-316-chat-turn-langgraph` (US-259): grafo, `/chat/turn`, contrato rag 1.12.0 (`ChatBlock`, `ChatCitation`,
  `omittedClaims`, `notices[]`), enrutado y validador de soporte del turno.
- ↪ `l1d-320-faltantes-tipo-vacio` (US-263): nodo `faltantes`, `completeness` en el turno y catálogo `datos-criticos`
  (FX-12-c).
- ↪ `l1d-315-conversacion-paciente` (US-258): persistencia del turno antes de responder.
- ↪ ya en `main`: recuperación con umbral y bucle de reescritura (US-238), citas y NLI (US-063/US-064), términos
  prohibidos (US-068), afirmaciones atómicas (US-245).
- 🔗 Regresión [RN-23] → US-068 · Regresión [RN-15] activa desde S6 → US-148 (opt-out en todo turno con LLM; no es
  escenario de este change).

## Fuera de alcance

- La clasificación `gapType` y el catálogo 1.6.0 (US-263).
- Explicar la relevancia de datos fuera del catálogo con el LLM (AC-5: se responde que no es dato crítico).
- El turno de evidencia con aplicabilidad (US-265), fuentes y limitaciones (US-266), la UI (US-267) y la suite `evaluate`
  del chat (US-269).

## Impact

- `apps/rag-orchestrator/app/application/chat/` (subintención `relevancia` del nodo `faltantes`),
  `app/domain/chat/relevancia.py` (identificación del dato y bloque `catalogo`), `app/prompts/chat_relevancia.py`.
- `contracts/examples/chat-turn-relevancia-*.json`. Sin cambios en `apps/*/openapi.yaml`.
- Cambia un prompt: suite `evaluate` en el PR (OL-06).
