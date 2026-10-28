## ai-eval-runner · main (e3c00924) · suite all + aplicabilidad (cierre S3)

Veredicto: FAIL frente a las metas iniciales absolutas. Sin regresiones frente a `reports/eval/baseline.json`.

Corrida solo con adaptadores falsos (`fake-bow`, `fake-guion`, `fake-nli`, `fake-lexical`); el baseline está marcado "no validada". Las metas absolutas de recall, MRR, fidelidad y citas no son concluyentes sobre calidad real. No se relajó ningún umbral ni se tocó el baseline. Tolerancia: 0,02 (`EVAL_MAX_REGRESSION` sin definir en el entorno; la CI usa 0).

### Suite all (`test-fake.yaml`)

| Métrica | Baseline | Rama | Meta | Δ | Estado |
|---|---|---|---|---|---|
| recall@10 total | 1,00 | 1,00 | ≥ 0,80 | 0 | ok |
| recall@10 es→en | 1,00 | 1,00 | ≥ 0,70 | 0 | ok |
| MRR total | 1,00 | 1,00 | ≥ 0,60 | 0 | ok |
| MRR es→en | 1,00 | 1,00 | ≥ 0,60 | 0 | ok |
| fidelidad NLI | 0,75 | 0,75 | ≥ 0,90 | 0 | BAJO META |
| precisión de citas | 0,80 | 0,80 | ≥ 0,90 | 0 | BAJO META |
| opciones con cita y soporte | 0,60 | 0,60 | sin meta | 0 | informativa |
| "sin evidencia" exactitud | 1,00 | 1,00 | ≥ 0,90 | 0 | ok |
| violaciones RN-02 | 0 | 0 | 0 | 0 | ok |
| términos prohibidos (salida mostrada) | 0 | 0 | 0 | 0 | ok |
| inyección efectiva | 0 | 0 | 0 | 0 | ok |

Prescriptivas: salida mostrada = 0. `propuesta_cruda` = 2 (informativa, igual que baseline; el filtro la elimina antes de mostrar). Comparador: 26 métricas, 0 regresiones.

### Suite aplicabilidad (`test-aplicabilidad.yaml`)

| Métrica | Valor | Meta | Estado |
|---|---|---|---|
| concordancia de estados | 41/41 = 1,00 | n/d | ok |
| criterios "Coincide" sin cita | 0 | 0 | ok |
| exactitud extraído-verificado | 0,95 | 0,95 | en meta |
| cobertura de población | 0,70 (7/10) | 0,90 | FUERA DE META |

El baseline cubre solo `test-fake`; aplicabilidad no tiene referencia (el "sin valor" en 24 métricas del comparador es un artefacto, no regresión).

### No medibles en esta corrida (sin modelos reales / sin suite)
OCR crítico, PII, eventos, mapeo terminológico, faltantes (sensibilidad/especificidad) y las demás M-08.x no cubiertas arriba: la suite no los mide con los datos y adaptadores actuales. No se estiman.

Regresiones: ninguna.
Versiones: modelo `fake-bow@1`/`fake-guion@1`/`fake-nli@1`/`fake-lexical@1` · prompt `rag-query@0.4.0` · catálogo `2026.10.0` (aplicabilidad `test-apl-1.0.0`) · corpus `rel-fx-t5a-a-1` · umbral relevancia 0,3, NLI 0,7, rerankTopN 10, retrievalTopK 40.

Entorno: Python 3.14 sin rueda de `spacy`; se usó venv `uv` con Python 3.12 fuera del repo (`EVAL_PYTHON`).

JSON crudo: `s3-cierre.json` (all) y `s3-cierre-aplicabilidad.json`.
