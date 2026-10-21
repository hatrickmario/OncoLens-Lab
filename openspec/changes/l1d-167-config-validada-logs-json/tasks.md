# Tasks — l1d-167-config-validada-logs-json

## 1. contratos

- [x] 1.1 (contract-first, skill `sync-contracts`; commit `contract(L1D-167)`) Añadir `configKeys` y `serviceVersion` opcionales a `HealthStatus` en `apps/clinical-api/openapi.yaml` y `apps/rag-orchestrator/openapi.yaml` (diff de design `## Contratos`); ampliar el único `contracts/examples/health-ok.json` (válido contra `HealthStatus` de ambos specs; sin `rag-health-ok.json`); `info.version` `clinical-api` 1.6.0 y `rag-orchestrator` 1.4.0; `contracts:check`, `contracts:breaking` (sin `ERR`) y `contracts:generate`.

## 2. clinical-platform

- [x] 2.1 (TDD estricto) Tests de aceptación en rojo: "no escucha y registra configuracion_invalida con la variable y la regla, sin el valor, cuando SESSION_IDLE_MINUTES=abc [US-037 AC-2]" y "no escucha y registra REAL_DATA_GATE_NOT_PASSED cuando REAL_ANONYMIZED_ENABLED o REAL_IDENTIFIED_ENABLED es true [US-037 AC-3]" · arranque (Vitest sobre `arrancar()` con entorno inyectado). Esqueletos de `cargarConfiguracion` y `exigirGateDeDatosReales`. Commit `test(L1D-167)`.
- [x] 2.2 (TDD estricto) Implementar `src/config/index.ts` (schema Zod por sección, D1) y `exigirGateDeDatosReales()` (RN-13); `startup.ts` lo usa antes de escuchar. Verificación: 2.1 en verde. Commit `feat(L1D-167)`.
- [x] 2.3 (TDD estricto) Tests de aceptación en rojo: "todas las líneas de la request llevan el traceId generado y ninguna contiene t-123 cuando llega X-Trace-Id: t-123 [US-037 AC-4]", "genera y propaga el traceId sin cabecera [US-037 AC-4]", "los logs no contienen 1234567, Lucía, Rondón ni el cuerpo cuando un análisis con identidad en la pregunta responde 422 [US-037 AC-5]", "el health responde configKeys y serviceVersion sin valores [US-037 AC-1]" · integración (Supertest + MSW hacia `rag-orchestrator` desde `contracts/examples/`, logger capturado, respuesta validada contra el spec). Commit `test(L1D-167)`.
- [x] 2.4 (TDD estricto) Implementar `descartarCamposSensibles()` en `infrastructure/logger.ts` (lista cerrada `CAMPOS_SENSIBLES_BASE` + `LOG_REDACT_EXTRA_FIELDS` solo aditiva, D5; test "redacta email y el campo extra y mantiene la base cuando LOG_REDACT_EXTRA_FIELDS añade uno [US-037 AC-5]") y el evento `configuracion_invalida` con `motivo` y `valorInvalido` solo para enums no sensibles (D2) y el `traceId` en cada línea; `routes/health.ts` con `configKeys` y `serviceVersion`. Verificación: 2.3 en verde. Commit `feat(L1D-167)`.
- [x] 2.5 (test después: configuración; parcial: las claves nuevas de `infra/docker/.env.example`, incluida `LOG_REDACT_EXTRA_FIELDS`, ya están en `main` por #125 y esta tarea no las toca) Migrar las lecturas sueltas de `src/config.ts` y de los módulos a secciones de `cargarConfiguracion` (mismos nombres y valores por defecto), test estático de "sin `process.env` fuera del módulo" [US-037 AC-1], y claves nuevas en `infra/docker/.env.example` con un comentario que cita su RN o TBD (convención de DoD, readme §6.0).
- [x] 2.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-167)`.
- [x] 2.7 (Gate 2) Correcciones: `X-Trace-Id` declarado en el spec de rag (commit `contract(L1D-167)` adicional), `scripts/smoke/compose-smoke.sh` deja de comparar el cuerpo exacto de `/health` (200 y status ok), `serviceVersion` desde `info.version`, etapa de servicios dentro de `arrancar`, logger y `configKeys` sin datos ajenos (ver design `## Correcciones del Gate 2`).

## 3. ai-services

- [x] 3.1 (TDD estricto) Tests de aceptación en rojo (Pytest): "test_arranque_umbral_fuera_de_rango_no_queda_listo" `@pytest.mark.ac("US-037", 2)` (log con `RELEVANCE_THRESHOLD` y la regla, sin `1.7`), "test_logs_request_con_trace_id_todas_las_lineas_json_con_ese_trace_id" `@pytest.mark.ac("US-037", 4)` (`TestClient`, adapters falsos), "test_health_lista_config_keys_sin_valores" `@pytest.mark.ac("US-037", 1)`. Commit `test(L1D-167)`.
- [x] 3.2 (TDD estricto) Implementar `configurar_logging_json()` (D7, contextvar del `traceId` en `app/api/trace.py`), fallo de arranque con nombre de variable en `bootstrap.py` y `configKeys`/`serviceVersion` en `app/api/health.py`; `Settings` instanciada una vez e inyectada. Verificación: 3.1 en verde. Commit `feat(L1D-167)`.
- [x] 3.3 (test después) "test_settings_sin_llm_cloud_enabled_valor_efectivo_false" `@pytest.mark.ac("US-037", 6)` y test estático de "sin `os.environ` fuera de `app/config/`" [US-037 AC-1].
- [x] 3.4 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-167)`.

## 4. cierre

- [ ] 4.1 `openspec validate l1d-167-config-validada-logs-json --strict`; suites de `clinical-api` y `rag-orchestrator` en verde; `contracts:verify-provider` (o `assertMatchesSpec()` si US-214 no está en `main`) sobre `/health`; `npm audit` / `pip-audit` si entra una dependencia de logging. `run-ai-eval` no aplica.
