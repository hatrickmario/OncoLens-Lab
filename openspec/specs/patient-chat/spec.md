# patient-chat Specification

## Purpose
Resolver cada turno de la conversación del oncólogo sobre un paciente en `rag-orchestrator`: contrato interno `/chat/turn`, enrutado de la pregunta, estado efímero del hilo con TTL y rehidratación, y memoria acotada no citable, sin persistir nada del paciente en Backend 2 (ADR-51).

## Requirements

### Requirement: Contrato aditivo de POST /chat/turn
El spec de `rag-orchestrator` SHALL publicar en la versión menor 1.12.0 `POST /chat/turn`, protegido con el JWT de servicio, con los esquemas del glosario canónico del S6 (`backlog/sprints/S6-glosario-chat.md` §2) y sus errores (§4), reutilizando los esquemas de error existentes y con `ErrorHiloDesconocido` como único nuevo. Los ejemplos MUST validar contra el esquema y el cambio MUST ser aditivo (ADR-26).

#### Scenario: Publicación del contrato 1.12.0 [US-259 AC-1]
- **GIVEN** `apps/rag-orchestrator/openapi.yaml` en 1.11.0
- **WHEN** se publica 1.12.0
- **THEN** `ChatTurnRequest` requiere `threadId`, `pseudoPatientId`, `traceId`, `question`, `dataClassification`, `catalogVersion`, `clinicalContext`, `caseFacts` (`CaseFact`) y `completeness` (`ChatCompletenessItem` con `gapType`), con `rehydration?` opcional
- **AND** `ChatTurnResponse` requiere `intent`, `blocks`, `omittedClaims`, `structuredState`, `llmProvider` y `notices`, con `subintent?` y `evidenceAnalysis?` opcionales
- **AND** los errores son `401 ErrorTokenServicioInvalido`, `404 ErrorHiloDesconocido` (`error = HILO_DESCONOCIDO`), `409 ErrorCatalogVersionMismatch`, `422 ErrorValidacion`, `503` `oneOf [ErrorLlmLocalNoDisponible, ErrorSalidaLlmInvalida]` y `500 ErrorInterno` con su `const` sin cambios
- **AND** `ChatBlock.kind` admite exactamente `documentado`, `interpretacion`, `catalogo`, `evidencia`, `conflicto`, `faltante`, `limitacion` y `fuente`
- **AND** `StructuredState.ultimaEvidencia` no tiene la propiedad `analysisId` y `ChatCompletenessItem` no tiene `provenance`
- **AND** cada `contracts/examples/chat-turn-*.json`, incluidos `chat-turn-caso-ok.json` y `chat-turn-llm-local-no-disponible.json`, valida contra su esquema
- **AND** `ChatTurnResponse.subintent` es `enum [seguimiento_evidencia]` y `ChatCompletenessItem.status` es `enum [presente_verificado, presente_sin_verificar, faltante, no_aplica]`
- **AND** el cliente TS de `packages/api-contracts/` se regenera y compila, y la comparación con `main` no reporta cambios incompatibles

#### Scenario: La rehidratación solo admite los campos permitidos (asumido: glosario §2)
- **GIVEN** un `ChatTurnRequest` cuyo `rehydration.turns[0]` trae además `resourceId`, un UUID, una fecha absoluta, `analysisId` o `dataLinks`
- **WHEN** se envía a `POST /chat/turn` con un JWT de servicio válido
- **THEN** la respuesta es `422` con `error = CUERPO_INVALIDO`, válida contra `ErrorValidacion` y sin eco del valor recibido
- **AND** ningún adapter registra llamadas

### Requirement: Versión de catálogo distinta y salida inválida del LLM
`POST /chat/turn` SHALL comprobar `catalogVersion` antes de cualquier nodo: si difiere del catálogo montado MUST responder `409 ErrorCatalogVersionMismatch` sin invocar ningún adapter. Si la salida de generación del LLM no valida, MUST responder `503 ErrorSalidaLlmInvalida` (`error = LLM_OUTPUT_INVALID`) sin bloques.

#### Scenario: Catálogo distinto responde 409 sin llamar a adapters (asumido: glosario §4)
- **GIVEN** `rag-orchestrator` con un catálogo montado y adapters falsos que cuentan invocaciones
- **WHEN** recibe un `ChatTurnRequest` con otra `catalogVersion`
- **THEN** responde `409` con `error = "CATALOG_VERSION_MISMATCH"`, validado contra `ErrorCatalogVersionMismatch` y con la forma de `contracts/examples/rag-catalog-version-mismatch.json`
- **AND** ningún adapter registra invocaciones

#### Scenario: Salida inválida del LLM responde 503 (asumido: glosario §4)
- **GIVEN** un LLM falso cuya salida de generación no valida contra el esquema interno
- **WHEN** se procesa un turno de caso
- **THEN** responde `503` con `error = "LLM_OUTPUT_INVALID"`, validado contra `ErrorSalidaLlmInvalida` y con la forma de `contracts/examples/rag-salida-llm-invalida.json`

### Requirement: Enrutado determinista antes que el LLM

El turno SHALL clasificar la pregunta en `caso`, `faltantes`, `evidencia` o `fuentes_limitaciones` primero con reglas deterministas; solo si ninguna regla clasifica MUST pedir una única clasificación JSON al LLM local. Una clasificación inválida MUST producir `intent = "no_clasificada"`, una petición de reformular y ninguna invocación de nodos de generación.

#### Scenario: Las reglas clasifican sin llamar al LLM [US-259 AC-2]
- **GIVEN** las preguntas del fixture de enrutado «¿Cuál es la situación actual?», «¿Qué información falta?» y «¿Qué evidencia existe…?»
- **WHEN** se procesan como turnos
- **THEN** sus intenciones son `caso`, `faltantes` y `evidencia`
- **AND** el LLM falso registra cero llamadas de clasificación

#### Scenario: Clasificación con el LLM cuando ninguna regla aplica [US-259 AC-3]
- **GIVEN** una pregunta que ninguna regla clasifica
- **WHEN** el LLM falso responde `CHAT-RUTA`
- **THEN** el turno usa la intención devuelta, con exactamente una llamada de clasificación

#### Scenario: Clasificación inválida pide reformular [US-259 AC-3]
- **GIVEN** una pregunta que ninguna regla clasifica
- **WHEN** el LLM falso responde `CHAT-RUTA-INVALIDA` (texto no JSON)
- **THEN** la respuesta tiene `intent = "no_clasificada"` y pide reformular la pregunta (asumido)
- **AND** no se invoca ningún nodo de generación

### Requirement: Intención fuera de alcance determinista
El turno MUST clasificar como `fuera_de_alcance`, antes que cualquier otra regla y sin invocar al LLM, una pregunta sobre otro paciente, sobre un tipo de cáncer no habilitado o con un marcador de PII que no se pudo enmascarar, con la misma regla que `/rag/follow-up` (`clasificar_contexto_del_seguimiento`), y SHALL responder con un texto determinista. Una pregunta prescriptiva SHALL NOT clasificarse como `fuera_de_alcance`: va a `evidencia` (glosario §3).

#### Scenario: Pregunta sobre otro paciente responde fuera de alcance sin LLM (asumido: glosario §3)
- **GIVEN** una pregunta que nombra a otro paciente y el LLM falso que cuenta invocaciones
- **WHEN** se procesa como turno
- **THEN** la respuesta tiene `intent = "fuera_de_alcance"`, solo bloques deterministas y `notices = []` (mensaje del sistema, no generado por IA)
- **AND** el LLM falso registra cero llamadas

#### Scenario: Una pregunta prescriptiva no es fuera de alcance (asumido: glosario §3, L1D-322 AC-5)
- **GIVEN** la pregunta «¿Qué tratamiento debe recibir?» sobre el paciente del hilo
- **WHEN** se enruta
- **THEN** su intención es `evidencia` y no `fuera_de_alcance`

### Requirement: Avisos de IA siempre emitidos por Backend 2
Todo `ChatTurnResponse` con contenido generado (intenciones `caso`, `faltantes`, `evidencia` y `fuentes_limitaciones`) MUST llevar `notices[]` con el literal de RN-19 tomado de la configuración de `rag-orchestrator`, sin punto final; los mensajes del sistema (`fuera_de_alcance`, `no_clasificada`) SHALL llevar `notices = []`. Toda respuesta `200` MUST declarar `llmProvider` (RN-19, RN-12).

#### Scenario: Un turno de caso devuelve los avisos y el proveedor local (asumido: glosario §3)
- **GIVEN** un turno de intención `caso` con adapters falsos
- **WHEN** se procesa
- **THEN** `notices[]` contiene el literal de RN-19 de configuración, sin punto final
- **AND** `llmProvider` es `local` y la respuesta valida contra `ChatTurnResponse`

### Requirement: Hilo efímero con TTL y límite de hilos vivos

Backend 2 SHALL mantener el estado de cada hilo solo en memoria del proceso, indexado por el `threadId` aleatorio de la conversación. Un hilo cuya última actividad supere `CHAT_THREAD_TTL_SECONDS`, o desalojado por antigüedad al superar `CHAT_MAX_THREADS`, MUST responder `404 HILO_DESCONOCIDO` a un turno sin `rehydration`, con el esquema `ErrorHiloDesconocido`, sin invocar recuperación, LLM ni NLI.

#### Scenario: TTL vencido responde hilo desconocido [US-259 AC-4]
- **GIVEN** un hilo cuya última actividad supera `CHAT_THREAD_TTL_SECONDS` con el reloj congelado
- **WHEN** llega un turno sin `rehydration`
- **THEN** responde `404` con `error = "HILO_DESCONOCIDO"`, válido contra `ErrorHiloDesconocido`
- **AND** ningún adapter (recuperación, LLM, NLI) registra llamadas

#### Scenario: Desalojo del hilo más antiguo [US-259 AC-6]
- **GIVEN** `CHAT_MAX_THREADS = 2` y tres hilos creados en orden
- **WHEN** llega un turno del primero sin `rehydration`
- **THEN** responde `404 HILO_DESCONOCIDO` porque fue desalojado
- **AND** los otros dos hilos siguen vivos

### Requirement: Rehidratación equivalente a un hilo vivo

Un turno con `rehydration` (últimos turnos enmascarados y estado estructurado enviados por Backend 1) SHALL reconstruir el hilo y MUST producir el mismo prompt y la misma respuesta que el hilo vivo equivalente.

