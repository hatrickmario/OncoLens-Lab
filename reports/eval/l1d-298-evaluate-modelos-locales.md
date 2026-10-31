# Reporte de ai-eval-runner (Gate 2, primero sobre ee31d9fa y re-gate sobre 87947745, 2026-10-30); copiado por el implementador; no es una medición del implementador

Change `l1d-298-evaluate-modelos-locales` (US-233a). Contenido copiado de los reportes que entregó `ai-eval-runner`; las secciones marcadas «implementador» las añadió el implementador. Las cifras de los datasets `fx-*` son de n minúsculo, todas con rótulo `validacion.rotulo = no_validada` en el JSON: **no son una baseline**.

## Veredicto

**PASS para el gate de CI** (suite con adaptadores falsos). Dos resultados negativos de las mediciones reales quedan abiertos para el refinamiento (AC-2 y AC-7).

## Estado del baseline en el HEAD actual (re-gate)

- **`data/evaluation/baseline.json` SÍ cambia, solo de forma aditiva:** 14 inserciones, 0 borrados, 10 claves nuevas en `completa` y `revisada` (lenguaje mostrado por nivel y `campos_mostrados`). Δ = 0; `hashConfig` 57b8a05d… igual; `pytest tests/evaluation`: 774 passed.
- `compararConBaseline` con tolerancia 0,02: 28 iguales, 6 informativas, 0 regresiones.
- El reporte de la rama difiere del de `main` exactamente en esas 10 claves.
- (Verificación del primer Gate sobre ee31d9fa, antes de esas claves: JSON de la rama idéntico byte a byte al de `main` y a `baseline.json`.)

## Entorno de la verificación

- Worktrees de la rama y de `origin/main` (86d943bd); venv `~/.venvs/oncolens-adr39`; sin Compose; sin LLM real; Ollama del usuario intacto.
- `evaluate test-fake --suite all` y `test-aplicabilidad --suite aplicabilidad`: exit 0.
- `hashConfig` de los reportes reales verificado: `fx-t5a-a` 0c2b587d… y `fx-rn23` 716f82c1… con el puerto 11436; con el 11434 versionado da 0649f0a3….
- Las cifras de `design.md` coinciden con los JSON. n = 6 y 4 preguntas; todo `no_validada`.
- Juez: rótulo `secundaria`, estado `no_concluyente`, `acuerdo_con_humano` `sin_medir`.
- Versiones: modelo `gemma4:26b-a4b-it-q4_K_M`, prompt `rag-query@0.4.0`, catálogo 2026.10.0, corpus `rel-fx-t5a-a-1` y `rel-fx-rn23-1`, umbrales 0,30 y 0,7.

## Resultado negativo 1 (AC-2, lenguaje)

Fixture adversarial `fx-rn23`: **1 salida mostrada de nivel B** (`b-recommend`, campo `rationale`); nivel A = 0; el filtro de producción cubre solo el nivel A; n = 4 preguntas, sin repetición. La propuesta cruda trae 6 campos con términos de la lista (A = 5, B = 1) que copian el corpus citado. Los contadores `propuesta_cruda`, `salida_mostrada` y `terminos_compartidos_con_corpus_citado` **cuentan campos generados con algún término de la lista, no salidas completas** (renombrar queda como deuda de D7/AC-2).

## Resultado negativo 2 (AC-7, RSS) y la pregunta de los 4489 MiB

- RSS 8840,5 (`fx-t5a-a`) / 6987,8 y luego 10589,5 (`fx-rn23`, dos corridas) / 8753,5 MiB (`test_nli_mediciones`, `-m models`) frente a 4489.
- `rss_maximo_mib` (esquema de `fx-t5a-a`, primera ronda) y `rss_pico_proceso_mib` (esquema de `fx-rn23` repetido) son **la misma magnitud con dos nombres de esquema**: el `ru_maxrss` del proceso entero.
- **Conclusión del evaluador sobre los 4489 MiB:** 4489 es la suma de tres RSS medidos por separado (cifra de régimen por modelo, ADR-39); no es comparable con el `ru_maxrss` del proceso combinado (6988 a 10589 MiB: varía ~1,5× entre corridas). Para decidir si el presupuesto aplica al pico de carga o al régimen hace falta: RSS tras la carga y un `gc`, proceso fresco por repetición, ≥ 3 repeticiones y el stack completo bajo presión en el equipo de 32 GB. **4489 MiB no debe usarse como `mem_limit` de contenedor.**
- Estimación del evaluador: LLM ≈ 17 GB + pico de Python ≈ 8,8 GB ≈ 26 GB antes de PostgreSQL, Milvus, MinIO ×2, clinical-api, web y SO. `rss_en_regimen` es `null` en macOS.

## n = 4 preguntas frente a latencia por lote n = 2 (implementador)

El `n` de las familias son **preguntas** (4 en `fx-rn23`). El `n` de la latencia son **llamadas al NLI**: 2 lotes de 1 hipótesis cada uno, porque solo las consultas que llegaron a generar con citas invocan al NLI (coherente con `fidelidad.nli.afirmaciones` = 2); las demás terminan en «sin evidencia» o sin afirmaciones. No lo verifiqué consulta por consulta.

## Juez

Acuerdo juez↔NLI 0,667 (n = 9) y 0,5 (n = 2), con kappa 0 por juez constante. `JUEZ_ACUERDO_MINIMO` 0,8 y `JUEZ_MUESTRA_MINIMA` 30 son supuestos sin calibrar.

## Hallazgos accionables

- AC-2 y AC-7 abiertos para el refinamiento.
- Tareas sin ID que deben asignarse: 1.8b, 1.9, 1.10 y 3.3.

## Corrida anterior de `fx-rn23` (implementador; el JSON original fue sobrescrito)

El JSON original de `fx-rn23` (`hashConfig` 716f82c1…) fue **sobrescrito** por la repetición de la segunda ronda. Sus cifras, sin texto: fidelidad NLI 0,5 (1/2); juez 2/2 con acuerdo 0,5, kappa 0, estado `no_concluyente`; propuesta cruda 6 (A = 5, B = 1); 1 mostrada; 6 términos compartidos con el corpus citado; precisión de citas 1,0 (n = 4); «sin evidencia» 1,0 (n = 4; 0 violaciones); 23 llamadas registradas, 0 a la nube; p95 consulta / generación / NLI / reranker 2660 / 2576 / 14 / 56 ms; NLI por lote p50 / p95 12,1 / 13,9 ms (2 lotes); pico de RSS 6987,8 MiB.

## Repetición de la segunda ronda (implementador)

`fx-rn23` repetida con Ollama propio en el puerto 11436 (ctx 8192, apagado al terminar): `salida_mostrada_nivel_a` = 0, `salida_mostrada_nivel_b` = 1, `campos_mostrados` = [`rationale` / `b-recommend`], propuesta cruda A = 5 y B = 1; `fidelidad.juez_llm.fidelidad` = `null` con `valor_informativo` 1,0 (estado `no_concluyente`); `rss_pico_proceso_mib` 10589,5. Su `hashConfig` (515ba253…) difiere porque `juez.muestra_minima` entra en la configuración. Marca de «no es baseline»: `validacion.rotulo = no_validada` en cada familia del JSON (el esquema cerrado no admite una nota libre).
