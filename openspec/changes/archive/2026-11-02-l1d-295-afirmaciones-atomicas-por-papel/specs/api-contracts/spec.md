## ADDED Requirements

### Requirement: Motivo lenguaje_no_permitido en DiscardedOption
El enum `DiscardedOption.discardReason` de `contracts/schemas/evidence.yaml` MUST incluir `lenguaje_no_permitido` al final de los motivos vigentes, como cambio aditivo sin ruptura (ADR-26; schema 1.2.0, `rag-orchestrator` 1.8.0, `clinical-api` 1.13.0), con sus ejemplos registrados en `contracts/examples/index.json`; `clinical-api` SHALL validarlo con su cliente generado y persistirlo sin pérdida (RN-06).

#### Scenario: El motivo nuevo es aditivo y viaja sin pérdida hasta la persistencia [US-245 AC-7] [ADR-26] [RN-06]
- **GIVEN** `contracts/schemas/evidence.yaml` con `lenguaje_no_permitido` añadido al enum de `DiscardedOption.discardReason` y los ejemplos `con-evidencia-solo-descartadas-lenguaje.json` y `con-evidencia-solo-descartadas-sin-soporte-y-lenguaje.json` (`EvidenceAnalysis`, `clinical-api`) y `rag-query-solo-descartadas-lenguaje.json` (`RagQueryInternalResponse`, `rag-orchestrator`, con su request `rag-query-request-solo-descartadas-lenguaje.json` y una pregunta distinta de las de los ejemplos existentes), registrados en `index.json`
- **WHEN** se ejecutan `sync-contracts`, `contracts:check` y `oasdiff` contra `main`
- **THEN** no hay cambio incompatible
- **AND** cada ejemplo valida contra su `target` de `index.json` y los mocks MSW/`respx` se construyen desde ellos
- **AND** `clinical-api`, con el MSW de `rag-orchestrator` construido desde `rag-query-solo-descartadas-lenguaje.json`, valida la respuesta con su cliente generado y persiste en el `AIAnalysisRecord` el `discardReason = lenguaje_no_permitido` sin pérdida

### Requirement: Error LLM_OUTPUT_INVALID en el 503 de ambos backends
El schema `ErrorSalidaLlmInvalida` (`error = LLM_OUTPUT_INVALID`, `message`, `traceId`, sin detalles internos) MUST añadirse como alternativa aditiva del `oneOf` del `503` de `POST /rag/query` (1.8.0) y de `POST /platform/evidence-analyses` (1.13.0), con ejemplos en `index.json` (ADR-26). `clinical-api` SHALL propagarlo sin convertirlo en `LOCAL_LLM_UNAVAILABLE` (Q1, 2026-10-30).

#### Scenario: El error de salida inválida es aditivo y clinical-api lo propaga sin cambiarlo [US-245 AC-1] [ADR-26] [RN-06] (decisión Q1, 2026-10-30)
- **GIVEN** `ErrorSalidaLlmInvalida` en el `oneOf` del `503` de ambos `openapi.yaml` y los ejemplos `rag-salida-llm-invalida.json` y `error-salida-llm-invalida.json` registrados en `index.json`
- **WHEN** `clinical-api`, con el MSW de `rag-orchestrator` construido desde `rag-salida-llm-invalida.json`, recibe `POST /platform/evidence-analyses`
- **THEN** responde `503` con `error = "LLM_OUTPUT_INVALID"`, validado contra su `openapi.yaml`, y nunca `LOCAL_LLM_UNAVAILABLE`
- **AND** no persiste un `AIAnalysisRecord` con contenido generado (RN-06 sin cambios)
- **AND** `oasdiff` contra `main` no reporta cambio incompatible
