## MODIFIED Requirements

### Requirement: La versión del prompt de generación queda registrada en meta
`meta.promptVersion` MUST comenzar por `rag-query@0.4.0`; cuando el respaldo de población de `l1d-294` invoca al LLM, MAY continuar con el sufijo `+poblacion_v1` (la versión de `POPULATION_PROMPT_VERSION`) sin espacios. Las comprobaciones SHALL usar un prefijo tolerante a ese sufijo, para no acoplar este change al de aplicabilidad.

#### Scenario: La versión del prompt empieza por rag-query@0.4.0 con o sin sufijo de aplicabilidad [US-065 AC-5] [RN-07] (asumido: sufijo de l1d-128)
- **GIVEN** una consulta a `/rag/query` con el contexto de FX-T1a-a y el LLM falso
- **WHEN** se lee `meta.promptVersion` de la respuesta
- **THEN** el valor coincide con `^rag-query@0\.4\.0(\+poblacion_v1)?$`
