# Design — l1d-319-chat-contradicciones

## Context

Ver `proposal.md` (Why). Este change amplía el nodo `caso` que crea `l1d-317-chat-caso-situacion` (US-260) dentro del
grafo de `l1d-316-chat-turn-langgraph` (US-259). Lo que ya existe o traen las dependencias:

- `GET …/case` expone `provenance.conflict`, `reviewStatus` y `supersedesId`; excluye `rechazado` y `reemplazado`
  (`case-timeline`). En `P-CHAT` (FX-12-b) el estadio IIB está `requiere_revision` con `conflicts_with_id` al IIA, y el
  HER2 `3+` tiene `supersedes_id` al `2+` `reemplazado`.
- `GET …/biomarkers/{id}/history` sigue la cadena `supersedes_id` (US-253, `human-control`).
- `caseFacts[]` con `factRef` opaco, la tabla `factRef → recurso` en Backend 1 y el validador «≥ 1 `factRef` válido +
  NLI» (US-260). El enum cerrado de `ChatBlock.kind` (`l1d-316` 1.12.0) ya incluye `conflicto`, y `CaseFact` ya trae
  `conflictWith?` y `corrected?`; `ConversationTurn.blocks[]` son `ChatBlock` (`l1d-315` 1.24.0).

## Goals / Non-Goals

**Goals:** marcas deterministas de conflicto y corrección en `caseFacts`; bloques `conflicto` sin LLM con los dos valores
y sus fuentes; respuesta fija sin contradicciones; regla «la IA no resuelve»; invariante de solo lectura.

**Non-Goals:** conciliar desde el chat; clasificación `por_conciliar` de faltantes (US-263); UI (US-267).

## Decisions

1. **Backend 1 calcula los pares; Backend 2 compone el bloque de forma pura, sin LLM** (**decidido por el glosario S6**,
   §2–§3). Backend 1 conoce `conflicts_with_id` y `supersedes_id`; los traduce a `conflictWith: <factRef de la
   contraparte>` y `corrected: true` en `caseFacts`. El par es simétrico: ambos hechos llevan el `factRef` del otro.
   Backend 2 nunca ve UUID (RN-11). El enrutado y la composición del turno viven en el grafo (ADR-51), así que el bloque
   `conflicto` lo compone Backend 2 con una función pura a partir de esas marcas; el contenido sigue siendo 100 %
   determinista y lo decide Backend 1. Cada bloque `conflicto` lleva ≥ 1 `factRef` (aquí, los dos del par; RN-01).
2. **Pregunta de contradicciones por regla pura** (`es_pregunta_de_contradicciones()` en `domain/chat/`): términos fijos
   («contradicción», «contradice», «inconsistencia», «discrepancia», «corregido», «corrección»), sin LLM. Si coincide:
   un bloque `conflicto` por par, con `factRefs = [a, b]` en orden ascendente de día relativo y texto
   `«<etiqueta>: <A>. Frente a: <B>.»` (A y B: descripciones deterministas de cada hecho con su momento relativo y su estado de revisión, sin la marca «en conflicto»), con la etiqueta «Por conciliar»
   de `Settings` (`chat_conflicto_etiqueta`, RN-22); no hay campo `conflictLabel` en el contrato. Sin pares → texto fijo
   `chat_sin_contradicciones_texto` de `Settings` (RN-22) más una segunda frase de alcance (`chat_contradicciones_alcance_texto`: «Se revisaron los diagnósticos y biomarcadores del expediente»); si hay marcas sin contraparte en el turno no se afirma «sin contradicciones»: se declara `chat_conflicto_sin_contraparte_texto`. Cero llamadas al LLM de generación. Alternativa descartada:
   que el LLM redacte el conflicto (podría resolverlo o inclinarse por un valor).
3. **Regla del validador `afirmaciones_que_resuelven_conflicto()`**: en todo turno de caso, una afirmación cuyos
   `factRefs` incluyen un hecho con `conflictWith` pero no a su contraparte se omite **antes** del NLI y suma a
   `omittedClaims`. Una afirmación que cita ambos hechos pasa al NLI normal. Alternativa descartada: detectar por texto
   frases como «el correcto es» (frágil; la regla por enlaces es verificable).
4. **Corrección**: el hecho vigente `corrected = true` sale como cualquier hecho (bloque `documentado` o `interpretacion`);
   su verbalización, generada en Backend 1 con `verbalizarDatoDelContexto()`, lleva el sufijo fijo «(corregido)», de
   modo que la marca viaja en el texto y el NLI usa el mismo texto. Su `ConversationDataLink` lleva `resourceType` y
   `resourceId` del registro vigente; **sin `historyPath`** (el navegador solo habla con `/api/*`): `l1d-325` deriva la
   ruta con `rutaDeHistorico(resourceType, resourceId)`. El `2+` nunca entra en `caseFacts` (ya lo garantiza US-260
   AC-5); aquí se comprueba con la pregunta por HER2.
