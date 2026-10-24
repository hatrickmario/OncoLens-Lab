# OL-06 · l1d-93-catalogo-datos-criticos-validado (rama 8e91785a, base abfdc0c6)

Veredicto: PASS (adapters falsos, FX-T5a-a, sintético; solo agregados, RN-14).

Reproducción del job `eval-required`: `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 node scripts/ci/eval-required.mjs --base abfdc0c6`
(venv Python 3.13.15 con requirements.txt + requirements-eval.txt; `npm ci`). Salida: 0.

- Disparadores: 29 rutas de `packages/clinical-catalogs` (manifest 1.1.0, atributos, datos-criticos, aplicabilidad, esquemas, fixtures, allowlist).
- Contra `data/evaluation/baseline.json` (tolerancia 0): 26 métricas, todas "igual" o "informativa"; el reporte es idéntico al baseline (hashConfig 57b8a05d...).
- Mínimos de `regression.yaml`: "Sin baseline de regresión: umbral no aplicado" (no hay mínimos versionados todavía).
- Versiones: modelos fake (llm fake-guion@1, emb fake-bow@1, reranker fake-lexical@1, nli fake-nli@1) · prompt rag-query@0.3.0 · catalogVersion de la config 2026.10.0 (declarado; el manifest real es 1.1.0) · corpus rel-fx-t5a-a-1 · umbral relevancia 0.3.

Todas las métricas validadas son "no validada" (preguntas sin validar clínicamente); los valores de citas 0.8, fidelidad 0.75 y opciones con cita 0.6 son del medidor con guion, no del generador real.

No medido por la suite: faltantes (sensibilidad/especificidad), aplicabilidad, mapeo terminológico, OCR, PII, eventos; recall/MRR/fidelidad con modelos reales.
