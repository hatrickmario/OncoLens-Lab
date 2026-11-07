# Tasks — l1d-318-chat-examen-tratamiento-periodo

Requiere en `main` (o en la rama base de la oleada): `l1d-108-prompt-instrucciones-datos`, `l1d-316-chat-turn-langgraph`,
`l1d-315-conversacion-paciente` y `l1d-317-chat-caso-situacion`. Sin subida de versión de contrato (glosario S6 §1).

## 1. contratos

- [x] 1.1 (exento) Consume el contrato de `l1d-316` 1.12.0 (`ChatBlock` con su enum cerrado de 8 `kind`, `CaseFact`, `notices[]`) y el de `l1d-315` 1.24.0 (`ConversationTurn`, `ConversationDataLink`); sin editar `apps/*/openapi.yaml`, sin redefinir `kind` ni subir versión
- [x] 1.2 Añadir, un fichero por caso, `contracts/examples/chat-turn-caso-adt.json` (ADT `documentado`), `chat-turn-caso-sin-datos.json` (un bloque `kind=limitacion`, texto fijo) y `chat-turn-caso-periodo.json` (últimos 100 días), con sus peticiones registradas en `index.json`; solo datos sintéticos · verificación: `contracts:check` en verde; commit `contract(L1D-318)` (87410339)

## 2. ai-services

- [x] 2.1 Test de aceptación en rojo: «aparece como interpretacion con los dos factRefs y notices con RN-19 cuando una afirmación combina dos hechos con entailment [US-261 AC-2]» (y el caso `neutral` → omitida; cifra ajena → omitida sin NLI) · `tests/integration/test_chat_turn_caso_documentado.py`, commit `test(L1D-318)` (764878ec)
- [x] 2.2 Test de aceptación en rojo: «los bloques solo enlazan factRefs de hechos con día ≥ −100 [US-261 AC-3]» (más: hecho citado fuera del periodo; pregunta sin periodo; la quimioterapia con inicio en −160 queda fuera, ver nota) · mismo archivo, mismo commit
- [x] 2.3 Test de aceptación en rojo: «se omite sin invocar el NLI y dice No se encontró información documentada cuando la afirmación no tiene factRefs [US-261 AC-4]» · mismo archivo, mismo commit
- [x] 2.4 Test de aceptación en rojo: «el prompt no contiene fechas AAAA-MM-DD cuando se pregunta por tratamiento, periodo o examen [US-261 AC-5]» · mismo archivo, mismo commit
- [x] 2.5 Extraer `periodo_de_la_pregunta()` y `filtrar_hechos_por_periodo()` en `app/domain/chat/periodo_de_la_pregunta.py` (reglas puras, RN-11) con unitarios (`tests/unit/test_chat_periodo_de_la_pregunta.py`, 23 en verde)
- [x] 2.6 Extraer `bloques_documentados()` en `app/domain/chat/bloques_documentados.py` (verbalización insertada por el código, un bloque por hecho, orden por (día, índice); ADR-34) con unitarios (`tests/unit/test_chat_bloques_documentados.py`, 6 en verde), y el chequeo numérico `app/domain/chat/chequeo_numerico.py` con sus unitarios (`tests/unit/test_chat_chequeo_numerico.py`, 19 en verde)
- [x] 2.7 Integrar en el nodo `caso` (`app/application/chat/`): filtro por periodo antes del prompt, `kind` (`documentado | interpretacion`), chequeo numérico antes del NLI, bloque `limitacion` con el texto fijo `CHAT_SIN_DATOS_TEXTO` desde `Settings` (RN-22, declarado en `.env.example`, Compose y su test de paridad); `enrutado.py` manda «qué tratamiento previo» a `caso` · commit `feat(L1D-318)` (12dba4fa) · verificación: tests 2.1–2.4 en verde, suite de `rag-orchestrator` en verde (4619 pasan)
- [x] 2.8 Prompt `chat-caso@0.3.0` en `app/prompts/chat_caso.py` con el `PromptBuilder` (elección `documentado | interpretacion`, no redactar los `documentado`, cifras y unidades tal cual, solo días relativos); test de prompt en verde · evaluate · verificación: tarea 4.1
- [x] 2.9 Refactor: Extract Method `_interpretaciones_sostenidas` (índices en lugar de `id()`) e Inline Method `_hechos_del_periodo` en `caso.py`, tests en verde antes y después, commit `refactor(L1D-318)` (8a906e85)

