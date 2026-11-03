## ADDED Requirements

### Requirement: Campo aditivo del tope de seguimiento en la Base
`AnalysisBasis` de `apps/clinical-api/openapi.yaml` MUST declarar `maxFollowUps` (integer >= 1), opcional solo por los análisis históricos. El cambio SHALL ser aditivo (ADR-26): `oasdiff` contra `main` sin incompatibles, ejemplos `EvidenceAnalysis` actualizados en `index.json` y tipos generados con `contracts:generate`, nunca a mano `[S5 resp. 10]`.

#### Scenario: El campo nuevo es aditivo y los ejemplos validan [US-219 AC-1] [ADR-26] [S5 resp. 10]
- **GIVEN** `apps/clinical-api/openapi.yaml` con `AnalysisBasis.maxFollowUps` y `con-evidencia-s4-tres-opciones.json` con `"maxFollowUps": 10`
- **WHEN** se ejecutan `contracts:check` y `contracts:breaking` contra `main`
- **THEN** no hay cambio incompatible ni hallazgo de `oasdiff` por el campo
- **AND** `con-evidencia-s4-tres-opciones.json` y los ejemplos `EvidenceAnalysis` sin el campo siguen validando contra `EvidenceAnalysis`
- **AND** el tipo generado `AnalysisBasis` de `packages/api-contracts` expone `maxFollowUps?: number`

### Requirement: El 503 del seguimiento admite los mismos fallos cerrados que el del análisis
El `503` de `POST /rag/follow-up` MUST ser un `oneOf` de `ErrorLlmLocalNoDisponible`, `ErrorRecuperacionNoDisponible`, `ErrorNliNoDisponible` y `ErrorSalidaLlmInvalida`, y el de `POST /platform/evidence-analyses/{analysisId}/follow-ups` MUST referenciar `GeneracionNoDisponible`. La decisión SHALL constar como E-18/E-19 en la tabla de ADR-26 `[S5 resp. 10]`.

#### Scenario: oasdiff no da incompatibles y el aviso se declara [ADR-26] [S5 resp. 10]
- **GIVEN** los dos `openapi.yaml` con el `503` del seguimiento ampliado y `scripts/ci/contracts-breaking-excepciones.json` sin entradas nuevas
- **WHEN** se ejecuta `contracts:breaking` contra `main`
- **THEN** termina con éxito con 0 ERR y un WARN `response-body-wrapped-in-one-of-original-preserved` por proveedor en las dos rutas del seguimiento
- **AND** `info.version` es `1.11.0` en `rag-orchestrator` y `1.16.0` en `clinical-api` (o la siguiente libre al rebasar, con `packages/api-contracts` regenerado)
- **AND** los ejemplos `rag-nli-no-disponible.json` y `error-desidentificacion-no-disponible.json` validan contra los `503` del seguimiento
