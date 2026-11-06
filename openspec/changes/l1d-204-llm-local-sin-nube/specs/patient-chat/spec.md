## ADDED Requirements

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
