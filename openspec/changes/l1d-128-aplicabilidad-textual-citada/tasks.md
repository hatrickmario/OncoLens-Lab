# Tasks — l1d-128-aplicabilidad-textual-citada

> ↪ Depende de `l1d-126-criterios-aplicabilidad-catalogo` (US-121, catálogo) y `l1d-127-estado-criterio-estructurado` (US-122,
> `ApplicabilityService` y regla pura), y de **L1D-117** (US-118, `population_criteria`). Orden de
> merge: L1D-126 → L1D-127 → **L1D-128** (quien mergea después rebasa).
> Matriz TDD (CLAUDE.md): regla RN-01 en dominio y service → **TDD estricto, doble bucle** (commit
> `test(L1D-128)` con el test de aceptación en rojo antes del `feat(L1D-128)`); prompt → **evaluate**;
> fixtures y enlaces → **test después**. Mocks solo en los bordes: LLM, NLI, Milvus, *embeddings*,
> *reranker* (adapters falsos FX-08b-a, mismo contrato que los reales). Schema `corpus` de test real en
> integración. Reloj e IDs inyectados. Nunca `.skip`, `skipif` ni `xfail`.

## 1. contratos

- [ ] 1.1 (test después) Sin diff de contrato (design.md `## Contratos`): correr `contracts:check` y `contracts:breaking` (oasdiff contra `main`) y confirmar cero cambios en `apps/rag-orchestrator/openapi.yaml` y `contracts/schemas/evidence.yaml`. Si apareciera un cambio necesario, detenerse y aplicar la skill `sync-contracts` antes de cualquier test.

## 2. ai-services

