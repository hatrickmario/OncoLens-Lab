# Proposal — l1d-305-rn23-voz-propia-nivel-b

## Trazabilidad

L1D-305 · US-249 · FEAT-T3 · Sprint 5 (O1, antes del G-Demo) · Estimación **3** · HU-03 · RN-23 (dueña) · AC-10.3, AC-T3.4 ·
M-10.2 · ARR-03 AC-2 · US-249 AC-1…AC-5 · Deuda **D4-01** (`backlog/sprints/S4-deuda.md`, deuda D7 de L1D-193) · absorbe el
**AC-2 de US-233a** (L1D-298) · Sprint: `backlog/sprints/S5-refinamiento.md`.

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-10-31)** en la historia y en `S4-deuda.md` (decisiones 1, 9, 11 y 13): D4-01 → US-249, antes del
  G-Demo; las formas «Se recomendaría», «Se aconseja» y «Considere iniciar» y el nivel B de `fx-rn23` (campo `rationale`,
  regla `b-recommend` mostrado) son su alcance; el AC-2 de L1D-298 (juez acotado con el generador real, **A+B bloqueante**)
  pasa a esta historia.
- **`S5-refinamiento.md` §2** (`[S5 resp. 3]`): US-249 está en la oleada O1 y en la lista de lo que **nunca** se recorta.
- **`S5-refinamiento.md` §5**: la suite `evaluate` con modelos locales (US-249 AC-4) se ejecuta en **una sola corrida
  nocturna al cierre del día 2**, junto con US-120 AC-5/AC-6, US-140, D4-21 y D4-30; no se lanza en horario de trabajo.
- **`S5-refinamiento.md` §3, «Lo que no se reabre»**: D-01 (análisis de evidencia, no recomendaciones) y RN-23.
- **D-12 `[S5 resp. 7]`**: PR **individual** (no de lote): cambia la política de lenguaje de RN-23, que revisa
  `clinical-language-auditor` como unidad.
- `[S1 resp. 15]`, `[S1 resp. 16]`, `[S1 resp. 33]`, `[S4 resp. 11]`: el filtro de producción aplica el nivel A sobre
  `CAMPOS_GENERADOS`, retira con el literal y descarta con `lenguaje_no_permitido`; este change amplía la lista y la
  política, no ese flujo.

## Dependencias

- ↪ **l1d-193-terminos-prohibidos-rn23** (US-068, archivado): lista versionada, verificador común Node/Python y casos de
  conformidad. Se amplían; no se rehacen.
- ↪ **l1d-295-afirmaciones-atomicas-por-papel** (US-245, archivado): afirmaciones por papel, marco de atribución y
  `lenguaje_no_permitido` como causa de descarte.
- ↪ **l1d-298-evaluate-modelos-locales** (US-233a, archivado): `proveedor: local`, juez acotado y métrica de lo mostrado
  por nivel; su escenario «AC-2 NO CUMPLIDA» se cierra aquí.
- ⛔ Ninguna dura entre changes del S5. Prerrequisito de **ejecución** de AC-4 (no de código): la corrida nocturna del día 2
  con Ollama y los pesos de ADR-39 en el MacBook de referencia.
- 🔗 Regresión [RN-23] → US-068 (los escenarios de `human-control` siguen vigentes) · 🔗 Medido en: US-072 (M-10.2 = 0).

## Por qué

Con el generador real, la corrida de L1D-298 mostró 1 salida prescriptiva (nivel B) y 6 en la propuesta cruda: el filtro de
producción solo aplica el nivel A, y las formas españolas en voz propia del modelo («Se recomendaría iniciar…», «Se
aconseja…», «Considere iniciar…») y la recomendación atribuida a una fuente («La guía recomienda…») llegan a la pantalla.
RN-23 exige que ninguna salida generada diga al oncólogo qué hacer (PP-1), y G-Demo no puede mostrar ese lenguaje.

## Qué cambia

- **Voz propia en el nivel A (AC-1, AC-3):** la lista `terminos-prohibidos.json` pasa a **1.6.0** con las formas de
  recomendación en condicional, impersonal con «se» e imperativo (`se recomendaría`, `se aconseja`, `considere iniciar` y sus
  variantes de número, género y negación), con `formas` y `excepciones` para no capturar usos descriptivos.
- **Recomendación atribuida en la salida generada (AC-2):** la lista declara qué reglas del nivel B (los prefijos de
  recomendación `b-recomend`, `b-recomiend`, `b-recommend`) se aplican también a `CAMPOS_GENERADOS`; el filtro de
  producción las aplica y las rechaza con `lenguaje_no_permitido`, salvo dentro de una **cita textual atribuida** («Según ‹fuente›: «…»», con enlace al fragmento)
  que aparece literalmente en un fragmento que la opción cita; la cita entre comillas sin atribución se rechaza
  (`[S5 resp. 11e]`). Tolerancia de falsos positivos `0` (Decidido, usuario, 2026-11-03).
- **Casos de conformidad (AC-3):** `fx-rn23` se amplía con casos positivos y negativos por forma y una suite de conformidad
  del filtro que nombra el caso que falla; `packages/clinical-language/conformidad/casos.json` recibe los nuevos términos
  para mantener la paridad Node/Python.
- **A+B bloqueante (AC-4):** la métrica `salida_mostrada_nivel_b` deja de ser informativa y bloquea en la CI (configuración
  `rn23-fake`, adapters falsos); con el generador real se mide en la corrida nocturna del día 2 y el reporte anota cuántas
  propuestas crudas corrigió el filtro.
- **Sin falsos positivos nuevos (AC-5):** la suite mide los rechazos de salidas legítimas con la lista 1.5.0 (línea base de
  US-068) y con la 1.6.0 sobre las mismas propuestas, con la tolerancia en configuración.

## Capacidades afectadas y bounded contexts

- `human-control`: MODIFIED «Lista versionada de términos prescriptivos prohibidos en dos niveles» (1.6.0 y subconjunto del
  nivel B para la salida generada); ADDED la conformidad por forma de la voz propia.
- `evidence-analysis`: ADDED el rechazo de la voz propia y de la recomendación atribuida en los campos generados, con la
  excepción de la cita textual atribuida.
- `ai-evaluation`: MODIFIED «Lenguaje no prescriptivo medido con el generador real» (A+B bloqueante; cierra el estado «AC-2 NO
  CUMPLIDA»); ADDED la regresión de falsos positivos frente a la línea base.
- Sin capacidad nueva.
- Contextos: **ai-services** (`apps/rag-orchestrator/app/domain`, `app/evaluation`, `eval/configs`, `data/eval/fx-rn23`,
  `scripts/eval`) y el catálogo compartido `packages/clinical-catalogs/lenguaje` con su verificador
  `packages/clinical-language` (cargador y casos de conformidad). Sin cambios en `clinical-api`, `web` ni contratos.

## Fuera de alcance

- **Contratos:** ningún cambio de `openapi.yaml` ni de `contracts/examples/` (contract-first, ADR-26): `discardReason =
  lenguaje_no_permitido`, `unsupportedClaims` y el literal de retiro ya existen.
- Cambiar el prompt `rag-query`, el modelo o los umbrales: aquí solo se amplía el filtro y se mide.
- Aplicar a la salida generada el resto del nivel B (`iniciar`, `administrar`, `standard of care`…): sigue siendo solo de
  textos propios y de medición (riesgo de falsos positivos, AC-5).
- Metas definitivas de OL-06 (DEC-07, S6) y el acuerdo juez↔humano (DEC-06, S6).
- Traza persistida del retiro (US-150, S6).