#### Scenario: Hilo reconstruido produce la misma respuesta [US-259 AC-5]
- **GIVEN** dos hilos con los mismos 3 turnos previos, uno vivo y otro reconstruido desde `rehydration`
- **WHEN** reciben el mismo 4.º turno con los mismos adapters falsos
- **THEN** el prompt enviado al LLM tiene el mismo hash en ambos
- **AND** la respuesta es idéntica

### Requirement: Memoria acotada y no citable

El prompt de cada turno SHALL incluir el estado estructurado completo y solo los últimos turnos previos que quepan en `CHAT_MEMORY_MAX_TOKENS`, contados con el tokenizer del LLM, dentro del bloque `<memory citable="no">` que arma `PromptBuilder.memoria()` de L1D-108, nunca con los rótulos `INICIO_DE_LA_MEMORIA` / `FIN_DE_LA_MEMORIA`. Una afirmación respaldada solo por memoria MUST omitirse y sumar 1 a `omittedClaims` (RN-24, RN-04).

#### Scenario: Ventana recortada por presupuesto de tokens [US-259 AC-7]
- **GIVEN** un hilo con 12 turnos previos cuyo texto supera `CHAT_MEMORY_MAX_TOKENS`
- **WHEN** se arma el prompt del turno 13
- **THEN** contiene el estado estructurado completo
- **AND** solo los últimos turnos que caben en el presupuesto, dentro del bloque `<memory citable="no">` del mensaje de usuario
- **AND** el mensaje de sistema no contiene texto de la memoria ni de la pregunta

#### Scenario: Afirmación respaldada solo por memoria se omite [US-259 AC-7]
- **GIVEN** el LLM falso responde `CHAT-MEMORIA` (afirmación sin `factRefs` ni cita del turno actual, respaldada solo por un turno previo)
- **WHEN** se valida la respuesta del turno
- **THEN** la afirmación no aparece en `blocks[]`
- **AND** `omittedClaims` suma 1

### Requirement: Nada del paciente persiste en Backend 2

Procesar turnos SHALL NOT crear ficheros, escribir en el schema `corpus` ni en Milvus, registrar en *logs* el texto de las preguntas, ni guardar `patientId` o `pseudoPatientId` en el estado del hilo; el aislamiento del rol `rag_corpus` MUST seguir intacto (RN-10, RN-11, ADR-51).

#### Scenario: Conversación con PII sembrada no deja rastro [US-259 AC-8]
- **GIVEN** una conversación de 5 turnos llamando directamente a `/chat/turn` con PII sembrada en la pregunta (sin el enmascarado de Backend 1)
- **WHEN** termina
- **THEN** el directorio de trabajo y el de temporales no tienen ficheros nuevos
- **AND** el schema `corpus` y Milvus no registran escrituras
- **AND** los *logs* no contienen el texto de ninguna pregunta
- **AND** el estado del hilo no tiene claves `patientId` ni `pseudoPatientId`
- **AND** los tests de *permission denied* del rol `rag_corpus` siguen en verde

### Requirement: Lenguaje no prescriptivo y límite de la evidencia en el turno
Toda afirmación del turno SHALL pasar el filtro de lenguaje no prescriptivo de la salida generada (RN-23); la que lo incumple MUST omitirse y sumar a `omittedClaims`. Mientras el nodo `evidencia` no consulte el corpus, el turno de intención `evidencia` MUST añadir un bloque `limitacion` fijo que dice que la evidencia científica no se consultó. La memoria enviada al LLM SHALL NOT incluir el puntaje crudo de relevancia (RN-03), solo si hubo evidencia.

#### Scenario: Una afirmación prescriptiva se omite (asumido: Gate 2 de lenguaje M-1)
- **GIVEN** un LLM falso que propone una afirmación con un término prohibido y otra limpia, ambas con un `factRef` del turno
- **WHEN** se procesa un turno de caso
- **THEN** solo aparece la limpia y `omittedClaims` suma 1

#### Scenario: La intención evidencia declara que no consultó el corpus (asumido: Gate 2 de lenguaje M-2)
- **GIVEN** una pregunta que se enruta a `evidencia`
- **WHEN** se procesa el turno
- **THEN** el último bloque es `limitacion` con el texto fijo de configuración y sin eco de la pregunta

### Requirement: El turno del chat aplica la regla de proveedores locales con datos reales
`POST /chat/turn` MUST tomar la `dataClassification` de la petición (campo publicado por `l1d-316` en la 1.12.0) y aplicar a todo nodo que invoque al LLM (clasificación de la intención y generación) el mismo selector de proveedor que `/rag/query`; con datos reales y el LLM local caído MUST responder `503 LOCAL_LLM_UNAVAILABLE` sin invocar a la nube, y la respuesta MUST declarar `llmProvider` (RN-12, `[S6 resp. 8]`).

#### Scenario: Un turno con datos reales y el LLM local caído responde 503 sin tocar la nube [US-050 AC-2] [RN-12] [S6 resp. 8]
- **GIVEN** un `ChatTurnRequest` con `dataClassification = real_identificado` y contenido sintético, una pregunta que ninguna regla clasifica, `LLM_CLOUD_ENABLED=true`, el LLM local falso caído y un adapter de nube falso que cuenta invocaciones
- **WHEN** se envía a `POST /chat/turn` con un JWT de servicio válido
- **THEN** la respuesta es `503` con `error = LOCAL_LLM_UNAVAILABLE`, válida contra el spec de `rag-orchestrator`
- **AND** el adapter de nube registra cero invocaciones y el registro de hilos no guarda el turno

#### Scenario: Un turno de evidencia con datos reales declara el proveedor local [US-050 AC-1] [RN-12] [S6 resp. 8]
- **GIVEN** el mismo request con una pregunta de evidencia, el LLM local falso disponible y `LLM_CLOUD_ENABLED=true`
- **WHEN** se procesa el turno
- **THEN** el adapter local registra al menos una invocación, el de nube cero y `llmProvider` es `local`

#### Scenario: Con datos sintéticos, la nube habilitada y el LLM local caído, el turno usa el respaldo y declara nube [US-050] [RN-12] (asumido: complemento que fija la regla en el chat)
- **GIVEN** un `ChatTurnRequest` con `dataClassification = sintetico`, `LLM_CLOUD_ENABLED=true`, el LLM local caído y un adapter de nube falso que cuenta invocaciones
- **WHEN** se envía a `POST /chat/turn` una pregunta de caso
- **THEN** el adapter de nube registra al menos una invocación y `llmProvider` es `nube`

### Requirement: El turno de caso responde con bloques enlazados a los datos del paciente
Un turno cuya intención es `caso` SHALL devolver bloques `kind=documentado` con ≥ 1 `factRef` válido del turno, y
Backend 1 SHALL resolver cada `factRef` a un `ConversationDataLink` (`factRef`, `resourceType`, `resourceId`, `origin`,
`relativeDay`, `recordedDate`). Backend 2 SHALL rellenar `notices[]` con los avisos de RN-19 y «Verifique contra las
fuentes». El `recordedDate` de un `ConversationDataLink` MUST salir del registro de Backend 1, nunca del LLM.

#### Scenario: Situación actual con enlaces y avisos
- **GIVEN** el paciente semilla (a) (FX-12-a), `doc1@test.local` con rol `doctor` y el LLM falso `CHAT-CASO-OK` con NLI `entailment`
- **WHEN** pregunta «¿Cuál es la situación actual de este paciente?»
- **THEN** el turno tiene `intent = "caso"`
- **AND** cada bloque tiene `kind = "documentado"` y ≥ 1 `factRef`
- **AND** cada `factRef` de los bloques tiene su `ConversationDataLink` en `dataLinks` con `resourceType`, `resourceId` y `origin`
- **AND** `notices`, rellenado por `rag-orchestrator`, incluye «Generado por IA; requiere validación clínica independiente por el oncólogo tratante», «Uso académico/investigación» y «Verifique contra las fuentes» [US-260 AC-1] [AC-02.5] [RN-19] [ADR-34]

### Requirement: Una afirmación del caso sin soporte NLI se omite
Toda afirmación del turno de caso MUST pasar el NLI con `entailment` contra la verbalización determinista de los hechos
que enlaza (ADR-34). Una afirmación que no lo pasa SHALL omitirse de los bloques y sumar 1 a `omittedClaims` (RN-01).

#### Scenario: Afirmación inventada omitida
- **GIVEN** el LLM falso `CHAT-CASO-INVENTA`, que añade «Recibió radioterapia adyuvante» con `factRefs = ["f2"]` y NLI `neutral` para esa afirmación
- **WHEN** se valida el turno de caso
- **THEN** «Recibió radioterapia adyuvante» no aparece en ningún bloque
- **AND** `omittedClaims = 1` [US-260 AC-2] [AC-02.5] [RN-01]

### Requirement: Una afirmación del caso sin enlace válido se omite sin evaluar
Una afirmación del turno de caso sin ningún `factRef` válido del turno SHALL omitirse, sumar 1 a `omittedClaims` y MUST
NOT enviarse al NLI.

#### Scenario: Afirmación sin factRefs
- **GIVEN** el LLM falso `CHAT-CASO-SIN-ENLACE`, con una afirmación sin `factRefs`
- **WHEN** se valida el turno de caso
- **THEN** la afirmación se omite y `omittedClaims = 1`
- **AND** el adapter NLI falso no registra ninguna evaluación de esa afirmación [US-260 AC-3] [AC-T1.2]

### Requirement: Los hechos del caso enviados a la IA van desidentificados
Backend 1 SHALL enviar a `rag-orchestrator` cada hecho del caso con un `factRef` opaco por turno, su verbalización
determinista (`verbalization`) y su día relativo (`relativeDay`, entero o `null`), y MUST NOT incluir identidad, texto libre sin enmascarar, UUID de recursos o del paciente
ni fechas absolutas. La tabla `factRef → recurso` MUST quedarse en Backend 1.

#### Scenario: caseFacts de P-CHAT sin identidad ni fechas absolutas
- **GIVEN** el paciente sintético `P-CHAT` (FX-12-b) con su nota de texto libre que contiene el nombre y el documento sintéticos
- **WHEN** se envía el turno de caso y MSW captura el cuerpo hacia `/chat/turn`
- **THEN** `caseFacts` no contiene «Lucía Prueba Chat», el documento sintético de `P-CHAT`, ningún UUID de recurso ni del paciente, ni fechas con formato `AAAA-MM-DD`
- **AND** cada hecho lleva un `factRef` opaco del turno (`f1`, `f2`…), su verbalización determinista y su día relativo [US-260 AC-4] [RN-10] [RN-11] [ADR-34]