- [ ] 2.1 (test después) Completar FX-08b-a en `apps/rag-orchestrator/tests/support/`: `doc-a2` (`metadata_source = pendiente`, población de la semilla) con el chunk `ch-a2-1`; `FakeApplicabilityTextProposer` con `APL-OK`, `APL-SIN-SOPORTE`, `APL-CITA-AJENA`, una variante silenciosa (la de por defecto de los demás tests) y modo error, con registro de invocaciones; NLI falso (`NliFalso`) con `entailment` para "HER2 negativo" y `neutral` para "estadio I–III". Verificación: test de humo del fixture.
- [ ] 2.2 (TDD estricto) Test de aceptación en rojo: "acepta 'HER2 negativo' citando ch-a2-1, queda no_coincide e invoca el NLI con ch-a2-1 como premisa cuando APL-OK y NLI en entailment [US-123 AC-1]" · integración (`TestClient` + JWT de servicio de test + `@pytest.mark.ac("US-123", 1)`), validando contra el spec con el *helper* de L1D-164. Esqueleto: puerto `ApplicabilityTextProposer`, `AplicabilidadTextual` que devuelve la entrada sin cambios y el cableado, para que falle en la aserción. Commit `test(L1D-128)`.
- [ ] 2.3 (TDD estricto) Test de aceptación en rojo: "deja estadio desconocido con no_reportado_por_fuente, sin el texto en la respuesta y con omittedClaims + 1 cuando APL-SIN-SOPORTE y NLI neutral [US-123 AC-2]" · integración, buscando el texto en la respuesta serializada completa. Commit `test(L1D-128)`.
- [ ] 2.4 (TDD estricto) Test de aceptación en rojo: "deja el criterio desconocido sin citedSources y sin invocar el NLI cuando APL-CITA-AJENA cita ch-x-999 [US-123 AC-3]" · integración. Commit `test(L1D-128)`.
- [ ] 2.5 (TDD estricto) Test de aceptación en rojo: "deja linea_tratamiento desconocido con no_reportado_por_fuente sin sumar a omittedClaims cuando el LLM no propone nada [US-123 AC-4]" · integración; más el escenario del documento `pendiente` re-incorporado. Commit `test(L1D-128)`.
- [ ] 2.6 (TDD estricto) Test de aceptación en rojo: "responde 503 NLI_UNAVAILABLE sin applicability cuando el NLI falla al validar una propuesta de aplicabilidad [US-123 AC-5]" · integración, validando el `503` contra el spec. Commit `test(L1D-128)`.
- [ ] 2.7 Dominio puro `app/domain/applicability_text.py`: `criterios_pendientes_de_texto()` (D1), `validar_propuesta_de_poblacion()` (RN-01, D3) y `normalizar_valor_al_catalogo()` (D4), reutilizando `validar_citas()`/`construir_cita()`, `soporta()` y el filtro RN-23, con unitarios uno a la vez (criterio estructurado no es pendiente; cita de otra fuente se rechaza; término prohibido se rechaza sin NLI; entailment < umbral rechaza; `patientValue`/`status` del LLM se ignoran; valor sin encaje en la regla → desconocido, según OQ-1). Verificación: 2.3–2.5 en verde. Commit `feat(L1D-128)`.
- [ ] 2.8 `AplicabilidadTextual` (D8) con el puerto `ApplicabilityTextProposer` en `application/ports.py`; lote NLI por `VerificadorDeSoporte`; `omittedClaims` sumado en la respuesta; `NliNoDisponibleError` → `503 NLI_UNAVAILABLE` y error del proponente → `503 LOCAL_LLM_UNAVAILABLE` (D5); `ApplicabilityService` deja de omitir `pendiente` (con `Test-Removal:` del test de L1D-127 que lo exigía). Verificación: 2.2–2.6 en verde y suites de L1D-127, L1D-179 y L1D-180 sin regresiones. Commit `feat(L1D-128)`.
- [ ] 2.8a (TDD estricto; se hace **antes de 2.7**, cuyo filtro RN-23 usa el campo) `[S3 resp. 16]` D7: añadir `studyPopulationValue` a `camposGenerados` de `packages/clinical-language/origen-de-campos.json` y al `Literal` `CampoGenerado` de `app/domain/support.py`; primero el test de coherencia de L1D-180 en rojo con la lista nueva (commit `test(L1D-128)`), luego el cambio (commit `feat(L1D-128)`). Verificación: coherencia en verde, `contracts:check` y la suite de `@oncolens/clinical-language` en verde.
- [ ] 2.8b (TDD estricto) `[S3 resp. 16]` D6: tests de aceptación en rojo «reporta ambas versiones del prompt cuando el camino textual invoca al LLM» y «solo la del generador sin camino textual» (integración, validando contra el spec; log con `applicabilityPromptVersion` y sin valor ni texto) · commit `test(L1D-128)`; luego `VERSION_DEL_PROMPT_APLICABILIDAD` junto a la plantilla y armado de `meta.promptVersion` en `RAGOrchestratorService` · commit `feat(L1D-128)`.
- [ ] 2.9 (test después) Test de no-invocación: con `sin_evidencia` y con una fuente de criterios todos estructurados, el proponente no se invoca (Regresión [RN-02], US-122 AC-6). Verificación: test en verde.
- [ ] 2.10 (test después) Test de no-fuga en logs: la rama solo registra conteos, latencia, `nliModel` y `traceId`; nunca el valor propuesto, el texto del chunk ni `pseudoPatientId`. Verificación: test en verde.
- [ ] 2.11 (evaluate) Adapter real `LlmApplicabilityTextProposer` en `infrastructure/llm/` con plantilla versionada (D6, sin lenguaje prescriptivo, sin valores del paciente), salida JSON validada con Pydantic y enlace en `app/bootstrap.py` y en la suite `evaluate`. Verificación: test de contrato del adapter con un `LlmClient` falso y test de que la plantilla no contiene términos prohibidos; medición con el LLM real → US-233 (S4).
- [ ] 2.12 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-128)`.

## 3. evaluación

- [ ] 3.1 (evaluate) `run-ai-eval` sobre la rama con `LLM_PROVIDER=fake`: sin regresión en fidelidad, precisión de citas y salidas prescriptivas = 0 respecto del baseline; la medición del prompt de aplicabilidad con el LLM real queda en US-233 (S4). Reporte de `ai-eval-runner` en `reports/eval/`.

## 4. Verificación

- [ ] 4.1 `openspec validate l1d-128-aplicabilidad-textual-citada --strict` en verde.
- [ ] 4.2 Suite de `apps/rag-orchestrator` en verde (unitarios e integración).
- [ ] 4.3 `contracts:check` y `contracts:breaking` sin cambios (tarea 1.1); `contracts:verify-provider` no aplica (sin cambio de API).
