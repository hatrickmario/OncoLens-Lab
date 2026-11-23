# Design — l1d-333-reporte-h3

## Context

Residual de L1D-333 (US-275): falta el reporte H-3 (D6-60). No hay código que escribir. El runner con `proveedor: local`
toma `RERANKER_MAX_PAIRS` del entorno de ADR-39 (`modelos_locales.py`) y reporta el p95 de consulta completa en
`latencia_p95_ms.consulta`. `--suite all` no pasa contexto de caso, así que no ejerce la expansión contextual: esa parte
la mide la familia `contextual` de `l1d-329-segundo-loop-ac9-reporte`.

## Decisions

**D1 · Tres mediciones, un reporte.** `reports/eval/l1d-333-reporte-h3.md` resume y enlaza los JSON que el runner
produce:

| Medición | Comando | Responde |
|---|---|---|
| A · 20 pares | `--config eval/configs/s5-calibracion.yaml --suite all`, `RERANKER_MAX_PAIRS=20` | AC-2 (p95, muestra) y AC-4 (recall@10, MRR, «sin evidencia») |
| B · 12 pares | la misma, `RERANKER_MAX_PAIRS=12` | línea base del mismo día para AC-4 y para el costo de latencia |
| C · expansión | `--suite contextual` con `contextual-local.yaml` (activo) y `contextual-local-apagado.yaml` | AC-4 (adversarias y controles) |

Descartadas en una línea: un solo brazo de 20 pares comparado con las cifras del S6 (no tienen reporte) y un script
propio (prohibido por la regla del S7).

**D2 · El reporte no decide.** Compara y rotula (`no_validada`); no cambia valores por defecto. Si el p95 de A supera el
tope vigente de US-275 AC-3, se detiene y pregunta (regla de parada ya especificada).

**D3 · Condiciones escritas.** El reporte lleva fecha, máquina, versiones de modelo, catálogo, corpus y umbrales, huella
de la configuración, `RERANKER_MAX_PAIRS` de cada brazo y la declaración de máquina limpia. Si no se pudo garantizar,
lo dice como limitación en vez de omitirlo. El corpus es el dataset `s5-corpus-ampliado` en memoria en A, B y C, el
mismo que usa la familia `contextual` en la corrida base y en la final (`[S7 resp. 10]`). Los umbrales son los
actuales: ningún valor por defecto cambia entre la base y la final (`[S7 resp. 11]`), así que el reporte no necesita
medirse antes ni después de ninguna calibración.

**D4 · C puede reutilizar el informe de `l1d-329-segundo-loop-ac9-reporte`.** El brazo «indicador activo» de C es la
misma ejecución que su tarea 2.2; aquí solo se añade el brazo «apagado».

## Privacidad y ownership

Todo corre dentro de `rag-orchestrator` con corpus público con licencia, preguntas y casos sintéticos y modelos locales
(RN-12, RN-13). Ningún dato cruza web → clinical-api → rag-orchestrator; `rag-orchestrator` no toca datos clínicos ni
`clinical-minio`. El reporte lleva solo agregados e ids (RN-14).

## Contratos

Sin cambio de `openapi.yaml` ni de `contracts/examples/`. Compatible con ADR-26.

## Dependencias y colaboradores

No crea ni modifica módulos. Usa el runner (`app/evaluation/evaluate.py`), `eval/configs/s5-calibracion.yaml` y, de
`l1d-329-segundo-loop-ac9-reporte`, `eval/configs/contextual-local.yaml`. Ningún fake nuevo.

## Evaluación

No cambia modelo, prompt, umbral, catálogo ni corpus: mide los valores por defecto que ya están en `main`. Métricas de
OL-06 leídas: recall@10, MRR, «sin evidencia», p95 de consulta. Este change no adelanta ninguna cifra.

## Pendientes de definir

- **Brazo B (12 pares).** Cuesta una pasada más de `--suite all` en la corrida base. Sin él, el AC-4 solo puede
  compararse con cifras sin reporte. Propuesta: correrlo. Dueño: humano en `/sprint-start`.
- **Línea base del AC-2.** El AC cita «densa 14,7 s», medida con la máquina cargada y sin reporte (D6-45). Propuesta: la
  línea base del reporte es el brazo B del mismo día y el 14,7 s queda como antecedente. Dueño: humano.
- **Reutilizar la línea base de `l1d-119`** como medición A (misma configuración) o correrla aparte. Lo fija
  `/sprint-start` al ordenar la corrida base.
