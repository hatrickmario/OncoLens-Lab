# Tasks — l1d-204-llm-local-sin-nube

## 1. contratos

- [ ] 1.1 Sin cambios de API (exento): `dataClassification` y `llmProvider` de `/chat/turn` los publica `l1d-316` en la 1.12.0; comprobar que `apps/rag-orchestrator/openapi.yaml`, `apps/clinical-api/openapi.yaml` y `contracts/examples/` no tienen diff en este change y que `contracts:check` y `contracts:breaking` siguen en verde

## 2. ai-services

- [ ] 2.1 Esqueletos de `proveedores_permitidos()` en `app/domain/reglas_proveedor.py` y de `SelectorDeProveedorLlm` en `app/application/selector_proveedor_llm.py` (`raise NotImplementedError`); adapter de nube falso que cuenta invocaciones en `tests/` dentro de la batería de contrato de adapters LLM · test después
- [ ] 2.2 Test de aceptación en rojo: «responde con el local y cero invocaciones a la nube cuando el dato es real y la nube está habilitada [US-050 AC-1]», «responde 503 LOCAL_LLM_UNAVAILABLE sin invocar a la nube cuando el local cae con dato real [US-050 AC-2]» y «responde 503 sin invocar a la nube cuando es sintético y la nube está deshabilitada [US-050 AC-3]» · integración (`TestClient`, adapters falsos) · TDD estricto · commit `test(L1D-204)`
- [ ] 2.3 Implementar `proveedores_permitidos()` (unitarios de la matriz, uno a la vez, con `@pytest.mark.ac`) y `SelectorDeProveedorLlm`; `meta.llmProvider` desde el selector (D3); cablear en `app/bootstrap.py` con `nube=None` y retirar `_proveedor_de_meta` duplicado · commit `feat(L1D-204)` · verificación: 2.2 en verde, respuestas validadas contra el spec, `test_adapters_sin_red.py` y `test_regla_llm_local.py` en verde
- [ ] 2.4 Test de regresión: «los modelos de recuperación y verificación no cambian con el selector» y «sintético con la nube habilitada usa el respaldo y declara nube» · integración · TDD estricto (en el mismo `test(L1D-204)` de 2.2 si se escribe antes; si ya pasa, se registra la salida)
- [ ] 2.5 Test de aceptación en rojo: «un turno con dato real y el LLM local caído responde 503 sin invocar a la nube ni guardar el hilo [US-050 AC-2] [S6 resp. 8]» y «un turno de evidencia con dato real declara llmProvider local [US-050 AC-1]» sobre `POST /chat/turn` · integración · TDD estricto · commit `test(L1D-204)` · requiere `l1d-316` en la rama base; el `503` se valida contra el esquema y el ejemplo `chat-turn-llm-local-no-disponible.json` de `l1d-316`
- [ ] 2.6 Pasar `dataClassification` del `ChatTurnRequest` (campo ya publicado por `l1d-316`) al selector en el enrutado y los nodos de `app/application/chat/`; `llmProvider` de la respuesta desde el adapter que respondió · commit `feat(L1D-204)` · verificación: 2.5 en verde
- [ ] 2.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-204)`

## 3. clinical-platform

- [ ] 3.1 Test de aceptación en rojo: «arma el request interno con real_identificado aunque la entrada diga sintetico [US-050 AC-4]» (unitario con repositorio falso por *factory*) y «responde 400 sin invocar a la IA cuando el body trae dataClassification [US-050 AC-4]» (Supertest) · TDD estricto · commit `test(L1D-204)`
- [ ] 3.2 Test de aceptación en rojo: «propaga 503 LOCAL_LLM_UNAVAILABLE sin detalles ni registro con dato real [US-050 AC-5]» y «responde 502 sin registro cuando llmProvider es nube con dato real» · integración (Supertest + PostgreSQL de test + MSW desde `contracts/examples/`) · TDD estricto · commit `test(L1D-204)`
- [ ] 3.3 Extraer `clasificacionDelPaciente()` y `proveedorPermitido()` (RN-12) en `src/modules/evidence-analysis/`; fila de proveedor no permitido en la tabla única de `rag-failure.ts` con evento `proveedor_no_permitido` sin contenido clínico · commit `feat(L1D-204)` · verificación: 3.1 y 3.2 en verde, respuestas validadas contra el spec de `clinical-api`
- [ ] 3.4 Test de aceptación en rojo sobre `POST /platform/conversations/{id}/turns`: «envía la clasificación del paciente [US-050 AC-4]», «responde 503 sin conversation_turn ni AIAnalysisRecord cuando Backend 2 responde LOCAL_LLM_UNAVAILABLE [US-050 AC-5]» y «responde 502 sin turno cuando llmProvider es nube con dato real» · integración (MSW con el `503` de `chat-turn-llm-local-no-disponible.json` de `l1d-316`) · TDD estricto · commit `test(L1D-204)` · requiere `l1d-315` y `l1d-316` en la rama base
- [ ] 3.5 Reutilizar `clasificacionDelPaciente()` y `proveedorPermitido()` en el servicio de conversación de `l1d-315` · commit `feat(L1D-204)` · verificación: 3.4 en verde
- [ ] 3.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-204)`

## 4. cierre

- [ ] 4.1 `openspec validate l1d-204-llm-local-sin-nube --strict`, `pytest` y `vitest` del contexto en verde, `contracts:verify-provider` para `/rag/query` y `/chat/turn` (sin cambio de API; el comportamiento nuevo se valida contra el spec); sin `run-ai-eval` (no cambia modelo, prompt, umbral, catálogo ni corpus)
