# Tasks — l1d-180-soporte-nli-descartadas

> ↪ Depende de **US-231** (adapters reales, ADR-39; Linear: pendiente (límite de issues del workspace); propuesta, decisión 74 del plan): en `main` antes de este change para correr con modelos reales. Los AC se verifican con adapters falsos.

> Matriz TDD (CLAUDE.md): regla RN-01/RN-23 y endpoint → **TDD estricto, doble bucle** (commit
> `test(L1D-180)` con el test de aceptación en rojo antes de su `feat(L1D-180)`); umbral y modelo NLI →
> **evaluate**; fixtures → **test después**. Mocks solo en los bordes: LLM, NLI, Milvus, *embeddings*,
> *reranker* (adapters falsos FX-06a-a / FX-06a-b, mismo contrato que los reales). Catálogo del corpus:
> schema `corpus` de test real en integración. Reloj e IDs inyectados. Nunca `.skip`, `skipif` ni `xfail`.
> Secuencia: `contract` → `test` → `feat` → `refactor`. Orden de merge `[S1 resp. 17]`: L1D-164 →
> L1D-105 → L1D-106 → L1D-179 → L1D-275 → **L1D-180** (quien mergea segundo rebasa). Nombres canónicos:
> `app/api/rag_query.py`, `app/config/settings.py`, `app/bootstrap.py`, `EvidenceQueryPort`.
> Respuestas validadas con el *helper* de L1D-164 (no `contracts:verify-provider`, que llega con US-214).

## 1. contratos

- [ ] 1.1 (test después) Editar `apps/rag-orchestrator/openapi.yaml` (skill `sync-contracts`, `[S1 resp. 12]`): añadir `ErrorNliNoDisponible` (`error: const NLI_UNAVAILABLE`) como tercera alternativa del `oneOf` del `503` de `POST /rag/query` que creó L1D-106, ampliando su descripción; `info.version` 1.2.0 → 1.3.0 `[S1 resp. 37]`. Verificación: diff del design.md `## Contratos`.
- [ ] 1.2 (test después) Añadir `contracts/examples/rag-nli-no-disponible.json` (sintético, sin eco) y su entrada en `contracts/examples/index.json` (`target: #/paths/~1rag~1query/post/responses/503`). Verificación: `contracts:check` en verde.
- [ ] 1.3 (test después) `contracts:generate` (Pydantic y cliente TS, sin edición manual), `contracts:check` y `contracts:breaking` (oasdiff contra `main`, `--fail-on ERR`): sin `ERR`; el warning `response-body-wrapped-in-one-of-original-preserved`, si aparece, se declara en el PR (design.md `## Contratos`); un `ERR` detiene el change (ADR-26). Commit `contract(L1D-180)`.

## 2. ai-services

