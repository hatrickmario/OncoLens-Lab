# Tasks — l1d-319-chat-contradicciones

> Rama `feat/l1d-319-chat-contradicciones`, PR `[L1D-319] Chat: contradicciones y correcciones sin resolverlas`. Requiere en
> `main` (o en la rama base de la oleada): `l1d-316-chat-turn-langgraph`, `l1d-315-conversacion-paciente` y
> `l1d-317-chat-caso-situacion`; rebasa sobre `l1d-318-chat-examen-tratamiento-periodo` si entra antes. Sin subida de
> versión de contrato (glosario S6 §1).

## 1. contratos

- [ ] 1.1 (exento) Consume el contrato de `l1d-316` 1.12.0 (`CaseFact.conflictWith?`/`corrected?`, `ChatBlock.kind = conflicto`, `notices[]`) y el de `l1d-315` 1.24.0 (`ConversationTurn`, `ConversationDataLink` sin `historyPath`); sin editar `apps/*/openapi.yaml` ni subir versión
- [ ] 1.2 Añadir, un fichero por caso, `contracts/examples/chat-turn-caso-conflicto.json` (par IIA/IIB) y `chat-turn-caso-sin-contradicciones.json`; solo datos sintéticos. `CHAT-CONFLICTO-RESUELVE` (FX-12-e) es una salida del LLM antes del filtro: va como fixture del LLM falso en `apps/rag-orchestrator/tests/fixtures/llm/chat-conflicto-resuelve.json`, no en `contracts/examples/` · verificación: `contracts:check` en verde; commit `contract(L1D-319)`

## 2. ai-services

- [ ] 2.1 (TDD estricto) Test de aceptación en rojo: «omite El estadio correcto es IIB, suma 1 a omittedClaims y no la envía al NLI cuando enlaza a un hecho en conflicto sin su contraparte [US-262 AC-2]» · integración Pytest + `TestClient`, LLM y NLI falsos (FX-12-e), reloj FX-12-f; commit `test(L1D-319)`
- [ ] 2.2 (TDD estricto) Test de aceptación en rojo: «responde No hay contradicciones registradas en el expediente con cero llamadas al LLM de generación cuando ningún hecho está en conflicto [US-262 AC-4]» · integración Pytest con el LLM falso que cuenta invocaciones; commit `test(L1D-319)`
- [ ] 2.3 (TDD estricto) Extraer en `app/domain/chat/contradicciones.py` `es_pregunta_de_contradicciones()`, `bloques_de_conflicto()` (función pura sin LLM: un bloque `kind = conflicto` por par con la etiqueta «Por conciliar» y los `factRefs` de ambos, orden por día relativo y `factRef`) y `afirmaciones_que_resuelven_conflicto()`, con unitarios uno a la vez (incluida la afirmación que cita ambos hechos y pasa al NLI)
- [ ] 2.4 Integrar en el nodo `caso` (`app/application/chat/`): rama determinista de contradicciones sin LLM, regla del validador antes del NLI, textos fijos `chat_sin_contradicciones_texto` y `chat_conflicto_etiqueta` en `Settings` (RN-22), `notices[]` rellenado; añadir `CHAT-CONFLICTO-RESUELVE` al LLM falso y a su test de contrato; AC-2 y AC-4 en verde; commit `feat(L1D-319)`
- [ ] 2.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-319)`

## 3. clinical-platform

- [ ] 3.1 (TDD estricto) Test de aceptación en rojo: «devuelve un bloque conflicto con Por conciliar, IIA e IIB, sus días relativos y un ConversationDataLink por cada factRef cuando se pregunta por contradicciones de P-CHAT [US-262 AC-1]» · integración Supertest + PostgreSQL de test + MSW hacia `/chat/turn` desde `contracts/examples/chat-turn-caso-conflicto.json`; respuesta validada contra el spec de `clinical-api`; commit `test(L1D-319)`
- [ ] 3.2 (TDD estricto) Test de aceptación en rojo: «el HER2 3+ sale con la marca (corregido), corrected = true en el cuerpo hacia /chat/turn, ConversationDataLink con resourceType y resourceId del 3+ sin historyPath, y el cuerpo no contiene 2+ [US-262 AC-3]» · integración (MSW captura el cuerpo); commit `test(L1D-319)`
- [ ] 3.3 (TDD estricto) Test de aceptación en rojo: «review_status, conflicts_with_id y supersedes_id de P-CHAT no cambian tras los turnos de contradicciones y de CHAT-CONFLICTO-RESUELVE [US-262 AC-5]» · integración con BD real (instantánea antes/después); commit `test(L1D-319)`
- [ ] 3.4 (TDD estricto) Implementar `conversation/conflictos.ts` con `marcarConflictosYCorrecciones()` (par simétrico `conflictWith`, `corrected` desde `supersedesId`), ampliar `case-facts.builder.ts` y añadir el sufijo «(corregido)» en `verbalizarDatoDelContexto()`, con unitarios uno a uno; AC-1, AC-3 y AC-5 en verde; commit `feat(L1D-319)`
- [ ] 3.5 Verificación del proveedor: las respuestas del turno con bloques `conflicto` y `ConversationDataLink` validan contra `apps/clinical-api/openapi.yaml`
- [ ] 3.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-319)`

## 4. cierre

- [ ] 4.1 `openspec validate l1d-319-chat-contradicciones --strict`, tests de `apps/clinical-api` y `apps/rag-orchestrator` en verde, `contracts:verify-provider` en verde
