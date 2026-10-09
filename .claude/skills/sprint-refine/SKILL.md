---
name: sprint-refine
description: Fases 1 a 3 de un sprint de OncoLens, en la sesión principal y antes de /sprint-start — refinamiento hasta cumplir la Definition of Ready (decisiones y ADRs del sprint, propuestas con exploración de agentes solo donde revertir es caro, entrevista al humano y registro de sus respuestas, ajuste del slicing si hace falta), revisión del stack y preparación de la máquina, y diseño UI/UX en docs/ux/ (flujo E2E y sistema de diseño en el Pre-S1; variantes solo para pantallas con riesgo de UX nuevo). Se invoca solo a mano con /sprint-refine S<n> o /sprint-refine Pre-S1.
argument-hint: "S<n> | Pre-S1"
arguments: [sprint]
disable-model-invocation: true
---

# /sprint-refine $sprint · fases 1 a 3

Corres en la **sesión principal**, porque aquí se decide y se entrevista. No escribes código de
producto ni creas changes de OpenSpec (eso es `/sprint-start`). La exploración pesada va a
subagentes. Todo lo que el humano decida queda **escrito en el repo**: lo que solo está en el chat
no lo ven los agentes de la fase 4.

**Pre-S1:** sus historias son las decisiones mismas (DEC-02…DEC-05, ADR-36), así que la fase 1 es
casi todo el sprint. Orden: **DEC-05 primero** (bloquea el esquema de US-033), luego DEC-04 y DEC-02,
ADR-36 (puede cerrar en el S1) y **DEC-03 al final** (capacidad para el planning del S1). La fase 3
del Pre-S1 va **antes** de congelar el contrato: si el diseño pide un dato que el contrato no tiene,
se corrige en US-033, no después.

## Fase 1 · Refinamiento

### 1.1 Historias y Definition of Ready

Trae del proyecto `OncoLens-1` las historias del milestone (`Sprint <n>` o `Pre-S1`, sin las de label
`Feature`) y cruza cada una con su Markdown (`grep -rl "L1D-<nn>" backlog/features/`). **El
Markdown es la fuente.** Evalúa cada historia contra la **Definition of Ready**:

| Criterio | Cumple si… |
|---|---|
| Sin refinamiento pendiente | No tiene `needs-refinement` ni `refinar-en-planning`, o su supuesto está aceptado por escrito |
| AC verificables | Cada AC es Given/When/Then con resultado observable, y el tipo de test sale de la matriz de TDD de `CLAUDE.md` |
| Dependencias | Sus `⛔` están resueltas o tienen escenario más probable aceptado |
| Decisiones | Ningún `Pendiente de definir` sin decidir, o con el escenario más probable aceptado |
| Estimación | Tiene puntos; ninguno `?` |
| Diseño (si toca UI) | Su pantalla tiene referencia en `docs/ux/` (fase 3) |

Muestra la tabla `L1D · US · criterio que falla · qué falta`. Lo que falla alimenta 1.2 y 1.3.

### 1.2 Decisiones y ADRs del sprint

Por cada ADR o DEC del sprint y cada `Pendiente de definir` que bloquea:

- **Caro de revertir** (cambia contrato, esquema, modelos, datos o privacidad, licencias o infra, o
  revertirlo costaría más de una historia): lanza en paralelo subagentes de exploración (`Explore`
  para el repo, `general-purpose` para investigación externa, `architecture-advisor` para el
  encuadre) y presenta **3 propuestas** con criterios, la **recomendada** y **por qué se descartan
  las otras dos**.
- **Barato de revertir:** **una recomendación** y las alternativas descartadas en dos líneas.

Nunca reabras el encuadre (D-01, B-01…B-15) ni propongas opciones que violen una RN. La decisión es
del humano. Regístrala así:
- ADR → `docs/architecture/adr/ADR-<n>-<slug>.md` (contexto, opciones, decisión, consecuencias);
- DEC o pendiente → en la historia: `> **Decidido (usuario, AAAA-MM-DD):** …`;
- marca la historia resuelta en `backlog/02-adrs.md`.

### 1.3 Entrevista hasta la claridad

