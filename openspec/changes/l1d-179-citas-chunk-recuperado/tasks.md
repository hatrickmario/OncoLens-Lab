# Tasks — l1d-179-citas-chunk-recuperado

> ↪ Depende de **US-231a** (adapters reales de *embeddings*, *reranker* y detector de idioma, ADR-39; mitad de US-231, dividida por la decisión 75 del plan; Linear: pendiente (límite de issues del workspace)): en `main` antes de este change para correr con modelos reales. Los AC se verifican con adapters falsos.

> Matriz TDD (CLAUDE.md): regla RN-01/RN-04 y endpoint → **TDD estricto, doble bucle** (commit
> `test(L1D-179)` con el test de aceptación en rojo antes de su `feat(L1D-179)`); fixtures →
> **test después**. Mocks solo en los bordes: LLM, Milvus, *embeddings*, *reranker* (adapters
> falsos FX-06a-a / FX-06a-b, mismo contrato que los reales). Catálogo del corpus: schema `corpus`
> de test real en integración. Nunca `.skip`, `skipif` ni `xfail`.
> Secuencia: (sin `contract`, el spec no cambia) → `test` → `feat` → `refactor`. Orden de merge
> `[S1 resp. 17]`: L1D-164 → L1D-105 → L1D-106 → **L1D-179** → L1D-275 → L1D-180. Nombres canónicos:
> `app/api/rag_query.py`, `app/config/settings.py`, `app/bootstrap.py`, `EvidenceQueryPort`.
> Respuestas validadas con el *helper* de L1D-164 (no `contracts:verify-provider`, que llega con US-214).

## 1. contratos

- [ ] 1.1 (exento: sin diff) Comprobar que el change no toca la API: `contracts:check` y `contracts:breaking` contra `main` sin diferencias en `apps/rag-orchestrator/openapi.yaml` ni en `contracts/schemas/evidence.yaml`; modelos de `app/schemas/generated/` sin editar. Verificación: salida en el PR.

## 2. ai-services

- [ ] 2.1 (test después) Crear en FX-06a-b el `FakeEvidenceGenerator` (implementa `EvidenceGenerator` de L1D-106; lo reutilizan L1D-275 y L1D-180) con `LLM-OK`, `LLM-CITA-AJENA`, `LLM-TITULO-FALSO`, opción con `citedSources = []` y opción con cita mixta (`ch-m1-1` + `ch-x-999`). Verificación: test de humo del fixture.
- [ ] 2.2 (TDD estricto) Test de aceptación en rojo: "copia title, sourceName, externalId, language, sourceType y chunkTextSnapshot del corpus cuando LLM-OK cita ch-m1-1 [US-063 AC-1]" · integración (`TestClient` + JWT de servicio de test + `@pytest.mark.ac("US-063", 1)`), validando la respuesta contra el spec con el *helper* de L1D-164. Esqueleto con `raise NotImplementedError` si el símbolo no existe. Commit `test(L1D-179)`.
- [ ] 2.3 (TDD estricto) Test de aceptación en rojo: "descarta con cita_invalida la opción que cita ch-x-999 cuando no fue recuperado [US-063 AC-2]" · integración. Commit `test(L1D-179)`.
- [ ] 2.4 (TDD estricto) Test de aceptación en rojo: "descarta con sin_citas la opción con citedSources vacío [US-063 AC-3]" · integración. Commit `test(L1D-179)`.
- [ ] 2.5 (TDD estricto) Test de aceptación en rojo: "conserva título y fuente del corpus y no emite 'Guía NCCN 2026' cuando el LLM inventa metadatos [US-063 AC-4]" · integración, buscando la cadena en la respuesta serializada completa. Commit `test(L1D-179)`.
- [ ] 2.6 (TDD estricto) Test de aceptación en rojo: "conserva la opción con solo la cita ch-m1-1 cuando cita también ch-x-999 [US-063 AC-5]" · integración. Commit `test(L1D-179)`.
- [ ] 2.7 (TDD estricto) Test de aceptación en rojo: "conserva chunkTextSnapshot en inglés y language en cuando la pregunta está en español [US-063 AC-6]" · integración. Commit `test(L1D-179)`.
- [ ] 2.8 Extraer `validar_citas()` (RN-01) en `app/domain/citations.py`, con unitarios uno a la vez (lista vacía → `sin_citas`; todas fuera del conjunto → `cita_invalida`; mixta → solo válidas; duplicadas → una). Verificación: 2.3, 2.4 y 2.6 en verde. Commit `feat(L1D-179)`.
- [ ] 2.9 Extraer `construir_cita()` (RN-04) en `app/domain/citations.py` (campos del catálogo + `chunkTextSnapshot`/`chunkId` del chunk; metadatos del LLM ignorados; `possiblyOutdated` y `newerVersionAvailable` = `false` en el S1), puerto `CorpusCatalogReader` en `app/application/ports.py` (de L1D-164), adapter SQL sobre el schema `corpus`, su fake y su enlace en `app/bootstrap.py`. Verificación: 2.2, 2.5 y 2.7 en verde. Commit `feat(L1D-179)`.
- [ ] 2.10 Abrir la rama con evidencia de `RAGOrchestratorService` (`EvidenceGenerator` → `validar_citas()` → `construir_cita()` → respuesta `con_evidencia`), pasando el conjunto de chunks entregados a la generación; `FakeEvidenceGenerator` solo en la composición de test, producción sigue en el `503` provisional de L1D-106. Verificación: 2.2–2.7 en verde y suite de L1D-106 sin regresiones. Commit `feat(L1D-179)`.
- [ ] 2.11 (test después) Test de no-fuga en logs: los logs del validador solo registran conteos y `chunkId`, nunca texto de chunks, pregunta, contexto ni `pseudoPatientId`. Verificación: test en verde.
- [ ] 2.12 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-179)`.

## 3. evaluación

- [ ] 3.1 (exento) No cambia modelo, prompt, umbral, catálogo ni corpus: sin `run-ai-eval`. La precisión de citas (M-10.1) se mide en US-072 (S2). Verificación: constancia en el PR.

## 4. Verificación

- [ ] 4.1 `openspec validate l1d-179-citas-chunk-recuperado --strict` en verde.
- [ ] 4.2 Suite de `apps/rag-orchestrator` en verde (Pytest).
- [ ] 4.3 `contracts:check` en verde; `200` de `/rag/query` con `evidenceOptions` y `discardedOptions` validado con el *helper* de L1D-164 en la suite de integración, aunque no haya cambio de API.
