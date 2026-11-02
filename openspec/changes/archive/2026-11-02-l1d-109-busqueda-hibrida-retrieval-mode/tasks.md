# Tasks — l1d-109-busqueda-hibrida-retrieval-mode

## contratos

- [x] 1.1 (desviación: `if/then/else` de un solo nivel en vez de `if/then` por fusión; el rango de `fusionParam` por fusión lo valida la configuración, porque `anyOf` rompía `contracts:breaking` y el generador de refinamientos no traduce `minimum`) Editar `apps/rag-orchestrator/openapi.yaml` y subir `info.version` 1.6.0 → **1.7.0** (rebasa sobre `l1d-291`, que deja 1.6.0; cadena rag-orchestrator 291 → 109 → 295 → 144 → 300; `l1d-295` rebasa sobre este): `RagMeta.retrievalParams.fusion` (`ninguna | rrf | ponderada`) y `fusionParam` (número ≥ 0) en `required`, sin `null`, con los `if/then` de design.md D7 · commit `contract(L1D-109)` · test después (fixture). **Merge antes que L1D-300** (300 rebasa sobre este bloque).
- [x] 1.2 Ejemplos: añadir `fusion = "ninguna"` y `fusionParam = 0` a todos los `contracts/examples/rag-query-*.json` **y** `rag-follow-up-*.json` con `retrievalParams`; nuevo `rag-query-hibrida.json` (`hibrida`, `rrf`, 60) con su request `rag-query-request-hibrida.json` de `query` distinta, registrados en `index.json`; fixture de PR que rompe con `fusion = null` o `dense` + `rrf` · `contracts:check` (incl. `assertFixtureQueriesDistinct()`), `contracts:breaking` (sin incompatibles), `contracts:generate` · test después · commit `contract(L1D-109)`

## ai-services

- [x] 2.1 Test de aceptación en rojo: AC-1, AC-2, AC-3, AC-4 (`… [US-112 AC-n]`) con recuperadores dense/sparse falsos (`Q-KEYWORD`, `Q-HER2`, `Q-SIN`) · integración (`TestClient` + fakes) · estricto · commit `test(L1D-109)`; esqueletos (puerto *sparse*, `fusionar_candidatos`) solo si falta el símbolo
- [x] 2.2 Implementar `fusionar_candidatos()` (RRF) en `domain/`, método *sparse* en puertos/fakes/adapter Milvus con filtro compartido, y la bifurcación de `_recuperar()` por modo; AC-1…AC-4 en verde (regresiones [RN-02] y [RN-05] de US-055) · estricto · commit `feat(L1D-109)`
- [x] 2.3 Test en rojo AC-5 y AC-6 (parámetros trazados y persistidos, valor por defecto `dense` con cero llamadas *sparse*, fusión ponderada) + unitarios de la fusión (RRF y ponderada, desempate por `chunk_id`) · integración + unitario de dominio · estricto · commit `test(L1D-109)`
- [x] 2.4 (`.env.example` de rag-orchestrator con `RETRIEVAL_MODE`, `RETRIEVAL_FUSION`, `RRF_K` y `HYBRID_SPARSE_WEIGHT`: aplicado en el PR #246 (mergeado en main)) `RETRIEVAL_MODE`, `RETRIEVAL_FUSION`, `RRF_K`, `HYBRID_SPARSE_WEIGHT` en `settings.py` y `.env.example` (validación al arranque); ponderada y `_armar_meta_de_recuperacion` con `fusion`/`fusionParam` sin `null` (`ninguna`/`0` en `dense`), único armado de `retrievalParams` para `/rag/query` y `/rag/follow-up`; AC-5, AC-6 en verde · estricto · commit `feat(L1D-109)`
- [x] 2.5 Test de logs (AC-5, RN-10): con `hibrida`, los logs traen solo recuentos, modo, fusión y `chunkId`, nunca texto de consulta, fragmento, *prompt* ni salida del LLM · integración (captura de logs) · estricto · commit `test(L1D-109)` antes de su ajuste
- [x] 2.6 Verificación del proveedor: `contracts:verify-provider` valida las respuestas reales de `/rag/query` en `dense`, `hibrida`+`rrf` e `hibrida`+`ponderada` (sin `null` en `retrievalParams`); para `/rag/follow-up`, si su ruta ya existe al implementar, el mismo test de integración sobre ella; si no, queda cubierto por el `required` del contrato y por los ejemplos de 1.2, y lo hereda la historia que implemente el endpoint · integración · test después · commit `test(L1D-109)`
- [x] 2.7 (CERRADA: el job `integration-rag` del PR #243 pasó en verde, CI completa en 519a4a8b = success; antes PARCIAL, no se corre local: consistencia índice/consulta verificada en `tests/unit/test_recuperacion_hibrida_configuracion.py`; los tests contra Milvus real están escritos pero NO ejecutados localmente, queda pendiente el job `integration-rag` de la CI) Test de consistencia índice/consulta del *sparse* (misma configuración y `SPARSE_VECTOR_SOURCE`) y, en la CI, búsqueda híbrida contra Milvus de test · integración · test después · commit `test(L1D-109)`
- [x] 2.8 Refactor: Extract Method en `_recuperar()` y `_armar_meta_de_recuperacion`, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-109)`

## clinical-platform

- [x] 3.1 Verificar (sin cambio de código esperado) que `retrieval_params` del `AIAnalysisRecord` persiste el bloque `retrievalParams` completo con `fusion` y `fusionParam` (`rag-query-hibrida.json` → `rrf`/60; `rag-query-con-evidencia.json` → `ninguna`/0); si el cliente/Zod generado de `clinical-api` es cerrado, regenerarlo desde el contrato 1.7.0 · integración (Supertest + MSW desde `contracts/examples/`) · test después · commit `test(L1D-109)` · evidencia: `persistencia-busqueda-hibrida.test.ts` (2 tests en verde; en rojo al quitar `fusion`/`fusionParam` del Zod generado de rag-orchestrator, revertido); el Zod `strictObject` ya acepta 1.7.0, sin regenerar y sin cambio de código

## evaluación

- [x] 4.1 Entregar a US-133 el modo y la fusión configurables para los brazos A2 y A2b (sin medir aquí); sin TDD, la medición es de `ai-eval-runner` en US-133

## Cierre

- [x] 5.1 (`contracts:check`, `contracts:breaking` sin ERR con las excepciones de 291 y `contracts:verify-provider` en verde en la CI de 519a4a8b y en local: 2907 passed, 265 respuestas) `openspec validate l1d-109-busqueda-hibrida-retrieval-mode --strict`, tests de `apps/rag-orchestrator` y de `clinical-api` (3.1) en verde, `contracts:check`, `contracts:breaking` y `contracts:verify-provider` en verde

## Pregunta abierta al humano

- [x] Q-1 Una pregunta sin términos léxicos hace fallar cerrado (503) la consulta híbrida, aunque `dense` funcione: ¿se mantiene, o debe degradar a `dense` dejando constancia en `meta`? (design.md D6, «a confirmar por el usuario»). Decidido (usuario, 2026-10-30): se mantiene el fallo cerrado (503) en el S4; la investigación de fondo es US-248 · ADR-48 (Linear L1D-304, FEAT-06b, si-hay-capacidad, 2 pts, PR #247); US-133/L1D-245 debe contar cuántas preguntas del conjunto dorado caen en «sin términos» (AC-4 de US-248). No se ejecuta US-248 aquí.
