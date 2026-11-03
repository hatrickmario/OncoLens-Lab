# Tasks — l1d-268-seguimiento-analisis

> US-218 · L1D-268 · Sprint 5, oleada O1 (después de ARR-11; las tareas de normalización esperan a `l1d-306-pregunta-nfc`).
> Matriz TDD de `CLAUDE.md`: endpoints, services con lógica, desidentificación y reglas RN → **TDD estricto, doble
> bucle**; prompt nuevo → **evaluate**; configuración → **test después**; contrato → secuencia
> `contract → test → feat → refactor`. PR **individual** (cambia `openapi.yaml` y una RN de privacidad, D-12 `[S5 resp. 7]`).
> Solo datos sintéticos. Mocks solo en los bordes (MSW, `respx`, LLM, NLI, embeddings, *reranker*, Milvus); reloj,
> `pseudoPatientId`, `traceId` e IDs inyectados.

## 1. contratos

- [x] 1.1 Editar `apps/clinical-api/openapi.yaml` (`FollowUpCreate.question.description`; `503` de `POST …/follow-ups` →
      `GeneracionNoDisponible`; `AnalysisBasis.maxFollowUps` `[S5 resp. 10]`; `info.version` 1.15.1 → **1.17.0**, decisión del orquestador: L1D-74 toma 1.16.0) y
      `apps/rag-orchestrator/openapi.yaml` (`RagFollowUpRequest.question.description`; `503` de `/rag/follow-up` con el
      `oneOf` de cuatro errores; `info.version` 1.10.1 → **1.11.0**) según design.md §Contratos (skill `sync-contracts`).
      Si al rebasar la versión ya está tomada, renumerar y regenerar · **exento (contrato)** `[US-219 AC-1]`
- [x] 1.2 Ejemplos nuevos `contracts/examples/follow-up-sin-evidencia.json` y `rag-follow-up-sin-evidencia.json`
      (`topRelevanceScore: null`, `queryRewrite = no_aplica`), y registro en `contracts/examples/index.json` de esos dos y
      de `rag-nli-no-disponible.json` / `error-desidentificacion-no-disponible.json` contra los `503` del seguimiento;
      `"maxFollowUps": 10` en `con-evidencia-s4-tres-opciones.json` (y en los `EvidenceAnalysis` nuevos del S5); sin PII ·
      **exento (contrato)**
- [x] 1.3 `npm run contracts:check`; `contracts:breaking` → esperado **0 ERR** y un WARN
      `response-body-wrapped-in-one-of-original-preserved` por proveedor (medido 2026-11-03, design.md §Contratos), que
      se declara en el PR; si aparece un ERR, parar y avisar al humano (`H-2` añadiría las entradas exactas al JSON);
      `contracts:generate` (sin editar generados a mano); commit `contract(L1D-268)`. Tras el commit, avisar al humano
      para que suba `H-2` a la rama · **exento (contrato)**

## 2. clinical-platform

- [x] 2.1 `ANALYSIS_FOLLOWUP_MAX` en `apps/clinical-api/src/config/secciones.ts` (entero positivo, por defecto 10, RN-22)
      con su test de configuración; `.env.example` va en `H-1` · **test después (configuración)**
- [x] 2.2 Test de aceptación en rojo: «la Base trae maxFollowUps igual a ANALYSIS_FOLLOWUP_MAX y el registro persiste el
      mismo valor [US-219 AC-1]» · integración (Supertest + PostgreSQL real + MSW hacia `rag-orchestrator` desde
      `contracts/examples/`; respuesta validada contra el spec del proveedor) en
      `apps/clinical-api/tests/integration/evidence-analysis/base-max-follow-ups.test.ts`; commit `test(L1D-268)` ·
      **TDD estricto** `[S5 resp. 10]`
- [x] 2.3 Copiar `ANALYSIS_FOLLOWUP_MAX` de Settings a `analysisBasis.maxFollowUps` en el armado de la Base (sin literal;
      reutiliza la clave de 2.1). Test 2.2 en verde; commit `feat(L1D-268)` · **TDD estricto** `[US-219 AC-1]`
- [x] 2.4 Esqueletos (`throw new Error('no implementado')`) de `follow-up.controller.ts`, `follow-up.service.ts`,
      `follow-up.repository.ts`, `follow-up.request.ts`, `follow-up.reglas.ts`, puerto `RagFollowUpPort` en `ports.ts` y
      ruta montada; tests de aceptación en rojo (Supertest + PostgreSQL real + MSW hacia `/rag/follow-up` desde
      `contracts/examples/`, respuestas validadas contra el spec del proveedor, US-214):
      «crea el turno 1 citado y persistido cuando el oncólogo pregunta por la opción 2 [US-218 AC-1]», «persiste el turno
      sin_evidencia [US-218 AC-3]», «responde 409 LIMITE_SEGUIMIENTO sin llamar a la IA cuando el análisis tiene 10 turnos
      [US-218 AC-4]», «no envía ni registra PII de la pregunta ni de la evolución [US-218 AC-6]», «usa seudónimo y
      traceId nuevos por turno, persiste el trace_id del turno y nunca el seudónimo [US-218 AC-8]» `[S5 resp. 12]`, en
      `apps/clinical-api/tests/integration/evidence-analysis/seguimiento*.test.ts`; commit `test(L1D-268)` · **TDD estricto**
