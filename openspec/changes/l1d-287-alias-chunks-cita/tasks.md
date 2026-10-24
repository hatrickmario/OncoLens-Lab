# Tasks — l1d-287-alias-chunks-cita

> ↪ Se apoya en `l1d-179-citas-chunk-recuperado` y `l1d-180-soporte-nli-descartadas` (archivados) y en
> el generador de US-225. Matriz TDD (CLAUDE.md): regla de dominio RN-04 y su paso por el endpoint →
> **TDD estricto, doble bucle** (commit `test(L1D-287)` con el AC-2 en rojo antes del `feat(L1D-287)`);
> prompt → **evaluate**; fixtures → **test después**. Mocks solo en los bordes (LLM vía `FakeLlmClient`,
> NLI, Milvus, *embeddings*, *reranker*). Schema `corpus` de test real en integración. Nunca `.skip`,
> `skipif` ni `xfail`.
> **Orden de merge `[S3 resp. 15]`:** este change va primero (`rag-query@0.3.0`); después
> `l1d-181-procedencia-contexto-ia` (*rebase*, `rag-query@0.4.0`) y `l1d-288-motivos-solo-descartadas`
> (*rebase*, mismo `_validar_citas_y_ensamblar`).

## 1. contratos

- [x] 1.1 (test después) Sin diff de contrato (design.md `## Contratos`): `contracts:check` y `contracts:breaking` (oasdiff contra `main`) con cero cambios en `apps/rag-orchestrator/openapi.yaml` y `contracts/schemas/evidence.yaml`. Si apareciera un cambio necesario, detenerse y aplicar `sync-contracts` antes de cualquier test.

## 2. ai-services

- [x] 2.1 (test después) FX-06a-b a nivel de cliente en `apps/rag-orchestrator/tests/support/llm_falso.py`: escenarios de `FakeLlmClient` que citan alias (`LLM-OK` → `C1`; `LLM-ALIAS-C2`; `LLM-ALIAS-INEXISTENTE` → `C9`; `LLM-ID-REAL` → `ch-m1-1`; `LLM-ALIAS-C1-C2`) y registro del prompt recibido; recuperación de test con cuatro chunks sobre el umbral (puntajes distintos y un empate) y variante con tres sobre el umbral y uno debajo (AC-6). Verificación: test de humo del fixture.
- [x] 2.2 (TDD estricto) Test de aceptación en rojo: "la cita a C2 apunta al chunkId real de C2 con su chunkTextSnapshot del corpus cuando el LLM cita el alias [US-236 AC-2]" · integración (`TestClient` + JWT de servicio de test + `@pytest.mark.ac("US-236", 2)`), validando la respuesta contra el spec del proveedor (helper de L1D-164). Esqueleto con `raise NotImplementedError` si el símbolo no existe. Commit `test(L1D-287)`.
- [x] 2.3 (TDD estricto) Test de aceptación en rojo: "asigna C1…C4 por relevancia descendente con desempate por chunkId y el prompt no contiene ningún chunkId real [US-236 AC-1]" · integración sobre el prompt registrado por `FakeLlmClient`. Commit `test(L1D-287)`.
- [x] 2.4 (TDD estricto) Tests de aceptación en rojo: "descarta con cita_invalida cuando el LLM cita C9 [US-236 AC-3]", "descarta con cita_invalida sin reparar cuando el LLM cita el chunkId real [US-236 AC-4]" y "descarta con cita_invalida cuando el alias corresponde a un chunk bajo el umbral [US-236 AC-6]" · integración. Commit `test(L1D-287)`.
- [x] 2.5 (TDD estricto) Test de aceptación en rojo: "asigna alias idénticos a la misma entrada y ni la respuesta ni los logs contienen alias como identificador [US-236 AC-5]" · integración con captura de logs (`tests/support/logs.py`). Commit `test(L1D-287)`.
- [x] 2.6 Extraer `asignar_alias()` y `traducir_citas()` (RN-04) en `app/domain/alias_de_chunks.py` con la constante `CITA_NO_TRADUCIBLE` (design D1, D2), con unitarios uno a la vez (lista vacía; un chunk → `C1`; orden por puntaje; empate por `chunkId`; alias conocido → id real; alias desconocido → marca; id real → marca; espacios alrededor se recortan; `[C2]`/`c2` → marca). Commit `feat(L1D-287)`.
- [x] 2.7 Prompt `rag-query@0.3.0` en `app/prompts/rag_query.py` (design D5): fragmentos con `[fragmento C<n>]`, instrucción de citar por alias en `citedFragments`, sin ids reales y sin términos RN-23; `LlmEvidenceGenerator` asigna la tabla sobre los fragmentos dentro de `LLM_FRAGMENTS_MAX_CHARS`, renombra el campo del esquema interno con `items.pattern` solo en el esquema entregado al runtime (D4) y traduce antes de construir `OpcionGenerada` (D3); logs solo con conteos. Verificación: 2.2–2.5 en verde y suites de L1D-179, L1D-180 y US-225 sin regresiones. Commit `feat(L1D-287)`.
- [x] 2.8 (test después) Actualizar las aserciones sobre `[chunkId:` del prompt (`tests/unit/test_prompt_rag_query.py`, `tests/integration/test_rag_query_detalle.py`, `tests/integration/test_rag_query_composicion_llm.py`, `tests/evaluation/test_adr39_runtime_llm.py`) al formato de alias, en un commit con el *trailer* `Test-Removal: US-236 AC-1 sustituye el chunkId real por el alias en el prompt`. Verificación: suite en verde; regresión del requisito "Plantilla del prompt sin lenguaje prescriptivo" sobre `rag-query@0.3.0` en verde.
- [x] 2.9 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-287)`.

## 3. clinical-platform

- [ ] 3.1 (de clinical-platform-dev; no hecha por ai-services) (test después) Regresión [US-236 AC-5] en `apps/clinical-api`: con `rag-orchestrator` simulado por MSW desde `contracts/examples/` (respuesta con `chunkId` reales), el `AIAnalysisRecord` persistido conserva solo los `chunkId` reales y ningún log de `clinical-api` contiene un alias `C<n>` como identificador. Supertest + PostgreSQL real de test. Si el implementador de ai-services no tiene este contexto, el orquestador lo despacha a `clinical-platform-dev`.
- [ ] 3.2 (de clinical-platform-dev; no hecha por ai-services) Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-287)` (si no hubo código de producción, se marca sin cambios).

