# S6 · Auditoría de trazabilidad

> `traceability-auditor` · `/sprint-close S6` · 2026-11-13 · rama `sprint/S6-close` sobre `main` c02247a0. Incluye los 23 changes archivados el 2026-11-13 (`openspec/changes/archive/2026-11-13-*`, sin commit todavía), con sus deltas fusionados en `openspec/specs/`.
> - `openspec validate --specs --strict`: 32/32.
> - `openspec validate --changes --strict`: 7/7.
> - Capabilities nuevas: `chat-conversation`, `patient-chat` y `opt-out` (S6), más `demo-gate` (del archivo de `l1d-248` del 2026-11-06).
>
> Insumos: [`S6-plan.md`](S6-plan.md) (no hay `S6-status.md`), [`S6-refinamiento.md`](S6-refinamiento.md), [`S6-deuda.md`](S6-deuda.md) (D6-01…D6-66), `docs/process/definition-of-done.md` («Historia cerrada»), `backlog/features/*.md`, `docs/PRD.md` v1.4 §17–§18, los PR #342…#406, *code scanning*, Dependabot y Linear (OncoLens-1, hito «Sprint 6»).
>
> La matriz completa se regeneró en [`../03-trazabilidad.md`](../03-trazabilidad.md). Para eso se reimplementó el método del S4 y el S5 en un script. Sobre la base del S5 (`ebdbf3a4`) el script reproduce los conteos por familia, salvo M (18 frente a 19). Los conteos por ID difieren en un ±3 % típico.
>
> Las decisiones ya tomadas no cuentan como huecos nuevos: los traslados con ID destino (D6-xx, H-n), el recorte de L1D-326 al mínimo crítico `[S6 resp. 25]`, la corrida nocturna opcional `[S6 resp. 22]` y la sustitución del formulario de una pregunta por el chat `[S6 resp. 20]`. Esto último retiró, entre otros, el requisito «Continuar con aviso envía `continueWithWarning`».
>
> **Evaluación real del S6:** solo hubo la «corrida final» de L1D-333 (D6-57…D6-61). Dio una fidelidad NLI de 0,822, por debajo de la meta de 0,90. Las métricas del chat con modelos reales no se midieron (D6-59). **No hay ningún reporte del S6 en `reports/eval/`** (D6-60).

## 1. Resumen del sprint

**Criterio de Done.** Se aplica la «Historia cerrada» de la DoD:
- AC verificados.
- CI en verde: 0 fallos, 0 pendientes y **0 alertas**.
- PR mergeado.
- `tasks.md` conciliado: cada tarea en `[x]` con evidencia, o con su ID destino.
- Change archivado.

**CI y alertas:**
- La CI de `main` está en verde en c02247a0 (`CI` y `E2E`).
- *Code scanning*: 0 alertas abiertas.
- **Dependabot: 2 alertas abiertas.**
  - **#9**: `langgraph` 1.2.10, GHSA-3fx2-cqw9-xr3c, severidad media, corregida en 1.2.14. Se creó a las 20:49:36 del 2026-11-06, un minuto después del merge de #362 (L1D-316). La consecuencia es que **L1D-316 vuelve a In Review**.
  - **#8**: `minimatch` 10.2.6, transitiva de desarrollo vía `@typescript-eslint`. La versión está en el *lockfile* desde el 2026-10-22, así que no es atribuible a una historia del S6.
- El vigilante de PR (`.claude/hooks/vigilar-pr.sh`) solo lee *code scanning*. Por eso «0 alertas» se anotó en verde en #362.

**Cierre:** 18 de las 24 historias comprometidas están cerradas (**75 %**, meta ≥ 80 %), y 62 de 83 puntos (**74,7 %**).

Si se triagea la alerta #9 (*bump* a 1.2.14 o descarte justificado), L1D-316 vuelve a Done: **19/24 (79,2 %)** y **67/83 pts (80,7 %)**.

