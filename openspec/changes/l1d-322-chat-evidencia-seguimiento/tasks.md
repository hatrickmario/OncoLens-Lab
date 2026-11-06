# Tasks — l1d-322-chat-evidencia-seguimiento

## 1. contratos

- [ ] 1.1 Editar `apps/rag-orchestrator/openapi.yaml` 1.12.0 → 1.13.0 (glosario §1; si colisiona, se renumera el segundo en mergear): `ChatTurnRequest.activeAnalysisId?` (uuid) (`ChatTurnResponse.subintent?` ya es `enum [seguimiento_evidencia]` en la 1.12.0 de `l1d-316`; aquí solo se consume, sin redefinirlo ni acotarlo) · test después · verificación: `contracts:check` en verde
- [ ] 1.2 Editar `apps/clinical-api/openapi.yaml` 1.25.0 → 1.26.0: `ConversationTurn.evidenceAnalysis?` (`EvidenceAnalysis`) · test después · verificación: `contracts:check` en verde
- [ ] 1.3 Añadir `contracts/examples/chat-turn-request-evidencia.json`, `chat-turn-evidencia.json`, `chat-turn-request-seguimiento.json`, `chat-turn-seguimiento-evidencia.json` (con `structuredState.ultimaEvidencia` sin `analysisId`), `chat-turn-seguimiento-sin-evidencia.json`, `conversation-turn-evidencia.json`, `conversation-turn-seguimiento.json` (sintéticos, aviso RN-19 literal sin punto final, sin vocabulario de recomendación); el `503` reutiliza `chat-turn-llm-local-no-disponible.json` de `l1d-316`, sin duplicado · verificación: validan contra su esquema
- [ ] 1.4 `contracts:breaking` contra `main` sin incompatibles, `contracts:generate` (Pydantic, Zod, cliente TS) y build; commit `contract(L1D-322)` · verificación: salida de los tres comandos en verde

## 2. ai-services