- [ ] 2.1 (test después) Completar FX-06a-b: `FakeNliClassifier` con registro de pares (premisa, hipótesis), label y `p_entailment` por hipótesis y modo error; variantes del LLM falso (justificación con "recomendado para este paciente") y `FakeEvidenceGenerator` que propone limitaciones (sin soporte; con "debe recibir"), porque el LLM no las genera en el S1 `[S1 resp. 11]`. Verificación: test de humo del fixture.
- [ ] 2.2 (TDD estricto) Test de aceptación en rojo: "conserva la opción e invoca el NLI con ch-m1-1 como premisa y cada afirmación como hipótesis cuando LLM-OK y NLI en entailment [US-064 AC-1]" · integración (`TestClient` + JWT de servicio de test + `@pytest.mark.ac("US-064", 1)`), validando contra el spec con el *helper* de L1D-164. Esqueleto con `raise NotImplementedError` si el símbolo no existe. Commit `test(L1D-180)`.
- [ ] 2.3 (TDD estricto) Test de aceptación en rojo: "descarta con afirmacion_sin_soporte y unsupportedClaims ['reduce la mortalidad a la mitad'] cuando LLM-SIN-SOPORTE y NLI neutral [US-064 AC-2]" · integración. Commit `test(L1D-180)`.
- [ ] 2.4 (TDD estricto) Test de aceptación en rojo: "omite la limitación propuesta por el generador y cuenta omittedClaims = 1 cuando el NLI la clasifica neutral [US-064 AC-3]" · integración con `FakeEvidenceGenerator`, buscando el texto en la respuesta serializada completa. Commit `test(L1D-180)`.
- [ ] 2.5 (TDD estricto) Test de aceptación en rojo: "descarta con afirmacion_sin_soporte cuando el NLI devuelve contradiction [US-064 AC-4]" · integración. Commit `test(L1D-180)`.
- [ ] 2.6 (TDD estricto) Test de aceptación en rojo: "descarta la opción cuando entailment 0,55 queda bajo NLI_ENTAILMENT_THRESHOLD 0,7 [US-064 AC-5]" · integración. Commit `test(L1D-180)`.
- [ ] 2.7 (TDD estricto) Test de aceptación en rojo: "responde 503 NLI_UNAVAILABLE sin opciones cuando el adapter NLI lanza un error [US-064 AC-6]" · integración, validando el `503` contra el spec con el *helper* de L1D-164. Commit `test(L1D-180)`.
- [ ] 2.8 (TDD estricto) Test de aceptación en rojo: "descarta la opción, reemplaza la afirmación por '[afirmación retirada: formulación no permitida]' y checkProhibitedTerms da cero coincidencias en los campos generados cuando la justificación dice 'recomendado para este paciente' [US-064 AC-7]" · integración, sobre `CAMPOS_GENERADOS`. Commit `test(L1D-180)`.
- [ ] 2.9 (TDD estricto) Test de aceptación en rojo: "omite la limitación propuesta con 'debe recibir', omittedClaims = 1 y cero coincidencias en los campos generados [US-064 AC-8]" · integración con `FakeEvidenceGenerator`. Commit `test(L1D-180)`.
- [ ] 2.10 Extraer `dividir_en_afirmaciones()` en `app/domain/claims.py` y `verificar_soporte()` (RN-01) con `soporta()` y `retirar_texto_prohibido()` (RN-23) en `app/domain/support.py`, con unitarios uno a la vez (una oración → una afirmación; decimales no parten; entailment ≥ umbral soporta; < umbral no; neutral/contradiction no; varias citas, una basta; limitación soportada → `llm_verificado`; término prohibido no va al NLI; el fragmento prohibido se reemplaza siempre por el literal de `[S1 resp. 16]`, en el idioma de la pregunta; literales de retiro sin coincidencias). Verificación: 2.3–2.6, 2.8 y 2.9 en verde. Commit `feat(L1D-180)`.
- [ ] 2.11 Puertos `NliClassifier` y `ProhibitedTermsChecker` en `application/ports.py`, adapter de `ProhibitedTermsChecker` en `infrastructure/lenguaje/` (carga la lista, aplica `CAMPOS_GENERADOS` y delega en `check_prohibited_terms()` de L1D-193), etapa de soporte en `RAGOrchestratorService` tras `validar_citas()` (L1D-179) y antes de `recortar_a_max_opciones()` (L1D-275), `NliNoDisponibleError` → `503` en el router `app/api/rag_query.py`, `NLI_ENTAILMENT_THRESHOLD` en `Settings` (`app/config/settings.py`). Verificación: 2.2–2.9 en verde y suites de L1D-106/L1D-275/L1D-179 sin regresiones. Commit `feat(L1D-180)`.
- [ ] 2.12 (test después) Test de coherencia: la tupla `CAMPOS_GENERADOS` de `app/domain/support.py` (`option`, `rationale`, `unsupportedClaims`, `limitations[].text`, `synthesis`) es igual al conjunto de campos de origen generado de `packages/clinical-language/origen-de-campos.json` (L1D-193). Verificación: test en verde, y en rojo si se altera cualquiera de los dos.
- [ ] 2.13 (test después) Test de no-fuga en logs: la etapa solo registra conteos, latencia, `nliModel`, `traceId` y, por fragmento retirado, `ruleId`, `campo` y `languagePolicyVersion`; nunca texto de afirmaciones, chunks, opciones, pregunta ni `pseudoPatientId`. Verificación: test en verde.
- [ ] 2.13b (TDD estricto) Test de aceptación en rojo: "registra ruleId y languagePolicyVersion sin el texto retirado cuando una justificación contiene un término prohibido [S1 resp. 29]" · integración (`TestClient` + captura de logs; escenario de la validación clínica, sin AC de US-064). Commit `test(L1D-180)`. Después, `ProhibitedTermsChecker` devuelve coincidencias `(ruleId, campo)` y el adapter expone la `version` cargada de `terminos-prohibidos.json`; la etapa emite el evento `fragmento_retirado_lenguaje`. Verificación: test en verde. Commit `feat(L1D-180)`.
- [ ] 2.14 (test después; ⛔ L1D-102 mergeado) Adapter real `MdebertaNliClassifier` en `infrastructure/nli/` con `NLI_MODEL` / `NLI_MODEL_REVISION`, lote único por consulta, errores traducidos al mismo tipo que el fake; enlace en `app/bootstrap.py` y activación de producción de la rama con evidencia (plan de merge de L1D-275). Verificación: test de humo del adapter fuera de la CI rápida y `meta.nliModel` poblado.
- [ ] 2.15 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-180)`.

## 3. evaluación

- [ ] 3.1 (evaluate) Introduce el umbral `NLI_ENTAILMENT_THRESHOLD` y el modelo NLI: `run-ai-eval` obligatoria. En el S1 (sin suite, US-072 en S2), evaluación manual de `ai-eval-runner` sobre el análisis del paciente semilla con el NLI real: fidelidad, precisión de citas, M-10.1 y salidas prescriptivas = 0, **junto con `false_positive_language_filter_rate`** `[S1 resp. 34]` (antes "tasa de opciones descartadas por lenguaje no permitido"), el recuento bruto de descartes por lenguaje y la lista de sus falsos positivos (justificaciones fieles al corpus del tipo "patients should receive…" descartadas solo por el término; design §Evaluación, Gate 1 2ª vuelta), informativa y sin meta en el S1; la suite `evaluate` de US-072 la registra en cada ejecución y se revisa periódicamente. Verificación: reporte en `reports/eval/` con ambas cifras.

## 4. Verificación

- [ ] 4.1 `openspec validate l1d-180-soporte-nli-descartadas --strict` en verde.
- [ ] 4.2 Suite de `apps/rag-orchestrator` en verde (Pytest).
- [ ] 4.3 `contracts:check` en verde; `200 con_evidencia` con descartadas y `503 NLI_UNAVAILABLE` de `/rag/query` validados con el *helper* de L1D-164 en la suite de integración.
- [ ] 4.4 `run-ai-eval` (o evaluación manual del S1) adjunta al PR.
