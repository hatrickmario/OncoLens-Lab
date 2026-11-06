# Design — l1d-322-chat-evidencia-seguimiento

## Context

Ver proposal.md (Why). Estado relevante:

- `rag-orchestrator`: `RAGOrchestratorService` resuelve `/rag/query` (recuperación, *reranker*, umbral y segundo loop de
  US-238, generación con afirmaciones atómicas de US-245, citas por alias, NLI, aplicabilidad de ADR-47/DEC-11, hasta 3
  opciones en orden RN-28). `/rag/follow-up` (US-218) es sin estado y su prompt rotula la memoria como no citable.
- `l1d-316-chat-turn-langgraph` crea el grafo con el nodo `evidencia` como esqueleto, el estado estructurado
  (`StructuredState`, con `ultimaEvidencia?` declarada en la 1.12.0 y **sin `analysisId`**, glosario §2), la ventana de
  memoria y `afirmacion_tiene_soporte_del_turno()` (RN-24).
- `l1d-108-prompt-instrucciones-datos` crea `PromptBuilder` con `memoria()` (`<memory citable="no">…</memory>`), que
  sustituye a `INICIO_DE_LA_MEMORIA` / `FIN_DE_LA_MEMORIA`.
- `l1d-315-conversacion-paciente` crea `clinical.conversation_turn` con `analysis_id` opcional y deja a esta historia la
  creación del `AIAnalysisRecord` (su D7).
- `clinical-api`: `analysis-record.ts` arma el registro trazable del gateway (AC-T1.4) y `rag-failure.ts` es la tabla
  única de fallos de Backend 2.

## Goals / Non-Goals

**Goals:** turno de evidencia con `EvidenceAnalysis` completo y registrado en la misma transacción que el turno; seguimiento
que re-recupera, cita solo lo del turno y no crea análisis; «sin evidencia» del seguimiento sin LLM (RN-02); afirmación
sin soporte NLI omitida; memoria no citable con `PromptBuilder.memoria()`; `ultimaEvidencia` rellena; RN-23/RN-19; fallo
del LLM sin registro.

**Non-Goals:** fuentes y limitaciones en el chat, incluido el bloque `limitacion` del análisis `sin_evidencia` (US-266,
L1D-323); UI (US-267); evaluación del chat (US-269).

## Decisions

### D1 — El nodo `evidencia` reutiliza el caso de uso de `/rag/query`, no lo copia

`nodo_evidencia.py` recibe por constructor el puerto `ConsultaDeEvidencia` (extraído de `RAGOrchestratorService` sin cambio
de comportamiento) y le pasa una `RagQueryInternalRequest` armada desde `ChatTurnRequest` (pregunta enmascarada,
`clinicalContext`, faltantes de `completeness[]`, `pseudoPatientId`, `traceId`). La respuesta `EvidenceAnalysis` se
devuelve tal cual en `evidenceAnalysis` y se resume en bloques `kind = evidencia` con las mismas citas. Una sola fuente de
reglas RN-01, RN-02, RN-04, RN-23 y RN-28. Alternativa descartada: herramienta LangChain sobre los clientes (duplicaría
validación; ADR-51 §1).

### D2 — Seguimiento: subintención con el análisis activo que manda Backend 1

Backend 1 es dueño de los ids: envía `activeAnalysisId` (último `analysis_id` de la conversación) en cada turno. La regla
pura `es_seguimiento_de_evidencia(pregunta, active_analysis_id)` en `app/domain/chat/enrutado.py` devuelve verdadero solo
con `activeAnalysisId` y referencia léxica al resultado («ese estudio», «la población del estudio», «esa opción»…); si la
regla no decide, la clasificación JSON de `l1d-316` admite `seguimiento_evidencia`. Sin `activeAnalysisId` nunca hay
seguimiento. El nodo de seguimiento:

1. vuelve a recuperar con la pregunta del turno (una llamada más al puerto de recuperación; sin segundo loop de reescritura,
   igual que `/rag/follow-up`, para que la memoria no llegue al prompt de reescritura);
2. **si ningún chunk supera el umbral** → «sin evidencia» (RN-02): no invoca al LLM (ni generación ni reescritura), responde
   un bloque `limitacion` determinista con el texto fijo de «sin evidencia» de `/rag/query` (sin literal nuevo) y deja
   `ultimaEvidencia.topRelevanceScore = null` (nunca `0.0`);
3. si hay chunks, genera con el prompt `chat-seguimiento-evidencia@0.1.0`, armado con `PromptBuilder` (L1D-108):
   `.pregunta()`, `.documento()` por fragmento del turno con su alias y `.memoria(respuesta_anterior)` para la respuesta
   del turno anterior (bloque `<memory citable="no">`). Nunca `INICIO_DE_LA_MEMORIA` / `FIN_DE_LA_MEMORIA`;
4. valida con `afirmacion_tiene_soporte_del_turno()`: cita solo a chunks recuperados en el turno + NLI. Lo respaldado solo
   por memoria y la afirmación citada cuyo NLI es `neutral` o `contradiction` se omiten y suman a `omittedClaims` (RN-01,
   RN-24, RN-04);
