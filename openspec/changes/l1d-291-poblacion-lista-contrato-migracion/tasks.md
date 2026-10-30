# Tasks — l1d-291-poblacion-lista-contrato-migracion

> Empieza con `## contratos` (contract-first); las demás secciones siguen sin esperar la una a la otra, pero
> `ai-services` y `clinical-platform` requieren los tipos generados.
> P1 y P2 de `design.md` con propuesta adoptada (D4, D6). Primer eslabón de las dos cadenas de contratos del S4
> (rag 291 → 109 → 295 → 144 → 300; clinical-api 291 → 95 → 295 → 144 → 300): rebasa sobre `main`; renumerar solo si
> otro change ajeno a la cadena sube `info.version` o añade una migración de `corpus` antes. TDD: test después para la migración; TDD estricto para el lector (AC-4, AC-5).
> Logs: `chunkId` permitido; nunca valor, texto del fragmento, prompt ni salida del LLM (regla común l1d-291…294).

## contratos

- [x] 0.1 `sync-contracts`: editar primero `contracts/schemas/evidence.yaml` con el diff de `design.md` ## Contratos
      (`studyPopulationValues` y `StudyPopulationValue`, `partialReason` opcionales; `unknownReason` con
      `varios_valores_en_la_fuente` (reservado), `valores_en_conflicto`, `respaldo_fallido` y
      `sin_regla_de_comparacion`; `studyPopulationValue` `deprecated: true`); versiones: `apps/rag-orchestrator/openapi.yaml`
      1.5.0 → 1.6.0, `apps/clinical-api/openapi.yaml` 1.10.0 → 1.11.0, `contracts/schemas/evidence.yaml` 1.0.0 → 1.1.0;
      generar cliente TS, Zod y Pydantic; `oasdiff` sin ERR · `contracts:check`
      > Evidencia: `contracts:check` y `generate:check` en verde; `contracts:breaking` sin cambios incompatibles (los 8 ERR
      > `response-property-enum-value-added` de `unknownReason` son las excepciones ADR-26 E-6…E-13, decididas por el usuario el
      > 2026-10-30); `excepcionesDeContrato.test.mjs` y `contractsBreaking.test.mjs` en verde (24 tests).
- [x] 0.2 Ejemplo `contracts/examples/con-evidencia-s4-poblacion-lista.json` (`clinical-api`, `EvidenceAnalysis`;
      sintético, vocabulario no prescriptivo; `studyPopulationValue` según D10: primer valor de elegibilidad o `null`)
      y registro en `index.json`; `con-evidencia-s3-aplicabilidad.json` no lo cambia este change (su `estadio` pasa a
      `sin_regla_de_comparacion` en `l1d-293`, primer productor del motivo) · test después (fixture)
- [x] 0.3 Ejemplo `contracts/examples/rag-query-poblacion-lista.json` (`rag-orchestrator`,
      `#/components/schemas/RagQueryInternalResponse`) con su petición `rag-query-request-poblacion-lista.json`
      (`RagQueryInternalRequest`, pregunta distinta de las existentes), ambos registrados en `index.json` (el primero
      con `request`); alimenta el MSW de `clinical-api` (AC-2); `rag-query-aplicabilidad-a-m1.json` no lo cambia este change
      (lo actualiza `l1d-293`, ver 0.2) · test después (fixture)
- [x] 0.4 Añadir `studyPopulationValues[].value` a `camposGenerados` de `packages/clinical-language/origen-de-campos.json`
      para que el filtro RN-23 lo recorra; `contracts:check` lo visita en el ejemplo de 0.2 · test después (fixture)

## ai-services

- [x] 1.1 Fixtures FX-08b-c en `apps/rag-orchestrator/tests/`: `doc-a1` en forma antigua y `doc-b1` en forma nueva
      sembrados en el `corpus` de test · test después (fixture)
- [x] 1.2 Migración Alembic `0005` (D4): forma nueva por criterio, filas existentes intactas, `downgrade -1`;
      aplicada con `rag_corpus_migrator`; `tables.py` y `data-model.md` §4.6 actualizados; `alembic heads` única ·
      test después (integración con PostgreSQL `corpus` real: AC-3, AC-6) · commit `feat(L1D-291)`
- [x] 1.3 Test de aceptación en rojo: `test_lector_catalogo_formas_antigua_y_nueva_entrega_lista_de_valores` con
      `@pytest.mark.ac("US-241", 4)`; incluye A-M1 × `doc-a1` = `{2,0,0,3}` · TDD estricto · esqueleto con
      `raise NotImplementedError` · commit `test(L1D-291)`
