# Tasks — l1d-333-defaults-expansion-max-pairs

Requiere `l1d-329-segundo-loop-contextual` y `l1d-331-composicion-terminos-prostata` en `main` (mergeados). **PR separado
(AC-7):** su merge se pide solo tras la corrida final única (D6-50); sin corrida, el PR se cierra sin merge y la decisión
queda en D6-44. Política: configuración, test después, con la aserción de defaults primero en rojo; sin corridas reales ni
LLM real durante el desarrollo. **REGLA DE PARADA (AC-3):** si el p95 de consulta completa con `RERANKER_MAX_PAIRS=20`
supera 15 s (la medición previa dio ~15,4 s), el implementador se detiene y pregunta al orquestador y al usuario las
opciones (recalibrar el tope, 20 solo en análisis o reducir el costo de generación); no decide ni mergea el cambio de defaults.

## 1. ai-services

- [x] 1.1 Test de configuración en rojo [US-275 AC-1]: `Settings` sin entorno trae `QUERY_CONTEXT_EXPANSION_ENABLED=true`, `RETRIEVAL_MODE=dense` y los tres campos · `tests/unit/test_configuracion_expansion_contextual.py` · commit `test(L1D-333)` · EVIDENCIA: rojo, 1 failed por aserción (`assert False is True`)
- [x] 1.2 `EXPANSION_HABILITADA_INICIAL = True` en `app/domain/expansion_contextual.py` y apagado explícito en los tests que dependían del default (`test_rag_query_contextual.py` [US-275 AC-6], `test_catalogo_terminos_del_caso.py`), sin debilitar aserciones; test unitario de `false` en el entorno [US-275 AC-6] · commit `feat(L1D-333)` · EVIDENCIA: verde, `pytest` de `rag-orchestrator` 5109 passed (193 deseleccionados por requerir PostgreSQL)
- [x] 1.3 Refactor sin cambio de comportamiento si procede · EVIDENCIA: refactor: sin cambios (un valor constante)
- [x] 1.4 Enmienda de `RERANKER_MAX_PAIRS` 12 -> 20 en `docs/architecture/adr/ADR-39-modelos-locales.md` con la medición de D6-44 como evidencia, regla de parada y el p95 en máquina limpia marcado pendiente [US-275 AC-5] · el bloque `adr39:decision` sigue en 12 hasta H-1 (`--check-config` lo exige igual a `.env.example`)

## 2. evaluación

- [ ] 2.1 DIFERIDA -> D6-50 (corrida final única, modelos reales, p95 en máquina limpia con `RERANKER_MAX_PAIRS=20`: valor, muestra y condiciones junto a la línea densa de 14,7 s [US-275 AC-2]; recall@10 y MRR no menores, 0 falsos positivos en adversarias y controles intactos [US-275 AC-4]). En CI, `evaluate` con adapters o fake corre sin regresión. Si el p95 supera 15 s: REGLA DE PARADA (AC-3)

## 3. humano

- [ ] H-1 Poner `RERANKER_MAX_PAIRS=20` y `QUERY_CONTEXT_EXPANSION_ENABLED=true` en `apps/rag-orchestrator/.env.example` y, en el mismo paso, `RERANKER_MAX_PAIRS: 20` en el bloque `adr39:decision` de `docs/architecture/adr/ADR-39-modelos-locales.md` (`python -m app.scripts.adr39_measure --check-config` exige que coincidan) · bloque literal: `RERANKER_MAX_PAIRS=20` y `QUERY_CONTEXT_EXPANSION_ENABLED=true` (cambian las líneas 8 y 196 de `.env.example`) · solo tras la corrida final sin disparar AC-3 · DIFERIDA -> H-1
- [ ] H-2 En `infra/docker/docker-compose.yml` (línea ~369) cambiar `QUERY_CONTEXT_EXPANSION_ENABLED: ${QUERY_CONTEXT_EXPANSION_ENABLED:-false}` por `${QUERY_CONTEXT_EXPANSION_ENABLED:-true}`; `RERANKER_MAX_PAIRS: ${RERANKER_MAX_PAIRS:-}` (línea ~442) no lleva valor inicial propio y no cambia; ajustar el test de paridad `.env.example`/Compose si lo exige · DIFERIDA -> H-2
- [ ] H-3 Guardar el reporte de la corrida final en `reports/eval/` (carpeta protegida; no la escribe el implementador) · bloque literal: `reports/eval/<fecha>-l1d-333-s5.json` y su `.md` producidos por `run-ai-eval` con `RERANKER_MAX_PAIRS=20` y `QUERY_CONTEXT_EXPANSION_ENABLED=true`, en máquina limpia; el PR enlaza el reporte · DIFERIDA -> H-3

## 4. cierre

- [x] 4.1 `openspec validate l1d-333-defaults-expansion-max-pairs --strict`, `pytest` de `rag-orchestrator`, `ruff format --check`, `lint-imports`, `contracts:check`, `pii-scan`, `tasks-destino` y `verificar-commits-tdd` en verde