5. responde `intent = evidencia`, `subintent = seguimiento_evidencia`, sin `evidenceAnalysis`.

### D2b — `ultimaEvidencia` en el estado estructurado, sin ids de Backend 1

La regla pura `resumir_ultima_evidencia(pregunta, chunks_evaluados, top_relevance_score)` en
`app/domain/chat/ultima_evidencia.py` devuelve `{ query, chunkIds[], topRelevanceScore | null }` (glosario §2):

- `query`: la pregunta enmascarada del turno (la misma que ya viaja en `preguntasPrevias`);
- `chunkIds`: ids de los chunks evaluados por el *reranker* en ese turno, en el orden del *reranker* (así `l1d-323` obtiene
  el número de fragmentos evaluados y, cruzándolos con `citasMostradas`, los documentos citados);
- `topRelevanceScore`: el mayor `relevance_score` sobre el umbral, o `null` si ninguno lo supera (RN-02, `null ≠ 0.0`).

La rellenan el nodo `evidencia` (también con `status = sin_evidencia`) y el de seguimiento; la sobrescribe cada turno que
recupera. **Nunca lleva `analysisId`**: `activeAnalysisId` solo entra en `es_seguimiento_de_evidencia()` y no se copia al
estado, a los bloques, a la memoria ni a los *logs*. Backend 1 guarda `structuredState` tal cual y lo reenvía al
rehidratar (ADR-51).

### D3 — Persistencia en Backend 1: una transacción, registro antes del turno

`conversation.service.ts` delega en `registrarTurnoDeEvidencia()` (nuevo, en el repository de conversación): en una
`prisma.$transaction` inserta el `AIAnalysisRecord` con `buildAnalysisRecord()` de `analysis-record.ts` (reutilizado:
`analysis_type = analisis_evidencia`, `query_text` enmascarada, snapshot desidentificado sin `pseudoPatientId`,
`corpus_release`, `catalog_version`, modelos, `prompt_version`, `retrieval_params`, `top_relevance_score`) y después el
`conversation_turn` con su `analysis_id`. Solo tras el `COMMIT` responde `201` con `analysisId` y `evidenceAnalysis`
construidos desde lo persistido (RN-06). Seguimiento: el turno guarda `analysis_id = activeAnalysisId`, sin registro nuevo.
Si Backend 2 devolviera `subintent` sin que Backend 1 enviara `activeAnalysisId`, es un `200` incoherente de Backend 2 →
`502 ErrorServicioIa` con la fila existente `RESPUESTA_INTERNA_INVALIDA` (`respuesta_interna_invalida`) de la tabla única
de `rag-failure.ts`, sin persistir. **No `422 ErrorValidacion`**: el glosario §4 reserva el `422` del turno para un cuerpo
inválido del navegador; aquí la petición del oncólogo es válida y el fallo es de Backend 2, que es justo lo que la tabla
única ya mapea a `502` («`200` de rag-orchestrator que no cumple el contrato o es incoherente»). Un `422` haría que la UI
pidiera corregir una pregunta correcta.

### D4 — Fallos

`LLM-CAIDO`: el nodo propaga el error tipado existente (`LOCAL_LLM_UNAVAILABLE` → `503` en `/chat/turn`, glosario §4);
Backend 1 lo mapea con `rag-failure.ts` (`falloDe503`) a `503 ErrorLlmLocalNoDisponible` y no abre la transacción. El
ejemplo es `contracts/examples/chat-turn-llm-local-no-disponible.json` de `l1d-316`, reutilizado (sin duplicado propio).
RN-12: la matriz estricta de proveedores no cambia; ningún *fallback*.

### Alternativas (cara de revertir: contrato)

1. **Elegida:** `activeAnalysisId` en la petición y `subintent` en la respuesta; Backend 1 decide el enlace.
2. Backend 2 guarda el `analysisId` en su estado y lo devuelve: Backend 2 no conoce el id hasta que Backend 1 persiste, y
   tras una rehidratación dependería de un dato que Backend 1 ya tiene. Descartada.
3. Llamar a `/rag/follow-up` desde Backend 1 para el seguimiento: dos rutas para el mismo hilo y sin estado del grafo
   (contradice ADR-51). Descartada.

## Privacidad y ownership

- Frontera `clinical-api` → `rag-orchestrator` (`/chat/turn`, JWT de servicio): pregunta enmascarada (ADR-40, US-258),
  `pseudoPatientId` nuevo por turno, contexto desidentificado con fechas relativas, `completeness[]` y `activeAnalysisId`
  (UUID de un registro de Backend 1, no identifica al paciente ni lo vincula entre turnos fuera de la conversación).
  Backend 2 solo lo usa para enrutar: no lo guarda en el estado del hilo, en `ultimaEvidencia` ni en los *logs*.
