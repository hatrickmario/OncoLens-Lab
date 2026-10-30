# Proposal — l1d-298-evaluate-modelos-locales

## Trazabilidad

L1D-298 · US-233a (primera mitad de US-233, partida `[S4 resp. 6b]`) · FEAT-T5a · Sprint 4 · Estimación **3** ·
FR-20 · TBD-02 · M-07.2, M-10.1 · RN-12, RN-14, RN-22, RN-23 · US-233a AC-1…AC-7 (antes US-233 AC-1, AC-2, AC-4, AC-5, AC-6, AC-7 y
el AC nuevo de RSS/latencia del NLI) · ARR-03 AC-1/AC-2/AC-5 · ADR-39, ADR-41 · ADR47-R7 · `[S4 resp. 6]` `[S4 resp. 10]` ·
Sprint: `backlog/sprints/S4-refinamiento.md`.

## Dependencias

- ↪ **l1d-235-suite-evaluate** y **l1d-236-calibracion-umbral-baseline** (US-072, US-073; archivados): se extiende su runner, sus guardas (D3) y el registro de llamadas; no se rehacen.
- ↪ **us-231b-adapter-nli-smoke-semilla** (NLI/reranker/*embeddings* reales por ONNX): se reutilizan sus adapters; su tarea 1.11 (RSS y latencia del NLI) y 1.12 (*smoke* de la semilla) se cierran aquí.
- 🔗 Consume: US-240 (L1D-290, cifras de memoria; aún sin change). 🔗 Produce para: US-133 (L1D-245, compara A0/A2/A2b con estos modelos), US-120 (AC-5, AC-6, S5) y US-017 · DEC-07 (S5).
- ⛔ Ninguna dura entre changes del sprint. Prerrequisito de ejecución (no de código): pesos de ADR-39 en `~/adr39-modelos/` y Ollama con G en el MacBook de referencia.

## Por qué

La suite `evaluate` solo corre con adaptadores falsos (`componer_servicio` rechaza `proveedor: local`, ARR-03 cerró así en el S2). Antes de G-Demo hay que medir fidelidad, precisión de citas, «sin evidencia» y lenguaje no prescriptivo con el NLI, el reranker, los *embeddings* y el generador reales, acotar y medir el juez local secundario, y saber cuánta memoria y tiempo consume el NLI (ADR47-R7).

## Qué cambia

- **`proveedor: local` (AC-1, AC-3, AC-4):** `app/evaluation/composicion_suite.py` cablea los adapters de producción (NLI mDeBERTa, reranker y BGE-M3 por ONNX, generador por Ollama `/v1`) con las guardas de `es_proveedor_local()`; sin pesos termina con código ≠ 0 nombrando qué falta; el reporte (solo agregados) incluye configuración y modelos; el registro de llamadas (`llamadas_nube_datos_reales`) cubre a todos los adapters, no solo al juez.
- **Lenguaje no prescriptivo con el LLM real (AC-2):** mide propuesta cruda y salida mostrada; anota cuántas propuestas crudas corrigió el filtro; incluye casos RN-23 fuera del nivel A del S2 (`data/eval/fx-rn23`).
- **Juez local acotado (AC-5) y acuerdo (AC-6):** una afirmación + solo sus fragmentos citados, rúbrica binaria con 3 ejemplos, JSON `{"veredicto","cita"}`, `temperature = 0` y semilla en configuración; veredicto inválido = no soportado y se cuenta. Reporte con acuerdo juez↔NLI y juez↔humano (porcentaje y kappa de Cohen), discrepancias y marca «no concluyente» bajo `JUEZ_ACUERDO_MINIMO`; el NLI sigue siendo el juez principal, nunca se promedian.
- **Recursos del NLI (AC-7):** RSS máximo de `rag-orchestrator`, latencia p50/p95 del NLI por hipótesis y por lote (incluye hipótesis de población de US-242) y marca de exceso del límite de memoria del contenedor.
- **Tareas arrastradas** (sin AC propio, en `tasks.md`): `l1d-117` 2.2, 5.3, 5.5; `l1d-244` 4.1, 4.2; `us-117b` 0.4b y G2.B2–B4/A1–A4; `us-231b` 1.11 y 1.12; opcional, validación de la IP resuelta del descargador.

## Capacidades afectadas y bounded contexts

- Capacidad: `ai-evaluation` (ADDED: ejecución con modelos locales, lenguaje con LLM real, juez local acotado y acuerdo, recursos del NLI; sin MODIFIED para no chocar con otros deltas). Sin capacidad nueva.
- Contexto: **ai-services** (`apps/rag-orchestrator/app/evaluation/`, `eval/configs/`, `scripts/ci/eval-required.mjs`). Sin cambios en `clinical-api`, `web` ni contratos.

## Fuera de alcance

- Calibración de `NLI_ENTAILMENT_THRESHOLD` y `RETRIEVAL_TOP_K` y baseline por tipo de cáncer (US-120, S5).
- Suite de población y conjunto dorado (US-233b, L1D-299). Metas definitivas (DEC-07, US-017).
- Cambiar modelos, prompts, umbrales o corpus: aquí solo se mide (el prompt `rag-query@0.2.0` no se toca).
- La CI sigue con adaptadores falsos: la ejecución local es manual en el MacBook de referencia.

## Regresiones activas

- [RN-12] hosts locales cerrados en código; [RN-14] solo sintético y solo agregados; [RN-23] salidas prescriptivas mostradas = 0.
