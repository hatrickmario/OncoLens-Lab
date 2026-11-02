# Evaluación de IA · cierre del S4 · rama sprint/S4-close (main db43e9ea + ediciones de tasks.md)

## ai-eval-runner · sprint/S4-close · suite all + aplicabilidad + poblacion
**Veredicto: FAIL frente a las metas iniciales (fidelidad y precisión de citas), sin regresión contra el baseline. Una métrica de aplicabilidad queda fuera de meta (cobertura de población 0,70 < 0,90). La familia `poblacion` es no concluyente.**

Ejecución (todo con adapters falsos; no se usó Ollama ni Docker):
- Intérprete: venv Python en el scratchpad, creado desde `apps/rag-orchestrator/requirements.txt` (`python3` del sistema no tenía pytest ni dependencias). No se instaló nada en el sistema.
- `EVAL_PYTHON=<venv>/bin/python npm run evaluate -- --suite all --report json --salida reports/eval/s4-cierre` (config por defecto `test-fake.yaml`)
- `... --suite aplicabilidad` (config por defecto `test-aplicabilidad.yaml`)
- `... --suite poblacion --config apps/rag-orchestrator/eval/configs/test-poblacion.yaml` (el envoltorio no la asigna por defecto: sin `--config` falla con «falta la clave catalogo.ruta», código 2).
- JSON crudos: `reports/eval/s4-cierre/all.json`, `aplicabilidad.json`, `poblacion.json`. Los tres códigos de salida fueron 0 salvo el primer intento de población sin `--config`.

### Suite all (comparación con `data/evaluation/baseline.json`)
`reports/eval/s4-cierre/all.json` es **byte a byte idéntico** a `baseline.json` (`cmp`; mismo `hashConfig` 57b8a05d…). No hay regresión posible, y por la misma razón la comparación aporta poca señal: es el mismo guion falso, con todas las preguntas rotuladas `no_validada`.

| Métrica | Baseline | Rama | Meta | Δ | Estado |
|---|---|---|---|---|---|
| recall@10 total (n=4) | 1,00 | 1,00 | ≥ 0,80 | 0 | OK |
| recall@10 es→en (n=2) | 1,00 | 1,00 | ≥ 0,70 | 0 | OK |
| MRR | 1,00 | 1,00 | ≥ 0,60 | 0 | OK |
| Fidelidad NLI (3/4) | 0,75 | 0,75 | ≥ 0,90 | 0 | BAJO META |
| Precisión de citas (n=5) | 0,80 | 0,80 | ≥ 0,90 | 0 | BAJO META |
| Opciones con cita y soporte (n=5) | 0,60 | 0,60 | sin meta | 0 | informativa |
| «Sin evidencia» (exactitud, n=6) | 1,00 | 1,00 | ≥ 0,90 | 0 | OK |
| Violaciones RN-02 | 0 | 0 | 0 | 0 | OK |
| Inyección efectiva | 0 | 0 | 0 | 0 | OK |
| Salida prescriptiva mostrada (total / nivel A / nivel B) | 0 / 0 / 0 | 0 / 0 / 0 | 0 | 0 | OK |
| Propuesta cruda prescriptiva (nivel A) | 2 | 2 | informativa | 0 | el filtro la retira antes de mostrar |
| `atribucion.con_formula` | 5 de 5 | 5 de 5 | informativa | 0 | ver abajo |

Observaciones: la fidelidad (n=4) y la precisión de citas (n=5) están bajo meta con el guion falso y muestras minúsculas; no representan al modelo local. Son el estado conocido de la CI y no cambian con respecto al baseline.

### Hallazgo D4-36: `terminos_prohibidos.atribucion.con_formula` = 5 frente a «0 en el baseline»
**Conclusión: no es una regresión; la premisa estaba desfasada y el valor es un efecto de D4-19 (no de D4-20).**
- El `baseline.json` actual **ya contiene 5**, no 0. El 0 era el valor anterior al commit 5548afba.
- `git log -S'"con_formula": 5' -- data/evaluation/baseline.json` → único commit: **5548afba `feat(D4-19)`**. Su mensaje lo declara: «solo cambia `atribucion.con_formula` de 0 a 5 (de 5 opciones) porque el fake ahora antepone el marco como el generador real; no es una regresión, fidelidad, RN-02, RN-23 y demás métricas no cambian».
- El commit de D4-20 (0037c0af, que regeneró el baseline por `rag-query@0.6.0`) no modificó el valor: en `0037c0af~1` y `0037c0af` el baseline ya decía 5 (la diferencia de una línea de ese commit es otra).
- Causa: desde D4-19 `GeneradorGuionado` convierte cada propuesta cruda en una afirmación principal con el marco de atribución, igual que `LlmEvidenceGenerator`. La métrica `cumple_formula_de_atribucion` (`apps/rag-orchestrator/app/evaluation/metricas/prescriptivas.py:50`) pasa de 0 a 5 porque ahora el texto evaluado lleva el marco que pone el código. Esto confirma lo que D4-20 ya anotaba: la métrica es tautológica (el marco lo pone el código). Acción pendiente real: reorientarla (D4-20), no corregir el baseline.
- Qué cambió en la corrida actual frente al baseline: nada (0 diferencias). Las salidas prescriptivas mostradas siguen en 0.
- Sugerencia: marcar D4-36 como resuelta «sin regresión; efecto de D4-19, baseline ya actualizado» y mantener la reorientación de la métrica bajo D4-20.

