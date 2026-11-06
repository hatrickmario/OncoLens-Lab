# Design — l1d-316-chat-turn-langgraph

## Context

Ver proposal.md (Why). Estado en `main` relevante:

- `rag-orchestrator` es hexagonal: `app/api/` (routers delgados con `crear_router_interno` y JWT de servicio), `app/application/` (servicios y `ports.py`), `app/domain/` (reglas puras), `app/infrastructure/` (adapters y `fake/`). Settings en `app/config/settings.py`.
- El único hilo existente es `/rag/follow-up` (US-218), **sin estado**. `l1d-108-prompt-instrucciones-datos` (US-057, se mergea antes que este change) introduce `PromptBuilder` (`app/application/prompt_builder.py`) con instrucciones en `system` y datos en bloques delimitados, y sustituye los rótulos `INICIO_DE_LA_MEMORIA` / `FIN_DE_LA_MEMORIA` por el bloque `<memory citable="no">` de `PromptBuilder.memoria()` (RN-24).
- Vocabulario vinculante del contrato: `backlog/sprints/S6-glosario-chat.md` (§2 esquemas, §3 reglas, §4 errores). Si este design discrepa, manda el glosario.
- Reloj inyectado (`Clock`), generador de `traceId` inyectado, tokenizer local (`app/infrastructure/tokenizer/`, `tokenizers` sin hub).
- LLM local con 8192 tokens de contexto (ADR-39). No hay LangChain ni LangGraph.
- Decisión vigente: ADR-51 opción 3b (no se reabre).

## Goals / Non-Goals

**Goals:** esqueleto del grafo del turno con enrutado, registro de hilos efímero (TTL, límite, rehidratación), memoria acotada no citable, endpoint `/chat/turn` y su contrato, e invariante de no persistencia verificada por test.

**Non-Goals:** contenido de los nodos de capacidad (US-260…US-266); persistencia, enmascarado y rehidratación del lado de Backend 1 (US-258); checkpointer persistente o `langgraph-api` (excluidos por ADR-51).

## Decisions

### D1 — LangGraph solo como orquestador; los nodos llaman a puertos

`app/application/chat/grafo.py` construye un `StateGraph` con nodos `enrutar` → (`caso` | `faltantes` | `evidencia` | `fuentes_limitaciones`) → `validar`, y una arista condicional desde `enrutar` que, con `no_clasificada`, salta directo a la respuesta de reformular. Cada nodo recibe por constructor los puertos ya existentes (recuperación, *reranker*, NLI, LLM, validador de citas); en este change los nodos de capacidad son esqueletos que devuelven bloques vacíos y delegan. LangChain no sustituye adapters (ADR-51 §1). Alternativa descartada: grafo con herramientas LangChain sobre clientes propios (duplicaría los adapters y saltaría el validador).

### D2 — Registro de hilos propio alrededor de `InMemorySaver`

`RegistroDeHilos` (`app/application/chat/registro_de_hilos.py`) envuelve un `InMemorySaver` y mantiene `ultima_actividad` por `threadId` en un `OrderedDict`. En cada turno: purga los vencidos (`ahora - ultima_actividad > CHAT_THREAD_TTL_SECONDS`, reloj inyectado), y al crear un hilo con `len == CHAT_MAX_THREADS` desaloja el menos reciente (borra también su checkpoint). Un turno sobre hilo ausente sin `rehydration` lanza `HiloDesconocido` **antes** de entrar al grafo, de modo que ningún adapter se invoca (AC-4, AC-6). Con `rehydration` el registro siembra el estado estructurado y la ventana de turnos y continúa. Alternativa descartada: TTL por tarea en segundo plano (no determinista en tests; la purga perezosa basta).

### D3 — Enrutado: regla pura + clasificación JSON

`app/domain/chat/enrutado.py`: `clasificar_por_reglas(pregunta) -> Intencion | None` (regla pura sobre la pregunta normalizada NFC, con patrones léxicos en español; los patrones viven en el módulo de dominio, un solo dueño). Si devuelve `None`, el nodo `enrutar` pide al LLM una clasificación con salida JSON `{"intent": ...}` validada con Pydantic; cualquier fallo de parseo o valor fuera de la lista → `no_clasificada` (AC-3). Una sola llamada; sin reintento. El prompt de clasificación se arma con `PromptBuilder` (la pregunta en `<question>`).

