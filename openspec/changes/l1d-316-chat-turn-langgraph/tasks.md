# Tasks — l1d-316-chat-turn-langgraph

> Requiere `l1d-108-prompt-instrucciones-datos` mergeado en la rama base (`PromptBuilder`, `PromptBuilder.memoria()`). Vocabulario vinculante: `backlog/sprints/S6-glosario-chat.md`.

## 1. contratos

- [ ] 1.1 Editar `apps/rag-orchestrator/openapi.yaml` 1.11.0 → 1.12.0 con `POST /chat/turn` y los esquemas del glosario §2: `ChatTurnRequest` (con `dataClassification` y `catalogVersion`), `CaseFact`, `ChatCompletenessItem` (con `gapType`, sin `provenance`), `ChatRehydration`, `StructuredState` (`ultimaEvidencia?` sin `analysisId`), `ChatTurnResponse` (`structuredState` requerido, `llmProvider`, `notices[]`), `ChatBlock` (`kind` cerrado de 8 valores) y `ChatCitation`; errores del glosario §4 con el esquema nuevo `ErrorHiloDesconocido` y los existentes por status, sin tocar la `const` de `ErrorInterno` (design § Contratos) · test después · verificación: `contracts:check` en verde
- [ ] 1.2 Añadir `contracts/examples/chat-turn-request.json`, `chat-turn-request-rehidratacion.json`, `chat-turn-caso-ok.json`, `chat-turn-no-clasificada.json`, `chat-turn-fuera-de-alcance.json`, `chat-turn-hilo-desconocido.json` y `chat-turn-llm-local-no-disponible.json` (solo datos sintéticos, `dataClassification = sintetico`, `llmProvider = local`, `notices[]` con el literal de RN-19 sin punto final, sin términos prescriptivos de RN-23). Un fichero por caso; L1D-317/318/319 añaden sus `chat-turn-caso-<caso>.json`. El `409` y el `503 LLM_OUTPUT_INVALID` reutilizan los existentes `contracts/examples/rag-catalog-version-mismatch.json` y `rag-salida-llm-invalida.json` (no se duplican) · verificación: validan contra el esquema en `contracts:check`
- [ ] 1.3 `contracts:breaking` contra `main` sin incompatibles, `contracts:generate` (Pydantic en `app/schemas/generated`, cliente TS en `packages/api-contracts/`) y build del cliente; commit `contract(L1D-316)` · verificación: salida de los tres comandos en verde [US-259 AC-1]

## 2. ai-services