### Requirement: Los hechos del caso excluyen los datos rechazados y reemplazados
`caseFacts` SHALL contener solo datos vigentes: un dato `rechazado` o `reemplazado` MUST NOT aparecer, y su corrección
vigente SHALL aparecer en su lugar (RN-07, ADR-50).

#### Scenario: HER2 reemplazado fuera, corrección vigente dentro
- **GIVEN** `P-CHAT` con HER2 `2+` `reemplazado` por la corrección `3+` con `supersedes_id`
- **WHEN** se arma `caseFacts`
- **THEN** no hay ningún hecho con HER2 `2+`
- **AND** hay un hecho con HER2 `3+` [US-260 AC-5] [AC-02.6] [RN-07]

### Requirement: La evolución de una serie se presenta en orden cronológico
Cuando el turno de caso enlaza varios valores de una misma serie, sus `ConversationDataLink` SHALL aparecer en orden ascendente de
día relativo, calculado en Backend 1 de forma determinista.

#### Scenario: Evolución del PSA en orden
- **GIVEN** el paciente semilla (b) con tres PSA fechados (FX-12-a)
- **WHEN** pregunta «¿Cómo ha evolucionado el PSA?»
- **THEN** los `ConversationDataLink` de los tres PSA aparecen en orden ascendente de día relativo [US-260 AC-6] [AC-02.4] (asumido en el orden de presentación)

### Requirement: Sin LLM local el turno de caso no responde ni recurre a la nube
Si el LLM local no está disponible en el turno de caso, `clinical-api` SHALL responder `503`, MUST NOT persistir el turno
y ningún adapter de nube MUST recibir llamadas (RN-12, RN-06).

#### Scenario: LLM local caído
- **GIVEN** el LLM falso `LLM-CAIDO`
- **WHEN** se envía el turno de caso
- **THEN** `clinical-api` responde `503`
- **AND** no existe fila nueva en `clinical.conversation_turn`
- **AND** ningún adapter de nube registra llamadas [US-260 AC-7] [RN-12] [RN-06]

### Requirement: El turno de faltantes se verbaliza de forma determinista sin LLM

Un turno con `intent = "faltantes"` SHALL devolver un bloque `kind = faltante` por cada ítem de `completeness[]` con `gapType` no nulo, en el orden del catálogo, verbalizado con plantillas fijas a partir de su `label`, su `gapType` y los `sourceDocumentTypes` que `rag-orchestrator` lee de su catálogo montado. El turno MUST NOT invocar al LLM de generación, al NLI ni a la recuperación. Los bloques `faltante` son deterministas y están exentos de cita (RN-01, glosario §3).

#### Scenario: Dos preguntas iguales producen los mismos bloques sin llamar al LLM

- **GIVEN** el mismo `completeness[]` de `P-CHAT` (FX-12-b), la misma versión del catálogo y adapters falsos que cuentan invocaciones (FX-12-e, FX-12-f)
- **WHEN** llega dos veces a `/chat/turn` la pregunta «¿Qué información falta?»
- **THEN** las dos respuestas tienen `intent = "faltantes"` y los mismos bloques `faltante` en el mismo orden
- **AND** el adapter LLM registra cero llamadas
- **AND** ningún bloque `faltante` lleva `citations` y el validador de citas no lo omite ni lo cuenta en `omittedClaims` [US-263 AC-4] [AC-04.4] [RN-01]

### Requirement: Las plantillas de faltantes describen lo procesado, nunca al paciente

Las plantillas de los bloques `faltante` SHALL describir el vacío respecto de los documentos procesados: `no_encontrado` MUST decir «no se halló en los documentos procesados»; ninguna plantilla MUST contener «ausente en el paciente» ni afirmar que el paciente carece del dato.

#### Scenario: Las cuatro plantillas usan el vocabulario de lo procesado [US-263 AC-4] [RN-23] [S6 resp. 10]

- **GIVEN** un `completeness[]` con un ítem de cada `gapType` (`no_encontrado`, `incompleto`, `por_conciliar`, `no_buscado`)
- **WHEN** se verbaliza el turno de faltantes
- **THEN** el bloque del ítem `no_encontrado` contiene «no se halló en los documentos procesados» y nombra sus tipos de documento fuente
- **AND** ningún bloque contiene «ausente en el paciente»

### Requirement: Sin faltantes el turno lo dice y nombra la versión del catálogo

Si ningún ítem de `completeness[]` tiene `gapType`, el turno de faltantes SHALL responder con un único bloque que dice que no faltan datos críticos según el catálogo y nombra su `catalogVersion`.

#### Scenario: Paciente semilla completo

- **GIVEN** el paciente semilla (a) de FX-12-a y el catálogo 1.6.0
- **WHEN** `doc1@test.local` pregunta «¿Qué información falta?»
- **THEN** la respuesta dice que no faltan datos críticos según el catálogo
- **AND** nombra la versión `1.6.0`
- **AND** no contiene ningún bloque `faltante` [US-263 AC-6] [AC-04.1]

### Requirement: Una versión de catálogo distinta en el turno responde 409 sin invocar adapters

Con el catálogo 1.6.0, `/chat/turn` MUST comparar `catalogVersion` de la petición con la de su catálogo como primer paso y, si difieren, responder `409` con `error = CATALOG_VERSION_MISMATCH` (declarado, implementado y probado por l1d-316 en la 1.12.0; aquí se verifica con el salto de catálogo) sin ejecutar el grafo ni invocar adapters (RN-22).

#### Scenario: rag-orchestrator con catálogo 1.5.0 recibe un turno con 1.6.0

- **GIVEN** `rag-orchestrator` con el catálogo `1.5.0` y adapters falsos que cuentan invocaciones
- **WHEN** recibe un `ChatTurnRequest` con `catalogVersion = "1.6.0"`
- **THEN** responde `409` con `error = CATALOG_VERSION_MISMATCH`, válido contra su spec
- **AND** los adapters de LLM, NLI, embeddings y Milvus registran cero invocaciones [US-263 AC-7] [RN-22]

### Requirement: El turno de evidencia devuelve un análisis de evidencia completo
El nodo `evidencia` SHALL reutilizar el caso de uso de `/rag/query` y MUST devolver en `/chat/turn` `intent = "evidencia"` y
`evidenceAnalysis` con el contrato `EvidenceAnalysis`, cuyas citas sean solo de chunks recuperados en ese turno, con
estados de aplicabilidad por criterio y opciones en el orden de RN-28 (FR-09, FR-25, RN-01, RN-28). El turno MUST rellenar
`structuredState.ultimaEvidencia` sin `analysisId` (Backend 1 es el dueño de los ids).

#### Scenario: Análisis con opciones citadas en el turno [US-265 AC-1] [FR-09] [RN-01] [AC-10.1]
- **GIVEN** el contexto desidentificado del paciente semilla (a), el corpus FX-06a-a y el LLM falso `LLM-OK`
- **WHEN** llega a `/chat/turn` la pregunta «¿Qué evidencia existe para pacientes con las características de este paciente?» sin `activeAnalysisId`
- **THEN** la respuesta tiene `intent = "evidencia"`, sin `subintent`, y `evidenceAnalysis` válido contra el spec con `evidenceOptions` ≥ 1
- **AND** cada cita de `evidenceAnalysis` y de los bloques `kind = evidencia` apunta a un chunk recuperado en ese turno
- **AND** `structuredState.ultimaEvidencia` tiene `query` (la pregunta enmascarada), `chunkIds` (los evaluados por el
  *reranker* en el turno) y `topRelevanceScore` igual al de `evidenceAnalysis`, y no tiene `analysisId`

#### Scenario: Aplicabilidad con un dato faltante en el paciente [US-265 AC-2] [AC-04.3] [RN-28]
- **GIVEN** el contexto desidentificado del paciente semilla (e), sin estado menopáusico
- **WHEN** se procesa la misma pregunta de evidencia
- **THEN** cada opción trae estados por criterio y el criterio de menopausia es «Desconocido» con causa «falta en el paciente»
- **AND** las opciones siguen el orden de RN-28 (menos «No coincide» excluyentes, más «Coincide», relevancia como desempate)

### Requirement: El seguimiento de un análisis vuelve a recuperar y no crea análisis
Con `activeAnalysisId` y una pregunta referida a ese resultado, el turno SHALL tener `subintent = "seguimiento_evidencia"`,
MUST volver a recuperar fragmentos, MUST citar solo chunks recuperados en ese turno y MUST NOT devolver `evidenceAnalysis`
(RN-04, ADR-51 §5). Sin `activeAnalysisId` el turno MUST NOT clasificarse como seguimiento. El seguimiento MUST actualizar
`structuredState.ultimaEvidencia` sin incluir `analysisId` ni `activeAnalysisId`.

#### Scenario: El seguimiento re-recupera y cita solo lo del turno [US-265 AC-3] [RN-04] [S6 resp. 6]
- **GIVEN** el hilo del turno de evidencia de AC-1 y un retriever falso que cuenta llamadas
- **WHEN** llega «¿En qué se diferencia la población del estudio de mi paciente?» con `activeAnalysisId` del turno anterior
- **THEN** el retriever registra una llamada más, la respuesta tiene `intent = "evidencia"`, `subintent = "seguimiento_evidencia"` y no trae `evidenceAnalysis`
- **AND** todas las citas de sus bloques son de chunks recuperados en ese turno

#### Scenario: Sin análisis activo no hay seguimiento [US-265 AC-3] (asumido)
- **GIVEN** un hilo sin turnos de evidencia y la petición sin `activeAnalysisId`
- **WHEN** llega «¿En qué se diferencia la población del estudio de mi paciente?»
- **THEN** la respuesta no tiene `subintent` y, si clasifica como evidencia, trae un `evidenceAnalysis` nuevo

### Requirement: El seguimiento sin chunks sobre el umbral responde sin evidencia sin invocar al LLM
Si en el seguimiento ningún chunk supera el umbral, el turno MUST responder «sin evidencia» con un bloque `limitacion`
determinista, MUST NOT invocar al LLM y MUST dejar `ultimaEvidencia.topRelevanceScore = null` (RN-02).

