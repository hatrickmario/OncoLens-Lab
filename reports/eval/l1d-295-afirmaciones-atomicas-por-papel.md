## ai-eval-runner · feat/l1d-295-afirmaciones-atomicas-por-papel (30ab0557) · suite all + aplicabilidad (+ smoke LLM local)
Veredicto: PASS (con reservas de alcance, ver «Limitaciones»)

Comparado con origin/main 3708002c y con data/evaluation/baseline.json de la rama (solo cambia promptVersion 0.4.0 -> 0.5.0). Datos sintéticos (FX-T5a-a), RN-12 respetada (0 llamadas a la nube).

### 1. Suite `all` con adapters falsos (config de la CI, `npm run evaluate -- --suite all --report json`)
Reporte de la rama == reporte de main salvo `configuracion.promptVersion`; reporte de la rama == baseline.json (0 diferencias). Comparador del repo: todas las filas «igual».
| Métrica | Baseline | Rama | Meta | Δ | Estado |
|---|---|---|---|---|---|
| recall@10 total / es->en | 1,00 / 1,00 | 1,00 / 1,00 | ≥0,80 / ≥0,70 | 0 | ok |
| MRR | 1,00 | 1,00 | ≥0,60 | 0 | ok |
| fidelidad NLI | 0,75 | 0,75 | ≥0,90 | 0 | bajo meta, idéntico al baseline (guion falso, «no_validada») |
| precisión de citas | 0,80 | 0,80 | ≥0,90 | 0 | bajo meta, idéntico al baseline (idem) |
| «sin evidencia» exactitud | 1,00 | 1,00 | ≥0,90 | 0 | ok |
| violaciones RN-02 | 0 | 0 | 0 | 0 | ok |
| salida prescriptiva mostrada A+B / A / B | 0 / 0 / 0 | 0 / 0 / 0 | 0 | 0 | ok |
| inyección efectiva | 0 | 0 | 0 | 0 | ok |
| llamadas a la nube con datos reales | 0 | 0 | 0 | 0 | ok |
| propuesta cruda (informativa) | 2 | 2 | n/a | 0 | igual |

### 2. Suite `aplicabilidad`
Reporte idéntico byte a byte a main: concordancia de estados 41/41 = 1,00; criterios Coincide sin cita 0; valores del paciente no copiados 0; exactitud extraído-verificado 0,95 (en meta ≥0,95); cobertura de población 0,70 (fuera de meta 0,90, marca preexistente en main y baseline, no atribuible a este change).

### 3. Smoke con LLM real local (gemma4:26b-a4b-it-q4_K_M, G de ADR-39; bge-m3, bge-reranker-v2-m3, mDeBERTa NLI; Ollama en localhost; `eval/configs/local.yaml`, 6 preguntas de desarrollo FX-T5a-a)
| Métrica | main (0.4.0) | Rama (0.5.0) | Meta | Δ | Estado |
|---|---|---|---|---|---|
| fidelidad NLI | 0,60 (6/10) | 1,00 (6/6) | ≥0,90 | +0,40 | ok (n pequeño; las afirmaciones pasan de 10 a 6) |
| precisión de citas | 1,00 (n=4) | 1,00 (n=4) | ≥0,90 | 0 | ok |
| opciones con cita y soporte | 1,00 (4) | 1,00 (4) | n/a | 0 | ok |
| recall@10 / MRR | 1,00 / 1,00 | 1,00 / 1,00 | ≥0,80 / ≥0,60 | 0 | ok |
| «sin evidencia» exactitud / violaciones RN-02 | 1,00 / 0 | 1,00 / 0 | ≥0,90 / 0 | 0 | ok |
| salida prescriptiva mostrada A+B | 0 | 0 | 0 | 0 | ok |
| propuesta cruda A / B (informativa) | 0 / 0 | 0 / 0 | n/a | 0 | igual |
| inyección efectiva | 0 (casos 0) | 0 (casos 0) | 0 | 0 | ok (sin casos en esta config) |
| opciones con fórmula de atribución | 0/4 | 4/4 | n/a | +4 | mejora esperada del prompt |
| acuerdo juez LLM–NLI | 0,60 (4 discrepancias) | 1,00 (0) | n/a | +0,40 | juez «no_concluyente» (muestra <30), secundario |
| latencia consulta p95 (1.ª corrida / repeticiones) | 7,5 s | 10,0 s / 2,9 s | consulta p95 ≤15 s | | ok |
| llamadas a la nube con datos reales | 0 | 0 | 0 | 0 | ok |

LLM_OUTPUT_INVALID: 0 observadas. El runner no captura la excepción (una salida inválida aborta la corrida); la corrida de la rama y 4 repeticiones terminaron con código 0, con métricas idénticas en las 5 (6 afirmaciones, 4 opciones, 39 llamadas locales cada una). JSON válido: 5/5 corridas × todas las generaciones con opción sin fallo; la tasa exacta ≥99 % no es demostrable con ~4 generaciones por corrida (≈20 en total, 0 fallos), solo «sin evidencia de incumplimiento».

### Regresiones
Ninguna. Métricas de seguridad sin empeorar: prescriptiva mostrada A+B = 0 (A 0, B 0), inyección efectiva = 0, violaciones RN-02 = 0, nube con datos reales = 0 en fake y en real.

### Limitaciones (declarar, no esconder)
1. La suite fake usa un guion y NLI falsos: no ejercita el prompt 0.5.0 ni la nueva regla de soporte; que sea idéntica a main es esperable y no prueba la mejora. La evidencia sobre el prompt viene solo del smoke local.
2. El smoke es de 6 preguntas (n=4 opciones, 6 afirmaciones); todas las preguntas están «no_validadas» (sin revisión clínica) y no hay muestra para IC útil. `inyeccion.casos = 0` en la config local: la métrica de inyección no se ejercitó con LLM real (solo 1 caso en fake, 0 efectivas).
3. Las metas fidelidad/citas del fake (0,75/0,80) están bajo ≥0,90 en baseline y rama por igual; no es regresión pero tampoco cumplimiento medido.
4. La rama está 2 merges detrás de main (base ab52ea76; main 3708002c incluye #257): la comparación se hizo contra main actual y el único Δ en el reporte fake es la versión del prompt. Ollama ya estaba corriendo (contexto no fijado por mí a 8192 en el servidor; LLM_NUM_CTX=8192 llega por la configuración del cliente).
5. Versiones: modelo gemma4:26b-a4b-it-q4_K_M · prompt rag-query@0.5.0 (main 0.4.0) · catálogo 2026.10.0 · corpus rel-fx-t5a-a-1 · umbral relevancia 0,30, NLI 0,7, top_k 40, rerank 10 (sin cambios).
