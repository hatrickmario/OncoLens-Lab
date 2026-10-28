# S3 · Auditoría de trazabilidad

> `traceability-auditor` · `/sprint-close S3` · 2026-10-27 · rama `sprint/S3-close` sobre `main` e3c00924, con los 16 changes archivados el 2026-10-27 y sus deltas fusionados en `openspec/specs/` (capabilities nuevas: `applicability`, `completeness`, `evidence-panel`).
> Insumos: [`S3-plan.md`](S3-plan.md), [`S3-status.md`](S3-status.md), [`S3-refinamiento.md`](S3-refinamiento.md), [`S3-deuda.md`](S3-deuda.md), `openspec/changes/archive/2026-10-27-*`, los 14 changes abiertos, `openspec/specs/**`, `backlog/features/*.md`, `docs/PRD.md` v1.4 §17–§18, los PR #189…#227 (`gh pr list --state merged`), `reports/eval/s3-cierre.md` y la CI de `main` en e3c00924.
> La matriz completa se regeneró en [`../03-trazabilidad.md`](../03-trazabilidad.md). Desde este cierre la genera un script del auditor, que reproduce el método del S2: los conteos son comparables, aunque no idénticos, a los de la matriz anterior.
> Las decisiones ya tomadas no cuentan como huecos nuevos: los traslados con ID de destino a US-232, US-233, US-143, US-034 y US-222, ya registrados en los `tasks.md` y en `S3-deuda.md`.

## 1. Resumen del sprint

**Criterio de Done.** Es el mismo del S1 y el S2. Una historia está en Done cuando cumple cinco puntos:
1. Cada AC tiene al menos un test ejecutado y en verde.
2. El Gate 2 está en PASS (en las historias de la noche del 2026-10-27, el Gate 2 reducido que decidió el usuario).
3. El PR está mergeado.
4. El change está archivado.
5. Las tareas están completas.

Por indicación del cierre, una tarea trasladada con ID **no** basta para el Done si el change sigue activo: la historia queda en In Review hasta que se archive.

**Ejecución.** La CI de `main` está en verde en e3c00924 (flujos `CI`, `E2E` y `CodeQL`, con todos sus jobs). Solo quedan sin ejecutar los 14 Pytest `models`, que necesitan pesos reales.

**Evaluación.** Según [`reports/eval/s3-cierre.md`](../../reports/eval/s3-cierre.md), la corrida se hizo solo con adapters falsos:
- Sin regresiones frente al baseline.
- Bajo meta: fidelidad 0,75 (meta 0,90) y precisión de citas 0,80 (meta 0,90).
- Aplicabilidad: concordancia 41/41, «Coincide» sin cita = 0 y M-08.4 = 0,95.
- M-08.3 = 0,70 (meta 0,90).

