## ai-eval-runner · feat/l1d-297-demo-datos-levantar-verificacion (7587b590) · suite all + aplicabilidad (adapters falsos, Gate 2 acotado)
Veredicto: PASS (determinista; mediciones con LLM real pendientes y trasladables)

Configuración: `eval/configs/test-fake.yaml` (all) y `test-aplicabilidad.yaml`; sin LLM, sin red. Rama = merge-base 74f59748 + 44 archivos (la rama va 25 commits detrás de main).

| Métrica | Baseline | Rama | Meta | Δ | Estado |
|---|---|---|---|---|---|
| Reporte `all` completo (153 campos) vs `data/evaluation/baseline.json` | - | idéntico campo a campo | sin retroceso (tolerancia 0) | 0 | OK |
| recall@10 / MRR (total, n=4) | 1,0 / 1,0 | 1,0 / 1,0 | ≥0,80 / ≥0,60 | 0 | OK |
| "sin evidencia" exactitud (n=6); violaciones RN-02 | 1,0; 0 | 1,0; 0 | ≥0,90; 0 | 0 | OK (no_validada) |
| Salidas prescriptivas mostradas | 0 | 0 | 0 | 0 | OK |
| Aplicabilidad: concordancia de estados | main 41/41 | 41/41 = 1,0 | - | 0 | OK |
| Aplicabilidad: criterios Coincide sin cita | main 0 | 0 | 0 | 0 | OK |
| Aplicabilidad rama vs main (79 campos) | - | solo difiere hashConfig (versión de catálogo 1.2.0) | - | - | OK |
| Catálogo: vitest scripts/catalog + clinical-catalogs | - | 162/162, 10 archivos | - | - | OK |
| `catalog:version-guard` | - | OK 1.2.0 | - | - | OK |
| Validador de catálogo (incl. poblacion-reglas schema) | - | sin errores | - | - | OK |
| pytest -k aplicab/sin_evidencia/poblacion/catalogo | - | 609 passed | - | - | OK |
| pytest test_poblacion_seed.py | - | 10/10 (no inventar valores / seed verificado) | - | - | OK |

Regresiones: ninguna atribuible a la rama. Nota: `main` HEAD actual da `terminos_prohibidos.atribucion.con_formula` = 5 frente a 0 del baseline y de la rama (probablemente por commits de main posteriores al merge-base; ajeno a este change, a revisar en main).
Versiones: modelo n/a (adapters falsos) · prompt sin cambios · catálogo 1.2.0 (manifest) · corpus sin cambios · umbral sin cambios.

Pendiente trasladable (no bloquea): medición con LLM real de que las nuevas reglas de población (mama/próstata `poblacion-reglas.json`, sinónimos) no alteren la extracción ni la aplicabilidad textual en `evaluate` con modelos locales, y precisión de citas/fidelidad con las dos respuestas de ejemplo `demo-s4-*`. Por la naturaleza determinista de las reglas puras, el riesgo es bajo.
Crudos: `reports/eval/l1d-297-demo-datos-levantar-verificacion/` (rama-all.json, rama-aplicabilidad.json, main-aplicabilidad.json).
