# Tasks — l1d-317-chat-caso-situacion

> Rama `feat/l1d-317-chat-caso-situacion`, PR `[L1D-317] Chat: situación, resumen y evolución del caso`. Rebasa sobre
> `l1d-108-prompt-instrucciones-datos`, `l1d-316-chat-turn-langgraph` y `l1d-315-conversacion-paciente` (US-258).
> Sin subida de versión de contrato (glosario S6 §1).

## 1. contratos

- [ ] 1.1 (exento) Consume el contrato de `l1d-316` 1.12.0 (`CaseFact`, `ChatBlock`, `notices[]`) y el de `l1d-315` 1.24.0 (`ConversationTurn`, `ConversationDataLink`); sin editar `apps/*/openapi.yaml` ni subir versión
- [ ] 1.2 Añadir `contracts/examples/chat-turn-caso-situacion.json` (un fichero por caso: respuesta validada de `CHAT-CASO-OK`, bloques `documentado` con `factRefs` y `notices[]` con el aviso RN-19 literal sin punto final; solo datos sintéticos) · verificación: `contracts:check` en verde; commit `contract(L1D-317)`
- [ ] 1.3 `CHAT-CASO-INVENTA` y `CHAT-CASO-SIN-ENLACE` son salidas del LLM **antes** del filtro, no respuestas del contrato: van como fixtures del LLM falso en `apps/rag-orchestrator/tests/fixtures/llm/chat-caso-inventa.json` y `apps/rag-orchestrator/tests/fixtures/llm/chat-caso-sin-enlace.json`, nunca en `contracts/examples/` · test después · verificación: el test de contrato del LLM falso las carga

## 2. clinical-platform

- [ ] 2.1 (exento) Consumir el seed sintético `P-CHAT` (FX-12-b) que crea `l1d-315-conversacion-paciente`; no se crea aquí
- [ ] 2.2 (TDD estricto) Test de aceptación en rojo: bloques `documentado` con `factRefs` resueltos a `ConversationDataLink` y `notices` (RN-19 + «Verifique contra las fuentes») persistidos tal como los devuelve `rag-orchestrator` cuando el paciente (a) pregunta por su situación [US-260 AC-1] · integración (Supertest + BD real + MSW desde `contracts/examples/chat-turn-caso-situacion.json`); commit `test(L1D-317)`
- [ ] 2.3 (TDD estricto) Test de aceptación en rojo: `caseFacts` de `P-CHAT` sin nombre, documento, UUID ni fechas `AAAA-MM-DD`, con `factRef` opaco, verbalización y día relativo [US-260 AC-4] · integración (MSW captura el cuerpo); commit `test(L1D-317)`
- [ ] 2.4 (TDD estricto) Test de aceptación en rojo: HER2 `2+` reemplazado ausente y `3+` presente en `caseFacts` [US-260 AC-5] · integración; commit `test(L1D-317)`
- [ ] 2.5 (TDD estricto) Test de aceptación en rojo: `503`, sin fila en `clinical.conversation_turn` cuando `/chat/turn` responde el error de LLM local caído [US-260 AC-7] · integración; commit `test(L1D-317)`
- [ ] 2.6 (TDD estricto) Implementar `case-facts.builder.ts` reutilizando `verbalizarDatoDelContexto()` (ampliada para series y día relativo), tabla `factRef → recurso` en memoria del turno y `resolverDataLinks()` (→ `ConversationDataLink`) con `recordedDate` del registro, con sus unitarios uno a uno; AC-1, AC-4, AC-5, AC-7 en verde; commit `feat(L1D-317)`
- [ ] 2.7 Extraer `ordenarPorDiaRelativo()` (AC-02.4) como regla pura con su unitario
- [ ] 2.8 Verificación del proveedor: las respuestas del turno de caso validan contra `apps/clinical-api/openapi.yaml`, incluido el `503`
- [ ] 2.9 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-317)`

## 3. ai-services

- [ ] 3.1 (TDD estricto) Test de aceptación en rojo: con `CHAT-CASO-INVENTA` la afirmación «Recibió radioterapia adyuvante» no aparece y `omittedClaims = 1` [US-260 AC-2] · integración (`TestClient` + LLM y NLI falsos, reloj congelado); commit `test(L1D-317)`
- [ ] 3.2 (TDD estricto) Test de aceptación en rojo: con `CHAT-CASO-SIN-ENLACE` la afirmación se omite, `omittedClaims = 1` y el NLI falso no la evalúa [US-260 AC-3] · integración; commit `test(L1D-317)`
- [ ] 3.3 (TDD estricto) Test de aceptación en rojo: los `factRefs` de los tres PSA del paciente (b) salen en orden ascendente de día relativo con «¿Cómo ha evolucionado el PSA?» [US-260 AC-6] · integración; commit `test(L1D-317)`
- [ ] 3.4 (TDD estricto) Implementar `application/chat/nodo_caso.py` sobre los puertos LLM y NLI (emite `kind=documentado` y rellena `notices[]` con RN-19 + «Verifique contra las fuentes») y extraer `filtrar_afirmaciones_sin_enlace()` (RN-01, AC-T1.2) en `domain/chat/enlaces_del_caso.py`, con unitarios uno a uno; AC-2, AC-3, AC-6 en verde; commit `feat(L1D-317)`
- [ ] 3.5 (evaluate) Prompt `app/prompts/chat_caso.py` `chat-caso@0.1.0` construido con el `PromptBuilder` de `l1d-108` (instrucciones en sistema, hechos y pregunta delimitados); pasa el test de arquitectura de `l1d-108` y su *helper* `tests/support/prompt_separado.py`
- [ ] 3.6 (test de contrato) LLM falso con `CHAT-CASO-*` y `LLM-CAIDO`, y NLI falso: pasan el mismo test de contrato que sus adapters reales
- [ ] 3.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-317)`

## 4. evaluación

- [ ] 4.1 (evaluate) `run-ai-eval` con el LLM local `eval/configs/rn23-local.yaml --suite all` y `eval/configs/s5.yaml --suite opciones`: fidelidad, PII y salidas prescriptivas = 0; la suite del chat AC01 se mide en US-269

## 5. cierre

- [ ] 5.1 `openspec validate l1d-317-chat-caso-situacion --strict`, tests de `apps/clinical-api` y `apps/rag-orchestrator` en verde, `contracts:verify-provider`, `run-ai-eval`
