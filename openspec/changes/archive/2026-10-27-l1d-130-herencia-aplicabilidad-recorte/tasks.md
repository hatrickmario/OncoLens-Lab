# Tasks — l1d-130-herencia-aplicabilidad-recorte

> ↪ Depende de `l1d-129-aplicabilidad-causas-avisos` (US-124) y, a través de ella, de
> `l1d-127-estado-criterio-estructurado` (US-122), `l1d-128-aplicabilidad-textual-citada` (US-123) y
> `l1d-126-criterios-aplicabilidad-catalogo` (US-121):
> `SourceApplicability` por fuente en la respuesta de `/rag/query`, fixture FX-08b-a y adapters falsos de
> aplicabilidad. Los unitarios del comparador y de la agregación (AC-1…AC-4) no esperan a esos changes; los
> de `/rag/query` (AC-5…AC-7) sí.

> Matriz TDD (CLAUDE.md): comparador, agregación y recorte (regla RN-28) y endpoint → **TDD estricto, doble
> bucle** (commit `test(L1D-130)` en rojo antes de `feat(L1D-130)`); fixtures y ejemplo de contrato →
> **test después**. `maxOptions` sale de `ANALYSIS_MAX_OPTIONS`; `warnings` de datos del paciente fuera de alcance →
> US-126 (S4); orden de archivo de `applicability`: 127 → 128 → 129 → **130** → 182 (`[S3 resp. 16]`). Mocks solo en los bordes (LLM, NLI, *embeddings*, *reranker*, Milvus) con los adapters
> falsos de FX-08b-b; nunca módulos propios. Sin `.skip`, `skipif` ni `xfail`. Secuencia: `contract` (solo
> ejemplo) → `test` → `feat` → `refactor`.

## 1. contratos

- [x] 1.1 (test después) Sin ejemplo propio (`[S3 resp. 16]`): reutilizar el par de `l1d-129-aplicabilidad-causas-avisos` (`contracts/examples/rag-query-aplicabilidad-a-m1.json` y `con-evidencia-s3-aplicabilidad.json`) y, si hace falta, actualizar en ese mismo par `applicabilitySummary`, `perSource` y `populationNotComparable` de la opción (O-B de FX-08b-b); sin diff en `apps/rag-orchestrator/openapi.yaml`. Verificación: `contracts:check` en verde y `contracts:breaking` contra `main` sin cambios; commit `contract(L1D-130)` solo si se actualizó el par. Evidencia: sin diff en `openapi.yaml`, `contracts/` ni `packages/`; `contracts:check`, `contracts:breaking`, `contracts:generate:check` y `verify-provider` (241 respuestas) en verde; sin commit `contract(L1D-130)`.

## 2. ai-services

