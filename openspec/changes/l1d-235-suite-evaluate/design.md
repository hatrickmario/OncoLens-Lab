# Design — l1d-235-suite-evaluate

## Context

Base: `app/evaluation/` (`retrieval_metrics.py` con recall@10, MRR e IC *bootstrap*, `reporte.py`,
`dataset_loader.py`), tests en `tests/evaluation/`, datasets `data/eval/adr39-mini/`,
`data/eval/ol06-particion-v1/` (ADR-45), `scripts/ci/dataset-class-check.mjs` en la CI. Framework
según ADR-41 (propuesto, P-3): propio con Pytest, NLI principal, juez G secundario. Partición en dos
PR propuesta (P-1): **072a** (5) y **072b** (3).

## Goals / Non-Goals

**Goals:** runner reproducible, métricas de recuperación, citas, "sin evidencia", privacidad,
fidelidad, prescriptivas e inyección; reporte de agregados; `baseline.json`.
**Non-Goals:** calibración (US-073), job de CI (US-074), datasets de FEAT-T5b.

## Decisions

- **D1 · Un runner, familias por `--suite`** (`retrieval`, `generation`, `pii`, `all`, como en
  `run-ai-eval`). `npm run evaluate` (raíz) llama al módulo Python; `--report json` escribe además
  el JSON que lee `ai-eval-runner`. Alternativa descartada: dos runners (Node y Python) → dos
  formatos de reporte.
- **D2 · Reutilizar, no duplicar:** recall/MRR desde `retrieval_metrics.py`; la validación de citas
  y el NLI desde el dominio de `rag-orchestrator` (las mismas reglas que RN-01/RN-04, no una copia);
  la lista de RN-23 desde `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json`.
- **D3 · Puertos:** `FuenteDataset` (valida `clase: sintetico`), `JuezFidelidad` (adapters NLI y
  LLM local), `ProveedorPii` (lee el JSON de `eval:pii`), `EscritorReporte`. Reloj y semilla
  inyectados.
- **D4 · Guarda de proveedores locales (RN-12):** `es_proveedor_local(url)` compara el host contra una
  **lista local cerrada en código** (`HOSTS_LOCALES`: loopback `127.0.0.0/8`, `::1`, `localhost` y
  `host.docker.internal`), **no configurable** (ni variable de entorno ni YAML pueden ampliarla), antes
  de crear cualquier cliente (falla cerrada; URL sin host o no parseable → no local). Se aplica al juez
  (`EVAL_JUDGE_BASE_URL`) y a **todos** los adapters con URL (LLM, embeddings, reranker, NLI, OCR). Si la
  clase del dataset cargado **no es `sintetico`** (calibración local con `real_anonimizado`), todos los
  adapters deben ser locales o la suite **aborta** con código ≠ 0 antes de enviar ningún request; con
  `sintetico` la regla del juez sigue rigiendo igual (D4 de ADR-41).
- **D4b · Métrica de prescriptivas (RN-23):** usa el verificador de `rag-orchestrator`
  (`VerificadorDeTerminosProhibidos`, la misma lista que `packages/clinical-language`) sobre los campos
  de `CAMPOS_GENERADOS` (`app.domain.support`) y nunca sobre los copiados del corpus, con **niveles A+B**
  y `permitirFrases: false` (más estricto que el filtro de producción, que usa solo A). Se mide en dos
  puntos: (1) la **propuesta cruda del generador** antes del filtro de soporte/lenguaje (cuántas
  salidas del LLM traían términos prohibidos) y (2) la **salida mostrada** tras el filtro, cuya meta es
  `= 0`. El reporte trae ambas cifras, sin textos.
- **D5 · `baseline.json`:** lo escribe 072a con la configuración de CI (FX-T5a-a) para que US-074
  compare; el baseline con modelos reales lo registra US-073.

## Privacidad y ownership

Solo sintéticos; los reales anonimizados se pasan por ruta local y nunca a la CI (RN-13, RN-14).
El runner corre en `rag-orchestrator` sin acceso a datos clínicos; la sensibilidad de PII se
calcula en `clinical-api` y solo su JSON de agregados cruza (sin valores). Juez y NLI locales
(RN-12). Logs sin textos.

## Contratos

Sin cambios de `openapi.yaml` ni de `contracts/examples/`: el runner usa el servicio en proceso.

## Evaluación

Métricas OL-06 afectadas: recall@10 (≥ 0,80; es→en ≥ 0,70, provisionales hasta US-229), MRR
(≥ 0,60), fidelidad (≥ 0,90), precisión de citas (≥ 0,90), "sin evidencia" (≥ 0,90), PII (≥ 0,95),
prescriptivas = 0. Este change no las cambia: las mide.

## Dependencias y colaboradores

- **Crea:** `app/evaluation/evaluate.py` (CLI), `app/evaluation/metricas/` (citas, sin evidencia,
  fidelidad, privacidad, inyección), `eval/configs/test-fake.yaml`, `data/evaluation/baseline.json`.
- **Modifica:** `reporte.py` (rótulo validada), `package.json` raíz (`evaluate`).
- Reglas extraídas: `es_proveedor_local()` y `HOSTS_LOCALES` (RN-12), `rotular_validada()` (AC-T5.3),
  `es_inyeccion_efectiva()` (SEG-13).

## Risks / Trade-offs

- 072b depende de ADR-41 y ADR-40 → 072a no depende de ninguno y abre la DoD antes. `es_proveedor_local()`
  y el test sin red (ADR-41 D6) van en **072a**: la guarda RN-12 existe desde la primera corrida.
- Metas de recuperación por debajo (0,71) → hecho conocido, no bloquea (nota ADR-45).

## Open Questions

- P-1 (partición 072a/072b) y P-3 (juez) pendientes del usuario.