`fuera_de_alcance` (glosario §3) también se decide por regla pura, **antes** que las demás: `es_fuera_de_alcance(pregunta, clinical_context, settings)` en `app/domain/chat/enrutado.py` reutiliza la regla de `app/domain/contexto_del_seguimiento.py` (`clasificar_contexto_del_seguimiento`) (pregunta sobre otro paciente, tipo de cáncer fuera de `ENABLED_CANCER_TYPES`, marcador de PII sin enmascarar) importándola, no copiándola. La respuesta es determinista (bloque `limitacion` con texto de configuración), sin LLM ni nodos de generación. Una pregunta prescriptiva **no** es `fuera_de_alcance`: va a `evidencia`, que responde sin lenguaje prescriptivo (L1D-322 AC-5).

### D4 — Memoria acotada por tokens

`app/domain/chat/memoria.py`: `ventana_de_memoria(turnos, presupuesto, contar_tokens) -> list[TurnoPrevio]` recorre desde el último hacia atrás y para al superar `CHAT_MEMORY_MAX_TOKENS`; el estado estructurado (`StructuredState`: `intentsVistos[]`, `preguntasPrevias[]`, `opcionesMostradas[]`, `citasMostradas[]` por `chunkId`, `faltantesSenalados[]`, `ultimaEvidencia?` = `{query, chunkIds[], topRelevanceScore|null}` **sin `analysisId`**, que Backend 2 nunca conoce; lo rellena L1D-322) siempre entra entero. `contar_tokens` es un puerto `ContadorDeTokens` implementado con el tokenizer del LLM (adapter sobre `tokenizers`, fichero local); el fake cuenta palabras y pasa el mismo test de contrato. `app/prompts/chat.py` (`armar_prompt_del_turno`, `armar_prompt_de_clasificacion`) devuelve `PromptSeparado` de `PromptBuilder` (L1D-108): instrucciones en `system`, pregunta en `<question>`, `caseFacts` verbalizados en `<patient_data>` y la ventana de memoria con `PromptBuilder.memoria(...)` (`<memory citable="no">`). Nunca se usan `INICIO_DE_LA_MEMORIA` / `FIN_DE_LA_MEMORIA`; el test de arquitectura `test_prompts_por_constructor.py` de L1D-108 cubre este módulo sin cambios.

### D5 — Memoria nunca es soporte (RN-24)

El nodo `validar` construye el conjunto de soportes admitidos solo con los chunks recuperados en el turno y los `caseFacts` del turno; cualquier afirmación cuyo único respaldo esté fuera de ese conjunto se omite y suma a `omittedClaims`. Se extrae `afirmacion_tiene_soporte_del_turno()` (RN-24/RN-04) en `app/domain/chat/soporte.py`, reutilizando `app/domain/citations.py`.

### D6 — Rehidratación determinista y acotada

El prompt se arma con una función pura del estado (`armar_prompt_del_turno(estado, pregunta)`); el hilo vivo y el reconstruido llegan al mismo estado, por lo que el hash del prompt coincide (AC-5). Orden estable de claves y de turnos; sin marcas de tiempo absolutas en el prompt. `ChatRehydration` solo admite `turns[{question, intent, blocksText[], factRefs[]}]` y `structuredState` (`additionalProperties: false` en cada nivel): un `resourceId`, UUID, fecha absoluta, `analysisId` o `dataLinks` en la petición → `422 ErrorValidacion` sin eco. Backend 1 lo construye con `construirRehidratacion()` (L1D-315).

### D7 — Avisos siempre desde Backend 2 (RN-19)

`ChatTurnService` rellena `notices[]` en **todo** turno con contenido generado (intenciones `caso`, `faltantes`, `evidencia` y `fuentes_limitaciones`) con el literal de configuración de RN-19 sin punto final; la UI solo los pinta y nunca los toma de su propia configuración (glosario §3). Los mensajes del sistema (`fuera_de_alcance`, `no_clasificada`) no son contenido generado: devuelven `notices = []` y la UI los rotula «no generado por IA». Una función con nombre propio, `avisos_del_turno(settings)`, es la única dueña del literal en el chat.

### D8 — `llmProvider` y `dataClassification` en el contrato desde la 1.12.0