#### Scenario: Seguimiento sin chunks sobre el umbral responde sin evidencia sin LLM [US-265 AC-3] [RN-02]
- **GIVEN** el hilo de AC-1 con `activeAnalysisId`, un *reranker* falso que deja todos los chunks bajo el umbral y un LLM
  falso que cuenta llamadas
- **WHEN** llega «¿En qué se diferencia la población del estudio de mi paciente?»
- **THEN** la respuesta tiene `subintent = "seguimiento_evidencia"`, sin `evidenceAnalysis` ni bloques `evidencia`, y un
  bloque `limitacion` que dice que no se encontró evidencia
- **AND** el LLM falso registra cero llamadas (ni generación, ni reescritura, ni clasificación)
- **AND** `structuredState.ultimaEvidencia.topRelevanceScore` es `null` (nunca `0.0`)

### Requirement: Una afirmación del seguimiento sin soporte NLI se omite
En el seguimiento, una afirmación citada a un chunk del turno cuyo NLI no es `entailment` MUST omitirse de los bloques y
sumar 1 a `omittedClaims` (RN-01).

#### Scenario: Afirmación del seguimiento con NLI neutral se omite [US-265 AC-7] [RN-01]
- **GIVEN** el seguimiento de AC-3 con un LLM falso que devuelve dos afirmaciones citadas a chunks del turno y un NLI
  falso `entailment` para la primera y `neutral` para la segunda
- **WHEN** se valida la respuesta
- **THEN** solo la primera aparece en los bloques `evidencia` y `omittedClaims` aumenta en 1
- **AND** ningún bloque contiene el texto de la segunda

### Requirement: La respuesta anterior es memoria no citable en el seguimiento
En el seguimiento, la respuesta del turno anterior SHALL viajar al prompt dentro del bloque «memoria de la conversación, no
citable», armado con `PromptBuilder.memoria()` (L1D-108); una afirmación respaldada solo por esa respuesta MUST omitirse
y sumar 1 a `omittedClaims` (RN-24).

#### Scenario: Afirmación respaldada solo por el turno anterior [US-265 AC-4] [RN-24]
- **GIVEN** el seguimiento de AC-3 con el LLM falso `CHAT-MEMORIA`
- **WHEN** se valida la respuesta
- **THEN** la afirmación respaldada solo por la respuesta del turno anterior no aparece en los bloques y `omittedClaims` aumenta en 1
- **AND** el prompt capturado contiene esa respuesta dentro de `<memory citable="no">` y fuera de los bloques
  `<document>`, sin los rótulos `INICIO_DE_LA_MEMORIA` / `FIN_DE_LA_MEMORIA`

### Requirement: El turno de evidencia usa lenguaje no prescriptivo
Ante cualquier pregunta, el bloque de evidencia SHALL llevar el encabezado «Opciones descritas en la evidencia», ningún
texto mostrado MUST contener términos de la lista prohibida de RN-23 y `notices` MUST incluir los avisos de RN-19 desde
la configuración de Backend 2.

#### Scenario: Pregunta prescriptiva [US-265 AC-5] [RN-23] [RN-19]
- **GIVEN** el paciente semilla (a) y `LLM-OK`
- **WHEN** llega «¿Qué tratamiento debe recibir esta paciente?»
- **THEN** el bloque de evidencia lleva el encabezado «Opciones descritas en la evidencia» y ningún texto de bloques ni de `evidenceAnalysis` contiene un término de la lista prohibida
- **AND** `notices` incluye el aviso de IA y el de uso académico tomados de la configuración de Backend 2, con el literal
  sin punto final

### Requirement: LLM caído en el turno de evidencia sin nube
Si el LLM local no está disponible en el turno de evidencia, `/chat/turn` MUST responder `503` con el error tipado
existente `LOCAL_LLM_UNAVAILABLE` y MUST NOT invocar ningún adapter de nube (RN-12).

#### Scenario: LLM local caído [US-265 AC-6] [RN-12] [AC-06.1]
- **GIVEN** el LLM falso `LLM-CAIDO` y adapters de nube falsos que cuentan llamadas
- **WHEN** llega el turno de evidencia
- **THEN** `/chat/turn` responde `503` con `code = "LOCAL_LLM_UNAVAILABLE"`, igual a
  `contracts/examples/chat-turn-llm-local-no-disponible.json`, validado contra el spec y sin `evidenceAnalysis`
- **AND** los adapters de nube registran cero llamadas

### Requirement: Una opción sin soporte no se muestra en el turno
Una opción con una afirmación sin soporte NLI SHALL ir a `discardedOptions` del `evidenceAnalysis` y MUST NOT aparecer
entre las opciones ni en los bloques `kind = evidencia` del turno (FR-10, RN-01).

#### Scenario: Opción sin soporte descartada [US-265 AC-7] [FR-10] [RN-01]
- **GIVEN** el LLM falso `LLM-SIN-SOPORTE` y el NLI falso `neutral` para su afirmación
- **WHEN** se valida el turno de evidencia
- **THEN** la opción está en `evidenceAnalysis.discardedOptions` y no en `evidenceOptions`
- **AND** ningún bloque del turno contiene el texto «reduce la mortalidad a la mitad»

### Requirement: El chat distingue lo documentado de la interpretación

Cada afirmación de un turno de caso SHALL tener `kind = "documentado"` o `kind = "interpretacion"` (enum cerrado de `ChatBlock`). El texto de un bloque `documentado` MUST ser byte a byte la `verbalization` determinista de un único `CaseFact` (ADR-34), insertada por el código y nunca escrita por el LLM, y su `ConversationDataLink` MUST traer el `recordedDate` del registro de Backend 1. Un bloque `interpretacion` MUST tener ≥ 1 `factRef` válido y pasar el NLI contra los hechos que enlaza.

#### Scenario: Solo hay bloques de afirmación o la limitación de AC-4
- **GIVEN** cualquier turno de caso
- **WHEN** se arma la respuesta
- **THEN** cada bloque de afirmación es `documentado` o `interpretacion`; el único otro bloque posible es el `limitacion` de texto fijo cuando no queda ninguna afirmación
- **AND** el rótulo visible «Interpretación generada por IA» de `kind = "interpretacion"` lo pinta la UI de `l1d-324` (L1D-324), no este change [US-261 AC-2]

#### Scenario: Tratamiento previo documentado con su fecha del registro
- **GIVEN** el paciente semilla (b) de FX-12-a con tratamiento previo ADT
- **WHEN** el oncólogo pregunta «¿Qué tratamiento previo ha recibido y cuándo?»
- **THEN** la respuesta tiene un bloque `kind = "documentado"` cuyo texto es byte a byte la verbalización determinista del tratamiento ADT
- **AND** su `ConversationDataLink` trae el `recordedDate` tomado del registro de Backend 1, no del LLM [US-261 AC-1] [AC-02.3] [ADR-34]

#### Scenario: El texto del LLM en un bloque documentado se descarta
- **GIVEN** el LLM falso devuelve una afirmación `documentado` con `factRefs` válidos y un texto propio
- **WHEN** se valida el turno
- **THEN** el bloque contiene solo la verbalización determinista del hecho y nada del texto del LLM [US-261 AC-1] [ADR-34]

#### Scenario: Varios hechos documentados salen en secuencia
- **GIVEN** una afirmación `documentado` que enlaza dos hechos con días relativos −160 y −40
- **WHEN** se arma la respuesta
- **THEN** hay un bloque `documentado` por hecho, en orden ascendente de día relativo [US-261 AC-1] [AC-02.3] (asumido en un bloque por hecho)

#### Scenario: Interpretación que combina dos hechos rotulada como tal
- **GIVEN** una afirmación del LLM que combina dos hechos y el NLI falso devuelve `entailment`
- **WHEN** se valida
- **THEN** aparece como `kind = "interpretacion"` con los dos `factRefs`
- **AND** `notices`, rellenado por `rag-orchestrator`, incluye el aviso de RN-19 [US-261 AC-2] [RN-19]

#### Scenario: Interpretación sin soporte NLI se omite
- **GIVEN** una afirmación `interpretacion` con dos `factRefs` válidos y el NLI falso devuelve `neutral`
- **WHEN** se valida
- **THEN** la afirmación no aparece en ningún bloque y `omittedClaims` suma 1 [US-261 AC-2] [RN-01] [AC-T1.2]

#### Scenario: Interpretación con una cifra ajena a los hechos se omite antes del NLI
- **GIVEN** una afirmación `interpretacion` que escribe una cifra o una unidad que no está en la descripción de los hechos que cita, y el NLI falso devuelve `entailment`
- **WHEN** se valida
- **THEN** la afirmación se omite, `omittedClaims` suma 1 y el adapter NLI no registra llamadas [US-261 AC-2] [RN-01] [ADR-34]

#### Scenario: Interpretación con verbo de tendencia o valoración se omite antes del NLI
- **GIVEN** una afirmación `interpretacion` que dice que un valor «subió», «empeoró», «mejoró» o es «favorable»
- **WHEN** se valida
- **THEN** la afirmación se omite, `omittedClaims` suma 1 y el adapter NLI no registra llamadas; `omittedClaims` cuenta afirmaciones descartadas, no ausencias del expediente [US-261 AC-2] [RN-23]

### Requirement: El chat acota la respuesta al periodo preguntado

Cuando la pregunta nombra un periodo relativo reconocido por reglas deterministas («últimos N días, semanas, meses o años», «último mes» o «último año»), Backend 2 SHALL filtrar `caseFacts` por día relativo antes de armar el prompt. Los `factRefs` de los bloques del turno MUST referirse solo a hechos dentro del periodo; un hecho cuyo intervalo empieza antes y termina dentro del periodo MUST llevar la marca «iniciado antes del periodo» en su verbalización.

#### Scenario: Últimos 100 días
- **GIVEN** `P-CHAT` (FX-12-b) con la quimioterapia neoadyuvante (inicio en el día −160), la cirugía conservadora (día −40) y el diagnóstico (día 0)
- **WHEN** el oncólogo pregunta «¿Qué ocurrió en los últimos 100 días?»
- **THEN** los bloques solo enlazan `factRefs` de hechos con día relativo ≥ −100, entre ellos la cirugía (día −40)
- **AND** la quimioterapia no llega al prompt ni a ningún bloque, porque `CaseFact` solo informa el día de inicio
- **AND** si `CaseFact` informara el fin del intervalo (`dia_relativo_fin`) y este cayera dentro del periodo, la quimioterapia se conservaría con la marca «(iniciado antes del periodo)» en su verbalización (regla pura probada en unitario; inactiva en integración) [US-261 AC-3] [AC-02.1] (asumido en el tratamiento de intervalos que cruzan el periodo)

