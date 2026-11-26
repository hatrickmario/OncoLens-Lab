---
name: brazos-pares-reescritura-l1d335b-trampas
description: L1D-335 entrega 2 - brazos de pares y reescritura de la suite evaluate (DB-4), reescritura efectiva medida en el puerto y trampas del arnés
metadata:
  type: project
---

`composicion_suite.py` ya compone el reescritor SOLO para un brazo (`brazo is not None`); las demás familias (`brazo=None`) siguen sin reescritura. `Observaciones.reescritura_esperada` se fija aun sin reescritor para que `corrida_brazos.exigir_reescritura_del_brazo` aborte en vez de medir sin reescribir. Con el reranker falso de `s7-*-fake` el largo es en PALABRAS: sin `RERANKER_MAX_LENGTH` no hay ninguna consulta `sin_evidencia` y los tests de reescritura no ven invocaciones.

**Why:** el brazo de 30 pares con el modelo real exige `BgeReranker.variante(max_pairs)` (infra, fuera de los paths de la tarea): el adapter real rechaza más candidatos que su tope.

**How to apply:** `parafrasis` del informe tiene forma fija en un test (`{"pares","recuperadas"}`): lo nuevo va en `parafrasis_atribuidas`, `reescritura` y `adopcion`. `tests/evaluation/test_chat_evaluate_indice.py` fabrica `PuertosLocales` con `SimpleNamespace`: cualquier campo nuevo del dataclass lo rompe. `ruff check .` tiene 2 F401 previas en `tests/integration/test_rag_query_contextual.py`. El Bash del worktree rechaza heredocs con varias redirecciones pero acepta `python3 - <<'EOF'` solo; pytest completo tarda más de 2 min: lanzarlo con run_in_background.
