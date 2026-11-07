# Tasks — l1d-319-chat-contradicciones

> Rama `feat/l1d-319-chat-contradicciones`, PR `[L1D-319] Chat: contradicciones y correcciones sin resolverlas`. Requiere en
> `main` (o en la rama base de la oleada): `l1d-316-chat-turn-langgraph`, `l1d-315-conversacion-paciente` y
> `l1d-317-chat-caso-situacion`; rebasa sobre `l1d-318-chat-examen-tratamiento-periodo` si entra antes. Sin subida de
> versión de contrato (glosario S6 §1).
>
> Evidencia de la implementación: commits `contract` bbe9cf8e → `test` rag 2838ed4e → `feat` rag 788d6cad → `test` clinical
> 94c3d148 → `feat` clinical 9d49f577 → `test` 79a7ef97 (`Test-Removal`: US-260 AC-5 adopta el sufijo) → `refactor`.
> pytest rag 4793 passed; vitest unitario clinical-api 1300 passed; integración clinical-api con PostgreSQL de test 875
> passed; `contracts:verify-provider` en verde (1123 + 632 respuestas); `contracts:check`, `generate:check`, `breaking`,
> `pii-scan`, `verificar-commits-tdd`, `openspec validate --all --strict`, `npm run quality` y `tsc -p tsconfig.build.json` en verde.

## 1. contratos

- [x] 1.1 (exento) Consume el contrato de `l1d-316` 1.12.0 (`CaseFact.conflictWith?`/`corrected?`, `ChatBlock.kind = conflicto`, `notices[]`) y el de `l1d-315` 1.24.0 (`ConversationTurn`, `ConversationDataLink` sin `historyPath`); sin editar `apps/*/openapi.yaml` ni subir versión
- [x] 1.2 Añadir, un fichero por caso, `contracts/examples/chat-turn-caso-conflicto.json` (par IIA/IIB) y `chat-turn-caso-sin-contradicciones.json` (más sus peticiones `chat-turn-request-caso-*.json` y el índice); fixture del LLM falso `chat-conflicto-resuelve.json` · `contracts:check` en verde; commit `contract(L1D-319)` bbe9cf8e

## 2. ai-services

- [x] 2.1 Test de aceptación AC-2 en rojo (falla en la aserción: la afirmación se mostraba) · `test_chat_turn_caso_conflictos.py`, commit 2838ed4e
- [x] 2.2 Test de aceptación AC-4 en rojo (cero llamadas al LLM) · mismo commit
- [x] 2.3 `app/domain/chat/contradicciones.py`: `es_pregunta_de_contradicciones()`, `pares_en_conflicto()`, `bloques_de_conflicto()` y `afirmaciones_que_resuelven_conflicto()` con unitarios (`test_chat_contradicciones.py`, 25 casos); ruta por reglas en `enrutado.py`
- [x] 2.4 Nodo `caso`: turno de contradicciones sin LLM (`capacidades/contradicciones_del_caso.py`), regla del validador antes del NLI (solo interpretaciones; un `documentado` ya dice «en conflicto con otro dato»), claves `CHAT_CONFLICTO_ETIQUETA` y `CHAT_SIN_CONTRADICCIONES_TEXTO` (Settings, `.env.example`, Compose y su test); fixtures `CHAT-CONFLICTO-RESUELVE` y `CHAT-CONFLICTO-AMBOS`; AC-1 (lado rag), AC-2 y AC-4 en verde; commit 788d6cad
- [x] 2.5 Refactor: sin cambios en rag-orchestrator (los módulos nuevos nacen extraídos)

## 3. clinical-platform

- [x] 3.1 Test de aceptación AC-1 en rojo · `conversacion-conflictos.test.ts`, commit 94c3d148
- [x] 3.2 Test de aceptación AC-3 en rojo · mismo commit
- [x] 3.3 Test de aceptación AC-5 en rojo · mismo commit
- [x] 3.4 `conversation/conflictos.ts` (`contrapartesDeConflicto()`, `conMarcaDeCorreccion()`), `conflictWith` simétrico en `hechos-del-caso.ts` (el módulo `case-facts.builder.ts` ya no existe), contraparte del diagnóstico activo leída (`diagnosticosEnConflicto`), desidentificada y añadida al final de `caseFacts`; `corrected` ya salía de la procedencia (L1D-317); AC-1, AC-3 y AC-5 en verde; commit 9d49f577
- [x] 3.5 Verificación del proveedor: `contracts:verify-provider` valida las respuestas de los tests nuevos contra `apps/clinical-api/openapi.yaml` (1123 respuestas)
- [x] 3.6 Refactor: Extract `desidentificarElCaso` (conversation.service.ts), `entradasDelTurno` y `hechoDelCandidato` (hechos-del-caso.ts) por `max-lines-per-function` y `complexity`; tests en verde antes y después

## 4. cierre

- [x] 4.1 `openspec validate --all --strict`, tests de `apps/clinical-api` y `apps/rag-orchestrator` y `contracts:verify-provider` en verde
- [x] 4.2 Hallazgos del Gate 2 (language Mayor, design P2#1 y P2#2): alcance revisado y aviso de marca sin contraparte (`CHAT_CONTRADICCIONES_ALCANCE_TEXTO`, `CHAT_CONFLICTO_SIN_CONTRAPARTE_TEXTO`); la contraparte se desidentifica con `question` vacía y un guard ante diagnóstico nulo, con test de una sola máscara de la pregunta, de seudónimo y de no fuga de UUID/fechas; design.md y spec alineados al formato real y a los días relativos 0 y +10; commits test 3e662252, feat ca452514 y aa06dcd0
- Nota para el orquestador: este change no cambia prompt, modelo, umbral, catálogo ni corpus; sin `evaluate` obligatorio. No se ejecutó el job `integration-rag` (el change no toca el schema `corpus`).
