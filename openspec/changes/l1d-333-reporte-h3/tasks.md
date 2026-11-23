# Tasks — l1d-333-reporte-h3

> Residual de L1D-333 (US-275): reporte H-3 (D6-60). **Sin código ni tests nuevos** (no hay `## contratos` ni tareas de
> implementación; `skip_specs: true`). Matriz TDD: todo es **evaluate** o **exento**. Requiere en `main`
> `l1d-329-segundo-loop-ac9-reporte` (familia `contextual`). Todo se cierra con la **corrida base** del S7.

## 1. ai-services

- [ ] 1.1 (exento) Antes de la corrida base: comprobar en `main` que `Settings`, `.env.example` y Compose siguen en
      `RERANKER_MAX_PAIRS=20` y `QUERY_CONTEXT_EXPANSION_ENABLED=true` (tests existentes `[US-275 AC-1]` en verde) y
      que `contextual-local.yaml` y `contextual-local-apagado.yaml` existen. Si no, detenerse y reportar.

## 2. evaluación

- [ ] 2.1 (suite `evaluate`) DIFERIDA -> H-1 (corrida base del S7). Mediciones A y B de `design.md` D1: `--suite all`
      con `s5-calibracion.yaml` y `RERANKER_MAX_PAIRS` en 20 y en 12, en la misma ventana y máquina limpia; una
      corrida real a la vez `[US-275 AC-2] [US-275 AC-4]`.
- [ ] 2.2 (suite `evaluate`) DIFERIDA -> H-1. Medición C: `--suite contextual` con `contextual-local.yaml`, indicador
      activo (se reutiliza el informe de `l1d-329-segundo-loop-ac9-reporte` si es de la misma corrida) y apagado
      (`contextual-local-apagado.yaml`)
      `[US-275 AC-4]`.
- [ ] 2.3 (suite `evaluate`) DIFERIDA -> H-1. `ai-eval-runner` escribe `reports/eval/l1d-333-reporte-h3.md` con los
      JSON enlazados: p95 de consulta de A, muestra y condiciones; recall@10, MRR y «sin evidencia» de A frente a B;
      adversarias y controles de C; limitaciones. Sin cifras del scratchpad. Registra el corpus (dataset
      `s5-corpus-ampliado` en memoria, `[S7 resp. 10]`) y los umbrales, que son los actuales (`[S7 resp. 11]`).
- [ ] 2.4 (exento) DIFERIDA -> H-1 (depende de 2.3). Leer la regla de parada de US-275 AC-3 con el p95 de A: si supera
      el tope vigente, **detenerse y preguntar** al orquestador y al usuario; no se cambia ningún valor por defecto.
      Si recall@10 o MRR de A son menores que los de B, o hay falsos positivos en adversarias, se reporta igual.

## 3. Verificación

- [ ] 3.1 (exento) El PR enlaza el reporte y no cita ninguna cifra que no esté en él; `openspec validate
      l1d-333-reporte-h3 --strict`; CI con 0 checks en fallo, 0 pendientes y 0 alertas antes de pedir el merge.

## humano

- [ ] H-1 DIFERIDA -> H-1: en la corrida base del S7 (`[S7 resp. 2]`), con la máquina sin otras cargas, un solo
  `ollama serve`, `OLLAMA_CONTEXT_LENGTH=8192` y sin swap, lanzar 2.1–2.3 con `ai-eval-runner` y versionar el reporte
  en `reports/eval/` (ruta protegida). Bloque literal (`modelos.env` y `adr39-config.sh` de ADR-39 en el entorno):

```bash
cd apps/rag-orchestrator
RERANKER_MAX_PAIRS=20 python -m app.evaluation.evaluate --config eval/configs/s5-calibracion.yaml \
  --suite all --salida ../../reports/eval --nombre-archivo l1d-333-reporte-h3.pares-20
RERANKER_MAX_PAIRS=12 python -m app.evaluation.evaluate --config eval/configs/s5-calibracion.yaml \
  --suite all --salida ../../reports/eval --nombre-archivo l1d-333-reporte-h3.pares-12
# C: el brazo activo es el informe de l1d-329; aquí solo el apagado
python -m app.evaluation.evaluate --config eval/configs/contextual-local-apagado.yaml \
  --suite contextual --salida ../../reports/eval --nombre-archivo l1d-333-reporte-h3.expansion-apagada
```

- [ ] H-2 DIFERIDA -> H-2: decidir en `/sprint-start S7` los «Pendientes de definir» de `design.md` (brazo de 12 pares,
  línea base del AC-2 y reutilizar la línea base de `l1d-119`).
