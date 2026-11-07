# Design — l1d-318-chat-examen-tratamiento-periodo

## Context

Ver `proposal.md` (Why). Este change extiende el nodo `caso` que crea `l1d-317-chat-caso-situacion` (US-260) dentro del
grafo de `l1d-316-chat-turn-langgraph` (US-259). De US-260 se heredan sin cambios: `caseFacts[]` construido por Backend 1
con `factRef` opaco por turno, verbalización determinista en código (`verbalizarDatoDelContexto()` de Backend 1, ADR-34;
decidido en `l1d-317`, sin plantillas del catálogo) en `CaseFact.verbalization` y día relativo (`relativeDay`, entero o
`null`); la tabla `factRef → (recurso, id, sourceDocumentId, fecha absoluta)` que solo vive en Backend 1; el validador
«≥ 1 `factRef` válido + NLI `entailment`»; `omittedClaims`; y la respuesta `503` con el LLM local caído (US-260 AC-7).

## Goals / Non-Goals

**Goals:** bloques `documentado` sin texto del LLM; bloques `interpretacion` verificados; filtro por periodo relativo
determinista; respuesta explícita cuando no hay hechos; prompt sin fechas absolutas.

**Non-Goals:** contradicciones (US-262); rótulo visible en la UI (requisito de `l1d-324`, glosario §3); periodos con fechas absolutas en la pregunta;
reconocer el examen por nombre en el código (lo decide el LLM eligiendo `factRefs`; si no hay hecho, se omite).

## Decisions

1. **`documentado` = el LLM elige, el código escribe.** El LLM devuelve `{kind: "documentado", factRefs: [...]}` y el
   validador sustituye cualquier texto por la verbalización del hecho. Alternativa descartada: pedir al LLM que copie la
   verbalización y compararla, porque es frágil (espacios, tildes) y no aporta nada. No pasa NLI: su texto *es* el hecho
   (ADR-34); sí se exige que el `factRef` sea del turno, o se omite.
2. **Un bloque `documentado` por hecho, en orden ascendente de día relativo.** Así cada bloque tiene un solo `factRef`
   (y un solo `ConversationDataLink` en Backend 1)
   y la secuencia (AC-02.3) sale del dato, no del LLM. Empate de día → orden de `factRef` (determinista).
3. **Periodo por reglas puras en `domain/`** (`periodo_de_la_pregunta()`): reconoce «últimos N días/semanas/meses/años»
   y «último mes/año» (español; N en cifras o palabras del 1 al 12). Conversión fija: semana = 7, mes = 30, año = 365 días
   (definición, no calibrable; constante única en `domain/`). Sin coincidencia → `None` y no se filtra. Alternativa
   descartada: que el LLM extraiga el periodo (no determinista y gasta una llamada).
4. **Filtro `filtrar_hechos_por_periodo()`** (`HechoDelCaso.dia_relativo_fin`, opcional): un hecho puntual entra si `dia ≥ inicio`; uno con intervalo entra si
   `fin ≥ inicio`; si además `comienzo < inicio`, su verbalización recibe el sufijo fijo «(iniciado antes del periodo)»
   antes de armar el prompt, de modo que el NLI y el bloque `documentado` usan el mismo texto. (asumido, AC-3)
5. **«Sin datos documentados»**: texto fijo en `Settings` (`chat_sin_datos_texto`, variable `CHAT_SIN_DATOS_TEXTO`; por
   defecto «No se encontró información documentada sobre lo preguntado en el expediente»), leído una sola vez, igual que el
   aviso RN-19. `validar` añade el bloque `limitacion` cuando la intención es `caso` y no queda ningún bloque (también
   cuando el LLM devuelve `claims` vacío, p. ej. un Ki-67 que no figura). `ConfiguracionDelGrafo` gana el campo.
6. **Prompt `chat-caso@0.3.0`** (`0.2.0` es el de `l1d-317`): añade al esquema de salida del LLM la elección `documentado | interpretacion` y la
   instrucción de no redactar los `documentado`. Se construye con el `PromptBuilder` de
   `l1d-108-prompt-instrucciones-datos` (instrucciones en sistema, datos delimitados).
7. **Solo dos `kind`**: el `kind` de `ChatBlock` es el enum cerrado de 8 valores de `l1d-316`; este change no lo
   redefine ni crea otro esquema de bloque, y solo emite `documentado` e `interpretacion`.
8. **Avisos**: el nodo `caso` rellena `notices[]` (RN-19, literal sin punto final); la UI solo los pinta.
9. **Chequeo numérico antes del NLI** (decisión del PO, segunda barrera sin LLM): una `interpretacion` se omite si alguna
   cifra, unidad (lista cerrada) o «N días antes/después» no está en la descripción de los hechos que cita. Compara pares
   (valor, unidad) con `Decimal` (coma decimal = punto, sin ceros a la derecha, sin signo) e ignora dígitos pegados a
   letras o `_` (`HER2`, `TNM_8`). Límite conocido: una cifra inventada sin unidad que coincide con otra de la descripción
   pasa; el NLI sigue siendo la barrera semántica.
10. **`kind` en la salida del LLM**: `_AfirmacionCruda` gana `kind` opcional (`documentado | interpretacion`); `text` puede
    ir vacío solo con `documentado`. Compatibilidad con salidas sin `kind`: texto idéntico a la descripción de sus hechos =
    documentado; paráfrasis = interpretación (`PropuestaDelTurno.declarado`). `documentado` declarado no pasa por la forma
    de afirmación (su texto se descarta); el esqueleto de las demás intenciones siempre entrega `documentado`.
