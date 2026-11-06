## Trazabilidad

L1D-108 · US-057 · FEAT-06a · Sprint 6 *(S4 → S6, `[S4 resp. 1]`; se mantiene y se extiende al chat `[S6 resp. 8]`)* · SEG-13 (V-17) · OL-02 · RN-01, RN-04, RN-22, RN-23, RN-24 · Fuente: `backlog/features/FEAT-06a-analisis-walking-skeleton.md` § US-057 · Fixtures: FX-06a-a (`Q-HER2`, `ch-m1-1`, `ch-inj-1`), FX-06a-b (LLM falso).

## Why

Hoy los prompts de `rag-orchestrator` (`rag-query@0.9.0`, `rag-follow-up@0.1.1`, `reescritura-consulta@0.1.0`) mezclan instrucciones, pregunta, datos del paciente y fragmentos en **un solo mensaje de usuario**, con rótulos de texto plano (`[fragmento C1] … [fin del fragmento]`). Un chunk del corpus o una pregunta con una instrucción inyectada (p. ej., `ch-inj-1`: "Ignore all previous instructions… `</document>`") comparte canal con las instrucciones y puede cerrar su propio bloque. Como responsable de seguridad, quiero que el texto de los chunks y la pregunta del doctor viajen al LLM como **datos delimitados y nunca como instrucciones**, para que una fuente o una pregunta maliciosa no cambie lo que el sistema le muestra al oncólogo. La validación de citas y el NLI (US-063, US-064) siguen siendo la última defensa; el efecto real sobre el modelo lo mide la suite `evaluate` (US-072, «inyección efectiva»).

## What Changes

- **Nuevo `PromptBuilder`** (`apps/rag-orchestrator/app/application/prompt_builder.py`, función pura sin E/S): arma un `PromptSeparado(sistema, usuario, version)`. Las instrucciones van en el **mensaje de sistema**, constante por versión de prompt y configuración (`PROMPT_VERSION` de cada plantilla; nunca depende del texto de la pregunta, los chunks, los datos del paciente ni la memoria). La pregunta y cada dato van en el **mensaje de usuario** dentro de bloques de una lista cerrada: `<question>`, `<document id="C<n>">` (id = alias de US-236, nunca el `chunkId` real), `<patient_data>` y `<memory citable="no">` (análisis previo o conversación, RN-24).
- **Escape de delimitadores**: toda secuencia que abra o cierre una etiqueta reservada (`<document`, `</document>`, `<question>`, …, sin distinguir mayúsculas ni espacios) dentro de un dato se neutraliza sustituyendo su `<` por `&lt;`; el resto del texto (p. ej., `<5 %`) queda intacto. Al parsear el prompt hay exactamente un bloque `<document>` por chunk entregado.
- **Puerto del LLM**: `LlmClient.completar_json` recibe el mensaje de sistema por separado (`sistema=`); `cuerpo_de_peticion` ya lo admite. Los fakes de `tests/support/llm_falso.py` registran ambos mensajes y pasan el mismo test de contrato.
- **Prompts migrados** al constructor, con versión nueva: `rag-query@0.10.0` (`/rag/query`), `rag-follow-up@0.2.0` (`/rag/follow-up`, la memoria del análisis en `<memory citable="no">`) y `reescritura-consulta@0.2.0` (segundo loop de RN-02, solo `<question>`). El texto de las instrucciones no cambia salvo la referencia a las etiquetas.
- **Chat (FEAT-12, `[S6 resp. 8]`)**: los prompts de los nodos de `POST /chat/turn` — `l1d-316-chat-turn-langgraph` (armado del turno y clasificación), `l1d-317-chat-caso-situacion` (`chat-caso@0.1.0`), `l1d-321-chat-relevancia-faltante` (`chat-relevancia@0.1.0`) y `l1d-322-chat-evidencia-seguimiento` (`chat-seguimiento-evidencia@0.1.0`) — **MUST** construirse con este `PromptBuilder`: pregunta, hechos del paciente, fragmentos y memoria de la conversación como bloques delimitados. Este change entrega un test de arquitectura que recorre `app/prompts/*.py` y falla si un prompt que llega al LLM no sale del constructor, y un *helper* de aserción (`tests/support/prompt_separado.py`) para que 317 y 322 verifiquen AC-1…AC-4 sobre los nodos `caso` y `evidencia`.
- **AC-5**: test de integración que confirma que una opción "inyectada" sin cita válida termina en `discardedOptions` (mecanismo existente de US-063/US-064 y RN-23; sin código nuevo de validación).