| L1D | Historia | Change | Spec (openspec) | AC con escenario (principal + solo delta) | AC con test | PR | Linear (antes → después) | Cadena |
|---|---|---|---|---|---|---|---|---|
| L1D-93 | US-001 · catálogo validado | `2026-10-27-l1d-93-catalogo-datos-criticos-validado` | `clinical-catalogs` | 8/8 | 8/8 (32) | #193 | Done → Done | **Completa** |
| L1D-94 | US-002 · checklist | `2026-10-27-l1d-94-checklist-determinista` | `completeness` | 8/8 | 8/8 (12) | #197, #208 | Done → Done | **Completa** (1.12b → L1D-95) |
| L1D-95 (parte) | US-003 · seed RE/RP/IHQ | `2026-10-27-l1d-95a-seed-codigos-catalogo` | `completeness`, `data-model` | 1/7 | 1/7 | #212 | Backlog → Backlog | Parcial por plan; el resto de US-003 es del S4 |
| L1D-98 | US-006 · faltantes al análisis | `2026-10-27-l1d-98-faltantes-al-analisis` | `evidence-analysis-gateway`, `completeness` | 8/8 | 8/8 (8) | #215 | Done → Done | **Completa** |
| L1D-181 | US-065 · procedencia | `2026-10-27-l1d-181-procedencia-contexto-ia` | `evidence-analysis-gateway`, `evidence-analysis` | 5/5 | 5/5 (9) | #213 | Done → Done | **Completa** |
| L1D-287 | US-236 · alias de chunks | `2026-10-27-l1d-287-alias-chunks-cita` | `evidence-analysis` | 7/7 | 7/7 (8) | #195 | Done → Done | **Completa** (AC-7 sintético, decisión 13) |
| L1D-127 | US-122 · estado estructurado | `2026-10-27-l1d-127-estado-criterio-estructurado` | `applicability` | 6/6 | 6/6 (8) | #214 | Done → Done | **Completa** (m-2) |
| L1D-128 | US-123 · textual citada | `2026-10-27-l1d-128-aplicabilidad-textual-citada` | `applicability` | 5/5 | 5/5 (6) | #217 | Done → Done | **Completa** |
| L1D-129 | US-124 · causas y avisos | `2026-10-27-l1d-129-aplicabilidad-causas-avisos` | `applicability`, `evidence-analysis-gateway` | 7/7 | 7/7 (7) | #220 | Done → Done | **Completa** (m-3) |
| L1D-130 | US-125 · herencia y recorte | `2026-10-27-l1d-130-herencia-aplicabilidad-recorte` | `applicability`, `evidence-analysis` | 7/7 | 7/7 (8) | #221 | Done → Done | **Completa** |
| L1D-188 | US-128 · Base con faltantes | `2026-10-27-l1d-188-base-faltantes-declarados` | `analysis-basis` | 4/4 | 4/4 (11) | #216 | Done → Done | **Completa** |
| L1D-141 | US-062 · estados del panel | `2026-10-27-l1d-141-estados-panel-criterio` | `evidence-panel` | 7/7 | 7/7 (15) | #224 | Done → Done | **Completa** (D9 aceptada) |
| L1D-182 | US-127 · metadatos de fuente | `2026-10-27-l1d-182-metadatos-fuente-catalogo` | `evidence-analysis`, `evidence-panel` | 4/4 | 4/4 (8) | #219 | Done → Done | **Completa** |
| L1D-288 | US-237 · motivos de descartadas | `2026-10-27-l1d-288-motivos-solo-descartadas` | `evidence-panel`, `evidence-analysis` | 6/6 | 5/6 (AC-6 lo cubre el job `contracts`) | #223 | Done → Done | **Completa** (m-1) |
| L1D-140 | US-061 · panel (S1) | `2026-10-27-l1d-140-panel-opcion-citas` | `evidence-panel` | 6/6 | 6/6 (14) | S1 + #192 | Done → Done | **Completa** |
| L1D-187 | US-067 · panel de la Base (S2) | `2026-10-27-l1d-187-panel-base-analisis` | `analysis-basis` | 5/5 | 5/5 (11) | #139 + #192 | In Review → **Done** | **Completa**: el hueco del S2 (visual-check) se cerró con ARR-09 |
| L1D-116 | US-117a · ingesta reanudable | abierto: `l1d-116-ingesta-reanudable-licencia` | — (delta `corpus-ingestion`) | 0/4 (+4) | 4/4 (7) | #194, #196 | Done → **In Review** | Falta archivar; la 1.10 (smoke sparse real) pasa a L1D-117 AC-5 / US-117b |
| L1D-117 | US-118 · metadatos de población | abierto: `l1d-117-metadatos-poblacion-verificados` | — (delta) | 0/6 (+6) | 6/6 (13) | #198, #209, #210 | Done → **In Review** | 7 tareas trasladadas (US-233, US-143, US-034); la muestra humana (2.3) sigue pendiente |
| L1D-126 | US-121 · criterios en el catálogo | abierto: `l1d-126-criterios-aplicabilidad-catalogo` | — (delta `clinical-catalogs`) | 0/5 (+5) | 5/5 (14) | #200 | Done → **In Review** | G1.6, G2.3, G2.4 y G2.6 → US-232 |
| L1D-244 | US-132 · eval de aplicabilidad | abierto: `l1d-244-eval-aplicabilidad-metadatos` | — (delta `ai-evaluation`) | 0/5 (+5) | 5/5 (6) | #225 | Done → **In Review** | 2.2, 4.1 y 4.2 → US-233; M-08.3 = 0,70 |
| L1D-285 | US-213b · higiene de tests | abierto: `l1d-285-higiene-tests-ci` | — (delta `code-quality`) | 0/6 (+6) | 6/6 (78) | #199, #204, #211 | Done → **In Review** | 5.1 → US-233/US-232; 5.3 → US-222 |
| — | US-117b · versionado y *sparse* | abierto: `us-117b-versionado-sparse-semilla` | — (delta `corpus-ingestion`) | 0/2 (+2) | 2/2 (2) | #218, #222 | sin issue | 0.4b y G2.B2–A4 → US-233 (M-3) |
| — | ARR-09 · visual-checks y conciliación | sin change (por plan) | — | — | tests con tag `ARR-09 AC-n` | #192 | sin issue | Archivó l1d-140 y l1d-187; l1d-166 5.2, l1d-173 5.1 y l1d-197 4.2 siguen abiertas con destino |
| L1D-125 · L1D-92 | US-021 · DEC-11 · DEC-01 | sin change | — | exenta | exenta | — | Backlog → Backlog | `propuesta_revisada` en el catálogo; el cierre con los oncólogos es del S4 (M-4) |

