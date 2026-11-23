# Tasks — l1d-329-segundo-loop-ac9-reporte

> Residual de L1D-329 (US-271): AC-9, su test y su reporte (D6-33). Va tras `l1d-334` (mismos archivos del runner) y
> **antes de la corrida base** del S7. Orden de los archivos de la suite (propuesta de planificación): `l1d-334` → este
> change → `l1d-331` (código) → `l1d-336` → `l1d-335` → `l1d-337`. Corpus: dataset `s5-corpus-ampliado` en memoria, el
> mismo en base y final (`[S7 resp. 10]`); umbrales actuales (`[S7 resp. 11]`). Sin cambios de API (no hay `## contratos`) ni de producción. Matriz TDD: la
> orquestación de la suite y la regla de la causa → **TDD estricto** con adaptadores falsos; configuración → **test
> después**; las cifras → **evaluate** en la corrida base. Rama `feat/l1d-329-segundo-loop-ac9-reporte`.

## 1. ai-services

- [ ] 1.1 (TDD estricto) Test de aceptación en rojo: «cada pregunta de sinónimos supera el umbral o queda con su causa
      cuando corre la familia contextual con adaptadores falsos [US-271 AC-9]» · integración del runner con
      `contextual-fake.yaml` en `tests/evaluation/test_contextual_aceptacion.py`, `@pytest.mark.ac("US-271", 9)`; tres
      preguntas (pasa, `termino_ausente_del_corpus`, `bajo_umbral_con_termino_en_corpus`), `null` (nunca `0.0`) en
      `top_relevance_score` y `causa`, y reproducibilidad byte a byte. Esqueletos con `raise NotImplementedError`.
      Commit `test(L1D-329)`.
- [ ] 1.2 (TDD estricto) Tests de aceptación en rojo del resto del requisito: recuentos por clase y `segundo_loop`
      con el indicador en `true` y en `false` `[US-271 AC-2] [US-271 AC-4] [US-275 AC-4]`; término fuera del catálogo y
      dataset no sintético terminan con código ≠ 0; el informe no contiene el texto de ninguna pregunta, chunk ni
      término del caso `[US-271 AC-6]`. Commit `test(L1D-329)`.
- [ ] 1.3 (TDD estricto) `metricas/contextual.py`: `causa_de_sinonimo()` y `recuentos_por_clase()`; unitarios uno a la
      vez. Las formas del término son **todos** los textos de `sinonimos[]` del término y salen de un único punto,
      `formas_del_termino()`, sobre el cargador de sinónimos existente (sin duplicar la normalización). Test de guarda:
      «cuenta como forma cada texto de sinonimos[] del término [US-271 AC-9]» (queda en rojo si el cargador pasa a
      devolver solo equivalentes; `l1d-335` lo repunta, design D4).
- [ ] 1.4 (TDD estricto) `config_contextual.py`, `corrida_contextual.py` y la familia `contextual` en
      `config_suite.py`, `evaluate.py` y `esquema_suite.py` (fuera de `all`); `eval/configs/contextual-fake.yaml` y
      `contextual-local.yaml` (indicador activo; casos `mama-completo` y `prostata-con-grado`, design D5; `l1d-331`
      añade el tercero) y `contextual-local-apagado.yaml` (mismo contenido con
      `expansion_habilitada: false`, para el brazo de `l1d-333-reporte-h3`); configuración por defecto en `scripts/eval/evaluate.mjs` con su test. Reloj y generador
      de seudónimos inyectados. El informe registra el corpus de la corrida (ruta del dataset, versión y recuento de
      chunks), la versión del catálogo y los umbrales (`[S7 resp. 10]`, `[S7 resp. 11]`). Commit `feat(L1D-329)` cuando
      1.1 y 1.2 pasan.
- [ ] 1.5 (test después) Humo del proceso real: `node scripts/eval/evaluate.mjs --suite contextual` sale con 0 y
      escribe el informe en un directorio temporal; tiempo máximo explícito del test (60 s).
- [ ] 1.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en
      verde antes y después, commit `refactor(L1D-329)`.

## 2. evaluación

- [ ] 2.1 (suite `evaluate`) `run-ai-eval` con adaptadores falsos: `--suite all` da el mismo
      `data/evaluation/baseline.json` y la misma huella de `test-fake.yaml`; `--suite contextual` con
      `contextual-fake.yaml` sale con 0.
- [ ] 2.2 (suite `evaluate`) DIFERIDA -> H-1 (corrida base del S7). `evaluate --config
      eval/configs/contextual-local.yaml --suite contextual` con los modelos locales de ADR-39; lo corre
      `ai-eval-runner` y el informe queda en `reports/eval/l1d-329-segundo-loop-ac9-reporte.{json,md}`. Ninguna cifra
      se cita antes de ese informe.
- [ ] 2.3 (exento) DIFERIDA -> H-1 (depende del informe de 2.2). Anotar en el PR, con enlace al informe: las 3 preguntas
      de sinónimos con `supero_umbral` o su causa, y las genéricas sin evidencia. Sin cambiar umbral, sinónimos ni
      valores por defecto. Si alguna queda en `bajo_umbral_con_termino_en_corpus`, se remite al informe de `l1d-334`.
      Se anota la limitación de CTX-C13 (design, «Risks»): su causa puede cambiar en la corrida final por el catálogo
      de `l1d-335` (S-4), no por la recuperación.

## 3. Verificación

- [ ] 3.1 Pytest de `tests/evaluation` y la suite de `apps/rag-orchestrator` en verde; `ruff` y `lint-imports`
      limpios; `openspec validate l1d-329-segundo-loop-ac9-reporte --strict`. `contracts:verify-provider` no aplica.
- [ ] 3.2 CI del PR con 0 checks en fallo, 0 pendientes y 0 alertas antes de pedir el merge.

## humano

- [ ] H-1 DIFERIDA -> H-1: en la corrida base del S7 (`[S7 resp. 2]`), con un solo `ollama serve`,
  `OLLAMA_CONTEXT_LENGTH=8192` y sin swap, lanzar la medición 2.2 con `ai-eval-runner` y versionar el informe en
  `reports/eval/` (ruta protegida). Bloque literal:

```bash
cd apps/rag-orchestrator && python -m app.evaluation.evaluate \
  --config eval/configs/contextual-local.yaml --suite contextual --salida ../../reports/eval \
  --nombre-archivo l1d-329-segundo-loop-ac9-reporte
```

- [ ] H-2 DIFERIDA -> H-2: aprobar con el plan del S7 los casos de la corrida real (`design.md` D5: `mama-completo`,
  `prostata-con-grado` y, por `l1d-331`, `prostata-con-psa-y-hrr`). El corpus ya está decidido (`[S7 resp. 10]`).