- [x] 2.10 Hallazgos del Gate 2 (diseño, lenguaje, contrato, privacidad): chequeo numérico con unidades normalizadas (`µg` ≠ `mg`) y `sentidos_del_momento` compartido, política de tendencia (`domain/chat/tendencia.py`), aviso de hechos sin fecha y limitación de periodo vacío (`CHAT_SIN_FECHA_TEXTO`, `CHAT_SIN_DATOS_PERIODO_TEXTO`), `limitacion_cuando_vacio` por intención, `PropuestaDelTurno.tipo` opcional, `sin_tildes` único, ejemplo `chat-turn-caso-interpretacion.json` · commits `test(L1D-318)` (rojo), `fix(L1D-318)` y `docs(L1D-318)`

## 3. clinical-platform

- [x] 3.1 Test de aceptación: «el bloque documentado es byte a byte la verbalización del ADT y su ConversationDataLink trae el recordedDate del registro cuando se pregunta por el tratamiento previo [US-261 AC-1]» · integración Supertest + PostgreSQL de test + MSW hacia `/chat/turn` desde `contracts/examples/chat-turn-caso-adt.json`, paciente semilla (b); respuesta validada contra el spec de `clinical-api` (US-214) · nació en verde (caracterización: ya cumplido por `l1d-315`/`l1d-317`) · commit `test(L1D-318)` (673d8919)
- [x] 3.2 Persistir los `ChatBlock` de Backend 2 tal cual en `ConversationTurn` y resolver `ConversationDataLink` con la tabla `factRef` de US-260 (sin lógica nueva): sin cambio de código, lo cubre 3.1 · verificación: 3.1 en verde y suite de `clinical-api` en verde (1326 unitarios, 835 de integración)
- [x] 3.3 Refactor: sin cambios (`clinical-api` solo ganó un test)

## 4. evaluación

- [ ] 4.1 `run-ai-eval` con `eval/configs/rn23-local.yaml --suite all` (cambia `app/prompts/`): fidelidad ≥ 0,90, salidas prescriptivas = 0, JSON válido ≥ 99 %; reporte de `ai-eval-runner` en el PR (lo corre `ai-eval-runner` real en el Gate 2)
- [x] 4.2 `openspec validate l1d-318-chat-examen-tratamiento-periodo --strict`, tests de `rag-orchestrator` y `clinical-api` en verde, `contracts:verify-provider` en verde


Notas (sin checkbox):

- `relativeEndDay` opcional en `CaseFact` (bump menor del contrato) = change aparte, pendiente de decisión del PO. Hasta entonces `HechoDelCaso.dia_relativo_fin` llega a `None` y la marca «(iniciado antes del periodo)» solo se prueba en unitario.
- Rótulo «Interpretación generada por IA» de `kind = "interpretacion"`: dependencia de L1D-324 (UI); este change solo emite el `kind`.
- Preguntas para el PO (sin checkbox): (a) `relativeEndDay` en `CaseFact`: una quimioterapia activa iniciada hace 172 días desaparece de «últimos 100 días»; (b) «últimos N días» se mide desde el diagnóstico (día 0), no desde hoy; (c) una fecha absoluta de la pregunta que Backend 1 no relativice llega al prompt como parte de la pregunta (preexistente de 316/317).
- Pendiente fuera de mis paths: `backlog/features/FEAT-12-chatbot-mvp.md` línea 220 todavía dice «No se halló información sobre lo preguntado en los documentos procesados»; la decisión del orquestador es alinearla a «No se encontró información documentada sobre lo preguntado en el expediente».
- Cierre de la historia: la suite `evaluate` del chat por capacidad llega con US-269 (`l1d-326`).
