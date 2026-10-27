# ai-eval-runner · feat/l1d-244-eval-aplicabilidad-metadatos · suite aplicabilidad (+ no regresión de `all`)

Veredicto: **PASS** (sin regresiones; la cobertura 0,70 queda fuera de meta por diseño del fixture y se reporta sin fallar, ver límites)

JSON crudo de la familia: `reports/eval/l1d-244-eval-aplicabilidad-metadatos.json` (agregados de `evaluate --suite aplicabilidad`).

## 1. No regresión de las familias existentes (`--suite all`)

| Comprobación | Resultado |
|---|---|
| Reporte `all` vs `data/evaluation/baseline.json` (`cmp`) | Idénticos byte a byte |
| Comparador de regresión (`compararConBaseline`, tolerancia 0,02) | 26 métricas: 24 iguales, 2 informativas, 0 regresiones |
| Cambio de modelo, prompt, umbral, catálogo real o corpus | Ninguno |

Nota: con adapters falsos la suite `all` da citas 0,80 y fidelidad 0,75, bajo la meta de 0,90 y rotuladas `no_validada`. Es el baseline vigente, no una regresión (Δ = 0).

## 2. Familia `aplicabilidad`

Config `test-aplicabilidad` (hash `3c940c21…2331542fa`), dataset `aplicabilidad` v1, `claseDataset=sintetico`, proveedor `fake`, reloj simulado, catálogo `test-apl-1.0.0`.

| Métrica | Baseline | Rama | Meta | Δ | Estado |
|---|---|---|---|---|---|
| Concordancia de estados (M-08.2) | n/a (familia nueva) | 41/41 = 1,00 | 41/41 esperado | n/a | OK |
| criterios_coincide_sin_cita (M-08.3) | n/a | 0 | 0 | n/a | OK |
| valores_paciente_no_copiados (M-08.4) | n/a | 0 | 0 | n/a | OK |
| omitidas | n/a | 2 | informativa | n/a | OK (pares am1-a2-sin-soporte y am1-a2-cita-ajena, NLI neutral/cita ajena, quedan Desconocido) |
| Cobertura de población (M-08.6, versión 2026-10-16) | n/a | 0,70 (7 de 10 vigentes) | 0,90 | n/a | FUERA DE META (informativa, código 0) |
| Exactitud extraído vs verificado | n/a | 0,95 (19/20 campos, 2 documentos, 0 pendientes) | 0,95 | n/a | EN META (muestra sintética) |

Salidas prescriptivas: 0 (no aplican a esta familia; `all` sin cambio).

## 3. Variantes que deben fallar (pytest `tests/evaluation/test_aplicabilidad_aceptacion.py`)

`pytest`: 20 passed. Cubren, entre otros:
- código 3 con un criterio en `coincide` sin cita (nombra la métrica);
- código 3 cuando el valor del paciente no es el del contexto;
- código 0 cuando ambas métricas valen 0;
- concordancia baja cuando el dataset espera otro estado;
- código 1 si el dataset no es sintético o el catálogo del corpus no está disponible; código 2 con clave no resuelta;
- cobertura nula/no medida y exactitud nula con causa sin fallar.

## Regresiones

Ninguna. Versiones: modelo `fake` (adapters falsos) · prompt sin cambio · catálogo `test-apl-1.0.0` (fixture; catálogo real sin cambio) · corpus sin cambio · umbral NLI 0,7 (sin cambio).

## Límites de la medición

- Adapters falsos: no mide calidad de ningún modelo real (pendiente US-233).
- Dataset de 8 pares / 41 criterios: la concordancia 41/41 verifica la lógica determinista y de verificación, no generaliza.
- Cobertura (10 vigentes, 7 con criterios) y exactitud (20 campos revisados) provienen de fixtures sintéticos; el 0,70 fuera de meta es el valor del fixture, no del corpus real.
- Las metas de la familia son las iniciales (TBD-02), a recalibrar.
- Nota de proceso: el worktree tenía `openspec/changes/l1d-244-eval-aplicabilidad-metadatos/tasks.md` modificado sin commitear antes de mi ejecución; no lo toqué.
