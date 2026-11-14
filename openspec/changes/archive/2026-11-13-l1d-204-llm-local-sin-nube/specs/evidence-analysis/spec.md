## ADDED Requirements

### Requirement: Proveedor del LLM elegido por la clasificación de datos, sin respaldo en la nube con datos reales
`rag-orchestrator` MUST elegir el adapter del LLM por petición con la regla pura `proveedores_permitidos(data_classification, llm_cloud_enabled)` de `app/domain/reglas_proveedor.py`: con `real_anonimizado` o `real_identificado` solo `local`; con `sintetico`, `local` y la nube solo si `LLM_CLOUD_ENABLED=true`. Sin proveedor permitido disponible MUST responder `503 LOCAL_LLM_UNAVAILABLE` sin invocar al de nube (RN-12).

#### Scenario: Con datos reales y la nube habilitada responde el local [US-050 AC-1] [SEG-05] [RN-12] [OL-02]
- **GIVEN** un `RagQueryInternalRequest` con `dataClassification = real_identificado` y contenido sintético, el LLM local falso disponible, `LLM_CLOUD_ENABLED=true` y un adapter de nube falso que cuenta invocaciones
- **WHEN** se procesa `Q-HER2` con un JWT de servicio válido
- **THEN** el adapter local registra una invocación y el de nube cero
- **AND** `meta.llmProvider` es `local` y la respuesta valida contra el spec de `rag-orchestrator`

#### Scenario: Con datos reales y el LLM local caído responde 503 sin tocar la nube [US-050 AC-2] [RN-12] [readme §4.2]
- **GIVEN** el mismo request, `LLM_CLOUD_ENABLED=true`, el LLM local falso lanzando el error de LLM no disponible y el adapter de nube falso que cuenta invocaciones
- **WHEN** se procesa
- **THEN** la respuesta es `503` con `error = LOCAL_LLM_UNAVAILABLE`, válida contra el spec
- **AND** el adapter de nube registra cero invocaciones

#### Scenario: Con la nube deshabilitada ni siquiera los sintéticos van a la nube [US-050 AC-3] [RN-12] [readme §1.4]
- **GIVEN** `dataClassification = sintetico`, `LLM_CLOUD_ENABLED=false`, el LLM local falso caído y el adapter de nube falso que cuenta invocaciones
- **WHEN** se procesa
- **THEN** la respuesta es `503` con `error = LOCAL_LLM_UNAVAILABLE`
- **AND** el adapter de nube registra cero invocaciones

#### Scenario: Con sintéticos y la nube habilitada el respaldo es posible y se declara (asumido: complemento de AC-3 que fija la regla)
- **GIVEN** `dataClassification = sintetico`, `LLM_CLOUD_ENABLED=true`, el LLM local falso caído y el adapter de nube falso disponible
- **WHEN** se procesa
- **THEN** el adapter de nube registra una invocación y `meta.llmProvider` es `nube`

#### Scenario: La regla pura cubre la matriz completa [US-050 AC-1] [US-050 AC-3] [RN-12]
- **GIVEN** las tres clasificaciones de `DataClassification` y los dos valores de `llm_cloud_enabled`
- **WHEN** se evalúa `proveedores_permitidos()`
- **THEN** solo `(sintetico, true)` incluye `nube`, siempre después de `local`, y una clasificación desconocida devuelve solo `local` (falla cerrada)

#### Scenario: El selector no cambia los modelos de recuperación ni de verificación [US-050 AC-1] [RN-12] (asumido: Contexto técnico, embeddings, reranker y NLI locales en CPU)
- **GIVEN** `dataClassification = real_identificado` y `LLM_CLOUD_ENABLED=true`
- **WHEN** se procesa `Q-HER2`
- **THEN** `meta.embeddingModel`, `meta.rerankerModel` y `meta.nliModel` son los de `MODEL_PROVIDER=local` (o `fake` en el test) y ningún módulo de `app/infrastructure/` importa un cliente de nube
