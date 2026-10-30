# Tasks — l1d-245-hibrida-vs-dense-misma-corrida

> Sin cambio de API: no hay `## contratos`. Un solo contexto: **ai-services**. Medición con la suite `evaluate` (no TDD de producto); la lógica de decisión (retroceso, diferencias, guarda de partición) sí lleva test. La corrida real es manual con modelos locales (US-233a); la CI usa adaptadores falsos.
>
> ⛔ Requiere **`l1d-109-busqueda-hibrida-retrieval-mode`** (US-112: `RETRIEVAL_MODE`, `RETRIEVAL_FUSION`, `RRF_K`, `HYBRID_SPARSE_WEIGHT`) y **l1d-298-evaluate-modelos-locales** (`proveedor: local`) mergeados antes de la tarea 3.2. ↪ l1d-235-suite-evaluate. Las tareas 1.x pueden avanzar con adaptadores falsos de recuperación *dense* y *sparse*, con tipos acordes al contrato de l1d-109 (`fusion` = `ninguna | rrf | ponderada`, `fusionParam` numérico, sin `null`).

## ai-services

- [ ] 1.1 Tests de aceptación en rojo AC-1…AC-5 (`… [US-133 AC-n]`, `@pytest.mark.ac("US-133", n)`): tres brazos en una corrida con diferencias frente a A0 (AC-1); retroceso fuera de tolerancia → marca y código ≠ 0 (AC-2); `meta.retrievalParams` coherente en el 100 % (AC-3); dos corridas idénticas con adapters falsos (AC-4); solo desarrollo, `golden_sha256` verificado y validación/prueba sin leer, con golden distinto abortando (AC-5) · integración con adapters falsos de *dense* y *sparse* · TDD estricto · commit `test(L1D-245)`; esqueleto solo si falta un símbolo
- [ ] 1.2 `app/evaluation/brazos_recuperacion.py`: `diferencia_frente_referencia()` y `marcar_retroceso()` (puras, tolerancia por parámetro; `null` ≠ `0.0`), un test unitario a la vez · TDD estricto · commit `feat(L1D-245)`
- [ ] 1.3 Cargador de dataset con `conjunto: desarrollo` y `verificar_golden_sha256()` sobre `particion.yaml`/`manifest.yaml` de `data/eval/ol06-particion-v1`; sin abrir validación ni prueba · TDD estricto · commit `feat(L1D-245)`
- [ ] 1.4 Runner multi-brazo en `corrida.py`/`config_suite.py`: brazos de configuración (`RETRIEVAL_MODE`, `RETRIEVAL_FUSION`, `RRF_K`, `HYBRID_SPARSE_WEIGHT`), coherencia con `retrievalMode`/`fusion`/`fusionParam`, mismo índice y modelos, `meta.retrievalParams` por consulta, reloj e IDs inyectados; AC-1, AC-3 y AC-4 en verde · TDD estricto · commit `feat(L1D-245)`
- [ ] 1.5 Reporte (`armado_reporte.py`/`reporte.py`): recall@10 total, es→en, MRR por brazo, diferencias frente a A0, bandera de retroceso, huella de configuración, por documento (P12); código de salida ≠ 0 con retroceso (AC-2); claves aditivas · TDD estricto · commit `feat(L1D-245)`
- [ ] 1.6 `RETRIEVAL_REGRESSION_TOLERANCE` en la configuración de la suite y en `.env.example` (lo aplica la sesión principal), sin default inventado (valor de la preinscripción) · test después (fixture de carga de config)
- [ ] 1.7 `eval/configs/s4-hibrida.yaml` (A0 `dense`; A2 `hibrida` + `rrf` + `RRF_K = 60`; A2b `hibrida` + `ponderada` + `HYBRID_SPARSE_WEIGHT = 0,3`; desarrollo, `proveedor: local`) y `eval/configs/s4-hibrida-fake.yaml` para CI/AC-4 · test después (fixture de carga de config)
- [ ] 1.8 Refactor: Extract Method / Inline Method en los archivos tocados, tests en verde antes y después, commit `refactor(L1D-245)`

## evaluación

- [ ] 3.1 Preinscripción ADR-45 P1 commiteada **antes** de la primera corrida real: hipótesis, brazos, hiperparámetros sin barrer, métrica primaria (acierto@10) y MRR secundaria, valor de `RETRIEVAL_REGRESSION_TOLERANCE`, regla de decisión · exento (documentación)
- [ ] 3.2 `run-ai-eval` / `ai-eval-runner` con modelos locales de US-233a (`ollama ps`, sin swap): `evaluate --config eval/configs/s4-hibrida.yaml`; reporte en `reports/eval/` adjunto al PR; con él se decide `RETRIEVAL_MODE` de la demo · evaluate
- [ ] 3.3 Registrar el resultado (sin retroceso → demo puede usar `hibrida`; con retroceso → sigue `dense`) en `design.md` de este change; adoptar la híbrida como definitiva queda para ADR-45 · exento (documentación)

## Cierre

- [ ] 4.1 `openspec validate l1d-245-hibrida-vs-dense-misma-corrida --strict`, Pytest de `rag-orchestrator` en verde (`-m "not models"` en CI), reporte de `run-ai-eval` adjunto
