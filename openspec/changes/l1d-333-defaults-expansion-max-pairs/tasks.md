# Tasks — l1d-333-defaults-expansion-max-pairs

Requiere `l1d-329-segundo-loop-contextual` y `l1d-331-composicion-terminos-prostata` en `main` (mergeados). **PR separado
(AC-7):** su merge se pide solo tras la corrida final única (D6-50); sin corrida, el PR se cierra sin merge y la decisión
queda en D6-44. Política: configuración, test después, con la aserción de defaults primero en rojo; sin corridas reales ni
LLM real durante el desarrollo. **REGLA DE PARADA (AC-3):** si el p95 de consulta completa con `RERANKER_MAX_PAIRS=20`
supera el tope vigente (**20 s**, decisión del usuario del 2026-11-07, antes 15 s; techo absoluto de 25 s solo con una mejora de calidad significativa medida; la CI usa 20 s), el implementador se detiene y pregunta al orquestador y al usuario las
opciones (recalibrar el tope, 20 solo en análisis o reducir el costo de generación); no decide ni mergea el cambio de defaults. **Satisfecha (2026-11-07):** p95 17,05 s (n=69) y 18,3 s (n=67) < 20 s; máximo observado 23-25 s (el tope aplica al p95).

## 1. ai-services

- [x] 1.1 Test de configuración en rojo [US-275 AC-1]: `Settings` sin entorno trae `QUERY_CONTEXT_EXPANSION_ENABLED=true`, `RETRIEVAL_MODE=dense` y los tres campos · `tests/unit/test_configuracion_expansion_contextual.py` · commit `test(L1D-333)` · EVIDENCIA: rojo, 1 failed por aserción (`assert False is True`)
- [x] 1.2 `EXPANSION_HABILITADA_INICIAL = True` en `app/domain/expansion_contextual.py` y apagado explícito en los tests que dependían del default (`test_rag_query_contextual.py` [US-275 AC-6], `test_catalogo_terminos_del_caso.py`), sin debilitar aserciones; test unitario de `false` en el entorno [US-275 AC-6] · commit `feat(L1D-333)` · EVIDENCIA: verde, `pytest` de `rag-orchestrator` 5109 passed (193 deseleccionados por requerir PostgreSQL)
- [x] 1.3 Refactor sin cambio de comportamiento si procede · EVIDENCIA: refactor: sin cambios (un valor constante)
- [x] 1.4 Enmienda de `RERANKER_MAX_PAIRS` 12 -> 20 en `docs/architecture/adr/ADR-39-modelos-locales.md` con la medición de D6-44 como evidencia, regla de parada y el p95 en máquina limpia marcado pendiente [US-275 AC-5] · el bloque `adr39:decision` sigue en 12 hasta H-1 (`--check-config` lo exige igual a `.env.example`)
- [x] 1.5 Gate 2 (P1-1, P1-2 y menores): ADR-52 y docstring del servicio con el estado real de las fuentes, `QUERY_CONTEXT_EXPANSION_ENABLED` en `scripts/ci/eval-trigger-paths.yaml` (con caso en `evalTrigger.test.mjs`), H-1 fusionada en un solo paso, línea «VIGENTE EN EJECUCIÓN» en ADR-39, test unitario de `false` con `@pytest.mark.ac("US-275", 6)`, aserción tautológica quitada, caso `clinical_catalog_path=None` en `design.md`; la paridad Compose = `.env.example` del indicador ya la cubre `compose-env-example.test.mjs` (lista de claves del chat y del corte)

- [x] 1.6 Tope de p95 de 20 s (decisión del usuario, 2026-11-07): `p95_evidence_analyses_s: 20` en `eval/configs/metas-iniciales.yaml` con test en rojo antes (`test_barrido_unitarios.py`) y ajuste de `test_barrido_aceptacion.py` (mismo escenario fuera de meta con 22,4 s y «≤ 20 s», sin debilitar); docs: ADR-39, ADR-52, `backlog/01-requisitos.md`, S6-plan, S6-deuda y US-275; el techo de 25 s no es umbral de CI · EVIDENCIA: rojo `assert (0.8, 15) == (0.8, 20)`; verde `tests/evaluation` 1094 passed

