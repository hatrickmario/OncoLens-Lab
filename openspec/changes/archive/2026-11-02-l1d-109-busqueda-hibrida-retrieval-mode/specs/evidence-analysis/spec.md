## ADDED Requirements

### Requirement: La recuperación híbrida suma la rama sparse antes del reranker
Con `RETRIEVAL_MODE = hibrida`, `/rag/query` MUST ejecutar una búsqueda *dense* y una *sparse* (BGE-M3, mismo `SPARSE_VECTOR_SOURCE` que el corpus), fusionar sus candidatos con la regla de `RETRIEVAL_FUSION` y entregarlos al *reranker*; el `relevanceScore` MUST seguir saliendo solo del *reranker* (RN-03).

#### Scenario: Un chunk hallado solo por la rama sparse llega al reranker y se cita [US-112 AC-1] [AC-06.1] [FR-09]
- **GIVEN** `RETRIEVAL_MODE = hibrida`, FX-06a-a con `ch-m2-1` fuera del top-k *dense* y primero en el recuperador *sparse* falso para `Q-KEYWORD`
- **WHEN** `clinical-api` envía `Q-KEYWORD` a `POST /rag/query` con un JWT de servicio válido
- **THEN** `ch-m2-1` llega a los candidatos del *reranker*, la respuesta es `con_evidencia` y la opción cita `ch-m2-1`

#### Scenario: La relevancia es la del reranker, no la de la fusión [US-112 AC-2] [RN-03] [ADR-8]
- **GIVEN** la respuesta del escenario anterior con el *reranker* falso dando 0,82 a `ch-m2-1`
- **WHEN** se inspecciona la respuesta
- **THEN** `relevanceScore = 0.82`
- **AND** no es el puntaje RRF ni el ponderado

### Requirement: Ambas ramas aplican el mismo filtro de vigencia y tipo de cáncer
La búsqueda *sparse* MUST usar el mismo filtro escalar que la *dense* (`is_current == true`, `cancer_type_tags`, `population`, `source_type`); un chunk no vigente o de otro tipo de cáncer SHALL quedar fuera de los candidatos del *reranker* y de las citas aunque la rama *sparse* lo devuelva primero (RN-05).

#### Scenario: Un chunk no vigente devuelto por el sparse no llega al reranker [US-112 AC-3] [RN-05] [AC-06.1]
- **GIVEN** `RETRIEVAL_MODE = hibrida`, `ch-m1v0-1` (`is_current = false`) devuelto primero por el recuperador *sparse* falso y `ch-p1-1` (próstata)
- **WHEN** se procesa `Q-HER2` con un caso de mama
- **THEN** la expresión de filtro de ambas ramas incluye `is_current == true` y restringe `cancer_type_tags` a mama
- **AND** ni `ch-m1v0-1` ni `ch-p1-1` llegan al *reranker* ni a las citas

### Requirement: El modo híbrido no invoca al LLM sin evidencia
En modo híbrido, sin chunks sobre el umbral la respuesta MUST ser `sin_evidencia` con `topRelevanceScore = null` y cero invocaciones del LLM de generación y del agente (RN-02); el LLM de reescritura de consulta (RN-02 enmendada, E-14, l1d-300) se invoca como mucho una vez, según `QUERY_REWRITE_ENABLED`.

#### Scenario: Q-SIN en modo híbrido responde sin_evidencia [US-112 AC-4] [RN-02]
- **GIVEN** `RETRIEVAL_MODE = hibrida` y el adapter falso del LLM de generación con contador
- **WHEN** se procesa `Q-SIN`
- **THEN** responde `sin_evidencia` y el LLM de generación registra cero invocaciones

### Requirement: Modo, fusión y parámetros en configuración y trazados
`RETRIEVAL_MODE`, `RETRIEVAL_FUSION`, `RRF_K` y `HYBRID_SPARSE_WEIGHT` MUST leerse de configuración (RN-22), sin literales en código, y `meta.retrievalParams` SHALL registrar siempre `retrievalMode`, `fusion` y `fusionParam`, sin `null` (`fusion = ninguna` y `fusionParam = 0` en `dense`), en `/rag/query` y en `/rag/follow-up`, y persistirse en `retrieval_params` (AC-T1.4).

#### Scenario: Los parámetros de RRF quedan en meta y persistidos [US-112 AC-5] [RN-22] [AC-T1.4] [S4 resp. 18]
- **GIVEN** `RETRIEVAL_MODE = hibrida`, `RETRIEVAL_FUSION = rrf` y `RRF_K = 60`
- **WHEN** se procesa cualquier consulta
- **THEN** `meta.retrievalParams` trae `retrievalMode = hibrida`, `fusion = rrf` y `fusionParam = 60`
- **AND** el mismo bloque se persiste en `retrieval_params` del `AIAnalysisRecord`

#### Scenario: Los logs de la recuperación híbrida no llevan texto [US-112 AC-5] [RN-10]
- **GIVEN** `RETRIEVAL_MODE = hibrida` y la captura de logs del servicio
- **WHEN** se procesa `Q-KEYWORD`
- **THEN** los logs pueden traer `retrievalMode`, `fusion`, `fusionParam`, recuentos por rama y `chunkId`
- **AND** no contienen el texto de la consulta, de ningún fragmento, del *prompt* ni de la salida del LLM

### Requirement: Por defecto la recuperación es dense y la fusión ponderada es alternativa
Sin `RETRIEVAL_MODE` definido el servicio MUST recuperar en `dense` sin invocar la rama *sparse*; con `RETRIEVAL_FUSION = ponderada` y `HYBRID_SPARSE_WEIGHT = 0,3` MUST fusionar por suma ponderada y trazar el peso.

#### Scenario: Sin configuración el modo es dense y el sparse no se llama [US-112 AC-6] [RN-22] [ADR-45] [S4 resp. 17]
- **GIVEN** `RETRIEVAL_MODE` sin definir y el recuperador *sparse* falso con contador
- **WHEN** se procesa `Q-KEYWORD`
- **THEN** el contador *sparse* es 0, `retrievalMode = dense` y `ch-m2-1` no llega al *reranker*
- **AND** `fusion = ninguna` y `fusionParam = 0`, sin ningún `null` en `meta.retrievalParams`

#### Scenario: La fusión ponderada recupera el chunk y traza su peso [US-112 AC-6] [RN-22] [ADR-45] [S4 resp. 18]
- **GIVEN** `RETRIEVAL_MODE = hibrida`, `RETRIEVAL_FUSION = ponderada` y `HYBRID_SPARSE_WEIGHT = 0,3`
- **WHEN** se procesa `Q-KEYWORD`
- **THEN** `ch-m2-1` llega al *reranker*
- **AND** `meta.retrievalParams` registra `fusion = ponderada` y `fusionParam = 0.3`