5. **Solo lectura**: el service de conversación usa el puerto de lectura de la vista de caso; ningún repository de
   escritura de `clinical.*` se inyecta en el flujo del turno. Se verifica comparando `review_status`,
   `conflicts_with_id` y `supersedes_id` antes y después.

## Privacidad y ownership

- **clinical-api → rag-orchestrator** (JWT de servicio): `caseFacts` desidentificados como en US-260 con dos campos nuevos
  que solo contienen un `factRef` opaco del turno y un booleano; sin UUID, identidad ni fechas absolutas (RN-10, RN-11).
  El valor reemplazado no viaja (RN-07).
- **rag-orchestrator**: composición en memoria dentro del hilo efímero (ADR-51); no persiste nada; no toca schemas
  clínicos ni `clinical-minio`. Sin LLM en la pregunta de contradicciones; en el resto, solo LLM local (RN-12).
- **Vuelta**: bloques con `factRefs` y `notices[]`; Backend 1 resuelve `ConversationDataLink` con el `recordedDate` del
  registro y persiste el turno antes de responder (RN-06).
- **web**: sin cambios en este change. No se envía ninguna ruta al navegador; `l1d-325` la deriva sobre `/api/*`.
- Logs: solo `traceId`, número de pares y `omittedClaims`; nunca valores ni verbalizaciones.

## Contratos

Proveedores: `rag-orchestrator` (`POST /chat/turn`, contrato **1.12.0** de `l1d-316`) y `clinical-api` (`ConversationTurn`,
contrato **1.24.0** de `l1d-315`). Consumidores: `clinical-api` y `web`. No se crean endpoints, **no se añaden campos ni
se sube versión** (glosario S6 §1): consume el contrato de `l1d-316` 1.12.0. Nombres usados: `CaseFact.factRef`,
`verbalization`, `relativeDay|null`, `conflictWith?`, `corrected?`; `ChatBlock` (`kind = conflicto`, `text`, `factRefs`);
`ConversationDataLink` (sin `historyPath`, sin `corrected`, sin `conflictLabel`).

Ejemplos, un fichero por caso: `contracts/examples/chat-turn-caso-conflicto.json` (par IIA/IIB) y
`chat-turn-caso-sin-contradicciones.json`. `CHAT-CONFLICTO-RESUELVE` (FX-12-e) es una salida del LLM previa al filtro:
fixture del LLM falso en `apps/rag-orchestrator/tests/fixtures/llm/chat-conflicto-resuelve.json`, no ejemplo del contrato.

## Dependencias y colaboradores

- **clinical-api**: `conversation/case-facts.builder.ts` (US-260) recibe `marcarConflictosYCorrecciones()` (regla pura,
  nuevo `conversation/conflictos.ts`); el sufijo «(corregido)» se añade en `verbalizarDatoDelContexto()` (un solo dueño); `conversation/data-links.ts` no cambia
  de forma.
  El service de conversación sigue recibiendo solo el puerto de lectura de la vista de caso por *factory*.
- **rag-orchestrator**: `domain/chat/contradicciones.py` (`es_pregunta_de_contradicciones`, `bloques_de_conflicto`,
  `afirmaciones_que_resuelven_conflicto`), usado por el nodo `caso` en `application/chat/`; textos fijos
  (`chat_sin_contradicciones_texto`, `chat_conflicto_etiqueta`) en `app/config`.
- **Fakes**: el LLM falso del chat añade `CHAT-CONFLICTO-RESUELVE` y cuenta invocaciones (AC-4); su test de contrato
  vive con el de US-260 en `apps/rag-orchestrator/tests/contract/`.

## Evaluación

No cambia modelo, prompt, umbral, catálogo ni corpus: sin `evaluate` obligatorio en el PR. El comportamiento del chat
ante contradicciones se mide con la suite del chat en US-269 (`l1d-326`).

## Risks / Trade-offs

- [La regla de pregunta no reconoce una formulación] → la pregunta va al flujo normal del nodo `caso`; la regla del
  validador sigue impidiendo que el LLM resuelva. Cobertura medida en US-269.
- [Varios pares en el mismo recurso] → un bloque por par, orden determinista (día relativo, luego `factRef`).
- [Nombres del contrato] → fijados por el glosario S6 (`factRef`, `verbalization`, `relativeDay`); no se renegocian.