**Conteo de las historias del plan del S3:**
- **Done: 13**, confirmadas con cadena completa. Fuera del plan, L1D-187 (del S2) pasa a Done y L1D-140 (del S1) se confirma, porque sus changes se archivaron en este cierre.
- **In Review: 5.** L1D-116, 117, 126, 244 y 285.
- **Sin issue: 2.** US-117b y ARR-09.
- **Backlog: 3.** L1D-95 (S4; su seed se entregó con l1d-95a), L1D-125 y L1D-92.

**Verificaciones del cierre:**
- **Alcance inventado: no hay.** Los escenarios nuevos sin tag de AC en la spec principal citan su base: una RN, una respuesta `[S3 resp. n]`, un design, «asumido» o una decisión del usuario. La única excepción es «Estadio de A-M1 sin escala ordenada» (`applicability`), que no cita nada (m-2).
- **Tags de test colgados.** Ningún tag de test apunta a un AC inexistente de una historia, salvo dos:
  - `@pytest.mark.ac("S1", 29)`, que viene del S1 (m-2 del S1, sigue abierto).
  - `US-900`, que es un *fixture* deliberado de `ci/tests/quality/ac-coverage.test.mjs`.
  Los tags `ARR-0n AC-n` son válidos: las ARR no tienen ficha de historia.
- **PR y changes:**
  - Los 16 changes archivados tienen PR mergeado: l1d-140 en el S1 y l1d-187 con #139, y los demás en el S3.
  - Todo PR `[L1D-nn]` del sprint tiene change.
  - #218/#222 (`[US-117b]`) no tienen issue en Linear (M-3).
  - El resto son *chores*, Dependabot y Markdown, que no implementan AC.
- **RN citadas por las historias del S3:** todas tienen al menos un test ejecutado ligado a un AC de la historia. Hay dos excepciones de forma, sin hueco funcional:
  - RN-07 en US-124: solo se cita en el contexto técnico; la verifican de hecho AC-2 y AC-3 (m-3).
  - RN-22 en US-117a: solo en el contexto técnico; la verifica la configuración de US-037.
- **Regresiones 🔗 cuyo sprint ya llegó:** todas las tiene verificadas la historia dueña, con test:
  - RN-01 → US-064; RN-02 → US-055; RN-04 → US-063; RN-05 y RN-21 → US-059; RN-06 → US-053.
  - RN-11 → US-049; RN-19 → US-069; RN-23 → US-068; RN-25 → US-127; RN-29 → US-001.
  - Las demás aún no se activan: RN-15 → US-148 (S6), RN-17 → US-198 (Post-MVP) y RN-26 → US-071 (S5).
- **Historias `movido-S4` en Done:** ninguna. Las cinco con change activo se devolvieron a In Review.

## 2. Cobertura por familia (cierre del S2 → cierre del S3)

| Familia | Universo | Con spec | Solo en delta | Con test |
|---|---|---|---|---|
| FR | 31 | 14 → **18** | 2 → 1 | 15 → **17** |
| RN | 30 | 24 → **26** | 1 → 0 | 24 → **26** |
| NFR | 14 | 9 → 9 | 0 | 9 → 9 |
| SEG | 13 | 10 → 10 | 0 | 10 → 10 |
| IA | 11 | 4 → 5 | 1 → 0 | 5 → 5 |
| AC (CAP-xx) | 54 | 8 → **27** | 4 → 1 | 12 → **27** |
| ACT | 23 | 13 → 17 | 4 → 1 | 17 → 18 |
| M | 36 | 5 → **14** | 1 → 2 | 6 → **13** |
| HU | 26 | 5 → 8 | 1 → 1 | 6 → 8 |
| OL | 6 | 6 | 0 | 6 |
| TBD | 21 | 5 → 6 | 0 → 2 | 5 → 7 |
| VM | 6 | 0 → 2 | 2 → 0 | 2 → 2 |
| G | 16 | 5 | 0 | 5 |
| CAP · T · ACP | 11 · 5 · 2 | 0 | 0 | 0 (se verifican por sus AC-xx.y) |

- **CAP-08 (aplicabilidad):** AC-08.1…AC-08.6, AC-08.8 y AC-08.9 tienen escenario y test. AC-08.7 es del agente (Post-MVP).
- **CAP-04 (faltantes):** AC-04.3…AC-04.5 tienen escenario y test. AC-04.1 y AC-04.2 son de US-003…US-005 (S4).
- **RN sin test:** quedan RN-08, RN-09, RN-16 y RN-18, todas de historias del S5, el S6 o Post-MVP.

## 3. Huecos priorizados

**Bloqueantes: 0.** Ninguna historia en Done tiene un AC sin test ni una RN sin verificar. Lo pendiente de las seis historias que siguen abiertas ya tiene historia de destino, así que no se propone ninguna historia nueva para el S4.

