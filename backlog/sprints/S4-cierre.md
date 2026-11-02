# S4 · Cierre (review y retrospectiva)

> Rama `sprint/S4-close`. Plan: [`S4-plan.md`](S4-plan.md) · Estado: [`S4-status.md`](S4-status.md) · Deuda: [`S4-deuda.md`](S4-deuda.md) · Trazabilidad: [`S4-trazabilidad.md`](S4-trazabilidad.md) · Guía de la Demo 4: [`docs/demo/guia-demo-S4.md`](../../docs/demo/guia-demo-S4.md).
> Cierre ejecutado el 2026-11-02 sobre `main` db43e9ea (CI, E2E y Push on main en verde).

## 1. Control: archivo y traslado

**Archivados (15)**, el 2026-11-02, en este orden (por dependencia de deltas): l1d-291, l1d-109, l1d-95, l1d-292, l1d-293, l1d-294, l1d-295, l1d-97, l1d-296, l1d-131, l1d-144, l1d-145, l1d-300, l1d-245, l1d-297.

Criterio aplicado (decidido por el usuario, 2026-11-02): la DoD vigente («Historia cerrada», 2026-10-29) admite `tasks.md` con todo `[x]` **o** con ID destino. Entran 8 con todas las tareas `[x]` y 7 con tareas diferidas con ID destino en `S4-deuda.md`:

| Change | Tareas abiertas → destino |
|---|---|
| l1d-296 | 2.2 → D4-22, D4-24 |
| l1d-131 | 1.1, 2.9 → L1D-297 tarea 2.10 → D4-35 |
| l1d-144 | 3.3, 4.1 → D4-39 (nueva en este cierre) |
| l1d-145 | 2.3, 2.6 → D4-37 |
| l1d-300 | 4.2, 5.1, 5.2, 6.1 → D4-30 |
| l1d-245 | 1.10 → D4-40 (nueva); 3.1–3.3, 4.1 → D4-21 |
| l1d-297 | 1.1, 1.4, 2.8–2.10, 3.1 → D4-35 (4.1 marcada `[x]` con evidencia) |

**Archivados con verificación empírica pendiente** (aceptado por el usuario, 2026-11-02): l1d-300 (AC-9: medición del segundo loop con el LLM local real, D4-30) y l1d-245 (AC-1: corrida real de los tres brazos, D4-21). El mecanismo está implementado y probado con adapters falsos; `QUERY_REWRITE_ENABLED=false` por defecto.

**Pasan al S5 (`movido-S5`):**