- `ultimaEvidencia` lleva la pregunta enmascarada, ids de chunks del corpus y un puntaje: nada del paciente.
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; solo lee `corpus` y Milvus; no persiste nada del turno.
- El `AIAnalysisRecord` vive en `clinical` sin `pseudoPatientId` ni identidad (RN-10, RN-11). *Logs*: `traceId`, intención,
  subintención y contadores; nunca pregunta, memoria ni texto de opciones.
- RN-12: solo adapters locales; AC-6 verifica cero llamadas a adapters de nube.

## Contratos

**`rag-orchestrator`** (proveedor; consumidor `clinical-api` por el cliente generado) 1.12.0 → **1.13.0**, aditivo:

```yaml
ChatTurnRequest:
  activeAnalysisId?: uuid        # último analysis_id de la conversación (Backend 1)
ChatTurnResponse:
  subintent?: enum [seguimiento_evidencia]   # declarado en 1.12.0 por l1d-316; este change lo consume, no lo redefine
  evidenceAnalysis?: RagQueryInternalResponse   # ya existe (l1d-316); en rag el tipo es la respuesta de /rag/query; presente solo en el turno de análisis
```

`ultimaEvidencia` no cambia el contrato: su esquema ya está en `StructuredState` de la 1.12.0 (`l1d-316`); este change
solo la rellena.

**`clinical-api`** (proveedor; consumidor `web`) 1.25.0 → **1.26.0** (glosario §1), aditivo:

```yaml
ConversationTurn:
  analysisId?: uuid              # ya existe (l1d-315)
  evidenceAnalysis?: EvidenceAnalysis   # nuevo: el análisis persistido del turno de evidencia
```

Ejemplos nuevos (uno por caso): `chat-turn-request-evidencia.json`, `chat-turn-evidencia.json` (`LLM-OK`, `Q-HER2`),
`chat-turn-request-seguimiento.json`, `chat-turn-seguimiento-evidencia.json`, `chat-turn-seguimiento-sin-evidencia.json`,
`conversation-turn-evidencia.json`, `conversation-turn-seguimiento.json`. El `503` reutiliza
`chat-turn-llm-local-no-disponible.json` (`l1d-316`). Modelos Pydantic, Zod y cliente TS se generan
del spec (`sync-contracts`). oasdiff: solo propiedades opcionales nuevas. ADR-26: compatible.

## Dependencias y colaboradores

| Módulo | Nuevo/modificado | Depende de |
|---|---|---|
| `app/application/chat/nodo_evidencia.py` | nuevo | puerto `ConsultaDeEvidencia` |
| `app/application/chat/nodo_seguimiento_evidencia.py` | nuevo | puertos de recuperación, reranker, LLM, NLI; `afirmacion_tiene_soporte_del_turno()` |
| `app/application/rag_orchestrator_service.py` | modificado (Extract Method) | expone `ConsultaDeEvidencia` |
| `app/domain/chat/enrutado.py` | modificado | + `es_seguimiento_de_evidencia()` |
| `app/domain/chat/ultima_evidencia.py` | nuevo (puro) | + `resumir_ultima_evidencia()` |
| `app/prompts/chat_seguimiento_evidencia.py` | nuevo | `PromptBuilder` y `PromptBuilder.memoria()` (L1D-108) |
| `clinical-api …/conversation/conversation.service.ts` | modificado | repository por *factory*, `buildAnalysisRecord()` |
| `clinical-api …/conversation/conversation.repository.ts` | modificado | + `registrarTurnoDeEvidencia()` |

Reglas extraídas: `es_seguimiento_de_evidencia()`, `resumir_ultima_evidencia()`, `registrarTurnoDeEvidencia()` (RN-06).
Fakes: LLM falso que cuenta llamadas (`LLM-OK`, `LLM-CAIDO`, `LLM-SIN-SOPORTE`, `CHAT-MEMORIA`), retriever/*reranker*
falso que cuenta llamadas y puede devolver todo bajo el umbral, NLI falso (`entailment` / `neutral` por afirmación) y
adapters de nube que cuentan llamadas; todos en `tests/integration/test_bateria_de_contrato_de_adapters.py` y `test_bateria_de_contrato_nli.py`.

## Evaluación

Prompt nuevo (`chat-seguimiento-evidencia`) y nuevo camino al generador: `run-ai-eval` con `eval/configs/rn23-local.yaml
--suite all` y `eval/configs/s5.yaml --suite opciones`. Métricas OL-06: salidas prescriptivas = 0, precisión de citas,
fidelidad, «sin evidencia». Sin cambio de modelo, umbral, catálogo ni corpus. La suite del chat AC05 es de US-269.

## Risks / Trade-offs

- [Latencia: el seguimiento re-recupera] → mismo presupuesto que `/rag/follow-up`; medido en US-269.
- [Clasificación errónea de seguimiento] → sin `activeAnalysisId` nunca es seguimiento; ante duda se crea análisis nuevo
  (más registro, nunca menos trazabilidad).
- [Doble escritura] → transacción única; un fallo deja `500` sin registro ni turno (requisito de US-258).

## Migration Plan

Aditivo. Rollback: revertir el PR; el nodo vuelve al esqueleto de `l1d-316`.
