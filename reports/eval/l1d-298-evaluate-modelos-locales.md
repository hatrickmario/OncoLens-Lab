# Reporte de ai-eval-runner (Gate 2, sobre ee31d9fa, 2026-10-30); copiado por el implementador; no es una medición del implementador

Change `l1d-298-evaluate-modelos-locales` (US-233a). Contenido copiado del reporte que entregó `ai-eval-runner`; las cifras de la sección «Repetición de la segunda ronda» las añadió el implementador y están marcadas.

## Veredicto

**PASS para el gate de CI** (suite con adaptadores falsos; baseline sin cambios; Δ = 0). Dos resultados negativos de las mediciones reales quedan abiertos para el refinamiento (AC-2 y AC-7).

## Entorno de la verificación

- Worktrees de la rama y de `origin/main` (86d943bd); venv `~/.venvs/oncolens-adr39`; sin Compose; sin LLM real; Ollama del usuario intacto.
- `evaluate test-fake --suite all` y `test-aplicabilidad --suite aplicabilidad`: exit 0.
- El JSON de la rama es idéntico byte a byte al de `main` y a `data/evaluation/baseline.json` (`hashConfig` 57b8a05d…); `data/evaluation/baseline.json` no cambia; Δ = 0.
- `hashConfig` de los reportes reales verificado: `fx-t5a-a` 0c2b587d… y `fx-rn23` 716f82c1… con el puerto 11436; con el 11434 versionado da 0649f0a3….
- Las cifras de `design.md` coinciden con los JSON. n = 6 y 4; todo `no_validada`.
- Juez: rótulo `secundaria`, estado `no_concluyente`, `acuerdo_con_humano` `sin_medir`.
- Versiones: modelo `gemma4:26b-a4b-it-q4_K_M`, prompt `rag-query@0.4.0`, catálogo 2026.10.0, corpus `rel-fx-t5a-a-1` y `rel-fx-rn23-1`, umbrales 0,30 y 0,7.

## Resultado negativo 1 (AC-2, lenguaje)

Fixture adversarial `fx-rn23`: **1 salida mostrada de nivel B** (`b-recommend`); el filtro de producción cubre solo el nivel A; n = 4, sin repetición. La propuesta cruda trae 6 campos con términos de la lista (A = 5, B = 1) que copian el corpus citado.

## Resultado negativo 2 (AC-7, RSS)

RSS 8840,5 / 6987,8 / 8753,5 MiB frente a 4489 (suma de tres RSS medidos por separado en ADR-39). Conversión de `ru_maxrss` correcta; es el pico histórico durante la carga de los modelos; `rss_en_regimen` es `null` en macOS. Estimación del evaluador: LLM ≈ 17 GB + pico de Python ≈ 8,8 GB ≈ 26 GB antes de PostgreSQL, Milvus, MinIO ×2, clinical-api, web y SO. **4489 MiB no debe usarse como `mem_limit` de contenedor.** Por medir: RSS en régimen y presión de memoria en el MacBook de 32 GB con el stack completo.

## Juez

Acuerdo juez↔NLI 0,667 (n = 9) y 0,5 (n = 2), con kappa 0 por juez constante. `JUEZ_ACUERDO_MINIMO` 0,8 sin calibrar.

## Hallazgos accionables

- AC-2 y AC-7 abiertos para el refinamiento.
- Tareas sin ID que deben asignarse: 1.8b, 1.9, 1.10 y 3.3.

## Repetición de la segunda ronda (implementador, no del reporte original)

`fx-rn23` repetida con Ollama propio en el puerto 11436 (ctx 8192, apagado al terminar): `salida_mostrada_nivel_a` = 0, `salida_mostrada_nivel_b` = 1, `campos_mostrados` = [`rationale` / `b-recommend`], propuesta cruda A = 5 y B = 1; `fidelidad.juez_llm.fidelidad` = `null` con `valor_informativo` 1,0 (estado `no_concluyente`); `rss_pico_proceso_mib` 10589,5 en esa corrida. La `hashConfig` de esa repetición (515ba253…) difiere porque `juez.muestra_minima` entra en la configuración. El `baseline.json` de la CI ganó las claves de lenguaje por nivel (valores 0; misma `hashConfig` de `test-fake.yaml`).