| # | Severidad | Hueco | Dueño | Propuesta |
|---|---|---|---|---|
| M-1 | Mayor | Seis changes con PR mergeado siguen activos (l1d-116, 117, 126, 244, 285 y us-117b). Sus 89 escenarios (deltas) no están en `openspec/specs/` y las historias vuelven a In Review | sesión principal / `/sprint-start S4` | Archivar cada uno cuando su destino quede cerrado o con el traslado aceptado como suficiente, y pasar la historia a Done. Orden de `clinical-catalogs`: 126 tras 93 (ya archivado) |
| M-2 | Mayor | La calidad de IA medida solo con adapters falsos queda bajo meta: fidelidad 0,75, citas 0,80 y M-08.3 = 0,70. M-08.4 depende de la muestra humana pendiente (L1D-117 2.3). Riesgo para G-Demo (S5) | US-233 (S4) y el usuario (revisión de la muestra) | Correr `evaluate --suite all` y `aplicabilidad` con modelos locales en US-233 antes de recalibrar, y registrar la revisión de la muestra |
| M-3 | Mayor | US-117b (#218, #222) y ARR-09 (#192) no tienen issue en Linear, por el límite del workspace: la cadena `L1D-nn → PR` se rompe | usuario | Al liberar cupo, crear el issue de US-117b o anotar su PR en L1D-116; mientras tanto, la fuente es `FEAT-06c` |
| M-4 | Mayor | L1D-125 (DEC-11) y L1D-92 (DEC-01) siguen en Backlog con milestone Sprint 3: el catálogo corre con `propuesta_revisada` | oncólogos, S4 | Cerrarlas en la sesión de oncólogos del S4. El cambio de milestone lo decide el humano |
| M-5 | Mayor | `l1d-72` y `l1d-202` tienen 0 tareas abiertas pero no se archivaron: L1D-72 y L1D-202 siguen en In Review desde el S2 | sesión principal | Archivarlos en la apertura del S4 (fuera del alcance de este cierre por indicación) |
| M-6 | Mayor | Arrastres con destino sin cerrar: us-231b (6 tareas → US-233), l1d-205 (5 tareas, ADR-40 → S5), l1d-166 5.2, l1d-173 5.1 y l1d-197 4.2 | orquestador del S4 | Revisarlos en `/sprint-start S4`; ninguno bloquea al S4 |
| m-1 | Menor | US-237 AC-6 («sin cambio de contrato») no tiene test con tag | frontend / CI | Etiquetar el caso de `contracts:check` o anotar en el AC que lo verifica el job `contracts` |
| m-2 | Menor | El escenario «Estadio de A-M1 sin escala ordenada» (`applicability`) no tiene tag de AC ni cita su base | ai-services | Añadir `[US-122 AC-1]` y «(decidido, usuario, 2026-10-28)» |
| m-3 | Menor | RN-07 (US-124) y RN-22 (US-117a) solo se citan en el contexto técnico | backlog-writer | Citarlas en los AC que ya las verifican (US-124 AC-2/AC-3) |
| m-4 | Menor | El tag `@pytest.mark.ac("S1", 29)` sigue colgado | ai-services | Re-etiquetar con el AC real (m-2 del S1) |
| m-5 | Menor | Espejo de Linear desactualizado: FEAT-T1a dice «US-127 (S5)» y FEAT-10a no lista US-237 | sesión principal | Sincronizar las descripciones con el Markdown en la próxima publicación |
| m-6 | Menor | `docs/PRD.md` §14 sigue sin alinear con el reordenamiento del 2026-10-23 (lo anota `CLAUDE.md`) | producto | Alinearlo en el refinamiento del S4 |

## 4. Cambios en Linear (2026-10-27)

- **Done confirmado, con comentario** (change archivado, PR y tests): L1D-93, 94, 98, 127, 128, 129, 130, 140, 141, 181, 182, 188, 287 y 288.
- **In Review → Done:** L1D-187.
- **Done → In Review, con comentario del hueco:** L1D-116, 117, 126, 244 y 285.
- **Features → Done:** L1D-23 (FEAT-10a), L1D-34 (FEAT-T1a) y L1D-36 (FEAT-T2a). En las tres, todas sus historias están en Done y sus changes, archivados.
- **Features que no cambian:**
  - L1D-14 (FEAT-04): faltan US-003…US-005 y DEC-01.
  - L1D-20 (FEAT-08b): faltan US-021, US-121 y US-126.
  - L1D-18 (FEAT-06c), L1D-47 (FEAT-T5b), L1D-37 (FEAT-T2b) y L1D-30 (FEAT-PL1): tienen historias abiertas.
- No se creó, borró ni re-estimó ningún issue, ni se cambió ningún milestone. No se escribieron datos reales ni secretos.
