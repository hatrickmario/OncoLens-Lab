# S6 · Cierre (`/sprint-close S6`)

> Ejecutado el 2026-11-13 sobre `main` en `c02247a0` (PR #406), en la rama `sprint/S6-close`. Plan: [`S6-plan.md`](S6-plan.md) · refinamiento: [`S6-refinamiento.md`](S6-refinamiento.md) · deuda: [`S6-deuda.md`](S6-deuda.md) · trazabilidad: [`S6-trazabilidad.md`](S6-trazabilidad.md).
> No hubo `S6-status.md`: el control se reconstruyó desde el plan, los PR mergeados y los `tasks.md` (ver mejora 1 del §7).
> **Después del S6** (decisión del usuario, 2026-11-13): el **S7** se dedica solo a las mejoras del RAG del feedback de la Demo 6 (US-276…US-279, L1D-334…L1D-337, milestone «Sprint 7»).

## 1. Control: archivo y traslado

**Archivados (23), con PR mergeado y `openspec validate --strict` en verde:**

| Change | US | PR | Tareas abiertas con destino |
|---|---|---|---|
| l1d-108-prompt-instrucciones-datos | US-057 | #359 | 3.1 → D6-50 |
| l1d-204-llm-local-sin-nube | US-050 | #365 | 3.5, 3.6 → L1D-315 (hechas allí) |
| l1d-213-opt-out-generacion-ia | US-148 | #368 | 3.1–3.5 → L1D-324 (UI del panel) |
| l1d-266-cabeceras-seguridad-web | US-216 | #358 | H-1 (hecho en #360) |
| l1d-314-spike-assistant-ui (spike, sin deltas) | US-257 | #357 | — |
| l1d-315-conversacion-paciente | US-258 | #366 | H-1 (hecho en `chore/s6-compose-env-vars`) |
| l1d-316-chat-turn-langgraph | US-259 | #362 | H-1 (hecho en #360) |
| l1d-317-chat-caso-situacion | US-260 | #367 | — |
| l1d-318-chat-examen-tratamiento-periodo | US-261 | #371 | — |
| l1d-319-chat-contradicciones | US-262 | #376 | — |
| l1d-320-faltantes-tipo-vacio | US-263 | #369 | — |
| l1d-321-chat-relevancia-faltante | US-264 | #381 | 3.1, 4.2 → D6-50 · D-1 → D6-62 · D-2 → L1D-322 |
| l1d-322-chat-evidencia-seguimiento | US-265 | #370 | — |
| l1d-323-chat-fuentes-limitaciones | US-266 | #375, #378 | 2.11, 2.12 → D6-62 · 2.13 → US-185 · 4.1 → D6-50 · H-1 (E-20 de ADR-26) |
| l1d-324-panel-conversacional | US-267 | #372, #374, #377, #382, #383 | 2.2, 2.4, 3.4b **verificadas** (E2E en verde en `main`) · 3.8–3.12 → D6-62 · 4.2 **verificada** (`docs/evidence/S6-visual-check-324/`) · 4.4 → D6-50 |
| l1d-325-chat-fuentes-sin-perder-contexto | US-268 | #384 | 1.12 **verificada** (`docs/evidence/S6-visual-check-325/`) · 3.2 → D6-62 · 3.1 → D6-32 |
| l1d-326-chat-e2e-evaluate | US-269 | #389, #390 | 2.10 → D6-33 · 3.2–3.6 → D6-51/D6-52 · 5.1 → D6-50 · 6.1 → D6-53 |
| l1d-327-log-corte-reranker | US-270 | #356 | H-1 (hecho en #360) |
| l1d-329-segundo-loop-contextual | US-271 | #374, #377, #380 | 5.1, 5.2 → D6-33 · H-2 (hecho en L1D-333) · H-3 → corrida final |
| l1d-330-relative-end-day | US-272 | #374, #377, #379 | 4.3 → D6-62 |
| l1d-331-composicion-terminos-prostata | US-273 | #388, #392 | 3.1, H-6 → D6-50 (corrida final) |
| l1d-332-aviso-ampliacion-visible | US-274 | #391 | — |
| l1d-333-defaults-expansion-max-pairs | US-275 | #393 | H-3 → D6-60 (reporte no versionado) |

**Conciliación de este cierre.** 22 tareas de 7 changes decían «TRASLADADA a L1D-326», pero el `tasks.md` de L1D-326 nunca las incorporó: tenían un ID destino sin dueño real. Se resolvieron así (anotadas en cada tarea con «CONCILIADA»):
- 5 se verificaron como hechas: los E2E de L1D-324 existen en `apps/web/e2e/` y pasan en la CI de `main`; los `visual-check` de L1D-324 y L1D-325 están en `docs/evidence/`.
- 5 de evaluación real → D6-50.
- 2 del loop contextual → D6-33.
- 10 → **D6-62**, deuda nueva en `S6-deuda.md`.

**No se archivan (7, siguen activos):** `l1d-113`, `l1d-116`, `l1d-119`, `l1d-126`, `l1d-205`, `l1d-246` y `l1d-299`. Llegaron al S6 como `movido-S6`, y su tarea pendiente era la corrida nocturna N, que no se ejecutó (`[S6 resp. 22]`, opcional). **Propuesta:** pasan a **Post-MVP**, no al S7, que solo trata las mejoras del RAG. Excepción: la medición D4-30 de L1D-119 (8.6) la absorbe **US-277** (L1D-335). DEC-07 (L1D-234) sigue sin decidir.

**Archivo en bloque:** 23 changes en `openspec/changes/archive/2026-11-13-*`, sin conflictos de delta. Specs nuevas: `chat-conversation`, `patient-chat` y `opt-out`. Specs modificadas: 9. `openspec validate --specs --strict`: **32/32**.

## 2. Verificación global sobre `main`

| Verificación | Resultado |
|---|---|
| CI completa de `main` (`ci-ok`: build, unitarios e integración de las tres apps, contratos, capas, higiene de tests, escaneos) | ✅ verde en `c02247a0` (2026-11-11) |
| E2E Playwright contra Compose con `LLM_PROVIDER=fake` | ✅ verde en `c02247a0` |
| `openspec validate --strict` (23 changes antes de archivar; specs después) | ✅ |
| `/opsx:verify` por change | ⚠️ **No se ejecutó change por change.** Lo sustituyen el Gate 2 de cada historia, la CI de `main` y la validación estricta. Las suites locales no se repitieron: el worktree del cierre no tiene `node_modules` ni venv de Python, y son las mismas suites que corre la CI |
| `run-ai-eval` con modelos locales | ⚠️ No se repitió en el cierre. La evaluación real del S6 es la **corrida final** de L1D-333: fidelidad NLI 0,822 frente a la meta de 0,90 (D6-58); próstata con 9/22 y 13/22 genéricas con evidencia (D6-57); chat sin medir con modelos reales (D6-59). Las cifras salen de scripts del scratchpad, no de un reporte versionado en `reports/eval/` (D6-60) |
| Revisión de seguridad del diff del sprint (`e6f8ff33..c02247a0`) | ✅ sin hallazgos críticos ni altos (§2.1) |

### 2.1 Revisión de seguridad

La hizo `privacy-guardian` sobre `apps/`, `packages/`, `infra/`, `scripts/` y `.github/`, leyendo el código: no ejecutó tests. **No encontró nada crítico ni alto.** Quedó verificado:
- desidentificación por turno con seudónimo nuevo, sin identidad en el estado de LangGraph y con `threadId` aleatorio;
- `InMemorySaver` con TTL y telemetría de LangSmith apagada en Compose;
- logs sin texto, incluido `rag_query_corte`;
- regla de proveedor que falla cerrado (RN-12) y opt-out en las tres rutas que generan con IA (RN-15);
- separación de instrucciones y datos (L1D-108);
- Markdown saneado sin `dangerouslySetInnerHTML`, CSP con *nonce* y `strict-dynamic`, comprobación de `Origin` en los Route Handlers;
- el turno se persiste antes del `201` (RN-06).

Hallazgos menores (no bloquean; propuestos como deuda D6-63…D6-66):

| # | Sev. | Dónde | Hallazgo |
|---|---|---|---|
| 1 | Medio-bajo | `conversation.controller.ts:93-111`, `:127-164` | `GET /conversations/:id` y `POST …/turns` no comprueban el autor. Un doctor que conozca el UUID puede leer o continuar la conversación de otro. Es coherente con el RBAC del MVP (`CareTeamMember` es Post-MVP, PRD B-03), pero no hay una decisión escrita que lo cubra. **Pregunta al humano** |
| 2 | Bajo | `opt-out.guard.ts` | El opt-out se lee una vez al entrar la petición: uno registrado durante el turno no lo corta. Decisión documentada (design D4) |
| 3 | Bajo | `esquema_poblacion.py:69-84`, `corpus_metadata/esquema.py:171` | Los prompts de ingesta no separan sistema y datos ni escapan delimitadores. Impacto acotado: corpus público, JSON estricto y NLI. Es anterior al S6 |
| 4 | Bajo | `docker-compose.yml:322-326` | La telemetría de LangSmith solo se apaga en Compose. Falta una guarda en el código para ejecuciones fuera de Compose |
| 5 | Bajo | `csp.ts:22` | `style-src-attr 'unsafe-inline'`. Excepción aceptada por el PO (`[S6 resp. 19]`) |

## 3. Trazabilidad

Detalle en [`S6-trazabilidad.md`](S6-trazabilidad.md); `backlog/03-trazabilidad.md` regenerado con las filas de US-271…US-275.

**Cierre según la DoD: 18 de 24 historias (75 %) y 62 de 83 pts (74,7 %), por debajo de la meta del 80 %.** Si se triagea la alerta de Dependabot #9, L1D-316 vuelve a Done y el cierre sube a 19/24 y 67/83 pts (80,7 %).

| Linear | Estado tras la revisión | Motivo |
|---|---|---|
| L1D-266, 327, 314, 315, 204, 317, 318, 319, 320, 321, 322, 323, 324, 325, 330, 332 | Done (confirmado) | AC con escenario y test, PR mergeado, change archivado, tareas abiertas con destino |
| L1D-108 | In Review → **Done** | Cadena completa; la evaluación real queda en D6-50 |
| L1D-313 (ADR-51) | Backlog → **Done** | Sus 4 AC son documentales y se cumplen |
| L1D-316 | Done → **In Review** | Alerta de Dependabot #9 (`langgraph` 1.2.10, media) abierta desde el merge de #362 |
| L1D-329 | Done → **In Review** | AC-9 sin test ni reporte versionado |
| L1D-326 | Done → **In Progress** | AC-4 sin implementar; AC-1 sin E2E de próstata; AC-3 y AC-7 sin modelos reales |
| L1D-213 | In Review → **In Progress** | La parte de UI del AC-8 se difirió a L1D-324, que no la hizo: el panel solo se bloquea tras un 403 |
| L1D-331 | In Review → **In Progress** | AC-2 no se cumple (9/22 y 13/22 frente a ≥ 18/22, D6-57); AC-3 sin test |
| L1D-333 | In Review | AC-2 y AC-4 sin el reporte H-3 en `reports/eval/` (D6-60) |
| FEAT-12 (L1D-312) | In Progress | 14 de 19 historias en Done |
| 7 changes de arrastre y DEC-07 | sin cambio | Comentario «sigue abierta: corrida N no ejecutada» |

**Huecos Bloqueantes (propuestas, no creadas):**
- **B1.** Historia de 2 pts (FEAT-T4c): el panel del chat aparece deshabilitado desde el principio con opt-out (`disabled` según `aiAnalysisAvailable`, aviso previo, E2E con P-OPT-IA y `visual-check`). Cierra L1D-213.
- **B2.** Subir `langgraph` a 1.2.14 o descartar la alerta #9 con su justificación. Triagear también la #8 (`minimatch`, de desarrollo). Cierra L1D-316.
- **B3.** L1D-326: (a) reescribir sus AC al mínimo crítico y abrir «Evaluate del chat con modelos reales» (AC-3, AC-4, AC-7, D6-51, D6-52, D6-59), o (b) dejarla en In Progress.

**Huecos Altos:**
- no hay reporte del S6 en `reports/eval/`; versionarlo cierra L1D-329 y L1D-333;
- criterio de cobertura de próstata (D6-57);
- RN-26 sin E2E del chat;
- D6-63 (autor de la conversación);
- US-005 AC-2 y US-128 AC-1 siguen en el Markdown, aunque la spec los retiró en `[S6 resp. 20]`.

## 4. Review · Demo (S6)

- **Demo 6 hecha**, con datos sintéticos sobre Compose: guion en [`docs/demo/guia-demo-S6.md`](../../docs/demo/guia-demo-S6.md) y video en el «Estado actual» del readme. Recorrido: ficha del paciente → chat sobre el caso (A), los faltantes (B) y la evidencia citada con fuentes y limitaciones (C) → fragmento citado sin perder el contexto → aviso de ampliación de la búsqueda.
- **G-Piloto:** **no aplica.** Pasó a Post-MVP con la decisión del usuario del 2026-11-06 (PRD E-18), así que no se corre el checklist de `preflight-real-data`. `preflight real-data` no está construido; la CLI `oncolens` solo gestiona usuarios.
- **Feedback de la Demo 6** (base del S7): la misma pregunta dio evidencia con «prostatectomía radical» y «sin evidencia» con «cirugía de prostata radical». Se convirtió en US-276…US-279 (L1D-334…337). Ya entraron en `main`, o están en PR, `RERANKER_MAX_PAIRS = 20` y `QUERY_CONTEXT_EXPANSION_ENABLED = true` (L1D-333) y el solapamiento de chunks del 5 % (PR #407).

## 5. Retrospectiva: lo implementado

- **Comprometido:** 83 pts (recorte del 2026-11-07, `[S6 resp. 25]`). **Mergeado:** las 23 historias del plan, con su change archivado; el spike US-257 solo dejó evidencia y ADR-51 §8.
- **Cerradas según la DoD:** 18/24 historias y 62/83 pts (74,7 %), por debajo de la meta del 80 %; 80,7 % si se triagea la alerta #9 (§3).
- **Historial del sprint** (`e6f8ff33..c02247a0`): 94 merges y 327 commits, de los que 88 son `test`, 68 `feat`, 41 `refactor` y 14 `fix`. 20 `Test-Removal`, todos por cambios de AC o de delta declarados (sustitución de la ficha de análisis por el chat, US-057, US-260…US-262, US-268, US-273, recorte de L1D-326).
- **Deuda:** D6-01…D6-61 durante el sprint y D6-62 en este cierre.
- **Decisiones del humano durante el sprint:**
  - `[S6 resp. 23]`: ADR-52 y US-271.
  - `[S6 resp. 24]`: altas de US-273…US-275.
  - `[S6 resp. 25]`: recorte de L1D-326.
  - PRD E-19: tope de p95 en 20 s y `RERANKER_MAX_PAIRS` 12 → 20.
  - D6-36: tests de plazo 504.
  - Tras la Demo 6: solapamiento del 5 % (enmienda de ADR-39) y el S7 dedicado solo al RAG.

## 6. Retrospectiva: proceso agéntico

| # | Situación y causa (R = registro, I = inferencia) | Efecto |
|---|---|---|
| 1 | **R.** No se escribió `S6-status.md` y `/sprint-close` depende de él | El control se reconstruyó a mano desde plan, PR y `tasks.md` |
| 2 | **R.** 22 tareas «TRASLADADA a L1D-326» que L1D-326 nunca incorporó. `higiene-proceso` solo comprueba que haya un ID, no que el destino tenga la tarea | Deuda invisible hasta el cierre (D6-62) |
| 3 | **R.** La corrida real final se midió con scripts del scratchpad (`medir_final.py`, `ctx_final.py`), sin reporte en `reports/eval/` | Cifras no reproducibles (D6-60); la fidelidad 0,822 no tiene línea base (D6-46) |
| 4 | **R.** La corrida nocturna N quedó opcional y no se ejecutó | 7 changes de arrastre siguen abiertos por cuarto sprint y DEC-07 sin decidir |
| 5 | **R.** Tras el archivado en bloque de #353, `openspec validate --all --strict` falló en `main` por requisitos de más de 500 caracteres (chore #355) | Un PR extra al inicio de la O1 |
| 6 | **R.** Los guardianes del Gate 2 encontraron 5 Mayores de diseño en L1D-108 (renombrado de puerto, fakes sin `sistema=`, aserciones debilitadas) | Vuelta adicional; la lección está en la memoria del orquestador |
| 7 | **I.** En el historial solo aparece una «vuelta 2» explícita (L1D-324): el Gate 2 acotado de `[S6 resp. 22]` funcionó. No hay tabla de vueltas por guardián que lo confirme (sin status) | Cifras de vueltas no exactas |
| 8 | **R.** `vigilar-pr.sh` no lee las alertas de Dependabot: la #9 (`langgraph`) quedó abierta desde #362 y L1D-316 se dio por Done | Done revertido en el cierre (B2) |
| 9 | **R.** Una parte de un AC diferida a otra historia (L1D-213 AC-8 → L1D-324) no se hizo, y el Gate 2 de la historia destino no la exigió | L1D-213 vuelve a In Progress (B1) |
| 10 | **R.** `gh` sufrió *timeouts* de TLS intermitentes durante el cierre y en PR anteriores | Reintentos manuales; ningún efecto en el resultado |

**SOLID/CUPID:** las P1 repetidas del sprint son copias de una regla que divergen entre sí. Ejemplos: la tercera copia de `normalizar` en el catálogo (D6-56), la plantilla de prompt duplicada entre el chat y el seguimiento (D6-62) y el texto de limitación duplicado entre Backend 2 y `web` (D6-55). Es el mismo patrón que en el S5 (D5-22).

**TDD:** 88 `test` frente a 68 `feat` en la historia del sprint. 20 `Test-Removal` aceptados en el Gate 2, todos con el *trailer* en el último párrafo; no se repitió el caso de L1D-306.

## 7. Mejoras propuestas (SIN aplicar; requieren tu aprobación)

1. **`S6-status.md` obligatorio.** Que `/sprint-start` cree `S<n>-status.md` desde el plan y que `sprint-orchestrator` lo actualice al mergear cada PR (change, PR, tareas, vueltas por guardián). Sin él, `/sprint-close` no puede hacer el control de la fase 1. Cambio en `.claude/agents/sprint-orchestrator.md` y `.claude/skills/sprint-start/SKILL.md`.
2. **El destino de una tarea trasladada debe existir de verdad.** Ampliar `scripts/ci/tasks-destino.mjs`: si una tarea dice `TRASLADADA -> L1D-nn` y ese change está activo, su `tasks.md` debe contener una tarea con «(añadida por …)» que la cite; si no, falla `higiene-proceso`. Es lo que habría evitado D6-62.
   ```diff
   +// Un destino L1D-nn con change activo debe incorporar la tarea (lección del cierre del S6, D6-62)
   +if (destino.startsWith('L1D-') && changeActivo(destino) && !incorpora(destino, origen, idTarea)) fallar(...)
   ```
3. **Ninguna cifra de evaluación real sin reporte versionado.** Regla en `openspec/config.yaml` (`rules.tasks`): «una tarea que cite una cifra de una corrida real enlaza un reporte de `reports/eval/` producido por `run-ai-eval`; un script del scratchpad no cuenta como evidencia». Así D6-60 no se repite en el S7, que es todo evaluación.
4. **Arrastre con fecha de caducidad.** Un change `movido-S<n>` que no avanza en dos sprints se archiva con su deuda o pasa a Post-MVP; no vuelve a entrar como «opcional». Regla en `/sprint-refine`.
5. **Regla única por concepto (SOLID/CUPID, P1 repetida).** Añadir a `design-principles-reviewer` una comprobación explícita: «antes de aprobar una función de normalización, plantilla o texto fijo, buscar si existe otra con el mismo nombre o propósito en `packages/` y `apps/`»; y, si se repite, una regla `no-restricted-syntax` o dependency-cruiser que obligue a importar `normalizarTexto` de `packages/clinical-language`.
6. **El vigilante también mira Dependabot.** `vigilar-pr.sh` lee `repos/…/dependabot/alerts?state=open` además de code scanning, y la DoD cuenta esas alertas.

## 8. Pendientes de decisión del humano

- Aprobar el archivo de los 23 changes, la conciliación (D6-62), la deuda de seguridad D6-63…D6-66 y el destino de los 7 de arrastre (Post-MVP).
- Huecos Bloqueantes B1, B2 y B3 (§3): ¿al S7, que solo trata el RAG, o a Post-MVP? B3 exige elegir (a) o (b).
- D6-63: aceptar que cualquier doctor pueda leer o continuar una conversación ajena hasta que exista `CareTeamMember`, o filtrar por autor.
- Aprobar o rechazar cada mejora del §7 (por número).
- Cerrar el milestone «Sprint 6» en Linear (lo hace el humano).
- Mergear #407 (solapamiento), #408 (backlog del S7) y #409 (CLAUDE.md), ya en verde.

## 9. Decisiones del usuario en el cierre (2026-11-13)

- **Cierre aprobado:**
  - 23 changes archivados;
  - conciliación D6-62;
  - deuda de seguridad D6-63…D6-66;
  - los 7 changes de arrastre (`l1d-113`, `116`, `119`, `126`, `205`, `246`, `299`) pasan a **Post-MVP**; la medición D4-30 la absorbe US-277.
- **Huecos Bloqueantes:**
  - **B2 al S7** como tarea de hora 0: subir `langgraph` a 1.2.14 o descartar la alerta #9 con justificación, y triagear la #8. Cierra L1D-316 y lleva el S6 al 80,7 %.
  - **B1 y B3 a Post-MVP.** B3 con la opción (a): los AC de L1D-326 se reducen al mínimo crítico y se propone «Evaluate del chat con modelos reales» (AC-3, AC-4, AC-7, D6-51, D6-52, D6-59).
- **Mejoras del §7 aprobadas: las 6.** Se aplican en un PR aparte después de este cierre.
- **D6-63:** riesgo **aceptado** hasta `CareTeamMember` (Post-MVP). Mientras tanto, cualquier doctor con `clinical:read` puede leer o continuar una conversación ajena si conoce su UUID; las preguntas van enmascaradas.
