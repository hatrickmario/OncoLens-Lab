# Tasks — l1d-127-estado-criterio-estructurado

> ↪ Depende de **US-121 (L1D-126)** (forma de `aplicabilidad.json` y validador) y **US-118 (L1D-117)**
> (`population_criteria` poblado por la ingesta), ambos del S3: los AC se verifican con el catálogo de test
> `test-apl-1.0.0` y `population_criteria` sembrado (FX-08b-a), así que el change puede avanzar en paralelo y se
> rebasa sobre ellos (`studyKey` de l1d-126, design D4; Open Question Q2). Orden de archivo de `applicability`:
> **127** → 128 → 129 → 130 → 182 (`[S3 resp. 16]`).
>
> Matriz TDD (CLAUDE.md): regla de dominio y endpoint → **TDD estricto, doble bucle** (commit `test(L1D-127)`
> con el test de aceptación en rojo antes de su `feat(L1D-127)`); fixtures y adapters de lectura → **test
> después**. Mocks solo en los bordes: LLM, NLI, Milvus, *embeddings*, *reranker* (adapters falsos con el mismo
> contrato que los reales). Schema `corpus` de test real en integración. Reloj e IDs inyectados. Nunca `.skip`,
> `skipif` ni `xfail`. Sin cambio de API: no hay commit `contract(L1D-127)`. Respuestas validadas contra el spec
> del proveedor con el *helper* de L1D-164.

## 1. ai-services

