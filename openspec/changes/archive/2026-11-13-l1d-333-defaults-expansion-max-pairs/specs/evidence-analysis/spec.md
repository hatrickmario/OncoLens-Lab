## ADDED Requirements

### Requirement: La expansión contextual arranca activa por defecto y sigue siendo apagable
`Settings` MUST traer `QUERY_CONTEXT_EXPANSION_ENABLED=true` cuando el entorno no lo define, con `RETRIEVAL_MODE=dense`
sin cambio, y un valor `false` en el entorno MUST restituir el comportamiento previo a US-271: ningún segundo loop
contextual ni `contextExpansion` en `retrievalParams` (RN-22, RN-02).

#### Scenario: Los valores por defecto activan la expansión [US-275 AC-1] [RN-22]
- **GIVEN** un entorno sin `QUERY_CONTEXT_EXPANSION_ENABLED`
- **WHEN** arranca `Settings`
- **THEN** `query_context_expansion_enabled` es `true`, `retrieval_mode` es `dense` y los campos de expansión son tipo, estadio y biomarcador principal

#### Scenario: Apagada explícitamente no hay segundo loop [US-275 AC-6] [RN-22]
- **GIVEN** `QUERY_CONTEXT_EXPANSION_ENABLED=false` y una pregunta sin tema propio con el primer loop vacío
- **WHEN** se procesa `/rag/query`
- **THEN** el estado es `sin_evidencia`, el *reranker* solo puntuó la pregunta original y `retrievalParams` no incluye `contextExpansion`
