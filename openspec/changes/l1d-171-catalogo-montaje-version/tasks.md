# Tasks — l1d-171-catalogo-montaje-version

## 1. contratos

- [x] 1.1 (contract-first, skill `sync-contracts`; commit `contract(L1D-171)`) Aplicar el diff de design `## Contratos`: `409` + `ErrorCatalogVersionMismatch` en `createEvidenceAnalysis` de `apps/clinical-api/openapi.yaml`; `catalogVersion` opcional en `HealthStatus` de ambos specs; ejemplo `error-catalog-version-mismatch.json` en `contracts/examples/index.json` y `catalogVersion` en el único `health-ok.json` de L1D-167 (válido contra ambos specs); `info.version` `clinical-api` 1.7.0 y `rag-orchestrator` 1.5.0; `contracts:check`, `contracts:breaking` (sin `ERR`) y `contracts:generate`.

## 2. ai-services

- [x] 2.1 (TDD estricto) Tests de aceptación en rojo (Pytest + `TestClient`, adapters falsos que cuentan invocaciones): "test_rag_query_catalogo_distinto_responde_409_sin_invocar" `@pytest.mark.ac("US-041", 2)` (respuesta validada contra el spec) y "test_arranque_sin_catalogo_no_queda_listo_y_log_sin_ruta" `@pytest.mark.ac("US-041", 5)`. Esqueletos de `exigir_misma_version_de_catalogo()` y del adapter del manifiesto. Commit `test(L1D-171)`.
- [x] 2.2 (TDD estricto) Implementar el puerto `CatalogoClinico`, el adapter `infrastructure/catalogo_clinico/manifiesto.py`, `exigir_misma_version_de_catalogo()` (dominio, primer paso de `RAGOrchestratorService`), el mapeo a `409` en `api/errors.py` y `catalogVersion` en `/health`. Verificación: 2.1 en verde. Commit `feat(L1D-171)`.
- [x] 2.3 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-171)`.

## 3. clinical-platform

- [x] 3.1 (TDD estricto) Tests de aceptación en rojo: "responde 200 y persiste catalog_version 1.0.0 cuando ambos backends montan 1.0.0 [US-041 AC-1]", "responde 409 CATALOG_VERSION_MISMATCH sin persistir registro cuando rag-orchestrator responde 409 de catálogo [US-041 AC-2]" (MSW desde `rag-catalog-version-mismatch.json`), "sigue respondiendo 502 cuando el 409 trae otro código" y "el health informa catalogVersion 1.0.1 cuando CLINICAL_CATALOG_PATH apunta a un catálogo 1.0.1 [US-041 AC-4]" · integración (Supertest + PostgreSQL de test; respuestas validadas contra el spec). Commit `test(L1D-171)`.
- [x] 3.2 (TDD estricto) Implementar la fila de `CATALOG_VERSION_MISMATCH` en `mapearFalloRag()` y `catalogVersion` en `routes/health.ts`; expectativa `CLINICAL_CATALOG_VERSION` (D1) en el módulo de configuración de L1D-167. Verificación: 3.1 en verde. Commit `feat(L1D-171)`.
- [x] 3.3 (test después: arranque e infraestructura) "no queda listo y registra configuracion_invalida con motivo catalogo_no_disponible, sin ruta, cuando el catálogo no existe [US-041 AC-5]" (Vitest de arranque) y humo en contenedor "la escritura en CLINICAL_CATALOG_PATH falla por solo lectura [US-041 AC-3]" (`docker compose exec`, *timeout* explícito).
- [x] 3.4 (test después: datos) Estructura v1 de `packages/clinical-catalogs` (D5) con esquemas en `schemas/` y test que valida cada archivo [US-041 AC-1]; claves de catálogo en `.env.example` si faltan.
- [x] 3.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-171)`.

## 4. evaluación

- [x] 4.1 (evaluate) El change toca el catálogo (estructura, sin cambiar códigos ni reglas): correr `run-ai-eval` y confirmar que las métricas OL-06 no cambian respecto del baseline (o anotar en el PR que la suite `evaluate` aún no está en `main`, L1D-235). _(verificado 2026-10-22: CI de main verde en 11dc5cc8 y openspec validate --strict ok)_

## 5. cierre

- [x] 5.1 `openspec validate l1d-171-catalogo-montaje-version --strict`; suites de ambos backends en verde; `contracts:verify-provider` (o `assertMatchesSpec()`) sobre `/health` y el `409`. _(verificado 2026-10-22: CI de main verde en 11dc5cc8 y openspec validate --strict ok)_
