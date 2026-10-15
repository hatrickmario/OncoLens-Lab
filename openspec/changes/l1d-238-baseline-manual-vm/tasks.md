# Tasks — l1d-238-baseline-manual-vm

> Historia de medición: el entregable es el protocolo aplicado, el registro de las sesiones y el cálculo
> reproducible. Las tareas marcadas **[humano]** las hace el usuario (PO) con los oncólogos asesores; nunca un
> agente. Sin datos reales ni nombres en el repo (RN-13, RN-14): seudónimos `O<n>` = "Oncólogo asesor A/B".

## ai-services

### 1. Casos y plantilla (datos sintéticos · test después; preparación al inicio del S1, `[S1 resp. 2]`)

- [ ] 1.1 `data/evaluation/vm-baseline/manifest.json` con `clase: sintetico` y los 6 casos (`mama-01…03`, `prostata-01…03`) · test después [US-075 AC-1] [RN-13]
- [ ] 1.2 Casos `mama-01` y `prostata-01` con el contenido de los pacientes semilla (a) y (b) de OL-01 (change de L1D-169) y la pregunta de referencia de la demo del S1 (change de L1D-140); `mama-02/03` y `prostata-02/03` con valores ficticios fijos y fechas relativas; cada caso con `documentos/*.md`, `pregunta_referencia` y `checklist_reconstruccion` (diagnóstico, estadio, biomarcadores relevantes, tratamientos previos, línea actual) · test después [US-075 AC-1] [DEC-02]
- [ ] 1.3 `docs/evaluation/vm-baseline-protocolo.md`: guion de sesión (condición manual, PDFs del caso exportados desde Markdown, herramientas permitidas sin NCCN ni ESMO, cronometraje de inicio y fin de VM-1 y VM-2, criterio de parada `VM_SESSION_MAX_MINUTES`), formato del CSV y regla de seudónimos; cita DEC-02 sin cambiar metas · exento [US-075 AC-2] [DEC-02] [R-15]
- [ ] 1.4 `eval/vm/baseline-S1.template.csv` (solo cabecera) y `eval/vm/baseline.json` (`VM_SESSION_MAX_MINUTES`, `VM_PARTICIPANT_PATTERN`) · test después [US-075 AC-2] [RN-22]
- [ ] 1.5 Comprobar (tras merge del change de L1D-166) que el escaneo de PII de la CI, con raíz `git ls-files`, ya cubre `eval/vm/` y `data/evaluation/vm-baseline/`; sin exclusiones ni allowlist nuevas · test después [RN-14]

### 2. Cálculo reproducible (`evaluate-vm baseline` · test después, matriz: script)

- [ ] 2.1 `app/evaluation/vm/dominio.py`: Extraer `validar_fila_sesion()` (cabecera = conjunto cerrado de columnas declaradas, sin fecha por sesión; seudónimo `O<n>`, caso del manifiesto, tiempos positivos, condición `manual`, sin duplicados caso+participante; el error nombra fila y regla, nunca el valor) y `medianas_por_tipo()` (VM-1 y VM-2 por tipo y total) · test después [US-075 AC-2, AC-3]
- [ ] 2.2 `app/evaluation/vm/reporte.py`: `renderizar_reporte()` con fecha inyectada, encabezado "Cohorte sintética", leyenda de roles, SHA-256 de DEC-02, "Las metas de DEC-02 no se modificaron", nota de cohorte real tras G-Piloto, tareas no completadas · test después [US-075 AC-4, AC-5]
- [ ] 2.3 `app/evaluation/vm/__main__.py`: subcomando `baseline` (`--csv`, `--manifest`, `--fecha`, `--out`), código ≠ 0 sin escribir reporte ante cualquier fila inválida; commit `feat(L1D-238)` · test después [US-075 AC-2, AC-3]
- [ ] 2.4 Pytest con CSV de prueba sintético en `tests/evaluation/vm/fixtures/` (sin `skip`/`xfail`): "calcula mediana de VM-1 mama 50, próstata 45 y total 47,5 cuando hay tres casos por tipo [US-075 AC-3]", "produce reportes idénticos byte a byte cuando se ejecuta dos veces con la misma fecha [US-075 AC-3]", "rechaza la fila sin repetir el valor cuando el participante no es un seudónimo O<n> [US-075 AC-2]", "rechaza el CSV nombrando la columna sin repetir su contenido cuando trae una columna no declarada como notas o fecha_sesion [US-075 AC-2]", "rechaza la fila cuando falta un tiempo o el caso no está en el manifiesto [US-075 AC-2]", "cuenta aparte la tarea no completada cuando alcanza VM_SESSION_MAX_MINUTES [US-075 AC-2]", "incluye huella de DEC-02, metas sin modificar y rótulo de cohorte sintética [US-075 AC-4, AC-5]", "el manifiesto declara clase sintetico con ≥ 3 casos por tipo y checklist completo [US-075 AC-1]"; commit `test(L1D-238)` · test después
- [ ] 2.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-238)`

### 3. Sesiones y entrega (semana 2 del S1)

- [ ] 3.1 **[humano]** Confirmar con los oncólogos, **antes de medir**, el checklist de "caso reconstruido" (VM-1) y las herramientas permitidas (VM-2), propuestas de DEC-02; registrar la confirmación en el protocolo sin tocar metas [DEC-02] [R-15]
- [ ] 3.2 **[humano]** Agendar y conducir las sesiones manuales (cada participante, los 6 casos); guardar fuera del repo la correspondencia nombre ↔ rol [US-075 AC-2] [SUP-4]
- [ ] 3.3 **[humano]** Registrar `eval/vm/baseline-S1.csv` con una fila por caso y participante (`O1`, `O2`…), sin nombres de oncólogos ni de pacientes [US-075 AC-2] [RN-14]
- [ ] 3.4 (Consentimiento de O1/O2 dado, `[S1 resp. 23]`: se versionan `baseline-S1.csv` y `baseline-S1.md` seudonimizados.) Ejecutar `python -m app.evaluation.vm baseline --fecha <fecha>` dos veces, comparar los reportes y versionar `eval/vm/baseline-S1.md` con fecha anterior a `/sprint-close` del S1 [US-075 AC-3, AC-4, AC-5]
- [ ] 3.5 **[humano]** Revisar el reporte en la *sprint review* del S1 (metas de DEC-02 sin modificar) [US-075 AC-4] [AC-T5.2]

## evaluación

- [ ] 4.1 OL-06 no aplica (sin cambios de modelo, prompt, umbral, catálogo ni corpus); `run-ai-eval` no se ejecuta

## Cierre

- [ ] 5.1 `openspec validate l1d-238-baseline-manual-vm --strict`
- [ ] 5.2 Pytest de `apps/rag-orchestrator` en verde; chequeos de clase de datos y PII de la CI en verde sobre `data/evaluation/vm-baseline/` y `eval/vm/`
