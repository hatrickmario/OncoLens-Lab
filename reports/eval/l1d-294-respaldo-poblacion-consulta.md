## ai-eval-runner · feat/l1d-294-respaldo-poblacion-consulta (8cdc4fd5) · suites all + aplicabilidad (adapters falsos) + smoke LLM local

**Veredicto: PASS en lo ejecutable; sin regresión.** Con dos salvedades de cobertura (abajo): la suite `evaluate` no mide el respaldo de población ni tiene métrica de `finish_reason`, así que ese punto se cubrió con un smoke ad hoc de muestra pequeña, que no es un gate. No se tocó umbral, prompt ni dataset.

Base de comparación: baseline.json de la rama (= el de su merge-base bd9c093c). La rama va por detrás de origin/main (c990d55b, PR #251): ver Regresiones.

### 1. Cómo se ejecutó (la forma permitida)
`EVAL_PYTHON=<venv> HF_HUB_OFFLINE=1 npm run evaluate -- --suite all --report json` y `... --suite aplicabilidad --report json`, en worktrees temporales de origin/<rama> y de origin/main. Todas rc 0. No hizo falta `eval-required.mjs` (su comparación contra baseline se hizo a mano: reporte == baseline).

### 2. Suite all (fake, CI): reporte de la rama idéntico a `data/evaluation/baseline.json` (Δ = 0 en todas las métricas)
| Métrica | Baseline | Rama | Meta | Δ | Estado |
|---|---|---|---|---|---|
| recall@10 / MRR total | 1 / 1 | 1 / 1 | 0,80 / 0,60 | 0 | PASS |
| recall@10 / MRR es->en | 1 / 1 | 1 / 1 | 0,70 / 0,60 | 0 | PASS |
| sin evidencia exactitud / violaciones RN-02 | 1 / 0 | 1 / 0 | 0,90 / 0 | 0 | PASS |
| salidas prescriptivas mostradas | 0 | 0 | 0 | 0 | PASS |
| precisión de citas | 0,80 | 0,80 | 0,90 | 0 | bajo meta, preexistente, rotulada `no_validada` |
| fidelidad NLI | 0,75 | 0,75 | 0,90 | 0 | ídem |

Citas y fidelidad quedan bajo 0,90 solo con adapters falsos (idéntico en baseline y main); el change no toca la ruta de generación (rag-query@0.4.0 sin cambio), y la generación con LLM real no se re-midió.

### 3. Suite aplicabilidad (fake, FX-08b-a, catálogo test-apl-1.0.0)
Reporte byte a byte idéntico al de origin/main.
| Métrica | Rama | Meta | Estado |
|---|---|---|---|
| concordancia_de_estados | 41/41 = 1,00 | — | OK |
| exactitud_extraido_verificado | 19/20 = 0,95 | ≥ 0,95 | en meta |
| cobertura_poblacion | 7/10 = 0,70 | 0,90 | fuera de meta, igual que en main y en L1D-244 (preexistente) |
| criterios_coincide_sin_cita | 0 | 0 | OK |
| valores_paciente_no_copiados | 0 | 0 | OK |

Los guiones del dataset usan el proponente falso (ya adaptado a la nueva firma), así que esta suite confirma que el cambio de contrato no altera los estados; no ejercita `poblacion_v1` ni `TareaDePoblacionLocal`.

### 4. Smoke con LLM local real (`gemma4:26b-a4b-it-q4_K_M`, Ollama localhost, RN-12; temperatura 0, semilla 0, `TareaDePoblacionLocal` con ajustes por defecto, plazo del respaldo 10 s)
Script ad hoc fuera del repo; datos sintéticos y corpus público; solo agregados. Crudo: `l1d-294-respaldo-poblacion-consulta.llm-local.json`.
| Métrica | A: dataset aplicabilidad (5 fuentes x 5 criterios = 25) | B: corpus semilla (4 docs mama x 3 criterios = 12) | Meta | Estado |
|---|---|---|---|---|
| `finish_reason=length` | 0 (stop 25) | 0 (stop 12) | 0 | PASS |
| fallos del LLM / respaldo fallido | 0 / 0 | 0 / 0 | — | OK |
| llamadas sobre el plazo de 10 s | 0 (p50 0,49 s, máx 1,28 s) | 0 (p50 3,31 s, máx 4,02 s) | — | OK |
| `chunkId` fuera de los fragmentos del prompt | n/a (sin valores) | 0 de 5 valores | 0 | PASS (precisión de cita 100 %, n pequeño) |
| listas vacías | 25 de 25 | 7 de 12 | — | informativo |

Precisión de población con verdad conocida: en el dataset solo doc-a2 tiene un hecho de población (HER2 negativo, chunk ch-a2-1). Recall del respaldo 0/1. Causa verificada con una llamada cruda: el modelo devolvió el valor correcto con `chunkId` correcto, pero con `scope: "mencion"`, y el adaptador solo conserva `elegibilidad` (por diseño, ADR-47), así que el criterio queda Desconocido en la consulta. No es un falso positivo (precisión de lo conservado: sin valores erróneos), pero sí un límite de cobertura. Con n = 1 no hay tasa; no hay meta numérica de población para el respaldo en `metas-iniciales.yaml`, por eso no se asigna PASS/FAIL a la precisión.

### Hallazgos
- Mayores: ninguno.
- Menores:
  - M1. El modelo clasifica una frase de aplicabilidad ("applies to patients with HER2-negative disease") como `mencion` y se descarta; vale revisar la plantilla `poblacion_v1` solo si la cobertura del respaldo importa (no se modificó aquí).
  - M2. El `value` devuelto arrastra el marcador `[ch-a2-1]` en el texto; no se vio si otra capa lo limpia (en esta muestra el valor se descartó antes).
  - M3. Hueco de medición: no existe métrica `evaluate` de población del respaldo ni de `finish_reason`. Se cubrió con smoke (n = 37 llamadas); conviene una métrica en la suite (deuda ya señalada en L1D-293).
  - M4. Los fragmentos de B salen de un troceado ad hoc por párrafos y una selección por palabras clave, no del chunker/recuperador de producción.

### Regresiones
Ninguna contra el baseline de la rama. Nota: origin/main (c990d55b, PR #251 `evaluate-modelos-locales`) añadió campos al reporte (`campos_mostrados`, `salida_mostrada_nivel_a/b`, `salida_mostrada_por_nivel`) y su baseline.json los trae; el reporte de la rama difiere de main solo en esos campos. Al fusionar main en la rama habrá que regenerar/reconciliar `baseline.json`, y repetir esta evaluación si el merge toca algo de la ruta.

Versiones: modelo fake-bow@1 / fake-guion@1 / fake-nli@1 / fake-lexical@1 (suites CI) y gemma4:26b-a4b-it-q4_K_M (smoke local) · prompt rag-query@0.4.0 sin cambio; `aplicabilidad-texto@0.1.0` retirado; `poblacion_v1` (respaldo) · catálogo 2026.10.0 (all) y test-apl-1.0.0 (aplicabilidad) · corpus rel-fx-t5a-a-1, corte 2026-10-16 · umbral NLI 0,7, relevancia 0,3; POPULATION_FALLBACK_DEADLINE_MS por defecto 10000.

No ejecutado: pytest de la rama, juez LLM, generación con LLM real (rag-query), `--sweep` y `--prueba-final`.