Los campos de L1D-204 se pliegan aquí (glosario §1) para que la petición nazca con `dataClassification` requerido y no haya un cambio incompatible posterior. En este change, `llmProvider` vale `local` (único adapter en producción) y `dataClassification` se valida y propaga al estado del turno; el selector de proveedor que aplica RN-12 por petición lo implementa L1D-204 sobre el puerto LLM existente, sin tocar el spec.

### Alternativas (decisión cara de revertir: contrato y privacidad)

1. **Elegida: estado en memoria + rehidratación desde Backend 1** (ADR-51 3b).
2. Checkpointer en PostgreSQL `corpus` — excluida: persistiría estado del paciente en Backend 2 (rompe el aislamiento de `rag_corpus`, RN-10/RN-11).
3. Sin estado, todo el historial en cada turno — descartada por ADR-51: el usuario eligió LangGraph para validar la hipótesis y extender la orquestación.

## Privacidad y ownership

- Frontera: `clinical-api` → `rag-orchestrator` por `POST /chat/turn` con JWT de servicio. Viajan solo la pregunta **ya enmascarada** por Backend 1 (ADR-40, US-258), `pseudoPatientId` por turno, `clinicalContext` y `caseFacts[]` desidentificados (fechas relativas), `completeness[]` y, si aplica, `rehydration` con turnos enmascarados.
- `threadId` es un UUID aleatorio de la conversación emitido por Backend 1; nunca `patientId` ni `pseudoPatientId` (`[S6 resp. 5]`). El estado del hilo no guarda `pseudoPatientId` (se usa solo dentro del turno) ni `patientId` (que nunca llega).
- Sin persistencia: ni disco, ni temporales, ni schema `corpus`, ni Milvus (las escrituras de Milvus solo existen en la ingesta). Los *logs* registran `traceId`, `threadId`, intención, latencias y contadores; nunca el texto de la pregunta, de la memoria ni de la respuesta.
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; el rol `rag_corpus` no cambia y sus tests de *permission denied* siguen en la suite (AC-8).
- RN-12: los nodos usan solo los adapters locales ya configurados; ningún *fallback* a la nube.

## Contratos

Proveedor: `rag-orchestrator` (`apps/rag-orchestrator/openapi.yaml` 1.11.0 → **1.12.0**, aditivo). Consumidor: `clinical-api` vía el cliente generado de `packages/api-contracts/` (lo usa US-258). Este change es el **dueño único** del contrato de `/chat/turn` en la 1.12.0 (glosario §1); L1D-322 (1.13.0) y L1D-320 (1.14.0, si queda algo) solo añaden campos opcionales; L1D-317, 318, 319, 321 y 323 rellenan campos ya definidos.

Diff propuesto (vocabulario del glosario §2 y errores del §4):