#### Scenario: El periodo se mide desde el diagnóstico
- **GIVEN** que el día relativo 0 es el diagnóstico y no la fecha de hoy
- **WHEN** la pregunta nombra «los últimos N días»
- **THEN** el filtro conserva los hechos con día relativo ≥ −N [US-261 AC-3] (decisión del PO, 2026-11-06: el ancla en el día 0 del diagnóstico basta para el MVP y queda pendiente de revisar en la Demo 6)

#### Scenario: Hecho que terminó antes del periodo
- **GIVEN** un hecho con intervalo de días −300 a −200
- **WHEN** el oncólogo pregunta por los últimos 100 días
- **THEN** el hecho no llega al prompt ni aparece en ningún `factRef` de los bloques [US-261 AC-3] [AC-02.1]

#### Scenario: Hechos sin fecha confiable fuera del periodo
- **GIVEN** una pregunta con periodo y un hecho con `relativeDay = null`
- **WHEN** se filtra
- **THEN** el hecho no llega al prompt y la respuesta suma a `notices` el aviso fijo «Se omitieron N dato(s) del expediente sin fecha confiable; no se pudieron ubicar en el periodo consultado», que no bloquea y no es el texto de «sin datos» (`CHAT_SIN_FECHA_TEXTO`) [US-261 AC-3] [RN-26]

#### Scenario: Pregunta con fecha absoluta no enmascarada
- **GIVEN** una pregunta con una fecha absoluta («desde el 2025-03-14») que Backend 1 no relativizó
- **WHEN** se arma el prompt
- **THEN** la fecha no se usa como periodo, `caseFacts` llega completo y ningún hecho lleva fecha absoluta [US-261 AC-3] [RN-11] (riesgo preexistente de `l1d-316`/`l1d-317` si Backend 1 no la relativiza)

#### Scenario: Pregunta sin periodo reconocido
- **GIVEN** una pregunta de caso sin ninguna expresión de periodo reconocida
- **WHEN** se arma el prompt
- **THEN** `caseFacts` llega completo, sin filtrar [US-261 AC-3] (asumido)

### Requirement: Sin hecho documentado el chat lo dice y no inventa

Una afirmación del LLM sin `factRefs` válidos SHALL omitirse sin invocar el NLI y sumar a `omittedClaims`. Si todas las afirmaciones del turno se omiten, la respuesta MUST contener únicamente un bloque `limitacion` con el texto fijo «No se encontró información documentada sobre lo preguntado en el expediente», declarado una sola vez en configuración (`CHAT_SIN_DATOS_TEXTO`, RN-22).

#### Scenario: Examen no documentado
- **GIVEN** el paciente semilla (a) de FX-12-a sin gammagrafía ósea registrada
- **WHEN** el oncólogo pregunta «¿Cuál fue el resultado de la gammagrafía ósea?» y el LLM falso devuelve una afirmación sin `factRefs`
- **THEN** la afirmación se omite, `omittedClaims = 1` y el adapter NLI no registra llamadas
- **AND** la respuesta trae un único bloque `kind=limitacion` con el texto fijo «No se encontró información documentada sobre lo preguntado en el expediente» [US-261 AC-4] [RN-01] [S6-prompt §3]

#### Scenario: El periodo no tiene datos pero el expediente sí
- **GIVEN** una pregunta con periodo y hechos del caso solo fuera de ese periodo
- **WHEN** ninguna afirmación sobrevive
- **THEN** el único bloque `limitacion` dice «No se encontró información documentada en el periodo consultado; el expediente tiene datos fuera de ese periodo» (`CHAT_SIN_DATOS_PERIODO_TEXTO`), distinto del texto de «sin datos» [US-261 AC-4]

### Requirement: Las preguntas sobre exámenes, tratamientos y periodos no llevan fechas absolutas al LLM

El prompt de un turno de caso con modo `documentado` o con filtro por periodo SHALL contener solo días relativos; ninguna fecha absoluta (`AAAA-MM-DD` u otro formato de calendario) MUST llegar al LLM, ni en los hechos, ni en el periodo, ni en la memoria del hilo.

#### Scenario: Prompt sin fechas absolutas
- **GIVEN** cualquiera de las preguntas de tratamiento, periodo o examen de este requisito sobre `P-CHAT`
- **WHEN** se arma el prompt que recibe el LLM falso
- **THEN** el prompt contiene días relativos y ninguna cadena que case con `\d{4}-\d{2}-\d{2}` [US-261 AC-5] [RN-11]

### Requirement: CaseFact admite el día relativo de fin como campo opcional y nullable
`CaseFact` SHALL declarar `relativeEndDay` como entero o `null`, **opcional** (fuera de `required`), de modo que un
cuerpo sin el campo siga siendo válido (ADR-26, aditivo). `null` explícito significa «en curso» y la ausencia significa
«puntual o fin no informado»; el prompt, el estado del hilo y los *logs* MUST contener solo días relativos y ninguna fecha
`AAAA-MM-DD` (RN-11).

#### Scenario: El esquema acepta el campo, su ausencia y null, y es aditivo [US-272 AC-3] [ADR-26] [RN-11]
- **GIVEN** el `openapi.yaml` de `rag-orchestrator` y tres `CaseFact` de prueba: con `relativeEndDay = -60`, con `relativeEndDay = null` y sin el campo
- **WHEN** se validan contra el esquema y corre `contracts:breaking` contra `main`
- **THEN** los tres son válidos, `relativeEndDay` no está en `required` y oasdiff no reporta cambios incompatibles ni excepciones nuevas
- **AND** la versión de rag es la siguiente menor libre respecto de `main`

#### Scenario: Ni el prompt ni los logs llevan fechas absolutas con un hecho con intervalo [US-272 AC-3] [RN-11]
- **GIVEN** la petición de `contracts/examples/chat-turn-request-caso-intervalo.json` con la quimioterapia con `relativeEndDay = -60`
- **WHEN** se procesa el turno y se capturan el prompt enviado al LLM falso y los *logs*
- **THEN** no aparece ningún texto con forma `AAAA-MM-DD` y los días de inicio y fin solo figuran como días relativos

### Requirement: Un tratamiento que cruza o sigue activo en el periodo entra y se rotula
Con el periodo `[-N, 0]` medido desde el día 0 del diagnóstico, un hecho con `relativeEndDay` entero SHALL entrar si
`relativeEndDay ≥ -N` y uno con `null` explícito (en curso) siempre. Si empezó antes del periodo su verbalización MUST
llevar «(iniciado antes del periodo)»; si está en curso, «(en curso)». Un hecho con `relativeEndDay < -N` MUST NOT
entrar; uno sin el campo conserva la regla de `l1d-318`. La descripción del hecho SHALL incluir el fin del intervalo.

#### Scenario: La quimioterapia que cruza el periodo entra con la marca de inicio anterior [US-272 AC-1] [AC-02.1]
- **GIVEN** `P-CHAT` con quimioterapia de −160 a −60 (`relativeDay = -160`, `relativeEndDay = -60`) y cirugía en −40
- **WHEN** el oncólogo pregunta «¿Qué ocurrió en los últimos 100 días?»
- **THEN** los bloques enlazan la cirugía y la quimioterapia, porque `relativeEndDay = -60 ≥ -100`
- **AND** el bloque de la quimioterapia lleva «(iniciado antes del periodo)» y no lleva «(en curso)»
- **AND** la descripción del hecho que ve el LLM y el NLI incluye su fin como «hasta 60 días antes del diagnóstico»

#### Scenario: El tratamiento en curso (relativeEndDay null explícito) entra en el periodo y se rotula en curso [US-272 AC-2] [AC-02.1]
- **GIVEN** el JSON crudo de la petición (por `TestClient` y `respx`, sin modelo ya construido) con un tratamiento con `relativeDay = -172` y `relativeEndDay = null` explícito (en curso)
- **WHEN** el oncólogo pregunta «¿Qué ocurrió en los últimos 100 días?»
- **THEN** el hecho entra y su bloque lleva «(iniciado antes del periodo)» y «(en curso)»

#### Scenario: El hecho sin relativeEndDay conserva la regla de l1d-318 [US-272 AC-2] [AC-02.1]
- **GIVEN** el JSON crudo de la petición (por `TestClient` y `respx`) con un tratamiento con `relativeDay = -172` y el campo `relativeEndDay` ausente (fin no informado)
- **WHEN** se pregunta por los últimos 100 días
- **THEN** el hecho no entra y no se marca como en curso (un `null` implícito no es «en curso»)

#### Scenario: Un tratamiento que terminó antes del periodo no entra [US-272 AC-1] [AC-02.1]
- **GIVEN** un tratamiento con `relativeDay = -300` y `relativeEndDay = -200`
- **WHEN** se pregunta por los últimos 100 días
- **THEN** se excluye: no llega al prompt ni a ningún `factRef` de los bloques y no lleva marca alguna

### Requirement: El periodo declara su ancla y el dato en curso sin verificar se avisa sin bloquear
Cuando el turno aplica un periodo y algún hecho entra o se excluye por la rama de intervalo (trae `relativeEndDay`), la
respuesta MUST incluir un bloque `limitacion` de texto fijo «Periodo medido desde la fecha del diagnóstico», escrito por el
código y exento de cita; sin ningún `relativeEndDay` MUST NOT añadirse. Si un hecho en curso tiene
`reviewStatus = requiere_revision`, `notices[]` MUST incluir un aviso fijo de «sin verificar» sin bloquear la respuesta
(RN-26).

#### Scenario: El bloque de periodo declara el ancla del día 0 [US-272 AC-1] [AC-02.1] (asumido)
- **GIVEN** `P-CHAT` con quimioterapia de −160 a −60 y cirugía en −40
- **WHEN** el oncólogo pregunta «¿Qué ocurrió en los últimos 100 días?»
- **THEN** la respuesta incluye el bloque `limitacion` «Periodo medido desde la fecha del diagnóstico», sin texto ni cita del LLM, y coincide con `contracts/examples/chat-turn-caso-intervalo.json`

