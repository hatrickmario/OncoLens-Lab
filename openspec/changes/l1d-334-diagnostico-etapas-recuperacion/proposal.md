# Proposal — l1d-334-diagnostico-etapas-recuperacion

## Trazabilidad

L1D-334 · US-276 · FEAT-T5e (mejora de la recuperación, OL-06) · Sprint 7 · Estimación **2** · historia técnica
(prioridad 1 del análisis de mejoras tras la Demo 6) · FR-09, FR-20 · AC-T5.3 · AC-1…AC-4 de US-276 · RN-01, RN-02,
RN-13, RN-14, RN-22, RN-23 · `[S7 resp. 1]` (revisión provisional) · `[S7 resp. 2]` (corrida base y corrida final) ·
`[S7 resp. 10]` (corpus fijo de la familia) · `[S7 resp. 11]` (umbrales actuales) · regla del S7 «ninguna cifra sin reporte versionado
en `reports/eval/`» (`S7-refinamiento.md` §4) · ADR-39 (modelos locales), ADR-41 (evaluación RAG) · Regresión [AC-T5.4]
→ US-074 (PR que cambia modelo, prompt, umbral, catálogo o corpus).

## Por qué

En la Demo 6 la misma pregunta dio evidencia con «complicaciones de la prostatectomía radical» y «sin evidencia» con
«complicaciones de la cirugía de prostata radical». Hoy nadie sabe en qué etapa se pierde el chunk esperado: la
recuperación densa, el corte a `RERANKER_MAX_PAIRS`, el umbral de relevancia o el NLI. Sin ese dato, las mejoras del S7
(US-277 sinónimos, US-278 *reranker* sobre el chunk entero, US-279 contexto del chunk) se elegirían a ciegas, o se
bajaría un umbral que protege a otra etapa. Esta historia va primera: produce los pares de paráfrasis y la línea base
por etapa que usan las otras tres.

## Qué cambia

- **Dataset sintético `data/eval/parafrasis-v1/`** (`clase: sintetico`): ≥ 10 pares de preguntas con el mismo
  significado y distinta redacción (sinónimo coloquial frente a término técnico, sin tildes, orden cambiado, español
  frente a inglés), con el par de la Demo 6. Cada par declara la evidencia esperada como `{documento, cita}` literal del
  corpus `s5-corpus-ampliado`, igual que `preguntas.yaml`. Las redacciones son descriptivas (preguntan por lo que
  describe la evidencia) y pasan el test de términos prescriptivos prohibidos (RN-23), como los datasets de `l1d-246`
  y `l1d-299`.
- **Familia `diagnostico` de la suite `evaluate`** (fuera de `all`): ejecuta cada pregunta por el servicio real de
  consulta y registra, por pregunta, el puesto denso del primer chunk esperado, si entró en los pares del *reranker*,
  su `relevance_score`, si superó el umbral, las opciones generadas y las afirmaciones aprobadas o descartadas por el
  NLI.
- **Etapa responsable por par**: una regla pura y escrita en el informe asigna la pérdida a una sola etapa y da el
  recuento por etapa.
- **Histograma de `p_entailment`** de las afirmaciones descartadas y recuento de la banda bajo el umbral. El informe no
  propone cambiar el umbral.
- **Informe en `reports/eval/`** con ids, puestos y puntajes, sin texto de chunks ni de preguntas.
- **Sin cambio de código de producción**: ni `app/api`, `app/application`, `app/domain` ni `app/infrastructure`; sin
  cambio de contrato HTTP, esquema del catálogo, Milvus, prompts, umbrales ni modelos. Los eventos
  `rag_query_recuperacion`, `rag_query_corte`, `rag_query_citas` y `rag_query_soporte` no cambian.
- La CI corre la familia con adaptadores falsos (regresión de forma). La medición con modelos locales es manual, en la
  **corrida base** del S7, y la ejecuta `ai-eval-runner`.

## Capacidades

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

- `ai-evaluation` (ADDED: dataset de pares de paráfrasis; informe por pregunta y etapa; etapa responsable por par;
  histograma de `p_entailment`; informe solo con ids, puestos y puntajes). Los requisitos existentes (runner, solo
  sintéticos y agregados, proveedores locales, rótulo `no_validada`) se aplican a la familia nueva como regresión.

## Bounded contexts

- **ai-services**: `apps/rag-orchestrator/app/evaluation/` (familia `diagnostico`), `apps/rag-orchestrator/eval/configs/`,
  `apps/rag-orchestrator/tests/evaluation/`, `data/eval/parafrasis-v1/` y `scripts/eval/evaluate.mjs` (configuración por
  defecto de la familia).
- **clinical-platform**: no se toca.
- **frontend**: no se toca.

## Dependencias

- ↪ `l1d-327-log-corte-reranker` (US-270, L1D-327; archivado, en `main`): el corte a `RERANKER_MAX_PAIRS` y su evento
  `rag_query_corte`, cuya regla (`recortar_a_pares_del_reranker`) el diagnóstico reutiliza.
- ↪ US-055 (recuperación densa + *reranker* + umbral; en `main`).
- 🔗 `l1d-119-corpus-ampliado-calibracion` (US-120, L1D-119): comparte la ventana de la corrida base, **sin depender de
  su ingesta**. La familia `diagnostico` corre sobre el corpus del dataset `s5-corpus-ampliado` en memoria, el mismo en
  la base y en la final y registrado en cada informe (`[S7 resp. 10]`), con los umbrales actuales en las dos corridas;
  los calibrados entran en la final como un brazo más, que aporta `l1d-119` (`[S7 resp. 11]`).
- ↪ L1D-298 (US-233a, `proveedor: local` del runner; en `main`).
- 🔗 Produce para: L1D-335 (US-277), L1D-336 (US-278), L1D-337 (US-279) y US-230 (los pares de paráfrasis y la línea
  base por etapa). Estos changes van **después**.
- **Orden de los archivos de la suite** (propuesta de planificación, se aprueba con el plan): **este change** →
  `l1d-329` → `l1d-331` (parte de código) → `l1d-336` → `l1d-335` → `l1d-337`. Cada uno rebasa sobre el anterior.
- Sin `⛔`.

## Fuera de alcance

Cambiar umbrales, modelos, prompts o catálogo (US-277, US-278, US-279). Medir recall@10 global (US-230). Calibrar
`NLI_ENTAILMENT_THRESHOLD` (exige etiquetas humanas; sin historia en el S7, D6-46 y D6-58). Añadir campos a los eventos
de log de producción. Suite propia del loop contextual (D6-33, L1D-329).
