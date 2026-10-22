# S2 · Auditoría de trazabilidad

> `traceability-auditor` · `/sprint-close S2` · 2026-10-22 · rama `sprint/S2-close` sobre `main` 11dc5cc8, con los 18 changes archivados el 2026-10-22 y sus deltas fusionados en `openspec/specs/`.
> Insumos: [`S2-plan.md`](S2-plan.md), `S2-status.md` (registro local del orquestador, sin versionar), [`S2-refinamiento.md`](S2-refinamiento.md), [`S2-deuda.md`](S2-deuda.md), [`S2-arrastre.md`](S2-arrastre.md), `openspec/changes/archive/2026-10-22-*`, los 18 changes abiertos, `openspec/specs/**`, `backlog/features/*.md`, `docs/PRD.md` v1.4 §17–§18, los PR #116…#180 (`gh pr list --state merged`) y la CI de `main` en 11dc5cc8.
> La matriz completa se regeneró en [`../03-trazabilidad.md`](../03-trazabilidad.md).
> Las decisiones ya tomadas no se cuentan como huecos nuevos: los traslados de `S2-deuda.md`, US-213b (L1D-285), US-232, US-233, US-234 y US-235.

## 1. Resumen del sprint

**Criterio de Done.** Es el mismo que en el S1. Una historia está en Done cuando cumple los cinco puntos:
1. Cada AC tiene al menos un test ejecutado y en verde.
2. El Gate 2 está en PASS.
3. El PR está mergeado.
4. El change está archivado.
5. Las tareas están completas.

Se admiten dos excepciones:
- Lo único que falta es el paso mecánico de marcar y archivar, porque la tarea ya se cumple en `main`.
- La tarea se trasladó por escrito a otra historia que sigue abierta.

Las ADR y DEC están exentas de tests (política TDD).

**Ejecución de tests.** La CI de `main` está en verde en 11dc5cc8. Pasan los flujos `CI`, `E2E` y `CodeQL`, con todos sus jobs: `build-test`, `contracts`, `quality`, `lint-lenguaje`, `data-scan`, `secret-scan`, `stack-smoke`, `integration`, `integration-rag`, `dependencies`, `eval-required`, `ci-ok` y `e2e`. Eso cierra B-1 y B-2 del S1:
- La integración de `clinical-api`, los Pytest `servicios_reales` y los E2E de Playwright ya corren en la CI.
- Solo quedan sin ejecutar los 13 Pytest `models`, que necesitan pesos reales.

