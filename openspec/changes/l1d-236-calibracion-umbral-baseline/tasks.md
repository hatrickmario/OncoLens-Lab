# Tasks — l1d-236-calibracion-umbral-baseline

> Barrido y reglas puras: **TDD estricto** con adapters falsos (orquestación); umbral y baseline:
> **evaluate**; configuración: **test después**. Sin cambios de API.

## 1. ai-services

- [ ] 1.1 Test de aceptación en rojo "muestra cada valor y fija el elegido en configuración cuando se
      barre la grilla con FX-T5a-a [US-073 AC-1]" · integración (Pytest), commit test(L1D-236) ·
      **estricto**
- [ ] 1.2 Implementar `--sweep relevance_threshold` y extraer `elegir_umbral()` (RN-02, D1);
      unitarios uno a uno; commit feat(L1D-236) · **estricto** `[US-073 AC-1]`
- [ ] 1.3 Test en rojo "marca cada métrica en meta o fuera de meta sin tocar las metas [US-073 AC-4]" /
      "anota p95 > 15 s como insumo de ADR-42 [US-073 AC-3]" y extraer `marcar_frente_a_meta()` ·
      **estricto**
- [ ] 1.4 **[HUMANO]** Baseline real: barrido con los modelos de ADR-39, métricas por tipo de cáncer y
      p95 e2e contra Compose (3 corridas, mediana); `eval/reports/S1-baseline.md` y
      `data/evaluation/baseline.json` · **evaluate** `[US-073 AC-2]`
- [ ] 1.5 Fijar `RELEVANCE_THRESHOLD` y `RELEVANCE_THRESHOLD_GRID` en la configuración versionada;
      `.env.example` lo aplica el orquestador; test de configuración · **test después** `[RN-22]`
- [ ] 1.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de
      comportamiento, tests en verde antes y después, commit refactor(L1D-236)

## 2. evaluación

- [ ] 2.1 `run-ai-eval` `--suite all` sobre la rama (cambia un umbral) · **evaluate**

## 3. Verificación

- [ ] 3.1 `openspec validate l1d-236-calibracion-umbral-baseline --strict` en verde
- [ ] 3.2 Tests de `rag-orchestrator` en verde; sin `contracts:verify-provider`
