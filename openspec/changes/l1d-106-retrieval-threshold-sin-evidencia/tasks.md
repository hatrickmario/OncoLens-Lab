# Tasks — l1d-106-retrieval-threshold-sin-evidencia

> Matriz TDD (CLAUDE.md): endpoint y reglas RN-02/RN-05/RN-03 → **TDD estricto, doble bucle**
> (commit `test(L1D-106)` con el test de aceptación en rojo antes de su `feat(L1D-106)`); fixture
> y configuración → **test después**; valor del umbral → **evaluate**.
> Mocks solo en los bordes: Milvus, *embeddings*, *reranker* y LLM (adapters falsos de FX-06a-a /
> FX-06a-b que cumplen el contrato del puerto: `None` ≠ `0.0`, mismos errores). Reloj inyectado
> (`freezegun`). Nunca `.skip`, `skipif` ni `xfail`.
> Secuencia de commits: `contract` → `test` → `feat` → `refactor`. Orden de merge `[S1 resp. 17]`:
> L1D-164 → L1D-105 → **L1D-106** → L1D-179 → L1D-275 → L1D-180 (quien mergea segundo rebasa).
> Respuestas validadas contra el spec con el *helper* de L1D-164 (Pytest), no con
> `contracts:verify-provider` (no existe hasta US-214). Nombres canónicos `[S1 resp. 17]`:
> `app/api/rag_query.py`, `app/config/settings.py`, `app/bootstrap.py`, `EvidenceQueryPort`.

## 1. contratos

- [x] 1.1 (test después; primera tarea del change, skill `sync-contracts`) `contract(L1D-106)` `[S1 resp. 12]`: en `apps/rag-orchestrator/openapi.yaml`, `503` de `POST /rag/query` como `oneOf [ErrorLlmLocalNoDisponible, ErrorRecuperacionNoDisponible]` con la descripción de design.md `## Contratos`; schema nuevo `ErrorRecuperacionNoDisponible` (`error: const RETRIEVAL_UNAVAILABLE`); en la misma subida `[S1 resp. 35]`, el `422` de `POST /rag/query` añade al `oneOf` el schema nuevo `ErrorTipoCancerNoRegistrado` (`error: const TIPO_CANCER_NO_REGISTRADO`) y actualiza su descripción; `info.version` 1.1.0 → 1.2.0 `[S1 resp. 37]`. Verificación: diff igual al de design.md.
- [x] 1.2 (test después) Ejemplos nuevos `contracts/examples/rag-recuperacion-no-disponible.json` y `contracts/examples/rag-tipo-cancer-no-registrado.json` `[S1 resp. 35]` (sintéticos, sin eco) y sus entradas en `contracts/examples/index.json` (`spec: rag-orchestrator`, `target: #/paths/~1rag~1query/post/responses/503` y `…/422`). Después `contracts:generate` (Pydantic y cliente TS, sin edición manual) y `contracts:check` en verde.
- [ ] 1.3 (test después) `contracts:breaking` (oasdiff contra `main`, `--fail-on ERR`): sin `ERR`; los hallazgos esperados son el warning `response-body-wrapped-in-one-of-original-preserved` y, a lo sumo, un `WARN`/`INFO` por la alternativa nueva del `oneOf` del `422`, declarados en el PR (design.md `## Contratos`). Si aparece un `ERR`, detener y declararlo (ADR-26). Commit `contract(L1D-106)`.
  - **PENDIENTE DE DECISIÓN (2026-10-16):** `scripts/ci/contracts-breaking.sh origin/main` reporta 1 `ERR` (`response-body-one-of-added`: alternativa `ErrorTipoCancerNoRegistrado` añadida al `oneOf` del `422`) además del warning esperado; design.md preveía a lo sumo `WARN`/`INFO`. La CI no tiene *bypass* hasta US-214. Ver el reporte del implementador.

## 2. ai-services

