---
name: run-ai-eval
description: Ejecuta la suite de evaluación de calidad de IA de OncoLens (OL-06) sobre una rama o sobre main y compara contra el baseline y las metas. Obligatoria cuando un change toca modelo, prompt, umbral, catálogo o corpus. Corre en el agente ai-eval-runner.
argument-hint: "<rama|main> [familia: retrieval|generation|ocr|pii|events|terminology|missing|all]"
arguments: [target, suite]
context: fork
agent: ai-eval-runner
background: false
---

Ejecuta la evaluación de IA de OncoLens sobre `$target`, familia `$suite` (si está vacía, `all`).

1. Prepara un worktree temporal de `origin/$target` (o usa `main` actualizado si `$target` es `main`).
2. Corre `npm run evaluate -- --suite $suite --report json` solo con datasets **sintéticos** de
   `data/evaluation/`. Si el script no existe, devuelve `NO-EJECUTABLE` indicando que lo crea
   FEAT-T5a.
3. Compara contra `data/evaluation/baseline.json` y las metas vigentes (TBD-02 / DEC-07).
4. Escribe `reports/eval/$target-$suite.md` y el JSON crudo al lado.
5. Devuelve el veredicto PASS | FAIL | NO-EJECUTABLE con la tabla de métricas, las regresiones y
   las versiones de modelo, prompt, catálogo, corpus y umbral.

No modifiques umbrales, prompts ni datasets para que la suite pase. Limpia el worktree al terminar.