```yaml
paths:
  /chat/turn:
    post:
      operationId: chatTurn
      security: [{ serviceJwt: [] }]
      requestBody: { $ref: ChatTurnRequest }
      responses:
        '200': ChatTurnResponse
        '401': ErrorTokenServicioInvalido          # existente
        '404': ErrorHiloDesconocido                # NUEVO; Backend 1 lo atrapa y rehidrata
        '409': ErrorCatalogVersionMismatch         # existente
        '422': ErrorValidacion                     # existente, sin eco
        '503': oneOf [ErrorLlmLocalNoDisponible, ErrorSalidaLlmInvalida]   # existentes
        '500': ErrorInterno                        # existente; su const ERROR_INTERNO no se toca (ADR-26)
components:
  schemas:
    ErrorHiloDesconocido:   # additionalProperties: false
      required: [error, message, traceId]
      error: { const: HILO_DESCONOCIDO }
      message: string (fijo)
      traceId: string
    ChatTurnRequest:        # additionalProperties: false
      required: [threadId, pseudoPatientId, traceId, question, dataClassification, catalogVersion, clinicalContext, caseFacts, completeness]
      threadId: uuid                                # de la conversación; nunca patientId ni pseudoPatientId
      pseudoPatientId: (patrón existente, por turno)
      traceId: TraceId
      question: string (enmascarada por Backend 1)
      dataClassification: DataClassification (existente)   # de L1D-204, RN-12
      catalogVersion: string (patrón existente)
      clinicalContext: ClinicalContext (existente)
      caseFacts: CaseFact[]
      completeness: ChatCompletenessItem[]
      rehydration?: ChatRehydration
    CaseFact:               # additionalProperties: false
      required: [factRef, kind, verbalization, relativeDay, reviewStatus]
      factRef: string ^f[0-9]+$
      kind: string
      verbalization: string
      relativeDay: integer | null
      reviewStatus: (enum existente)
      seriesKey?: string
      conflictWith?: string ^f[0-9]+$
      corrected?: boolean
    ChatCompletenessItem:   # additionalProperties: false; SIN provenance
      required: [item, label, status, gapType, destination]
      item: string
      label: string
      status: enum [presente_verificado, presente_sin_verificar, faltante, no_aplica]   # mismo enum que la completitud de clinical-api
      gapType: enum [no_encontrado, incompleto, por_conciliar, no_buscado] | null   # null si está presente
      destination: string
    ChatRehydration:        # additionalProperties: false en cada nivel
      required: [turns, structuredState]
      turns: [{ question, intent, blocksText: string[], factRefs: string[] }]   # nada más: sin resourceId, UUID, fechas absolutas, analysisId ni dataLinks
      structuredState: StructuredState
    StructuredState:        # additionalProperties: false
      required: [intentsVistos, preguntasPrevias, opcionesMostradas, citasMostradas, faltantesSenalados]
      intentsVistos: ChatIntent[]
      preguntasPrevias: string[]
      opcionesMostradas: string[]
      citasMostradas: string[]          # chunkId
      faltantesSenalados: string[]
      ultimaEvidencia?: { query: string, chunkIds: string[], topRelevanceScore: number [0,1] | null }   # SIN analysisId; lo rellena L1D-322
    ChatTurnResponse:       # additionalProperties: false
      required: [intent, blocks, omittedClaims, structuredState, llmProvider, notices]
      intent: ChatIntent = enum [caso, faltantes, evidencia, fuentes_limitaciones, no_clasificada, fuera_de_alcance]
      subintent?: enum [seguimiento_evidencia]   # cerrado aquí; L1D-322 lo consume, no lo redefine
      blocks: ChatBlock[]
      omittedClaims: integer >= 0
      evidenceAnalysis?: EvidenceAnalysis (existente)
      structuredState: StructuredState  # REQUERIDO; Backend 1 lo guarda para rehidratar
      llmProvider: enum [local, nube]   # de L1D-204; mismo enum que RagMeta.llmProvider
      notices: string[]                 # literal RN-19 de configuración, sin punto final
    ChatBlock:              # additionalProperties: false
      required: [kind, text]
      kind: enum [documentado, interpretacion, catalogo, evidencia, conflicto, faltante, limitacion, fuente]   # CERRADO; ningún otro change lo redefine
      text: string
      factRefs?: string[] ^f[0-9]+$
      citations?: ChatCitation[]
    ChatCitation:           # additionalProperties: false
      required: [chunkId, documentId, sourceTitle, chunkOrdinal, chunkCount, chunkTextSnapshot]
      # metadatos copiados del catálogo del corpus; ausente → «No disponible» (RN-25, RN-04)
```

Reglas del contrato que verifica el proveedor (glosario §3): `documentado`, `interpretacion` y `conflicto` llevan ≥ 1 `factRef`; `evidencia` lleva ≥ 1 `ChatCitation` y pasa NLI; `faltante`, `catalogo`, `limitacion` y `fuente` son deterministas y están exentos; el bloque `fuente` describe un documento con metadatos del catálogo y sin `chunkId`.

Ejemplos nuevos en `contracts/examples/`, uno por caso: `chat-turn-request.json`, `chat-turn-request-rehidratacion.json`, `chat-turn-caso-ok.json` (dueño este change; lo consume US-258 AC-2; L1D-317/318/319 añaden sus propios `chat-turn-caso-<caso>.json`), `chat-turn-no-clasificada.json`, `chat-turn-fuera-de-alcance.json`, `chat-turn-hilo-desconocido.json` (`404 ErrorHiloDesconocido`) y `chat-turn-llm-local-no-disponible.json` (`503 ErrorLlmLocalNoDisponible`, dueño este change; lo reutilizan L1D-204 y L1D-322). El `409 ErrorCatalogVersionMismatch` y el `503 ErrorSalidaLlmInvalida` de `/chat/turn` son de este change (los implementa y prueba) y reutilizan los ejemplos existentes `rag-catalog-version-mismatch.json` y `rag-salida-llm-invalida.json`. Las salidas del LLM previas al filtro (p. ej. `CHAT-CASO-INVENTA`) no son ejemplos del contrato: son fixtures del LLM falso en `apps/rag-orchestrator/tests/fixtures/llm/`. Todos con `dataClassification = sintetico`, `llmProvider = local` en las respuestas `200` y `notices[]` con el literal de RN-19. Los modelos Pydantic (`app/schemas/generated`) y el cliente TS se **generan** del spec (skill `sync-contracts`); nunca se editan a mano. oasdiff: solo adiciones (nuevo path y nuevos esquemas); ningún esquema existente cambia. Compatibilidad con ADR-26: sí; sin excepción en `contracts-breaking-excepciones.json`.