- [x] 2.1 (test después) Ampliar los fakes de FX-08b-b: chunks `ch-a4-1`, `ch-a1-1`, `ch-a6-1` con puntajes del *reranker* falso 0,92 / 0,70 / 0,60, `doc-a6` estructurado como `doc-a1` (población propia de FX-08b-b; FX-08b-a no se toca; conteos reales de A-M1 en design Context), y los LLM falsos `LLM-DOS-APL`, `LLM-EMPATE-APL`, `LLM-SIN-SOPORTE-APL` con el NLI falso correspondiente. Verificación: test de humo del fixture. Evidencia: `tests/unit/test_fixture_fx08bb.py`; `doc-a6` estructurado solo en FX-08b-b.
- [x] 2.2 (TDD estricto) Test de aceptación en rojo: "hereda el resumen de doc-a1 y lista ambas fuentes en perSource cuando la opción cita doc-a1 y doc-a2 [US-125 AC-1]" · unitario de dominio con `@pytest.mark.ac("US-125", 1)`; esqueleto de `agregar_aplicabilidad_de_opcion()` con `raise NotImplementedError`. Commit `test(L1D-130)`.
- [x] 2.3 (TDD estricto) Test de aceptación en rojo: "marca populationNotComparable y el aviso poblacion_no_comparable una vez cuando todas las fuentes de la opción tienen un excluyente en no_coincide [US-125 AC-2]" · unitario de dominio. Commit `test(L1D-130)`.
- [x] 2.4 (TDD estricto) Test de aceptación en rojo: "elige la fuente de mayor relevancia cuando dos fuentes empatan en conteos [US-125 AC-3]" · unitario de dominio. Commit `test(L1D-130)`.
- [x] 2.5 (TDD estricto) Test de aceptación en rojo con tabla de casos parametrizada: "ordena por excluyentes ascendente, coincide descendente y relevancia descendente sin puntaje combinado, en cualquier orden de entrada [US-125 AC-4]" · unitario de dominio (casos a–d y el caso anti-ponderación del spec). Commit `test(L1D-130)`.
- [x] 2.6 Extraer `clave_de_aplicabilidad()` y `contar_excluyentes_no_coincide()` (RN-28) en `app/domain/applicability_order.py` y `agregar_aplicabilidad_de_opcion()` (ADR-31) en `app/domain/applicability_aggregation.py`, con unitarios uno a la vez (fuente única; varias fuentes; todas no comparables; empate por relevancia; empate total por `externalId`). Verificación: 2.2–2.5 en verde. Commit `feat(L1D-130)`.
- [x] 2.7 (TDD estricto) Test de aceptación en rojo: "devuelve O-B y no O-A cuando maxOptions es 1 y LLM-DOS-APL trae una opción más relevante pero con un excluyente en no_coincide [US-125 AC-5]" · integración (`TestClient` + JWT de servicio de test), respuesta validada contra el spec del proveedor. Commit `test(L1D-130)`.
- [x] 2.8 (TDD estricto) Test de aceptación en rojo: "devuelve O-B cuando O-B y O-D empatan en conteos y O-B es más relevante [US-125 AC-6]" · integración. Commit `test(L1D-130)`.
- [x] 2.9 (TDD estricto) Test de aceptación en rojo: "devuelve O-A y lista O-B' en discardedOptions con afirmacion_sin_soporte cuando la más aplicable no tiene soporte NLI [US-125 AC-7]" · integración. Commit `test(L1D-130)`.
- [x] 2.10 Ordenar por aplicabilidad antes del recorte: `recortar_a_max_opciones()` acepta opciones con su agregación (sin aplicabilidad mantiene la regla del S1); el service agrega después del soporte y antes del recorte; `_opcion_con_evidencia()` copia `applicabilitySummary`, `perSource`, `populationNotComparable` y `warnings`; fuente citada sin entrada en `applicability` se ignora en `perSource` y no falla (design D7 corregido); nueva `app/application/aplicabilidad_de_opciones.py`; log solo con conteos. Verificación: 2.7–2.9 en verde y escenarios de US-225 AC-3 y del desempate por `chunkId` siguen en verde. Commit `feat(L1D-130)`.
- [x] 2.11 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-130)`. Evidencia: Extract Method en `respuesta_con_evidencia.py`, `fuente_mas_aplicable` y predicado único de excluyente (hallazgos 1, 2 y 5 del design-principles).

## 3. evaluación

- [x] 3.1 (evaluate) `run-ai-eval` con la suite actual sobre la rama: fidelidad, precisión de citas, "sin evidencia" y salidas prescriptivas sin regresión frente al baseline (las métricas de aplicabilidad las mide US-132). Verificación: reporte en `reports/eval/` enlazado en el PR. Evidencia: `eval-required` sin regresión (baseline sin cambio de huella; no cambió modelo, prompt, umbral, catálogo ni corpus) y `tests/evaluation` 613 en verde; las métricas de aplicabilidad las mide US-132.

## 4. Verificación

- [x] 4.1 `openspec validate l1d-130-herencia-aplicabilidad-recorte --strict` en verde.
- [x] 4.2 Suite de `apps/rag-orchestrator` en verde (Pytest).
- [x] 4.3 `contracts:check` en verde y respuestas `200` de `/rag/query` de AC-5…AC-7 validadas contra el spec del proveedor (`contracts:verify-provider`). Evidencia: `verify-provider` 241 respuestas verificadas.