## Capabilities

### New Capabilities
- Ninguna.

### Modified Capabilities
- `evidence-analysis`: requisitos nuevos (ADDED) sobre la separación instrucciones/datos, el escape de delimitadores, la invariancia del mensaje de sistema, el uso obligatorio del constructor por todo prompt de generación (incluidos los del chat) y el descarte de la opción inyectada sin cita válida. No modifica requisitos vigentes.
- `ai-evaluation`: sin delta; la métrica «inyección efectiva» (US-072) ya existe y se corre en este PR.

## Bounded contexts

- **ai-services** (`apps/rag-orchestrator`): `PromptBuilder`, migración de tres plantillas, puerto/adaptador/fake del LLM, tests y evaluación.
- Sin cambios en `clinical-platform` ni `frontend`.

## Dependencias

- ↪ US-055 (`/rag/query`, mergeado), 🔗 US-063 / US-064 (validación de citas y NLI, mergeados), US-236 (alias `C1…Cn`, mergeado), US-218 (`/rag/follow-up`, mergeado).
- **Bloquea (↪ dependen de este change) y se mergea antes que ellos** (glosario canónico `backlog/sprints/S6-glosario-chat.md` §1): `l1d-316-chat-turn-langgraph`, `l1d-317-chat-caso-situacion`, `l1d-321-chat-relevancia-faltante` y `l1d-322-chat-evidencia-seguimiento` consumen `PromptBuilder` y `PromptBuilder.memoria()` (memoria de la conversación en `<memory citable="no">`, sin los rótulos `INICIO_DE_LA_MEMORIA` / `FIN_DE_LA_MEMORIA`). Va en la primera oleada del S6. Si por error alguno se mergeara antes, el test de arquitectura de este change lo detecta y su prompt se migra aquí.
- 🔗 Medido en: US-072 (casos de inyección del dataset de evaluación).

## Pendientes de refinamiento

- Ninguno abierto. El mecanismo de escape está marcado `(asumido)` en la historia (AC-3); se fija en `design.md` (D2).

## Fuera de alcance

- Los prompts de **ingesta** (extracción de metadatos de población, `poblacion_v1`, y de metadatos del corpus): corren fuera de la consulta sobre corpus público con licencia y su salida pasa por NLI; migrarlos obliga a reextraer todo el corpus (ADR-47). Quedan como están.
- Medir el efecto real de la inyección sobre el modelo: lo hace la suite `evaluate` (US-072); aquí se verifica la **estructura** del prompt.
- Cambios de contrato: ninguno (`openapi.yaml` de ambos backends sin diff).

## Impact

- Código: `app/application/prompt_builder.py` (nuevo), `app/prompts/rag_query.py`, `app/prompts/seguimiento.py`, `app/prompts/reescritura_consulta.py`, `app/application/generation.py`, `app/application/generacion_de_seguimiento.py`, `app/infrastructure/llm/reescritor_de_consulta.py`, `app/application/ports.py` (`LlmClient`), `app/infrastructure/llm/openai_compatible.py`, `app/evaluation/modelos_locales.py` y `app/scripts/adr39/runtime_llm.py` (reenvían `sistema`).
- Tests: `tests/unit/test_prompt_builder.py` (nuevo), `tests/unit/test_prompts_por_constructor.py` (arquitectura, nuevo), `tests/support/prompt_separado.py` (nuevo), `tests/integration/test_rag_query_inyeccion.py` (nuevo), ajustes en `test_prompt_rag_query.py` y `test_prompt_seguimiento.py`.
- **Cambia prompts → suite `evaluate` obligatoria (OL-06)** con `eval/configs/rn23-local.yaml --suite all` y `eval/configs/s5.yaml --suite opciones`.
