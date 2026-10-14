# Pre-S1 · Estado de ejecución

> Lo mantiene `sprint-orchestrator` (`/sprint-run Pre-S1`). Plan: [`Pre-S1-plan.md`](Pre-S1-plan.md).
> Estados: `pendiente` → `en-curso` → `gate2` → `pr-listo` → `mergeado` · desvíos `bloqueado-gate`, `bloqueado-humano`, `movido-S<n+1>`.

| L1D | change | contexto | estado | rama | PR | gate2 | nota |
|---|---|---|---|---|---|---|---|
| L1D-55 | l1d-55-contract-schema-freeze | contratos → clinical-platform → ai-services (doc) | mergeado | feat/l1d-55-contract-schema-freeze (639fdb8) | #14 | v1 FAIL · v2 FAIL · re-ejecución acotada (resp. 41) PASS | Menores en el cuerpo del PR. Deuda S2: bundleDocument (resp. 35); brechas del Zod con US-214; formato de máscara con US-048 |
| L1D-50 | — (ADR-36) | ADR | mergeado | — | #10 | n/a | Sin change |
| L1D-51 | — (DEC-02) | DEC | mergeado | docs/pre-s1-decisiones | #13 | n/a | Sin change |
| L1D-52 | — (DEC-03) | DEC | mergeado | docs/pre-s1-decisiones | #13 | n/a | Sin change |
| L1D-53 | — (DEC-04) | DEC | mergeado | docs/pre-s1-decisiones | #13 | n/a | Sin change |
| L1D-54 | — (DEC-05) | DEC | mergeado | docs/pre-s1-decisiones | #13 | n/a | Validación del oncólogo pendiente antes de US-038 (Q-1); no bloquea US-033 |

## Registro

