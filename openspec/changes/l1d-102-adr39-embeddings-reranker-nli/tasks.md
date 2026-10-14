# Tasks — l1d-102-adr39-embeddings-reranker-nli

> Historia ADR (US-012 · ADR-39 fase A). TDD: **exento** para el ADR y la medición; **test
> después** para los scripts (validador del dataset, regla de selección, chequeo de configuración).
> Sin cambios de API: no hay sección `## contratos`.

## ai-services

- [ ] 1.1 Mini-dataset (exento; datos): crear `data/eval/adr39-mini/` con ≥ 30 preguntas sintéticas de mama y próstata (≥ 10 en español contra fuentes en inglés) etiquetadas contra los documentos de `data/raw/seed/manifest.yaml` (change de L1D-115), ≥ 30 pares afirmación–fragmento NLI (mismo idioma y mezcla es/en, con `entailment | neutral | contradiction`) y `manifest.yaml` con `clase: sintetico` y licencia por fuente; sin datos reales ni identificadores de paciente [US-012 AC-9] [RN-13] [RN-14] [RN-21]
- [ ] 1.2 Validador del dataset (test después): `app/evaluation/dataset_loader.py` rechaza un manifiesto sin `clase: sintetico` o con una fuente sin licencia aceptada y comprueba tamaños e idioma; tests Pytest `test_dataset_loader_*` con fixtures sintéticos, incluido `@pytest.mark.ac("US-012", 9)` [US-012 AC-9]
- [ ] 1.3 Regla de selección (test después): `app/evaluation/model_selection.py` con `descartar_por_restricciones()`, `desempatar_por_memoria()` y `seleccionar_componente()` (`sin_candidato` si la lista queda vacía); límites desde configuración (`STACK_MEMORY_LIMIT_GB`, `STAGE_P95_BUDGET_MS`, `ACADEMIC_LICENSES`); tests Pytest con mediciones fijas, `@pytest.mark.ac("US-012", 2|4|5)` [US-012 AC-2] [US-012 AC-4] [US-012 AC-5] [RN-22]
- [ ] 1.4 Script de medición (test después): `python -m app.scripts.adr39_measure --config eval/configs/adr39-fase-a.yaml` con 3 corridas y mediana, *warm-up* descartado, RSS máximo, p95 por etapa, recall@10/MRR (total y es → en) y exactitud NLI; reporte `reports/adr39/<fecha>-fase-a.json` solo con agregados y configuración; código ≠ 0 si un componente queda `sin_candidato`; test de humo con modelos falsos diminutos [US-012 AC-1] [US-012 AC-5]
- [ ] 1.5 Dependencias de medición (test después): fijar versiones de ONNX Runtime, `optimum`, `FlagEmbedding`/`sentence-transformers` y registrar su licencia; pesos en `MODEL_CACHE_DIR` (volumen), nunca en el repo
- [ ] 1.6 Medición (exento): verificar en la fuente revisión exacta, tamaño y licencia de cada candidato A, B y C; ejecutar el script en la imagen arm64 de `rag-orchestrator` (change de L1D-164) o en el contenedor provisional de design D2, con int8/ONNX y truncado del *reranker* [US-012 AC-1] [US-012 AC-2]
- [ ] 1.7 ADR (exento): escribir `docs/architecture/adr/ADR-39-modelos-locales.md` (MADR) con presupuesto de memoria y de p95 por etapa, tabla por candidato (memoria, p95, licencia, versión, métrica), descartes con motivo y cifra, desempates, componentes sin candidato escalados al usuario (G-5 / NFR-01), decisión por componente, nota del sparse para US-112, exactitud NLI por idioma y sección "Fase B" para el change de L1D-274; añadirlo a `docs/architecture/adr/README.md` [US-012 AC-1] [US-012 AC-2] [US-012 AC-4] [US-012 AC-5]
- [ ] 1.8 Configuración (test después): fijar en los *settings* y `.env.example` de `rag-orchestrator` `EMBEDDING_MODEL`, `EMBEDDING_MODEL_REVISION`, `EMBEDDING_DIM`, `SPARSE_VECTOR_SOURCE`, `RERANKER_MODEL`, `RERANKER_MODEL_REVISION`, `RERANKER_MAX_PAIRS`, `RERANKER_MAX_LENGTH`, `NLI_MODEL`, `NLI_MODEL_REVISION`, `MODEL_QUANTIZATION`, `MODEL_CACHE_DIR`; la configuración de tests mantiene `EMBEDDING_DIM=8`; `docs/architecture/data-model.md` no cambia [US-012 AC-3] [RN-22]
- [ ] 1.9 Chequeo de configuración (test después): `--check-config` compara la configuración con la decisión del ADR y falla si `EMBEDDING_DIM` o `SPARSE_VECTOR_SOURCE` faltan o difieren; test Pytest `@pytest.mark.ac("US-012", 3)`; avisar a los changes de L1D-114 (US-058) y L1D-115 (US-059) antes de indexar [US-012 AC-3]
- [ ] 1.10 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit refactor(L1D-102)

## evaluación

- [ ] 2.1 Revisión del reporte `reports/adr39/<fecha>-fase-a.json` por `ai-eval-runner` (metas OL-06 iniciales: recall@10 ≥ 0,80, ≥ 0,70 es → en, MRR ≥ 0,60) como evidencia del Gate 2; la suite `evaluate` completa llega con US-072

## Verificación

- [ ] 3.1 `openspec validate l1d-102-adr39-embeddings-reranker-nli --strict`
- [ ] 3.2 Tests de `apps/rag-orchestrator` en verde (Pytest) y escaneo de secretos/PII sobre `data/eval/adr39-mini/`