- [ ] 2.1 Fijar `langgraph` y `langchain-core` (==, MIT) en `apps/rag-orchestrator/requirements.txt` con su comentario de licencia · test después · verificación: `pip install -r requirements.txt` limpio y `pip-licenses` sin licencias no permitidas
- [ ] 2.2 Añadir `chat_thread_ttl_seconds`, `chat_max_threads`, `chat_memory_max_tokens` a `Settings` (RN-22) y los puertos `ChatTurnPort` y `ContadorDeTokens` en `app/application/ports.py`; esqueletos con `raise NotImplementedError` para que los rojos fallen en la aserción · test después · verificación: `test_arranque_configuracion.py` en verde
- [ ] 2.3 Test de aceptación en rojo: «devuelve caso, faltantes y evidencia sin llamar al LLM de clasificación cuando las reglas clasifican [US-259 AC-2]» · integración (`TestClient`, adapters falsos que cuentan llamadas) · TDD estricto · commit `test(L1D-316)`
- [ ] 2.4 Test de aceptación en rojo: «usa la intención del LLM con una llamada cuando ninguna regla clasifica» y «devuelve no_clasificada sin nodos de generación cuando la clasificación no es JSON [US-259 AC-3]» · integración · TDD estricto · commit `test(L1D-316)`
- [ ] 2.4b Test de aceptación en rojo: «responde fuera_de_alcance de forma determinista sin llamar al LLM cuando la pregunta nombra a otro paciente, un tipo no habilitado o PII sin enmascarar» y «clasifica como evidencia, no como fuera_de_alcance, una pregunta prescriptiva» · integración · TDD estricto · commit `test(L1D-316)`
- [ ] 2.5 Implementar `clasificar_por_reglas()` y `es_fuera_de_alcance()` (dominio, reutilizando `clasificar_contexto_del_seguimiento`), nodo `enrutar` con clasificación JSON validada (prompt con `PromptBuilder`), grafo `StateGraph` con nodos de capacidad esqueleto que delegan en los puertos, `ChatTurnService` y router `app/api/chat_turn.py` (JWT de servicio, pregunta NFC); unitarios uno a la vez · commit `feat(L1D-316)` · verificación: 2.3, 2.4 y 2.4b en verde
- [ ] 2.5b Test de aceptación en rojo: «responde 409 CATALOG_VERSION_MISMATCH sin llamar a ningún adapter cuando catalogVersion difiere del catálogo montado» y «responde 503 LLM_OUTPUT_INVALID sin bloques cuando la salida de generación del LLM falso no valida» · integración (`TestClient`, adapters falsos que cuentan llamadas); cuerpos validados contra el spec y comparados con `contracts/examples/rag-catalog-version-mismatch.json` y `rag-salida-llm-invalida.json` · TDD estricto · commit `test(L1D-316)`; implementar la comprobación de `catalogVersion` al inicio del turno (reutilizando la regla existente de `/rag/query`) y el mapeo de la salida inválida a `503` en `app/api/errors.py` · commit `feat(L1D-316)`
- [ ] 2.6 Test de aceptación en rojo: «responde 404 HILO_DESCONOCIDO sin llamar a ningún adapter cuando el TTL venció [US-259 AC-4]» y «desaloja el hilo más antiguo cuando se supera CHAT_MAX_THREADS [US-259 AC-6]» · integración con reloj congelado · TDD estricto · commit `test(L1D-316)`
- [ ] 2.7 Implementar `RegistroDeHilos` sobre `InMemorySaver` con purga perezosa, desalojo por antigüedad y extraer `hilo_vencido()` (RN-22); el error tipado se mapea a `404` `HILO_DESCONOCIDO` en `app/api/errors.py` · commit `feat(L1D-316)` · verificación: 2.6 en verde y respuestas validadas contra el spec (verificación del proveedor)
- [ ] 2.8 Test de aceptación en rojo: «produce el mismo hash de prompt y la misma respuesta en un hilo vivo y en uno rehidratado [US-259 AC-5]» · integración · TDD estricto · commit `test(L1D-316)`
- [ ] 2.8b Test de aceptación en rojo: «responde 422 sin eco cuando rehydration trae resourceId, UUID, fecha absoluta, analysisId o dataLinks» · integración · TDD estricto · commit `test(L1D-316)`
- [ ] 2.9 Implementar la siembra desde `rehydration` y `armar_prompt_del_turno()` como función pura del estado (orden estable, sin tiempos absolutos) · commit `feat(L1D-316)` · verificación: 2.8 y 2.8b en verde
- [ ] 2.10 Test de aceptación en rojo: «incluye el estado estructurado completo y solo los últimos turnos que caben en CHAT_MEMORY_MAX_TOKENS en el bloque no citable» y «omite y cuenta en omittedClaims la afirmación respaldada solo por memoria con CHAT-MEMORIA [US-259 AC-7]» · integración · TDD estricto · commit `test(L1D-316)`
- [ ] 2.11 Implementar `ventana_de_memoria()` con el puerto `ContadorDeTokens` (adapter sobre el tokenizer local del LLM y fake por palabras, ambos en la batería de contrato de adapters), `app/prompts/chat.py` con `PromptBuilder` y `PromptBuilder.memoria()` de L1D-108 (nunca `INICIO_DE_LA_MEMORIA` / `FIN_DE_LA_MEMORIA`; `test_prompts_por_constructor.py` en verde), y extraer `afirmacion_tiene_soporte_del_turno()` (RN-24/RN-04) usada por el nodo `validar` · commit `feat(L1D-316)` · verificación: 2.10 y la batería de contrato en verde
- [ ] 2.12 Test de aceptación: «no deja ficheros, escrituras en corpus ni Milvus, texto de preguntas en logs ni patientId/pseudoPatientId en el estado tras 5 turnos con PII sembrada [US-259 AC-8]» (en rojo con el esqueleto si algo persiste; si ya pasa, se registra la salida) · integración con PostgreSQL `corpus` real y Milvus fingido que cuenta escrituras · TDD estricto · commit `test(L1D-316)`; corregir lo que falle en `feat(L1D-316)` · verificación: 2.12 y `tests/integration/permisos/` en verde
- [ ] 2.12b Test de aceptación en rojo: «todo turno con contenido generado devuelve notices con el literal RN-19 de configuración y llmProvider local» y «fuera_de_alcance y no_clasificada devuelven notices vacío» · integración · TDD estricto · commit `test(L1D-316)`; implementar `avisos_del_turno()` en `ChatTurnService` · commit `feat(L1D-316)`
- [ ] 2.13 Cablear el servicio en `app/bootstrap.py` con adapters reales y con `LLM_PROVIDER=fake` · test después · verificación: `test_arranque.py` y `test_adapters_sin_red.py` en verde
- [ ] 2.14 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-316)`

## 3. evaluación

- [ ] 3.1 `run-ai-eval` con `eval/configs/rn23-local.yaml --suite all` (prompts nuevos del chat): salidas prescriptivas = 0 y sin regresión en las suites existentes · evaluate · verificación: reporte de `ai-eval-runner` en `reports/eval/` (lo deja el agente). La suite del chat AC01–AC06 es de US-269.

## 4. humano

Bloque literal para `.env.example` (sección de `rag-orchestrator`):

```
# Chat (ADR-51, US-259): estado efímero del hilo en Backend 2 (RN-22, a calibrar)
CHAT_THREAD_TTL_SECONDS=1800
CHAT_MAX_THREADS=50
CHAT_MEMORY_MAX_TOKENS=1500
```

- [ ] H-1 Añadir las tres claves anteriores a `.env.example` (PR chore de la oleada) DIFERIDA -> H-1 (hecho en PR chore/s6-h1-env-example)

## 5. cierre

- [ ] 5.1 `openspec validate l1d-316-chat-turn-langgraph --strict` en verde
- [ ] 5.2 Suite de `rag-orchestrator` en verde (`pytest`), `contracts:verify-provider` para `/chat/turn` y `contracts:breaking` sin incompatibles
- [ ] 5.3 Gate 2 con `contract-keeper`, `privacy-guardian`, `clinical-language-auditor` y `design-principles-reviewer`