- [x] 1.4 Lector doble del repositorio y tipos de dominio (`aplicabilidad_tipos.py`); `POPULATION_MAX_VALUES_PER_CRITERION`
      en configuración (valor inicial 3, por fragmento y criterio; ningún literal en el lector); marca por criterio
      `{"status": "pendiente", "values": []}` aceptada como criterio pendiente (D5); unitarios uno a uno; AC-4 en verde ·
      TDD estricto · commit `feat(L1D-291)`
- [x] 1.5 Test de aceptación en rojo `test_forma_invalida_degrada_criterio_a_desconocido_y_registra_log`
      (`ac("US-241", 5)`): con `POPULATION_MAX_VALUES_PER_CRITERION = 3`, 4 valores del mismo fragmento y `scope` fuera
      del enum; `200`, log `poblacion_forma_invalida` con criterio, `chunkId` y `traceId`, sin valor, texto del fragmento,
      prompt ni salida del LLM (caplog); y la marca `pendiente` no genera ese log · TDD estricto · commit `test(L1D-291)`
- [x] 1.6 Degradación de forma inválida en el lector y el log; AC-5 en verde · TDD estricto · commit `feat(L1D-291)`
- [x] 1.7 Verificación de frontera: tests de *permission denied* de `rag_corpus` en verde tras `0005` (AC-6) · test
      después (integración)
- [ ] 1.8 `run-ai-eval`: sin cambio de métricas (solo forma y lector)
      > TRASLADADA a Gate 2 (`ai-eval-runner`): `tests/evaluation` y `verify-provider` (2840 tests) en verde; A-M1 × `doc-a1` = `{2,0,0,3}`.

- [x] 1.9 `POPULATION_MAX_VALUES_PER_CRITERION=3` en el servicio `rag-orchestrator` de `infra/docker/docker-compose.yml`
      (Compose lista las variables una a una, con el mismo patrón `${VAR:-default}` que `RELEVANCE_THRESHOLD`) · test después:
      `vitest run infra/docker` en verde. La entrada de `apps/rag-orchestrator/.env.example` va en el PR #246
      (`chore/env-retrieval-poblacion`, contra `main`): este change depende de su merge para esa línea.

## clinical-platform

- [x] 2.1 Test de aceptación (rojo comprobado por mutación, ver nota): "valida y conserva `studyPopulationValues` y `partialReason` cuando
      rag-orchestrator responde con el ejemplo nuevo (`rag-query-poblacion-lista.json`) o con el antiguo
      (`rag-query-aplicabilidad-a-m1.json`) [US-241 AC-2]" · integración (Supertest +
      MSW desde `contracts/examples/`, PostgreSQL real) · TDD estricto · commit `test(L1D-291)`
- [x] 2.2 Validación con el cliente generado de `packages/api-contracts` y persistencia del `AIAnalysisRecord` tal
      cual llegó (módulo `evidence-analysis`); AC-2 en verde · TDD estricto · commit `feat(L1D-291)`
- [x] 2.3 Regresión [RN-06] → US-053: análisis persistido antes de responder, sin cambios (no es tarea nueva)
      > Evidencia: `tests/integration/evidence-analysis` 24 archivos / 111 tests en verde con PostgreSQL real.
      > Nota 2.1/2.2: el AC-2 nace en verde porque el comportamiento ya lo aportó el commit `feat(L1D-291) clinical-api 1.11.0`
      > (Zod/cliente generados, módulo sin lista blanca: persiste el JSON validado tal cual). No hay código de `src/` que
      > añadir. Sensibilidad del test comprobada por mutación: sin `studyPopulationValues` en el Zod generado de
      > rag-orchestrator falla en la aserción (`expected 502 to be 200`). `contracts:verify-provider` clinical-api: 329
      > respuestas verificadas; `tsc --noEmit` limpio.

> Nota para la PR: el AC-2 de `clinical-api` (2.1) es caracterización de un contrato generado: su rojo se comprobó contra el Zod de
> `main` y no hay código de `src/` que escribir.
> Vuelta 1 del Gate 2 (design-principles-reviewer): P1-1 cobertura apoyada en el lector doble, P1-2 paridad de `ALCANCES` con el
> contrato generado, P2-3 tope obligatorio en la composición y en la corrida de evaluación, P3-1 import sin usar, P3-6 cuatro aserciones.

## frontend

Sin tareas: la UI es de US-126.
