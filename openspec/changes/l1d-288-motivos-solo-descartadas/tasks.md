# Tasks — l1d-288-motivos-solo-descartadas

> Disciplina (matriz de CLAUDE.md): componente de `web` → **test del AC primero** (Testing Library + MSW desde
> `contracts/examples/`); reglas puras con nombre (`resumirMotivos()`, `contar_por_motivo()`) con unitarios
> uno a uno dentro del `feat`; log de `rag-orchestrator` → **TDD estricto** (test de integración en rojo);
> ejemplos del contrato → **test después** (`contracts:check`). Sin `evaluate`: no cambia modelo, prompt,
> umbral, catálogo ni corpus. Pantalla: `docs/ux/S3/pantallas-s3.md` S3-03. Solo datos sintéticos.
> **Orden de merge `[S3 resp. 15]`:** después de `L1D-141 (US-062)` (`l1d-141-estados-panel-criterio`:
> `analysis-result.tsx`, `apps/web/messages/es.json`) y después de `l1d-287-alias-chunks-cita`
> (`_validar_citas_y_ensamblar`); esta rama hace *rebase* sobre ambos.

## 1. contratos

- [ ] 1.1 (test después: ejemplos, sin cambio de `openapi.yaml`) Con la skill `sync-contracts`: crear en `contracts/examples/` `con-evidencia-solo-descartadas-cita-invalida.json`, `con-evidencia-solo-descartadas-motivos-mixtos.json` (orden de llegada `sin_citas`, `cita_invalida`, `cita_invalida`) y `con-evidencia-solo-descartadas-otros-motivos.json` (`afirmacion_sin_soporte`, `solo_soportada_por_analisis_previo`), derivados de `con-evidencia-solo-descartadas.json` (mismo `disclaimer` literal, `evidenceOptions = []`, sintéticos, NCCN/ESMO solo en `sourcesNotIncluded`), y registrarlos en `index.json` (target `#/components/schemas/EvidenceAnalysis`). Verificación: `contracts:check` en verde y `contracts:breaking` vacío [US-237 AC-6]. Commit `contract(L1D-288)`.

## 2. ai-services

- [ ] 2.1 (TDD estricto · integración) Test en rojo `test_rag_query_citas_registra_recuento_por_motivo_sin_contenido` con `@pytest.mark.ac("US-237", 5)` (TestClient + PostgreSQL `corpus` real; Milvus y LLM fingidos en su puerto; `respx` en el HTTP saliente): opción con `chunkId` no recuperado + opción sin citas → `event=rag_query_citas` con `opcionesAceptadas=0 opcionesDescartadas=2 sinCitas=1 citaInvalida=1`, emitido como línea JSON válida (`parsear_lineas_json()` de `tests/support/logs.py`) con el `traceId` de la consulta (hallazgo menor de `privacy-guardian`), y sin ningún `chunkId`, texto de opción ni pregunta (`exigir_sin_valores_prohibidos()`); y `test_rag_query_citas_sin_descartadas_registra_ceros` (asumido). En `apps/rag-orchestrator/tests/integration/test_rag_query_citas_bordes.py`. Commit `test(L1D-288)`.
- [ ] 2.2 (TDD estricto) Extraer `contar_por_motivo()` (RN-01) en `app/domain/citations.py` con unitarios uno a uno (sin descartadas → ceros; un motivo; ambos) y añadir `sinCitas=%d citaInvalida=%d` al `logger.info` de `RAGOrchestratorService._validar_citas_y_ensamblar`. Verificación: 2.1 en verde y suite de `rag-orchestrator` en verde. Commit `feat(L1D-288)`.
- [ ] 2.3 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-288)`.

## 3. frontend

- [ ] 3.1 (test después: soporte) Handlers MSW de `POST /api/evidence-analyses` para los tres ejemplos de 1.1 en `apps/web/tests/support/msw/evidence-analyses.ts`, con `onUnhandledRequest: 'error'`.
- [ ] 3.2 (test del AC primero · componente) Tests en rojo (Vitest + Testing Library + MSW) sobre `EvidencePanel`, en `apps/web/tests/ui/evidence-panel-motivos.test.tsx`: "muestra una vez el motivo de cita inválida bajo el titular, sin recuento ni chunkId, cuando todas las descartadas son cita_invalida [US-237 AC-1]"; "muestra 2 × cita inválida y luego 1 × sin citas en el orden del contrato cuando los motivos son mixtos [US-237 AC-2]"; "usa las etiquetas existentes de discardReason sin claves nuevas por motivo cuando los motivos son afirmación sin soporte y análisis previo [US-237 AC-3]"; "no contiene términos prohibidos y mantiene visible el aviso de IA en el estado solo descartadas con motivos [US-237 AC-4]"; "no muestra Motivos cuando hay una opción aceptada" (asumido). Esqueleto de `DiscardReasonsSummary` con `throw new Error('no implementado')` para que el rojo falle en la aserción. Commit `test(L1D-288)`.
- [ ] 3.3 (test del AC primero) Extraer `resumirMotivos()` (RN-01, orden del enum `discardReason` tipado contra el tipo generado de `packages/api-contracts`) en `apps/web/lib/evidence/resumir-motivos.ts` con unitarios uno a uno en `apps/web/tests/lib/` (un motivo; dos en orden inverso al de llegada; motivo repetido); implementar `DiscardReasonsSummary` (`apps/web/components/molecules/discard-reasons-summary.tsx`, `<ul>` de texto, sin `dangerouslySetInnerHTML`) y montarla en `AnalysisResult` bajo el titular solo con `clase === 'solo_descartadas'`; añadir `evidence.discarded.motivos` = "Motivos:" a `apps/web/messages/es.json` (sin tocar las claves de `L1D-141 (US-062)`). Verificación: 3.2 en verde, `lint:lenguaje` sin hallazgos, suite de `web` en verde. Commit `feat(L1D-288)`.
- [ ] 3.4 Loop visual (visual-check): estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px; cada fallo se convierte primero en un test en rojo. Referencia: `docs/ux/S3/pantallas-s3.md` S3-03.
- [ ] 3.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-288)`.

## 4. cierre

- [ ] 4.1 `openspec validate l1d-288-motivos-solo-descartadas --strict`, tests de `web` y `rag-orchestrator` en verde, `contracts:check` y `contracts:breaking` sin diff de `openapi.yaml` (no aplica `contracts:verify-provider`: sin cambios de API; no aplica `run-ai-eval`).
