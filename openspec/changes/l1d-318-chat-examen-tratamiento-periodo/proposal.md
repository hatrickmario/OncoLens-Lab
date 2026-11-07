# Proposal — l1d-318-chat-examen-tratamiento-periodo

## Trazabilidad

L1D-318 · US-261 · FEAT-12 (L1D-312, bloque 12-B, capacidad A) · Sprint 6 · Estimación **3** · HU-15 · FR-21 · RN-01,
RN-11, RN-19 · ADR-34, ADR-51 · AC-02.1, AC-02.3, AC-T1.2 · US-261 AC-1…AC-5 · Fuente:
`backlog/features/FEAT-12-chatbot-mvp.md` §US-261 (fixtures FX-12-a, FX-12-b, FX-12-e, FX-12-f); sprint:
`backlog/sprints/S6-refinamiento.md` (`[S6 resp. 3]`, tabla de historias, DoR ✓ 5 AC); decisión:
`docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md` §1, §5, §6; prompt del usuario:
`backlog/sprints/S6-prompt-chatbot.md` §2.A y §3. Medido en US-269 (suite `evaluate` del chat).

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-11-06)** `[S6 resp. 3]`: capacidad A con LLM local + verificación; cada afirmación con enlace
  al dato del paciente, verbalización determinista y NLI contra los hechos (ADR-34); lo no soportado se omite.
- **ADR-51**: el turno se resuelve en el nodo `caso` del grafo de `rag-orchestrator`; Backend 1 es el único que conoce la
  tabla `factRef → recurso` y la fecha absoluta.
- **D-01**: análisis del caso, nunca recomendación; RN-23 y RN-19 en cada turno.

## Why

El oncólogo pregunta a menudo por algo concreto («¿qué tratamiento previo ha recibido y cuándo?», «¿qué ocurrió en los
últimos 100 días?», «¿cuál fue el resultado de la gammagrafía?») y necesita saber qué está **documentado** en el
expediente, cuándo ocurrió y qué es **interpretación** de la IA, para no confundir un dato con una inferencia (AC-02.1,
AC-02.3, `S6-prompt` §2.A). El nodo `caso` de US-260 resume el caso, pero no distingue ambos tipos ni acota por periodo.

## What Changes

- **Modo `documentado`** en el nodo `caso` (Backend 2): el LLM solo elige los `factRefs` que quiere citar; el código
  inserta la verbalización determinista de cada hecho (ADR-34) byte a byte, sin texto del LLM. Cada bloque `documentado`
  enlaza un único hecho y los bloques de varios hechos salen en orden ascendente de día relativo (secuencia, AC-02.3).
- **Bloques `interpretacion`**: la afirmación del LLM que combina hechos se valida como en US-260 (≥ 1 `factRef` válido y
  NLI `entailment` contra la verbalización de esos hechos) y sale con `kind = "interpretacion"` y todos sus `factRefs`
  (Backend 1 los resuelve a `ConversationDataLink`). Este change **solo emite el `kind`**; el rótulo visible
  «Interpretación generada por IA» es un requisito de `l1d-324` (glosario S6 §3), no de este change.
- **Filtro por periodo**: Backend 2 extrae con reglas deterministas un intervalo relativo de la pregunta («últimos N
  días/semanas/meses/años», «último mes/año») y filtra `caseFacts` por día relativo antes de armar el prompt. Un hecho
  con intervalo que empieza antes del periodo y termina dentro se conserva con la marca «iniciado antes del periodo» en
  su verbalización (asumido, AC-3). Sin periodo reconocido no se filtra.
- **Sin datos documentados**: si todas las afirmaciones se omiten, el turno no tiene bloques y responde el texto fijo «No
  se encontró información documentada sobre lo preguntado en el expediente» (RN-01, `S6-prompt` §3).
- **Verbalización**: la misma de `l1d-317`, en código (`verbalizarDatoDelContexto()` de Backend 1, ADR-34), que llega
  en `CaseFact.verbalization`; no se usan plantillas del catálogo.
- **Prompt**: `chat-caso@0.2.0` (US-260) → `chat-caso@0.3.0` con el modo `documentado` y solo días relativos (RN-11),
  construido con el `PromptBuilder` de `l1d-108-prompt-instrucciones-datos`.
