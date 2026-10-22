# Tasks — l1d-232-adr41-framework-evaluacion

> Historia de ADR (US-014 · ADR-41). Matriz TDD: **exento** (documento). Sin código de producto ni
> cambios de API. Encuadre decidido en P-3 (`[S2 resp. 3]`).

## 1. ai-services

- [x] 1.1 Inventario de la base existente (`app/evaluation/`, `tests/evaluation/`, datasets y
      partición de ADR-45) y verificación en la fuente de ragas 0.4.3 y DeepEval 4.3.1 (telemetría,
      juez por defecto) · **exento** `[US-014 AC-1]` `[US-014 AC-3]`
- [x] 1.2 Redactar `docs/architecture/adr/ADR-41-evaluacion-ia.md` (MADR): opciones D1, juez D2,
      lista local cerrada en código y aborto con dataset no `sintetico` (D2), tabla de métricas D3
      (prescriptivas: `CAMPOS_GENERADOS`, A+B, `permitirFrases: false`, cruda y mostrada),
      reproducibilidad D4, reporte y DoD D5, test sin red D6 (en 072a), claves de configuración; estado `propuesto` · **exento** `[US-014 AC-1…AC-5]`
- [x] 1.3 Fila de ADR-41 en `docs/architecture/adr/README.md` y marca en `backlog/02-adrs.md` (al
      implementarse) · **exento**

## 2. evaluación

- [x] 2.1 Revisión del ADR por `ai-eval-runner` (coherencia con `run-ai-eval`) · **exento** _(verificado 2026-10-22: CI de main verde en 11dc5cc8 y openspec validate --strict ok)_

## 3. Verificación

- [x] 3.1 `openspec validate l1d-232-adr41-framework-evaluacion --strict` en verde
- [x] 3.2 Sin tests de contexto ni `contracts:verify-provider` (solo documento)
