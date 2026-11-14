## Trazabilidad

L1D-316 · US-259 · FEAT-12 (bloque 12-A Plataforma del chat) · Sprint 6 · RN-01, RN-04, RN-10, RN-11, RN-12, RN-19, RN-22, RN-24 · ADR-26, ADR-51 (§1, §2, §4, §5) · `[S6 resp. 5]` `[S6 resp. 9]` · Regresión [SEG-13] → US-057 · Fuente: `backlog/features/FEAT-12-chatbot-mvp.md` § US-259; decisiones en `backlog/sprints/S6-refinamiento.md` y `docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md`; vocabulario del contrato en `backlog/sprints/S6-glosario-chat.md` (vinculante).

## Why

El S6 sustituye la «Ficha de análisis» por un chat sobre el paciente (FEAT-12). ADR-51 decidió orquestar cada turno con un grafo LangGraph dentro de `rag-orchestrator`, con estado efímero en memoria y rehidratación desde Backend 1. Sin este grafo, su contrato `POST /chat/turn` y su registro de hilos con TTL, ni `clinical-api` (US-258) ni los nodos de capacidad (US-260…US-266) tienen dónde apoyarse.

## What Changes

- Contrato aditivo de `apps/rag-orchestrator/openapi.yaml` 1.11.0 → **1.12.0**, dueño único del contrato completo de `POST /chat/turn` según el glosario canónico `backlog/sprints/S6-glosario-chat.md` §1–§2 y §4 (Gate 1, vuelta 1). Incluye `dataClassification` (petición) y `llmProvider` (respuesta) de L1D-204, que ya no toca el spec:
  - **Petición** `ChatTurnRequest`: `threadId`, `pseudoPatientId`, `traceId`, `question` (enmascarada), `dataClassification`, `catalogVersion`, `clinicalContext`, `caseFacts[]` (`CaseFact`), `completeness[]` (`ChatCompletenessItem`) y `rehydration?` (`ChatRehydration`, solo `turns[{question, intent, blocksText[], factRefs[]}]` y `structuredState`; nunca `resourceId`, UUID, fechas absolutas, `analysisId` ni `dataLinks`).
  - **Respuesta** `ChatTurnResponse`: `intent`, `subintent?`, `blocks[]` (`ChatBlock`, `kind` en un enum cerrado de 8 valores), `omittedClaims`, `evidenceAnalysis?`, `structuredState` (**requerido**, `StructuredState` con `ultimaEvidencia?` sin `analysisId`), `llmProvider` y `notices[]`; más `ChatCitation`.
  - **Errores** (glosario §4): `401 ErrorTokenServicioInvalido`, `404 ErrorHiloDesconocido` (esquema nuevo, `error = HILO_DESCONOCIDO`), `409 ErrorCatalogVersionMismatch`, `422 ErrorValidacion`, `503 oneOf [ErrorLlmLocalNoDisponible, ErrorSalidaLlmInvalida]` y `500 ErrorInterno`; se reutilizan los esquemas existentes y la `const` de `ErrorInterno` no se toca (ADR-26).
  - Ejemplos `contracts/examples/chat-turn-*.json` (uno por caso; este change es dueño de `chat-turn-caso-ok.json` y de `chat-turn-llm-local-no-disponible.json`, el `503` que reutilizan L1D-204 y L1D-322; L1D-317, L1D-318 y L1D-319 añaden sus propios `chat-turn-caso-<caso>.json`). Los `409` y `503 LLM_OUTPUT_INVALID` reutilizan los ejemplos existentes `rag-catalog-version-mismatch.json` y `rag-salida-llm-invalida.json`; este change es dueño de ambos errores en `/chat/turn` y los implementa y prueba y cliente TS regenerado en `packages/api-contracts/` (ADR-26).
