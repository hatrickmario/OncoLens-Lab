# Design — l1d-236-calibracion-umbral-baseline

## Context

El runner de `l1d-235-suite-evaluate` ya calcula las métricas; ADR-39 dejó un modo `sin_evidencia`
y `retrieval_metrics.py` con IC. ADR-45: metas de recuperación provisionales; la prueba congelada
solo con `--prueba-final`. Re-estimación a 3 pts (P-1 pendiente).

## Goals / Non-Goals

**Goals:** barrido, umbral elegido en configuración, baseline por tipo de cáncer, p95 e2e, en/fuera
de meta. **Non-Goals:** metas definitivas (DEC-07), streaming.

## Decisions

- **D1 · Regla de elección del umbral** (fijada antes de medir): el valor de la grilla que maximiza la
  exactitud de "sin evidencia" con recall@10 no peor que el del umbral actual menos
  `THRESHOLD_RECALL_TOLERANCE` (configuración); empate → el valor más alto (más conservador frente a
  RN-02). Se calibra sobre desarrollo + validación de `ol06-particion-v1`, nunca sobre prueba.
  Alternativa descartada: maximizar F1 combinado (mezcla dos metas que DEC-07 fija por separado).
- **D2 · p95 e2e:** script de carga contra `clinical-api` en la red interna (reutiliza el subcomando
  `e2e` de `app/scripts/adr39/`), 3 corridas de ≥ 30 consultas, mediana.
- **D3 · Metas iniciales** en `eval/configs/metas-iniciales.yaml` (solo lectura para este change).

## Privacidad y ownership

Solo seed y datasets sintéticos; el p95 entra por `clinical-api`, que desidentifica (RN-11);
`rag-orchestrator` no toca datos clínicos. LLM local (RN-12). Reporte solo con agregados.

## Contratos

Sin cambios de `openapi.yaml` ni de `contracts/examples/`.

## Evaluación

Cambia un **umbral** (`RELEVANCE_THRESHOLD`) → OL-06 obligatoria: "sin evidencia" ≥ 0,90,
recall@10, MRR, fidelidad, precisión de citas; p95 ≤ 15 s (G-5).

## Dependencias y colaboradores

- **Crea:** `app/evaluation/barrido.py` con `elegir_umbral()` (RN-02, TBD-03),
  `marcar_frente_a_meta()`; `eval/reports/S1-baseline.md`.
- **Modifica:** configuración de `rag-orchestrator` (`RELEVANCE_THRESHOLD`,
  `RELEVANCE_THRESHOLD_GRID`), `data/evaluation/baseline.json`.

## Risks / Trade-offs

- Dataset pequeño → IC ancho; se reporta.
- Solape con ARR-03 AC-5 → una sola corrida compartida.

## Open Questions

- P-1 (re-estimación a 3) pendiente del usuario.
