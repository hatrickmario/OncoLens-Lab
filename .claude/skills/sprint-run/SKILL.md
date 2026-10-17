---
name: sprint-run
description: Delega la fase de ejecución (días 1 a 8) de un sprint ya planificado en el agente sprint-orchestrator en segundo plano, y explica cómo reanudarlo tras cada merge. Se invoca solo a mano con /sprint-run S<n>, después de mergear el PR de /sprint-start.
argument-hint: "S<n> | Pre-S1"
arguments: [sprint]
disable-model-invocation: true
---

# /sprint-run $sprint

1. **Precondiciones:**
   - `git fetch origin` y `backlog/sprints/$sprint-plan.md` existe **en `origin/main`** con la
     aprobación registrada. Si no, detente: falta mergear el PR de `/sprint-start`.
   - `openspec list --json` muestra los changes del plan como activos.
   - `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` ≥ 3 (lo fija `.claude/settings.json`).

   - **Sprint de una sola historia:** no hace falta orquestador; propón al humano
     `/implement-story L1D-<nn>` desde la sesión principal (menos capas que reconstruir tras un corte).

2. **Lanza el orquestador** con la herramienta Agent:
   - `subagent_type: sprint-orchestrator`, `name: sprint-$sprint`, en segundo plano;
   - prompt: "Ejecuta el sprint $sprint según backlog/sprints/$sprint-plan.md. Estado en
     backlog/sprints/$sprint-status.md (créalo si no existe; si existe, reanuda). Mantén Linear
     sincronizado según tu sección «Sincronización con Linear»: In Progress al empezar el trabajo,
     In Review en pruebas/Gate 2/PR, de vuelta a In Progress si fallan las pruebas o aparece un bug,
     y Done cuando la historia esté completada (todos sus PR mergeados y los criterios de tu sección); /sprint-close
     la revisará a fondo y puede devolverla a In Review."
   - **Antes de lanzar o reanudar:** pide al orquestador reconciliar Linear con el status (si el status
     dice `en-curso` y el issue sigue en Backlog, pasarlo a In Progress).

3. **Dile al humano** cómo seguir, en este formato:
   - Verás los PRs `[L1D-nn]` a medida que pasen el Gate 2; el orquestador volverá aquí para
     pedirte los merges de cada oleada o ante una **situación crítica** (gate fallido dos veces,
     invariante RN, ambigüedad de la spec, cambio de alcance, seguridad o datos reales, bloqueo
     externo). En ese caso, entrevista al humano con `AskUserQuestion` usando las preguntas del
     orquestador, registra las respuestas en la historia (`Decidido (usuario, fecha)`) y reanúdalo.
   - Tras mergear, escribe p. ej. "mergeados L1D-93 y L1D-95" y reanudaré a `sprint-$sprint`
     con SendMessage. Si el orquestador ya no existe, vuelve a ejecutar `/sprint-run $sprint`:
     reanuda desde el archivo de estado.
   - Para ver el progreso: `backlog/sprints/$sprint-status.md`, `/tasks` o el tablero de Linear
     (In Progress = trabajo en curso; In Review = en pruebas, Gate 2 o PR; Done = historia completada y mergeada, que /sprint-close revisa a fondo y puede devolver a In Review).

4. Cuando el orquestador informe "Sprint listo para /sprint-close", propón `/sprint-close $sprint`.

Nunca hagas merge tú mismo ni pidas al orquestador que lo haga (`gh pr merge` está denegado).
