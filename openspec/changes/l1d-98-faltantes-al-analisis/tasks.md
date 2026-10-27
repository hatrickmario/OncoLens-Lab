# Tasks — l1d-98-faltantes-al-analisis

> ↪ Depende de **L1D-94 (US-002)** (mergeado): `CompletenessService.calcular(patientId)`, FX-04-a (`test-1.0.0`) y
> FX-04-b (F-M2). Va **después del change de seed de la O3** (renombra a `RE`/`RP`; con el catálogo real `re`/`rp`
> saldrían faltantes falsos). L1D-188 debe mergear inmediatamente después de este change.
>
> Matriz TDD (CLAUDE.md): endpoint y service con lógica → **TDD estricto, doble bucle** (commit `test(L1D-98)`
> con el test de aceptación en rojo antes de su `feat(L1D-98)`). Integración con Supertest + PostgreSQL real de
> test + MSW hacia `rag-orchestrator` desde `contracts/examples/`; nunca `vi.mock` de módulos propios ni de
> Prisma; reloj, `traceId` y seudónimo inyectados. Nunca `.skip`, `.only` ni `it.todo`. Sin cambio de API: no hay
> commit `contract(L1D-98)`. Respuestas validadas contra el spec del proveedor (US-214).

## 1. clinical-platform

- [ ] 1.1 (test después) Cargar FX-04-a (`apps/clinical-api/tests/fixtures/completeness/catalogos/test-1.0.0`, 12 ítems, en `CLINICAL_CATALOG_PATH` de los tests de integración) y FX-04-b (F-M2, con PII sintética de su `ClinicalNote` generada en tiempo de test) en la suite del gateway, reutilizando los de L1D-94; los seis faltantes esperados de F-M2 se derivan de FX-04-a. Verificación: test de humo del fixture en verde.
- [ ] 1.2 (TDD estricto) Test de aceptación en rojo: "envía los seis faltantes de F-M2 en el orden del catálogo y catalogVersion test-1.0.0 cuando el oncólogo continúa con aviso [US-006 AC-1]" · integración. Commit `test(L1D-98)`.
- [ ] 1.3 (TDD estricto) Test de aceptación en rojo: "persiste los seis faltantes, continued_with_warning true y catalog_version test-1.0.0 cuando se completa el análisis [US-006 AC-2]" · integración. Commit `test(L1D-98)`.
- [ ] 1.4 (TDD estricto) Tests de aceptación en rojo: "responde 200, persiste continued_with_warning false y envía los mismos faltantes cuando no llega continueWithWarning [US-006 AC-3]"; "envía cinco faltantes sin estado_menopausico cuando se registra antes del POST [US-006 AC-4]"; "persiste los seis faltantes cuando rag-orchestrator responde sin_evidencia [US-006 AC-5]" · integración. Commit `test(L1D-98)`.
- [ ] 1.5 (TDD estricto) Tests de aceptación en rojo: "envía solo claves del catálogo y ninguna PII sembrada cuando F-M2 tiene una nota con nombre y documento [US-006 AC-6]"; "responde 504 y no persiste registro cuando rag-orchestrator no responde a tiempo [US-006 AC-7]" (reloj congelado); "responde 500 ERROR_INTERNO sin llamar a rag-orchestrator ni persistir cuando el checklist falla [US-006 AC-8]" (`ChecklistDeFaltantes` que lanza, inyectado por la factory) · integración. Commit `test(L1D-98)`.
- [ ] 1.6 (TDD estricto) Puerto `ChecklistDeFaltantes` y `ChecklistNoDisponibleError` en `ports.ts`; adaptador sobre `CompletenessService.calcular(patientId)` en `evidence-analysis.module.ts` con `clavesFaltantes()` (filtra `status === 'faltante'` y toma `key`, conserva el orden del catálogo, envuelve cualquier error), con sus unitarios uno a la vez (sin faltantes → `[]`; orden del catálogo; `presente_sin_verificar` y `no_aplica` excluidos; error → `ChecklistNoDisponibleError`). Commit `feat(L1D-98)`.
- [ ] 1.6b (test después) Cablear `componerCompletitud` en `src/composition.ts`/`src/server.ts` con la misma carga de catálogo (`CLINICAL_CATALOG_PATH`, `leerArchivo`) que `CatalogVersionProvider` (design D5) e inyectar el adaptador en `componerGatewayDeAnalisis` (traslado de L1D-94 1.12b vía L1D-95). Verificación: los tests de integración del gateway arrancan por la composición real y `catalogVersion` del checklist coincide con el del request. Commit `feat(L1D-98)`.
- [ ] 1.7 (TDD estricto) Service: paso del checklist después de `tipo_no_habilitado` y antes de `construirContextoPermitido` (design D2); `construirContextoPermitido(caso, ahora, faltantes)`; `armarRegistro` sobrescribe `missingCriticalData` con el de `request.clinicalContext` tras `...registroBase` (D3; `tipo_no_habilitado` queda `[]`); `rechazoDe()` mapea `ChecklistNoDisponibleError` a `ERROR_INTERNO` con `resultado = checklist_no_disponible` (D4). Unitarios de `construirContextoPermitido` y `armarRegistro` con la lista. Verificación: 1.2–1.5 en verde. Commit `feat(L1D-98)`.
- [ ] 1.8 (test después) Regresiones: suites del gateway de L1D-103, L1D-104, L1D-203 y de la Base (US-066) en verde con el escenario modificado de US-052 AC-4 (`missingCriticalData` solo con claves del catálogo); `tipo_no_habilitado` sigue sin calcular el checklist y con `missing_critical_data = []`; el log del análisis no contiene ninguna clave de la lista. Verificación: suites en verde.
- [ ] 1.9 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-98)`.

## 2. evaluación

- [ ] 2.1 (exento) Sin cambio de modelo, prompt, umbral, catálogo real ni corpus: `run-ai-eval` no aplica. El uso de los faltantes en el prompt (US-116, S5) sí la exigirá. Verificación: nota en el PR.

## 3. Verificación

- [ ] 3.1 `openspec validate l1d-98-faltantes-al-analisis --strict` en verde.
- [ ] 3.2 Suite de `apps/clinical-api` en verde (Vitest unitarios e integración).
- [ ] 3.3 `contracts:verify-provider` en verde para `POST /platform/evidence-analyses` (`200`, `500`, `504`) y request a `/rag/query` validado contra `RagQueryInternalRequest`; sin cambios de API, `contracts:breaking` no aplica.
