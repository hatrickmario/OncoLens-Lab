# Baseline manual de VM-1 y VM-2 — S1

> **SIMULACIÓN ACADÉMICA DE ENTRADA — no son mediciones con oncólogos.**
> Las 12 sesiones de `eval/vm/baseline-S1.csv` son una simulación: el repositorio no permite confirmar que se entregaron PDFs, que hubo sesiones humanas, que las justificaciones se guardaron fuera del repo ni que se hizo la validación ciega de VM-2 (la columna `validada` no tiene evaluador independiente).
> Estas medianas **solo comprueban la mecánica del cálculo**. No deben usarse para comparar con OncoLens, para fijar metas ni como evidencia de VM-1/VM-2 (DEC-02). Las sesiones reales con los oncólogos asesores siguen pendientes en L1D-281 (ARR-05) y la cohorte real se mide después de G-Piloto (US-152).
> Reporte generado con `python -m app.evaluation.vm baseline --fecha 2026-10-18` (dos ejecuciones con la misma fecha dieron salidas idénticas byte a byte); este aviso se añadió a mano debajo del título y no lo regenera el CLI.

Fecha: 2026-10-18

## Cohorte sintética

La cohorte real se mide después de G-Piloto (US-152) y se reporta por separado de esta.

Leyenda de roles: O1 = Oncólogo asesor A, O2 = Oncólogo asesor B

Sesiones: 12 · casos: 6 · participantes: 2
Tiempo máximo por tarea: 30 min (VM_SESSION_MAX_MINUTES); la tarea no completada cuenta con el tiempo máximo.

Declaración: metas no modificadas; criterio de éxito enmendado en DEC-02 [S1 resp. 27].
SHA-256 de DEC-02: `323db706cef4ecc15f534e5c449d673d482d3cfbd0c4c8f4b63952a95ccc56d4`

## Checklists de reconstrucción

| Caso | Versión | Fecha de validación clínica |
|---|---|---|
| mama-01 | 1.0 | 2026-10-18 |
| mama-02 | 1.0 | 2026-10-18 |
| mama-03 | 1.0 | 2026-10-18 |
| prostata-01 | 1.0 | 2026-10-18 |
| prostata-02 | 1.0 | 2026-10-18 |
| prostata-03 | 1.0 | 2026-10-18 |

## VM-1 · tiempo para reconstruir el caso

| Tipo | Mediana (min) |
|---|---|
| mama | 20,5 |
| prostata | 23,0 |
| total | 21,0 |

## VM-2 · tiempo hasta evidencia aplicable (autoidentificada)

| Tipo | Mediana (min) |
|---|---|
| mama | 27,0 |
| prostata | 28,5 |
| total | 28,5 |

## VM-2 · tiempo hasta evidencia aplicable (validada, base de la meta de DEC-02)

| Tipo | Mediana (min) |
|---|---|
| mama | 27,0 |
| prostata | 28,5 |
| total | 28,5 |

## Tareas no completadas

- VM-1 · mama-02 · O2
- VM-1 · prostata-01 · O2
- VM-2 · mama-02 · O1
- VM-2 · mama-02 · O2
- VM-2 · mama-03 · O2
- VM-2 · prostata-01 · O1
- VM-2 · prostata-01 · O2
- VM-2 · prostata-03 · O2
