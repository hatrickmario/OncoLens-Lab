# Tasks — l1d-275-generacion-opcion-max-options

> ↪ Depende de **US-231a** (adapters reales de *embeddings*, *reranker* y detector de idioma, ADR-39; mitad de US-231, dividida por la decisión 75 del plan; Linear: pendiente (límite de issues del workspace)): en `main` antes de este change para correr con modelos reales. Los AC se verifican con adapters falsos.

> Matriz TDD (CLAUDE.md): endpoint, service y regla de recorte → **TDD estricto, doble bucle**
> (commit `test(L1D-275)` con el test de aceptación en rojo antes de su `feat(L1D-275)`); prompt →
> **evaluate**; composición y configuración → **test después**.
> Mocks solo en los bordes: LLM, NLI, *embeddings*, *reranker* y Milvus (adapters falsos de FX-06a-a /
> FX-06a-b que cumplen el contrato del puerto). Reloj inyectado (`freezegun`). Nunca `.skip`, `skipif`
> ni `xfail`. Secuencia de commits: (sin `contract`, el spec no cambia) → `test` → `feat` → `refactor`.
> Requiere L1D-106 y L1D-179 mergeados (service, puertos y fixtures FX-06a-a / FX-06a-b). Orden de merge
> `[S1 resp. 17]`: L1D-164 → L1D-105 → L1D-106 → L1D-179 → **L1D-275** → L1D-180. Nombres canónicos:
> `app/api/rag_query.py`, `app/config/settings.py`, `app/bootstrap.py`, `EvidenceQueryPort`.
> Respuestas validadas con el *helper* de L1D-164 (no `contracts:verify-provider`, que llega con US-214).

## 1. contratos

- [x] 1.1 (exento: sin diff) `contracts:check` y `contracts:breaking` contra `main` sin diferencias en `apps/rag-orchestrator/openapi.yaml`; modelos de `app/schemas/generated/` usados sin editar. Verificación: salida de ambos comandos en el PR.

## 2. ai-services