11. **Enrutado**: «¿Qué tratamiento previo ha recibido…?» iba a `evidencia` por la regla prescriptiva `que tratamiento`;
    `enrutado.py` ya no la aplica cuando sigue «previo/anterior» y clasifica `tratamiento previo|anterior` como `caso`.

## Dependencias y colaboradores

- **Nuevos (dominio, puros):** `app/domain/chat/periodo_de_la_pregunta.py` (`periodo_de_la_pregunta`,
  `filtrar_hechos_por_periodo`), `app/domain/chat/bloques_documentados.py` (`bloques_documentados` — un bloque por hecho,
  orden por (día, índice)) y `app/domain/chat/chequeo_numerico.py` (`cifras_sostenidas_por_la_descripcion`).
- **Modificados:** nodo `caso` en `app/application/chat/` (usa los dos anteriores y el validador de US-260 vía sus
  puertos `NliClassifier` y LLM; nunca adapters concretos); `app/prompts/chat_caso.py`; `app/config` (texto fijo).
- **Backend 1:** `src/modules/evidence-analysis/` submódulo `conversation` persiste los `ChatBlock` tal cual y resuelve
  `ConversationDataLink` con la tabla de US-260; no añade lógica nueva.
- **Fakes que toca:** LLM falso del chat y NLI falso (FX-12-e); su test de contrato vive con el de US-260
  (`apps/rag-orchestrator/tests/contract/`); se añaden los casos `documentado` con texto propio y `factRef` ajeno.

## Contratos

Proveedores: `rag-orchestrator` (`/chat/turn`, contrato **1.12.0** de `l1d-316`) y `clinical-api` (`ConversationTurn`,
contrato **1.24.0** de `l1d-315`); consumidores: `clinical-api` y `web`. Este change **no edita `openapi.yaml`, no sube
versión ni redefine `ChatBlock.kind`** (glosario S6 §1–§2): consume el contrato de `l1d-316` 1.12.0. Usa `ChatBlock`
(`kind` ∈ enum cerrado de 8; aquí solo `documentado` e `interpretacion`; `text`; `factRefs?`), `CaseFact`
(`factRef`, `verbalization`, `relativeDay|null`) y `ConversationDataLink` (`recordedDate|null` del registro).

Ejemplos, un fichero por caso: `contracts/examples/chat-turn-caso-adt.json` (ADT `documentado`),
`chat-turn-caso-sin-datos.json` (un único bloque `kind=limitacion`, texto fijo determinista y exento de cita según el glosario §3) y `chat-turn-caso-periodo.json` (filtro de los últimos 100 días).

## Privacidad y ownership

- Cruza `clinical-api → rag-orchestrator`: la pregunta enmascarada y `caseFacts` desidentificados (factRef opaco, días
  relativos, sin UUID ni identidad), igual que US-260 (RN-10, RN-11). El periodo se calcula en Backend 2 sobre días
  relativos: nunca necesita una fecha absoluta. El `recordedDate` del `ConversationDataLink` lo añade Backend 1 al volver.
- Vuelve `rag-orchestrator → clinical-api`: bloques con `kind`, `factRefs`, texto validado, `notices[]` y `omittedClaims`.
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; no persiste nada (invariante de US-259 AC-8). Logs:
  solo conteos, `kind`, periodo en días y `traceId`; nunca la pregunta, la verbalización ni el texto del LLM.
- Sin cambios en `apps/web`.

## Evaluación

Cambia un prompt (`chat-caso@0.2.0 → 0.3.0`): suite `evaluate` en el PR con `eval/configs/rn23-local.yaml --suite all`
(regla del S5 para `app/prompts/`). Métricas OL-06 afectadas: fidelidad (≥ 0,90), salidas prescriptivas (= 0) y JSON
válido (≥ 99 %). Las métricas del chat por capacidad llegan con US-269 (`l1d-326`).

## Risks / Trade-offs

- [El LLM marca como `documentado` lo que es inferencia] → no importa: el texto lo pone el código; solo puede elegir mal
  el hecho, y entonces enlaza un dato real (visible y verificable).
- [El LLM marca como `interpretacion` lo que es un dato] → pasa NLI y sale rotulada como IA; error conservador.
- [Reglas de periodo con baja cobertura del lenguaje] → sin coincidencia no se filtra (respuesta completa, no vacía);
  se mide con US-269.
- Regresiones que no son escenario aquí: [RN-15] opt-out → `403` activa desde S6 con US-148; [RN-12] LLM local caído →
  `503` (US-260 AC-7); [RN-23] términos prescriptivos (US-068).

## Notas (sin tarea)

- `relativeEndDay` opcional en `CaseFact` (bump menor del contrato) = change aparte, pendiente de decisión del PO. Mientras
  tanto `CaseFact` solo trae el día de inicio: la rama de intervalos de `filtrar_hechos_por_periodo` está probada en
  unitario y no se activa en integración; la quimioterapia que empezó antes del periodo queda fuera (no se marca).
- La tarea 3.1 nació en verde: Backend 1 ya persistía los `ChatBlock` tal cual y resolvía `ConversationDataLink` desde
  `l1d-315`/`l1d-317` (caracterización, no hay commit `feat` de `clinical-api`).