| L1D | Historia | Change | Spec (openspec) | AC con escenario en la spec principal (+ solo en delta) | AC con test ejecutado | PR | Linear (antes → después) | Cadena |
|---|---|---|---|---|---|---|---|---|
| L1D-273 | US-223 · `bundleDocument` | `2026-10-22-l1d-273-bundle-redocly` | `api-contracts` | 3/3 | 2/3 (AC-3 sin test con tag; la inspección lo confirma: `lib/bundle.mjs` no existe y 72bdf5d9 lo borra) | #123 | Done → Done | **Completa** (m-1) |
| L1D-277 | ARR-01 · integración en CI | abierto: `l1d-277-ci-integracion-servicios-reales` | — (delta `ci-pipeline`) | 0/4 (+4) | 2/4 (AC-1 es el propio job, en `ci-ok`; AC-4 se trasladó a ARR-06) | #127 | Done → Done | Completa salvo archivar: la 3.2 ya se cumple en `main` y la 1.5 pasa a L1D-282 |
| L1D-200 | US-046 · identidad cifrada | `2026-10-22-l1d-200-identidad-cifrada-indice-ciego` | `patients-identity`, `data-model` | 6/6 | 6/6 (15) | #126 | Done → Done | **Completa** |
| L1D-264 | US-214 · verificación de proveedor | `2026-10-22-l1d-264-verificacion-proveedor` | `api-contracts` | 6/6 | 5/6: AC-4 lo cubren tests sin su tag (`ac7-generado-desactualizado`, `generado.test.mjs`) | #133 | In Review → **Done** | **Completa** (m-1). Preguntas de `design.md` decididas `[S2 resp. 19]` |
| L1D-167 | US-037 · configuración y logs | `2026-10-22-l1d-167-config-validada-logs-json` | `platform-stack`, `platform-observability`, `real-data-gate`, `api-contracts` | 6/6 | 6/6 (38) | #131, #144 | Done → Done | **Completa** |
| L1D-199 | US-045 · usuarios y RBAC | `2026-10-22-l1d-199-usuarios-cli-rbac` | `auth-session` | 6/6 | 6/6 (16) | #128 | Done → Done | **Completa**. La parte de AC-4/AC-6 que pertenece a L1D-72 está en su delta |
| L1D-278 | ARR-02 resto · E2E en CI y `/login` | abierto: `l1d-278-e2e-ci-login-tailwind` | — (deltas `ci-pipeline`, `auth-session`) | 0/4 (+2) | 4/4 (AC-2 y AC-4 con los tests de US-060 AC-3 y US-211 AC-1/AC-4) | #129 | In Review → **Done** | Completa salvo archivar: la 1.5 y la 3.2 ya se cumplen con el flujo `E2E` en verde en `main` |
| L1D-171 | US-041 · catálogo montado y `409` | `2026-10-22-l1d-171-catalogo-montaje-version` | `clinical-catalogs`, `api-contracts`, `evidence-analysis-gateway`, `platform-observability` | 5/5 | 5/5 (14; AC-3 en `stack-smoke`) | #135 | In Review → **Done** | **Completa**. Hay 2 preguntas sin ID (M-6) |
| L1D-198 | US-044 · expiración y bloqueo | `2026-10-22-l1d-198-sesion-expiracion-bloqueo` | `auth-session` | 5/5 | 5/5 (34) | #138 | In Review → **Done** | **Completa**. Hay 3 decisiones sin ID (M-6) |
| L1D-186 | US-066 · Base del análisis | `2026-10-22-l1d-186-base-analisis-builder` | `analysis-basis`, `evidence-analysis-gateway` | 6/6 | 6/6 (8) | #134 | In Review → **Done** | **Completa**. Hay 4 preguntas sin ID (M-6) y el AC-1 del Markdown no recoge el supuesto (m-3) |
| L1D-232 | US-014 · ADR-41 | `2026-10-22-l1d-232-adr41-framework-evaluacion` (`skip_specs`) | — | exenta (ADR) | exenta | #132 | In Review → **Done** | **Completa**. La cabecera del ADR dice «propuesto» (m-4) |
| L1D-56 | US-076 · carga de PDF | `2026-10-22-l1d-56-carga-documento-api` | `documents-ingestion` | 8/8 | 8/8 (12) | #145 | Done → Done | **Completa**. La deuda pasa a US-235 (DEC-21) |
| L1D-173 | US-043 · tipos habilitados | abierto: `l1d-173-tipos-cancer-habilitados` | — (deltas `clinical-catalogs`, `evidence-analysis-gateway`) | 0/5 (+5) | 5/5 (14) | #142, #156 | In Review → **Done** | Cerrada en el S2 por `[S2 resp. 18]`: 4.3 y 4.4 pasan a US-079 y la 5.1 está hecha. Falta marcar y archivar |
| L1D-187 | US-067 · panel de la Base | abierto: `l1d-187-panel-base-analisis` | — (delta `analysis-basis`) | 0/5 (+5) | 5/5 (11; los E2E de AC-1 y AC-3 corren en `main`) | #139 | In Review → In Review | **Con hueco:** falta el `visual-check` (2.8). La 2.7 y la 3.2 ya se cumplen en `main` |
| L1D-235 | US-072 · suite `evaluate` | `2026-10-22-l1d-235-suite-evaluate` | `ai-evaluation` | 7/7 | 7/7 (11) | #136, #159 | Done → Done | **Completa**. La corrida con modelos reales es de US-233 |
| L1D-202 | US-048 · listado y búsqueda | abierto: `l1d-202-listado-busqueda-pacientes` | — (deltas `patients-identity`, `data-model`) | 0/7 (+7) | 7/7 (79) | #161, #165, #177 | In Review → In Review | **Con hueco:** el E2E 3.3 del AC-1 no está escrito y su destino, L1D-278, no lo cubre (M-1). El rate limit y la auditoría están en US-234 |
| L1D-205 | US-013 · ADR-40 | abierto: `l1d-205-adr40-deteccion-pii` (`skip_specs`) | — | exenta (ADR) | 2/6 con tests (AC-1, AC-4) | #141 | In Review → In Review | **Con hueco:** el ADR sigue «propuesto» a la espera de que el usuario elija el motor de nombres en documentos. Quedan 5 tareas: 1.4, 1.6, 3.1, 4.2 y 4.3 (B-1) |
| L1D-170 | US-040 · rol `rag_corpus` | `2026-10-22-l1d-170-rol-rag-corpus-permisos` | `data-model` | 6/6 | 6/6 (17; AC-4 en `stack-smoke`) | #140 | In Review → **Done** | **Completa**. Hay 2 decisiones sin ID (M-6) |
| L1D-72 | US-051 · ficha mínima | abierto: `l1d-72-ficha-minima-paciente` | — (delta `patients-identity`) | 0/6 (+6) | 6/6 (31) | #172 | In Review → In Review | **Con hueco:** el E2E 3.3 (AC-1, AC-2 y AC-5) no está escrito y su destino, L1D-278, no lo cubre (M-1) |
| L1D-236 | US-073 · calibración del umbral | `2026-10-22-l1d-236-calibracion-umbral-baseline` | `ai-evaluation` | 3/4 | 3/4 | #154 | Done → Done | **Completa** por decisión: el AC-2 (baseline real) pasa a US-233 AC-8 `[S2 resp. 19]` |
| L1D-237 | US-074 · `eval-required` | `2026-10-22-l1d-237-eval-required-ci` | `ai-evaluation` | 6/6 | 6/6 (59) | #155 | Done → Done | **Completa**. El umbral de regresión definitivo depende de DEC-07 (M-2) |
| L1D-267 | US-217 · auditoría de dependencias | `2026-10-22-l1d-267-auditoria-dependencias` | `ci-pipeline` | 4/4 | 4/4 (20) | #137 | In Review → **Done** | **Completa**. La excepción de `braces` caduca el 2026-11-20 y su confirmación no tiene ID (M-6) |
| L1D-279 | ARR-03 · OL-06 sobre lo implementado | sin change (por plan) | — | — | AC-3 y AC-4 con `test_rn23_corpus_citado.py` y `reports/eval/L1D-279-ol06-rn23.md`; AC-1, AC-2 y AC-5 pasan a US-233 | #163 | Done → Done | **Completa** por decisión `[S2 resp. 16]` (m-1: tests sin tag ARR-03) |
| L1D-282 | ARR-06 · conciliación del S1 | sin change (por plan) | — | — | documental | #153 | In Review → In Review | **Con hueco:** AC-3 (protección de `main`, solo el administrador; caso `ac2-cited-sources-build`) y AC-5 (issues de US-231a/b, bloqueados por el límite del workspace) |
| L1D-234 | US-017 · DEC-07 | sin change (decisión) | — | exenta | exenta | — | Backlog → Backlog | **Sin hacer:** no existe `docs/decisions/DEC-07-*`. Depende del baseline real, que pasó a US-233 (S4) (M-2) |
| L1D-263 | US-213a · capas y umbrales | `2026-10-22-l1d-263-calidad-capas-umbrales` | `code-quality` | 7/7 (AC-1…AC-7) | 7/7 (68) | #157, #173 | Done → Done | **Completa**. AC-8…AC-12 pasan a US-213b (L1D-285, S3) |
| L1D-280 · 283 · 284 | ARR-04 · ARR-07 · ARR-08 (cerradas antes del inicio del S2) | sin change | — | **ARR-07 0/5, ARR-08 0/6** | ARR-07 1/5 y ARR-08 3/6 con tag; el resto con tests sin tag (manifiesto, `details`, soporte) | #107, #116, #118 | Done → Done | Código y tests en `main`, pero sin escenarios en OpenSpec (M-5) |

