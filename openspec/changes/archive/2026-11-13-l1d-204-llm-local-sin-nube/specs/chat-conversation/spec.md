## ADDED Requirements

### Requirement: El turno de la conversación toma la clasificación del paciente y verifica el proveedor
`POST /platform/conversations/{conversationId}/turns` MUST enviar a `/chat/turn` la `dataClassification` tomada de `Patient.data_origin` con la misma función que el gateway del análisis; una respuesta con `llmProvider = nube` para un paciente real MUST responder `502` sin persistir el turno, y un `503` de Backend 2 MUST responder `503` sin persistirlo ni recurrir a otro proveedor (RN-12, `[S6 resp. 8]`).

#### Scenario: El request del turno lleva la clasificación del paciente [US-050 AC-4] [RN-12] [S6 resp. 8]
- **GIVEN** una conversación de un paciente de test con `data_origin = real_identificado` y MSW que captura el cuerpo enviado a `/chat/turn`
- **WHEN** `doc1@test.local` envía un turno
- **THEN** el cuerpo capturado lleva `dataClassification = real_identificado`

#### Scenario: Backend 2 con el LLM local caído y dato real responde 503 sin turno [US-050 AC-5] [RN-06] [RN-12] [S6 resp. 8]
- **GIVEN** la misma conversación y MSW que responde en `/chat/turn` el `503` de `contracts/examples/chat-turn-llm-local-no-disponible.json` (de `l1d-316`)
- **WHEN** se envía un turno
- **THEN** la respuesta es `503` válida contra el spec de `clinical-api`, sin detalles internos de `rag-orchestrator`, MSW registra una sola llamada
- **AND** `clinical.conversation_turn` y `clinical.ai_analysis_record` no tienen filas nuevas

#### Scenario: Un turno servido por la nube para un paciente real se descarta [US-050 AC-5] [RN-12] (asumido: defensa en profundidad, igual que el gateway)
- **GIVEN** la misma conversación y MSW que responde `200` en `/chat/turn` con `llmProvider = nube`
- **WHEN** se envía un turno
- **THEN** la respuesta es `502` con el schema de error del spec y no se persiste ningún `conversation_turn`