## Dependencias y colaboradores

| Módulo | Nuevo/modificado | Depende de |
|---|---|---|
| `app/api/chat_turn.py` | nuevo | `ChatTurnPort` (puerto), `crear_router_interno`, `pregunta_normalizada_o_422` |
| `app/application/chat/servicio_de_turno.py` (`ChatTurnService` implementa `ChatTurnPort`) | nuevo | `RegistroDeHilos`, grafo, `Clock`, `TraceIdGenerator` |
| `app/application/chat/grafo.py` | nuevo | puertos de recuperación, reranker, NLI, LLM, validador de citas; `ContadorDeTokens` |
| `app/application/chat/registro_de_hilos.py` | nuevo | `InMemorySaver` (langgraph), `Clock`, `Settings` |
| `app/domain/chat/enrutado.py`, `memoria.py`, `soporte.py`, `estado.py` | nuevos (reglas puras) | `app/domain/citations.py`; la regla de `contexto_del_seguimiento.py` (`fuera_de_alcance`) |
| `app/prompts/chat.py` | nuevo | `PromptBuilder` y `PromptBuilder.memoria()` de L1D-108 (`app/application/prompt_builder.py`) |
| `app/application/ports.py` | modificado | + `ChatTurnPort`, `ContadorDeTokens` |
| `app/config/settings.py` | modificado | + `chat_thread_ttl_seconds`, `chat_max_threads`, `chat_memory_max_tokens` |
| `app/bootstrap.py` | modificado | cableado del servicio con adapters reales o `fake` |

Reglas extraídas con nombre propio: `clasificar_por_reglas()`, `es_fuera_de_alcance()`, `avisos_del_turno()` (RN-19), `ventana_de_memoria()`, `afirmacion_tiene_soporte_del_turno()` (RN-24/RN-04), `hilo_vencido()` (RN-22). Los valores calibrables se leen solo de `Settings`.

Fakes que toca y su test de contrato: `FakeLlm` del chat (respuestas `CHAT-RUTA`, `CHAT-RUTA-INVALIDA`, `CHAT-MEMORIA`, cuenta invocaciones; contrato en `tests/integration/test_bateria_de_contrato_de_adapters.py`), NLI falso existente (`test_bateria_de_contrato_nli.py`), `ContadorDeTokens` falso por palabras (nuevo caso en la batería de adapters: mismo resultado que el real en texto vacío → 0, nunca `None`).

## Evaluación

Cambia prompts (nuevo prompt de clasificación y armado del turno): la suite `evaluate` del chat es de US-269; en este PR corre `run-ai-eval` con la regresión de RN-23 (`eval/configs/rn23-local.yaml --suite all`) para comprobar que salidas prescriptivas = 0 y que los prompts existentes no cambian. Métricas OL-06 afectadas: salidas prescriptivas, fidelidad (memoria no citable). Sin cambio de modelo, umbral, catálogo ni corpus.

## Risks / Trade-offs

- [Estado en memoria se pierde al reiniciar] → rehidratación desde Backend 1 con test de equivalencia (AC-5).
- [Memoria del proceso; Backend 2 ya tuvo OOM (US-239)] → `CHAT_MAX_THREADS` y TTL obligatorios; ventana limitada por tokens.
- [Ritmo de versiones de `langgraph`/`langchain-core`] → versiones fijadas (==) en `requirements.txt`, auditoría de licencias (MIT) en el PR.
- [Varios workers de uvicorn no compartirían hilos] → el Compose ya usa un worker; un hilo ausente en otro worker se cubre con la rehidratación.
- [Reglas de enrutado frágiles en español] → las ambiguas caen al LLM; salida inválida → `no_clasificada` sin generar.

## Migration Plan

Aditivo: nuevo endpoint y dependencias. Rollback: revertir el PR; `clinical-api` no usa el endpoint hasta US-258.