Si tras 1.1 y 1.2 quedan dudas, **entrevista al humano** con `AskUserQuestion` (hasta 4 preguntas por
llamada, con tu recomendación como primera opción), en rondas, hasta que cada historia cumpla la
DoR. Pregunta solo lo que cambia lo que se construye; no preguntes lo que dicen el PRD o el backlog.
Registra cada respuesta en la historia (`Decidido (usuario, fecha)`) y numerada en el informe
(`[$sprint resp. n]`), para que los AC y los agentes puedan citarla.

### 1.4 Ajuste del slicing (solo si hace falta)

Si la capacidad (DEC-03) o las respuestas obligan a cambiar el alcance: propón el cambio con su
impacto en puntos y en la demo del sprint, y **pide aprobación explícita**. Con el sí: primero el
Markdown (la Feature, `backlog/features/README.md` y `## Conflictos de fuentes`), después Linear
(con confirmación). Nunca muevas una historia del camino crítico de G-Piloto (S6) sin decirlo.

## Fase 2 · Stack técnico

- Lista lo que las historias del sprint necesitan y no está listo: herramientas, versiones,
  servicios (Docker, Ollama o vLLM y modelos candidatos de ADR-39, `tdd-guard` en el S1, MCPs).
- **En la máquina** (fuera del repo): da los comandos de instalación y pide confirmación antes de
  ejecutar cada uno.
- **En el repo** (dependencias de npm o pip, configuración): no se instalan aquí; van como tarea de
  la historia que las usa, dentro de su change (el hook `require-active-change` lo exige).
- Una mejora del stack solo si es **estrictamente necesaria**, como propuesta de ADR con 1.2.

## Fase 3 · UI/UX

Diseños con **datos sintéticos** y el encuadre clínico: encabezado "Opciones descritas en la
evidencia", aviso RN-19, orden por aplicabilidad visible (RN-28), citas verificables (RN-01) y
avisos que no bloquean (RN-26). Usa la skill de diseño o de artifacts disponible, o Figma si está
conectado.

- **Pre-S1:** el flujo **E2E completo con énfasis en el happy path** (login → listado → ficha →
  vista de caso → faltantes → análisis → opción con cita → revisión), con sus estados (cargando,
  vacío, error, sin evidencia, desactualizado, `403`). Presenta **3 direcciones visuales**, recomienda
  una y, con la elegida, deja:
  - `docs/ux/flujo-e2e.md`: pantallas en orden, estados, textos y el dato del contrato que muestra
    cada elemento;
  - `docs/ux/sistema-de-diseno.md`: tokens (color, tipografía, espaciado), componentes base sobre
    shadcn/ui y patrones de los avisos;
  - `docs/ux/prototipo/`: el prototipo navegable (o su enlace, si vive fuera del repo).
- **Sprints siguientes:** solo las pantallas que el sprint crea o cambia, en `docs/ux/$sprint/`,
  coherentes con el sistema del Pre-S1. **3 variantes solo si la pantalla tiene riesgo de UX
  nuevo** (panel de análisis, vista de caso, faltantes y revisión, aplicabilidad con hasta 3
  opciones); si extiende un patrón ya resuelto, un solo diseño.

Antes de pedir la elección del humano, revisa cada diseño con:
- `clinical-language-auditor` en modo **Diseño** (textos, encabezado, avisos, orden);
- `design:accessibility-review` si está instalada (WCAG 2.1 AA, teclado, texto además del color);
- **contrato:** cada dato mostrado existe en `openapi.yaml` o en el esquema; si no, es una pregunta
  para 1.3 (en el Pre-S1, un cambio a US-033 antes de congelarlo).

## Salida y cierre de la fase

Escribe `backlog/sprints/$sprint-refinamiento.md` con: tabla de DoR (todo ✓ o excepción aceptada),
decisiones y ADRs con enlace, respuestas numeradas, cambios de slicing aprobados, preparación del
stack hecha o pendiente, y diseños elegidos con su ruta en `docs/ux/`.

Pide confirmación y entonces: rama `sprint/$sprint-refinement`, commit (`[$sprint] Refinamiento:
DoR, decisiones y diseño`, con atribución), push y PR. **El humano lo mergea** y después ejecuta
`/sprint-start $sprint`, que exige este archivo en `main`.

## Reglas

- Ningún dato real ni identificador de paciente en diseños, respuestas ni Linear (RN-13, RN-14).
- No cambies el alcance ni Linear sin aprobación explícita.
- No crees changes de OpenSpec ni escribas código de producto.
