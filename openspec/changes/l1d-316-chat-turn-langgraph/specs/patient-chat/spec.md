## Purpose

Resolver cada turno de la conversación del oncólogo sobre un paciente en `rag-orchestrator`: contrato interno `/chat/turn`, enrutado de la pregunta, estado efímero del hilo con TTL y rehidratación, y memoria acotada no citable, sin persistir nada del paciente en Backend 2 (ADR-51).

## ADDED Requirements

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
