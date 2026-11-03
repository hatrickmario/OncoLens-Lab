# Tasks — l1d-196-avisos-no-bloquean

## 1. contratos

- [x] 1.1 Añadir `contracts/examples/rag-query-request-fx-t3-a.json` y `rag-query-fx-t3-a.json` (design «Contratos», D2, D5) y sus entradas en `contracts/examples/index.json`; sin tocar ningún `openapi.yaml` · test después · verificación: `npm run contracts:check` y `contracts:breaking` sin diferencias · commit `contract(L1D-196)`

## 2. clinical-platform

- [x] 2.1 Soporte de test FX-T3-a en `apps/clinical-api/tests/support/fx-t3-a.ts` sobre `filas-sinteticas.ts` (HER2 `3+` verificado, Ki-67 `20 %` `requiere_revision`, dos RE con `conflicts_with_id`, sin `estado_menopausico`, catálogo `test-1.0.0`) · test después (fixture) · verificación: lo usan 2.2 y 2.3
- [x] 2.2 Test de aceptación «responde 200 con poblacion_no_comparable en warnings y declara faltantes y sin verificar en la Base del análisis sin emitirlos en warnings cuando FX-T3-a pide el análisis con continueWithWarning [US-071 AC-1]» en `tests/integration/evidence-analysis/avisos-no-bloquean.test.ts` (Supertest + PostgreSQL real + MSW desde `rag-query-fx-t3-a.json`, verificación del proveedor) · TDD estricto (caracterización si pasa, D6: salida + mutación) · commit `test(L1D-196)` · evidencia: caracterización, pasó al primer intento; mutación (404 si hay faltantes) → rojo `expected 404 to be 200`
- [x] 2.3 Test de aceptación «la ficha, la vista de caso y el checklist responden 200 con sus avisos cuando el paciente es FX-T3-a [US-071 AC-4]» en `tests/integration/pacientes/lecturas-con-avisos.test.ts`, con verificación del proveedor · TDD estricto (caracterización si pasa) · commit `test(L1D-196)` · evidencia: caracterización; mutación (404 en la vista de caso si hay faltantes) → rojo `expected [200, 404, 200]`
- [x] 2.4 Si 2.2 o 2.3 fallan en la aserción: corrección mínima en el módulo que bloquea, con sus unitarios, hasta verde · TDD estricto · commit `feat(L1D-196)`; si pasan, marcar con la evidencia de caracterización · evidencia: 2.2 y 2.3 pasan sin corrección; no hubo código de producto
- [x] 2.5 Seed: campos opcionales `estadoDeRevision` y `enConflictoCon` en `BiomarcadorSemilla` y paciente semilla (f) = FX-T3-a en `prisma/seed/pacientes/f.ts` (D4); pacientes (a)…(e) sin cambios · test después · verificación: test de integración del seed (`tests/integration/seed/`) que comprueba Ki-67 `requiere_revision`, el par RE con `conflicts_with_id` y la ausencia de `estado_menopausico`
- [x] 2.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-196)` · hecho: Extract `prisma/seed/sembrar.ts:idDelBiomarcadorEnConflicto` (la regla de `conflicts_with_id` en un solo lugar) y Extract del índice `pacientes/indice.ts`; integración de seed y pacientes en verde antes y después

## 3. frontend

- [x] 3.1 `apps/web/e2e/soporte.ts`: ID del paciente (f) y conteo del listado derivado del seed en `pacientes-listado.spec.ts` (D4; si `l1d-310` ya lo derivó, solo añadir (f)) · test después · verificación: `pacientes-listado.spec.ts` en verde contra Compose · evidencia: `pacientes-listado.spec.ts` 2/2 en verde contra Compose; el conteo sale de `PACIENTES_SEMILLA` (`prisma/seed/pacientes/indice.ts`), no de un literal
- [x] 3.2 E2E «ejecuta el análisis y muestra el resultado cuando el doctor continúa con el aviso de faltantes de FX-T3-a [US-071 AC-2]» en `apps/web/e2e/avisos-no-bloquean.spec.ts` · test del AC primero · commit `test(L1D-196)` · evidencia: caracterización, pasó al primer intento; mutación (botón deshabilitado con aviso) → rojo `toBeEnabled() failed`
- [x] 3.3 E2E «muestra la opción con la etiqueta Población no comparable y sin ocultarla cuando se renderiza el análisis de FX-T3-a [US-071 AC-3]» · test del AC primero · commit `test(L1D-196)` · evidencia: caracterización; mutación (etiqueta de población oculta) → rojo `element(s) not found`
- [x] 3.4 E2E «llega al resultado sin ningún dialog ni alertdialog cuando recorre login, ficha, vista de caso («Analizar la evidencia para este caso»), faltantes y panel («Analizar evidencia») con FX-T3-a [US-071 AC-5]» (paso «faltantes» en la columna de `l1d-96`; si se recortó, en el aviso del panel) · test del AC primero · commit `test(L1D-196)` · evidencia: caracterización; mutación (botón deshabilitado con aviso) → rojo
- [x] 3.5 Si 3.2–3.4 fallan en la aserción: corrección mínima en el componente que bloquea, con su test de componente · commit `feat(L1D-196)`; si pasan, anotar la ejecución como evidencia · evidencia: 3.2–3.4 pasan sin corrección; no hubo código de producto
- [x] 3.6 Loop visual (visual-check) solo si 3.5 tocó UI: estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px; cada fallo se convierte primero en un test en rojo · no aplica: 3.5 no tocó UI; sin cambios de componentes
- [x] 3.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-196)` · hecho: sin cambios (el frontend solo añadió E2E y soporte; nada que extraer ni inlinar)

## 4. Cierre

- [ ] 4.1 `openspec validate l1d-196-avisos-no-bloquean --strict` en verde
- [ ] 4.2 Tests de `clinical-api` (unitarios + integración) y E2E (`scripts/e2e/ejecutar.sh`) en verde; `contracts:verify-provider` en verde (sin cambios de API, solo ejemplos). Sin `run-ai-eval`: no cambia modelo, prompt, umbral, catálogo ni corpus