- 2026-10-12 · Inicio de la oleada 1 (única). L1D-55 → `en-curso`.
- 2026-10-12 · El implementador se cortó por el límite de uso (429) con los commits 1 (contract) y 2 (docs) locales, sin push; se reanuda el mismo implementador en su worktree desde el commit 3.
- 2026-10-12 · Implementación entregada (a8fb1b8, 9 commits, 210 tests). L1D-55 → `gate2` (vuelta 1).
- 2026-10-12 · Gate 2 vuelta 1: FAIL. Devuelto al implementador con los hallazgos que no requieren decisión; CK-2 (CaseView) se transcribe por AC-1. CK-4 (RagMeta/D10), CK-5 (Zod generado no estricto), bundler propio frente a D2 y las preguntas de privacidad y lenguaje se escalan al humano.
- 2026-10-12 · Segundo corte del implementador por el límite de uso (429) durante la ronda de correcciones, sin commits. Se reanuda con push incremental.
- 2026-10-13 · Tercer corte (límite semanal del modelo del implementador) sin commits; el WIP quedó con los tests en rojo. Se reanuda con la prioridad de dejar el primer bloque en verde y pushearlo.
- 2026-10-13 · Ronda de correcciones entregada (600932c, 10 commits, 258 tests, 0 vulnerabilidades). Quedan 3 correcciones bloqueadas por el hook TDD Guard y decisiones de diseño abiertas. L1D-55 → `bloqueado-humano`; devuelvo el control antes de re-gatear para no gastar la vuelta 2.
- 2026-10-13 · Decisiones humanas D-1…D-8 recibidas (resp. 30–37, commit 046ad7b). Deuda técnica S2: migrar lib/bundle.mjs a bundleDocument (resp. 35; la historia se crea en /sprint-close). Despacho: general-purpose para DPR-5, DPR-7 y PG-M2/M3/m7 con el guard desactivado (resp. 30); después, clinical-platform-dev para D-3…D-8.
- 2026-10-13 · Correcciones con el guard desactivado entregadas (5a5d7e9, 271 tests): DPR-5, DPR-7, PG-M2/M3/m7, con rojo y verde en el scratchpad (l1d55-out/). Reanudado clinical-platform-dev para D-3…D-8.
- 2026-10-13 · Cuarto corte del implementador (límite de sesión, se restablece a las 18:00 -05) a mitad de D-3…D-8, sin commits; WIP en los specs, 5 ejemplos y 2 parches. El usuario pregunta por el progreso real y el consumo de tokens: devuelvo el control sin reanudar.
- 2026-10-13 · Reanudación (nueva instancia del orquestador). Decisiones del usuario: terminar D-3…D-8 en el mismo worktree con commit y push por decisión; vuelta 2 del Gate 2 acotada a a8fb1b8..HEAD; sin tocar Linear. Despacho de clinical-platform-dev en el worktree agent-ad4d07288bc8bd9fb sobre el WIP.
- 2026-10-13 · clinical-platform-dev despachado en el worktree para D-3…D-8 (commit y push por decisión).
- 2026-10-13 · El implementador arranca aislado en su propio worktree y no puede escribir en el del WIP. Exporto el WIP como parche (/tmp/l1d55-wip/, sin tocar el worktree original) y lo reanudo: aplica el parche sobre origin/feat a 5a5d7e9 y pushea con HEAD:feat/l1d-55-contract-schema-freeze.
- 2026-10-13 · El worktree aislado del implementador se eliminó al devolver su primer reporte. Relanzo clinical-platform-dev con un worktree aislado nuevo: rama local desde origin/feat (5a5d7e9) + parche del WIP.
- 2026-10-13 · D-3…D-8 entregadas (14eb3fa…52d7dfe, 8 commits pusheados, 284 tests, contracts:check con 31 reglas, generate limpio, openspec validate --strict válido). Queda fuera la regla checkMaskedIdentity (D-7): el TDD Guard lee test.json del checkout principal, no del worktree, y la rechaza. tasks.md y proposal.md siguen hablando de RagMeta en /case/summary. L1D-55 → `bloqueado-humano`: pregunto antes de la vuelta 2 para no gastarla en dos hallazgos ya conocidos.
- 2026-10-13 · Decisiones del usuario: 1a (guard desactivado de forma puntual para checkMaskedIdentity, su test y su fixture), 2a (alinear tasks.md y proposal.md con D-3), 3 ok. Se registran como resp. 38–40. L1D-55 → `en-curso`. Despacho de general-purpose (sin TDD Guard, como en la resp. 30) para el D-7 pendiente, la alineación y el registro de las resp. 38–40.
- 2026-10-13 · resp. 38–40 aplicadas (783d46c test en rojo → c230ff3 feat, 4a60834, 2b2beba; 287 tests, generate limpio, openspec válido). L1D-55 → `gate2` (vuelta 2, la última, acotada a a8fb1b8..2b2beba).
- 2026-10-13 · Gate 2 v2 · contract-keeper: PASS (0 Bloqueantes, 0 Mayores, 2 Menores: M-1 Zod de CitedSource/FollowUpCitedSource abierto por allOf+unevaluatedProperties sin declarar en D6; M-2 sin ejemplo de PatientListItem).
- 2026-10-13 · Gate 2 v2 · clinical-language-auditor: PASS (0/0, 3 Menores + 1 observación; M-2 es Pregunta: valores de población ilustrativos en con-evidencia-s4.json).
- 2026-10-13 · Gate 2 v2 · privacy-guardian: FAIL (1 Mayor: scripts/contracts/lib/identity.mjs:64-65, originalFilename/fileName en NAME_ALLOWLIST apagan la detección de PG-M3 en Backend 2, regresión de 5c831df; 4 Menores y 1 Pregunta). Es la segunda vuelta: espero a design-principles-reviewer y escalo.
- 2026-10-13 · Gate 2 v2 · design-principles-reviewer: PASS con 1 Mayor (M-1: checkMaskedIdentity usa una lista literal propia, no IDENTIDAD_PII; coincide con el Menor #2 de privacy-guardian) y 9 Menores; residuo DPR-4 en design.md:721 y proposal.md:141. Veredicto global vuelta 2: FAIL. L1D-55 → `bloqueado-gate`; escalo al humano con 2 opciones.
- 2026-10-13 · Decisiones del usuario: resp. 41 (1a, corrección acotada fuera del límite, guard desactivado de forma puntual), resp. 42 (formato de máscara con US-048, ejemplo con US-213), resp. 43 (ampliar ya el chunkTextSnapshot de con-evidencia-s4.json). L1D-55 → `en-curso`. Despacho de general-purpose en un worktree aislado nuevo.
- 2026-10-13 · Corrección resp. 41–43 entregada (b6ad592…639fdb8, 12 commits, 297 tests, rojos de A/B/C en la aserción). Desviación: assertFollowUpContract.mjs y ac-13-llm-provider.json (PG #3) se editaron sin guard, fuera de la lista literal de la resp. 41. L1D-55 → `gate2` (re-ejecución acotada a 2b2beba..639fdb8: privacy-guardian, design-principles-reviewer, clinical-language-auditor solo sobre los ejemplos de evidencia).
- 2026-10-13 · Re-gate · clinical-language-auditor: PASS (M-2 cerrada; 1 Menor opcional: estado 'parcial' de estadio IIA vs 'I' lo decide la regla de aplicabilidad).
- 2026-10-13 · Re-gate · privacy-guardian: PASS (#1…#6 corregidos; 1 Menor: la prosa de data-model.md:1315 y readme.md:518 sigue pidiendo timeouts para rag_corpus que el SQL no fija).
- 2026-10-13 · Re-gate · design-principles-reviewer: PASS (M-1 cerrado, 3 Menores m-10…m-12). Veredicto global de la re-ejecución: PASS. PR #14 abierto. L1D-55 → `pr-listo`. Oleada 1 completa: pido el merge.
- 2026-10-13 · PR #14 mergeado (2026-10-13T19:59Z, a6c9c28; comprobado con git branch -r --merged y gh). L1D-55 → `mergeado`. Todas las historias del Pre-S1 están mergeadas: sprint listo para /sprint-close (Linear, archivo del change, historia de deuda de bundleDocument, limpieza de worktrees).