- [ ] 1.1 (test después) Fixture FX-08b-a en `apps/rag-orchestrator/tests/fixtures/`: catálogo clínico de test `test-apl-1.0.0` y su variante `test-apl-1.0.1` (`ecog.rule.limits.max = 0`), **reutilizados** de `l1d-126` (`packages/clinical-catalogs/test/fixtures/test-apl-*`, con su `poblacion.json`; no se inventa la lista de claves): cada criterio con el `studyKey` de `l1d-126` D2 (`estado_her2` → `biomarcadores.her2`, `estadio` → `estadio`, `ecog` → `ecog`, `estado_menopausico` → `estado_menopausico` (asumida en `poblacion.json`), `linea_tratamiento` → `linea`), `[S3 resp. 16]`; mama: `estado_her2` excluyente con tabla de categorías "3+" / "2+ con ISH positivo" → positivo; `estadio` por rango; `ecog` por rango con condición de "Parcial" por subgrupo; `estado_menopausico`; `linea_tratamiento`), `clinicalContext` sintético de A-M1, documentos `doc-a1`…`doc-a5` con `population_criteria` y `metadata_source` sembrados en el schema `corpus` de test, chunks y puntajes del *reranker* falso, y el LLM falso `APL-VALOR-PACIENTE` (salida de generación válida que atribuye "2+" al paciente). Verificación: test de humo del fixture en verde.
- [ ] 1.2 (TDD estricto) Test de aceptación en rojo: "trae estado_her2 con patientValue '3+ (IHQ)', studyPopulationValue 'HER2 positivo', coincide, excluyente y cita de doc-a1, y estadio y ecog en coincide cuando se recupera doc-a1 [US-122 AC-1]" · integración (`TestClient` + JWT de servicio de test + `@pytest.mark.ac("US-122", 1)`), validando contra `RagQueryInternalResponse`. Esqueleto con `raise NotImplementedError` si el símbolo no existe. Commit `test(L1D-127)`.
- [ ] 1.3 (TDD estricto) Test de aceptación en rojo: "conserva patientValue '3+ (IHQ)' del clinicalContext cuando el LLM falso atribuye '2+' al paciente [US-122 AC-2]" · integración. Commit `test(L1D-127)`.
- [ ] 1.4 (TDD estricto) Test de aceptación en rojo: "deja estado_her2 en no_coincide cuando doc-a4 publica HER2 negativo [US-122 AC-3]" · integración. Commit `test(L1D-127)`.
- [ ] 1.5 (TDD estricto) Test de aceptación en rojo: "deja ecog en parcial cuando doc-a5 reporta ECOG 0–1 solo para un subgrupo [US-122 AC-4]" · integración. Commit `test(L1D-127)`.
- [ ] 1.6 (TDD estricto) Test de aceptación en rojo: "deja cada criterio desconocido con studyPopulationValue null y no_reportado_por_fuente, salvo estado_menopausico con falta_en_paciente, cuando doc-a3 no tiene población [US-122 AC-5]" (precedencia `[S3 resp. 16]`) · integración. Commit `test(L1D-127)`.
- [ ] 1.7 (TDD estricto) Test de aceptación en rojo: "da una applicability idéntica en dos cálculos y el LLM falso registra una sola invocación por consulta, la de generación, cuando se procesa dos veces doc-a1 [US-122 AC-6]" · integración con contador de invocaciones. Commit `test(L1D-127)`.
- [ ] 1.7b (TDD estricto) Test de aceptación en rojo, diferido por escrito desde `l1d-126` (`[S3 resp. 16]`): "deja ecog en coincide con test-apl-1.0.0 y en no_coincide con test-apl-1.0.1 sin cambiar el resto de criterios, con la misma build y otro CLINICAL_CATALOG_PATH, cuando se evalúa doc-a1 para A-M1 [US-121 AC-5]" · integración (`TestClient` + JWT de servicio de test, `@pytest.mark.ac("US-121", 5)`), arrancando la app una vez con cada directorio de catálogo de `l1d-126`; verifica el escenario «Cambiar el rango de ecog en el catálogo cambia el estado sin desplegar código» del delta `clinical-catalogs` de `l1d-126` (RN-22, NFR-14). La regla `rango` de `evaluar_criterio()` respeta `rule.limits`. Commit `test(L1D-127)`.
- [ ] 1.8 (TDD estricto) Extraer `evaluar_criterio()` (FR-25) con las reglas `igualdad`, `pertenencia`, `rango` y la condición de "Parcial", `valor_del_paciente()` (ADR-34 b), `valor_del_estudio()` (RN-25), `contar_estados()` y `poblacion_no_comparable()` (base de RN-28) en `app/domain/applicability_rules.py`, con unitarios uno a la vez (igualdad coincide; igualdad no coincide; categoría "3+ (IHQ)" → positivo; rango dentro; rango fuera; `rule.limits.max` acota el rango; condición de "Parcial"; estudio `no_disponible` → `no_reportado_por_fuente`; paciente ausente → `falta_en_paciente`; ambos ausentes → `falta_en_paciente` (`[S3 resp. 16]`); valor del estudio leído por `studyKey` y copiado carácter a carácter; varios valores del mismo destino → menor `monthsAgo`; entero de ECOG copiado como "1"; conteo por estado; excluyente en `no_coincide` → no comparable). Verificación: unitarios en verde. Commit `feat(L1D-127)`.
- [ ] 1.9 (TDD estricto) Puerto `CorpusCatalogReader.poblacion_por_documento(ids)` en `app/application/ports.py`; `ApplicabilityService` en `app/application/aplicabilidad.py` **sin puerto de LLM**, que recibe inyectado `CriteriosDeAplicabilidad` (puerto y adapter de `l1d-126`, `app/domain/criterios_aplicabilidad.py`; no se amplía `CatalogoClinico`); etapa `_evaluar_aplicabilidad()` en la rama `con_evidencia` de `RAGOrchestratorService` (nunca en `sin_evidencia`); `ensamblar_respuesta_con_evidencia()` mapea a `SourceApplicability` con `citedSources` del mejor chunk del documento (D6) y el orden de D7; cableado en `app/bootstrap.py`. Verificación: 1.2–1.7b en verde. Commit `feat(L1D-127)`.
- [ ] 1.10 (test después) Adapter: lectura de `population_criteria` y `metadata_source` en `infrastructure/catalog/catalogo_reader.py` con el rol `rag_corpus`. Verificación: test de integración contra el schema `corpus` de test (la carga de `aplicabilidad.json` ya la cubre `l1d-126`).
- [ ] 1.11 (test después) Regresión de fallo cerrado: el lector de población lanzando un error → `503 RETRIEVAL_UNAVAILABLE` sin `applicability` ni eco de la pregunta (design D4), validado contra el spec del proveedor. Verificación: test en verde.
- [ ] 1.12 (test después) Regresión del contrato S1: con un catálogo cuyo `aplicabilidad.json` de mama tiene `items = []`, el escenario de US-225 AC-1 sigue devolviendo `applicability = []` (delta de `evidence-analysis`); suites de L1D-106, L1D-179, L1D-180 y L1D-275 sin regresiones. Verificación: suites en verde.
- [ ] 1.13 (test después) No-fuga en logs: la etapa solo registra `traceId`, número de documentos, conteo de criterios por estado y latencia; nunca `patientValue`, `studyPopulationValue`, texto de chunks ni `pseudoPatientId`. Verificación: test con captura de logs en verde.
- [ ] 1.14 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-127)`.

## 2. evaluación

- [ ] 2.1 (exento) Sin cambio de modelo, prompt, umbral, catálogo real ni corpus: `run-ai-eval` no aplica. M-08.2 y M-08.6 se miden en US-132 (L1D-244). Verificación: nota en el PR.

## 3. Verificación

- [ ] 3.1 `openspec validate l1d-127-estado-criterio-estructurado --strict` en verde.
- [ ] 3.2 Suite de `apps/rag-orchestrator` en verde (Pytest, unitarios e integración).
- [ ] 3.3 `contracts:check` en verde y respuestas `200` y `503` de `/rag/query` validadas contra el spec del proveedor en la suite de integración (sin cambios de API: no aplica `contracts:breaking`).
