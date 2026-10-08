---
name: sprint-start
description: Abre un sprint de OncoLens en la sesión principal — trae las historias del sprint desde Linear, verifica que no queden changes del sprint previo, crea un change de OpenSpec por historia, corre el Gate 1 en lote con los guardianes, arma el grafo de dependencias y pide al humano aprobar el orden y el paralelismo. Se invoca solo a mano con /sprint-start S<n>.
argument-hint: "S<n> (p. ej., S4)"
arguments: [sprint]
disable-model-invocation: true
---

# /sprint-start $sprint

Corres en la **sesión principal**: aquí ocurren las decisiones humanas. Los pasos pesados se
delegan a subagentes de nivel 1 para no llenar este contexto. No escribas código de producto.

## 0. Precondiciones (si una falla, detente y dilo)

- `openspec --version` ≥ 1.14 y perfil extendido (`/opsx:verify` y `/opsx:bulk-archive` disponibles).
- `gh auth status` correcto (lo necesita el orquestador para abrir PRs).
- `git status` limpio y en `main` actualizado (`git pull --ff-only`).
- MCP de Linear conectado (proyecto `OncoLens-1`, equipo `L1D`).
- `grep -q 'PRD v1.3' CLAUDE.md` (si el PRD cambió de versión, avisar antes de seguir).

## 1. Historias del sprint (Linear MCP)

- `list_issues` del proyecto `OncoLens-1` con milestone `Sprint <n>` (o `Pre-S1`), sin las de
  label `Feature` (padres). Incluye estado, estimación, relaciones `blockedBy`/`blocks`, labels.
- Cruza cada issue con su historia en Markdown: `grep -rl "L1D-<nn>" backlog/features/`.
  **El Markdown es la fuente** (AC, fixtures, contexto técnico); Linear es el espejo.
- Si el sprint incluye historias `si-hay-capacidad`, pregunta cuáles entran.
- Muestra: tabla `L1D · US · título · estimación · Feature · bounded context probable`, y los
  puntos totales frente a la capacidad (TBD-19, DEC-03).

## 2. Changes abiertos del sprint previo

`openspec list --json`. Todo change activo que no pertenezca a este sprint:
- si su historia quedó `movido-S<n>` en el status del sprint anterior, entra a este sprint;
- si no, **detente**: el sprint anterior no se cerró. Propón `/sprint-close S<n-1>`.

## 3. Un change por historia (backlog-to-change)

Lanza un subagente `general-purpose` por historia (máximo 5 en paralelo, en primer plano, **sin
worktree**: los changes deben quedar en este checkout). Cada uno ejecuta la skill
`backlog-to-change` con `L1D-<nn>` y devuelve el nombre del change y su trazabilidad.
Agrupa 2–3 historias en un change solo si comparten endpoint y el humano lo aprueba.
Al final: `openspec validate --changes --strict` en verde.

## 4. Gate 1 en lote

Ejecuta la skill `gate-review` en modo `gate1` con **todos** los changes del sprint: los tres
guardianes (`privacy-guardian`, `contract-keeper`, `clinical-language-auditor`) revisan cada uno
el lote completo en paralelo, lo que deja ver contradicciones entre historias.
- Hallazgos Bloqueante/Mayor → corrige los artefactos con **/opsx:update `<change>`** (o un
  subagente por change) y repite el Gate 1 **solo** sobre los changes corregidos. Máximo 2 vueltas.
- Las **Preguntas** de los guardianes van al humano en el paso 6.

## 5. Grafo de dependencias y oleadas

Fuentes: bloques `⛔/↪` de cada `proposal.md`, relaciones de Linear y deltas que modifican el
mismo requisito (dos changes sobre el mismo requisito → secuenciales o un aviso de conflicto
para el bulk-archive). Construye oleadas topológicas y asigna bounded context por las secciones
de `tasks.md`. Paralelismo por defecto: 3 historias a la vez, nunca dos sobre el mismo módulo.

Escribe `backlog/sprints/S<n>-plan.md` con:
- tabla `L1D · US · change · contexto · oleada · depende de · estimación`;
- grafo en Mermaid (`flowchart LR`, p. ej. `C --> B --> E`);
- reporte consolidado del Gate 1 (veredicto por guardián y cambios hechos);
- preguntas abiertas con dueño.

## 6. Aprobación humana (obligatoria)

Con `AskUserQuestion` pide aprobar: (a) el orden por oleadas, (b) qué se paraleliza y el máximo
simultáneo, (c) las respuestas a las Preguntas del Gate 1, (d) historias `si-hay-capacidad`.
Sin un sí explícito, no hay paso 7. Registra la aprobación (fecha y quién) en el plan.

## 7. Publicar el plan

Pide confirmación y entonces: rama `sprint/S<n>-planning`, commit de `openspec/changes/*` y
`backlog/sprints/S<n>-plan.md` (`[S<n>] Planificación: <k> changes`, con atribución), push y PR.
Los worktrees de los implementadores salen de `main`: **el humano debe mergear este PR antes de
`/sprint-run S<n>`**. Termina diciéndolo así.