## 2. evaluación

- [x] 2.1 Medidos en la corrida final del 2026-11-07 (`ai-eval-runner`, modelos reales, 20 pares con expansión activa): p95 de consulta completa 17,05 s (fase 1, n=69; base densa 14,71 s) y 18,3 s (fase 2, n=67) < 20 s [US-275 AC-2]; recall@10 0,875 -> 0,906, MRR 0,849 -> 0,887, 0 violaciones de RN-02, precisión de citas 1,00 y controles intactos [US-275 AC-4]. Limitaciones: una sola corrida, sin A/B del mismo día ni máquina limpia garantizada, el `evaluate` oficial no mide la expansión (D6-60); fidelidad 0,822 < 0,90 sin línea base (D6-58); próstata 9/22 y 13/22 genéricas con evidencia (D6-57); `chat-local` no ejecutable (D6-59). El reporte `reports/eval/` es H-3. En CI, `evaluate` con adapters o fake corre sin regresión

## 3. humano

- [ ] H-1 **Paso único, aplicar juntos, nunca solo la parte de Compose:** en un mismo commit tras la corrida final (sin disparar AC-3), (a) `apps/rag-orchestrator/.env.example`: `RERANKER_MAX_PAIRS=20` (línea 8) y `QUERY_CONTEXT_EXPANSION_ENABLED=true` (línea 196), y actualizar los comentarios de las líneas ~194 («Desactivado por defecto…») y de `infra/docker/docker-compose.yml:367` a «mismos valores que `.env.example` y que el código»; (b) bloque `adr39:decision` de `docs/architecture/adr/ADR-39-modelos-locales.md`: `RERANKER_MAX_PAIRS: 20` (`python -m app.scripts.adr39_measure --check-config` exige que coincida con `.env.example`) y quitar la línea «VIGENTE EN EJECUCIÓN: 12»; (c) `infra/docker/docker-compose.yml` (línea ~369): `${QUERY_CONTEXT_EXPANSION_ENABLED:-false}` -> `:-true` (`RERANKER_MAX_PAIRS: ${RERANKER_MAX_PAIRS:-}` no lleva valor propio y no cambia). El test `infra/docker/__tests__/compose-env-example.test.mjs` (Compose = `.env.example` en `QUERY_CONTEXT_EXPANSION_ENABLED`) falla si se aplica solo una de las dos partes; `QUERY_CONTEXT_EXPANSION_ENABLED` en `eval-trigger-paths.yaml` hace que ese cambio dispare `eval-required` · bloque literal: `RERANKER_MAX_PAIRS=20`, `QUERY_CONTEXT_EXPANSION_ENABLED=true` y `QUERY_CONTEXT_EXPANSION_ENABLED: ${QUERY_CONTEXT_EXPANSION_ENABLED:-true}` · DIFERIDA -> H-1
- [ ] H-3 Guardar el reporte de la corrida final en `reports/eval/` (carpeta protegida; no la escribe el implementador) · bloque literal: `reports/eval/<fecha>-l1d-333-s5.json` y su `.md` producidos por `run-ai-eval` con `RERANKER_MAX_PAIRS=20` y `QUERY_CONTEXT_EXPANSION_ENABLED=true`, en máquina limpia; el PR enlaza el reporte · DIFERIDA -> H-3

## 4. cierre

- [x] 4.1 `openspec validate l1d-333-defaults-expansion-max-pairs --strict`, `pytest` de `rag-orchestrator`, `ruff format --check`, `lint-imports`, `contracts:check`, `pii-scan`, `tasks-destino` y `verificar-commits-tdd` en verde
