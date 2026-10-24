# Tasks — l1d-129-aplicabilidad-causas-avisos

> ↪ Requiere en `main` el change de **L1D-127 (US-122)** (`ApplicabilityService`, `domain/applicability_rules.py`,
> FX-08b-a) y **l1d-128-aplicabilidad-textual-citada (US-123)** (AC-4). Integración de punta a punta con los
> changes de **L1D-98 (US-006)** y **L1D-181 (US-065)**.
> Matriz TDD (CLAUDE.md): reglas RN de dominio y service → **TDD estricto, doble bucle** (commit
> `test(L1D-129)` con el test de aceptación en rojo antes de su `feat(L1D-129)`); persistencia ya existente
> (AC-7) y fixtures → **test después**. Mocks solo en los bordes: LLM, NLI, *reranker*, *embeddings* y Milvus
> (adapters falsos de FX-08b-a) en B2; MSW hacia `rag-orchestrator` en B1; nunca módulos propios ni Prisma.
> Nunca `.skip`, `skipif`, `xfail`. Secuencia de commits: `contract` (solo ejemplos; el spec no cambia) → `test` → `feat` → `refactor`.
> `contar_estados()` y `poblacion_no_comparable()` son de `l1d-127` (`[S3 resp. 16]`): aquí no se reimplementan ni se duplican
> sus unitarios. Orden de archivo de `applicability`: 127 → 128 → **129** → 130 → 182.

## 1. contratos

- [ ] 1.1 (test después) Dueño del par de ejemplos con aplicabilidad (`[S3 resp. 16]`, design Contratos): añadir `contracts/examples/rag-query-aplicabilidad-a-m1.json` (`RagQueryInternalResponse`, con `request`) y su público `contracts/examples/con-evidencia-s3-aplicabilidad.json` (`EvidenceAnalysis`), con `applicability` de `doc-a1` (`estado_menopausico` `falta_en_paciente`/`faltante`, `ecog` `sin_verificar`, `summary` del AC-5), y registrar ambos en `contracts/examples/index.json`. **Condicional (`missingCriticalDataLabels`, l1d-188, `[S3 resp. 18]`):** si `l1d-188-base-faltantes-declarados` ya está en `main` al hacer esta tarea, el `analysisBasis` de `con-evidencia-s3-aplicabilidad.json` lleva `missingCriticalDataLabels` (mismo orden y longitud que `missingCriticalData`, etiquetas del catálogo sintético); si aún no está, se omite y lo añade `l1d-188` al rebasar (su tarea 1.1). `contracts:breaking` contra `main` sin diferencias en ambos `openapi.yaml` ni en `contracts/schemas/evidence.yaml`. Verificación: `contracts:check` en verde y salida de ambos comandos en el PR; commit `contract(L1D-129)`.

## 2. ai-services

