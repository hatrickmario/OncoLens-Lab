# Proposal — l1d-320-faltantes-tipo-vacio

## Trazabilidad

L1D-320 · US-263 · FEAT-12 (L1D-312, bloque 12-B, capacidad B) · Sprint 6 · Estimación **5** · HU-18 · FR-23 · RN-22,
RN-26, RN-29 · AC-04.1, AC-04.4, AC-04.5 · ADR-26, ADR-51 · US-263 AC-1…AC-7 · `[S6 resp. 10]` `[S6 resp. 17]` · Fuente:
`backlog/features/FEAT-12-chatbot-mvp.md` §US-263 (fixtures FX-12-a, FX-12-b, FX-12-c, FX-12-e, FX-12-f); decisiones:
`backlog/sprints/S6-refinamiento.md` (`[S6 resp. 10]`, `[S6 resp. 17]`), `docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md`.
Medido en US-269 (suite `evaluate` del chat).

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-11-06)** `[S6 resp. 10]`: «no buscado» = dato crítico faltante para el que no se ha
  procesado ningún documento del tipo que lo contendría; «no encontrado» = existe ese documento y el dato falta. El
  catálogo declara, por dato crítico, los tipos de documento fuente.
- **Decidido (usuario, 2026-11-06), supuesto aceptado a revisar con DEC-01** `[S6 resp. 17]`: «incompleto» =
  `presente_sin_verificar` **sin conflicto vigente** o menos valores vigentes que `minValues`; bastan los tipos `historia_clinica` y `examen`, sin
  subtipos en el MVP.
- **ADR-51**: el turno `faltantes` se resuelve en el grafo de `rag-orchestrator`; **sin LLM de generación** (verbalización
  determinista). Backend 1 es dueño de la clasificación (regla pura en `CompletenessService`).
- **Glosario del chat** (`backlog/sprints/S6-glosario-chat.md`, vinculante): versiones §1, `ChatCompletenessItem` §2 y
  reglas de faltantes §3.

## Why

El checklist de faltantes (FEAT-04) dice qué dato crítico falta, pero no por qué: el oncólogo no sabe si debe pedir un
examen nuevo, revisar uno que ya está o conciliar dos registros. Con esta historia, al preguntar «¿qué información falta?»
el chat clasifica cada vacío como **no encontrado**, **incompleto**, **por conciliar** o **no buscado**, y dice dónde
debería estar (tipo de documento fuente), de forma determinista y coherente con el checklist.

## What Changes

- **Catálogo (`packages/clinical-catalogs/`)**: campo obligatorio `sourceDocumentTypes` (array no vacío con valores del
  enum `document_type`: `historia_clinica`, `examen`) en cada ítem de `mama/datos-criticos.json` y
  `prostata/datos-criticos.json`, con `estado = "propuesta"` hasta DEC-01; JSON Schema y validador lo exigen; versión del
  catálogo **1.5.0 → 1.6.0** (manifest), montada de solo lectura en ambos backends. Fixture de test FX-12-c
  (`test/fixtures/test-1.6.0` o equivalente).
- **Backend 1 (`clinical-api`)**: regla pura `clasificarVacio(item, estado, documentosProcesados)` en el módulo
  `completeness`, con prioridad `por_conciliar` > `incompleto` > `no_buscado` > `no_encontrado` (glosario del chat §3);
  «incompleto» = `presente_sin_verificar` **sin conflicto vigente** o menos valores vigentes que `minValues`
  `[S6 resp. 17]`; solo cuenta un documento del paciente con `ocr_status = completado`. Campo **aditivo** `gapType`
  (nullable) en `CompletenessItem` de `GET /platform/patients/{id}/completeness`: **`clinical-api` 1.27.0 → 1.28.0**
  (glosario §1; ADR-26). El turno del chat rellena `gapType` en cada `ChatCompletenessItem` del `completeness[]` que ya
  arma l1d-315 (el `catalogVersion` y el `409` sin persistir ya los trae l1d-315).
- **Backend 2 (`rag-orchestrator`)**: nodo `faltantes` del grafo de `l1d-316-chat-turn-langgraph`: verbaliza de forma
  determinista un bloque `kind = faltante` por ítem con `gapType` no nulo, en el orden del catálogo, sin invocar al LLM;
  los tipos de documento fuente los lee de su copia montada del catálogo por `item` (no viajan en la petición). Las
  plantillas dicen «no se halló en los documentos procesados», **nunca** «ausente en el paciente». Los bloques
  `faltante` son deterministas y están **exentos de cita** (glosario §3). Sin faltantes, un bloque que dice que no faltan
  datos críticos según el catálogo y nombra su versión. El `409 CATALOG_VERSION_MISMATCH` de `/chat/turn` lo declara
  l1d-316; aquí se verifica con el catálogo 1.6.0.
