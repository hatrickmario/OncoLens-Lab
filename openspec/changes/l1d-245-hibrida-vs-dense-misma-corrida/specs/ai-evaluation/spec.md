## ADDED Requirements

### Requirement: Comparación de recuperación híbrida y densa en la misma corrida
La suite `evaluate` MUST, con `eval/configs/s4-hibrida.yaml`, evaluar los brazos A0 (*dense*), A2 (híbrida con RRF, k = 60) y A2b (suma ponderada, 0,3) en una sola ejecución, con los mismos modelos locales, el mismo corpus indexado y las mismas preguntas, y SHALL reportar por brazo recall@10 total, recall@10 de español a inglés y MRR, y la diferencia de A2 y A2b frente a A0.

#### Scenario: El reporte compara los tres brazos en la misma corrida [US-133 AC-1]
- **GIVEN** el conjunto de desarrollo de `data/eval/ol06-particion-v1`, los modelos locales de ADR-39 y el corpus indexado con *dense* y *sparse*
- **WHEN** se ejecuta `evaluate --config eval/configs/s4-hibrida.yaml`
- **THEN** el reporte trae para A0, A2 y A2b recall@10 total, recall@10 es→en y MRR
- **AND** trae la diferencia de A2 y A2b frente a A0 de esa misma corrida, sin usar el baseline del S1

### Requirement: Retroceso de un brazo híbrido
La suite MUST marcar como retroceso un brazo híbrido cuya diferencia frente a A0 sea peor que `RETRIEVAL_REGRESSION_TOLERANCE` (configuración, RN-22) en cualquiera de las tres métricas, y SHALL terminar con código de salida distinto de cero.

#### Scenario: Un brazo peor que la tolerancia marca retroceso [US-133 AC-2]
- **GIVEN** un brazo híbrido con una diferencia frente a A0 peor que `RETRIEVAL_REGRESSION_TOLERANCE` en una de las tres métricas
- **WHEN** termina la suite
- **THEN** el reporte marca ese brazo como retroceso
- **AND** el código de salida es distinto de cero

#### Scenario: Sin retroceso la suite sale en cero
- **GIVEN** ambos brazos híbridos dentro de la tolerancia en las tres métricas
- **WHEN** termina la suite
- **THEN** ningún brazo se marca como retroceso y el código de salida es cero

### Requirement: Cada consulta queda trazada con su brazo
El reporte MUST registrar de `meta.retrievalParams` de cada consulta el `retrievalMode`, la `fusion` y el `fusionParam` del brazo que la ejecutó (sin `null`), y la suite SHALL fallar si alguno no coincide con el del brazo.

#### Scenario: Modo y fusión coherentes con el brazo [US-133 AC-3]
- **GIVEN** el reporte del escenario de comparación
- **WHEN** se inspecciona `meta.retrievalParams` de cada consulta
- **THEN** el 100 % de las de A0 trae `retrievalMode = dense`, `fusion = ninguna` y `fusionParam = 0`
- **AND** el 100 % de las de A2 trae `retrievalMode = hibrida`, `fusion = rrf` y `fusionParam = 60`, y el de A2b `hibrida`, `ponderada` y `0.3`

### Requirement: Comparación reproducible con adaptadores falsos
Con la configuración de adaptadores falsos, dos ejecuciones de la comparación MUST producir métricas idénticas.

#### Scenario: Dos corridas dan las mismas métricas [US-133 AC-4]
- **GIVEN** la configuración falsa de la comparación
- **WHEN** se ejecuta dos veces
- **THEN** las métricas de los tres brazos son idénticas

### Requirement: Solo el conjunto de desarrollo y golden verificado
La comparación MUST evaluar únicamente preguntas del conjunto de desarrollo de `ol06-particion-v1`, SHALL verificar `golden_sha256` contra el golden vigente y MUST NOT leer los conjuntos de validación ni de prueba (ADR-45 P2).

#### Scenario: Validación y prueba quedan sin abrir [US-133 AC-5]
- **GIVEN** la configuración de la comparación
- **WHEN** se ejecuta
- **THEN** solo se evalúan preguntas del conjunto de desarrollo
- **AND** la corrida verifica `golden_sha256` contra el golden vigente
- **AND** no se lee ninguna pregunta de validación ni de prueba

#### Scenario: Un golden distinto aborta la corrida
- **GIVEN** un `golden_sha256` que no coincide con el golden vigente
- **WHEN** se ejecuta la comparación
- **THEN** la corrida termina con código distinto de cero sin producir métricas