- [x] 2.5 Implementar con unitarios uno a uno: `superaLimiteDeSeguimiento()` (RN-22), `marcarFuentesNuevas()`,
      `memoriaDelAnalisis()` (re-enmascara síntesis, opciones y `outcomesSince`, `citable = false`, `monthsAgo` con reloj
      inyectado) y `armarRagFollowUpRequest()` (snapshot + `pseudoPatientId` y `traceId` nuevos); service con el orden de
      D4; repository con inserción bajo `SELECT … FOR UPDATE` del análisis y recálculo de `turn_number`; adapter con el
      cliente generado y la tabla única `rag-failure.ts` (más `mapearFalloRagDeSeguimiento`: los 409 y 422 de
      Backend 2 salen como 502, el spec del seguimiento no los declara). Tests 2.4 en verde; commit `feat(L1D-268)` · **TDD estricto** `[US-218 AC-1, AC-3, AC-4, AC-6, AC-8]`
- [ ] 2.5b Verificación `llm_provider` vs `data_classification` (RN-12) en el turno: TRASLADADA a US-050. No existe en
      `clinical-api` una regla reutilizable (la design D4 la daba por existente); es la regla de proveedores de US-050
      (S6, antes de G-Piloto). Hasta entonces solo hay datos sintéticos y `exigirEntornoSintetico` del desidentificador
      corta los demás · **TDD estricto**
- [x] 2.6 Tests de aceptación en rojo y luego verde de los bordes: fallo al persistir → `500` sin contenido; `401`, `403`
      del `admin` en POST y GET, `404`, `422 ANALISIS_SIN_EVIDENCIA`; `503`/`504`/`502` de Backend 2 sin consumir turno;
      desidentificación no disponible → `503` sin llamada; dos POST simultáneos con 9 turnos → un `201` y un `409`; `GET`
      en orden. Commits `test(L1D-268)` → `feat(L1D-268)` · **TDD estricto** `[US-218 AC-1, AC-4, AC-6]`
- [x] 2.7 Normalización de la pregunta: `follow-up.schema.ts` compone `zFollowUpCreate` con `esquemaPreguntaNormalizada`
      de `packages/clinical-language` (US-250; **espera a `l1d-306-pregunta-nfc`**); test en rojo «normaliza a NFC y mide
      la longitud tras normalizar [US-218 AC-1] [US-250 AC-1]» y solo espacios → `422 CUERPO_INVALIDO` sin llamada; luego
      verde. Commits `test(L1D-268)` → `feat(L1D-268)` · **TDD estricto**
- [x] 2.8 Logs: extender `gateway-logs.test.ts` (o uno nuevo del seguimiento) para que ninguna línea contenga la pregunta,
      la memoria ni PII sembrada · **TDD estricto** `[US-218 AC-6]`
- [x] 2.9 Suite de `clinical-api` en verde y `contracts:verify-provider` de `…/follow-ups` (todos los códigos) ·
      **verificación**
- [x] 2.10 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
      antes y después, commit refactor(L1D-268)

## 3. ai-services

- [x] 3.1 Esqueletos (`raise NotImplementedError`) de `app/api/rag_follow_up.py`, `app/application/seguimiento.py`
      (`ResponderSeguimiento`), `app/domain/contexto_del_seguimiento.py::clasificar_contexto_del_seguimiento()` y
      `app/prompts/seguimiento.py`; tests de aceptación en rojo (`TestClient` + adapters falsos, `RAG_ADAPTERS=fake`,
      respuesta validada contra el spec) en `tests/integration/test_rag_follow_up.py` con `@pytest.mark.ac("US-218", n)`:
      AC-1 (con evidencia citada; `queryRewrite = no_aplica`), AC-2 (afirmación sostenida solo en la memoria → omitida y
      premisas del NLI sin memoria), AC-3 (sin evidencia, cero llamadas al LLM y al `QueryRewriter`), AC-5 (fuera de
      contexto determinista con cero llamadas a adapters, por marcador del prompt, y la pregunta comparativa legítima que
      nombra mama y próstata y **no** queda fuera de contexto), AC-7 (término prohibido omitido);
      commit `test(L1D-268)` · **TDD estricto**