- **Contratos**: solo `clinical-api` 1.28.0 (`gapType` en `CompletenessItem`). **`rag-orchestrator` sin versión propia**:
  `gapType` ya está en `ChatCompletenessItem` de la 1.12.0 (l1d-316) y `sourceDocumentTypes` no se añade al contrato.
  Ejemplos nuevos `contracts/examples/completeness-gap-type-p-chat.json`, `chat-turn-faltantes.json`,
  `chat-turn-faltantes-ninguno.json` (los de `/chat/turn` validan contra la 1.12.0); el `409` reutiliza el existente
  `rag-catalog-version-mismatch.json`.

## Capabilities

### New Capabilities

- Ninguna propia. Añade requisitos a `patient-chat` (la crea `l1d-316-chat-turn-langgraph`, turno y grafo) y a
  `chat-conversation` (la crea `l1d-315-conversacion-paciente`, persistencia en Backend 1), según la regla de nombres de
  FEAT-12.

### Modified Capabilities

- `completeness`: clasificación del vacío (`gapType`) y su exposición aditiva en `/completeness`.
- `clinical-catalogs`: `sourceDocumentTypes` obligatorio en cada dato crítico y versión 1.6.0.
- `patient-chat` (ADDED, tras `l1d-316`): turno `faltantes` determinista, exento de cita, coherente con el checklist,
  sin faltantes, y `409` de catálogo en `/chat/turn` verificado con 1.6.0.
- `chat-conversation` (ADDED, tras `l1d-315`): `gapType` del turno igual al de `/completeness` y `409` de catálogo
  verificado con 1.6.0 sin persistir el turno.

## Bounded contexts

`clinical-platform` (catálogo, regla `clasificarVacio`, `/completeness`, `gapType` en el `completeness[]` del turno) ·
`ai-services` (nodo `faltantes`, lectura de `sourceDocumentTypes` del catálogo montado) · `contratos` (`clinical-api`
1.28.0). Sin
`frontend`: la UI del chat es US-267 (y la columna «Datos críticos» de la vista de caso no cambia en este change).

## Dependencias

- ↪ `l1d-316-chat-turn-langgraph` (US-259): grafo, `/chat/turn`, `completeness[]` en la petición, enrutado determinista.
- ↪ `l1d-315-conversacion-paciente` (US-258): `POST …/conversations/{id}/turns`, persistencia del turno antes de
  responder, `catalogVersion` y el `409` sin persistir. **Cadena de versiones** (glosario §1): l1d-315 1.24.0 (luego 1.27.0 con L1D-213) → este
  change 1.28.0; si colisiona, renumera el segundo en mergear.
- ↪ ya en `main`: FEAT-04 (`/completeness`, catálogo `datos-criticos`, `CompletenessService`), US-041 (409 de catálogo).
- Fixture `P-CHAT` (FX-12-b): lo crea `l1d-315` (glosario §3); este lo consume.
- 🔗 Medido en: US-269. Regresión [RN-15] activa desde S6 → US-148 (no aplica a un turno sin LLM, pero el control vive en
  Backend 1 para todo turno del chat).

## Fuera de alcance

- Explicar por qué importa un faltante (US-264), preguntas sugeridas y la UI del chat (US-267).
- Subtipos de documento (`patologia`, `laboratorio`…): no en el MVP `[S6 resp. 17]`.
- Mostrar `gapType` en la columna «Datos críticos» de la vista de caso (posible historia posterior).
- Revisión clínica de los `sourceDocumentTypes` reales: el mapeo queda `estado = "propuesta"` hasta DEC-01.
- Exponer `sourceDocumentTypes` en `/completeness` o en `ChatCompletenessItem` (el glosario §1–§2 no lo incluye).

## Impact

- `packages/clinical-catalogs/` (schemas, validador, `datos-criticos.json`, manifest, fixtures de test).
- `apps/clinical-api/src/modules/completeness/` (`completeness.rules.ts`, `.service.ts`, `.repository.ts`, `.vista.ts`)
  y el armado del turno en `evidence-analysis/conversation`.
- `apps/rag-orchestrator/app/application/chat/` (nodo `faltantes`), `app/domain/chat/faltantes.py`, `app/api/chat_turn.py`.
- `apps/clinical-api/openapi.yaml` (1.28.0), `contracts/examples/`, generados. `apps/rag-orchestrator/openapi.yaml` no
  cambia.
- Cambia el catálogo: suite `evaluate` en el PR (OL-06).
