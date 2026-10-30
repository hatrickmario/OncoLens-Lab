## ADDED Requirements

### Requirement: Población del estudio como lista por fragmento, aditiva y opcional
`ApplicabilityCriterion` MUST declarar opcionales `studyPopulationValues` (`{value ≤ 200, chunkId, scope}`, sin `maxItems`) y `partialReason`; `unknownReason` MUST sumar `varios_valores_en_la_fuente` (reservado), `valores_en_conflicto`, `respaldo_fallido` y `sin_regla_de_comparacion`; `studyPopulationValue` SHALL ser `deprecated: true` y, con lista, llevar el primer valor de elegibilidad citado o `null`. El cambio SHALL ser aditivo (ADR-26) con versión minor (design D8–D10).

#### Scenario: El schema declara los campos nuevos y oasdiff no informa incompatibilidades [US-241 AC-1] [ADR-26] [ADR-47]
- **GIVEN** `contracts/schemas/evidence.yaml` editado primero y propagado con `sync-contracts`
- **WHEN** se ejecutan `contracts:check` y `oasdiff` contra `main`
- **THEN** `ApplicabilityCriterion` declara `studyPopulationValues` y `partialReason` opcionales con los límites y enums indicados, `unknownReason` incluye los cuatro valores nuevos y `studyPopulationValue` lleva `deprecated: true`
- **AND** `oasdiff` no informa ningún cambio incompatible y las versiones pasan a `rag-orchestrator` 1.6.0, `clinical-api` 1.11.0 y `evidence.yaml` 1.1.0

#### Scenario: Ambas formas validan y se conservan en clinical-api [US-241 AC-2] [RN-06] [ADR-26]
- **GIVEN** `contracts/examples/rag-query-poblacion-lista.json` (con los campos nuevos) y `rag-query-aplicabilidad-a-m1.json` (sin ellos), servidos por el mock de `rag-orchestrator` construido desde `contracts/examples/` (MSW)
- **WHEN** `clinical-api` recibe cada respuesta
- **THEN** ambas validan con el cliente generado de `packages/api-contracts`
- **AND** la respuesta y el `AIAnalysisRecord` conservan `studyPopulationValues`, `partialReason` y `studyPopulationValue` exactamente como llegaron, con la forma de `con-evidencia-s4-poblacion-lista.json`

### Requirement: Los valores de población entran en el filtro de términos prescriptivos
`packages/clinical-language/origen-de-campos.json` MUST listar `studyPopulationValues[].value` en `camposGenerados`, junto a `studyPopulationValue`, para que el recorrido de RN-23 lo incluya.

#### Scenario: El recorrido RN-23 visita studyPopulationValues[].value [US-241 AC-1] [RN-23]
- **GIVEN** `origen-de-campos.json` actualizado y `con-evidencia-s4-poblacion-lista.json`
- **WHEN** se ejecuta `contracts:check` (validador de origen de campos de US-068)
- **THEN** `studyPopulationValues[].value` figura en `camposGenerados` y el recorrido lo visita en el ejemplo

Regresión [RN-06] activa desde S3 (US-053): el análisis se persiste antes de responder.