- Grafo `StateGraph` en `app/application/chat/`: `enrutar` → `caso` | `faltantes` | `evidencia` | `fuentes_limitaciones` → `validar`. Los nodos de capacidad son esqueletos que delegan en los puertos hexagonales existentes; su contenido llega en US-260…US-266.
- Enrutado en dos pasos: reglas deterministas primero; si ninguna clasifica, una única clasificación JSON con el LLM local; salida inválida → `intent = "no_clasificada"` y petición de reformular, sin nodos de generación.
- Intención `fuera_de_alcance` (glosario §3): una pregunta sobre otro paciente, sobre un tipo de cáncer no habilitado o con un marcador de PII que no se pudo enmascarar (misma regla que `contexto_del_seguimiento.py`) recibe una respuesta determinista sin LLM. Una pregunta prescriptiva **no** es `fuera_de_alcance`: va a `evidencia` (L1D-322 AC-5).
- `notices[]` siempre relleno por Backend 2 en todo turno con contenido generado, con el literal de configuración sin punto final (RN-19, glosario §3).
- Registro de hilos efímero (`InMemorySaver` envuelto) con TTL (`CHAT_THREAD_TTL_SECONDS`), límite de hilos vivos con desalojo por antigüedad (`CHAT_MAX_THREADS`) y «hilo desconocido» tipado; rehidratación desde `rehydration` con resultado idéntico al de un hilo vivo.
- Memoria a corto plazo: estado estructurado completo + ventana de turnos previos recortada por tokens (`CHAT_MEMORY_MAX_TOKENS`, tokenizer del LLM), en el bloque `<memory citable="no">` que arma `PromptBuilder.memoria()` de L1D-108 (sin los rótulos `INICIO_DE_LA_MEMORIA` / `FIN_DE_LA_MEMORIA`); una afirmación respaldada solo por memoria se omite y cuenta en `omittedClaims` (RN-24, RN-04).
- Invariante: nada del paciente persiste en Backend 2 (sin ficheros, sin escrituras en `corpus` ni Milvus, sin texto de preguntas en los *logs*, sin `patientId` ni `pseudoPatientId` en el estado).
- Dependencias nuevas fijadas en `apps/rag-orchestrator/requirements.txt`: `langgraph` y `langchain-core` (MIT).
- Claves nuevas en `.env.example` (RN-22): `CHAT_THREAD_TTL_SECONDS` (1800), `CHAT_MAX_THREADS` (50), `CHAT_MEMORY_MAX_TOKENS` (1500); van por la sección `## humano`.

## Capabilities

### New Capabilities

- `patient-chat`: el turno de la conversación sobre el paciente — contrato interno `/chat/turn`, enrutado de la pregunta, estado efímero del hilo (TTL, límite, rehidratación), memoria acotada no citable e invariante de no persistencia en Backend 2. Se justifica como capacidad nueva porque ninguna de `openspec/specs/` cubre una conversación multi-turno con estado: `evidence-analysis` modela el análisis y su seguimiento sin estado (US-218), que este chat sustituye. Las historias hermanas de FEAT-12 (US-258, US-260…US-269) deberían añadir sus requisitos a esta misma capacidad.

### Modified Capabilities

- Ninguna. La regla de `api-contracts` (contratos aditivos, generación reproducible) se aplica sin cambiar sus requisitos.

## Bounded contexts

- **ai-services** (`apps/rag-orchestrator`): grafo, registro de hilos, endpoint, prompts y tests.
- **contratos**: `apps/rag-orchestrator/openapi.yaml`, `contracts/examples/chat-turn-*.json`, `packages/api-contracts/` (generado).
- clinical-platform y frontend: no se tocan (los consume US-258 y US-267).

## Dependencias

- ↪ `l1d-108-prompt-instrucciones-datos` (US-057): los prompts del turno (armado y clasificación) se construyen con `PromptBuilder` y la memoria con `PromptBuilder.memoria()`; L1D-108 se mergea **antes** que este change (glosario §1).
- ↪ L1D-313 (US-256 · ADR-51, historia de decisión sin change de código): decisión ya aceptada y mergeada en `docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md`; no bloquea.
- 🔗 Produce para: `l1d-204-llm-local-sin-nube` (sus campos `dataClassification` y `llmProvider` y el ejemplo `503` viven en esta 1.12.0), `l1d-315-conversacion-paciente` (US-258 consume el contrato de AC-1; el contrato de Backend 2 se mergea en la primera oleada) y para los nodos de `l1d-317-chat-caso-situacion`, `l1d-318-chat-examen-tratamiento-periodo` y las demás de US-260…US-266.
- 🔗 Medido en: US-269 (suite `evaluate` del chat). Regresión [SEG-13] → US-057 (prompt con instrucciones en sistema y datos delimitados).

## Fuera de alcance

- Checkpointer en PostgreSQL o disco (opción 3a de ADR-51, excluida) y `langgraph-api` (3c, excluida).
- Contenido de los nodos de capacidad (caso, faltantes, evidencia, fuentes y limitaciones): US-260…US-266.
- Persistencia de turnos, enmascarado de la pregunta y llamada de rehidratación desde Backend 1: US-258.
- `403` por opt-out en los turnos con LLM: Regresión [RN-15] activa desde S6 con US-148 (control en Backend 1).
- Migrar el agente acotado (FR-30) a un nodo del grafo (Post-MVP). Streaming de contenido (TBD-08).

## Impact

- Código: `apps/rag-orchestrator/app/application/chat/` (nuevo), `app/api/chat_turn.py` (nuevo), `app/application/ports.py` (puerto `ChatTurnPort`), `app/config/settings.py` (tres claves), `app/prompts/chat.py` (nuevo), `app/bootstrap.py` (cableado).
- API: `POST /chat/turn` interno, protegido con el JWT de servicio; cambio aditivo (oasdiff sin incompatibles).
- Dependencias: `langgraph`, `langchain-core`.
- Memoria del proceso de Backend 2: hasta `CHAT_MAX_THREADS` hilos vivos.
