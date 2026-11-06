# Tasks — l1d-318-chat-examen-tratamiento-periodo

Requiere en `main` (o en la rama base de la oleada): `l1d-108-prompt-instrucciones-datos`, `l1d-316-chat-turn-langgraph`,
`l1d-315-conversacion-paciente` y `l1d-317-chat-caso-situacion`. Sin subida de versión de contrato (glosario S6 §1).

## 1. contratos

- [ ] 1.1 (exento) Consume el contrato de `l1d-316` 1.12.0 (`ChatBlock` con su enum cerrado de 8 `kind`, `CaseFact`, `notices[]`) y el de `l1d-315` 1.24.0 (`ConversationTurn`, `ConversationDataLink`); sin editar `apps/*/openapi.yaml`, sin redefinir `kind` ni subir versión
- [ ] 1.2 Añadir, un fichero por caso, `contracts/examples/chat-turn-caso-adt.json` (ADT `documentado`), `chat-turn-caso-sin-datos.json` (un bloque `kind=limitacion`, texto fijo) y `chat-turn-caso-periodo.json` (últimos 100 días, quimioterapia con la marca «iniciado antes del periodo»); solo datos sintéticos · verificación: `contracts:check` en verde; commit `contract(L1D-318)`

## 2. ai-services

- [ ] 2.1 Test de aceptación en rojo: «aparece como interpretacion con los dos factRefs y notices con RN-19 cuando una afirmación combina dos hechos con entailment [US-261 AC-2]» (y el caso `neutral` → omitida) · integración Pytest + `TestClient`, adapters falsos FX-12-e, reloj FX-12-f · TDD estricto · commit `test(L1D-318)`
- [ ] 2.2 Test de aceptación en rojo: «los bloques solo enlazan factRefs de hechos con día ≥ −100 y la quimioterapia lleva la marca iniciado antes del periodo cuando se pregunta por los últimos 100 días [US-261 AC-3]» (más: hecho terminado antes del periodo; pregunta sin periodo) · integración Pytest · TDD estricto · commit `test(L1D-318)`
- [ ] 2.3 Test de aceptación en rojo: «se omite sin invocar el NLI y dice No se encontró información documentada cuando la afirmación no tiene factRefs [US-261 AC-4]» · integración Pytest · TDD estricto · commit `test(L1D-318)`
- [ ] 2.4 Test de aceptación en rojo: «el prompt no contiene fechas AAAA-MM-DD cuando se pregunta por tratamiento, periodo o examen [US-261 AC-5]» · integración Pytest capturando el prompt del LLM falso · TDD estricto · commit `test(L1D-318)`
- [ ] 2.5 Extraer `periodo_de_la_pregunta()` y `filtrar_hechos_por_periodo()` en `app/domain/periodo_de_la_pregunta.py` (reglas puras, RN-11) con unitarios uno a la vez · TDD estricto · verificación: Pytest unitario en verde
- [ ] 2.6 Extraer `bloques_documentados()` en `app/domain/bloques_documentados.py` (verbalización insertada por el código, un bloque por hecho, orden por día; ADR-34) con unitarios, incluido el texto del LLM descartado · TDD estricto · verificación: Pytest unitario en verde
- [ ] 2.7 Integrar en el nodo `caso` (`app/application/chat/`): filtro por periodo antes del prompt, modo `documentado`, `kind` (`documentado | interpretacion`) en cada bloque, `notices[]` rellenado, texto fijo `chat_sin_datos_documentados_texto` desde `Settings` (RN-22: declarado una sola vez); casos nuevos en el test de contrato de los fakes (LLM con `documentado` + texto propio, `factRef` ajeno) · commit `feat(L1D-318)` · verificación: tests 2.1–2.4 en verde y suite de `rag-orchestrator` en verde
- [ ] 2.8 Prompt `chat-caso@0.2.0` en `app/prompts/chat_caso.py` con el `PromptBuilder` de `l1d-108` (elección `documentado | interpretacion`, no redactar los `documentado`, solo días relativos); pasa el test de arquitectura de `l1d-108` · evaluate · verificación: tarea 4.1
- [ ] 2.9 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-318)`

## 3. clinical-platform

- [ ] 3.1 Test de aceptación en rojo: «el bloque documentado es byte a byte la verbalización del ADT y su ConversationDataLink trae el recordedDate del registro cuando se pregunta por el tratamiento previo [US-261 AC-1]» · integración Supertest + PostgreSQL de test + MSW hacia `/chat/turn` desde `contracts/examples/chat-turn-caso-adt.json`, paciente semilla (b); respuesta validada contra el spec de `clinical-api` (US-214) · TDD estricto · commit `test(L1D-318)`
- [ ] 3.2 Persistir los `ChatBlock` de Backend 2 tal cual en `ConversationTurn` y resolver `ConversationDataLink` con la tabla `factRef` de US-260 (sin lógica nueva) · commit `feat(L1D-318)` · verificación: 3.1 en verde y suite de `clinical-api` en verde
- [ ] 3.3 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-318)`

## 4. evaluación

- [ ] 4.1 `run-ai-eval` con `eval/configs/rn23-local.yaml --suite all` (cambia `app/prompts/`): fidelidad ≥ 0,90, salidas prescriptivas = 0, JSON válido ≥ 99 %; reporte de `ai-eval-runner` en el PR
- [ ] 4.2 `openspec validate l1d-318-chat-examen-tratamiento-periodo --strict`, tests de `rag-orchestrator` y `clinical-api` en verde, `contracts:verify-provider` en verde
