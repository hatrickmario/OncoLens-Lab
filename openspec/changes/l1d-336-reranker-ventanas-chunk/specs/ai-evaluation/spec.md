# Spec Delta — ai-evaluation

## ADDED Requirements

### Requirement: Comparación de los brazos del reranker en la suite evaluate
La suite `evaluate` MUST comparar con modelos locales, sobre las mismas preguntas y los pares de paráfrasis de US-276, los brazos `primera` (referencia) y `maximo` de `RERANKER_CHUNK_WINDOWS` y, como alternativos, `RERANKER_MAX_LENGTH` ampliado y chunks de 512 tokens, y SHALL reportar por brazo recall@10, MRR, falsos «sin evidencia», paráfrasis recuperadas y p95 de la etapa del *reranker* y de la consulta completa.

#### Scenario: El informe trae las métricas de cada brazo y su diferencia con la referencia [US-278 AC-4] [OL-06] [ADR-45 P6]
- **GIVEN** la suite `evaluate` con `adaptadores.proveedor: local`, la ingesta de `l1d-119` (el mismo corpus de la corrida base del S7), los umbrales actuales y los pares de paráfrasis de US-276
- **WHEN** se ejecuta la configuración de los brazos del *reranker*
- **THEN** el informe trae para `primera` y `maximo` recall@10, MRR, el número de falsos «sin evidencia», el número de paráfrasis recuperadas y el p95 de la etapa del *reranker* y de la consulta completa
- **AND** trae la diferencia de cada brazo frente a `primera` medida en esa misma corrida, no frente a un baseline anterior

#### Scenario: El brazo de chunks de 512 tokens se mide sobre su propio índice [US-278 AC-4] [ADR-45 P6]
- **GIVEN** el mismo corpus reindexado con chunks de 512 tokens y el solapamiento vigente
- **WHEN** se ejecuta su brazo
- **THEN** el informe trae las mismas métricas que los demás brazos y declara que su índice es distinto del de la referencia

#### Scenario: Cada brazo queda identificado por su configuración [US-278 AC-4] [IA-07]
- **GIVEN** el informe de la comparación
- **WHEN** se inspecciona un brazo
- **THEN** registra su `RERANKER_CHUNK_WINDOWS`, `RERANKER_WINDOW_OVERLAP`, `RERANKER_MAX_LENGTH`, `RERANKER_MAX_PAIRS` y tamaño de chunk, y la suite falla si el modo de ventanas efectivo de una consulta no coincide con el de su brazo
- **AND** el informe es el único lugar donde quedan el modo y el solape: `meta.rerankerModel` no los lleva

#### Scenario: El informe identifica el corpus y los umbrales de la corrida [US-278 AC-4] [S7 resp. 10] [S7 resp. 11]
- **GIVEN** el informe de la comparación de la corrida final
- **WHEN** se inspecciona su configuración
- **THEN** registra el corpus de los brazos, que es la ingesta de `l1d-119` y el mismo de la corrida base, y los umbrales vigentes con los que corrieron todos los brazos

#### Scenario: El informe no contiene texto de chunks ni de preguntas reales [US-278 AC-4] [RN-13] [RN-14]
- **GIVEN** el informe en `reports/eval/`
- **WHEN** se inspecciona
- **THEN** contiene ids, puestos, puntajes, recuentos y configuración, sin texto de chunks, y sus preguntas son sintéticas

### Requirement: Un brazo del reranker fuera de presupuesto se marca no viable
La suite MUST marcar «no viable» el brazo cuyo p95 de consulta completa supere el tope vigente (`p95_evidence_analyses_s`, configuración) o cuya memoria del stack supere `STACK_MEMORY_LIMIT_GB`, y SHALL dejar constancia de que ese brazo no puede ser el valor por defecto. Una medición ausente MUST informarse como no medida, nunca como dentro de presupuesto (`null` ≠ `0.0`).

#### Scenario: El brazo que excede el tope de latencia queda no viable [US-278 AC-5] [ADR-39]
- **GIVEN** un brazo cuyo p95 de consulta completa supera `p95_evidence_analyses_s`
- **WHEN** termina la suite
- **THEN** el informe marca ese brazo como «no viable» con el motivo `latencia` y el valor medido
- **AND** `RERANKER_CHUNK_WINDOWS` sigue valiendo `primera` por defecto

#### Scenario: El brazo que excede la memoria del stack queda no viable [US-278 AC-5] [ADR-39]
- **GIVEN** un brazo cuya memoria del stack medida supera `STACK_MEMORY_LIMIT_GB`
- **WHEN** termina la suite
- **THEN** el informe marca ese brazo como «no viable» con el motivo `memoria` y el valor medido

#### Scenario: Una medición ausente no cuenta como viable [US-278 AC-5] (asumido)
- **GIVEN** un brazo sin medición de p95 o de memoria
- **WHEN** termina la suite
- **THEN** el informe lo marca como «no medido» y no como viable
