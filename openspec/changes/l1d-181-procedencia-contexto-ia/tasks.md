# Tasks — l1d-181-procedencia-contexto-ia

> Sin cambio de API: no hay sección `## contratos`. TDD según la matriz de CLAUDE.md; los AC-1…AC-4 de B1 siguen
> design D4 (rojo si falla en la aserción; si pasa a la primera, test de regresión con su salida en el reporte).
> Coordina con `l1d-129-aplicabilidad-causas-avisos` (consume `provenance`) y `l1d-98-faltantes-al-analisis`
> (mismo builder).
> **Orden `[S3 resp. 15]`:** `l1d-287-alias-chunks-cita` mergea primero (`rag-query@0.3.0`); esta rama hace
> *rebase* sobre él antes de las tareas de `## ai-services` y sube a `rag-query@0.4.0`.

## clinical-platform

- [ ] 1.1 (TDD estricto · D4) Test de aceptación `lleva procedencia seed verificada y sin conflicto en el diagnóstico y cada biomarcador cuando doc1 analiza al paciente semilla (a) [US-065 AC-1]` · integración (Supertest + PostgreSQL real + MSW hacia `/rag/query` desde `contracts/examples/`), en `tests/integration/evidence-analysis/procedencia-contexto.test.ts`; commit `test(L1D-181)` si queda en rojo.
- [ ] 1.2 (TDD estricto · D4) Test de aceptación `incluye el Ki-67 20 % con entryMethod ocr, extractionConfidence media y reviewStatus requiere_revision cuando el contexto viene de FX-T1a-a [US-065 AC-2]` · integración, mismo archivo, con `insertarFxT1aA`.
- [ ] 1.3 (TDD estricto · D4, D5) Test de aceptación `no envía ni persiste los receptores de progesterona rechazado y reemplazado cuando el contexto viene de FX-T1a-a [US-065 AC-3]` · integración: request capturado y `clinical_context_snapshot` leído de PostgreSQL; el cruce `dataRef` → id se hace con `patient_data_links` del `AIAnalysisRecord` (`entityId`: ningún enlace apunta a los dos ids `rechazado`/`reemplazado`; el UUID de la entidad nunca va en el `clinicalContext`) y se mantiene la aserción por «ningún `reviewStatus` `rechazado`/`reemplazado`», no por el rótulo «Receptor de …» (design D5).
- [ ] 1.4 (TDD estricto · D4) Test de aceptación `lleva provenance.conflict true en el receptor de estrógeno 90 % sembrado en conflicto cuando el contexto viene de FX-T1a-a [US-065 AC-4]` · integración `[S3 resp. 8]`; el dato se identifica por su `dataRef`/id, no por el nombre «Receptor de estrógeno» (design D5).
- [ ] 1.5 (TDD estricto) Implementación mínima si algún test 1.1–1.4 quedó en rojo, con sus unitarios en `tests/unit/evidence-analysis/clinical-context.builder.test.ts` (`provenanceDe()`: `conflict` true solo con `conflictsWithId`) y un unitario de D6: `sqlDatoVigente()` y `registrosVigentes()` derivan de la misma constante `ESTADOS_DESCARTADOS`; actualizar el comentario de `provenanceDe()` como regla de RN-07 (design D1). Commit `feat(L1D-181)`.
- [ ] 1.6 Refactor: reemplazar `SIN_RECHAZADOS` por `sqlDatoVigente()` en `evidence-analysis.repository.ts` (design D2) y Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-181)`.

## ai-services

- [ ] 2.1 (TDD estricto) Test de aceptación `acompaña el Ki-67 20 % con "(sin verificar)" en el bloque de datos del paciente cuando su reviewStatus es requiere_revision [US-065 AC-5]` · Pytest (`@pytest.mark.ac("US-065", 5)`) en `tests/unit/test_prompt_rag_query.py`, con esqueleto `bloque_de_datos_del_paciente()` que lanza `NotImplementedError` para que el rojo falle en la aserción; commit `test(L1D-181)`.
- [ ] 2.2 (TDD estricto) Implementar `etiqueta_de_procedencia()` (RN-07) y `bloque_de_datos_del_paciente()` en `app/prompts/rag_query.py` con sus unitarios uno a la vez (verificado sin etiqueta → requiere_revision → conflicto con precedencia, design D3); subir `VERSION_DEL_PROMPT` de `rag-query@0.3.0` (alias, `l1d-287`) a `rag-query@0.4.0` `[S3 resp. 15]`, sin tocar el formato `[fragmento C<n>]` ni `citedFragments`, y actualizar la aserción de versión del test existente (cambio de spec, no relajación); usar el bloque en `generation.py` como el argumento `contexto_clinico: str` de `construir_prompt_rag_query(pregunta, contexto_clinico, fragmentos: Sequence[FragmentoConAlias], idioma, …)`; limitar el etiquetado a diagnóstico y biomarcadores (Non-Goal del S3). Commit `feat(L1D-181)`.
- [ ] 2.3 (TDD estricto) Tests de comportamiento de los escenarios restantes del spec: dato en conflicto con "(en conflicto)"; `resumen_del_contexto_clinico()` idéntico con y sin etiquetas; prompt de FX-T1a-a sin `terminos` del nivel A ni `prefijos` del nivel B de `terminos-prohibidos.json`, sin `pseudoPatientId` ni `dataRef` `[US-065 AC-5]` `[RN-23]` `[RN-11]`.
- [ ] 2.4 (test después) Test de integración de `/rag/query` con LLM falso que captura el prompt: el contexto de FX-T1a-a llega etiquetado, `meta.promptVersion` empieza por `rag-query@0.4.0` (con sufijo tolerado `+aplicabilidad-texto@0.1.0` de `l1d-128`) y la respuesta valida contra el spec del proveedor (US-214).
- [ ] 2.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-181)`.

## evaluación

- [ ] 3.1 (evaluate) `run-ai-eval` sobre la rama rebasada sobre `l1d-287` (prompt `rag-query@0.4.0` con alias y etiquetas, `[S3 resp. 15]`) con `LLM_PROVIDER=fake`, contra la referencia de `main` con `rag-query@0.3.0`: sin regresión en fidelidad, precisión de citas, "sin evidencia" ni recuperación (recall@10, MRR) y salidas prescriptivas = 0 respecto del baseline; reporte de `ai-eval-runner` en `reports/eval/`. El efecto sobre el LLM real queda en US-233 (S4).

## cierre

- [ ] 4.1 `openspec validate l1d-181-procedencia-contexto-ia --strict`, suites de `clinical-api` y `rag-orchestrator` en verde; sin `contracts:verify-provider` adicional (sin cambios de API).
