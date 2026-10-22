## MODIFIED Requirements

### Requirement: Health check de clinical-api independiente de la IA
`clinical-api` MUST exponer `GET /health`, solo en la red interna y sin sesión, que responde `200` con `HealthStatus` cuando el proceso está listo: `status = "ok"`, `configKeys`, `serviceVersion` (US-037) y `catalogVersion` (versión del `manifest.json` montado, US-041), sin otras propiedades y sin valores de configuración. MUST NOT consultar a `rag-orchestrator` ni al LLM, para que la caída de la IA no deje sin servicio a la ficha (readme §2.7). La respuesta SHALL validarse contra el spec de `clinical-api` en el test de integración.

#### Scenario: clinical-api responde 200 en su health [US-034 AC-1]
- **GIVEN** `clinical-api` arrancado con el catálogo `1.0.0` montado
- **WHEN** el test de integración (Supertest) hace `GET /health`
- **THEN** la respuesta es `200` con `status = "ok"`, `configKeys` y `serviceVersion` no vacíos y `catalogVersion = "1.0.0"`, válida contra `HealthStatus` (cerrado) del spec de `clinical-api`

#### Scenario: clinical-api sigue en 200 con el LLM caído [US-034 AC-4]
- **GIVEN** el stack levantado con `LLM_PROVIDER=local` y el LLM nativo detenido (`LLM_BASE_URL` a un puerto sin escucha)
- **WHEN** el smoke test consulta `GET /health` de `clinical-api`
- **THEN** responde `200`, aunque `rag-orchestrator` responda `503`