**Conteo de historias del plan del S2 (26 issues):**
- **Done: 20.** 11 confirmadas y 9 pasadas a Done en este cierre.
- **In Review: 5.** L1D-187, 202, 205, 72 y 282.
- **Backlog: 1.** L1D-234 (DEC-07).

Además, ARR-04, ARR-07 y ARR-08 siguen en Done (cerradas antes del inicio del sprint).

**Verificaciones del cierre:**
- **Alcance inventado:** no hay.
  - Hay 5 escenarios sin tag de AC en los changes archivados hoy: 2 de `l1d-186`, 2 de `l1d-235` y 1 de `l1d-56`. Todos se rotulan «asumido» y citan su base: Gate 1, ADR-41 D2 o la matriz de permisos de `data-model`.
  - Ningún tag de test ni de escenario apunta a un AC inexistente, salvo el `@pytest.mark.ac("S1", 29)` que ya venía del S1 (m-2 del S1, sigue abierto).
- **PR y changes:**
  - Los 18 changes archivados hoy tienen su PR `[L1D-nn]` mergeado. `l1d-114` y `l1d-265` son del S1 (#42/#45 y #36/#38).
  - Todo PR `[L1D-nn]` del sprint tiene change, salvo los previstos sin change (L1D-279 y L1D-282) y L1D-283/L1D-284 (M-5).
  - Los demás PR son *chores*, `fix` de CI, Dependabot o documentación del backlog, y no implementan AC.
- **RN citadas por las historias del S2:** todas tienen al menos un test ejecutado ligado a un AC de la historia:
  - RN-10, RN-12, RN-13, RN-14, RN-17, RN-20, RN-22, RN-26 y RN-27.
  - RN-02, RN-06 y RN-07, en US-066.
  - Las únicas sin test son RN-12 y RN-14 en US-014 y RN-22 en US-017, que son ADR/DEC y están exentas.
- **Regresiones 🔗 cuyo sprint ya llegó:**
  - `Regresión [RN-10] → US-046` (identidades del seed, activa desde S2): la cubre US-046 AC-6, con 3 tests.
  - Los pasos «consultar la ficha» (L1D-72) y «buscar por documento y por nombre» (L1D-202) ya están en el mismo test de no-fuga (`tests/integration/identidad/no-fuga.test.ts`), como pide el escenario de US-046 AC-4.
  - `Regresión [RN-23] → US-068`: la cubre `lint:lenguaje` sobre los textos nuevos de `web`.
- **Historias `movido-S3` en Done:**
  - Las 9 historias del S1 cuyos changes siguen abiertos (115, 140, 166, 180, 193, 194, 197, 238 y 275) están en Done desde el cierre del S1 (decisión del usuario del 2026-10-18, con «verificación diferida» a las tarjetas ARR). No se tocan: son del milestone Sprint 1. Su detalle está en M-3.
  - Del S2 se mueven al S3 7 changes. Las historias de 277, 278 y 173 quedan en Done porque solo falta marcar y archivar. Las de 187, 202, 72 y 205 siguen en In Review.

## 2. Cobertura por familia (matriz regenerada)

| Familia | Universo | Con historia | Con spec (openspec) S1 → S2 | Solo en changes sin archivar | Con test ejecutado S1 → S2 |
|---|---|---|---|---|---|
| FR | 31 | 31 | 9 → **14** | 2 | 10 → **15** |
| RN | 30 | 30 | 24 → 24 | 1 | 21 → **24** |
| NFR | 14 | 14 | 5 → **9** | 0 | 7 → **9** |
| SEG | 13 | 13 | 5 → **10** | 0 | 7 → **10** |
| IA | 11 | 11 | 2 → **4** | 1 | 4 → **5** |
| CAP | 11 | 11 | 0 | 0 | 0 |
| T | 5 | 5 | 0 | 0 | 0 |
| AC (PRD §18.3) | 54 | 54 | 5 → **8** | 4 | 9 → **12** |
| ACT | 23 | 23 | 5 → **13** | 4 | 10 → **17** |
| ACP | 2 | 2 | 0 | 0 | 0 |
| M | 36 | 36 | 2 → **5** | 1 | 6 → 6 |
| HU | 26 | 26 | 2 → **5** | 1 | 2 → **6** |
| OL | 6 | 6 | 4 → **6** | 0 | 5 → **6** |
| TBD | 21 | 21 (TBD-05 como exclusión) | 2 → **5** | 0 | 3 → **5** |
| VM | 6 | 6 | 0 | 2 | 2 → 2 |
| G | 16 | 16 | 3 → **5** | 0 | 4 → **5** |

**Cambios de método respecto del S1:**
- **«Test» cuenta como ejecutado** todo lo que corre la CI de `main`: también `integration`, `integration-rag` (`servicios_reales`) y `e2e`. Solo quedan fuera los Pytest `models`. En el S1, la integración contaba por la corrida local del cierre.
- **Nuevos orígenes de tests:** los chequeos `bien "US-xxx AC-n …"` de `scripts/smoke/compose-smoke.sh` (job `stack-smoke`). De ahí sale la evidencia de US-040 AC-4 y US-041 AC-3.
- **Deltas:** se excluyen las secciones `REMOVED` de los deltas abiertos.
- **US-213** aparece con sus dos issues (L1D-263 · L1D-285). **US-232…US-235** entran a la tabla de historias como «pendiente» (sin issue: límite del workspace). DEC-01 (L1D-92) aparece como fila propia.
- **Generador:** sigue siendo temporal y fuera del repo (m-5).

**Por qué baja RN-26 de 1 escenario a 0 en la spec principal:** el escenario de `evidence-analysis-gateway` que lo citaba se reescribió al fusionar `l1d-186`. Hoy RN-26 tiene 5 escenarios en los deltas abiertos de L1D-72 y L1D-202 y 8 tests ejecutados (US-051).

## 3. Huecos priorizados

### Bloqueante

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| B-1 | **ADR-40 (US-013, L1D-205) sigue «propuesto»: ningún candidato alcanza G-8 (≥ 0,95) en nombres dentro de documentos, y el motor queda sin elegir** («Decisión pendiente del usuario», opciones A/B/C). FEAT-01b del S3 depende de él: US-083 (cuarentena por PII) está ⛔ por ADR-40, y la «deuda/decisión 7» (formatos ampliados en B1) es condición de `preflight real-data`. Quedan 5 tareas abiertas en el change (1.4 RSS con el stack, 1.6, 3.1 revisión de `ai-eval-runner`, 4.2 y 4.3) | Usuario (decisión) · `ai-services-dev` | Antes del planning del S3, elegir A (segunda medición, la recomendada en el ADR) o B (G-8 parcial con cuarentena obligatoria). Si es A, añadir la medición como primera tarea de US-083 o de un *spike* sin historia nueva. Luego cerrar 1.4, 3.1, 4.2 y 4.3 y archivar `l1d-205` |

### Mayor

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| M-1 | **E2E diferidos a una tarjeta que no los cubre.** US-048 AC-1 (`l1d-202` 3.3) y US-051 AC-1, AC-2 y AC-5 (`l1d-72` 3.3) se difirieron a L1D-278 «si el job de E2E no está en `main`». El job ya está y corre en verde, pero los specs de Playwright de listado y ficha no existen (en `apps/web/e2e/` no hay ningún `[US-048 …]` ni `[US-051 …]`). L1D-278 no los incluye en sus AC | Planning del S3 | **AC a añadir** a US-079 (S3, L1D-59), que ya recibe 4.3 y 4.4 de L1D-173 y usa la misma ficha: «Given Compose con seed sintético, when corre el job `e2e`, then `/pacientes` lista los cinco pacientes semilla con SINTÉTICO [US-048 AC-1] y la ficha muestra diagnóstico, biomarcadores y origen de cada valor, y un UUID inexistente muestra "Paciente no encontrado" [US-051 AC-1, AC-2, AC-5]». Reescribir el destino de las dos 3.3 con ese ID y archivar los changes |
| M-2 | **DEC-07 (US-017, L1D-234) no se tomó** y sigue en el milestone Sprint 2. Necesita el baseline real, que pasó a US-233 (S4). Sin ella, `eval-required` (US-074 AC-5) usa un umbral de regresión provisional | Usuario (PO) · planning | Mover DEC-07 al S4, después de US-233 (la decisión de milestone es del usuario; este agente no la cambia), y anotar en US-074 que el umbral vigente es provisional hasta DEC-07 |
| M-3 | **Changes del S1 en el S3 con historias en Done (decisión del 2026-10-18):** las tareas que quedan apuntan a destinos ya cerrados o sin cubrir. Ver la tabla de §3.1 | Sesión principal (primer *chore* del S3) | Conciliar y archivar en un PR `chore`. Varias ya se cumplen en `main`: 197 3.5 con L1D-278 2.6 y 4.2 con el flujo `E2E`; 231a 3.2 y 3.3, y 231b 4.3, con L1D-263; 193 5.1, en la parte con *fakes*, con #163. Las demás llevan un ID vivo |
| M-4 | **7 changes del S2 sin archivar** (`l1d-173`, `187`, `202`, `72`, `205`, `277` y `278`). Por eso la spec principal no tiene los escenarios de US-043, US-067, US-048, US-051, ARR-01 y ARR-02: 29 AC solo en deltas | Sesión principal (S3) | Archivar ya `l1d-173`, `l1d-277` y `l1d-278` (solo falta marcar). Archivar `l1d-187` tras su `visual-check`, `l1d-202` y `l1d-72` tras M-1, y `l1d-205` tras B-1 |
| M-5 | **ARR-07 y ARR-08 (L1D-283, L1D-284) se implementaron sin change de OpenSpec:** 0/11 AC con escenario. ARR-08 añadió `details` al contrato `EvidenceOption` y subió el prompt a `rag-query@0.2.0`. Los tests existen, pero 7 de los 11 AC no tienen tag (manifiesto `original_url`, `source_url` en el catálogo, esquema `details`, soporte de párrafos). ARR-07 AC-2 (10 URLs https en el manifiesto real) no tiene test | Sesión principal · `ai-services-dev` | Delta retroactivo sin código en el primer *chore* del S3: requisitos en `corpus-ingestion` (ARR-07 AC-1…AC-3) y `evidence-analysis` (ARR-08 AC-1…AC-3), con un escenario por AC, y tags `[ARR-07 AC-n]` / `[ARR-08 AC-n]` en los tests existentes. La evaluación del prompt 0.2.0 ya está en US-233 |
| M-6 | **Preguntas y decisiones para el humano sin ID** en `design.md` de changes archivados hoy. Una tiene fecha límite: la excepción de `braces` (L1D-267) caduca el **2026-11-20** y entonces `dependencies` fallará en todos los PR | Usuario | Responder en `/sprint-close` o asignarlas a una historia. **L1D-267:** confirmar la excepción y la desviación de AC-4 (`docker` en `apps/*`). **L1D-171:** quitar `cups` del enum hasta DEC-04 y declarar o no `CLINICAL_CATALOG_VERSION` en `.env.example` y en `rag-orchestrator`. **L1D-186:** traducción de etiquetas internas, `origin` del supuesto y texto libre de atributos (ADR-34), que deciden en US-067/L1D-187. **L1D-198:** `TRUST_PROXY_HOPS` con el proxy del S6, agrupación IPv6 /64 y borrado de la cookie en el `401` de logout, que van a US-144/US-216 (S6). **L1D-170:** *timeouts* de `ALTER ROLE` y dueño del schema `corpus`, que van a ADR-43 |

#### 3.1 Tareas abiertas de los changes del S1 que pasan al S3 (detalle de M-3)

| Change (historia, Linear) | Tareas abiertas | Destino escrito | Estado real / propuesta |
|---|---|---|---|
| `l1d-115` (US-059, L1D-115 Done) | 1.13, 2.1 | L1D-106 2.13b (= US-231b 1.12) · ninguno | 1.13: *smoke* con pesos reales, va a US-233. 2.1: OL-06 del corpus, va a US-233 |
| `l1d-140` (US-061, L1D-140 Done) | 2.7, 3.5 (`visual-check` del panel) | L1D-278 | L1D-278 2.6 solo cubrió el panel a 1280 px. **Sin destino vivo:** se hace en el *chore* de M-3 con la skill `visual-check` o se añade como tarea a la próxima historia del panel |
| `l1d-166` (US-036, L1D-166 Done) | 5.2 | L1D-277 1.5 / L1D-282 AC-3 | Sigue en L1D-282 (In Review). Requiere al administrador |
| `l1d-180` (US-064, L1D-180 Done) | 3.1, 4.4 | L1D-279 | L1D-279 la trasladó a US-233. Reescribir el destino |
| `l1d-193` (US-068, L1D-193 Done) | 5.1 | L1D-279 | La parte con *fakes* está hecha en #163. La parte con LLM real va a US-233 |
| `l1d-194` (US-069, L1D-194 Done) | 3.3 (`visual-check` del *layout*) | L1D-278 | Igual que `l1d-140` |
| `l1d-197` (US-211, L1D-197 Done) | 3.5, 4.2 | D-3 / L1D-278 | **Ya cumplidas en `main`:** el `visual-check` de `/login` (L1D-278 2.6) y los E2E de US-211 AC-1 y AC-4 en el flujo `E2E`. Marcar y archivar |
| `l1d-238` (US-075, L1D-238 Done) | 3.5 | L1D-281 (ARR-05, S4) | Vivo |
| `l1d-275` (US-225, L1D-275 Done) | 3.1 | ninguno | Evaluación del prompt con el LLM real, va a US-233 |
| `us-231a` (sin issue) | 3.2, 3.3 | — | Ya cumplidas (ruta rápida de Pytest y `import-linter` de L1D-263). Marcar y archivar |
| `us-231b` (sin issue) | 1.0, 1.11, 1.12, 2.1, 4.2 (`models`), 4.3 | L1D-280 (Done) · L1D-263 | 4.3 cumplida. 1.11, 1.12 y 4.2 apuntan a L1D-280, ya cerrada: **pasar a US-233** o adjuntar la salida si ARR-04 la midió |

### Menor

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| m-1 | AC con test que no lleva su tag: US-214 AC-4 (caso `ac7-generado-desactualizado`, que lleva `US-036 AC-7`), ARR-03 AC-3 y AC-4 (`test_rn23_corpus_citado.py`) y los de M-5. US-223 AC-3 es estructural y se verifica por inspección | Implementadores | Añadir el tag del AC al nombre del test o al `"ac"` del caso. En US-223 AC-3, un test de humo «`scripts/contracts/lib/bundle.mjs` no existe y nadie lo importa [US-223 AC-3]» |
| m-2 | `@pytest.mark.ac("S1", 29)` en `test_rag_query_soporte_nli.py` (m-2 del S1, sin cambios) | L1D-180 | Igual que en el S1 |
| m-3 | El Markdown de US-066 AC-1 dice `assumptions = []`, pero la spec, por la adaptación del Gate 1, exige un supuesto declarado. El AC de la historia no se actualizó | Sesión principal | Actualizar el AC-1 en `FEAT-T2a` (Markdown primero; Linear cuando haya cupo) |
| m-4 | La cabecera de ADR-41 y `backlog/02-adrs.md` siguen en «propuesto», aunque el propio ADR dice que lo acepta el humano al mergear (#132, 2026-10-21) | Sesión principal | Pasar el estado a «aceptado (2026-10-21, #132)» |
| m-5 | La matriz se sigue regenerando con un script temporal fuera del repo (m-5 del Pre-S1 y del S1) | `traceability-auditor` | Versionar el generador (`scripts/backlog/trazabilidad.py`) con aprobación |
| m-6 | La automatización GitHub → Linear siguió pasando a Done al mergear: el orquestador devolvió más de diez historias a In Review durante el S2 | Usuario | Desactivarla o limitarla a In Review (m-7 del S1) |
| m-7 | Deuda del registro del orquestador sin historia ni entrada en `S2-deuda.md`: vectores dorados comunes Ajv/jsonschema, lector único de `CLINICAL_CATALOG_PATH` en `rag-orchestrator`, migración de logs antiguos de `rag` a `registrar_evento`, `traceId` y `userId` en el log de la CLI, `chmod +x` del bin, nivel TRACE de `uvicorn.asgi`, registrador de rutas de L1D-199, `apps/web` con Zod refinado, retiro de `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT` (sigue en `.env.example` y Compose) y `run-ai-eval` apuntando a `data/evaluation/` | Sesión principal | Añadir una fila a `S2-deuda.md` con destino: US-232 para la de calidad de `clinical-api`, US-216 para la de `web` y el primer *chore* del S3 para el retiro de la clave y la ruta de `run-ai-eval` |

### Huecos del S1

| # | Estado |
|---|---|
| B-1 (la CI no ejecuta la integración) | **Cerrado:** jobs `integration` e `integration-rag` en `ci-ok`, en verde (ARR-01, #127) |
| B-2 (US-058/US-059 sin test ejecutado) | **Cerrado** para US-058: change archivado, 5/5 AC con test en `integration-rag`. US-059: 6/6 AC con test ejecutado; el *smoke* con pesos (AC-1, `models`) sigue sin correr (M-3) |
| M-1 (17 changes sin archivar) | Parcial: se archivaron `l1d-106`, `203`, `265`, `114`, `139` y `274`. Pasan al S3 11 changes del S1 (M-3) |
| M-2 (`tasks.md` de 194 y 275 sin conciliar) | Cerrado por L1D-282 (#153). Quedan las tareas con destino de M-3 |
| M-3 (E2E y `visual-check` sin ejecutar) | **Cerrado** para los E2E (flujo `E2E` en verde). El `visual-check` de 140 y 194 sigue abierto (M-3) |
| M-4 (OL-06 sin ejecutar) | Parcial: la suite existe (US-072) y corre en la CI con *fakes*. Con modelos reales, en US-233 (S4) |
| M-5 (US-224 sin cifras) | Cerrado (ARR-04, `l1d-274` archivado el 2026-10-20) |
| M-6 (baseline VM) | Movido a ARR-05 (L1D-281, S4) |
| M-7 (RN-06 sin bloqueo de `DELETE`/`TRUNCATE`) | Sin cambios: deuda sin ID en `backlog/features/README.md` (ARR-06 AC-6) |
| M-8 (US-231a/b sin issue) | Sin cambios: el límite del workspace lo impide |
| M-9 (deuda D-n sin ID) | D-2 y D-3 cerradas (L1D-278). D-9 se decidió para el S6 (US-216) |

## 4. Propuesta de historias y AC para el S3 (no creadas: el workspace llegó al límite de issues)

1. **AC nuevo en US-079 (L1D-59, S3):** los E2E de listado y ficha de M-1, junto a las 4.3 y 4.4 de L1D-173 que ya tiene asignadas.
2. **Chore de conciliación del S3 (sin historia; PR `chore`):**
   - marcar y archivar `l1d-173`, `l1d-277`, `l1d-278`, `l1d-197`, `us-231a` y las tareas cumplidas de M-3;
   - reescribir los destinos hacia US-233;
   - delta retroactivo de ARR-07 y ARR-08 (M-5);
   - estado de ADR-41 (m-4);
   - AC-1 de US-066 (m-3).
3. **Decisión del usuario antes del planning:** B-1 (motor de nombres de ADR-40). Si elige la opción A, la segunda medición entra como primera tarea de US-083.
4. **Movimiento de milestone (lo decide el usuario):** DEC-07 (L1D-234) al S4, tras US-233.
5. **Tests a escribir (sin historia nueva):** los tags de m-1 y un test de humo para US-223 AC-3.

## 5. Linear

Solo se cambió el estado y se añadió un comentario con la cadena (change, PR y tests) o con el hueco. No se crearon ni borraron issues, ni se cambiaron estimaciones ni milestones, y ninguna Feature pasó a Done.

| Issue | Antes | Después | Motivo |
|---|---|---|---|
| L1D-264, 171, 198, 186, 170, 267 | In Review | **Done** | Change archivado con tareas completas, AC con test en verde en la CI de `main`, Gate 2 en PASS y PR mergeado. Las preguntas sin ID se registran aquí (M-6) |
| L1D-232 (ADR-41) | In Review | **Done** | ADR mergeado (#132) y change archivado con 6/6 tareas. m-4 |
| L1D-173 | In Review | **Done** | Cerrada en el S2 por `[S2 resp. 18]`: 4.3 y 4.4 pasan a US-079 y la 5.1 está hecha. Falta marcar y archivar (M-4) |
| L1D-278 (ARR-02) | In Review | **Done** | La 1.5 y la 3.2 se cumplen con el flujo `E2E` en verde en `main` 11dc5cc8. Falta marcar y archivar |
| L1D-273, 277, 200, 199, 167, 56, 263, 235, 236, 237, 279 | Done | Done (confirmado) | Cadena completa o traslados decididos (US-213b, US-233, US-235) |
| L1D-187 | In Review | In Review | Falta el `visual-check` (2.8) |
| L1D-202, L1D-72 | In Review | In Review | E2E 3.3 sin escribir y con un destino que no los cubre (M-1) |
| L1D-205 (ADR-40) | In Review | In Review | ADR propuesto, con la decisión del usuario pendiente y 5 tareas abiertas (B-1) |
| L1D-282 (ARR-06) | In Review | In Review | AC-3 y AC-5 pendientes (administrador y límite del workspace) |
| L1D-234 (DEC-07) | Backlog | Backlog | Sin hacer. Depende de US-233 (M-2). Sin comentario |
| L1D-280, 283, 284 | Done | Done | Cerradas antes del S2. L1D-283 y L1D-284 llevan comentario por M-5 |
| Features (L1D-30, 31, 32, 36, 40, 46, 6, 9) | — | Sin cambios | Este cierre no pasa Features a Done (instrucción del orquestador) |