- [x] 2.1 (test después) Fixture FX-06a-a: corpus sintético de prueba (`doc-m1`, `doc-m1-v0`, `doc-p1`, `doc-inj`), *embeddings* y *reranker* falsos con los puntajes fijos de `Q-HER2`, `Q-SIN` y `Q-TOX`, `CorpusRelease rel-test-1`, y su script de carga en Milvus de test y en el schema `corpus` de test; adapter falso del LLM con contador de invocaciones (FX-06a-b). Verificación: test de humo que carga el fixture y cuenta los chunks.
- [x] 2.2 (TDD estricto) Test de aceptación en rojo: "responde sin_evidencia con evidenceOptions vacío, aboveThreshold 0 y topRelevanceScore null, sin invocar al LLM, cuando la pregunta no tiene evidencia sobre el umbral [US-055 AC-2]" · integración (`TestClient` + JWT de servicio de test + `@pytest.mark.ac("US-055", 2)`), validando la respuesta contra el spec del proveedor con el *helper* de L1D-164. Esqueleto del router/service con `raise NotImplementedError` si no existe. Commit `test(L1D-106)`.
- [x] 2.3 (TDD estricto) Test de aceptación en rojo: "responde sin_evidencia sin invocar al LLM cuando RELEVANCE_THRESHOLD=0.90 deja fuera todos los chunks de Q-HER2 [US-055 AC-5]" · integración, con `meta.retrievalParams.relevanceThreshold = 0.90`. Commit `test(L1D-106)`.
- [x] 2.4 (TDD estricto) Test de aceptación en rojo: "excluye ch-m1v0-1 de los candidatos del reranker y de las citas porque el filtro de Milvus exige is_current == true [US-055 AC-3]" · integración con *spy* sobre el puerto del *reranker*, más un test contra Milvus de test en la CI (cuando exista la colección de L1D-114). Commit `test(L1D-106)`.
- [x] 2.5 (TDD estricto) Test de aceptación en rojo: "excluye ch-p1-1 de los candidatos cuando el contexto es de mama [US-055 AC-4]" · integración con *spy* sobre el puerto del *reranker* y la expresión de filtro enviada a Milvus. Commit `test(L1D-106)`.
- [x] 2.6 (TDD estricto) Test de aceptación en rojo: "devuelve el mismo relevanceScore en [0,1] en dos cálculos y registra la versión del reranker en meta.rerankerModel [US-055 AC-6]" · integración. Commit `test(L1D-106)`.
- [x] 2.7 (TDD estricto) Test de aceptación en rojo: "responde 503 RETRIEVAL_UNAVAILABLE sin invocar al LLM cuando Milvus o el adapter de embeddings fallan [S1 resp. 12]" · integración con los adapters falsos en modo error, validando el `503` contra el spec con el *helper* de L1D-164. Commit `test(L1D-106)`.
- [x] 2.8 (TDD estricto) Test de aceptación en rojo: "responde 422 TIPO_CANCER_NO_REGISTRADO sin generar embeddings, buscar ni invocar al LLM cuando diagnosis es null [S1 resp. 35]" · integración con contadores en los adapters falsos, validando el `422` contra el spec con el *helper* de L1D-164 y comprobando que no es un `sin_evidencia`. Commit `test(L1D-106)`.
- [x] 2.9 Extraer `filtrar_sobre_umbral()` y `top_relevance_score()` (RN-02) en `app/domain/relevance.py`, con unitarios uno a la vez (lista vacía → `None`; todos bajo el umbral; igual al umbral; mezcla; `top_relevance_score()` = máximo de los chunks sobre el umbral, `[S1 resp. 18]`). Verificación: unitarios en verde y 2.2/2.3 en verde. Commit `feat(L1D-106)`.
- [x] 2.10 Extraer `expresion_filtro_vigente()` (RN-05, OL-02) en `app/domain/retrieval_filter.py` y `validar_puntaje_normalizado()` (RN-03) en `app/domain/relevance.py`, con unitarios (siempre `is_current == true`; restricción de `cancer_type_tags`; puntaje fuera de [0,1] → error). Verificación: unitarios en verde. Commit `feat(L1D-106)`.
- [x] 2.11 Ampliar `app/application/ports.py` (creado por L1D-164) con `QueryEmbedder`, `ChunkSearch`, `Reranker`, `EvidenceGenerator`, `LanguageDetector`, `Clock`; `RAGOrchestratorService` como implementación de `EvidenceQueryPort` (`diagnosis = null` → `TipoCancerNoRegistradoError` antes de cualquier puerto, `[S1 resp. 35]`; idioma → *embedding* de la pregunta y del resumen desidentificado del contexto, sin `pseudoPatientId` → búsqueda *dense* con la expresión de 2.10 → *reranker* → umbral → `sin_evidencia` con `limitations` estructural y `meta` completo, o delegación en `EvidenceGenerator`; error de `ChunkSearch`/`QueryEmbedder` → `RecuperacionNoDisponibleError`), `MilvusRepository` y, en el router `app/api/rag_query.py` de L1D-164 (detrás de la dependencia JWT de L1D-105), la traducción `RecuperacionNoDisponibleError` → `503 ErrorRecuperacionNoDisponible` y `TipoCancerNoRegistradoError` → `422 ErrorTipoCancerNoRegistrado`. Verificación: 2.2–2.8 en verde. Commit `feat(L1D-106)`.
- [x] 2.12 (test después) Configuración `RELEVANCE_THRESHOLD`, `RETRIEVAL_TOP_K`, `RERANK_TOP_N` en `Settings` (`app/config/settings.py`) y reflejo en `meta.retrievalParams` (`retrievalMode = dense`); en `app/bootstrap.py`, `RAGOrchestratorService` como `EvidenceQueryPort` con `LLM_PROVIDER=local` y adapter provisional de `EvidenceGenerator` que responde `503 LOCAL_LLM_UNAVAILABLE` hasta L1D-275 (con `LLM_PROVIDER=fake` sigue `FakeEvidenceQuery`). Verificación: test de integración de ese `503` validado contra el spec con el *helper* de L1D-164 y test de que un valor de configuración ausente impide arrancar.
- [x] 2.13 (test después) Test de no-fuga en logs: con FX-T4a-a (PII sintética sembrada en el contexto), los logs de `/rag/query` no contienen `query`, texto del contexto, `pseudoPatientId` ni texto de chunks. Verificación: test en verde.
- [x] 2.14 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-106)`.

## 3. evaluación

- [x] 3.1 (evaluate) Si el PR fija o cambia el valor por defecto de `RELEVANCE_THRESHOLD`, correr `run-ai-eval` (precisión de "sin evidencia" M-10.1, recall@10 / MRR M-06.1); si la suite aún no existe (US-072, S2), evaluación manual de `ai-eval-runner` con FX-06a-a. Verificación: reporte en `reports/eval/` enlazado en el PR, o constancia de que el valor por defecto no cambió.
  - **Constancia:** este change no introduce ningún valor por defecto de `RELEVANCE_THRESHOLD`, `RETRIEVAL_TOP_K` ni `RERANK_TOP_N` (en `Settings` son `None` y el arranque de `/rag/query` con `LLM_PROVIDER=local` se niega si faltan); los tests usan 0,30 y 0,90. La calibración y su medición (M-10.1, M-06.1) llegan con US-072/US-073.

## 4. Verificación

- [x] 4.1 `openspec validate l1d-106-retrieval-threshold-sin-evidencia --strict` en verde.
- [x] 4.2 Suite de `apps/rag-orchestrator` en verde (Pytest), incluido el test contra Milvus de test en la CI.
- [x] 4.3 `contracts:check` y `contracts:generate:check` en verde; respuestas de `/rag/query` (`200 sin_evidencia`, `401`, `503 LOCAL_LLM_UNAVAILABLE`, `503 RETRIEVAL_UNAVAILABLE`, `422 TIPO_CANCER_NO_REGISTRADO`) validadas con el *helper* de L1D-164 en la suite de integración.