## 4. evaluación

- [x] 4.1 (evaluate) Config `apps/rag-orchestrator/eval/configs/us236-alias.yaml` con la pregunta del origen («¿Cuándo se considera un inhibidor de CDK4/6 adyuvante?»), el paciente sintético de mama (a) y `EVAL_ORIGIN_RUNS: 10` (design D6; solo datos sintéticos de `data/evaluation/`). Verificación: el runner lo carga en seco.
- [x] 4.2 (evaluate) `run-ai-eval` sobre la rama con `LLM_PROVIDER=fake` (configuración de CI): sin regresión en precisión de citas, fidelidad, "sin evidencia" y salidas prescriptivas = 0 respecto del baseline.
- [ ] 4.3 (medición con el LLM real hecha, 0 cita_invalida; falta el reporte en reports/eval/ por ai-eval-runner) (evaluate) `run-ai-eval` con `ai-eval-runner` y el LLM real local sobre el dataset actual (`data/evaluation/`, `[S3 resp. 8]`) y la pregunta del origen × `EVAL_ORIGIN_RUNS` [US-236 AC-7]: precisión de citas ≥ 0,90, recuento de `cita_invalida` ≤ referencia de `main`, `cita_invalida = 0` en todas las corridas del origen. Reporte en `reports/eval/` adjunto al PR. No se tocan umbrales, prompts ni datasets para que pase; un FAIL se reporta al orquestador.

## 5. Verificación

- [x] 5.1 `openspec validate l1d-287-alias-chunks-cita --strict` en verde.
- [x] 5.2 Suite de `apps/rag-orchestrator` en verde (unitarios e integración) y suite de `apps/clinical-api` afectada en verde.
- [x] 5.3 `contracts:check` y `contracts:breaking` sin cambios (tarea 1.1); `contracts:verify-provider` no aplica (sin cambio de API).
- [ ] 5.4 (pendiente del reporte de ai-eval-runner) `run-ai-eval` adjunto (tareas 4.2 y 4.3).
