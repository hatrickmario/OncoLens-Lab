# Tasks — l1d-195-analisis-sin-escrituras

> TDD estricto (AC-T3.2 es invariante de dominio). Cada test de aceptación se ejecuta **primero**: si falla en la
> aserción, va en rojo en `test(L1D-195)` antes del `feat(L1D-195)`; si pasa a la primera, queda como **caracterización**
> en `test(L1D-195)` con su salida y una mutación local no commiteada que lo hace fallar (patrón `l1d-181` D4).
>
> **Resultado:** los cinco tests de `clinical-api` y el de `web` pasaron a la primera (el comportamiento ya existía): no
> hay commit `feat(L1D-195)` ni rojo por falta de implementación. Cada uno quedó como caracterización con la mutación
> comprobada que se anota abajo.

## 1. contratos

- [x] 1.1 (exento: sin cambio de spec) Confirmar con `contracts:check` y `contracts:breaking` que el change no toca
      `apps/clinical-api/openapi.yaml` ni `apps/rag-orchestrator/openapi.yaml` (0 diferencias). Evidencia: el diff contra
      `origin/main` no incluye `apps/*/openapi.yaml` ni `contracts/`; `contracts:check` y `contracts:breaking` en verde.

## 2. clinical-platform

- [x] 2.1 (test después: soporte de test) `apps/clinical-api/tests/support/instantanea-de-tablas.ts`:
      `instantaneaDeTablas(cliente, { schemas: ['clinical', 'identity'] })` → `{ [tabla]: { filas, hash } }` con
      `md5(string_agg(t::text, '|' ORDER BY <pk>))`, y `tablasConDiferencia(antes, despues)`; reutiliza
      `tablasDelCatalogo()` de `tests/support/catalogo.ts` (design D1, D2). Test del ayudante contra la base de test
      (`tests/integration/evidence-analysis/instantanea-de-tablas.test.ts`, base propia): detecta un `INSERT` y un
      `UPDATE` de `review_status` hechos en el propio test.
- [x] 2.2 (TDD estricto · aceptación · caracterización) En `tests/integration/evidence-analysis/analisis-sin-escrituras.test.ts`, con
      `tests/support/gateway.ts` y MSW desde `contracts/examples/`:
      «no cambia el número de filas ni el contenido de las siete tablas clínicas cuando se completa un análisis
      con_evidencia [US-070 AC-1]» y «la única tabla con diferencia en clinical e identity es ai_analysis_record con una
      fila más cuando se completa un análisis [US-070 AC-2]» (respuesta validada contra el spec de `clinical-api`).
      Commit `test(L1D-195)`. Pasó a la primera. **Mutación** (no commiteada): `UPDATE clinical.biomarker SET
      review_status = 'verificado'` tras `persistirAnalisis` → falla AC-1 en la aserción (`clinical.biomarker: expected
      { filas: 12, … } to deeply equal …`). Fixture del archivo: FX-T1a-a (`requiere_revision`, `rechazado`,
      `reemplazado`) sobre el paciente (a), para que el `UPDATE` tenga filas que cambiar.
- [x] 2.3 (TDD estricto · aceptación · caracterización) Mismo archivo, fixture de filas manuales creado por los endpoints con la sesión del
      doctor (design D5): biomarcador (`l1d-90`), corrección de biomarcador (`l1d-309`: fila `reemplazado` y su sucesora
      `manual_correction`) y diagnóstico corregido con gradación Nottingham (`l1d-90`). Test: «las filas registradas y
      corregidas a mano no cambian y la única diferencia es ai_analysis_record cuando se analiza [US-070 AC-2] [RN-08]».
      Commit `test(L1D-195)`. Pasó a la primera; la misma mutación de 2.2 lo hace fallar
      (`expected [ 'clinical.ai_analysis_record', … ] to deeply equal [ 'clinical.ai_analysis_record' ]`). La fila
      `reemplazado` conserva `review_status` y valor, y la sucesora sigue `verificado`.
