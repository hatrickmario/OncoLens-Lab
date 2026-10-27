# Tasks — l1d-129-aplicabilidad-causas-avisos

> ↪ Parte de la rama de **l1d-128** (PR en curso; incluye L1D-127) y de `main` con **L1D-181**; **L1D-98** (#215) se integra
> por merge de `feat/l1d-98-faltantes-al-analisis` si sigue abierto.
> Matriz TDD (CLAUDE.md): reglas RN de dominio y service → **TDD estricto, doble bucle** (commit
> `test(L1D-129)` con el test de aceptación en rojo antes de su `feat(L1D-129)`); persistencia ya existente
> (AC-7) y fixtures → **test después**. Mocks solo en los bordes: LLM, NLI, *reranker*, *embeddings* y Milvus
> (adapters falsos de FX-08b-a) en B2; MSW hacia `rag-orchestrator` en B1; nunca módulos propios ni Prisma.
> Nunca `.skip`, `skipif`, `xfail`. Secuencia de commits: `contract` (solo ejemplos; los `openapi.yaml` no cambian) → `test` → `feat` → `refactor`.
> `contar_estados()` y `poblacion_no_comparable()` son de `l1d-127` (`[S3 resp. 16]`): aquí no se reimplementan ni se duplican
> sus unitarios. Orden de archivo de `applicability`: 127 → 128 → **129** → 130 → 182.

## 1. contratos

- [ ] 1.1 (test después) Corregir los 6 ejemplos de petición que nombran el biomarcador «Receptor de estrógeno» (`case-summary-request`, `rag-follow-up-request`, `rag-query-request`, `-sin-evidencia`, `-sin-opciones`, `-solo-descartadas`) a `RE` (nombre del seed de L1D-95a y `match.name` del catálogo real) y ajustar en el mismo commit los tests de prompt que fijan la línea. Verificación: `contracts:check` y la suite de `rag-orchestrator` en verde.
- [ ] 1.2 (test después) Dueño del par de ejemplos con aplicabilidad (`[S3 resp. 16]`, design Contratos): añadir `contracts/examples/rag-query-request-aplicabilidad-a-m1.json` (petición A-M1), `rag-query-aplicabilidad-a-m1.json` (`RagQueryInternalResponse`, con `request`) y `con-evidencia-s3-aplicabilidad.json` (`EvidenceAnalysis`), con la `applicability` de `doc-a1` del catálogo real (6 criterios), y registrarlos en `contracts/examples/index.json`. `l1d-188` (#216) no está en `main`: se omite `missingCriticalDataLabels` (lo añade `l1d-188` al rebasar). `contracts:breaking` contra `main` sin diferencias en ambos `openapi.yaml` ni en `contracts/schemas/`. Verificación: `contracts:check` en verde y salida de ambos comandos en el PR; commit `contract(L1D-129)`.

## 2. ai-services

- [ ] 2.1 (test después) Extender FX-08b-a en `apps/rag-orchestrator/tests/` con la variante `A-M1-CONFLICTO` (dos HER2 `3+ (IHQ)` y `2+`, ambos `reviewStatus = requiere_revision` y `provenance.conflict = true`, design D6) y comprobar que `Q-SIN` y su LLM falso con contador están disponibles. Verificación: test de humo del fixture.
- [ ] 2.2 (TDD estricto) Test de aceptación en rojo: "marca estado_menopausico desconocido por falta_en_paciente con patientValue null y aviso faltante cuando A-M1 no lo tiene [US-124 AC-1]" · integración (`TestClient` + JWT de servicio de test, `@pytest.mark.ac("US-124", 1)`), respuesta validada contra el spec del proveedor. Esqueleto de `causa_de_desconocido()` con `raise NotImplementedError` si no existe. Commit `test(L1D-129)`.
- [ ] 2.3 (TDD estricto) Test de aceptación en rojo: "conserva el estado coincide de ecog con aviso sin_verificar cuando el ECOG de A-M1 está en requiere_revision [US-124 AC-2]" · integración. Commit `test(L1D-129)`.
- [ ] 2.4 (TDD estricto) Test de aceptación en rojo: "avisa en_conflicto en estado_her2 y responde 200 cuando el seed siembra dos HER2 en conflicto [US-124 AC-3]" · integración con `A-M1-CONFLICTO`. Commit `test(L1D-129)`.
- [ ] 2.5 (TDD estricto) Test de aceptación en rojo: "marca populationNotComparable en doc-a2 cuando el excluyente estado_her2 queda no_coincide con APL-OK [US-124 AC-4]" · integración sobre `poblacion_no_comparable()` de `l1d-127`; si pasa en verde a la primera, se deja como regresión y se anota en el PR. Commit `test(L1D-129)`.
- [ ] 2.6 (TDD estricto) Test de aceptación en rojo: "resume doc-a1 como conteo 2-0-0-3 sin ningún campo numérico de puntaje ni porcentaje de aplicabilidad [US-124 AC-5]" · integración; la aserción recorre la respuesta y falla ante cualquier clave `score|peso|weight|porcentaje|percent` dentro de `applicability`; sobre `contar_estados()` de `l1d-127` (si pasa en verde a la primera, regresión anotada en el PR). Commit `test(L1D-129)`.
- [ ] 2.7 (TDD estricto; regresión RN-02) Test de aceptación: "devuelve applicability vacío y cero invocaciones del LLM cuando Q-SIN no supera el umbral [US-124 AC-6]" · integración. Si pasa en verde a la primera, se deja como regresión y se anota en el PR. Commit `test(L1D-129)`.
- [ ] 2.8 Extraer `causa_de_desconocido()` (FR-25, D2) de `evaluar_criterio` en `app/domain/applicability_rules.py`, con unitarios uno a la vez (paciente sin dato → `falta_en_paciente`; dato presente y fuente sin reporte → `no_reportado_por_fuente`; faltan ambos → `falta_en_paciente`; ambos presentes → `null`) y la clave en `missingCriticalData` (`datos_criticos_faltantes`) que fuerza `falta_en_paciente` con `patientValue = null`. Verificación: 2.2 en verde. Commit `feat(L1D-129)`.
- [ ] 2.9 Extraer `aviso_dato_paciente()` (RN-26, RN-07, D3) con `ProcedenciaDelDato`, unitarios uno a la vez (`verificado`/`corregido`/`auto_aceptado` → `null`; `requiere_revision` → `sin_verificar`; `conflict = true` → `en_conflicto` y gana a `sin_verificar`; dato ausente → `faltante`; destino compuesto reúne componentes; el aviso no cambia `status`), `contexto_del_paciente` que traduce `Provenance`, la copia a `patientDataWarning` en `respuesta_con_evidencia` y el **test de paridad** `reviewStatus × conflict` contra `etiqueta_de_procedencia` (un test en cada lado). Verificación: 2.3 y 2.4 en verde. Commit `feat(L1D-129)`.
- [ ] 2.10 Verificar la composición: `evaluar_criterio_de_fuente` fija causa y aviso por criterio, `con_valor_textual` (L1D-128) conserva el aviso, y `ApplicabilityService` mantiene conteo y no comparabilidad de L1D-127 (sin reimplementarlas ni duplicar sus unitarios, `[S3 resp. 16]`); log solo con conteos. Verificación: 2.2–2.6 en verde y suite de `apps/rag-orchestrator` en verde. Commit `feat(L1D-129)`.
- [ ] 2.11 (test después) Test de no-fuga: los logs de `/rag/query` con FX-08b-a no contienen `patientValue`, `studyPopulationValue` ni claves de `missingCriticalData` en claro fuera de los conteos. Verificación: test en verde.
- [ ] 2.12 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-129)`.

## 3. clinical-platform

- [ ] 3.1 (test después; regresión RN-06, D7) Test de integración Supertest + PostgreSQL real de test: "persiste en el AIAnalysisRecord la misma applicability que responde, con causas, avisos y conteo [US-124 AC-7]", con `rag-orchestrator` simulado por MSW desde el ejemplo de la tarea 1.1 y la respuesta validada contra el spec de `clinical-api`. Si falla, corregir la copia en `analysis-record.ts` / `evidence-analysis.repository.ts` (commit `feat(L1D-129)`). Verificación: test en verde.
- [ ] 3.2 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-129)` (sin cambios si 3.1 no tocó código).

## 4. Verificación

- [ ] 4.1 `openspec validate l1d-129-aplicabilidad-causas-avisos --strict` en verde.
- [ ] 4.2 Suites de `apps/rag-orchestrator` (Pytest) y `apps/clinical-api` (Vitest) en verde.
- [ ] 4.3 `contracts:check` en verde y respuestas de `/rag/query` y `/platform/evidence-analyses` validadas contra el spec de cada proveedor (`contracts:verify-provider`, US-214). Sin `run-ai-eval`: no cambia modelo, prompt, umbral, catálogo ni corpus.