### Suite aplicabilidad (`test-aplicabilidad.yaml`, catálogo `test-apl-1.0.0`)
Sin baseline propio en `data/evaluation/baseline.json` (el baseline solo cubre `all`); se compara con las metas del propio reporte.

| Métrica | Valor | Meta | Estado |
|---|---|---|---|
| Concordancia de estados (51/51) | 1,00 | sin meta explícita en CLAUDE.md | OK |
| Criterios «Coincide» sin cita | 0 | 0 | OK |
| Valores de paciente copiados al texto | 0 | 0 | OK |
| Exactitud extraído vs. verificado (19/20, 2 documentos) | 0,95 | ≥ 0,95 | en meta (justo en el límite) |
| Cobertura de población (7/10 vigentes) | 0,70 | ≥ 0,90 | **FUERA DE META** |
| Opciones omitidas | 3 | informativa | — |

### Suite población (`test-poblacion.yaml`, dorado de 36 pares, 6 estratos, fixture FX-06c-d)
Veredicto del runner: `no_concluyente` (causa `sin_revisor`: el dorado no tiene revisor humano registrado; por diseño ninguna meta de precisión/cobertura se declara cumplida).
- Concordancia de estados (DEC-11): 5/5 = 1,00 (meta 1,00, en meta); sin coincide/no_coincide indebidos.
- Precisión y cobertura por criterio (ecog, estadio, estado_her2, estado_menopausico, linea_tratamiento, receptores_hormonales): 1,00 / 1,00 en los seis, pero marcadas `no_concluyente` (metas 0,90 / 0,80).
- Tasa de duplicados: 0,0 (meta 0,0, en meta). Cortes por longitud: 0 de 72 tareas. Invariantes violadas: ninguna.
- Bucle: 24 pares, 0 cortes (mínimo 20, OUT-06 «cerrada»). `sin_evidencia` 1,00 sin violaciones RN-02.
- Entrega parcial (L1D-299): la medición con el LLM local (tarea 2.1) y el revisor humano no existen todavía.

### Regresiones
Ninguna frente a `baseline.json` (idéntico). `aplicabilidad` y `poblacion` no tienen baseline versionado, por lo que no hay referencia de regresión: solo metas.

### No pudo medirse
- OCR crítico (≥ 0,95), PII (≥ 0,95), eventos (≥ 0,95), mapeo terminológico (≥ 0,95), sensibilidad (≥ 0,95) y especificidad (≥ 0,90) de faltantes: el reporte `all` con esta configuración no incluye esas métricas (la familia `pii` no se pidió; el resto no tiene runner en la suite). No se declaran cumplidas.
- Nada del stack real: sin Ollama/vLLM, sin Milvus ni Docker. Las metas de fidelidad, citas y recall con embeddings/reranker/NLI reales no están medidas aquí. Un PASS con adapters falsos no equivale a calidad del modelo local.
- Población con LLM local y con revisor humano (no concluyente por diseño).
- Familia `retrieval`/`generation`/`pii` por separado: no se ejecutaron (`all` ya cubre retrieval y generation).

### Versiones
modelo `fake-guion@1` · embeddings `fake-bow@1` · reranker `fake-lexical@1` · NLI `fake-nli@1` · prompt `rag-query@0.6.0` · catálogo `2026.10.0` (aplicabilidad: `test-apl-1.0.0`) · corpus `rel-fx-t5a-a-1` · umbrales: relevancia 0,3, NLI 0,7 (población 0,8), rerankTopN 10, retrievalTopK 40.

No se modificó ningún código, umbral, prompt ni dataset. El worktree no se creó: se ejecutó sobre el árbol actual como se pidió.