- [ ] 2.3b DIFERIDA -> US-094 (`l1d-80-tratamientos-atributos-manuales` no está en `main` al implementar esta historia):
      los pasos del fixture de tratamiento previo y de atributo clínico manuales. Al fusionarse `l1d-80`, añadirlos a
      `sembrarFilasManuales()` de `analisis-sin-escrituras.test.ts`; las siete tablas del AC-1 ya incluyen
      `prior_treatment` y `clinical_attribute`, así que el guardia de conteo y *hash* ya las cubre vacías.
- [x] 2.4 (TDD estricto · aceptación · caracterización) Mismo archivo: «la única tabla con diferencia es analysis_follow_up y la fila del
      análisis no cambia cuando se completa una pregunta de seguimiento [US-070 AC-2]» (MSW con
      `rag-follow-up-response.json`, `201` validado contra el spec). Commit `test(L1D-195)`. Pasó a la primera.
      **Mutación**: `UPDATE clinical.biomarker …` tras `insertarTurno` → falla la aserción de la diferencia de tablas.
      Un `UPDATE` de `ai_analysis_record` en el seguimiento da `500` por el *trigger* `ai_analysis_record_inmutable`
      (defensa adicional de base de datos).
- [x] 2.5 (TDD estricto · aceptación · caracterización) Mismo archivo: «responde 502 ERROR_SERVICIO_IA sin actions y ninguna tabla cambia
      cuando la respuesta interna trae un campo actions [US-070 AC-4]» (copia en el test de `rag-query-con-evidencia.json`
      más `actions`; no se añade el ejemplo a `contracts/examples/`, design D4). Commit `test(L1D-195)`. Pasó a la
      primera. **Mutación**: quitar `actions` antes de `zRagQueryInternalResponseRefinado.safeParse` en
      `validarRespuestaInterna` → falla con `expected 200 to be 502`.
- [x] 2.6 (TDD estricto · implementación) Los tests 2.2–2.5 pasaron a la primera: no hubo escritura real que corregir, por
      lo que no hay commit `feat(L1D-195)` ni código de producto cambiado (design: «Código de producto: ninguno»). La
      evidencia de la mutación de cada test está en 2.2–2.5.
- [x] 2.7 Refactor: sin cambios. Solo hay archivos de test y un ayudante nuevo; sin duplicación ni método que extraer.

## 3. frontend

- [x] 3.1 (test del AC primero · Testing Library · caracterización) `apps/web/tests/ui/tarjeta-opcion-sin-acciones.test.tsx`: renderiza
      `EvidenceOptionCard` con cada opción de `contracts/examples/con-evidencia-s4-tres-opciones.json` (citas
      desplegadas) y recorre botones, enlaces y `summary`: «no ofrece ningún control que registre un tratamiento, aplique
      la opción o modifique datos del paciente cuando se inspecciona la tarjeta [US-070 AC-3]» (design D6). Commit
      `test(L1D-195)`. Pasó a la primera (tras ajustar dos patrones del propio test). **Mutaciones**: añadir un botón
      «Registrar tratamiento» y un enlace a `/api/patients/x/treatments` lo hace fallar en la aserción.
- [x] 3.2 (test del AC primero · implementación) 3.1 no quedó en rojo: no se quitó ningún control; sin cambio de UI y sin
      commit `feat(L1D-195)`. `visual-check` no aplica (la tarjeta no cambia).
- [x] 3.3 Refactor: sin cambios (solo un archivo de test).

## 4. cierre

- [x] 4.1 `openspec validate l1d-195-analisis-sin-escrituras --strict`; suites de `clinical-api` (unitarios e
      integración) y de `web` en verde. `contracts:verify-provider` no aplica (sin cambio de API; las respuestas de los
      tests ya se validan contra el spec). `run-ai-eval` no aplica (no cambia modelo, prompt, umbral, catálogo ni corpus).
