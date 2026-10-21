## MODIFIED Requirements

### Requirement: Health check declarado en ambos specs
Ambos specs MUST declarar `GET /health` con `security: []`, tag `operacion` y `200 HealthStatus` (cerrado, definido en cada spec, `status` `const ok` obligatorio y, desde US-037, `configKeys` —array de nombres con patrón `^[A-Z][A-Z0-9_]*$`— y `serviceVersion` opcionales en el schema); el de `rag-orchestrator` SHALL declarar además `503 LlmLocalNoDisponible`. Es aditivo (ADR-26): `info.version` `clinical-api` 1.6.0 y `rag-orchestrator` 1.4.0. Un **único** ejemplo `health-ok.json` MUST validar contra `HealthStatus` de **ambos** specs (registrado dos veces en `index.json`), junto a `rag-health-llm-no-disponible.json`.

#### Scenario: Ambos specs declaran el health con sus ejemplos [US-034 AC-1] [US-034 AC-4]
- **WHEN** `npm run contracts:check` revisa los dos specs y los ejemplos
- **THEN** `GET /health` existe en ambos con `HealthStatus` cerrado que admite `configKeys` y `serviceVersion`, el de `rag-orchestrator` declara el `503` `LOCAL_LLM_UNAVAILABLE`, el único `health-ok.json` (con `status`, `configKeys` y `serviceVersion`) valida contra el `HealthStatus` de los dos specs, `rag-health-llm-no-disponible.json` valida contra su `target` y el comando termina con código 0

#### Scenario: El cambio no es incompatible [US-034 AC-1]
- **WHEN** se comparan los specs del change con los de `main` (`npm run contracts:breaking`)
- **THEN** no se reporta ningún cambio incompatible y los specs declaran `info.version` `1.6.0` (`clinical-api`) y `1.4.0` (`rag-orchestrator`)
