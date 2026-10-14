---
name: pre-s1-learnings
description: Lo aprendido al ejecutar el Pre-S1 (L1D-55, congelación de contratos): fallos del Gate 2, TDD Guard (retirado), tiempos y cortes por límite de uso
metadata:
  type: project
---

Lecciones del Pre-S1 (2026-10-12, change l1d-55-contract-schema-freeze, un solo implementador clinical-platform-dev para todas las secciones):

- **TDD Guard se retiró en el cierre del Pre-S1 (2026-10-13, P-7):** bloqueaba scripts "test después", en los worktrees leía el `test.json` del checkout principal, el implementador lo esquivó (`.txt` + `mv`) y no dejó datos medibles. La evidencia de TDD es el orden `test → feat` en el Gate 2.
  **How to apply:** igualmente, prohíbe en cada encargo esquivar hooks: si uno bloquea, el implementador se detiene y reporta.

- **Los cortes por límite de uso son frecuentes** (4 en L1D-55, uno de ellos semanal). Pide siempre commit y push por bloque desde el primer encargo.
- **El usuario mide el progreso en Linear y le preocupa el consumo de tokens** (2026-10-13: "van 2 días consumiendo el límite y no hay avance en Linear").
  **Why:** desde el cierre del Pre-S1 (P-4) el estado lo mueve la integración GitHub–Linear por la rama `feat/l1d-<nn>-…` y el PR; el orquestador no toca Linear.
  **How to apply:** pushea la rama pronto (así la historia pasa a In Progress) e informa del progreso en cada devolución de control: commits, AC cubiertos y lo que falta. El Gate 2 desde la vuelta 2 es acotado al diff nuevo.
- **Hallazgos recurrentes del Gate 2 en las reglas de contratos:** la detección de identidad con regex anclados no parte camelCase; hay listas duplicadas entre reglas (código muerto que parece la fuente); el bundler propio falla abierto; se versionó un `.pyc` (falta `__pycache__` en `.gitignore`); hay vulnerabilidades transitivas en las devDependencies (`npm audit`).
  **How to apply:** pide estos puntos en el encargo inicial de cualquier historia de reglas o scripts.
- **El implementador amplía el contrato más allá de design.md** (p. ej., un `RagMeta` superset) y luego contract-keeper lo marca como decisión humana. Pide en el encargo que toda adición fuera del design se reporte **antes** de commitearla.
- **Tiempos:** la implementación de US-033 (10 pts) llevó unos 13 min de agente y 108 llamadas, más un corte por límite de uso (429). Reanudar al mismo agente con SendMessage conservó su trabajo local. Cada guardián del Gate 2 tardó de 3 a 7 min en paralelo.
- **Evitar gastar las 2 vueltas del Gate 2:** cuando los hallazgos mezclan arreglos objetivos y decisiones humanas, aplica primero los arreglos, pregunta y re-gatea una sola vez con todo dentro.
- **clinical-platform-dev siempre arranca en un worktree aislado nuevo** (2026-10-13): no puede escribir ni correr git en el worktree de otra instancia, y si devuelve el control sin cambios su worktree se borra. Desde el cierre del Pre-S1 (P-9) el WIP sin terminar se commitea y pushea en `wip/l1d-<nn>`, nunca en /tmp, y la reanudación parte de `origin/feat/…` o `origin/wip/l1d-<nn>`.
  **How to apply:** nunca pidas a un implementador "trabaja en el worktree X"; pide push tras cada commit.
- **Cuando el implementador termina con un hueco conocido** (regla bloqueada, artefactos desfasados fuera de sus paths), pregunta al humano ANTES de la última vuelta del Gate 2: si no, se gasta en hallazgos que ya conoces.
- **Tiempos de D-3…D-8 (L1D-55):** unos 20 min y 185 llamadas para 8 commits; son ediciones de contrato y reglas de los scripts.
- **Las correcciones de un hallazgo pueden reabrir otro** (L1D-55, vuelta 2): para que `assertExamplesSynthetic` dejara de exigir nombres sintéticos en los nombres de archivo, se metieron `originalFilename`/`fileName` en la lista blanca de identidad. Eso apagó la detección de PG-M3 en Backend 2. Además, una regla nueva (checkMaskedIdentity) volvió a duplicar una lista de identidad en lugar de reutilizar `IDENTIDAD_PII`, y la marcaron dos guardianes.
  **How to apply:** en el encargo de correcciones de reglas de contratos, exige que (1) toda excepción a una lista blanca venga con una fixture que pruebe que la regla sigue detectando el caso original, y (2) toda regla de identidad reutilice `IDENTIDAD_PII`/`matchesIdentity`.
- **Resultado final de L1D-55 (2026-10-13):** 50 commits y 3 rondas de gate (v1 FAIL, v2 FAIL, re-ejecución acotada PASS autorizada como resp. 41), PR #14. Re-gatear acotado al diff nuevo con sondas de mutación de los guardianes funcionó bien: de 1 a 4 min por guardián.
  **How to apply:** cuando el humano autorice una vuelta extra, re-ejecuta solo los guardianes con Mayores pendientes, más el que toque un archivo nuevo de su dominio.
