---
name: sprint-close
description: Cierra un sprint de OncoLens en la sesión principal — controla que cada change tenga tareas completas y PR mergeado (lo demás pasa al siguiente sprint sin archivarse), corre /opsx:verify global sobre main, ejecuta /opsx:bulk-archive resolviendo conflictos, lanza traceability-auditor, prepara la demo y la retro, y pide al humano cerrar. Se invoca solo a mano con /sprint-close S<n>.
argument-hint: "S<n>"
arguments: [sprint]
disable-model-invocation: true
---

# /sprint-close $sprint

Corres en la **sesión principal**. El cierre es una decisión humana: tú preparas todo y pides
el sí.

## 1. Control

`git fetch origin && git checkout main && git pull --ff-only`. Para cada fila de
`backlog/sprints/$sprint-status.md`:
- **Entra al archivo** si: todas las tareas de `tasks.md` están `[x]` en `main`, el PR
  `[L1D-nn]` está mergeado y `openspec validate <change> --strict` pasa.
- **Pasa al siguiente sprint** (no se archiva) en cualquier otro caso: márcalo `movido-S<n+1>`
  con el motivo, y también a los changes que dependen de él.
Muestra la tabla de ambos grupos antes de seguir.

## 2. Verificación global sobre main

Ejecuta **/opsx:verify** para cada change del grupo a archivar, ya sobre `main` con todo
integrado, más la suite completa (`npm test` en la raíz y `pytest` en rag-orchestrator) y,
si el sprint tocó modelo/prompt/umbral/catálogo/corpus, la skill `run-ai-eval` con la suite
completa. Esto detecta regresiones **entre** historias que el Gate 2 por historia no ve.
Una regresión → historia de corrección en este sprint o `movido-S<n+1>`; decide el humano.

## 3. Archivo en bloque

Rama `sprint/$sprint-close`. Ejecuta **/opsx:bulk-archive** solo con los changes del grupo a
archivar. Si dos deltas modifican el mismo requisito (p. ej., A y C sobre "Origen del dato" en
`clinical-data`), propón la fusión que conserve ambos comportamientos citando los dos changes y
**pide aprobación** antes de aplicarla. Después: `openspec validate --specs --strict` en verde.

## 4. Trazabilidad

Lanza `traceability-auditor` (nivel 1) con el sprint, el plan, el status y la lista de changes
archivados. Devuelve: `backlog/03-trazabilidad.md` regenerado, `backlog/sprints/$sprint-trazabilidad.md`,
huecos priorizados ("AC-04.3 sin escenario", "RN-26 sin test") y estados actualizados en Linear.
Los huecos Bloqueantes se convierten en historias para el siguiente sprint (propuesta, no creación).

## 5. Demo y retro

- **Demo (slicing v2, PRD §14):** guion paso a paso del recorrido del sprint con **datos
  sintéticos** sobre Compose, con los AC de G-Demo/G-Piloto que el sprint acerca. Si es el S5,
  checklist de **G-Demo**; si es el S6, checklist de **G-Piloto** con la skill `preflight-real-data`.
- **Retro:** tiempos por historia, vueltas de Gate 2 por guardián, falsos positivos y reglas
  que faltaron. Hallazgos de `design-principles-reviewer` por principio (SOLID/CUPID) y
  prioridad (P1/P2/P3), refactors aplicados frente a deuda técnica propuesta, y qué violación P1
  se repitió: si se repite, propón una regla nueva en `config.yaml` o en el linter. Propón
  cambios concretos a `openspec/config.yaml` (rules), a los agentes o a los hooks, como diff, **sin aplicarlos** hasta que el humano los apruebe.
Escribe todo en `backlog/sprints/$sprint-cierre.md`.

## 6. Cierre (humano)

Pide con `AskUserQuestion` la aprobación de: changes archivados y movidos, fusiones de
conflictos, cambios propuestos por la retro. Con el sí: commit en `sprint/$sprint-close`
(`[$sprint] Cierre: archivo, trazabilidad y retro`, con atribución), push y PR. El sprint queda
cerrado cuando el humano mergea ese PR; el milestone de Linear lo cierra el humano.