#### Scenario: Sin relativeEndDay el turno de periodo no cambia [US-272 AC-1] [AC-02.1]
- **GIVEN** la petición `contracts/examples/chat-turn-request-caso-periodo.json` de `l1d-318` (sin `relativeEndDay`)
- **WHEN** se procesa el turno
- **THEN** la respuesta coincide con `contracts/examples/chat-turn-caso-periodo.json` y no incluye el bloque «Periodo medido desde la fecha del diagnóstico»

#### Scenario: Un dato en curso sin verificar se avisa y no bloquea [US-272 AC-2] [RN-26]
- **GIVEN** un tratamiento en curso (`relativeEndDay = null`) con `reviewStatus = requiere_revision`
- **WHEN** se pregunta por los últimos 100 días
- **THEN** el hecho entra y su bloque se muestra, y `notices[]` contiene el aviso fijo de «sin verificar» sin impedir la respuesta

### Requirement: Sin hechos del periodo o sin datos el turno responde con un texto fijo sin intervención del LLM
Cuando el expediente no tiene datos que responder, el turno MUST responder con un único bloque `kind = limitacion` de
texto fijo desde configuración, sin texto del LLM y sin cita (RN-01, glosario §3): sin datos en absoluto, «No se encontró
información documentada sobre lo preguntado en el expediente»; sin datos en el periodo pero con datos fuera de él, el
texto de `l1d-318` (`CHAT_SIN_DATOS_PERIODO_TEXTO`).

#### Scenario: Sin datos en absoluto [US-272 AC-4] [RN-01]
- **GIVEN** un expediente sin hechos del tipo preguntado y el LLM falso con contador
- **WHEN** se procesa el turno de caso
- **THEN** la respuesta es un único bloque `limitacion` con exactamente «No se encontró información documentada sobre lo preguntado en el expediente» (`CHAT_SIN_DATOS_TEXTO`)
- **AND** el LLM de generación registra cero invocaciones y el bloque no lleva texto ni citas del LLM

#### Scenario: Periodo sin hechos con expediente con datos fuera de él [US-272 AC-4] [RN-01] (decidido: se conserva el texto de l1d-318)
- **GIVEN** `P-CHAT` y un periodo («el último mes») en el que ningún hecho entra, con datos fuera del periodo
- **WHEN** se procesa el turno de caso
- **THEN** la respuesta es un único bloque `limitacion` cuyo texto es `CHAT_SIN_DATOS_PERIODO_TEXTO` y comienza por «No se encontró información documentada»
- **AND** el LLM de generación registra cero invocaciones y el bloque no lleva texto ni citas del LLM

### Requirement: El turno de evidencia del chat usa el segundo loop contextual y lo declara en notices
Con una pregunta sin tema propio y el primer loop vacío, `/chat/turn` MUST reutilizar el segundo loop contextual y, si
corrió, `notices[]` MUST incluir «La búsqueda se amplió con datos del caso: » más los nombres de los campos usados. El
código escribe el aviso, nunca el LLM, y MUST NOT contener valores del caso (RN-19, RN-10, RN-11).

#### Scenario: Un turno de chat con pregunta genérica recupera evidencia y declara la ampliación [US-271 AC-1] [US-271 AC-6] [RN-19] [RN-02]
- **GIVEN** `QUERY_CONTEXT_EXPANSION_ENABLED = true`, la petición `contracts/examples/chat-turn-request-evidencia-contextual.json` (pregunta «¿Qué evidencia hay para este caso?», `clinicalContext` del paciente semilla (a)) y adapters falsos con contadores, sobre `TestClient`
- **WHEN** se procesa `POST /chat/turn`
- **THEN** el turno responde `200` con un bloque `evidencia` con cita a un chunk de ese turno, y `notices[]` contiene «La búsqueda se amplió con datos del caso: tipo, estadio y biomarcador» además de los dos avisos de RN-19
- **AND** el LLM de reescritura registra cero invocaciones y la respuesta coincide con el ejemplo `contracts/examples/chat-turn-evidencia-contextual.json`

#### Scenario: Sin loop contextual el aviso de ampliación no aparece [US-271 AC-4] [RN-19]
- **GIVEN** una pregunta con tema propio cuyo primer loop devuelve chunks sobre el umbral
- **WHEN** se procesa `POST /chat/turn`
- **THEN** `notices[]` no contiene ningún texto que empiece por «La búsqueda se amplió con datos del caso»

#### Scenario: El aviso nombra campos y nunca valores [US-271 AC-6] [RN-10] [RN-11]
- **GIVEN** un `clinicalContext` con un estadio y un biomarcador del catálogo y texto libre sintético sembrado
- **WHEN** se procesa el turno con el loop contextual
- **THEN** el aviso de ampliación contiene solo nombres de campo del conjunto cerrado y ni el estadio, ni el biomarcador, ni el texto sembrado

### Requirement: Un turno de evidencia con chunks y sin opciones soportadas se explica con texto fijo y avisos
El turno de evidencia del chat con chunks sobre el umbral y 0 opciones soportadas MUST responder con el bloque
`limitacion` «Evidencia recuperada sin opciones soportadas», las limitaciones de US-266 y los dos avisos de RN-19 en
`notices[]`, sin texto del LLM (RN-01, RN-19).

#### Scenario: El turno de chat «recuperado sin opciones soportadas» se valida de punta a punta [US-271 AC-10] [RN-01] [RN-19]
- **GIVEN** la petición `contracts/examples/chat-turn-request-evidencia-sin-opciones.json`, un retriever con chunks sobre el umbral y un NLI falso `neutral`, sobre `TestClient`
- **WHEN** se procesa `POST /chat/turn`
- **THEN** la respuesta coincide con `contracts/examples/chat-turn-evidencia-sin-opciones.json`: un bloque `limitacion` con el texto fijo, las limitaciones de US-266 y los dos avisos en `notices[]`
- **AND** no declara `sin_evidencia` y `topRelevanceScore` no es `null`

### Requirement: El seguimiento del chat nunca dispara el loop contextual
El seguimiento de una evidencia previa (`subintent = seguimiento_evidencia`) MUST NOT ejecutar el segundo loop contextual ni
declarar `contextExpansion`, aunque la pregunta no tenga tema propio (RN-24).

#### Scenario: Un seguimiento sin tema propio no amplía la búsqueda [US-271 AC-5] [RN-24]
- **GIVEN** `QUERY_CONTEXT_EXPANSION_ENABLED = true`, un `activeAnalysisId` y una pregunta de seguimiento sin tema propio («¿y qué más dice?») con el primer loop vacío, sobre `TestClient`
- **WHEN** se procesa `POST /chat/turn`
- **THEN** no hay segunda recuperación contextual, `contextExpansion` no aparece, `notices[]` no contiene «La búsqueda se amplió con datos del caso» y el turno responde sin evidencia con `topRelevanceScore = null`

### Requirement: La relevancia de un dato faltante se explica con el catálogo y la evidencia citada
Un turno `faltantes` con subintención `relevancia` SHALL identificar el dato crítico con reglas deterministas sobre el
catálogo vigente, SHALL devolver un bloque determinista `kind = "catalogo"` con los criterios de aplicabilidad cuyo
`destination` coincide con el del dato y SHALL devolver la explicación generada por el LLM en bloques
`kind = "evidencia"`, cada uno con ≥ 1 `ChatCitation` a un chunk recuperado en el turno y NLI `entailment`; una
explicación sin soporte MUST omitirse.

#### Scenario: Estado menopáusico con su criterio del catálogo real y evidencia citada
- **GIVEN** `P-CHAT` (FX-12-b) tras el turno de faltantes, el catálogo real `packages/clinical-catalogs/mama/aplicabilidad.json` (1.1.0), el corpus FX-06a-a y un LLM falso que devuelve una afirmación sobre el estado menopáusico con cita a un chunk recuperado en ese turno y NLI `entailment`
- **WHEN** el oncólogo pregunta «¿Por qué importa el estado menopáusico?»
- **THEN** la respuesta tiene un bloque `kind = "catalogo"` con el criterio `estado_menopausico` de `aplicabilidad.json`
- **AND** un bloque `kind = "evidencia"` con esa `ChatCitation` [US-264 AC-1] [RN-01] [RN-29] [S6 resp. 7]

#### Scenario: Ki-67: dato crítico sin criterio de aplicabilidad en el catálogo real
- **GIVEN** `P-CHAT` (FX-12-b) y el catálogo real de mama, donde `ki67` está en `datos-criticos.json` y ningún criterio de `aplicabilidad.json` tiene su `destination`
- **WHEN** el oncólogo pregunta «¿Por qué importa el Ki-67?»
- **THEN** la respuesta tiene un bloque `kind = "catalogo"` con el texto fijo de configuración que dice que es un dato crítico del catálogo vigente y que ningún criterio de aplicabilidad del catálogo vigente lo usa, sin ningún otro contenido clínico
- **AND** toda explicación adicional solo aparece como bloque `kind = "evidencia"` con `ChatCitation` y NLI `entailment` [US-264 AC-1] [RN-29] [RN-01] (asumido en el texto fijo)

### Requirement: Una explicación de relevancia sin soporte NLI se omite
Toda afirmación del turno de relevancia MUST pasar el NLI con `entailment` contra los chunks que cita. La que no lo pasa
SHALL omitirse y sumar 1 a `omittedClaims`; si no queda ninguna, la respuesta SHALL incluir un bloque determinista
`kind = "limitacion"` que diga que la evidencia recuperada no explica la relevancia del dato, junto al bloque `catalogo`.

#### Scenario: Única afirmación con NLI neutral
- **GIVEN** un LLM falso cuya única afirmación tiene NLI `neutral`
- **WHEN** se valida el turno de relevancia
- **THEN** la afirmación se omite y `omittedClaims = 1`
- **AND** la respuesta tiene un bloque `kind = "limitacion"` con «La evidencia recuperada no explica la relevancia de este dato» junto al bloque `catalogo` [US-264 AC-2] [RN-01] [S6 resp. 7]

### Requirement: Sin evidencia sobre el umbral la relevancia no invoca al LLM de generación
Si ningún chunk supera el umbral de relevancia (clave de configuración existente) tras el único bucle de reescritura, el
turno de relevancia MUST NOT invocar al LLM de generación y SHALL responder solo con el bloque `catalogo` y el aviso
«sin evidencia».

