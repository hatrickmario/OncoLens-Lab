# Evaluación L1D-109 (US-112): búsqueda híbrida detrás de `RETRIEVAL_MODE`

- **Ejecutó:** ai-eval-runner, Gate 2.
- **Rama:** `feat/l1d-109-busqueda-hibrida-retrieval-mode`.
- **Veredicto:** PASS acotado (solo adapters falsos, sin LLM real).

## Qué se ejecutó

En worktrees aislados, `python -m app.evaluation.evaluate` con:

- `eval/configs/test-fake.yaml`
- `--suite aplicabilidad` (`eval/configs/test-aplicabilidad.yaml`)

## Resultado

- El JSON de la rama es idéntico al de `main` y a `data/evaluation/baseline.json`, ignorando solo la latencia. El `hashConfig` (`57b8a05d…`) coincide con el del baseline.
- Métricas: Δ = 0. El baseline de adapters falsos queda por debajo de las metas de fidelidad y citas; es el estado de `main`, no una regresión.

## Versiones sin cambio

| Elemento | Valor |
|---|---|
| Modelos | `fake-bow@1`, `fake-guion@1`, `fake-nli@1`, `fake-lexical@1` |
| Prompt | `rag-query@0.4.0` |
| Catálogo | `2026.10.0` |
| Corpus | `rel-fx-t5a-a-1` |
| Umbrales | relevance 0,3; NLI 0,7; topK 40; rerankTopN 10 |

Sin cambios en `data/`, `packages/clinical-catalogs`, prompts ni `eval/configs`. `settings.py` solo añade `retrieval_mode` (`dense` por defecto), `retrieval_fusion`, `rrf_k`, `hybrid_sparse_weight` y `population_max_values_per_criterion`.

## No ejecutado

- `integration-rag`.
- Corrida con LLM o embeddings reales.
- `RETRIEVAL_MODE=hibrida`.
- `rn23-fake`, `regression.yaml`, `metas-iniciales.yaml`.
- No se midieron recall@10, MRR, OCR, PII, eventos ni terminología.

## Avisos

- La rama arrastra L1D-291 (lista de población); la suite `aplicabilidad` no cubre ese camino nuevo.
- La medición `dense` vs `hibrida` es de L1D-245 (US-133).