- **Avisos**: Backend 2 rellena `notices[]` en el turno (RN-19, glosario §3).
- **Contrato**: **no sube versión ni redefine esquemas** (glosario S6 §1). Consume el contrato de `l1d-316` 1.12.0:
  `ChatBlock` con su enum cerrado de 8 `kind`, del que este change solo emite `documentado` e `interpretacion`. Añade, un
  fichero por caso, `contracts/examples/chat-turn-caso-adt.json`, `chat-turn-caso-sin-datos.json` y `chat-turn-caso-periodo.json`.

## Capabilities

### New Capabilities

- Ninguna propia. Los requisitos se añaden a `patient-chat`, la capacidad nueva que crea
  `l1d-316-chat-turn-langgraph` para todo FEAT-12 (este delta la usa con requisitos de título distinto).

### Modified Capabilities

- Ninguna de `openspec/specs/`. Reutiliza sin cambiar `deidentification` (sin fechas absolutas), `case-timeline` y
  `analysis-basis` (verbalización determinista, ADR-34).

## Bounded contexts

`ai-services` (modo `documentado`, filtro por periodo, respuesta «sin datos documentados», prompt `chat-caso@0.3.0`,
`notices[]`) · `clinical-platform` (persistencia de los `ChatBlock` tal cual y test Supertest de AC-1 con el
`recordedDate` del registro) · `contratos` (solo añade los ejemplos `chat-turn-caso-adt.json`, `chat-turn-caso-sin-datos.json` y `chat-turn-caso-periodo.json`). Sin `frontend`: el rótulo
visible es requisito de `l1d-324`.

## Dependencias

- ↪ `l1d-317-chat-caso-situacion` (US-260): nodo `caso`, `caseFacts[]` con `factRef` y día relativo, tabla
  `factRef → recurso` en Backend 1, validador de enlaces + NLI, `omittedClaims`, prompt `chat-caso@0.1.0`.
- ↪ `l1d-108-prompt-instrucciones-datos` (L1D-108): `PromptBuilder` del prompt `chat-caso@0.3.0`.
- ↪ (transitivas) `l1d-316-chat-turn-langgraph` (US-259: grafo, `/chat/turn`, contrato rag 1.12.0, ejemplo
  `chat-turn-caso-ok.json`) y `l1d-315-conversacion-paciente` (US-258: conversación, persistencia del turno, contrato
  clinical-api 1.24.0 con `ConversationTurn` y `ConversationDataLink`).
- 🔗 `l1d-324` (US-267) consume `kind = "interpretacion"` para su rótulo (requisito suyo) · Medido en: `l1d-326` (US-269).
- 🔗 Regresión [RN-23] → US-068 · Regresión [RN-12] → US-050 · Regresión [RN-15] activa desde S6 → US-148.

## Fuera de alcance

- Contradicciones y correcciones del expediente (US-262, `l1d-319`).
- Rótulo visible en la UI y su accesibilidad (US-267); suite `evaluate` del chat con mama y próstata (US-269).
- Periodos con fechas absolutas en la pregunta («desde marzo de 2025»): Backend 2 nunca ve fechas absolutas; no se
  reconocen como periodo en el MVP (asumido).
- Interpretación de imágenes o resultados de un examen no procesado: si no hay hecho, se dice que no hay información.

## Impact

- `apps/rag-orchestrator/app/application/chat/` (nodo `caso`), `app/domain/` (reglas puras: periodo de la pregunta,
  filtro por día relativo, bloques documentados), `app/prompts/chat_caso.py`, `app/config` (texto fijo).
- `apps/clinical-api/src/modules/evidence-analysis/` (submódulo `conversation`: persiste los bloques y resuelve
  `ConversationDataLink`, sin lógica nueva).
- `contracts/examples/chat-turn-caso-adt.json`, `chat-turn-caso-sin-datos.json` y `chat-turn-caso-periodo.json` (nuevos). Sin cambios en `apps/*/openapi.yaml` ni en `packages/api-contracts/`.
- Cambia un prompt (`chat-caso@0.3.0`): suite `evaluate` en el PR.