- [x] 2.1 (test después) Ampliar el adapter falso del LLM y el `FakeEvidenceGenerator` (L1D-179) de FX-06a-b con `LLM-OK`, `LLM-DOS`, `LLM-SIN-OPCIONES` y `LLM-FUERA-DE-ESQUEMA` (salida `GenerationOutput` sin `limitations`, `[S1 resp. 11]`; contador de invocaciones) y el `CorpusRelease rel-test-1` en el schema `corpus` de test. Verificación: test de humo del fixture.
- [x] 2.2 (TDD estricto) Test de aceptación en rojo: "devuelve con_evidencia con una opción que cita ch-m1-1 con relevanceScore 0.87 y el contrato final del S1 cuando Q-HER2 tiene evidencia sobre el umbral [US-225 AC-1]" · integración (`TestClient` + JWT de servicio de test + `@pytest.mark.ac("US-225", 1)`), con `topRelevanceScore = 0.87` (`[S1 resp. 18]`), validando la respuesta contra el spec con el *helper* de L1D-164. Esqueleto de `LlmEvidenceGenerator` con `raise NotImplementedError` si no existe. Commit `test(L1D-275)`.
- [x] 2.3 (TDD estricto) Test de aceptación en rojo: "devuelve con_evidencia con evidenceOptions vacío y una invocación del LLM cuando Q-TOX no tiene opciones terapéuticas [US-225 AC-2]" · integración. Commit `test(L1D-275)`.
- [x] 2.4 (TDD estricto) Test de aceptación en rojo: "conserva solo la opción de mayor relevanceScore y no la lista en discardedOptions cuando maxOptions es 1 y LLM-DOS devuelve dos opciones válidas [US-225 AC-3]" · integración. Commit `test(L1D-275)`.
- [x] 2.5 (TDD estricto) Test de aceptación en rojo: "responde 503 LOCAL_LLM_UNAVAILABLE sin opciones ni texto generado cuando el LLM devuelve un JSON fuera de esquema [S1 resp. 12]" · integración con `LLM-FUERA-DE-ESQUEMA`, validando el `503` con el *helper* de L1D-164. Commit `test(L1D-275)`.
- [x] 2.6 Extraer `recortar_a_max_opciones()` (FR-09, RN-28) en `app/domain/option_selection.py` y `relevancia_de_opcion()` (RN-03, RN-28) en `app/domain/relevance.py`, con unitarios uno a la vez (lista vacía; menos opciones que el máximo; recorte por relevancia; empate desempatado por `chunkId` de la cita principal ascendente, independiente del orden de aparición; excedente no devuelto como descartada; `relevanceScore` = el de la cita más relevante). Verificación: unitarios en verde y 2.4 en verde. Commit `feat(L1D-275)`.
- [x] 2.7 Implementar `construir_prompt_rag_query()` (`app/prompts/rag_query.py`, sin `pseudoPatientId`, RN-11; instrucciones en positivo, incluida la de atribución de guías con población y escenario `[S1 resp. 34]`; `PROMPT_VERSION = rag-query@0.1.0` en `Settings` de `app/config/settings.py`), `GenerationOutput` (sin `limitations`) y `LlmEvidenceGenerator` (JSON inválido o fuera de esquema → error `LOCAL_LLM_UNAVAILABLE`; `limitaciones_propuestas` siempre vacío en el S1) (`app/application/generation.py`) sobre el puerto `LlmClient`, y la rama con evidencia de `RAGOrchestratorService`: generación → `validar_citas()` (L1D-179) → `verificar_soporte()` (L1D-180) → `recortar_a_max_opciones()` → ensamblado con `meta` completo (`corpusCutoffDate` desde `CorpusReleaseReader.release_vigente()` de L1D-106, `responseLanguage = queryLanguage`) y `topRelevanceScore` de `top_relevance_score()` (L1D-106); log con el número de opciones recortadas (solo conteo). Reutiliza `validar_citas()`, `construir_cita()` y `CorpusCatalogReader` de L1D-179 (ya en `main`); el punto de `verificar_soporte()` lo rellena L1D-180 (design D9). Verificación: 2.2–2.5 en verde. Commit `feat(L1D-275)`.
- [x] 2.8 (test después) Test de la plantilla del prompt `[S1 resp. 15]`: `check_prohibited_terms()` (gemelo Python de L1D-193) sobre la plantilla sin datos con los niveles A y B de `terminos-prohibidos.json` 1.1.0 → cero coincidencias, y la plantilla contiene la instrucción de atribución con población y escenario `[S1 resp. 34]`. Verificación: test en verde.
- [x] 2.9 (test después) Composición en `app/bootstrap.py`: `LlmEvidenceGenerator` con el adapter local OpenAI-compatible en `app/infrastructure/llm/` en la composición de test; la de producción (`LLM_PROVIDER=local`) mantiene el adapter `503` de L1D-106 hasta el PR de L1D-180 (design D9); error de conexión del LLM → `503 LOCAL_LLM_UNAVAILABLE` sin *fallback* (RN-12). Verificación: test de integración de `503` con `respx` validado contra el spec.
- [x] 2.10 (test después) Test de no-fuga: con FX-T4a-a (PII sintética sembrada en el contexto), el prompt construido no contiene `pseudoPatientId` y los logs de `/rag/query` no contienen prompt, `query`, contexto, texto generado ni texto de chunks. Verificación: test en verde.
- [x] 2.11 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-275)`.

## 3. evaluación

- [ ] 3.1 (evaluate) El change introduce el prompt del S1: hasta que exista la suite (US-072, S2), `ai-eval-runner` evalúa a mano el análisis del paciente semilla con el LLM real de L1D-274 (fidelidad, precisión de citas y **M-10.2**, salidas prescriptivas = 0, y la **tasa de menciones de guía sin población ni escenario** `[S1 resp. 34]`, informativa, registradas en el reporte). Verificación: reporte en `reports/eval/` enlazado en el PR. **Diferida a L1D-279 (ARR-03, OL-06) (cierre S1, 2026-10-18).** **Estado 2026-10-22 (ARR-03):** sigue NO-EJECUTABLE con modelos reales: la suite no cablea `proveedor: local` (`componer_servicio`) y faltan los pesos de NLI/reranker; procedimiento en `l1d-235-suite-evaluate/design.md` D21; ID destino propuesto **L1D-280 (ARR-04)** + cableado de `proveedor: local` (a confirmar por sprint-S2).

## 4. Verificación

- [x] 4.1 `openspec validate l1d-275-generacion-opcion-max-options --strict` en verde.
- [x] 4.2 Suite de `apps/rag-orchestrator` en verde (Pytest).
- [x] 4.3 `contracts:check` en verde; `200 con_evidencia` y `503 LOCAL_LLM_UNAVAILABLE` de `/rag/query` validados con el *helper* de L1D-164 en la suite de integración.


> Cierre S1 (2026-10-18): tareas marcadas `[x]` tras `/opsx:verify` sobre `main` con evidencia de commits `test`/`feat` y suites en verde; las diferidas llevan su tarjeta de arrastre (`backlog/sprints/S2-arrastre.md`).