# Tasks — l1d-322-chat-evidencia-seguimiento

## 1. contratos

- [x] 1.1 Editar `apps/rag-orchestrator/openapi.yaml` 1.12.0 → 1.13.0: `ChatTurnRequest.activeAnalysisId?` (patrón UUID, como `threadId`; `ChatTurnResponse.subintent?` ya existía) · verificación: `contracts:check` en verde (commit `contract(L1D-322)` 3fc55d21). El puntero `ChatTurnRequest/properties/activeAnalysisId` se exime en `assertNoIdentityInRagContract.mjs` (solo enruta el turno)
- [x] 1.2 Editar `apps/clinical-api/openapi.yaml` 1.25.0 → 1.26.0 (en el merge con L1D-213 quedó en 1.27.0): `ConversationTurn.evidenceAnalysis?` · verificación: `contracts:check` en verde
- [x] 1.3 Ejemplos `chat-turn-request-evidencia.json`, `chat-turn-evidencia.json`, `chat-turn-request-seguimiento.json`, `chat-turn-seguimiento-evidencia.json`, `chat-turn-seguimiento-sin-evidencia.json`, `conversation-turn-evidencia.json`, `conversation-turn-seguimiento.json`; el `503` reutiliza `chat-turn-llm-local-no-disponible.json` · verificación: `contracts:check` valida los ejemplos contra su esquema. La síntesis del `evidenceAnalysis` de los ejemplos va vacía porque `assertClaimsAnchored` solo casa las citas de la raíz de la respuesta
- [x] 1.4 `contracts:breaking` sin incompatibles, `contracts:generate` y commit `contract(L1D-322)` · verificación: tres comandos en verde

## 2. ai-services

- [x] 2.1 Extraer `ConsultaDeEvidencia.consultar_con_detalle` de `RAGOrchestratorService` (devuelve los `chunkId` evaluados por el *reranker*) sin cambio de comportamiento · commit `refactor(L1D-322)` 12907e30 · verificación: suite de `/rag/query` y `/rag/follow-up` en verde antes y después
- [x] 2.2 Test de aceptación en rojo AC-1 y AC-2 · commit `test(L1D-322)` 169dac03 · rojo: `status 500` (NotImplementedError) en las tres pruebas
- [x] 2.3 `NodoEvidencia` (`application/chat/capacidades/evidencia.py`), `ChatCitation` desde el corpus (`PosicionDeChunks` / `MilvusRepository.posiciones`), `ultimaEvidencia` sin `analysisId` · commit `feat(L1D-322)` 573a293b · verde: `test_chat_turn_evidencia.py` AC-1/AC-2
- [x] 2.4 Tests de aceptación en rojo AC-3, AC-4 y AC-7 del seguimiento · commit `test(L1D-322)` dc404373 · rojo: 5 fallos en la aserción
- [x] 2.5 `es_seguimiento_de_evidencia()`, clasificación `seguimiento_evidencia`, `resumir_ultima_evidencia()`, `NodoSeguimientoDeEvidencia` y prompt `chat-seguimiento-evidencia@0.1.0` con `PromptBuilder.memoria()` · commit `feat(L1D-322)` 9474a1ab · verde: `test_chat_turn_seguimiento_evidencia.py`
- [x] 2.6 Tests AC-5, AC-6 y AC-7 (opción sin soporte) del turno de evidencia · commit `test(L1D-322)` ce89b7e2. **Nacieron verdes**: el nodo reutiliza el pipeline de `/rag/query` (filtro RN-23, descarte NLI, `LOCAL_LLM_UNAVAILABLE`, avisos de configuración), que ya cumplía; no hubo commit en rojo para ellos
- [x] 2.7 Sin código nuevo para 2.6: las reglas se reutilizan, sin literales nuevos · verificación: 2.6 en verde y respuestas validadas contra el spec
- [x] 2.8 Batería de contrato de adapters con `FakeChatLlmEvidencia`, `PosicionesFalsas` y `MilvusRepository.posiciones` · `test_bateria_de_contrato_de_adapters.py` en verde
- [x] 2.9 Refactor: `registrar`/`consultar_con_detalle` (2.1), `ConstructorDeCitas` compartido por los dos nodos, `invocar_borde_fallando_cerrado` y `como_opcion` hechos públicos para reutilizarlos · refactor mínimo, tests en verde
- [x] 2.10 Medición del tamaño real del prompt de evidencia (decisión del PO 2026-11-06, solo medir): evento `chat_evidencia_prompt` con `traceId`, fase (`analisis` / `seguimiento`), fragmentos, tokens de sistema / datos / memoria / total y `LLM_NUM_CTX`, sin texto ni ids · `app/application/medicion_de_prompt.py`; tests `test_medicion_de_prompt.py` y el de caplog del seguimiento. Sin cambiar `RETRIEVAL_TOP_K`, `RERANKER_MAX_PAIRS`, `RERANK_TOP_N` ni `RETRIEVAL_MODE`. El recall se compara con `rag_query_corte` (L1D-327). La verificación de hechos del paciente (verbalización determinista + NLI) es la de L1D-317; el chequeo numérico determinista es de L1D-318/319, no de este nodo

