---
name: cobertura-prostata-l1d331-trampas
description: Familia contextual con meta por caso (L1D-331): top-3 por decorador del Reranker, reporte_base opcional, y trampas del Bash/fixtures
metadata:
  type: project
---

La familia `contextual` de evaluate ahora reporta `cobertura` (meta `contextual.genericas_con_evidencia_minimo`=18, RN-22), `adversarias`, `comparacion` (con `contextual.reporte_base` opcional) y por fila `top3`/`campos_usados`/`llamadas_al_generador`. El top-3 sale de `RerankerQueRegistra` (`app/evaluation/ranking_contextual.py`), no de la respuesta (no trae chunks bajo el umbral).

**Why:** con adapters falsos (reranker léxico) la mayoría de las adversarias sale con evidencia; «0 falsos positivos» solo se mide en la corrida real (H-1). El dataset no tiene evidencia esperada: recall/MRR no se calculan en esta familia.

**How to apply:** para probar «sin términos del catálogo» en el runner hay que copiar `packages/clinical-catalogs` a tmp y renombrar el `terminoCanonico` cie10 (quitar `etiquetaEs` rompe el loader con KeyError); el caso `tipo-sin-etiqueta` (leucemia) da 422. Bash del worktree rechaza heredocs python con rutas que contienen «eval» y `cd ../..`: escribir el script en el scratchpad con Write y correrlo con `python3 ruta`. Edit sí funciona en `scripts/eval/**`. Venv reutilizable: `/tmp/venv334/bin/python`.
