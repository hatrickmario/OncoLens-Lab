## ADDED Requirements

### Requirement: Campos aditivos de opciones no mostradas
`RagQueryInternalResponse` (rag-orchestrator 1.9.0) MUST declarar `optionsNotShown` (integer >= 0) como requerido y siempre emitido (`0` sin recorte); `AnalysisBasis` (clinical-api 1.14.0) MUST declarar `optionsNotShown` (integer >= 0) y `maxOptions` (integer 1–3), opcionales solo por los análisis históricos. El cambio SHALL ser aditivo (ADR-26), con sus ejemplos en `index.json` (design, Contratos).

#### Scenario: Los campos nuevos son aditivos y los mocks salen de los ejemplos [US-134 AC-3] [ADR-26] [RN-06]
- **GIVEN** `apps/rag-orchestrator/openapi.yaml` 1.9.0 y `apps/clinical-api/openapi.yaml` 1.14.0 con los campos nuevos, y los ejemplos `rag-query-tres-opciones.json` (con `rag-query-request-tres-opciones.json`) y `con-evidencia-s4-tres-opciones.json`
- **WHEN** se ejecutan `sync-contracts`, `contracts:check` y `oasdiff` contra `main`
- **THEN** no hay cambio incompatible en ninguno de los dos specs
- **AND** `rag-query-tres-opciones.json` valida contra `RagQueryInternalResponse` y `con-evidencia-s4-tres-opciones.json` valida contra `EvidenceAnalysis`
- **AND** `rag-query-tres-opciones-no-comparable.json` y `con-evidencia-s4-tres-opciones-no-comparable.json` (`LLM-TRES`) traen O-A no comparable en tercer lugar y `optionsNotShown = 0`
- **AND** todo ejemplo con target `RagQueryInternalResponse` en `index.json`, incluidos los de `l1d-291`, `l1d-295` y `l1d-297`, trae `optionsNotShown = 0` (salvo `rag-query-tres-opciones.json`) y sigue validando
- **AND** los mocks MSW/`respx` se construyen desde esos ejemplos y `clinical-api` valida la respuesta interna con su cliente generado

### Requirement: Cada openapi.yaml proveedor se edita a mano y lo demás se genera
Los dos `openapi.yaml` MUST editarse a mano como fuente (no se generan) y los tipos TS, Zod y Pydantic SHALL generarse después desde ellos; `contracts/schemas/evidence.yaml` (solo schemas compartidos) MUST NOT cambiar en este change.

#### Scenario: Los artefactos generados salen del openapi.yaml proveedor [ADR-26]
- **GIVEN** el diff del change
- **WHEN** se compara con la salida de la generación desde los dos `openapi.yaml`
- **THEN** los tipos de `packages/api-contracts`, los schemas Zod y los modelos Pydantic coinciden con lo generado
- **AND** `contracts/schemas/evidence.yaml` no aparece en el diff
