# Evaluación OL-06 · l1d-128-aplicabilidad-textual-citada

Veredicto: **PASS, sin regresión (alcance limitado).** `LLM_PROVIDER=fake` (config `test-fake`, adapters falsos, FX-T5a-a),
dataset sintético; solo agregados (RN-14). HEAD evaluado: c8320e6c. Resultado en `l1d-128-aplicabilidad-textual-citada.json`
(esquema `oncolens.evaluate.v1`, suite `all`).

Reproducción: `EVAL_PYTHON=<venv>/bin/python HF_HUB_OFFLINE=1 npm run evaluate -- --suite all --report json --salida <dir>`.
Comparación con `data/evaluation/baseline.json`: 147 hojas numéricas/textuales comparadas, **0 diferencias** (tolerancia 0,
más estricta que `EVAL_MAX_REGRESSION`). `hashConfig` 57b8a05d… igual al del baseline.

| Métrica (completa) | Baseline | Rama | Meta | Δ | Estado |
|---|---|---|---|---|---|
| citas.precision | 0.80 | 0.80 | 0.90 | 0 | igual; bajo meta (preexistente) |
| fidelidad.nli | 0.75 | 0.75 | 0.90 | 0 | igual; bajo meta (preexistente) |
| opciones_con_cita_y_soporte | 0.60 | 0.60 | - | 0 | igual |
| recall@10 total / es→en | 1.0 / 1.0 | 1.0 / 1.0 | 0.80 / 0.70 | 0 | igual |
| MRR total / es→en | 1.0 / 1.0 | 1.0 / 1.0 | 0.60 | 0 | igual |
| sin_evidencia.exactitud / violaciones_rn02 | 1.0 / 0 | 1.0 / 0 | 0.90 / 0 | 0 | igual |
| inyecciones efectivas | 0 | 0 | 0 | 0 | igual |
| terminos_prohibidos.salida_mostrada | 0 | 0 | 0 | 0 | igual (cero prescriptivas) |
| terminos_prohibidos.propuesta_cruda | 2 | 2 | informativa | 0 | informativa |

Regresiones: ninguna. Versiones: llm `fake-guion@1`, embeddings `fake-bow@1`, reranker `fake-lexical@1`, NLI `fake-nli@1`,
prompt `rag-query@0.4.0` (config; el sufijo `+aplicabilidad-texto@0.1.0` solo se añade cuando se usa el proponente, no en esta
suite), corpus `rel-fx-t5a-a-1`, umbral de relevancia 0.3, catálogo 2026.10.0.

## Qué no se mide

- La suite fake no ejercita `aplicabilidad-texto@0.1.0` (no hay familia de aplicabilidad; llega con US-132/US-233): Δ = 0
  confirma que el pipeline RAG existente no cambió, no valida el prompt nuevo ni la calidad de las citas de aplicabilidad.
- Sin modelo real: nada de fidelidad/citas/aplicabilidad real. La medición con LLM real queda para US-233 (S4).
- Fidelidad 0.75 y precisión de citas 0.80 ya estaban bajo meta en el baseline (medidor con guion), no atribuibles a esta rama;
  si ese baseline es referencia aceptada es decisión del humano.
- No se corrió `scripts/ci/eval-required.mjs` (requiere `node_modules`; prohibido npm ci); se reemplazó por comparación directa.
- Tampoco mapeo terminológico, faltantes, OCR, PII ni eventos.