## 3. clinical-platform

- [x] 3.1 Tests de aceptación en rojo (`conversacion-evidencia.test.ts`: AC-1 registro y turno, AC-1 fallo del INSERT, AC-2 aplicabilidad persistida, AC-3 enlace del seguimiento, AC-3 `502`, AC-6 `503`, lectura del GET) · commit `test(L1D-322)` · rojo: 6 de 7 fallan (el `503` ya se cumplía)
- [x] 3.2 `insertarTurnoDeEvidencia()` en el repository (una `$transaction`: registro con `armarRegistro()` y `base.construir()` del gateway, después el turno) y respuesta desde lo persistido · commit `feat(L1D-322)` a648c572 · verde 7/7
- [x] 3.3 `activeAnalysisId` (último `analysis_id`), enlace del seguimiento, `502` con `RESPUESTA_INTERNA_INVALIDA` si llega `subintent` sin análisis activo o con `evidenceAnalysis`, `status` / `topRelevanceScore` reales en el GET (el turno de seguimiento los toma de `ultimaEvidencia`) · mismo commit
- [x] 3.4 Ajuste del test de L1D-258 `conversacion-rehidratacion`: ahora `activeAnalysisId` viaja en el cuerpo (y solo ahí); la rehidratación sigue sin `analysisId` ni UUID
- [x] 3.5 Refactor: `armarTurno` partido en `validarCuerpoDelChat`, `registroDelTurno`, `filaDelTurno`; repository con funciones por operación (límites de ESLint) · tests en verde

## 4. evaluación

Nota 4.1 (sin checkbox: no es una acción de este PR): `run-ai-eval` con `eval/configs/rn23-local.yaml --suite all` y `eval/configs/s5.yaml --suite opciones` (prompt nuevo `chat-seguimiento-evidencia` y nuevo camino al generador) · evaluate · lo lanza `ai-eval-runner` en el Gate 2 (el orquestador); la suite del chat AC05 es de US-269

## 5. cierre

- [x] 5.1 `openspec validate l1d-322-chat-evidencia-seguimiento --strict` en verde
- [x] 5.2 `pytest` de `rag-orchestrator`, `vitest` e integración de `clinical-api` en verde, `contracts:verify-provider`, `contracts:breaking` sin incompatibles
Nota 5.3 (sin checkbox: no es una acción de este PR): Gate 2 con `contract-keeper`, `privacy-guardian`, `clinical-language-auditor` y `design-principles-reviewer` · lo lanza el orquestador

## humano

Nota (sin checkbox): `CHAT_EVIDENCE_MAX_OPTIONS=3` ya está en `apps/rag-orchestrator/.env.example`, `infra/docker/docker-compose.yml` y su test (autorizado por el PO). La Base del análisis del chat usa `ANALYSIS_MAX_OPTIONS` de Backend 1; conviene mantener ambos valores iguales.