| Item | Motivo |
|---|---|
| l1d-298 (activo) | AC-2 (juez con el generador real, A+B bloqueante) y AC-7 (RSS en régimen estable) declarados **no cumplidos**; D4-01 → US-249 (L1D-305), D4-02 → L1D-297, D4-04/05 → L1D-299, D4-06 → US-232, D4-08 → L1D-297 |
| l1d-299 (activo) | Entrega **parcial** (PR #273): 1.1, 1.2, 1.11, 2.1 y 3.2 sin cerrar; D4-13, D4-07 y D4-05 al S5 |
| L1D-125 (sin change) | Firma de DEC-11: humano |

Ya mergeados y cerrados antes: L1D-290 (spike, informe `reports/spikes/s4-capacidad-paralelismo.md`) y L1D-302 (us-117b, archivado en #248).

**Conciliación hecha en este cierre:** 296 (2.2 con ID), 245 (1.10 → D4-40), 144 (3.3 y 4.1 → D4-39), 131 (texto «pendiente de aprobación» → «Decidido, D4-35»), 297 (4.1 `[x]`); filas D4-39 y D4-40 en `S4-deuda.md`.

**Fusiones de conflictos:** ninguna. Los deltas comparten capabilities (`evidence-analysis`, `evidence-panel`, `applicability`, `api-contracts`, `corpus-ingestion`, `patients-identity`) pero ningún requisito se modifica en dos changes (comparación por encabezado `### Requirement`).

**Ajuste de las specs principales para `--strict`:** 8 requisitos de más de 500 caracteres se redujeron moviendo casos borde y excepciones a escenarios nuevos del mismo requisito, sin cambiar ningún comportamiento ni identificador (applicability 1, evidence-analysis 4, evidence-panel 3), y se redactó el `Purpose` de `demo-install` (era `TBD`). Es la misma limitación de la herramienta que en el S3.

`openspec validate --specs --strict`: **25/25** · `--changes --strict`: **15/15**.

## 2. Verificación global sobre `main`

| Prueba | Resultado |
|---|---|
| `/opsx:verify` de los 15 changes (3 lotes) | 15 sin CRITICAL. 11 PASS limpios; WARN en 296, 131, 144, 145, 300, 245, 297 solo por tareas diferidas con destino. Escenarios que dependen de lo diferido: **300 AC-9** y **245 AC-1** (medición real), 297 AC-1 (revisión humana US-118: residuo de calidad de datos). Ojo: la verificación se hizo por rastro `[US-xxx AC-n]` y lectura, no ejecutando los tests |
| CI de `main` en db43e9ea | CI, E2E, Push on main: success |
| `contracts:check` · `catalog:validate` · `test:lenguaje` · `lint:lenguaje` | 33 reglas sin hallazgos · catálogo 1.2.0 OK · 5/5 · 0 hallazgos en 313 mensajes |
| Suite local `pytest` y tests de workspaces | **No ejecutada** (sin venv ni Docker en la máquina del cierre); la cubre la CI de `main` |
| `run-ai-eval` (`all` + aplicabilidad + población, adapters falsos) | **Sin regresión**: `all.json` idéntico byte a byte a `baseline.json`. Bajo meta (igual que el baseline, guion falso): fidelidad 0,75, citas 0,80, cobertura de población 0,70. Población: `no_concluyente` (sin revisor humano). Reporte: `reports/eval/s4-cierre.md` |
| D4-36 (`atribucion.con_formula` 5 vs 0) | **No es regresión**: el baseline ya vale 5; lo cambió el commit 5548afba (D4-19) porque el generador falso ahora antepone el marco de atribución. La métrica es tautológica (la reorienta D4-20). Propuesta: cerrar D4-36 como «sin regresión» |
| `/security-review` del diff `0b8e5d32..main` (732 ficheros) | **PASS: 0 críticos, 0 altos** |

Hallazgos de seguridad abiertos (ninguno bloquea):
- **Medio (preexistente):** `apps/web` no define cabeceras de seguridad (CSP, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`). Hoy no es explotable (React escapa; sin `dangerouslySetInnerHTML`). Agendar antes de G-Piloto, junto con HTTPS del S6.
- **Bajo:** `scripts/smoke/compose-smoke.sh` vuelca el log completo de `compose` en cada fallo (limitar a `tail -n 200`).
- **Bajo (nota):** ventana mínima entre `mktemp` y `chmod 600` en `levantar.sh`; `mktemp` ya da 0600, no pide cambio.

No medido: OCR crítico, PII, eventos, mapeo terminológico y sensibilidad de faltantes (no los incluye `all` con esta configuración); nada con el stack real (LLM local, embeddings, reranker, NLI, Milvus).

## 3. Trazabilidad

Reporte completo: [`S4-trazabilidad.md`](S4-trazabilidad.md); matriz regenerada: [`backlog/03-trazabilidad.md`](../03-trazabilidad.md).

**Cobertura (S3 → S4):** FR con spec 18 → 19 (con test 17 → 17); IA 5 → 7 (con test 5 → 7); HU 8 → 9; VM 2 → 3. Todos los IDs tienen historia y todas las RN citadas por el S4 tienen test.

**Bloqueantes (propuestas de historia para el S5; no se crearon issues):**
- B1: US-233a (L1D-298) con AC-2 y AC-7 no cumplidos y change sin archivar; enmendar la historia en FEAT-T5a.
- B2: US-233b (L1D-299) es entrega parcial: 1.1, 1.2, 1.11 y 2.1 abiertas.
- B3: US-133 AC-1, corrida real de los tres brazos (D4-21), no ejecutada.
- B4: US-238 AC-9, medición del segundo loop con el LLM local (D4-30, aún «Propuesto»).
- B5: falta la firma de DEC-11 (L1D-125).

**Mayores:** (M1) US-126 AC-7 del Markdown pide un literal del criterio de orden que el test comprueba que **no** aparece (se unificó la clave en el Gate 1): enmendar el AC en FEAT-08b. (M2) `[US-242 AC-9]` y `[US-233b AC-9]` tienen test y escenario pero no están en `backlog/features`. (M3) L1D-117 y L1D-244 estaban en Done con su change sin archivar. (M4) D4-16: **corregido en este cierre** (`evidence-analysis-gateway/spec.md:349` ahora cita `modules/compartido/estados-de-revision.ts`). (M5) L1D-290…300 no tienen Feature padre en Linear.

**Menores:** sin test con su etiqueta propia: US-241 AC-1 (lo cubre `contracts:check`/oasdiff), US-134 AC-2, US-247 AC-4 y AC-5, y el AC-1 de US-233a y US-233b. US-248 (`si-hay-capacidad`) está en Linear y no figura en `V2-Post-MVP.md`.

**Cambios en Linear hechos por el auditor** (solo estado y comentario; sin crear, borrar ni cambiar estimación o milestone):

| Issue | Antes → después | Motivo |
|---|---|---|
| L1D-144 | In Review → Done | Cadena completa; 3.3 y 4.1 con destino D4-39 |
| L1D-297 | In Review → Done | Cadena completa; pendientes con destino D4-35 |
| L1D-300 | Done → In Review | AC-9 sin verificar (D4-30) |
| L1D-245 | Done → In Review | AC-1 sin la corrida real (D4-21) |
| L1D-298 | Done → In Progress | AC-2 y AC-7 no cumplidos; change activo |
| L1D-299 | In Review → In Progress | Entrega parcial; tareas sin ID destino |
| L1D-305 (US-249, S5) | Done → Backlog | La automatización la cerró por el PR documental #266 |
| L1D-117, L1D-244 (S3) | Done → In Review | Change activo, sin archivar |

Done confirmados con comentario: L1D-291, 109, 95, 292, 293, 294, 295, 97, 296, 131, 145. Sin cambio: L1D-125 (Backlog, con comentario), L1D-290 y L1D-302 (Done). Ninguna Feature pasa a Done (FEAT-10c, L1D-25, tiene historias del S5). El milestone Sprint 4 sigue abierto.

**300 y 245:** el auditor los dejó en In Review (la DoD exige «AC verificados»); el usuario decidió el 2026-11-02 pasarlos a **Done** y así quedaron en Linear. Ver §5.

## 4. Review · Demo 4

Guion completo, con pares paciente + pregunta, conteos esperados y límites honestos: [`docs/demo/guia-demo-S4.md`](../../docs/demo/guia-demo-S4.md). Resumen del recorrido (datos **sintéticos**, Compose con `levantar.sh`):

1. **Ensayo previo (25 min)** y levantado con un comando (L1D-297); la verificación del seed cuenta documentos y población verificada antes de empezar.
2. **Ficha y checklist de faltantes** (L1D-95, L1D-97): `GET /completeness` y el aviso en la ficha y el panel.
3. **Par 1 «mama-her2-adyuvante»** y **Par 2 «mama-cdk46-excluyente»**: hasta 3 opciones ordenadas por aplicabilidad (L1D-144/145), tabla por criterio con Coincide / Parcial / No coincide / Desconocido y el criterio de orden visible (L1D-131), `optionsNotShown`, motivo de descarte separado (L1D-296).
4. **Población del estudio** extraída en la ingesta con alcance (elegibilidad / subgrupo / mención) y verificada con NLI (L1D-291, 292, 293, 294).
5. **Búsqueda híbrida** detrás de `RETRIEVAL_MODE` (L1D-109) y **segundo loop de reescritura** apagado por defecto (L1D-300); lo que se ve en vivo es lo dense.
6. **Prueba reproducible en modo fingido** (sección 4 de la guía) y límites honestos (sección 6): en vivo casi todo sale `Desconocido` (ADR-47), la medición con LLM real está pendiente (D4-30, D4-35, D4-21).

Acercamiento a G-Demo/G-Piloto: el S4 no cierra ninguno; avanza el eje «caso reconstruido → faltantes → opciones más aplicables». G-Demo es el S5 (sobrecargado: se recorta en su refinamiento).

## 5. Retrospectiva: lo implementado

**Puntos** (criterio: DoD «Historia cerrada»): comprometidos **73** (20 tarjetas) → **76** con D4-18 (1) y D4-19 (2); cerrados **66/73 = 0,90** por puntos de changes archivados (69/76 con D4-18 y D4-19). Historias cerradas ÷ comprometidas: **17/20 = 0,85** si se cuentan 300 y 245 (archivados, con la medición real diferida a D4-30 y D4-21); **15/20 = 0,75** con el criterio estricto de la DoD («AC verificados») que aplicó el auditor de trazabilidad, que los dejó en In Review en Linear (58 de 73 pts). **La meta ≥ 0,80 se cumple solo con el primer criterio.** Decidido por el usuario (2026-11-02): L1D-300 y L1D-245 pasan a **Done** (verificación empírica en D4-30 y D4-21); el cierre queda en **17/20 = 85 %**, con esa salvedad explícita.

Cerradas (puntos): 291 (3), 109 (5), 95 (3), 292 (5), 293 (5), 295 (5), 294 (3), 144 (5), 300 (5), 296 (2), 97 (5; reestimada de 3), 131 (5), 245 (3), 297 (7; reestimada de 5), 145 (3), L1D-290 (2), L1D-302 (0). Movidas al S5: 298 (3), 299 (3), 125 (1) = 7 pts.

**Decisiones del refinamiento que cambiaron durante el sprint:**
- L1D-97 pasó de 3 a 5 pts y se partió en dos entregas (deuda de `clinical-api` de L1D-95 primero); L1D-297 de 5 a 7 (absorbe `poblacion-reglas.json`, D4-03).
- Modo aceleración (2026-10-31, el usuario cierra el S4 «hoy»): Gate 2 de una vuelta y sin `design-principles-reviewer` en 144, 145 y 299; Mayores a deuda D4-25…D4-40 en 300 y 297.
- L1D-298: la meta AC-2 (A+B bloqueante con el generador real) y el AC-7 quedaron incumplidos y se trasladaron (D4-01 → US-249, D4-02 → 297).
- L1D-299 se entregó **en parte** (mejor esfuerzo); L1D-290 se resolvió como spike con informe (sin change).
- ADR-48 (US-248, sparse vacío) se investigó fuera del S4 (si-hay-capacidad); ADR-49 (alias Turbopack) quedó en borrador.
- Q-1 de L1D-109: se mantiene el 503 por consulta sin términos léxicos.

## 6. Retrospectiva: proceso agéntico (insumos del registro; R = registro, I = inferencia)

**Situaciones críticas y causa.** Pausas al humano ≥ 8, casi todas por permisos: denegación al agente de editar las excepciones ADR-26 (291 E-6…E-13; 295 E-14…E-17), de `npm ci` en el worktree y del commit («CI Bypass»); `.env.example` ilegible/inescribible por agentes (4 PR `chore` de la sesión principal: #246, #253, #265, #278); copia de reportes a `reports/eval/` denegada (#268, #275). Conflictos y PR apilados: #272 y #274 se mergearon contra la rama de 144 **después** de #271 y su contenido no llegó a `main` (se corrigió con #279); #276 estuvo dos rondas en rojo (ejemplos sin `optionsNotShown` y sin `queryRewrite`, que el fake valida al arrancar). CI de infraestructura (no código): egress de GitHub en #245, ECONNRESET en #243, test inestable D4-17, carrera de limpieza D4-18; #267 rompió el build de la imagen de `web` (Dockerfile sin `packages/*`), que ni Gate 2 ni tests locales construyen. Otras: dos `detached HEAD` del checkout principal por guardianes, candado obsoleto de `visual-check`, tope de 8 subagentes. La **automatización GitHub–Linear cerró a Done sin cumplir criterios** al menos 7 veces (293, 298, 97, 144, 297, 294, 145, 300).

**Gate 2 (vueltas por guardián).** Normal = 1 vuelta + re-gate acotado; `design` llegó a 4 pasadas en 294 y se cortó la tercera en 109 y 292 (verificación con mutantes). Hallazgos reales que el gate atrapó: conflicto fabricado en 293 (D-2) y el bug de `_recalculado`. Candidatos a falso positivo (I): AC-8 de 293 («invocaciones == 0») inalcanzable por defecto del AC; meta AC-2 de 298 imposible por construcción. Tabla por historia (R/I; reanudaciones aproximadas):

| L1D | Gate 2 (P privacy · C contract · L language · E eval · D design) | reanud. | design v1 → v2 |
|---|---|---|---|
| 291 | P2 C1 L1 E1 D2 | ~8 | 2P1+1P2 → 0 M |
| 109 | P1 C1 E1 D2 | ~6 | 3P1+1P2 → FAIL (M2a vivo) |
| 95 | P2 C1 D2 | ~6 | 4P1+2P2 → 1P1 |
| 292 | P2 L1 E1 D2 | ~3 | 4P1+3P2 → 3 M (tests) |
| 293 | P1 C2 L2 E2 D2 | ~3 | 3P1+5P2 → 0 |
| 295 | P1 C2 L2 E1 D2 | ~5 | 6P1+1P2 → 1 M |
| 294 | P1 L2 E1 D4 | ~4 | 3P1+2P2 → 2P2 |
| 298 | P1 L2 E2 D2 | ~4 (+agente nuevo) | 4P1+4P2 → 3 M |
| 97 | e1: P1 D2 · e2: P1 L1 D2 | ~3 | e1 2P1+7P3 · e2 3P2 |
| 245 | P1 E1 D2 | ~3 | 2P1+2P2 → 5 P3 |
| 131 | P1 L2 D2 | ~3 | 2 M → 1 M |
| 296 | P2 L2 D2 | ~3 | 2 M → 7 P3 |
| D4-19 | P1 E1 D2 | ~2 | 4P1 → 4 P3 |
| 144 | P1 C1 L1 E1 (sin D) | n/d | omitido |
| 145 | P1 L1 | n/d | omitido |
| 300 | P1 C1 L1 D1 | n/d | 5 M + 5 m a deuda |
| 297 | P1 C1 L1 E1 D1 | n/d | 4 M + 5 m a deuda |
| 299 | P1 | n/d | omitido |

**`design-principles-reviewer`.** P1 en **13 de 13** historias revisadas. La violación P1 que se repitió: **conocimiento de una regla duplicado** (95: `faltantesDe` ×3 y diagnóstico vigente de 4 formas; 109: defaults 60/0,3; 291: lector doble; 293: dos comparadores; 295: regla por papel ×3; 131: RN-25 y tabla de símbolos; D4-19: RN-23; 298: p50/p95) y, ligada a ella, **constantes «a calibrar» (RN-22) duplicadas o sin cablear a `Settings`** (109, 291, 294, 295). P2 repetido: **fakes que no cumplen el contrato del puerto** (95, 292, 245, 294, 295) y mutantes vivos con tests débiles. Refactors: casi todos aplicados en la vuelta 1; a deuda: 295 camino heredado (→ D4-19, hecho), 296 alias Turbopack (→ D4-22/ADR-49), 95 ciclos de módulo (→ L1D-97), 300 y 297 (→ D4-25…D4-35). Como la violación se repite, se propone regla nueva (M2 abajo).

**TDD.** 12 commits con trailer `Test-Removal:` en el rango (293 ×2, 294 ×2, 295 ×2, 296, 97, 298 ×2, D4-19, 144), casi todos «AC cambiado en la spec» por specs MODIFIED a mitad de historia; en D4-19 P1-4 se perdió un test de 295 en un commit rojo sin trailer. En 7 de 12 el trailer no queda en el último párrafo (lo separa `Co-Authored-By`), así que `git interpret-trailers` no lo ve (I). Orden `contract → test → feat` roto en 300 (D4-29), 144 y 109. Rojo inexistente (verde a la primera): 291 AC-2 (caracterización), 294, 97 P2.3, 145 E2E escrito y no ejecutado. Commits bloqueados por la higiene de tests: ninguno registrado. Rango: 392 commits, 78 `test(` y 76 `feat(`. (TDD Guard retirado en el cierre del Pre-S1; no hay piloto que evaluar.)

## 7. Mejoras propuestas (SIN aplicar; requieren tu aprobación)

Evaluación de las 6 propuestas ya anotadas en `S4-status.md`: **1** (retargetear hijos antes de mergear el padre) SÍ; **2** (no apilar) NO como regla, si se apila aplica la 1; **3** (serializar por módulo) PARCIAL, la regla existía y la aceleración la anuló; **4** (partir `index.json` y `S4-deuda.md`) SÍ, la de más valor; **5** (CI que valide ejemplos contra el schema de `main`) SÍ; **6** queda absorbida por la 5.

**M1 · Permisos como pre-flight** (≥ 8 pausas, ~2 PR `chore` por oleada). En `openspec/config.yaml`, `rules.tasks`:
```diff
+ - Todo cambio en .env.example, scripts/ci/contracts-breaking-excepciones.json o reports/eval/
+   va en una sección «## humano» con el bloque literal, tarea [ ] con ID H-<n>. El orquestador
+   agrupa los H-<n> de la oleada en UN PR chore abierto al inicio de la oleada.
```
y evaluar `Write(reports/eval/**)` para `ai-eval-runner` en la configuración de permisos (decisión tuya; no se toca sin tu aprobación).

**M2 · No omitir `design` en modo aceleración** (13/13 con P1; la deuda subió a D4-25…D4-40 donde se omitió). En `.claude/agents/sprint-orchestrator.md`, «Modo aceleración»:
```diff
+ design-principles-reviewer corre siempre: 1 pasada, solo P1 (regla duplicada, constante RN-22
+ sin Settings, fake sin contrato del puerto). P2/P3 van a S4-deuda.md.
```
Y en `openspec/config.yaml` (`rules.design`): «una regla de dominio tiene un solo dueño (buscar el literal antes del PR)» y «todo fake pasa el test de contrato del puerto real».

**M3 · PR apilados y ejemplos de contrato** (propuestas 1, 4, 5). En `sprint-orchestrator.md`:
```diff
+ Al mergear un PR padre, ANTES de cualquier otro merge: gh pr edit <hijo> --base main &&
+ gh pr update-branch <hijo>. Nunca mergear un hijo contra una rama que no sea main.
```
S5: generar `contracts/examples/index.json` desde un fichero por ejemplo y partir `S4-deuda.md` por fichero; job de CI que ejecute `contracts:check` contra `main` fusionado en cada PR que toque `contracts/examples/**`.

**M4 · Done prematuro en Linear y tareas sin destino** (≥ 7 devoluciones). (a) Los PR de historia usan `Refs L1D-nn`, no `Closes`; el `Done` lo pone solo `/sprint-close` (I: sin verificar qué dispara hoy la automatización). (b) CI nueva `scripts/ci/tasks-destino.mjs`: falla si un change del PR tiene `- [ ]` sin `D4-nn`, `H-n`, `US-nnn` o `L1D-nnn`.

**M5 · Higiene de commits TDD.** Hook `commit-msg` o paso del Gate 2: `Test-Removal:` en el último párrafo (parseable por `git interpret-trailers`; `Co-Authored-By` va después); comprobar el orden `contract → test → feat` por change, con el *bump* de versión en `contract`.

**M6 · Gate 2 que no ejerce lo que rompe la CI.** Si el diff toca imports `apps/web → packages/*` o `contracts/examples/**`, el checklist exige `docker build apps/web` y `contracts:check` tras `merge main`; los guardianes de solo lectura corren con `isolation: worktree`, nunca sobre el checkout principal.

## 8. Pendientes de decisión del humano

0. ~~L1D-300 y L1D-245 en Linear~~: decidido (2026-11-02) Done, con comentario en cada issue; medición real en D4-30 y D4-21 (S5).
1. Aprobar o rechazar cada mejora M1…M6 (ninguna se aplica sin tu sí).
2. Cerrar D4-36 como «sin regresión» (efecto de D4-19).
3. Tareas humanas: verificar `ANALYSIS_MAX_OPTIONS=3` en `.env.example` (D4-39 3.3); revisión humana de US-118 y limpieza de `linea` en `pmc-mama-cdk46-guia` (L1D-297 1.1, D4-35); firma de DEC-11 (L1D-125).
4. Aprobar D4-24 (pin de versión de la lista RN-23), hoy «propuesto».
5. Planificar para el S5: mantenimiento de dependencias D4-38 (Dependabot #228, #230, #237, #238) como primer bloque; las cabeceras de seguridad de `web` antes de G-Piloto.
6. Cerrar el milestone de Linear (lo hace el humano) tras el merge de este PR.
