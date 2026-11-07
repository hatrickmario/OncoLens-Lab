# Tasks — l1d-321-chat-relevancia-faltante

> Rama `feat/l1d-321-chat-relevancia-faltante`, PR `[L1D-321] Chat: por qué importa un dato faltante`. Rebasa sobre
> `l1d-108-prompt-instrucciones-datos`, `l1d-316-chat-turn-langgraph`, `l1d-315-conversacion-paciente` y
> `l1d-320-faltantes-tipo-vacio`. Sin subida de versión de contrato (glosario S6 §1).

## contratos

- [x] 1.1 (exento) Consume el contrato de `l1d-316` 1.12.0 (`ChatBlock` con `kind ∈ {catalogo, evidencia, limitacion}`, `ChatCitation`, `omittedClaims`, `notices[]`); sin editar `apps/rag-orchestrator/openapi.yaml` ni subir versión
- [x] 1.2 Ejemplos `contracts/examples/chat-turn-relevancia-ok.json` (estado menopáusico), `chat-turn-relevancia-sin-criterio.json` (Ki-67), `chat-turn-relevancia-sin-soporte.json`, `chat-turn-relevancia-sin-evidencia.json`, `chat-turn-relevancia-fuera-de-catalogo.json` (FX-12-e) · verificación: `contracts:check` en verde; commit `contract(L1D-321)` · EVIDENCIA: cinco ejemplos `chat-turn-relevancia-*.json` y sus peticiones `chat-turn-request-relevancia-*.json` (el motor produce exactamente cada respuesta: `test_chat_turn_relevancia.py`); `contracts:check` sin hallazgos (33 reglas)

## ai-services

- [x] 2.1 (TDD estricto) Test de aceptación en rojo: bloque `catalogo` con el texto fijo «dato crítico sin criterio de aplicabilidad» y ningún otro contenido clínico cuando se pregunta «¿Por qué importa el Ki-67?» con el catálogo real de mama [US-264 AC-1] · integración; commit `test(L1D-321)`
- [x] 2.2 (TDD estricto) Test de aceptación en rojo: bloque `catalogo` con el criterio `estado_menopausico` del `aplicabilidad.json` real y bloque `evidencia` con la `ChatCitation` del turno cuando se pregunta «¿Por qué importa el estado menopáusico?» [US-264 AC-1] · integración (`TestClient` + `corpus` real + LLM y NLI falsos, reloj congelado); commit `test(L1D-321)`
- [x] 2.3 (TDD estricto) Test de aceptación en rojo: afirmación omitida, `omittedClaims = 1` y bloque `limitacion` «La evidencia recuperada no explica la relevancia de este dato» junto al bloque `catalogo` cuando el NLI devuelve `neutral` [US-264 AC-2] · integración; commit `test(L1D-321)`
- [x] 2.4 (TDD estricto) Test de aceptación en rojo: cero llamadas al LLM de generación y solo bloque `catalogo` + aviso «sin evidencia» cuando ningún chunk supera el umbral tras el bucle de reescritura [US-264 AC-3] · integración; commit `test(L1D-321)`
- [x] 2.5 (TDD estricto) Test de aceptación en rojo: «El Ki-67 debe solicitarse antes de cualquier tratamiento» omitida por términos prohibidos aunque tenga cita y `entailment` [US-264 AC-4] · integración; commit `test(L1D-321)`
- [x] 2.6 (TDD estricto) Test de aceptación en rojo: «no es un dato crítico del catálogo vigente», sin bloque `catalogo` y sin LLM cuando se pregunta por CA 15-3 [US-264 AC-5] · integración; commit `test(L1D-321)`
- [x] 2.7 (TDD estricto) Test de aceptación en rojo: afirmación omitida cuando cita un chunk de un turno anterior [US-264 AC-6] · integración; commit `test(L1D-321)`
- [x] 2.8 (TDD estricto) Extraer `identificar_dato_critico()` y `criterios_que_usan()` (RN-29) en `app/domain/chat/relevancia.py`, con unitarios uno a uno
- [x] 2.9 (TDD estricto) Implementar la subintención `relevancia` del nodo `faltantes` y sus patrones en `app/domain/chat/enrutado.py`, reutilizando la recuperación con reescritura (US-238), `afirmacion_tiene_soporte_del_turno()`, `check_prohibited_terms` y `VerificadorDeSoporte`; textos fijos en `Settings` (incluido «ningún criterio de aplicabilidad del catálogo vigente usa este dato»), bloques `catalogo`/`evidencia`/`limitacion` según el glosario y `notices[]` rellenado; AC-1…AC-6 en verde; commit `feat(L1D-321)`
- [x] 2.10 (evaluate) Prompt `app/prompts/chat_relevancia.py` `chat-relevancia@0.1.0` con instrucciones en sistema y chunks delimitados con el `PromptBuilder` de `l1d-108`, sin datos del paciente; pasa el test de arquitectura de `l1d-108`
- [x] 2.11 (test de contrato) LLM falso con `CHAT-RELEVANCIA-*` y NLI falso pasan el mismo test de contrato que sus adapters reales (`tests/unit/test_llm_chat_falso_relevancia.py` para el LLM falso; la batería `test_bateria_de_contrato_nli.py` ya cubre el NLI falso)
- [x] 2.12 Verificación del proveedor: las respuestas de `/chat/turn` del turno de relevancia validan contra `apps/rag-orchestrator/openapi.yaml`
- [x] 2.13 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit refactor(L1D-321)

## evaluación

- [ ] 3.1 TRASLADADA -> L1D-326 (evaluate real y E2E del chat; el `ai-eval-runner` real lo lanza el orquestador en el Gate 2; el caso AC04 del chat y el dataset de preguntas de relevancia se miden en US-269) · (evaluate) `run-ai-eval` con el LLM local `eval/configs/rn23-local.yaml --suite all` y `eval/configs/s5.yaml --suite opciones` (OL-06): fidelidad, precisión de citas, «sin evidencia» y salidas prescriptivas = 0; el caso AC04 del chat se mide en US-269

## cierre

- [x] 4.1 `openspec validate l1d-321-chat-relevancia-faltante --strict`, tests de `apps/rag-orchestrator` en verde, `contracts:verify-provider` · EVIDENCIA: ver el reporte del implementador (pytest de rag 5030 passed, `verify-provider` de rag 733 respuestas verificadas, vitest de `clinical-api` unitario de evidence-analysis/completeness/seed 473 passed; `eval-required` con adapters falsos sin regresión)
- [ ] 4.2 `run-ai-eval` real del prompt `chat-relevancia@0.1.0` · DIFERIDA -> L1D-326 (la tarea 3.1)

## humano

- [ ] H-1 Pasar las seis claves nuevas `CHAT_RELEVANCIA_CATALOGO_TEXTO`, `CHAT_RELEVANCIA_CRITERIOS_TEXTO`, `CHAT_RELEVANCIA_SIN_CRITERIO_TEXTO`, `CHAT_RELEVANCIA_SIN_SOPORTE_TEXTO`, `CHAT_RELEVANCIA_FUERA_DEL_CATALOGO_TEXTO` y `CHAT_RELEVANCIA_SIN_EVIDENCIA_AVISO` a `apps/rag-orchestrator/.env.example` y a `infra/docker/docker-compose.yml` (con su comentario de RN-22 y el test de paridad), con los valores de `app/domain/chat/valores_iniciales.py` (sin llaves: los marcadores son `<dato>`, `<version>` y `<criterios>`) · DIFERIDA -> H-1 (los valores por defecto de `Settings` ya rigen sin ellas; archivos protegidos para el implementador)
