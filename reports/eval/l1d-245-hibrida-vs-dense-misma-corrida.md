## ai-eval-runner · feat/l1d-245-hibrida-vs-dense-misma-corrida (d0523f9d) · suite all + retrieval (s4-hibrida-fake)
Veredicto: PASS (corrida con adapters falsos). Corrida real con modelos locales: NO-EJECUTABLE (bloqueos abajo).

### 1. `--suite all` (config de la CI, FX-T5a-a, fakes) vs data/evaluation/baseline.json y vs main (306bf340)
Rama y main producen metricas y privacidad identicas (diff vacio). 22 metricas del baseline "igual", 3 informativas, 0 regresiones.
| Metrica | Baseline | Rama | Meta | Delta | Estado |
|---|---|---|---|---|---|
| recall@10 total | 1,0 | 1,0 | >= 0,80 | 0 | ok (no_validada, n=4) |
| recall@10 es->en | 1,0 | 1,0 | >= 0,70 | 0 | ok (n=2) |
| MRR total | 1,0 | 1,0 | >= 0,60 | 0 | ok |
| fidelidad NLI | 0,75 | 0,75 | >= 0,90 | 0 | bajo meta, igual al baseline (fake, n=4, no_validada) |
| precision de citas | 0,80 | 0,80 | >= 0,90 | 0 | bajo meta, igual al baseline (fake, n=5, no_validada) |
| sin evidencia exactitud | 1,0 | 1,0 | >= 0,90 | 0 | ok |
| violaciones RN-02 | 0 | 0 | 0 | 0 | ok |
| salida prescriptiva mostrada (A+B) | 0 | 0 | 0 | 0 | ok |
| propuesta cruda nivel A (informativa) | 2 | 2 | - | 0 | informativa |
| inyeccion efectiva | 0 | 0 | 0 | 0 | ok |

### 2. `--suite retrieval` con s4-hibrida-fake.yaml (A0 dense, A2 RRF k=60, A2b ponderada 0,3)
- AC-4: dos corridas -> JSON byte a byte identico (cmp). exit 0 las dos.
- Los tres brazos: recall@10 = 1,0, MRR = 1,0, diferencia frente a A0 = 0, retroceso=false, sin_terminos_lexicos n=0 proporcion 0,0.
- Trazabilidad: retrievalMode por brazo (dense/hibrida/hibrida), trazabilidad coherentes 5/5 consultas en cada brazo; huellaConfig distinta por brazo.
- Limitacion: el fixture satura (n=4, todo 1,0), no discrimina. No se pudo forzar un retroceso por configuracion (pesos 0,01/0,5/0,99 y tolerancia 0: sin retroceso; peso 1,0 y tolerancia negativa: ConfigInvalida, exit 2). El exit 3 ante retroceso no se observo por CLI; lo cubre test_un_brazo_hibrido_peor_que_la_tolerancia_..._codigo_distinto_de_cero (pytest tests/evaluation -k "comparacion or hibrida or retroceso or reproduc": 37 passed). Tambien pasan los tests de golden_sha256 y de solo-desarrollo.

### 3. Corrida real (s4-hibrida.yaml): NO-EJECUTABLE
- data/eval/adr39-mini solo tiene golden.yaml, manifest.yaml, nli-pares.yaml y README.md: faltan corpus.yaml y preguntas.yaml.
- Falta la preinscripcion ADR-45 P1 (fija RETRIEVAL_REGRESSION_TOLERANCE; la config no trae tolerancia_retroceso).
- Faltan los pesos EMBEDDING_SPARSE_WEIGHTS_PATH / _SHA256.
No se simulan numeros. No hay metricas reales hibrida vs dense: la hipotesis de mejora esta sin medir.

Versiones: modelo fake-guion@1 / fake-bow@1 / fake-lexical@1 / fake-nli@1 · prompt rag-query@0.4.0 · catalogo 2026.10.0 · corpus rel-fx-t5a-a-1 · umbral relevancia 0,30, NLI 0,7, top_k 40, rerank_top_n 10
