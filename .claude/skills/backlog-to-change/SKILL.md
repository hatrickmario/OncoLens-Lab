---
name: backlog-to-change
description: Convierte una historia del backlog de OncoLens (L1D-<nn> / US-xxx en backlog/features) en un change de OpenSpec con /opsx:propose — nombre l1d-<nn>-<slug>, bloque de Trazabilidad, escenarios derivados de sus AC Given/When/Then, dependencias y tareas por bounded context. La usa /sprint-start por cada historia; también sirve a mano para una historia suelta.
argument-hint: "L1D-<nn>"
arguments: [issue]
---

# Historia → change de OpenSpec ($issue)

## 1. Reunir la historia

- `grep -rn "$issue" backlog/features/` → archivo de la Feature y sección `## US-xxx — …`.
  Lee la sección completa: Story, AC (con citas `[AC-xx.y]`, `[RN-xx]`, `(asumido)`), notas
  `Pendiente de definir en refinamiento`, Contexto técnico, Fixtures de la Feature, Non-goals,
  dependencias `⛔ / ↪ / 🔗`.
- Si el MCP de Linear está disponible, `get_issue` de `$issue` solo para comprobar estado y
  relaciones; si discrepa del Markdown, manda el Markdown y anota la discrepancia.
- Si la historia es `DEC-<nn>` o `ADR-<n>` (investigación, no desarrollo), **no** crees un change
  con código: crea uno con `skip_specs: true` en `.openspec.yaml` cuyo entregable es el registro
  de la decisión, o sáltala y repórtalo.

## 2. Nombre del change

`l1d-<nn>-<slug>`: `<nn>` = número del issue, `<slug>` = 2–5 palabras en kebab-case, en inglés o
español sin tildes (p. ej., `l1d-93-catalog-validation`). Comprueba que no exista ya
(`openspec list --json`, incluido `archive`).

## 3. Proponer

Invoca **/opsx:propose `<nombre>`** con esta semilla (las reglas de `openspec/config.yaml` se
inyectan solas; respétalas):

```
Trazabilidad: $issue · US-xxx · FEAT-xx · Sprint <n> · <FR/RN/AC-xx.y/M-xx.y citados>
Historia: <texto de la Story>
AC (fuente de los escenarios, uno o más escenarios por AC, conservando el tag [US-xxx AC-n]):
<lista literal de AC con sus citas>
Pendientes de refinamiento: <notas con dueño y 'afecta', o "ninguno">
Contexto técnico y fixtures: <resumen fiel, con rutas y FX-xx>
Dependencias: <⛔/↪ traducidas a nombres de change cuando existan>
Fuera de alcance: <Non-goals>
Bounded contexts: <clinical-platform | ai-services | frontend>
```

## 4. Comprobar el resultado

- `proposal.md` empieza con el bloque Trazabilidad.
- Cada `AC-n` de la historia tiene ≥1 `#### Scenario:` con su tag; ningún escenario sin AC.
- Los AC cuyo control llega en un sprint posterior aparecen como "Regresión [RN-xx] activa
  desde S<n>", no como escenario.
- `design.md` tiene `## Privacidad y ownership` y `## Contratos` (y `## Evaluación` si toca IA).
- `tasks.md` agrupa por bounded context y pone el test antes de la implementación.
- `openspec validate <nombre> --strict` en verde.

Devuelve: nombre del change, capacidades afectadas, contextos, dependencias y cualquier
`Pendiente de definir` que siga abierto (el humano lo verá en /sprint-start).
