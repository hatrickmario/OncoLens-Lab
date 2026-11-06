# Tasks — l1d-213-opt-out-generacion-ia

> Empieza cuando el commit `contract(L1D-315)` de `l1d-315-conversacion-paciente` (`POST …/turns`) está en `main`; la
> parte de UI del panel conversacional, cuando `l1d-324-panel-conversacional` lo está.

## contratos

- [ ] 1.1 Editar `apps/clinical-api/openapi.yaml` 1.26.0 → 1.27.0 (glosario del chat §1): `x-genera-ia: true` solo en `createEvidenceAnalysis` y `createFollowUp` (`createConversationTurn` ya lo declara l1d-315 con su `403 PermisoDenegadoOOptOut`; no se toca); `aiAnalysisAvailable` requerido en `PatientSummary`; ejemplos `patient-summary-*.json` y nuevo `patient-summary-opt-out.json`; `contracts:check` y `contracts:breaking` (0 incompatibles) en verde; `contracts:generate` regenera `packages/api-contracts/` y `src/zod/`; commit `contract(L1D-213)` · test después

## clinical-platform

- [ ] 2.1 Builder de test FX-T4c-a (P-OPT-IA con `AN-PREV` y una conversación, P-OPT-REV, P-OPT-INV, paciente `real_anonimizado` sin convenio, paciente `sintetico` de dataset sin convenio) que inserta en `clinical.patient_opt_out` sin la CLI de US-149; handlers MSW que cuentan llamadas a `/rag/query`, `/rag/follow-up` y `/chat/turn` desde `contracts/examples/` · test después
- [ ] 2.2 Test de aceptación en rojo: «responde 403 OPT_OUT_ANALISIS_IA sin llamar a rag-orchestrator ni crear registros cuando el paciente tiene opt-out, en análisis, seguimiento y turno [US-148 AC-1]» y el del admin con `PERMISO_DENEGADO` · integración (Supertest + PostgreSQL real + verificación del proveedor) · commit `test(L1D-213)` · TDD estricto
- [ ] 2.3 Tests de aceptación en rojo de AC-4 (revocado → 200), AC-5 (solo investigación → 200), AC-6 (opt-out durante análisis lento → 200 persistido y el siguiente 403; reloj inyectado), AC-7 (lecturas, carga `202 pendiente`, crear y leer conversación) y AC-9 (real sin convenio → 403 ×3; sintético de dataset → 200) · integración · commit `test(L1D-213)` · TDD estricto
- [ ] 2.4 Test de aceptación en rojo: «la ficha trae aiAnalysisAvailable false sin referencia ni motivo cuando el paciente tiene opt-out [US-148 AC-8]» · integración · commit `test(L1D-213)` · TDD estricto
- [ ] 2.5 Test de cobertura en rojo: «falla nombrando el operationId cuando una ruta x-genera-ia no monta el guardia [US-148 AC-3]» y «los tres conjuntos coinciden con DEC-22 [US-148 AC-3]» · Vitest · commit `test(L1D-213)` · TDD estricto
- [ ] 2.6 Extraer `ultimaMarcaVigente()` y `consentimientoPresumible()` (RN-15) en `opt-outs.reglas.ts` con sus unitarios uno a uno; `opt-outs.repository.ts`, `opt-outs.service.ts` (factoría con el repository por parámetro) y `optOutGuard(resolverPaciente)` con *log* sin marca · commit `feat(L1D-213)` · TDD estricto
- [ ] 2.7 `RUTAS_GENERA_IA` y `registrarRutaGeneraIA()`; montar el guardia en el análisis, el seguimiento y el turno (orden sesión → `authorize` → guardia → handler); AC-1, AC-3…AC-7 y AC-9 en verde · commit `feat(L1D-213)` · TDD estricto
- [ ] 2.8 `aiAnalysisAvailable` en `ficha.service.ts` con `OptOutService`; AC-8 (API) en verde · commit `feat(L1D-213)` · TDD estricto
- [ ] 2.9 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-213)`

## frontend

- [ ] 3.1 Test del AC en rojo: «muestra el aviso y deshabilita el campo de pregunta y el envío del panel conversacional sin mostrar la marca cuando aiAnalysisAvailable es false [US-148 AC-8]» · Vitest + Testing Library + MSW · commit `test(L1D-213)` · test del AC primero
- [ ] 3.2 Aviso en `ficha-del-doctor.tsx` (texto en `lib/textos`), botón deshabilitado y prop `disabled` al panel conversacional (dependencia: l1d-324 expone `disabled`; este change no edita l1d-324); 3.1 en verde · commit `feat(L1D-213)`
- [ ] 3.3 E2E Playwright contra Compose con el paciente semilla (d) y LLM fingido: aviso, controles deshabilitados, ficha y vista de caso completas, sin peticiones a `/api/evidence-analyses` ni `…/turns` [US-148 AC-8] · commit `test(L1D-213)`
- [ ] 3.4 Loop visual (visual-check): estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px; cada fallo se convierte primero en un test en rojo
- [ ] 3.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-213)`

## Verificación

- [ ] 4.1 `openspec validate l1d-213-opt-out-generacion-ia --strict`, tests de `clinical-api` y `web` en verde, `contracts:verify-provider` en verde (sin `run-ai-eval`: no cambia modelo, prompt, umbral, catálogo ni corpus)
