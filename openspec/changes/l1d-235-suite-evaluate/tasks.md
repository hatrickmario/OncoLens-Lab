# Tasks — l1d-235-suite-evaluate

> Dos bloques en dos PR: **072a** (secciones 1–2) y **072b** (secciones 3–4). La orquestación del
> runner es **TDD estricto con adapters falsos** (CLAUDE.md: "la orquestación, con adapters falsos y
> TDD"); umbrales y modelos, **evaluate**. Sin cambios de API. Mocks solo en los bordes (LLM, NLI,
> embeddings, Milvus, HTTP saliente con `respx`).

## 1. ai-services · 072a (runner y deterministas)

- [x] 1.1 Fixture FX-T5a-a en `eval/configs/test-fake.yaml` y datos de prueba (6 preguntas, 4 PII,
      2 prescriptivas, `ch-inj-1`) · **test después**
- [x] 1.2 Test de aceptación en rojo: "escribe el reporte con métricas y configuración cuando se
      ejecuta con FX-T5a-a [US-072 AC-1]" · integración (Pytest), commit test(L1D-235) · **estricto**
- [x] 1.3 Implementar `evaluate.py`, métricas de recuperación (reutiliza `retrieval_metrics.py`),
      citas, "sin evidencia", p95 por etapa y reporte con configuración; guarda `--prueba-final` de
      ADR-45; unitarios uno a uno; commit feat(L1D-235) · **estricto** `[US-072 AC-1]`
- [x] 1.4 Test en rojo "métricas idénticas cuando se ejecuta dos veces con la misma configuración
      [US-072 AC-2]" y su implementación (semilla y reloj inyectados) · **estricto**
- [x] 1.5 Test en rojo "solo lleva 'validada' la métrica calculada sobre las revisadas [US-072 AC-4]"
      y extraer `rotular_validada()` (AC-T5.3) · **estricto**
- [x] 1.6 Test en rojo "termina ≠ 0 con un dataset sin clase sintética / el resultado no contiene
      textos [US-072 AC-5]" e implementación en `FuenteDataset` · **estricto**
- [x] 1.6b Test en rojo "aborta sin enviar requests cuando un adapter apunta a un host fuera de la
      lista local y el dataset no es sintético / `es_proveedor_local()` rechaza hosts no listados y no
      lee configuración" (`respx` con 0 requests) y extraer `es_proveedor_local()` con `HOSTS_LOCALES`
      cerrada en código (loopback, `host.docker.internal`) · **estricto** `[RN-12]`
- [x] 1.6c Test de CI sin salida a red durante la suite (ADR-41 D6: bloquea sockets salientes salvo
      loopback y falla si se intenta una conexión) · **test después** `[RN-12]`
- [x] 1.7 Envoltorio `npm run evaluate -- --suite … --report json` y `data/evaluation/baseline.json`
      con la configuración de CI; test de humo del envoltorio con tiempo máximo explícito (proceso
      real) · **test después**
- [x] 1.8 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de
      comportamiento, tests en verde antes y después, commit refactor(L1D-235)

## 2. evaluación · 072a

- [x] 2.1 `run-ai-eval` sobre la rama con `--suite retrieval` deja de devolver `NO-EJECUTABLE` ·
      **evaluate**

## 3. ai-services · 072b (fidelidad, PII y prescriptivas) — ✅ `l1d-232-adr41-framework-evaluacion` (ADR-41, mergeado como propuesto)

- [x] 3.1 Test en rojo "un juez de nube aborta sin enviar requests / con el juez local reporta
      fidelidad por afirmación [US-072 AC-3]" (`respx`, juez y NLI fingidos) · **estricto**
- [x] 3.2 Implementar `JuezFidelidad` (NLI principal, LLM local secundario, `EVAL_JUDGE_*` en
      configuración), con la guarda `es_proveedor_local()` de 1.6b antes de crear el cliente · **estricto**
- [x] 3.3 Test en rojo "incluye la sensibilidad de PII de B1 y 0 llamadas a la nube [US-072 AC-6]" e
      integración del JSON de `npm run eval:pii` (de `l1d-205-adr40-deteccion-pii`; si no está, con
      los 4 textos de FX-T5a-a y la cifra sobre `pii-mini` diferida a L1D-205) · **estricto**
- [x] 3.4 Test en rojo "cuenta 2 salidas con términos prohibidos en la propuesta cruda y 0 en la
      salida mostrada [US-072 AC-1] / inyección efectiva = 0 con `ch-inj-1` [US-072 AC-7]"; métrica
      sobre `CAMPOS_GENERADOS` con niveles A+B y `permitirFrases: false` (design D4b), y extraer
      `es_inyeccion_efectiva()` (SEG-13) · **estricto**
- [x] 3.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de
      comportamiento, tests en verde antes y después, commit refactor(L1D-235)

## 4. evaluación · 072b

- [x] 4.1 `run-ai-eval` `--suite all` con reporte de `ai-eval-runner` · **evaluate** (adapters falsos; el juez LLM
      real y la cifra de PII sobre `pii-mini` son **NO-EJECUTABLE** en la CI: procedimiento en design.md D17)

## 5. Verificación

- [ ] 5.1 `openspec validate l1d-235-suite-evaluate --strict` en verde
- [ ] 5.2 Tests de `rag-orchestrator` en verde; sin `contracts:verify-provider` (sin cambios de API)
- [ ] 5.3 `run-ai-eval` en cada PR (072a y 072b)
