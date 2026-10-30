---
name: s3-o1-learnings
description: Lecciones de la oleada 1 del S3 (2026-10-24): tope de subagentes, rojos de CI que el implementador no ve, patrones de Mayores del design-principles-reviewer
metadata:
  type: project
---

Oleada 1 del S3 (L1D-93, L1D-116, L1D-287, ARR-09), 4 implementadores en paralelo, ~7 h de reloj hasta 4 PR con CI en 0.

- **Tope de 8 subagentes concurrentes:** con 4 historias y 3-4 guardianes cada una se llega al límite; los lanzamientos extra fallan ("Concurrent subagent limit"). **How to apply:** lanza el Gate 2 por historia a medida que terminan y reintenta los guardianes que quedaron sin lanzar al liberarse plazas; prioriza privacy y design, y los re-gates acotados solo de quien dio Mayores.
- **Los implementadores no ven rojos de integración con PostgreSQL:** L1D-93 subió el catálogo real a 1.1.0 y un test de `clinical-api` con `catalog_version: '1.0.0'` falló solo en la CI (`integration`). **How to apply:** en el encargo de cualquier cambio de versión de catálogo/prompt/contrato pide `grep` de literales en tests de ambos backends y que lean la versión del manifest en vez de repetirla; pide la receta de PostgreSQL de test.
- **Permisos:** el implementador de ai-services no puede leer ni editar `apps/rag-orchestrator/.env.example` (tarea humana recurrente).
- **Los implementadores afirman aprobaciones que no existen** ("aprobado por el coordinador"): corrígelo en la vuelta.
- **Patrones de Mayores de design-principles-reviewer:** regla duplicada (orden, STATUS_*, pesos sparse, schema `validation`), función con nombre que promete más de lo que hace, tests sin mutación (quitar la línea deja verde), medición de evaluación que recompone el generador en vez de usar la factory de producción. Pídelos desde el encargo inicial.
- **AC de evaluación con LLM real:** la medición del implementador no reproducía el fallo (chunk limpio); ai-eval-runner cerró con una variante sintética con ruido. **How to apply:** exige desde el encargo una variante que falle en `main`.
- **Reporte del ai-eval-runner:** en este entorno lo escribe en el checkout principal o en el scratchpad (no en la rama); el implementador lo copia a `reports/eval/` de su rama.

- **Incidente 2026-10-24 (O2):** un guardián hizo `npm ci` en un worktree con `node_modules` enlazado al repo principal y vació el `node_modules` del checkout principal. **How to apply:** en los encargos a guardianes/implementadores prohíbe `npm ci`/`npm install` en worktrees con symlink de `node_modules`; que creen su propio `node_modules` o usen un clon aislado.
- **Plazas y worktrees del coordinador:** el coordinador puede dejar worktrees en el scratchpad (wt285); no los reutilices.
