## ai-eval-runner · feat/l1d-292-poblacion-abanico-ingesta · suite poblacion (eval-required + sintetica del change + smoke del prompt)

Veredicto: PASS en lo ejecutable (sin regresion; 0 valores con termino prohibido conservados en la suite sintetica; el smoke con LLM real no midio lenguaje). El smoke con LLM real es evidencia de una muestra pequena (12 tareas), no un gate. `baseline.json` no tiene linea de regresion para esta familia: "umbral no aplicado".

Solo agregados (RN-14): sin texto de fragmentos, prompts ni salidas del LLM.

### 1. Suite `evaluate` como la CI

Comando: `env EVAL_PYTHON=/tmp/venv293/bin/python HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 node scripts/ci/eval-required.mjs --base origin/main`

Resultado: `eval-required — sin regresion contra data/evaluation/baseline.json (tolerancia 0)` y `Sin baseline de regresion: umbral no aplicado`. Baseline: fake-bow/fake-guion, `fx-t5a-a`, `rag-query@0.4.0`. El change no toca esa ruta de consulta, asi que Δ = 0 en todas las metricas.

### 2. Evaluacion sintetica del change

Comando (cwd `apps/rag-orchestrator`): `/tmp/venv293/bin/python -m pytest tests/evaluation/test_poblacion_evaluacion.py -v` -> 5 passed.

| Metrica | Main (variante `confia_en_el_llm`) | Rama (fabrica de produccion) | Meta | Estado |
|---|---|---|---|---|
| No respaldados conservados | 3 (detectada) | 0 | 0 | OK |
| Cobertura de respaldados | n/d | 1.0 | 1.0 | OK |
| Duplicados conservados | n/d | 0 | 0 | OK |

La variante que falla en main queda detectada por `test_la_evaluacion_detecta_un_paso_que_confia_en_el_llm_variante_que_falla_en_main`. El test comprueba la asercion `no_respaldados_conservados == 3` y pasa; no inspeccione el valor numerico por separado.

### 3. Smoke del prompt `poblacion_v1` con el LLM real

- LLM: Ollama del usuario, `http://localhost:11434/v1`, modelo `gemma4:26b-a4b-it-q4_K_M`. No se toco la instancia.
- Datos: corpus publico `data/raw/seed` (NCI y PMC CC BY, sin pacientes). 4 documentos de mama x 3 criterios (`estado_her2`, `estado_menopausico`, `ecog`) = 12 tareas.
- Parametros: TOP_K=4, MAX_OUTPUT_TOKENS=512, semilla 0, maximo 3 valores por criterio, plazo 60 s, 1 intento por tarea.
- Fragmentos: troceado ad hoc por parrafos (~1500 caracteres), no el chunker de produccion. Los fragmentos del prompt los eligio `RecuperadorLexicalDeFragmentos`.
- Script (fuera del repo): `script ad hoc fuera del repo`

| Metrica | Resultado | Meta/criterio | Estado |
|---|---|---|---|
| Fallos del LLM (conexion/plazo) | 0 de 12 | - | OK |
| JSON valido contra el esquema | 100 % (12/12) | - | OK |
| `finish_reason` | `stop` 12, `length` 0 | `length` = 0 | OK |
| Valores totales / media por tarea | 19 / 1,58 | - | - |
| Tareas con lista vacia | 4 de 12 | - | - |
| `chunkId` entre los fragmentos del prompt | 100 % (19/19) | - | OK |
| `chunkId` dentro del documento | 100 % | - | OK |
| Valores de relleno ("not found", "none"...) | 0 % | - | OK |
| Valores de mas de 200 caracteres | 0 | - | OK |
| Alcance: elegibilidad / subgrupo / mencion | 4 / 4 / 11 | - | informativo |
| Latencia por tarea p50 / ~p90 (n=12) / max | 3,39 s / 5,29 s / 8,36 s | - | informativo |

### Hallazgos sobre el prompt

- Ningun valor de relleno ni fragmento ajeno en esta muestra. Las reglas de depuracion (relleno, `chunkId`) no tuvieron nada que descartar; su efecto lo cubre la evaluacion sintetica, no este smoke.
- El modelo declara lista vacia cuando no hay dato (4 de 12). Es el comportamiento pedido.
- 11 de 19 valores salen con alcance `mencion`. Si DEC-11 depende de distinguir `elegibilidad`, conviene revisar a mano una muestra mayor. No se midio la exactitud de los valores ni del alcance (no hay etiquetas de referencia), solo su forma y su trazabilidad.
- No se midio la verificacion NLI con modelos reales: el smoke no la incluye.
- Con n=12 los porcentajes no son una estimacion fiable de produccion. Mide el prompt, no el pipeline completo.

### Versiones

modelo `gemma4:26b-a4b-it-q4_K_M` (smoke) / fakes (suite) · prompt `poblacion_v1` · catalogo de criterios de mama (version de test `test-apl-1.2.0` en la sintetica) · corpus `data/raw/seed` · umbral: valores POPULATION_* del spike.

### Regresiones

Ninguna detectada. `EVAL_MAX_REGRESSION` no se aplico porque el baseline no cubre la familia.

JSON crudo (agregados y metricas por tarea sin texto): `reports/eval/l1d-292-poblacion-abanico.json`


## Aclaraciones (Gate 2)

- **Variante `confia_en_el_llm`:** es una simulacion del comportamiento previo, porque `main` no tiene el extractor. Guarda lo que
  propone el LLM (sin relleno, fragmento, lenguaje ni NLI).
- **NLI falso:** valida la composicion de la ingesta, no la calidad del NLI (US-233b).
- **Valores medidos por separado (suite sintetica):** produccion = 0 no respaldados, cobertura 1,0, 0 duplicados; variante = 3 no
  respaldados (`HER2-positive` de un fragmento ajeno, `stage I-III` sin soporte y `recommended treatment`), cobertura 1,0, 0 duplicados.
- **Suites `all` y `aplicabilidad`:** identicas a baseline y a main (delta = 0); el change no toca esas rutas.
- **Versiones:** suite con `fake-guion@1` / `fake-nli@1`; smoke con `gemma4:26b-a4b-it-q4_K_M`; prompt `poblacion_v1`; catalogo
  `2026.10.0` y `test-apl-1.2.0` (etiqueta de test); corpus `rel-fx-t5a-a-1` y `data/raw/seed`; umbral de relevancia 0,30 y de NLI 0,7.
- **`eval-required.mjs`:** no se pudo ejecutar localmente (falta el modulo `yaml`); la CI lo confirma.
- **Script del smoke:** script ad hoc fuera del repo.
- **Alcance:** 11 de 19 valores del smoke salen como `mencion`; la exactitud del alcance no esta medida (riesgo para DEC-11).
