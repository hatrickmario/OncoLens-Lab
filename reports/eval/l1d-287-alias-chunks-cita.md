## ai-eval-runner · feat/l1d-287-alias-chunks-cita (9ad2992b; tabla main vs rama de 9ad2992b, repetida en 189a06ab con el prompt final) · suite all (eval-required, CI)
Veredicto: PASS

Cambio: prompt rag-query 0.2.0 -> 0.3.0 (alias de chunks en la cita). Base de comparación: merge-base abfdc0c6 (main).
Datos: sintéticos y corpus público; LLM local (RN-12). Mide el ejecutor; no se tocó umbral, prompt ni dataset.

### 1. Job eval-required reproducido
`node scripts/ci/eval-required.mjs --base abfdc0c6` con venv Python 3.13.15 (requirements.txt + requirements-eval.txt) y HF_HUB_OFFLINE=1.
Salida: exit 0, "sin regresión contra data/evaluation/baseline.json (tolerancia 0)". Disparadores: rag_query.py y eval/configs/us236-alias.yaml.

Baseline regenerado: el diff contra main toca solo `promptVersion` (rag-query@0.2.0 -> 0.3.0). Comparación campo a campo del reporte
de la rama contra el baseline de la rama: 0 diferencias; las 26 métricas del comentario del job quedan en "igual".

| Métrica (fake, CI) | Baseline | Rama | Meta | Δ | Estado |
|---|---|---|---|---|---|
| recuperación total recall@10 / MRR | 1 / 1 | 1 / 1 | 0,80 / 0,60 | 0 | PASS |
| recuperación es->en recall@10 / MRR | 1 / 1 | 1 / 1 | 0,70 / 0,60 | 0 | PASS |
| sin evidencia exactitud / violaciones RN-02 | 1 / 0 | 1 / 0 | 0,90 / 0 | 0 | PASS |
| términos prohibidos, salida mostrada (completa y revisada) | 0 | 0 | 0 | 0 | PASS |
| inyección efectiva | 0 | 0 | 0 | 0 | PASS |
| precisión de citas | 0,80 | 0,80 | 0,90 | 0 | sin regresión; bajo la meta inicial, preexistente y "no validada" en regression.yaml |
| fidelidad NLI | 0,75 | 0,75 | 0,90 | 0 | ídem |

Observación: la suite de CI usa adapters falsos, así que es insensible al prompt (por eso las métricas no cambian). No prueba la
mejora; solo que no hay regresión en pipeline, umbrales ni validación. Precisión de citas 0,80 y fidelidad 0,75 ya estaban bajo
meta en el baseline de main (TBD-02/DEC-07 sin validar la fixture); no es atribuible a este change.

### 2. Medición con LLM real (gemma4:26b-a4b-it-q4_K_M, Ollama local, temperatura 0)
Script de la rama (`python -m app.evaluation.medicion_alias --config eval/configs/us236-alias.yaml --salida RUTA --max-preguntas N`; `eval/medicion_us236.py` es un atajo), medido al inicio contra cada árbol (worktree de la rama y de origin/main) con la versión inicial del script (commit 306a58f7). 10 corridas por conjunto, sin errores.

| Conjunto | main (rag-query@0.2.0) | rama (rag-query@0.3.0) |
|---|---|---|
| origen (chunk limpio, id largo con hash) | 10/10 aceptadas, cita_invalida 0 | 10/10 aceptadas, cita_invalida 0 |
| origen_ruido (LaTeX y ruido sintético) | 0/10 aceptadas, cita_invalida 10, citas válidas 0/10 | 10/10 aceptadas, cita_invalida 0, citas válidas 10/10 |

La variante origen_ruido reproduce el fallo original en main (cita_invalida 10/10) y la rama lo elimina (0/10). Esto evidencia la
mejora de AC-7 en la variante sintética. Datos crudos: `.llm-main.json` y `.llm-rama.json`.
Repetido en 189a06ab con el prompt final: origen 10/10, origen_ruido 10/10, cita_invalida 0, 9/9 citas válidas en 5 preguntas (datos: `.llm-rama-final.json`, re-medido con la factory de producción tras 243d2e41).
El dataset adr39-mini (69 preguntas, 102/102 citas válidas en rama y main) lo midió el implementador; no se repitió aquí.

### Hallazgos
Mayores: ninguno.
Menores / Preguntas:
- M1. Las 10 corridas con temperatura 0 son casi deterministas (10/10 vs 0/10): equivalen a una muestra por prompt, no a 10 independientes. Evidencia fuerte para esa entrada, no una tasa.
- M2. El ruido es sintético; el chunk real de la demo no está versionado. La mejora sobre el chunk real sigue sin demostrarse; se recomienda re-ejecutar la demo con el chunk real tras el merge.
- M3. Precisión de citas 0,80 y fidelidad 0,75 en la suite fake bajo meta inicial (preexistente, fuera del alcance de este change).

Regresiones: ninguna.   Versiones: modelo gemma4:26b-a4b-it-q4_K_M (LLM local; suite CI: fake) · prompt rag-query@0.3.0 (base 0.2.0) · catálogo sin cambios · corpus sin cambios · umbral sin cambios
Archivos: l1d-287-alias-chunks-cita.json (reporte crudo de CI), .llm-rama.json, .llm-main.json.
