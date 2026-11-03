# Tasks — l1d-195-analisis-sin-escrituras

> TDD estricto (AC-T3.2 es invariante de dominio). Cada test de aceptación se ejecuta **primero**: si falla en la
> aserción, va en rojo en `test(L1D-195)` antes del `feat(L1D-195)`; si pasa a la primera, queda como **caracterización**
> en `test(L1D-195)` con su salida y una mutación local no commiteada que lo hace fallar (patrón `l1d-181` D4).

## 1. contratos

- [ ] 1.1 (exento: sin cambio de spec) Confirmar con `contracts:check` y `contracts:breaking` que el change no toca
      `apps/clinical-api/openapi.yaml` ni `apps/rag-orchestrator/openapi.yaml` (0 diferencias).

## 2. clinical-platform

- [ ] 2.1 (test después: soporte de test) `apps/clinical-api/tests/support/instantanea-de-tablas.ts`:
      `instantaneaDeTablas(cliente, { schemas: ['clinical', 'identity'] })` → `{ [tabla]: { filas, hash } }` con
      `md5(string_agg(t::text, '|' ORDER BY <pk>))`, y `tablasConDiferencia(antes, despues)`; reutiliza
      `tablasDelCatalogo()` de `tests/support/catalogo.ts` (design D1, D2). Test unitario del ayudante contra la base de
      test: detecta un `INSERT` y un `UPDATE` de `review_status` hechos en el propio test.
- [ ] 2.2 (TDD estricto · aceptación) En `tests/integration/evidence-analysis/analisis-sin-escrituras.test.ts`, con
      `tests/support/gateway.ts` y MSW desde `contracts/examples/`:
      «no cambia el número de filas ni el contenido de las siete tablas clínicas cuando se completa un análisis
      con_evidencia [US-070 AC-1]» y «la única tabla con diferencia en clinical e identity es ai_analysis_record con una
      fila más cuando se completa un análisis [US-070 AC-2]» (respuesta validada contra el spec de `clinical-api`).
      Commit `test(L1D-195)` (rojo o caracterización con su evidencia).
- [ ] 2.3 (TDD estricto · aceptación) Mismo archivo, fixture de filas manuales creado por los endpoints con la sesión del
      doctor (design D5): biomarcador y diagnóstico (`l1d-90`), tratamiento previo y atributo (`l1d-80`) y una corrección
      de biomarcador (`l1d-309`). Test: «las filas registradas y corregidas a mano no cambian y la única diferencia es
      ai_analysis_record cuando se analiza [US-070 AC-2] [RN-08]». Commit `test(L1D-195)`. **Bloqueada por** `l1d-90`,
      `l1d-80` y `l1d-309`; si alguno se recorta, su paso del fixture queda `DIFERIDA -> US-110 | US-094 | US-253` según
      corresponda y el test sigue con los demás.
- [ ] 2.4 (TDD estricto · aceptación) Mismo archivo: «la única tabla con diferencia es analysis_follow_up y la fila del
      análisis no cambia cuando se completa una pregunta de seguimiento [US-070 AC-2]» (MSW con
      `rag-follow-up-response.json`, `201` validado contra el spec). Commit `test(L1D-195)`. **Bloqueada por**
      `l1d-268-seguimiento-analisis`; si se recorta, `DIFERIDA -> US-218`.
- [ ] 2.5 (TDD estricto · aceptación) Mismo archivo: «responde 502 ERROR_SERVICIO_IA sin actions y ninguna tabla cambia
      cuando la respuesta interna trae un campo actions [US-070 AC-4]» (copia en el test de `rag-query-con-evidencia.json`
      más `actions`; no se añade el ejemplo a `contracts/examples/`, design D4). Commit `test(L1D-195)`.
- [ ] 2.6 (TDD estricto · implementación) Solo si 2.2–2.5 quedaron en rojo por una escritura real: corrección mínima en
      `src/modules/evidence-analysis/` (o en el módulo de seguimiento) con sus unitarios uno a uno; commit
      `feat(L1D-195)`. Si todos fueron caracterización, anotar aquí la evidencia de la mutación de cada uno y marcar sin
      commit `feat`.
- [ ] 2.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
      antes y después, commit `refactor(L1D-195)`.

## 3. frontend

- [ ] 3.1 (test del AC primero · Testing Library) `apps/web/tests/ui/tarjeta-opcion-sin-acciones.test.tsx`: renderiza
      `EvidenceOptionCard` con cada opción de `contracts/examples/con-evidencia-s4-tres-opciones.json` y recorre botones,
      enlaces y `summary`: «no ofrece ningún control que registre un tratamiento, aplique la opción o modifique datos del
      paciente cuando se inspecciona la tarjeta [US-070 AC-3]» (design D6). Commit `test(L1D-195)` (rojo o
      caracterización con mutación: añadir localmente un botón «Registrar tratamiento» lo hace fallar).
- [ ] 3.2 (test del AC primero · implementación) Solo si 3.1 quedó en rojo: quitar el control de la tarjeta; commit
      `feat(L1D-195)`. Sin cambio de UI previsto, por lo que no aplica `visual-check` salvo que esta tarea cambie la
      tarjeta (entonces: estados, consola sin errores ni violaciones de CSP, red solo `/api/*` sin PII en URLs,
      accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px).
- [ ] 3.3 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
      antes y después, commit `refactor(L1D-195)`.

## 4. cierre

- [ ] 4.1 `openspec validate l1d-195-analisis-sin-escrituras --strict`; suites de `clinical-api` (unitarios e
      integración) y de `web` en verde. `contracts:verify-provider` no aplica (sin cambio de API; las respuestas de los
      tests ya se validan contra el spec). `run-ai-eval` no aplica (no cambia modelo, prompt, umbral, catálogo ni corpus).