#### Scenario: Sin chunks sobre el umbral
- **GIVEN** que ningún chunk supera el umbral tras el único bucle de reescritura
- **WHEN** se procesa la pregunta de relevancia
- **THEN** el LLM de generación registra cero llamadas
- **AND** la respuesta tiene solo el bloque `catalogo` y el aviso «sin evidencia» [US-264 AC-3] [RN-02]

### Requirement: Una explicación de relevancia prescriptiva se omite
Una afirmación del turno de relevancia que contiene un término de la lista de términos prohibidos MUST omitirse aunque
tenga cita válida y NLI `entailment`, y SHALL sumar 1 a `omittedClaims`.

#### Scenario: «debe solicitarse» con cita y entailment
- **GIVEN** un LLM falso que devuelve «El Ki-67 debe solicitarse antes de cualquier tratamiento» con cita válida y NLI `entailment`
- **WHEN** se valida el turno de relevancia
- **THEN** la afirmación se omite por la lista de términos prohibidos
- **AND** `omittedClaims` aumenta en 1 [US-264 AC-4] [RN-23]

### Requirement: Un dato fuera del catálogo no recibe explicación de relevancia
Si la pregunta de relevancia no corresponde a ningún dato de `datos-criticos` del tipo de cáncer, la respuesta SHALL
decir que no es un dato crítico del catálogo vigente, MUST NOT llevar bloque `catalogo` y MUST NOT invocar al LLM de
generación.

#### Scenario: CA 15-3 no está en el catálogo
- **GIVEN** la pregunta «¿Por qué importa el CA 15-3?», que no está en `datos-criticos`
- **WHEN** se procesa
- **THEN** la respuesta dice que no es un dato crítico del catálogo vigente
- **AND** no lleva bloque `catalogo` (asumido) [US-264 AC-5]

### Requirement: La explicación de relevancia solo cita chunks recuperados en el turno
Una afirmación del turno de relevancia cuya cita apunta a un chunk recuperado en un turno anterior y no en el actual
MUST omitirse y sumar 1 a `omittedClaims`; la memoria de turnos previos nunca es cita ni soporte.

#### Scenario: Cita a un chunk de un turno anterior
- **GIVEN** una afirmación que cita un chunk recuperado en un turno anterior y no en este
- **WHEN** se valida el turno de relevancia
- **THEN** la afirmación se omite
- **AND** `omittedClaims` aumenta en 1 [US-264 AC-6] [RN-04] [RN-24]

### Requirement: La pregunta por fuentes y limitaciones se responde sin el LLM de generación

Una pregunta por fuentes o limitaciones SHALL clasificarse por reglas como `intent = "fuentes_limitaciones"` y MUST
resolverse sin llamar al LLM. Cada documento citado en el último turno de evidencia MUST listarse en un bloque `fuente`
sin `chunkId`, con título, `sourceName`, año, idioma y licencia copiados del catálogo del corpus (RN-04, AC-T1.3), y
`notices` MUST llevar los avisos de RN-19.

#### Scenario: Fuentes del último turno de evidencia copiadas del catálogo [US-266 AC-1] [RN-04] [AC-T1.3]
- **GIVEN** un hilo con un turno de evidencia previo resuelto con `LLM-OK` sobre el corpus FX-06a-a, cuyo
  `structuredState` tiene `ultimaEvidencia` (sin `analysisId`) y `citasMostradas` con chunks de `doc-m1`, y el LLM falso
  con contador de invocaciones (FX-12-e)
- **WHEN** el oncólogo pregunta «¿Cuáles son las fuentes y las limitaciones?»
- **THEN** el turno tiene `intent = "fuentes_limitaciones"`
- **AND** el LLM falso registra cero llamadas de generación y cero de clasificación
- **AND** hay un bloque `fuente` por documento citado, con título, `sourceName`, año, idioma y licencia iguales a las
  columnas de `corpus_document` de ese documento, sin `chunkId` ni `citations[]`
- **AND** `notices` incluye el aviso de IA y el de uso académico de la configuración de Backend 2, sin punto final
- **AND** la respuesta valida contra `ChatTurnResponse` del `openapi.yaml` del proveedor

### Requirement: Un metadato de fuente ausente se muestra como «No disponible»

Si el catálogo del corpus no tiene un metadato de una fuente listada, el bloque `fuente` MUST mostrar «No disponible» en
su lugar; el valor nunca se infiere, nunca es `0` ni lo aporta el LLM (RN-25).

#### Scenario: Documento del corpus sin año [US-266 AC-2] [RN-25]
- **GIVEN** el turno de evidencia previo cita un documento del corpus de test con `published_at = null`
- **WHEN** el oncólogo pregunta por las fuentes
- **THEN** el bloque `fuente` de ese documento muestra el año como «No disponible»
- **AND** su texto no contiene `0` ni otro año en lugar del ausente

### Requirement: El turno declara las limitaciones de la recuperación

La respuesta de fuentes y limitaciones MUST incluir un bloque `limitacion` con la fecha de corte del corpus, las fuentes
no incluidas (configuración del corpus de Backend 2, las mismas que publica `/rag/query`) y el número de fragmentos
evaluados por el *reranker* (`len(ultimaEvidencia.chunkIds)`), nunca del LLM (AC-06.2).

#### Scenario: Corte del corpus, fuentes no incluidas y fragmentos evaluados [US-266 AC-3] [AC-06.2]
- **GIVEN** el mismo hilo, con `CORPUS_CUTOFF_DATE = 2026-09-30` y `CORPUS_EXCLUDED_SOURCES = NCCN,ESMO` en la
  configuración de Backend 2 y `ultimaEvidencia.chunkIds` con 41 ids
- **WHEN** se responde la pregunta por las fuentes y las limitaciones
- **THEN** un bloque `limitacion` incluye la fecha de corte `2026-09-30`, las fuentes no incluidas `NCCN` y `ESMO` y el
  número de fragmentos evaluados `41`
- **AND** ningún bloque contiene contenido de NCCN ni de ESMO, solo su nombre como fuente no incluida

### Requirement: El turno declara las limitaciones de la evidencia

La respuesta MUST incluir un bloque `limitacion` que nombra los criterios de aplicabilidad con estado «Desconocido» del
último análisis del estado efímero del hilo, el número de opciones en `discardedOptions` y la frase fija «La evidencia encontrada no permite
establecer por sí sola la aplicabilidad de un tratamiento a este paciente» (FR-10). El texto MUST NOT contener términos
de la lista prescriptiva prohibida (RN-23).

#### Scenario: Criterios desconocidos y opciones descartadas [US-266 AC-4] [FR-10]
- **GIVEN** un hilo vivo cuyo último análisis tiene los criterios «Estado menopáusico» y «Ki-67» en «Desconocido» y 1
  opción en `discardedOptions`
- **WHEN** se responde la pregunta por las fuentes y las limitaciones
- **THEN** un bloque `limitacion` nombra «Estado menopáusico» y «Ki-67», indica 1 opción descartada y contiene la frase
  «La evidencia encontrada no permite establecer por sí sola la aplicabilidad de un tratamiento a este paciente»
- **AND** ningún texto mostrado contiene términos de la lista prohibida de RN-23

### Requirement: Un turno de evidencia sin evidencia lo dice sin invocar al LLM de generación

Cuando una pregunta de evidencia del chat no supera el umbral tras el único segundo loop, el análisis MUST quedar
`status = "sin_evidencia"` con `topRelevanceScore = null` (nunca `0.0`) y `evidenceOptions = []`, el LLM de generación
MUST NOT invocarse, y el turno MUST decirlo junto al bloque `limitacion` de la recuperación (RN-02). Backend 1 MUST
persistir el análisis y el turno antes de responder (RN-06).

#### Scenario: Q-SIN en el chat responde sin_evidencia con las limitaciones de la recuperación [US-266 AC-5] [RN-02]
- **GIVEN** el corpus FX-06a-a, `Q-SIN` enviada como turno de una conversación del paciente semilla (a) y el LLM falso
  con contador de invocaciones
- **WHEN** `clinical-api` procesa el turno (Supertest + PostgreSQL real + MSW desde `chat-turn-fuentes-sin-evidencia.json`)
- **THEN** existe un `AIAnalysisRecord` con `status = "sin_evidencia"`, `topRelevanceScore = null` y
  `evidenceOptions = []`, enlazado al turno persistido
- **AND** el LLM de generación registra cero llamadas
- **AND** el turno indica que no se encontró evidencia y lleva el bloque `limitacion` con la fecha de corte, las fuentes
  no incluidas y los fragmentos evaluados, y `notices` con los avisos de RN-19
- **AND** el `structuredState` persistido tiene `ultimaEvidencia.topRelevanceScore = null` y no tiene `analysisId`

### Requirement: Sin evidencia consultada no se listan fuentes

Si el hilo no tiene ningún turno de evidencia, la pregunta por las fuentes MUST responder que aún no se ha consultado
evidencia en esta conversación, sin bloques `fuente`, sin `citations[]` y sin llamadas al LLM.

#### Scenario: Conversación sin turnos de evidencia [US-266 AC-6]
- **GIVEN** un hilo cuyos turnos previos son solo de `caso` y `faltantes` (sin `ultimaEvidencia`)
- **WHEN** el oncólogo pregunta por las fuentes
- **THEN** la respuesta dice que aún no se ha consultado evidencia en esta conversación
- **AND** no hay bloques `fuente` y `citations` está vacío
- **AND** el LLM falso registra cero llamadas

### Requirement: Un fallo del corpus en el turno de fuentes falla cerrado

Si el catálogo del corpus, las posiciones de los chunks o la release no responden, el turno de fuentes y limitaciones MUST
responder `503` con `RETRIEVAL_UNAVAILABLE`, sin detalle del borde y sin respuesta parcial, y el contrato de `/chat/turn`
MUST declarar ese código y `NLI_UNAVAILABLE` en su `503`. Backend 1 MUST traducirlo a `502` sin persistir el turno.

#### Scenario: Catálogo caído durante el turno de fuentes [US-266 AC-1] [RN-01] [RN-06]
- **GIVEN** un hilo con un turno de evidencia previo y el catálogo del corpus sin respuesta
- **WHEN** el oncólogo pregunta por las fuentes
- **THEN** `rag-orchestrator` responde `503` con `error = "RETRIEVAL_UNAVAILABLE"` sin el mensaje del borde
- **AND** el LLM registra cero llamadas
- **AND** `clinical-api` responde `502` y no persiste el turno