Las que no cierran:
- L1D-316 (5): alerta #9.
- L1D-213 (5): AC-8 de UI sin implementar.
- L1D-329 (4): AC-9 sin verificar.
- L1D-326 (3): AC-4 y la mitad de próstata del AC-1 sin hacer.
- L1D-331 (2): el AC-2 medido no cumple.
- L1D-333 (2): AC-2 y AC-4 sin reporte versionado.

**Fuera del compromiso:**
- Los 7 changes `movido-S6` (L1D-113, 116, 119, 126, 205, 246 y 299) siguen activos, porque la corrida N no se ejecutó.
- DEC-07 (L1D-234) no se decide.
- Siguen pendientes las firmas DEC-01 (L1D-92) y DEC-11 (L1D-125).

### Cadena por historia

Formato de la columna AC: «AC con escenario en `openspec/specs/` · AC con test con su tag (n.º de tests)». El total de tareas cuenta las `[x]` sobre el total; todas las que siguen abiertas tienen ID destino.

| L1D | US | Change (tareas) | AC (esc. · test) | FR · RN · AC/M del PRD | PR | Linear (antes → después) |
|---|---|---|---|---|---|---|
| L1D-108 | US-057 | `2026-11-13-l1d-108-prompt-instrucciones-datos` (12/13; 3.1 → D6-50) | 5/5 · 5/5 (9) | RN-01, SEG-13 | #359 | In Review → **Done** |
| L1D-266 | US-216 | `2026-11-13-l1d-266-cabeceras-seguridad-web` (12/13; H-1 en #360) | 5/5 · 5/5 (26) | RN-01, 04, 14, 22 · SEG-01, SEG-12 | #358 | Done → Done |
| L1D-327 | US-270 | `2026-11-13-l1d-327-log-corte-reranker` (10/11; H-1 en #360) | 4/4 · 4/4 (4) | RN-10, 14, 22 | #356 | Done → Done |
| L1D-314 | US-257 | `2026-11-13-l1d-314-spike-assistant-ui` (13/13; *spike* sin deltas) | 0/7 · 0/7: *spike* exento, AC verificados en `docs/evidence/S6-spike-assistant-ui/` y ADR-51 §8 | RN-19, 23 · SEG-12 | #357 | Done → Done |
| L1D-313 | US-256 · ADR-51 | sin change (registro) | AC-1…AC-4 documentales, verificados | RN-06, 10, 11, 12, 22, 24 | #357 (§8) | Backlog → **Done** |
| L1D-316 | US-259 | `2026-11-13-l1d-316-chat-turn-langgraph` (32/33; H-1 en #360) | 8/8 · 8/8 (12) | RN-04, 10, 11, 22, 24 · SEG-13 | #362 | Done → **In Review** (Dependabot #9) |
| L1D-315 | US-258 | `2026-11-13-l1d-315-conversacion-paciente` (19/20; H-1 en #364) | 8/8 · 8/8 (32) | RN-06, 10, 11, 12, 15, 18, 19, 22 · AC-T1.4 | #366 | Done → Done |
| L1D-204 | US-050 | `2026-11-13-l1d-204-llm-local-sin-nube` (15/17; 3.5 y 3.6 → L1D-315, cumplidas) | 5/5 · 5/5 (16) | FR-09 · RN-12 · SEG-05 · AC-06.1 | #365 | Done → Done |
| L1D-317 | US-260 | `2026-11-13-l1d-317-chat-caso-situacion` (20/20) | 7/7 · 7/7 (9) | FR-21 · RN-01, 06, 07, 10, 11, 12, 15, 19, 23 · AC-02.1, 02.4, 02.5, 02.6, AC-T1.2 | #367 | Done → Done |
| L1D-318 | US-261 | `2026-11-13-l1d-318-chat-examen-tratamiento-periodo` (18/18) | 5/5 · 5/5 (7) | FR-21 · RN-01, 11, 19 · AC-02.1, 02.3, AC-T1.2 | #371 | Done → Done |
| L1D-319 | US-262 | `2026-11-13-l1d-319-chat-contradicciones` (15/15) | 5/5 · 5/5 (8) | RN-07, 08, 26 · AC-02.6, AC-T3.2 | #376 | Done → Done |
| L1D-320 | US-263 | `2026-11-13-l1d-320-faltantes-tipo-vacio` (22/22) | 7/7 · 7/7 (16) | FR-23 · RN-22, 26, 29 · AC-04.1, 04.4, 04.5 | #369 | Done → Done |
| L1D-321 | US-264 | `2026-11-13-l1d-321-chat-relevancia-faltante` (17/21; D6-50, D6-62, L1D-322) | 6/6 · 6/6 (7) | RN-01, 02, 04, 23, 24, 29 · AC-T1.2 | #381 | Done → Done |
| L1D-322 | US-265 | `2026-11-13-l1d-322-chat-evidencia-seguimiento` (29/29) | 7/7 · 7/7 (25) | FR-09, 10, 25 · RN-01, 02, 04, 06, 12, 15, 19, 23, 24, 28 · AC-04.3, 06.1, 10.1, AC-T1.4 | #370 | Done → Done |
| L1D-323 | US-266 | `2026-11-13-l1d-323-chat-fuentes-limitaciones` (20/25; D6-50, D6-62, US-185; H-1 en #375) | 6/6 · 6/6 (12) | FR-10 · RN-02, 03, 04, 25 · AC-06.2, AC-T1.3 | #375, #378 | Done → Done |
| L1D-213 | US-148 | `2026-11-13-l1d-213-opt-out-generacion-ia` (11/16; 3.1…3.5 → L1D-324, **no hechas**) | 8/9 · 8/9 (17); AC-2 condicional a FEAT-02c (no aplica); **AC-8 (UI) sin implementar** | FR-09, 16, 21 · RN-10, 15, 26 · AC-02.5, 06.1, AC-T3.3, T4.1, T4.6 | #368 | In Review → **In Progress** |
| L1D-330 | US-272 | `2026-11-13-l1d-330-relative-end-day` (17/18; 4.3 → D6-62) | 4/4 · 4/4 (16) | FR-21 · RN-01, 11, 26 · AC-02.1 | #379 | Done → Done |
| L1D-329 | US-271 | `2026-11-13-l1d-329-segundo-loop-contextual` (20/24; D6-33, H-2, H-3) | 10/10 · 9/10 (25); **AC-9 sin test ni reporte** | FR-09 · RN-01, 02, 04, 10, 11, 19, 22, 23, 27, 29 | #374, #377, #380 | Done → **In Review** |
| L1D-324 | US-267 | `2026-11-13-l1d-324-panel-conversacional` (22/29; D6-50, D6-62) | 11/11 · 11/11 (32) | RN-10, 11, 12, 15, 19, 23, 27, 29 · AC-10.3, AC-T3.1 | #374, #377, #382, #383 | Done → Done |
| L1D-325 | US-268 | `2026-11-13-l1d-325-chat-fuentes-sin-perder-contexto` (13/16; D6-32, D6-34, D6-62) | 5/5 · 5/5 (8) | RN-01, 04, 25 · SEG-12 · AC-T1.1, T1.3 | #384 | Done → Done |
| L1D-332 | US-274 | `2026-11-13-l1d-332-aviso-ampliacion-visible` (6/6) | 5/5 · 5/5 (8) | RN-01, 19, 23 · AC-T3.1 | #391 | Done → Done |
| L1D-331 | US-273 | `2026-11-13-l1d-331-composicion-terminos-prostata` (7/9; D6-50, H-6) | 4/5 · 3/5 (10); **AC-2 medido no cumple** (9/22 y 13/22 frente a ≥ 18/22); AC-3 sin test | FR-09 · RN-02, 11, 22, 27, 29 | #388, #392 | In Review → **In Progress** |
| L1D-333 | US-275 | `2026-11-13-l1d-333-defaults-expansion-max-pairs` (9/10; H-3) | 2/7 · 2/7 (3); AC-3, AC-5 y AC-7 son documentales y se cumplen; **AC-2 y AC-4 sin reporte H-3** | FR-09 · RN-02, 22 | #393 | In Review → In Review |
| L1D-326 | US-269 | `2026-11-13-l1d-326-chat-e2e-evaluate` (15/23; D6-33, D6-50…D6-53) | 8/8 · 7/8 (17); **AC-4 sin implementar**; AC-1 sin próstata; AC-3 y AC-7 solo con *fake* | FR-20 · RN-01, 10, 11, 13, 14, 19, 23 · AC-T5.1 · M-02.1, 02.2, 02.3, 04.1, 04.2 | #389, #390 | Done → **In Progress** |
| L1D-113 | US-116 | `l1d-113-faltantes-desconocido-prompt` **activo** | 0/5 (5 en el delta) · 5/5 (12) | FR-09, 23 · RN-02, 11 · AC-04.3 | #307, #314 | In Review → In Review |
| L1D-116 | US-117a | `l1d-116-ingesta-reanudable-licencia` **activo** | 0/4 (4 en el delta) · 4/4 (8) | FR-19 · RN-21, 22 · SEG-06 · AC-06.1 | #194, #196 | In Review → In Review |
| L1D-119 | US-120 | `l1d-119-corpus-ampliado-calibracion` **activo** | 0/7 (7 en el delta) · 7/7 (12) | FR-19 · RN-14, 21, 22 · AC-06.1 · M-06.1, 06.2, 08.3 | #302 | In Review → In Review |
| L1D-126 | US-121 | `l1d-126-criterios-aplicabilidad-catalogo` **activo** | 0/5 (5 en el delta) · 5/5 (14) | FR-25 · RN-22, 28, 29 · AC-04.5, 08.1, 08.6 | anteriores | In Review → In Review |
| L1D-205 | US-013 · ADR-40 | `l1d-205-adr40-deteccion-pii` **activo** | 0/6 (sin tags en el delta) · 2/6 (6) | FR-20 · RN-10, 11, 22 | anteriores | In Review → In Review |
| L1D-246 | US-140 | `l1d-246-suite-hasta-3-opciones` **activo** | 0/6 (6 en el delta) · 6/6 (30) | FR-20 · RN-22, 28 · AC-08.8, T5.1, T5.3 · M-07.2, 10.1, 10.2 | #310, #328 | In Review → In Review |
| L1D-299 | US-233b | `l1d-299-poblacion-dorado-suite` **activo** | 0/8 (8 en el delta) · 7/8 (AC-1 sin tag) | FR-20, 25 · RN-02, 14, 21, 22 · AC-T5.4 · M-08.2, 08.3, 08.4 | #308 | In Review → In Review |
| L1D-234 | US-017 · DEC-07 | sin change (opcional, corrida N) | — | — | — | Backlog → Backlog |
| L1D-92 · L1D-125 | DEC-01 · DEC-11 | sin change (firmas) | — | — | — | Backlog → Backlog |

**PR sin change (válidos):**
- Feedback de la Demo 5 (`d5fb-*`, archivados el 2026-11-06): #342, #343, #344, #346 y #347.
- Refinamiento, conciliación y plan: #352, #353 y #354.
- Tareas humanas y *chores* de oleada: #355, #360, #364, #373, #375 y #385.
- Documentación: #345, #348…#351, #372, #386…#389, #394…#399 y #406.
- Evidencia: #383 (`visual-check` de L1D-324).
- Demo: #405.
- Registro de *prompts*: #400.

No hay ningún change archivado sin PR, ni ningún PR de historia sin change.

**Escenarios y tests sin AC de origen.** Ninguna historia del S6 tiene escenarios ni tests sin AC de origen. Siguen sin AC en el Markdown, como en el S5 (M6):
- `[US-242 AC-9]`: 1 escenario y 1 test.
- `[US-233b AC-9]`: 1 test.

`US-900*` son *fixtures* de la CI de higiene. Los tests `[US-267 RN-15]` llevan una RN como tag en lugar de un AC: son válidos, pero el detector no los cuenta como tests de AC.

**RN citadas por las historias del S6.** Todas tienen ≥ 1 test con el tag de un AC de la historia que la cita, salvo **RN-18** (retención). US-258 la cita como contexto del registro del análisis y gana 2 escenarios en `data-model`, pero ningún test. El *job* de retención es Post-MVP (FEAT-T4f), así que no es un compromiso del S6.

**Regresiones activas:**
- `🔗 Regresión [RN-15] → US-148 (activa desde S6)`: **verificada**. `cobertura-de-rutas` (unitario y de integración) incluye las rutas de turnos del chat, y `conversacion-evidencia.test.ts` lleva `[US-148 AC-1]`.
- `🔗 Regresión [FR-18] → US-102` y `[AC-T1.5/FR-18] → US-102 (activa desde S6)`: **no aplican**. US-102 (auditoría de lectura) es Post-MVP y no se construyó.
- `[RN-28] → US-125`: sigue cubierta (S5).

## 2. Cobertura por familia (cierre del S5 → cierre del S6)

| Familia | Universo | Con spec S5 → S6 | Solo en changes sin archivar S5 → S6 | Con test S5 → S6 |
|---|---|---|---|---|
| FR | 31 | 21 → 22 | 0 → 0 | 21 → 21 |
| RN | 30 | 28 → 29 | 0 → 0 | 28 → 28 |
| NFR | 14 | 9 → 9 | 0 → 0 | 9 → 9 |
| SEG | 13 | 10 → 11 | 0 → 0 | 10 → 11 |
| IA | 11 | 7 → 7 | 0 → 0 | 7 → 7 |
| CAP | 11 | 3 → 7 | 4 → 0 | 7 → 7 |
| T | 5 | 0 → 0 | 0 → 0 | 0 → 0 |
| AC | 54 | 34 → 35 | 0 → 0 | 33 → 34 |
| ACT | 23 | 20 → 22 | 1 → 0 | 21 → 22 |
| ACP | 2 | 0 → 0 | 0 → 0 | 0 → 0 |
| M | 36 | 19 → 20 | 1 → 0 | 17 → 18 |
| HU | 26 | 12 → 14 | 0 → 0 | 12 → 14 |
| OL | 6 | 6 → 6 | 0 → 0 | 6 → 6 |
| TBD | 21 | 7 → 7 | 1 → 1 | 7 → 7 |
| VM | 6 | 3 → 5 | 2 → 0 | 5 → 5 |
| G | 16 | 5 → 9 | 3 → 0 | 8 → 9 |

Todas las familias tienen historia para cada ID (TBD-05 es una exclusión). **Ningún ID pierde spec ni test.**

Volumen de la matriz: 1339 → 1822 escenarios en la spec principal, 240 → 86 en los deltas abiertos y 6376 → 7435 unidades de test.

**IDs que ganan spec en el S6:**
- FR-12 y RN-18 (los dos sin test).
- SEG-05.
- CAP-05, CAP-07, CAP-09 y CAP-11.
- AC-02.5, AC-T1.5 y AC-T4.6.
- M-02.1 y M-02.3.
- HU-14 y HU-16.
- VM-3 y VM-4.
- G-1, G-2, G-9 y G-14.

Los CAP, VM y G (salvo G-9) y AC-T1.5 entran por el archivo de `l1d-248` (`demo-gate`, 2026-11-06). Los demás llegan con el chat y el opt-out del S6.

**IDs que ganan test en el S6:** SEG-05, AC-02.5, AC-T4.6, M-02.1, HU-14, HU-16 y G-9.

**RN sin test todavía:** RN-16 (Post-MVP) y RN-18 (Post-MVP, con spec).

**FR sin test:** FR-03, 06, 12, 13, 14, 24, 26, 28, 29 y 30. Todos son Post-MVP o «si hay capacidad».

## 3. Huecos priorizados

**Bloqueantes.** Son propuestas de historia; no se crea ningún issue.

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| B1 | **US-148 AC-8 (UI del opt-out) sin implementar.** La página `/pacientes/[id]/analisis` renderiza `ConversationPanel` sin `disabled` desde `aiAnalysisAvailable`. El oncólogo puede escribir, y solo tras el 403 ve el estado neutro (`docs/evidence/S6-visual-check-324/07-optout-1280.png`, con el 403 inyectado). No hay aviso previo ni Playwright con P-OPT-IA. Las tareas 3.1…3.5 de `l1d-213` se difirieron a L1D-324, que se archivó sin hacerlas: el destino quedó vacío. RN-15 se cumple en el backend (403 sin llamar a la IA), pero el AC publicado no. | `frontend-dev` | **Historia «El panel conversacional se deshabilita de entrada con opt-out de `analisis_ia`»** (2 pts, FEAT-T4c): `aiAnalysisAvailable` → `disabled` en la página, aviso «El análisis con IA no está disponible para este paciente» sin el motivo, preguntas guiadas ocultas o deshabilitadas, E2E Playwright con P-OPT-IA (US-148 AC-8) y `visual-check`. Con esto, L1D-213 pasa a Done. |
| B2 | **Alerta Dependabot #9 (`langgraph` 1.2.10, GHSA-3fx2-cqw9-xr3c, media) abierta desde el merge de #362.** Rompe «0 alertas» de la DoD, así que L1D-316 vuelve a In Review. El aviso se publicó el 2026-10-28, antes de añadir la dependencia. El vigilante de PR no la vio porque solo lee *code scanning*. | `ai-services-dev` + humano | **Tarea de hora 0 del S7:** subir `langgraph` a 1.2.14 (y lo que arrastre) con `pip-audit` y la suite de `rag-orchestrator` en verde, o descartar la alerta con justificación (solo se usan el grafo e `InMemorySaver`, no el SDK con *streaming*). Además: que `vigilar-pr.sh` lea `dependabot/alerts?state=open`. Triagear también la #8 (`minimatch`, de desarrollo). |
| B3 | **US-269 cerrada en Linear con AC publicados sin cumplir.** El recorte `[S6 resp. 25]` cambió el alcance, pero no los AC: AC-4 sin implementar (D6-51), AC-1 sin E2E de próstata (D6-49), AC-3 y AC-7 sin modelos reales (D6-50 y D6-59). Las métricas del chat (M-02.1, M-02.3, M-04.1, M-04.2) no tienen cifras reales, y G-Demo y G-Piloto se apoyan en ellas. | humano (PO) + `backlog-writer` | Una de dos: (a) **reescribir US-269** al mínimo crítico (primero el Markdown y después Linear) y abrir una **historia nueva «Evaluate del chat con modelos reales»** (AC-3, AC-4 y AC-7 de US-269 más D6-51, D6-52 y D6-59; `eval-chat-preparar` y `evaluate:chat`); o (b) dejar L1D-326 en In Progress hasta hacerlo. |

**Altos:**

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| A1 | **Ningún reporte de evaluación del S6 en `reports/eval/`** (D6-60, H-3 de L1D-329 y L1D-333, H-6 de L1D-331). Por eso US-271 AC-9, US-273 AC-2 y US-275 AC-2 y AC-4 quedan sin evidencia versionada. Las cifras de la corrida final viven en scripts del *scratchpad* (`medir_final.py`, `ctx_final.py`). CLAUDE.md exige OL-06 en todo PR que cambie prompt, umbral o catálogo; los PR #359, #369, #380, #381, #382, #392 y #393 lo cambiaron. | humano + `ai-eval-runner` | Una sola tarea humana: versionar en `reports/eval/` el reporte de la corrida final (p95 de 17,05 s y 18,3 s, genéricas de próstata 9/22 y 13/22, fidelidad 0,822, las 3 preguntas de sinónimos de US-271 AC-9) y el script que lo produce (D6-33, D6-48). Con eso, L1D-329 y L1D-333 pasan a Done. |
| A2 | **US-273 AC-2 medido y no cumplido** (D6-57): genéricas con evidencia 9/22 y 13/22, frente a ≥ 18/22. La expansión ya está activa por defecto (L1D-333). | humano (PO) | Decidir el criterio de cobertura de próstata, ligado a D6-42. Si se acepta la mejora (0/22 → 13/22, cribado 54/66 → 2/13), reescribir el AC-2 y cerrar L1D-331. Si no, abrir una historia de composición de términos para próstata. También falta un test `[US-273 AC-3]` (términos solo del catálogo, sin `pseudoPatientId` en la consulta al *reranker* ni en los *logs*). |
| A3 | **RN-26 sin E2E del chat** (D6-62, `l1d-324` 3.12). Los E2E `aviso-faltantes` y `avisos-no-bloquean` se borraron al sustituir el formulario y no se reemplazaron. RN-26 se cubre en `web` con tests de componente (`esperarComposerOperable`). | `frontend-dev` | Dos E2E sobre el *fake*: faltantes y conflicto como bloques del turno, y aviso «desactualizado», comprobando que el campo sigue operable. Tag `[US-267 AC-n]` del AC que corresponda, o un AC nuevo si ninguno lo cubre. |
| A4 | **D6-63: los turnos y `GET /platform/conversations/{id}` no comprueban el autor.** Cualquier doctor con `clinical:read` que conozca el UUID lee o continúa la conversación. Es coherente con el RBAC del MVP (PRD B-03), pero no hay decisión escrita. | humano | Decidirlo antes de G-Piloto: aceptarlo hasta `CareTeamMember` (registrar la excepción) o filtrar por `created_by` con un test de 404. |
| A5 | **US-005 AC-2 y US-128 AC-1 sin escenario vigente.** L1D-324 retiró con aprobación (`[S6 resp. 20]`) el requisito «Continuar con aviso envía `continueWithWarning`». El Markdown y Linear siguen describiendo el botón del formulario, y la Base ya no recibe `continuedWithWarning = true` desde la UI (`l1d-324` 3.11 → D6-62). | `backlog-writer` + humano | Reescribir US-005 AC-2 y US-128 AC-1 para el chat (o marcarlos retirados por `[S6 resp. 20]`), primero el Markdown y después Linear, y decidir si el turno de evidencia del chat envía `continueWithWarning` cuando hay faltantes. |

**Medios:**
- M1 · **Evaluate real pendiente de los prompts y catálogos del S6** (D6-50): L1D-108 3.1, L1D-321 3.1 y 4.2, L1D-323 4.1 y L1D-324 4.4. La decisión `[S6 resp. 22]` lo dejó al final y opcional. Es el mismo patrón que la M1 del S5, que se repite.
- M2 · **Fidelidad NLI de 0,822 frente a 0,90** (D6-46 y D6-58), sin línea base. DEC-07 (L1D-234) sigue sin decidir.
- M3 · **US-233b AC-1 sin tag y AC-9 inexistente** (M6 del S5, sin resolver), y `[US-242 AC-9]` igual. Añadir los AC-9 a FEAT-06c y FEAT-T5a.
- M4 · **L1D-205 (US-013 · ADR-40):** su delta no tiene escenarios con tag de AC (0/6) y solo 2/6 AC tienen test. Antes de archivarlo, alinear el delta con los AC de la historia.
- M5 · **D6-66:** LangSmith solo se apaga en Compose. Falta la guarda en el arranque de `rag-orchestrator` (RN-10, RN-12).

**Menores:**
- m1 · `l1d-324` 4.2 y `l1d-325` 1.12 figuran «no ejecutado» y conciliados a D6-62, pero los `visual-check` existen (`docs/evidence/S6-visual-check-324/` con PASS en #383, y `S6-visual-check-325/`). Corregir esas filas de D6-62 y marcar las tareas con su evidencia en un commit de conciliación.
- m2 · `backlog/02-adrs.md` y `docs/architecture/adr/README.md` siguen diciendo que la UI de ADR-51 «queda abierta hasta el spike US-257». ADR-51 ya la da por decidida (assistant-ui).
- m3 · El encabezado de la enmienda de ADR-39 dice «pendiente de la corrida final», pero el texto la da por vigente y la corrida final se hizo. Actualizar el título.
- m4 · L1D-285 (US-213b) sigue In Review en el hito «Sprint 6», con su change archivado el 2026-11-06 (D6-17 y D6-18 a Post-MVP). No está en el plan del S6 y no la toco. La cierra el humano o la próxima auditoría.
- m5 · La matriz anterior listaba `l1d-248`, `l1d-268`, `l1d-285`, `l1d-166`, `l1d-173`, `l1d-197` y `us-231b` como «abiertos». Ya están archivados (2026-11-06) y la tabla «Historias → Feature» los recoge.
- m6 · Método: los tests con tag `[US-xxx RN-nn]` (sin AC) no cuentan como test de AC. Es el caso de `[US-267 RN-15]`, que se revisó a mano.

## 4. Incoherencias entre el plan, `openspec` y Linear

1. **L1D-326, L1D-329 y L1D-316** estaban en Done en Linear, y el orquestador o la sesión las cerraron al mergear. La auditoría las devuelve (B3, A1 y B2).
2. **L1D-213:** sus tareas de UI apuntan a L1D-324 como destino, pero L1D-324 no las incorporó. Es un traslado sin receptor, igual que las 22 tareas que hoy se concilian con D6-50, D6-33 y D6-62 (B1).
3. **D6-62 frente a la evidencia:** los `visual-check` de L1D-324 y L1D-325 aparecen como no ejecutados, pero existen (m1).
4. **«0 alertas»:** el status de los PR no cubre Dependabot (B2).
5. **US-005 AC-2 y US-128 AC-1:** el Markdown y Linear describen un comportamiento que la spec retiró con aprobación (A5).
6. **L1D-313 (ADR-51)** estaba en Backlog con sus AC cumplidos. Pasa a Done.

## 5. Cambios en Linear (2026-11-13)

Antes de cada cambio comprobé el estado actual. Solo cambié estados y añadí comentarios: no creé ni borré ningún issue, ni cambié estimaciones ni hitos. Los comentarios no contienen datos personales ni secretos.

| Issue | Antes | Después | Motivo |
|---|---|---|---|
| L1D-316 | Done | **In Review** | Alerta Dependabot #9 abierta desde el merge de #362 (B2). |
| L1D-329 | Done | **In Review** | AC-9 sin test y sin reporte versionado (A1). |
| L1D-326 | Done | **In Progress** | AC-4 sin implementar, AC-1 sin próstata, AC-3 y AC-7 sin modelos reales (B3). |
| L1D-213 | In Review | **In Progress** | AC-8 (UI) sin implementar; traslado a L1D-324 sin receptor (B1). |
| L1D-331 | In Review | **In Progress** | AC-2 medido no cumple (9/22 y 13/22 frente a ≥ 18/22); AC-3 sin test (A2). |
| L1D-108 | In Review | **Done** | Cadena completa; el evaluate real queda en D6-50 (M1). |
| L1D-313 | Backlog | **Done** | ADR-51: AC-1…AC-4 documentales cumplidos. |
| L1D-333 | In Review | In Review (comentario) | AC-2 y AC-4 sin reporte H-3 (A1). |

**Done confirmados, con comentario:** L1D-266, 327, 314, 315, 204, 317, 318, 319, 320, 321, 322, 323, 324, 325, 330 y 332.

**«Sigue abierta: corrida N no ejecutada»:** comentario en L1D-113, 116, 119, 126, 205, 246, 299 y en DEC-07 (L1D-234). Ninguno lo tenía y el estado no cambia.

**Features:**
- FEAT-12 (L1D-312) sigue **In Progress**, con comentario: 14 de sus 19 historias están en Done. Le quedan L1D-316, 329, 333, 326 y 331.
- Las demás Features padre de historias del S6 no pasan a Done, porque les quedan historias abiertas:
  - FEAT-06a (L1D-16).
  - FEAT-T4a (L1D-40): L1D-205.
  - FEAT-T4c (L1D-42): L1D-213.
  - FEAT-PL1 (L1D-30): L1D-285.

**Sin cambio:**
- L1D-92 y L1D-125: firmas, en Backlog.
- Hito «Sprint 7» (L1D-334…337): no se toca.