- [x] 3.2 Test en rojo `tests/integration/test_rag_follow_up_sin_estado.py` (`@pytest.mark.ac("US-218", 8)`): dos turnos
      sin ficheros nuevos en el `tmp_path` vigilado, cero escrituras en el fake de Milvus y en `corpus`, logs sin pregunta,
      memoria, frase marcada ni seudónimo; segundo turno independiente del primero; commit `test(L1D-268)` · **TDD estricto**
- [x] 3.3 Implementar con unitarios uno a uno: `clasificar_contexto_del_seguimiento()` (señales decididas de design.md
      D7 `[S5 resp. 13]`: marcador de identidad de ADR-40; otro tipo de cáncer por sinónimos del catálogo **sin** nombrar
      el del contexto; la comparativa que nombra ambos pasa); extraer `premisas_del_soporte()` (RN-24, excluye la memoria);
      `ResponderSeguimiento` reutilizando los pasos de `RAGOrchestratorService` vía Extract Method (sin copiar umbral,
      validación de citas, NLI ni verificador RN-23); plantilla de seguimiento con la memoria en bloque rotulado no citable
      y la regla `fuera_de_contexto`; parseo del marcador estructurado (salida inválida → error existente); router con JWT
      de servicio, `X-Trace-Id`, *deadline* y errores del `503` ampliado. Tests 3.1 y 3.2 en verde; commit `feat(L1D-268)` ·
      **TDD estricto** `[US-218 AC-1, AC-2, AC-3, AC-5, AC-7, AC-8]`
- [x] 3.4 Normalización: el router aplica `normalizar_pregunta()` de `app/domain/pregunta.py` (US-250; **espera a
      `l1d-306-pregunta-nfc`**) antes de delegar; test en rojo «NFD y NFC dan el mismo SHA-256 de prompt [US-218 AC-1]
      [US-250 AC-4]» y solo espacios → `422` sin adapters; luego verde. Commits `test(L1D-268)` → `feat(L1D-268)` · **TDD
      estricto**
- [x] 3.5 Fakes: extender `tests/support/llm_falso.py` (guiones de seguimiento y registro del prompt), `nli_falso.py`
      (registro de premisas) y `milvus.py` (registro de escrituras) sin romper `tests/support/contract.py` (mismos errores,
      `null` ≠ `0.0`) · **TDD estricto (test de contrato del fake)**
      Hecho: `llm_falso.py` (guiones `SEG-*`, registro de prompts) y `nli_falso.py` (ya registraba premisas); `milvus.py` es el
      arnés de Milvus real y no se tocó: el seguimiento no recibe ningún puerto de escritura (sin `CorpusChunkStore`).
- [x] 3.6 Test de NLI caído → `503 NLI_UNAVAILABLE` sin respuesta parcial (rojo → verde) · **TDD estricto** `[US-218 AC-1]`
- [x] 3.7 Suite de `rag-orchestrator` en verde y verificación del proveedor de `/rag/follow-up` (todos los códigos) ·
      **verificación**
- [x] 3.8 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
      antes y después, commit refactor(L1D-268)

## 4. evaluación

- [x] 4.1 Añadir al dataset sintético de `evaluate` 4 casos de seguimiento (con evidencia, sin evidencia, fuera de contexto,
      memoria como única base) y la comprobación de RN-24 sobre lo mostrado; sin PII · **evaluate**
      Hecho como módulo propio `app/evaluation/seguimiento.py` + `data/eval/fx-seguimiento/` (corpus de FX-T5a-a), sobre el
      `ResponderSeguimiento` de producción; integrarlo a `evaluate --suite all` queda para US-140.
- [ ] 4.2 DIFERIDA -> entrega 2 (Gate 2: el orquestador lanza `ai-eval-runner`). `run-ai-eval` con adapters falsos sobre la rama (job `eval-required`): reporte de `ai-eval-runner` en
      `reports/eval/` adjunto al PR con fidelidad, precisión de citas, «sin evidencia», salidas prescriptivas = 0 y RN-24 ·
      **evaluate**
- [ ] 4.3 DIFERIDA -> D5-13 (corrida nocturna de L1D-268). Medición con modelos locales en la corrida nocturna del día 2 (`S5-refinamiento.md` §5), registrada en el reporte
      de la corrida; si no cabe, DIFERIDA -> US-140 · **evaluate**
- [ ] 4.4 DIFERIDA -> entrega 2 (Gate 2). Revisión de la plantilla de seguimiento por `clinical-language-auditor` (RN-23, RN-24, RN-19) en el Gate 2 ·
      **verificación**

## humano

- [ ] H-1 `apps/clinical-api/.env.example`: añadir la clave del límite de seguimiento, DIFERIDA -> H-1. Bloque literal:

```
# Máximo de preguntas de seguimiento por análisis (RN-22, US-218)
ANALYSIS_FOLLOWUP_MAX=10
```

