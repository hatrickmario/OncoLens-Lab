---
name: implement-story
description: Lleva una historia de OncoLens (un change de OpenSpec) de punta a punta — despacha el implementador de su bounded context, corre el Gate 2 con los guardianes que apliquen, reintenta como máximo dos veces y deja el PR listo sin mergear. La usa sprint-orchestrator por cada historia; también puede invocarse a mano con /implement-story L1D-<nn> para una historia suelta.
argument-hint: "L1D-<nn> [change]"
---

# Implementar una historia

Entrada: `L1D-<nn>` y, si se conoce, el nombre del change (`l1d-<nn>-<slug>`). Si falta,
búscalo en `openspec list --json` o en `backlog/sprints/*-plan.md`.

## 1. Preparar el encargo

- `openspec show <change>`; lee `proposal.md` (Trazabilidad, dependencias, contextos) y las
  secciones de `tasks.md`.
- Ubica la historia: `grep -rl "L1D-<nn>" backlog/features/`.
- Recoge los **deltas de los changes de los que depende** que aún no están archivados
  (`openspec/changes/<dep>/specs/**`): el implementador los necesita porque `openspec/specs/`
  no los refleja hasta el cierre del sprint.
- Bounded context por sección de `tasks.md`:
  `## clinical-platform` → `clinical-platform-dev` · `## ai-services` → `ai-services-dev` ·
  `## frontend` → `frontend-dev`. `## contratos` va con el dueño del endpoint.

## 2. Despachar

Una llamada a Agent por bounded context, en este orden si hay varios: **proveedor del contrato**
(quien es dueño del `openapi.yaml` que cambia; hace primero su commit `contract(L1D-<nn>)`) →
consumidores, sobre la **misma rama** `feat/l1d-<nn>-<slug>`. Prompt mínimo:

```
Change: <change> · Historia: L1D-<nn> (<ruta backlog>) · Rama: feat/l1d-<nn>-<slug>
Tus tareas: sección '## <contexto>' de tasks.md
Deltas de dependencias: <rutas>
Paths permitidos: <lista>
Auto-revisión: antes de entregar, repasa los checklists de <guardianes que aplicarán> sobre tu diff.
Cortes: push tras cada commit; si te detienes con trabajo sin terminar, commitea en wip/l1d-<nn> y pushea.
Disciplina: matriz de TDD proporcional de CLAUDE.md (indica cuál aplica a cada tarea).
Orden: contract (si toca API) → test de aceptación del AC en rojo → feat (con sus unitarios) → refactor.
Termina con: test de aceptación por AC con tag 'US-xxx AC-n' y su salida en rojo y en verde,
contracts:verify-provider, openspec validate --strict, /opsx:verify, push.
```

## 3. Gate 2

Skill `gate-review` en modo `gate2` sobre la rama. Si es FAIL: reanuda al mismo implementador
con los hallazgos exactos (SendMessage a su nombre o id; si ya no existe, uno nuevo desde
`origin/feat/…` o `origin/wip/l1d-<nn>`). Máximo **2 vueltas**; la vuelta 2 es acotada a los
guardianes que fallaron y al diff nuevo. A la tercera, estado `bloqueado-gate` y escalar al humano
con los hallazgos y dos opciones. Los Menores no se escalan: van al cuerpo del PR.

Si el Gate 2 pasa pero `design-principles-reviewer` reporta hallazgos **Mayores**, reanuda al
implementador para que aplique cada refactor mínimo en su commit `refactor(L1D-<nn>)` y vuelve a
lanzar solo ese revisor. Si la historia cierra un **lote de revisión** del plan, ejecuta también
`gate-review` en modo `lote` y resuelve sus hallazgos en esta misma rama.

**Tras integrar `origin/main` en la rama** (merge, nunca cherry-pick) y antes del push, el implementador ejecuta los mismos comandos que los jobs de `.github/workflows/ci.yml` que su diff puede tocar (`build-test`, `contracts`, `quality`, `lint-lenguaje`, `stack-smoke` si cambia Compose) y, abierto el PR, comprueba las alertas con la ref `refs/pull/<n>/head` (lección del S1: rojos de `build-test`, `stack-smoke` y `fixtures` que el implementador no vio al integrar).

## 4. PR

Con el Gate 2 en PASS: `gh pr create --base main --head <rama> --title "[L1D-<nn>] <título>"`.
Cuerpo: change de OpenSpec, bloque Trazabilidad, tabla de veredictos del Gate 2, métricas de
evaluación (si hubo), tests añadidos por AC, y al final la línea
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
**Nunca** mergear ni archivar el change: el merge es humano y el archivo es en `/sprint-close`.

**Controles de GitHub en 0 errores antes de informar (obligatorio).** Publicar el PR no es
terminar: los controles (CI, CodeQL / code scanning, secret-scan, data-scan, fixtures,
`ci-ok`, comentarios de `github-advanced-security`) tardan segundos o minutos. Tras abrir el
PR, y tras **cada** push posterior:

1. Espera a que terminen: `gh pr checks <n> --watch` (o repite `gh pr checks <n>` hasta que no
   quede ninguno pendiente).
2. Lee las alertas: `gh api repos/{owner}/{repo}/pulls/<n>/comments` (bot
   `github-advanced-security`) y `gh api "repos/{owner}/{repo}/code-scanning/alerts?ref=refs/pull/<n>/head&state=open"`.
3. Si algo falla, lee el log (`gh run view <run> --job <job> --log-failed`) y reanuda al
   implementador con el error exacto. Estas vueltas **no** cuentan como vueltas del Gate 2,
   pero ante la misma causa dos veces, escala. Nunca desactives un control, edites la
   allowlist del escáner ni descartes una alerta a mano para ponerlo en verde.
4. Solo con **0 checks en fallo, 0 pendientes y 0 alertas abiertas** marca `pr-listo` e informa.
   Si no puedes llegar a 0 (p. ej. rojo heredado de `main`), no digas «listo»: informa del
   control, su causa y la decisión humana que falta.

## 5. Estado

Si corres dentro de un sprint, actualiza la fila de la historia en `backlog/sprints/S<n>-status.md`
en cada transición (`en-curso → gate2 → pr-listo`).