- [ ] 2.1 Extraer el puerto `ConsultaDeEvidencia` de `RAGOrchestratorService` (Extract Method, sin cambio de comportamiento; suite de `/rag/query` en verde antes y después) · test después · commit `refactor(L1D-322)`
- [ ] 2.2 Test de aceptación en rojo: «devuelve evidenceAnalysis con opciones citadas solo con chunks del turno cuando se pregunta por evidencia [US-265 AC-1]» y «marca menopausia Desconocido por falta en el paciente y ordena por RN-28 con el paciente (e) [US-265 AC-2]» · integración (`TestClient`, adapters falsos) · TDD estricto · commit `test(L1D-322)`
- [ ] 2.3 Implementar `nodo_evidencia.py` sobre `ConsultaDeEvidencia` (arma la petición interna desde `ChatTurnRequest`, resume en bloques `kind = evidencia` con las mismas citas); unitarios uno a la vez · commit `feat(L1D-322)` · verificación: 2.2 en verde
- [ ] 2.4 Test de aceptación en rojo: «re-recupera, cita solo lo del turno y no devuelve evidenceAnalysis en el seguimiento [US-265 AC-3]», «omite y cuenta la afirmación respaldada solo por el turno anterior con CHAT-MEMORIA [US-265 AC-4]», «responde sin evidencia con cero llamadas al LLM y topRelevanceScore null cuando ningún chunk supera el umbral en el seguimiento [US-265 AC-3]», «omite y cuenta la afirmación citada con NLI neutral en el seguimiento [US-265 AC-7]» y «rellena ultimaEvidencia sin analysisId [US-265 AC-1]» · integración con retriever/LLM/NLI falsos que cuentan llamadas · TDD estricto · commit `test(L1D-322)`
- [ ] 2.5 Extraer `es_seguimiento_de_evidencia()` en `app/domain/chat/enrutado.py` (sin `activeAnalysisId` nunca es seguimiento), admitir `seguimiento_evidencia` en la clasificación JSON, extraer `resumir_ultima_evidencia()` en `app/domain/chat/ultima_evidencia.py`, implementar `nodo_seguimiento_evidencia.py` (re-recuperación sin segundo loop, «sin evidencia» sin LLM bajo el umbral, prompt `app/prompts/chat_seguimiento_evidencia.py` armado con `PromptBuilder` y `PromptBuilder.memoria()` de L1D-108, sin `INICIO_DE_LA_MEMORIA` / `FIN_DE_LA_MEMORIA`, validación con `afirmacion_tiene_soporte_del_turno()` + NLI) y rellenar `ultimaEvidencia` también desde `nodo_evidencia.py`; unitarios uno a la vez · commit `feat(L1D-322)` · verificación: 2.4 en verde
- [ ] 2.6 Test de aceptación en rojo: «encabeza con Opciones descritas en la evidencia, sin términos prohibidos y con los avisos de RN-19 ante una pregunta prescriptiva [US-265 AC-5]», «responde 503 LOCAL_LLM_UNAVAILABLE sin llamar a adapters de nube con LLM-CAIDO [US-265 AC-6]» y «lleva la opción sin soporte a discardedOptions y no la muestra [US-265 AC-7]» · integración · TDD estricto · commit `test(L1D-322)`
- [ ] 2.7 Corregir lo que falle de 2.6 reutilizando las reglas existentes (filtro RN-23, avisos de configuración de Backend 2 en `notices[]`, `LOCAL_LLM_UNAVAILABLE`, descarte NLI); ningún literal nuevo de esas reglas · commit `feat(L1D-322)` · verificación: 2.6 en verde y respuestas validadas contra el spec (verificación del proveedor)
- [ ] 2.8 Ampliar la batería de contrato de adapters con el LLM falso del chat (`LLM-OK`, `LLM-CAIDO`, `LLM-SIN-SOPORTE`, `CHAT-MEMORIA`) y el retriever que cuenta llamadas · test después · verificación: `test_bateria_de_contrato_de_adapters.py` en verde
- [ ] 2.9 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-322)`

## 3. clinical-platform

- [ ] 3.1 Test de aceptación en rojo: «persiste el AIAnalysisRecord y el turno con su analysis_id y responde desde lo persistido [US-265 AC-1]», «deja 500 sin análisis ni turno cuando falla el INSERT del registro [US-265 AC-1]» y «persiste la aplicabilidad igual a la respondida con el paciente (e) [US-265 AC-2]» · integración (Supertest + PostgreSQL real + MSW desde `contracts/examples/`) · TDD estricto · commit `test(L1D-322)`
- [ ] 3.2 Implementar `registrarTurnoDeEvidencia()` en el repository de conversación (una `$transaction`: `buildAnalysisRecord()` de `analysis-record.ts` y después el turno) y su uso en `conversation.service.ts`; respuesta desde lo persistido · commit `feat(L1D-322)` · verificación: 3.1 en verde
- [ ] 3.3 Test de aceptación en rojo: «envía activeAnalysisId y enlaza el seguimiento al mismo análisis sin registro nuevo [US-265 AC-3]», «responde 502 ErrorServicioIa sin persistir si llega seguimiento sin análisis activo [US-265 AC-3]» y «responde 503 sin análisis ni turno con el LLM caído [US-265 AC-6]» (MSW desde `chat-turn-llm-local-no-disponible.json`) · integración · TDD estricto · commit `test(L1D-322)`
- [ ] 3.4 Implementar el cálculo de `activeAnalysisId` (último `analysis_id` de la conversación), el enlace del seguimiento y el caso incoherente con la fila existente `RESPUESTA_INTERNA_INVALIDA` (`502`) de la tabla única de `rag-failure.ts`, sin fila nueva · commit `feat(L1D-322)` · verificación: 3.3 en verde y respuestas validadas contra el spec
- [ ] 3.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-322)`

## 4. evaluación

- [ ] 4.1 `run-ai-eval` con `eval/configs/rn23-local.yaml --suite all` y `eval/configs/s5.yaml --suite opciones` (prompt nuevo `chat-seguimiento-evidencia` y nuevo camino al generador): salidas prescriptivas = 0, sin regresión de precisión de citas, fidelidad y «sin evidencia» · evaluate · verificación: reporte de `ai-eval-runner` en `reports/eval/`. La suite del chat AC05 es de US-269.

## 5. cierre

- [ ] 5.1 `openspec validate l1d-322-chat-evidencia-seguimiento --strict` en verde
- [ ] 5.2 Suites de `rag-orchestrator` (`pytest`) y `clinical-api` (`vitest`) en verde, `contracts:verify-provider` para `/chat/turn` y `…/turns`, `contracts:breaking` sin incompatibles
- [ ] 5.3 Gate 2 con `contract-keeper`, `privacy-guardian`, `clinical-language-auditor` y `design-principles-reviewer`
