## ai-eval-runner · main (578bfeb5, PR #195) vs base abfdc0c6 · AC-7 de US-236 (L1D-287), 20 corridas a temperatura 0 y 0,3
Veredicto: PASS (AC-7: `cita_invalida` = 0 en 80/80 corridas de la rama, en ambos conjuntos y ambas temperaturas). Medición sintética, no sustituye al chunk real de la demo.

Repite la sección 2 de `reports/eval/l1d-287-alias-chunks-cita.md` con 20 corridas por conjunto y dos temperaturas (instrucción del usuario, 2026-10-24).
Datos crudos y resumen: `reports/eval/l1d-287-ac7-temperaturas.json`. No se tocó ningún umbral, prompt, dataset ni código de producto.

### Método
- Modelo: `gemma4:26b-a4b-it-q4_K_M`, Ollama local (RN-12); solo datos sintéticos y corpus público.
- Script: `python -m app.evaluation.medicion_alias --salida RUTA --max-preguntas 5`, con el generador de producción (`crear_generador_local`) y `validar_citas`.
- Config: copia en el scratchpad de `eval/configs/us236-alias.yaml` cambiando solo `EVAL_ORIGIN_RUNS: 10 -> 20`. La config versionada no se editó.
- Temperatura: variable de entorno existente `LLM_TEMPERATURE` (`Settings.llm_temperature`, default 0,0), comprobada con 0,3. No hubo que editar nada.
- Árboles, en worktrees del scratchpad (sin enlaces al checkout principal): base = `abfdc0c6` (prompt `rag-query@0.2.0`); rama = `origin/main` 578bfeb5 (`rag-query@0.3.0`). Cada JSON registra la versión del prompt.
- Adaptación en el árbol base (solo herramienta de medición, no producto): `medicion_alias.py` no existe en `abfdc0c6`, así que copié del main actual `app/evaluation/medicion_alias.py`, `app/evaluation/corrida.py` (solo `citas_propuestas_de`), `app/evaluation/config_suite.py` (campo `origen`), `app/domain/alias_de_chunks.py` (nuevo, sin uso desde el generador base) y `app/domain/relevance.py` (solo añade `ordenar_por_relevancia`). Generador y prompt del árbol base quedan en 0.2.0 sin cambios. El worktree base se descarta.
- Conjuntos: `origen` (chunk limpio, id largo con hash) y `origen_ruido` (LaTeX y ruido sintético), 20 corridas cada uno, más las 5 preguntas del dataset `adr39-mini` con evidencia (el script usa `--max-preguntas`; lo fijé en 5). 0 errores de generación en las 160 corridas.
- "Aceptada" = la corrida produjo ≥ 1 opción que pasó `validar_citas`. Intervalo de Wilson al 95 % sobre aceptadas/20.

### Resultados

| Árbol (prompt) | Temp. | Conjunto | Aceptadas/20 | `cita_invalida` (total; corridas afectadas) | Tasa | Wilson 95 % |
|---|---|---|---|---|---|---|
| base (0.2.0) | 0 | origen | 20/20 | 0; 0 | 1,00 | 0,839 - 1,000 |
| base (0.2.0) | 0 | origen_ruido | 0/20 | 20; 20 | 0,00 | 0,000 - 0,161 |
| base (0.2.0) | 0,3 | origen | 20/20 | 0; 0 | 1,00 | 0,839 - 1,000 |
| base (0.2.0) | 0,3 | origen_ruido | 8/20 | 12; 12 | 0,40 | 0,219 - 0,613 |
| rama (0.3.0) | 0 | origen | 20/20 | 0; 0 | 1,00 | 0,839 - 1,000 |
| rama (0.3.0) | 0 | origen_ruido | 20/20 | 0; 0 | 1,00 | 0,839 - 1,000 |
| rama (0.3.0) | 0,3 | origen | 20/20 | 0; 0 | 1,00 | 0,839 - 1,000 |
| rama (0.3.0) | 0,3 | origen_ruido | 20/20 | 0; 0 | 1,00 | 0,839 - 1,000 |

Dataset (5 preguntas, 9 opciones por árbol y temperatura): 9/9 opciones aceptadas, `cita_invalida` 0 y 9/9 citas válidas en los cuatro casos.

### Variación entre corridas
- Temperatura 0: sin variación en ninguna celda (un solo patrón de resultado en las 20 corridas). Confirma M1: a T=0 las 20 corridas son prácticamente una muestra.
- Temperatura 0,3, base, `origen_ruido`: variación real. 8 corridas aceptadas y 12 con `cita_invalida` (1 opción por corrida; el id largo con ruido se transcribe mal en parte de las corridas). El fallo original de main no es determinista a 0,3: aparece en el 60 % de las corridas (Wilson de la tasa de fallo: 0,387 - 0,781), frente al 100 % a T=0.
- Temperatura 0,3, rama: sin variación en los conteos (20/20, 1 opción y 1 cita por corrida en `origen_ruido` y `origen`). La rama tiene Wilson inferior de 0,839: con 20 corridas no se puede afirmar que la tasa de fallo sea 0, solo que es ≤ 16 % al 95 %.
- Comparación base vs rama a 0,3 en `origen_ruido`: 8/20 contra 20/20, intervalos Wilson disjuntos (0,219 - 0,613 contra 0,839 - 1,000).

### Hallazgos
Mayores: ninguno.
Menores / Preguntas:
- M1. Con 20 corridas la cota de Wilson no demuestra tasa 0: "0 de 20" es compatible con hasta ~16 % de fallo. Evidencia fuerte en la comparación (base 0/20 y 8/20 frente a rama 20/20 y 20/20), no una tasa precisa.
- M2. La prueba sigue siendo sintética. El chunk real de la demo del 2026-10-23 NO está versionado; `origen_ruido` imita su ruido con LaTeX y símbolos intercalados, y `origen` usa el inicio de `pmc-mama-cdk46-guia` con un id largo con hash. La mejora sobre el chunk real sigue sin demostrarse; se recomienda re-ejecutar la demo con él.
- M3. Solo se probó T=0 y T=0,3, y un único modelo; no se exploró semilla ni otras temperaturas.
- M4. El árbol base se midió con el arnés de medición del main actual (ver Método); la lógica de generación y el prompt son los del commit base.

Regresiones: ninguna.   Versiones: modelo gemma4:26b-a4b-it-q4_K_M · prompt rag-query@0.2.0 (base) y 0.3.0 (rama) · catálogo 2026.10.0 sin cambios · corpus sin cambios · umbral sin cambios (relevance_threshold 0,30)
Archivos: `reports/eval/l1d-287-ac7-temperaturas.json` (resumen y datos crudos de las 8 corridas de medición).