- [ ] 2.1 (test después) Extender FX-08b-a en `apps/rag-orchestrator/tests/` con la variante `A-M1-CONFLICTO` (dos HER2 `3+ (IHQ)` y `2+`, ambos `reviewStatus = requiere_revision` y `provenance.conflict = true`, design D6) y comprobar que `Q-SIN` y su LLM falso con contador están disponibles. Verificación: test de humo del fixture.
- [ ] 2.2 (TDD estricto) Test de aceptación en rojo: "marca estado_menopausico desconocido por falta_en_paciente con patientValue null y aviso faltante cuando A-M1 no lo tiene [US-124 AC-1]" · integración (`TestClient` + JWT de servicio de test, `@pytest.mark.ac("US-124", 1)`), respuesta validada contra el spec del proveedor. Esqueleto de `causa_de_desconocido()` con `raise NotImplementedError` si no existe. Commit `test(L1D-129)`.
- [ ] 2.3 (TDD estricto) Test de aceptación en rojo: "conserva el estado coincide de ecog con aviso sin_verificar cuando el ECOG de A-M1 está en requiere_revision [US-124 AC-2]" · integración. Commit `test(L1D-129)`.
- [ ] 2.4 (TDD estricto) Test de aceptación en rojo: "avisa en_conflicto en estado_her2 y responde 200 cuando el seed siembra dos HER2 en conflicto [US-124 AC-3]" · integración con `A-M1-CONFLICTO`. Commit `test(L1D-129)`.
- [ ] 2.5 (TDD estricto) Test de aceptación en rojo: "marca populationNotComparable en doc-a2 cuando el excluyente estado_her2 queda no_coincide con APL-OK [US-124 AC-4]" · integración sobre `poblacion_no_comparable()` de `l1d-127`; si pasa en verde a la primera, se deja como regresión y se anota en el PR. Commit `test(L1D-129)`.
- [ ] 2.6 (TDD estricto) Test de aceptación en rojo: "resume doc-a1 como conteo 3-0-0-2 sin ningún campo numérico de puntaje ni porcentaje de aplicabilidad [US-124 AC-5]" · integración; la aserción recorre la respuesta y falla ante cualquier clave `score|peso|weight|porcentaje|percent` dentro de `applicability`; sobre `contar_estados()` de `l1d-127` (si pasa en verde a la primera, regresión anotada en el PR). Commit `test(L1D-129)`.
- [ ] 2.7 (TDD estricto; regresión RN-02) Test de aceptación: "devuelve applicability vacío y cero invocaciones del LLM cuando Q-SIN no supera el umbral [US-124 AC-6]" · integración. Si pasa en verde a la primera, se deja como regresión y se anota en el PR. Commit `test(L1D-129)`.
- [ ] 2.8 Extraer `causa_de_desconocido()` (FR-25, D2) en `app/domain/applicability_rules.py`, con unitarios uno a la vez (clave en `missingCriticalData`; destino sin dato en el contexto; dato presente y fuente sin reporte → `no_reportado_por_fuente`; falta en paciente y en fuente → `falta_en_paciente`). Verificación: 2.2 en verde. Commit `feat(L1D-129)`.
- [ ] 2.9 Extraer `aviso_dato_paciente()` (RN-26, RN-07, D3), con unitarios uno a la vez (`verificado`/`corregido`/`auto_aceptado` → `null`; `requiere_revision` → `sin_verificar`; `conflict = true` → `en_conflicto`; varios datos con uno en conflicto → `en_conflicto`; el aviso no cambia `status`). Verificación: 2.3 y 2.4 en verde. Commit `feat(L1D-129)`.
- [ ] 2.10 Componer en `ApplicabilityService` (`app/application/aplicabilidad.py`) `causa_de_desconocido()` y `aviso_dato_paciente()` con `poblacion_no_comparable()` y `contar_estados()` de `l1d-127` (sin reimplementarlas ni duplicar sus unitarios, `[S3 resp. 16]`) al cerrar cada `SourceApplicability`; log solo con conteos. Verificación: 2.2–2.6 en verde y suite de `apps/rag-orchestrator` en verde. Commit `feat(L1D-129)`.
- [ ] 2.11 (test después) Test de no-fuga: los logs de `/rag/query` con FX-08b-a no contienen `patientValue`, `studyPopulationValue` ni claves de `missingCriticalData` en claro fuera de los conteos. Verificación: test en verde.
- [ ] 2.12 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-129)`.

## 3. clinical-platform

- [ ] 3.1 (test después; regresión RN-06, D7) Test de integración Supertest + PostgreSQL real de test: "persiste en el AIAnalysisRecord la misma applicability que responde, con causas, avisos y conteo [US-124 AC-7]", con `rag-orchestrator` simulado por MSW desde el ejemplo de la tarea 1.1 y la respuesta validada contra el spec de `clinical-api`. Si falla, corregir la copia en `analysis-record.ts` / `evidence-analysis.repository.ts` (commit `feat(L1D-129)`). Verificación: test en verde.
- [ ] 3.2 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-129)` (sin cambios si 3.1 no tocó código).

## 4. Verificación

- [ ] 4.1 `openspec validate l1d-129-aplicabilidad-causas-avisos --strict` en verde.
- [ ] 4.2 Suites de `apps/rag-orchestrator` (Pytest) y `apps/clinical-api` (Vitest) en verde.
- [ ] 4.3 `contracts:check` en verde y respuestas de `/rag/query` y `/platform/evidence-analyses` validadas contra el spec de cada proveedor (`contracts:verify-provider`, US-214). Sin `run-ai-eval`: no cambia modelo, prompt, umbral, catálogo ni corpus.
