# Spec Delta — evidence-analysis (l1d-335, US-277)

## MODIFIED Requirements

### Requirement: La consulta reescrita solo usa términos del catálogo
Los términos que la reescritura agregue MUST existir en el catálogo versionado (`CLINICAL_CATALOG_PATH`) como término canónico o como sinónimo con `relacion = equivalente`; los ausentes y los que solo figuran como `mas_amplio` o `miembro_de_clase` SHALL descartarse sin inventar códigos (RN-27). Si no queda ningún término admitido, no hay segunda recuperación y la respuesta es `sin_evidencia` con `queryRewrite = { applied: false, reason: "no_disponible" }`.

#### Scenario: Solo el término presente en el catálogo se usa [US-238 AC-6] [RN-27]
- **GIVEN** un LLM falso que propone expandir `CDK4/6` con `ribociclib` (en el catálogo) y `farmaco-inventado-x` (ausente)
- **WHEN** se arma la consulta del segundo loop
- **THEN** solo `ribociclib` se usa para recuperar y `farmaco-inventado-x` se descarta

#### Scenario: Sin términos del catálogo no hay segunda recuperación [US-238 AC-6] [RN-27]
- **GIVEN** un primer loop vacío y un LLM falso que solo propone `farmaco-inventado-x`
- **WHEN** se procesa la consulta
- **THEN** no hay segunda búsqueda en Milvus y responde `sin_evidencia` con `queryRewrite = { applied: false, reason: "no_disponible" }`

#### Scenario: El nombre coloquial se expande con su término técnico del catálogo [US-277 AC-2] [FR-09]
- **GIVEN** el catálogo ampliado, `QUERY_REWRITE_ENABLED = true`, la pregunta «cirugía radical de próstata» con el primer loop vacío y un LLM falso que propone `prostatectomía radical` y `radical prostatectomy`
- **WHEN** se arma la consulta del segundo loop
- **THEN** ambos términos se suman al texto que se embebe y `queryRewrite = { applied: true, reason: "disparado" }`

#### Scenario: Un término fuera del catálogo se descarta y la pregunta original sigue puntuando [US-277 AC-4] [RN-27] [RN-03]
- **GIVEN** el catálogo ampliado y un LLM falso que propone `prostatectomía radical` (en el catálogo) y `tecnica-inventada-x` (ausente)
- **WHEN** se procesa la consulta con el primer loop vacío
- **THEN** solo `prostatectomía radical` entra a la segunda búsqueda
- **AND** el *reranker* puntúa los chunks del segundo loop contra la pregunta original, que es la mostrada y la guardada

#### Scenario: Un término que solo es más amplio o miembro de una clase no expande [US-277 AC-4] [S7 resp. 6]
- **GIVEN** un catálogo de prueba en el que `termino-amplio-x` solo figura como sinónimo `mas_amplio` y `miembro-x` solo como `miembro_de_clase`, y un LLM falso que propone ambos
- **WHEN** se procesa la consulta con el primer loop vacío
- **THEN** ninguno entra a la segunda búsqueda y la respuesta es `sin_evidencia` con `queryRewrite = { applied: false, reason: "no_disponible" }`

## ADDED Requirements

### Requirement: El catálogo de sinónimos ampliado no cambia la regla de sin evidencia
Con el catálogo ampliado de sinónimos, la reescritura MUST seguir invocándose solo cuando el primer loop no deja chunks sobre `RELEVANCE_THRESHOLD`; si tras el único segundo loop tampoco los hay, la respuesta SHALL ser `sin_evidencia` con `topRelevanceScore = null` (nunca `0.0`) y sin invocar al LLM de generación ni al agente (RN-02).

#### Scenario: Con chunks sobre el umbral en el primer loop no se reescribe [US-277 AC-3] [RN-02]
- **GIVEN** el catálogo ampliado, `QUERY_REWRITE_ENABLED = true` y una pregunta con el término técnico cuyo primer loop deja chunks sobre el umbral
- **WHEN** se procesa la consulta
- **THEN** el LLM de reescritura no se invoca y `queryRewrite = { applied: false, reason: "no_disparado" }`

#### Scenario: Segundo loop vacío responde sin evidencia sin generar [US-277 AC-3] [RN-02]
- **GIVEN** el catálogo ampliado, `QUERY_REWRITE_ENABLED = true` y una pregunta coloquial cuyos dos loops no dejan chunks sobre el umbral
- **WHEN** se procesa la consulta
- **THEN** la respuesta es `sin_evidencia` con `topRelevanceScore = null`
- **AND** el LLM de generación no se invoca y no hay un tercer loop
