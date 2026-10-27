# Evaluación OL-06 · l1d-126-criterios-aplicabilidad-catalogo

Veredicto: **PASS, sin regresión.** Adapters falsos, FX-T5a-a, dataset sintético; solo agregados (RN-14). Resultado en
`l1d-126-criterios-aplicabilidad-catalogo.json` (esquema `oncolens.evaluate.v1`).

Reproducción: `HF_HUB_OFFLINE=1 EVAL_PYTHON=<venv>/bin/python node scripts/ci/eval-required.mjs --base <main>`. Salida:
"sin regresión contra data/evaluation/baseline.json (tolerancia 0)". Disparadores: rutas de `packages/clinical-catalogs`.
`hashConfig` 57b8a05d… igual al del baseline.

| Métrica (completa/revisada) | Baseline | Rama | Meta | Δ | Estado |
|---|---|---|---|---|---|
| citas.precision | 0.80 | 0.80 | 0.90 | 0 | igual; bajo meta (preexistente) |
| fidelidad.nli | 0.75 | 0.75 | 0.90 | 0 | igual; bajo meta (preexistente) |
| opciones_con_cita_y_soporte | 0.60 | 0.60 | - | 0 | igual |
| recall@10 total / es→en | 1.0 / 1.0 | 1.0 / 1.0 | 0.80 / 0.70 | 0 | igual |
| MRR total / es→en | 1.0 / 1.0 | 1.0 / 1.0 | 0.60 | 0 | igual |
| sin_evidencia.exactitud / violaciones_rn02 | 1.0 / 0 | 1.0 / 0 | 0.90 / 0 | 0 | igual |
| inyecciones efectivas | 0 | 0 | 0 | 0 | igual |
| terminos_prohibidos.salida_mostrada | 0 | 0 | 0 | 0 | igual (cero prescriptivas) |
| terminos_prohibidos.propuesta_cruda (completa) | 2 | 2 | informativa | 0 | informativa |

26 métricas: todas iguales al baseline o informativas. Regresiones: ninguna.

Versiones: llm `fake-guion@1`, embeddings `fake-bow@1`, reranker `fake-lexical@1`, NLI `fake-nli@1`, prompt
`rag-query@0.3.0`, corpus `rel-fx-t5a-a-1`, umbral de relevancia 0.3. El catálogo real no cambia de versión.

## Qué no se mide

- Con adapters falsos no se mide la aplicabilidad: la suite no tiene familia de métricas de aplicabilidad (llega con
  US-132) y el código nuevo (puerto y adapter de `aplicabilidad.json`) solo se carga al arrancar; Δ = 0 confirma que el
  pipeline RAG no cambió, no valida el contenido de los criterios.
- Tampoco mapeo terminológico, faltantes, OCR, PII ni eventos, ni nada con modelos reales.
- Fidelidad 0.75 y precisión de citas 0.80 ya estaban bajo su meta en el baseline (medidor con guion); no son atribuibles
  a esta rama. Si ese baseline cuenta como referencia aceptada o hace falta una corrida con modelo real es decisión
  del humano.
- La validez clínica de los criterios (`propuesta_revisada`) la cubren los tests del validador y la revisión clínica.
