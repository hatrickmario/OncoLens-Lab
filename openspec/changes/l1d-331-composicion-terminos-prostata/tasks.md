# Tasks — l1d-331-composicion-terminos-prostata

Requiere `l1d-329-segundo-loop-contextual` en `main`. Política: TDD estricto en el dominio (doble bucle); catálogo, test
después; la medición con modelos reales es la corrida final única del S6 (D6-50). No se activa
`QUERY_CONTEXT_EXPANSION_ENABLED`, ni cambian `RERANKER_MAX_PAIRS` ni `RETRIEVAL_MODE`.

## 1. catálogo

- [ ] 1.1 `lenguaje/marcos-de-pregunta.json` (1.7.0 -> 1.8.0): sección `expansion.biomarcadoresNoAnclables` con `prostata: ["psa"]`; su esquema, la regla del validador (`validator/marcos.mjs`) y sus tests en `scripts/catalog/__tests__/marcos-de-pregunta.test.mjs`; `manifest.json` 1.8.0 -> 1.9.0 y barrido coherente de `1.8.0` en `contracts/examples`, `clinical-api`, `rag-orchestrator` y `scripts/catalog/__tests__` · `catalog:validate` y `catalog:version-guard` en verde · commit `feat(L1D-331)`
- [ ] 1.2 Fixture `packages/clinical-catalogs/test/fixtures/temas-del-caso.json`: salida de `prostata-con-grado` sin el PSA y un caso de próstata con otro biomarcador del catálogo (HRR); lo consumen `test_terminos_del_caso.py` y el panel (`preguntas-guiadas.test.ts`, sin cambio) · commit `test(L1D-331)`

## 2. ai-services

- [ ] 2.1 Test de aceptación en rojo [US-273 AC-1] [US-273 AC-3] [US-273 AC-5]: próstata sin PSA en los términos y en la consulta contextual al *reranker*; mama idéntica · `tests/integration/test_rag_query_contextual.py` y `tests/unit/test_terminos_del_caso.py` · commit `test(L1D-331)`
- [ ] 2.2 Bucle interno: `CatalogoDeTerminos.biomarcadores_no_anclables`, `_del_biomarcador_principal` y el cargador (`infrastructure/catalogo_clinico/terminos_del_caso.py`) · commit `feat(L1D-331)`
- [ ] 2.3 Refactor sin cambio de comportamiento si procede · commit `refactor(L1D-331)`

## 3. evaluación

- [ ] 3.1 DIFERIDA -> D6-50 (corrida final única del S6 con modelos reales: AC-1 sobre las 22 genéricas con el caso de próstata, meta de top-3 de cribado ≤ 33/66 frente a 54/66, y AC-2 sobre las 60 preguntas; sin modelos reales durante el desarrollo)

## 4. humano

- [ ] H-6 Guardar el reporte de la corrida final en `reports/eval/` (carpeta protegida; no la escribe el implementador) · bloque literal: `reports/eval/<fecha>-l1d-331-s5.json` y su `.md` producidos por `run-ai-eval` · DIFERIDA -> H-6

## 5. cierre

- [ ] 5.1 `openspec validate l1d-331-composicion-terminos-prostata --strict`, `pytest` de `rag-orchestrator`, `contracts:check`, `catalog:validate`, `catalog:version-guard`, `ruff`, `lint-imports` en verde
