# Tasks — l1d-144-hasta-3-opciones-orden-aplicabilidad

> Secuencia de commits: contract → test → feat → refactor. Requiere en `main` `l1d-130-*` (US-125, archivado). ↪ Coordinar con `l1d-295`, `l1d-293`, `l1d-294`
> y US-238 (mismos archivos del pipeline) y con la cadena de contratos (rag-orchestrator 291 → 109 → 295 → 144 → 300; clinical-api 291 → 95 → 295 → 144 → 300): este change rebasa sobre `l1d-295` y fija rag-orchestrator 1.9.0 y clinical-api 1.14.0; `l1d-300` rebasa sobre él. Requiere `l1d-293` en `main` para el escenario heredado de US-125 AC-5 (`sin_regla_de_comparacion`). ⛔ DEC-11 (escenario más probable) y ⛔ ADR-39 (solo medición real).

## contratos

- [x] 1.1 `sync-contracts` (contract-first): editar a mano `apps/rag-orchestrator/openapi.yaml` (`RagQueryInternalResponse.optionsNotShown`, requerido, integer >= 0; `info.version` 1.9.0) y `apps/clinical-api/openapi.yaml` (`AnalysisBasis.optionsNotShown` y `maxOptions`, opcionales; `info.version` 1.14.0), con el YAML de `design.md` · `contracts/schemas/evidence.yaml` no se toca y ningún `openapi.yaml` se genera · rebase sobre `l1d-295` (rag-orchestrator 1.8.0, clinical-api 1.13.0) antes de fijar las versiones · commit `contract(L1D-144)`
- [x] 1.2 Ejemplos en `contracts/examples/` + `index.json`: `rag-query-request-tres-opciones.json` (pregunta distinta, `maxOptions = 3`), `rag-query-tres-opciones.json` (target `RagQueryInternalResponse`, `LLM-CUATRO`, `optionsNotShown = 1`) y `con-evidencia-s4-tres-opciones.json` (target `EvidenceAnalysis` solo); para `LLM-TRES` (O-A no comparable en tercer lugar, `optionsNotShown = 0`): `con-evidencia-s4-tres-opciones-no-comparable.json` (target `EvidenceAnalysis`, base del MSW de US-135 AC-5) y, porque el E2E y el `visual-check` de `l1d-145` corren con el LLM fake, su par `rag-query-tres-opciones-no-comparable.json` (target `RagQueryInternalResponse`, `request: rag-query-request-tres-opciones-no-comparable.json`, con su request propio y pregunta distinta de las demás); `optionsNotShown = 0` en **todo** ejemplo con target `RagQueryInternalResponse` registrado en `index.json` al rebasar (los vigentes y los que añaden `l1d-291`, `l1d-295` y `l1d-297`), comprobado recorriendo `index.json`, no con una lista fija · commit `contract(L1D-144)`
- [x] 1.3 Generar desde los dos `openapi.yaml` los tipos TS de `packages/api-contracts`, los schemas Zod y los modelos Pydantic (nunca a mano); `contracts:check` y `oasdiff` contra `main` sin ERR en ambos specs · commit `contract(L1D-144)`

## ai-services

- [x] 2.1 Fixture FX-10c-a: `doc-a6`/`ch-a6-1`, `APL-FIJA`, `LLM-CUATRO`, `LLM-TRES`, `LLM-MULTIFUENTE`, reranker falso y `test-apl-1.0.0` (perfil `RAG_ADAPTERS=fake`) · test después (fixture)
- [x] 2.2 Tests de aceptación en rojo (Pytest + TestClient, `@pytest.mark.ac("US-134", n)`): "devuelve [O-B, O-D, O-C] con relevancia solo como desempate cuando maxOptions es 3 [US-134 AC-1/AC-2]", "declara optionsNotShown = 1 sin contenido de O-A [US-134 AC-3]", "deja O-A última y visible con LLM-TRES [US-134 AC-4]", "descarta O-E sin ocupar posición [US-134 AC-5]", "mantiene el orden en las 24 permutaciones [US-134 AC-6]", "compara O-F con doc-a1 [US-134 AC-7]" · TDD estricto · commit `test(L1D-144)` solo con esqueletos `raise NotImplementedError`
- [x] 2.3 `recortar_a_max_opciones()` en `app/domain/option_selection.py` devuelve conservadas y conteo del excedente (unitarios uno a uno, tabla de empates) · TDD estricto
- [x] 2.4 Cablear en `RAGOrchestratorService`/`respuesta_con_evidencia.py`: `optionsNotShown` siempre presente en la respuesta (`0` sin recorte, también en `sin_evidencia`) y log solo con conteos y `traceId`; validar contra el spec del proveedor (US-214) · integración · commit `feat(L1D-144)`

## clinical-platform

- [x] 3.1 Tests de aceptación en rojo (Supertest + PostgreSQL real + MSW desde `contracts/examples/`): "responde [O-B, O-D, O-C] y analysisBasis.maxOptions = 3 [US-134 AC-1]", "persiste optionsNotShown igual en la Base y el registro [US-134 AC-3]", "propaga O-A última y visible [US-134 AC-4]", "persiste evidence_options en el mismo orden sin reordenar [US-134 AC-8]" · TDD estricto · commit `test(L1D-144)`
- [x] 3.2 `ANALYSIS_MAX_OPTIONS` con defecto 3 (RN-22) y validación 1–3 en `src/config/secciones.ts`; `optionsNotShown` y `maxOptions` en `analysis-basis.ts`, `analysis-record.ts` y mapper, sin reordenar · TDD estricto (test unitario de config uno a uno) · commit `feat(L1D-144)`
- [ ] 3.3 (NO MARCADA: .env.example lo cubre la sesión principal, PR #265; Compose pasa `ANALYSIS_MAX_OPTIONS` vacío y el defecto 3 vive en `secciones.ts`) Actualizar `.env.example`/Compose con `ANALYSIS_MAX_OPTIONS=3` · test después (humo de configuración)

## Cierre

- [ ] 4.1 (NO MARCADA: refactor: sin cambios en el modo aceleración; TRASLADADA a deuda del S5) Refactor: Extract Method en los archivos tocados, tests en verde antes y después, cobertura del módulo sin bajar · commit `refactor(L1D-144)`
- [x] 4.2 `openspec validate l1d-144-hasta-3-opciones-orden-aplicabilidad --strict`, suites de ambos backends, `contracts:check`, `contracts:verify-provider` y `oasdiff` en verde
