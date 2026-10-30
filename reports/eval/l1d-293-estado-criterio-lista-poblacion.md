# Evaluación de IA · l1d-293-estado-criterio-lista-poblacion (L1D-293, US-243)

> Reporte de ai-eval-runner (Gate 2, re-ejecución sobre 43470e9c, 2026-10-30); copiado por el implementador; las cifras no son una medición del implementador.

**Veredicto: PASS.**

## Corridas

Corridas en worktrees aislados de la rama (43470e9c) y de origin/main (20527185), proveedor fake:

- `python -m app.evaluation.evaluate --config eval/configs/test-fake.yaml --suite all --report json` (rc 0 en ambos).
- `python -m app.evaluation.evaluate --config eval/configs/test-aplicabilidad.yaml --suite aplicabilidad --report json` (rc 0).

## Suite all

- JSON idéntico byte a byte a `data/evaluation/baseline.json` y a main; Δ = 0 en todas las métricas.
- Salidas prescriptivas mostradas: 0.
- Con adapters falsos, citas 0,80 y fidelidad 0,75 quedan bajo la meta de 0,90 y están rotuladas `no_validada` (baseline vigente).

## Suite aplicabilidad

Hash de config 3c940c21…, catálogo test-apl-1.0.0, FX-08b-a, corte 2026-10-16. JSON idéntico al de main.

| Métrica | Valor | Meta | Estado |
|---|---|---|---|
| concordancia_de_estados | 41/41 = 1,00 | — | — |
| exactitud_extraido_verificado | 19/20 = 0,95 | ≥ 0,95 | en meta |
| cobertura_poblacion | 7/10 = 0,70 | 0,90 | fuera de meta, igual que en main y en `reports/eval/l1d-244-eval-aplicabilidad-metadatos.md` |
| criterios_coincide_sin_cita | 0 | — | — |
| valores_paciente_no_copiados | 0 | — | — |

Omitidas: 2 (am1-a2-sin-soporte, am1-a2-cita-ajena; quedan Desconocido).

## Cruce código/dataset del par am1-a1

Estadio de A-M1 × doc-a1 → desconocido con causa `sin_regla_de_comparacion`:

- Código de main con el `pares.yaml` de la rama: 40/41 = 0,976 (am1-a1 discrepa, como debe).
- Código de la rama con su `pares.yaml`: 41/41.

## Versiones

Modelo fake (fake-bow@1, fake-guion@1, fake-nli@1, fake-lexical@1); prompt rag-query@0.4.0 sin cambio; catálogo 2026.10.0 (all) y test-apl-1.0.0 (aplicabilidad); corpus rel-fx-t5a-a-1 con corte 2026-10-16; umbral NLI 0,7; relevancia 0,3.

## No ejecutado por el guardián

- pytest de la rama; suites con LLM o proveedor local; `--sweep`, `--prueba-final` y el juez.
- Las rutas nuevas con otro dataset: `con_valor_textual` con sinónimos o escala, `_recalculado` que conserva lo aceptado por texto, `disenosQueMezclan` y D-2. Hueco de medición: ningún catálogo de evaluate trae `poblacion-reglas.json`. Al crear la deuda 1.1, añadir un catálogo con ese archivo y un par con restricción explícita.
