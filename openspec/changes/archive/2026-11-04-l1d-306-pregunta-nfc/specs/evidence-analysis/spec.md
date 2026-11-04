## ADDED Requirements

### Requirement: rag-orchestrator normaliza la pregunta de /rag/query antes de usarla
`rag-orchestrator` MUST normalizar la `query` de `POST /rag/query` al recibirla, con la misma regla que `clinical-api` (Unicode NFC, espacios colapsados y recortados, sin cambiar mayúsculas ni puntuación), antes de detectar el idioma, recuperar, reranquear o construir el prompt, aunque el llamador no pase por `clinical-api`. Una `query` vacía tras normalizar SHALL responder `422 CUERPO_INVALIDO` sin invocar ningún adapter (OUT-05).

#### Scenario: Una pregunta en NFD llega al prompt en NFC [US-250 AC-4] [OUT-05]
- **GIVEN** `rag-orchestrator` con adapters falsos (recuperación con chunks sobre el umbral y un LLM falso que registra el prompt recibido) y un JWT de servicio válido
- **WHEN** un llamador envía `POST /rag/query` con la pregunta de la Demo 4 en NFD
- **THEN** el texto de la pregunta dentro del prompt registrado está en NFC y no contiene marcas combinantes

#### Scenario: Las versiones NFC y NFD de la misma pregunta producen el mismo prompt [US-250 AC-5] [OUT-05]
- **GIVEN** el mismo contexto
- **WHEN** se ejecuta `POST /rag/query` con la pregunta de la Demo 4 en NFC y, en otra petición, en NFD, con el mismo contexto clínico y los mismos filtros
- **THEN** el SHA-256 del prompt registrado por el LLM falso es el mismo en las dos ejecuciones
- **AND** la consulta que reciben el adapter de recuperación y el *reranker* es la misma en las dos

#### Scenario: Una pregunta formada solo por espacios responde 422 sin invocar adapters [US-250 AC-4] (Decidido (usuario, 2026-11-03): defensa en profundidad del mínimo de 1 carácter, `[S5 resp. 13]`)
- **GIVEN** el mismo contexto
- **WHEN** un llamador envía `POST /rag/query` con una `query` formada solo por espacios no separables
- **THEN** responde `422` con `error = CUERPO_INVALIDO`, sin eco de la petición, válido contra el spec de `rag-orchestrator`
- **AND** ningún adapter (idioma, recuperación, *reranker*, NLI, LLM) registra llamadas