- [ ] H-2 DIFERIDA -> H-2. `docs/architecture/adr/ADR-26-contrato-congelado-y-excepciones-declaradas.md`: añadir a la tabla «Excepciones
      declaradas» la fila de la decisión aprobada `[S5 resp. 10]`. El humano la sube a la rama **justo después** del commit
      `contract(L1D-268)` (tarea 1.3). **Sin** entrada en `scripts/ci/contracts-breaking-excepciones.json`: `oasdiff` da
      solo WARN (design.md §Contratos); si 1.3 midiera un ERR, se añaden aquí sus entradas exactas.
      Bloque literal:

```
| E-18 y E-19 | rag-orchestrator · clinical-api | `response-body-wrapped-in-one-of-original-preserved` (WARN, no rompe; sin entrada en el JSON) en `POST /rag/follow-up` y `POST /platform/evidence-analyses/{analysisId}/follow-ups`: el `503` pasa de `ErrorLlmLocalNoDisponible` a un `oneOf` que lo conserva (+ `ErrorRecuperacionNoDisponible`, `ErrorNliNoDisponible`, `ErrorSalidaLlmInvalida` en Backend 2; `GeneracionNoDisponible` en Backend 1) | l1d-268-seguimiento-analisis | El seguimiento reutiliza el pipeline del análisis y falla cerrado por las mismas causas; clinical-api y web clasifican por código HTTP y de error. Decidido (usuario, 2026-11-03, `[S5 resp. 10]`) |
```

- [ ] H-3 `backlog/sprints/S5-deuda.md`: registrar D5-13 (corrida nocturna de L1D-268), DIFERIDA -> H-3. Bloque literal:

```
| D5-13 | L1D-268 | Medición del seguimiento (`rag-follow-up@0.1.0`) con modelos locales en la corrida nocturna del día 2: fidelidad, precisión de citas, «sin evidencia», salidas prescriptivas = 0 y RN-24 (`python -m app.evaluation.seguimiento` con proveedor local) | tasks 4.3 |
```

- [ ] H-4 Deuda y pendientes de la vuelta 1 del Gate 2 de L1D-268, DIFERIDA -> H-4 (el humano los registra donde corresponda):
  - **D5-15:** test de paridad de marcadores de identidad `rag-orchestrator` ↔ `clinical-api` (`pii-masks.json`) y reenviar `ANALYSIS_FOLLOWUP_MAX` en Compose (infra).
  - **D5-16:** P3 del design: #8 flag `con_reescritura`, #9 `_contar_mostradas`, #10 `calcularDeadline` a `rag-plazo.ts`, #11 `analysisFollowupMax` en `ConfiguracionDelAnalisis`, #12 `Consultador`/`ConsultaSql` y `release(true)` tras un `ROLLBACK` fallido, #13, #14 `SeguimientoNoComponible`, #16 vocabulario.
  - **Menor (contract #3/#4):** la descripción de `AnalysisBasis.maxFollowUps` no dice «y en `tipo_no_habilitado`»; hoy ese análisis no trae el campo. No se tocó `openapi.yaml` (subir el patch por una descripción es decisión del equipo). `sqlEventoClinicoPropio()` de `compartido/estados-de-revision` no existe en `main`: la consulta común vive en `evidence-analysis.repository.ts:sqlEventosClinicosVigentes`.
  - **US-050 / US-040:** un `REVOKE UPDATE` a `clinical_api` sobre `ai_analysis_record` rompe el `SELECT … FOR UPDATE` del seguimiento (alternativa: `pg_advisory_xact_lock`).
  - **US-050 / opt-out por CLI (DEC-22):** deben listar «seguimiento» entre las generaciones con IA que dan `403`.
  - **Decisiones de producto pendientes del humano (no tomadas aquí):** (1) ¿un turno `fuera_de_contexto` cuenta en el límite de 10? (hoy sí); (2) ¿`maxFollowUps` de la Base (guardado al crear) o la configuración vigente en el `409`? (hoy el `409` usa la vigente); (3) `consulta_equivalente` ignora el filtro de fuentes del análisis original; (4) la evolución posterior usa `event_date >` estricto: los eventos del mismo día del análisis quedan fuera.

## 5. cierre

- [x] 5.1 Buscar en el árbol `ANALYSIS_FOLLOWUP_MAX`, el mensaje de `LIMITE_SEGUIMIENTO`, `normalize('NFC')` /
      `unicodedata.normalize("NFC"` y el umbral RN-02, y confirmar un solo dueño por regla (design.md §Dependencias) ·
      **verificación**
- [x] 5.2 `openspec validate l1d-268-seguimiento-analisis --strict`, tests de los dos contextos en verde,
      `contracts:verify-provider` en verde y `run-ai-eval` adjunto · **verificación**
