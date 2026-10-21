# Tasks — l1d-236-calibracion-umbral-baseline

> Barrido y reglas puras: **TDD estricto** con adapters falsos (orquestación); umbral y baseline:
> **evaluate**; configuración: **test después**. Sin cambios de API.

## 1. ai-services

- [x] 1.1 Test de aceptación en rojo "muestra cada valor y fija el elegido en configuración cuando se
      barre la grilla con FX-T5a-a [US-073 AC-1]" · integración (Pytest), commit test(L1D-236) ·
      **estricto**
- [x] 1.2 Implementar `--sweep relevance_threshold` y extraer `elegir_umbral()` (RN-02, D1);
      unitarios uno a uno; commit feat(L1D-236) · **estricto** `[US-073 AC-1]`
- [x] 1.3 Test en rojo "marca cada métrica en meta o fuera de meta sin tocar las metas [US-073 AC-4]" /
      "anota p95 > 15 s como insumo de ADR-42 [US-073 AC-3]" y extraer `marcar_frente_a_meta()` ·
      **estricto**
- [x] 1.4 **[HUMANO]** Baseline real: barrido con los modelos de ADR-39, métricas por tipo de cáncer y
      p95 e2e contra Compose (3 corridas, mediana); `eval/reports/S1-baseline.md` y
      `data/evaluation/baseline.json` · **evaluate** `[US-073 AC-2]`
      **DIFERIDA** (NO-EJECUTABLE en este entorno: `proveedor: local` aún no se cablea en `componer_servicio`, no hay
      Compose de `clinical-api` ni reranker/NLI locales). El mecanismo y el procedimiento exacto están en
      `eval/reports/S1-baseline.md` §4; ID destino propuesto **L1D-279 (ARR-03 AC-5)**, que ya mide lo mismo
      (una sola corrida compartida), a confirmar por el orquestador. Sin cifras inventadas.
- [x] 1.5 Fijar `RELEVANCE_THRESHOLD` y `RELEVANCE_THRESHOLD_GRID` en la configuración versionada;
      `.env.example` lo aplica el orquestador; test de configuración · **test después** `[RN-22]`
      **PARCIAL**: hecho `RELEVANCE_THRESHOLD_GRID` (`barrido.relevance_threshold_grid`) y la tolerancia en
      `eval/configs/test-fake.yaml` con `tests/evaluation/test_barrido_configuracion.py`. **Diferido** (mismo ID
      destino que 1.4): el valor real de `RELEVANCE_THRESHOLD` (sale del barrido con modelos reales; el de los
      adapters falsos no se aplica) y `app/config/settings.py` (fuera de los paths de este change). Vigente: 0.30.
- [x] 1.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de
      comportamiento, tests en verde antes y después, commit refactor(L1D-236)

## 2. evaluación

- [x] 2.1 `run-ai-eval` `--suite all` sobre la rama (cambia un umbral) · **evaluate**

## 3. Verificación

- [x] 3.1 `openspec validate l1d-236-calibracion-umbral-baseline --strict` en verde
- [x] 3.2 Tests de `rag-orchestrator` en verde; sin `contracts:verify-provider`