### Requirement: El chat muestra cada contradicción con los dos valores y sus fuentes
Cuando el oncólogo pregunta por contradicciones del expediente, el turno de caso SHALL devolver un bloque
`kind = "conflicto"` por cada par de registros en conflicto que calculó Backend 1 (`CaseFact.conflictWith`), con los dos
valores, sus días relativos, la etiqueta «Por conciliar» en su texto y los `factRefs` de ambos registros, cada uno
resuelto a un `ConversationDataLink`. Backend 2 MUST componer el bloque con una función pura, sin LLM, y MUST NOT elegir
un valor (RN-08).

#### Scenario: Estadios IIA y IIB en conflicto
- **GIVEN** el paciente sintético `P-CHAT` (FX-12-b) con `stage_value = IIA` (día relativo 0) y `stage_value = IIB` (día relativo +10) `requiere_revision` con `conflicts_with_id` al primero, y `doc1@test.local` con rol `doctor`
- **WHEN** pregunta «¿Hay contradicciones en el expediente?»
- **THEN** la respuesta tiene un bloque `kind = "conflicto"` cuyo texto contiene «Por conciliar», los valores IIA e IIB y sus momentos relativos («al momento del diagnóstico» y «10 días después del diagnóstico»)
- **AND** el bloque tiene los `factRefs` de los dos registros de estadio y cada uno tiene su `ConversationDataLink` en `dataLinks`
- **AND** el LLM falso de generación no registra llamadas para componer el bloque [US-262 AC-1] [RN-08] [S6-prompt §2.A]

### Requirement: La IA no resuelve un conflicto del expediente
Una afirmación del LLM que enlaza a un hecho marcado en conflicto (`conflictWith`) sin enlazar también a su contraparte
SHALL omitirse antes del NLI y sumar 1 a `omittedClaims`. El aviso de conflicto MUST NOT bloquear el turno (RN-26).

#### Scenario: «El estadio correcto es IIB» se omite
- **GIVEN** `P-CHAT` y el LLM falso `CHAT-CONFLICTO-RESUELVE` (FX-12-e), que devuelve «El estadio correcto es IIB» con `factRefs` solo al registro IIB
- **WHEN** se valida el turno de caso
- **THEN** «El estadio correcto es IIB» no aparece en ningún bloque
- **AND** `omittedClaims` suma 1 por esa afirmación y el NLI falso no la evalúa [US-262 AC-2] [AC-T3.2] [RN-26]

### Requirement: Un dato corregido se marca y enlaza a su histórico sin enviar el valor reemplazado
Un hecho vigente que reemplazó a otro (`supersedes_id`, ADR-50) SHALL llevar `corrected = true` en `caseFacts` y el
sufijo «(corregido)» en su `verbalization`, y su `ConversationDataLink` SHALL llevar el `resourceType` y el `resourceId`
del registro vigente, de los que la UI deriva la ruta del histórico. La respuesta MUST NOT incluir una ruta de histórico
(`historyPath`). El valor reemplazado MUST NOT viajar a `rag-orchestrator` (RN-07).

#### Scenario: HER2 corregido de 2+ a 3+
- **GIVEN** `P-CHAT` con HER2 `2+` (día −180) `reemplazado` por la corrección `3+` (día −170) con `supersedes_id`
- **WHEN** el oncólogo pregunta «¿Cuál es el HER2 de la paciente?» y MSW captura el cuerpo hacia `/chat/turn`
- **THEN** el bloque muestra `3+` con la marca «(corregido)»
- **AND** el hecho del HER2 en el cuerpo enviado a `/chat/turn` tiene `corrected = true`
- **AND** el `ConversationDataLink` del bloque tiene el `resourceType` del biomarcador y el `resourceId` del `3+`, sin `historyPath`
- **AND** el cuerpo enviado a `/chat/turn` no contiene el valor `2+` [US-262 AC-3] [ADR-50] [RN-07] [AC-02.6]

### Requirement: Sin contradicciones el chat lo dice sin invocar al LLM
Si la pregunta es de contradicciones y ningún hecho de `caseFacts` está marcado en conflicto, el turno SHALL responder el
texto de configuración «No hay contradicciones registradas en el expediente», seguido de su alcance «Se revisaron los diagnósticos y biomarcadores del expediente», y MUST NOT invocar al LLM de generación.

#### Scenario: Paciente sin conflictos
- **GIVEN** el paciente semilla (a) (FX-12-a), sin registros en conflicto, y el LLM falso que cuenta invocaciones
- **WHEN** pregunta «¿Hay contradicciones?»
- **THEN** la respuesta empieza por «No hay contradicciones registradas en el expediente» y añade «Se revisaron los diagnósticos y biomarcadores del expediente»
- **AND** el LLM falso de generación registra cero llamadas [US-262 AC-4] [RN-08]

#### Scenario: Marca de conflicto sin contraparte
- **GIVEN** un hecho marcado en conflicto cuya contraparte no está entre los hechos del turno
- **WHEN** el oncólogo pregunta por contradicciones
- **THEN** el turno no responde «No hay contradicciones»: declara que hay datos marcados en conflicto cuya contraparte no está entre los datos consultados [RN-08]

### Requirement: Un turno del chat nunca modifica el expediente
El turno de chat SHALL ser de solo lectura sobre los datos clínicos: MUST NOT cambiar `review_status`,
`conflicts_with_id` ni `supersedes_id` de ningún registro del paciente, ni crear o borrar registros clínicos.

#### Scenario: Estado de revisión intacto tras el turno
- **GIVEN** `P-CHAT` y una instantánea de `review_status`, `conflicts_with_id` y `supersedes_id` de todos sus registros clínicos
- **WHEN** termina un turno con «¿Hay contradicciones en el expediente?» y otro con `CHAT-CONFLICTO-RESUELVE`
- **THEN** los tres campos de todos sus registros son iguales a la instantánea y el número de registros clínicos no cambia [US-262 AC-5] [AC-T3.2] [S6-prompt §3]

### Requirement: El recorrido AC01…AC06 del chat se verifica de punta a punta con mama y próstata

Un E2E Playwright contra Compose (seed sintético, `LLM_PROVIDER=fake`) SHALL recorrer AC01…AC06 con el paciente (a) de
mama y el (b) de próstata. Cada turno MUST tener el `intent` esperado; los bloques `documentado`, `interpretacion` y
`conflicto` MUST llevar ≥ 1 enlace y los `evidencia` ≥ 1 cita (RN-01), con `faltante`, `catalogo`, `limitacion` y
`fuente` exentos; cada turno generado MUST mostrar los avisos de RN-19.

#### Scenario: Conversación de mama AC01…AC06 [US-269 AC-1] [RN-19] [RN-01]
- **GIVEN** Compose con el seed sintético, `LLM_PROVIDER=fake` y un oncólogo sintético con sesión
- **WHEN** Playwright abre el chat del paciente semilla (a) y envía en orden las preguntas de AC01 (situación clínica),
  AC02 (un examen o tratamiento concreto), AC03 (qué falta), AC04 (por qué importa un faltante), AC05 (evidencia) y AC06
  (fuentes y limitaciones)
- **THEN** los turnos tienen, respectivamente, `intent` `caso`, `caso`, `faltantes`, `faltantes`, `evidencia` y
  `fuentes_limitaciones`
- **AND** cada bloque `documentado`, `interpretacion` o `conflicto` tiene ≥ 1 enlace a un dato del paciente y cada
  bloque `evidencia` tiene ≥ 1 cita
- **AND** a los bloques `faltante`, `catalogo`, `limitacion` y `fuente` no se les exige enlace ni cita
- **AND** cada turno con contenido generado muestra «Generado por IA; requiere validación clínica independiente por el
  oncólogo tratante» y «Uso académico/investigación», sin punto final

#### Scenario: Conversación de próstata AC01…AC06 [US-269 AC-1] [RN-19] [RN-01]
- **GIVEN** el mismo entorno y las respuestas fijas `contracts/examples/chat-turn-*-prostata.json`
- **WHEN** Playwright recorre AC01…AC06 con el paciente semilla (b) (ISUP 3, serie de tres PSA, ADT, progresión)
- **THEN** cada turno tiene el `intent` esperado, cada bloque `documentado`, `interpretacion` o `conflicto` tiene ≥ 1
  enlace y cada bloque `evidencia` ≥ 1 cita, sin exigirlo a `faltante`, `catalogo`, `limitacion` ni `fuente`
- **AND** los avisos de RN-19 aparecen, sin punto final, en cada turno con contenido generado

### Requirement: La identidad sintética no aparece en ninguna superficie de la conversación

A lo largo de una conversación, la identidad del paciente MUST NOT aparecer en los cuerpos que `clinical-api` envía a
`rag-orchestrator`, en el estado efímero del hilo de `rag-orchestrator` ni en los *logs* de `web`, `clinical-api` y
`rag-orchestrator` (RN-10, RN-11), aunque el oncólogo la escriba en la pregunta.

#### Scenario: Pregunta con PII sembrada sin fuga en los cuerpos hacia Backend 2 [US-269 AC-6] [RN-10] [RN-11]
- **GIVEN** el paciente `P-CHAT` (FX-12-b, sembrado por `l1d-315`), MSW capturando `POST /chat/turn` y la pregunta FX-12-d con su nombre,
  documento y fecha de nacimiento sintéticos
- **WHEN** el oncólogo envía la pregunta por `POST …/conversations/{id}/turns`
- **THEN** ninguno de los cuerpos capturados contiene el nombre, el documento ni la fecha de nacimiento absoluta
  sintéticos

#### Scenario: Sin fuga en el estado del hilo [US-269 AC-6] [RN-11]
- **GIVEN** la petición desidentificada de FX-12-d producida por el pipeline de `clinical-api`
- **WHEN** `rag-orchestrator` resuelve el turno y se inspecciona el estado del hilo en el registro en memoria
- **THEN** 0 apariciones de la identidad sintética en todos los campos del estado

#### Scenario: Sin fuga en los logs de Compose [US-269 AC-6] [RN-10]
- **GIVEN** el E2E de la conversación con FX-12-d terminado
- **WHEN** se recogen los *logs* de `web`, `clinical-api` y `rag-orchestrator`
- **THEN** 0 apariciones del nombre, del documento y de la fecha de nacimiento sintéticos
