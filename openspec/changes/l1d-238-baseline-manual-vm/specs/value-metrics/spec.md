## ADDED Requirements

### Requirement: Casos sintéticos estandarizados para el baseline de VM-1 y VM-2
El repositorio SHALL contener en `data/evaluation/vm-baseline/` al menos 6 casos sintéticos estandarizados (al menos 3 de mama y 3 de próstata), cada uno con sus documentos sintéticos, su pregunta de referencia (VM-2) y el checklist de "caso reconstruido" del Discovery P1 (VM-1), descritos en un `manifest.json` que declara `clase: sintetico`. Los casos MUST NOT contener datos reales de pacientes ni identificadores (RN-13, RN-14).

#### Scenario: El manifiesto lista seis casos sintéticos completos [US-075 AC-1] [AC-T5.2] [DEC-02]
- **WHEN** se lee `data/evaluation/vm-baseline/manifest.json`
- **THEN** declara `clase: sintetico`, lista ≥ 6 casos con ≥ 3 `tipo_cancer = mama` y ≥ 3 `tipo_cancer = prostata`, y cada caso referencia ≥ 1 documento existente, una `pregunta_referencia` no vacía y un `checklist_reconstruccion` con los ítems diagnóstico, estadio, biomarcadores relevantes, tratamientos previos y línea actual

#### Scenario: El chequeo de clase de datos de la CI acepta los casos [US-075 AC-1] [RN-13]
- **WHEN** el chequeo de datasets de la CI (US-036 AC-5) recorre `data/evaluation/vm-baseline/`
- **THEN** pasa porque el manifiesto más cercano declara `clase: sintetico`

### Requirement: Registro validado de las sesiones del baseline manual
`evaluate-vm baseline` SHALL aceptar en `eval/vm/baseline-S1.csv` solo filas válidas: una por caso y participante, participante con seudónimo `O<n>`, caso del manifiesto, tiempos positivos y condición `manual`. Ante una fila inválida MUST terminar con código ≠ 0 nombrando fila y regla, sin reproducir el valor rechazado ni escribir el reporte.

#### Scenario: Un registro válido produce una fila por caso y participante [US-075 AC-2] [VM-1] [VM-2]
- **WHEN** se ejecuta `evaluate-vm baseline` sobre un CSV de prueba con 6 casos y los participantes `O1` y `O2`
- **THEN** el comando acepta las 12 filas y el reporte informa 12 sesiones, 6 casos y 2 participantes

#### Scenario: Un participante que no es un seudónimo se rechaza sin repetir el valor [US-075 AC-2] [RN-14] (asumido)
- **WHEN** una fila tiene en `participante` un valor que no cumple `O<n>` (por ejemplo, un nombre)
- **THEN** el comando termina con código ≠ 0, el mensaje nombra la fila y la regla "participante debe ser un seudónimo O<n>", no contiene el valor rechazado y no se escribe `eval/vm/baseline-S1.md`

#### Scenario: Un tiempo ausente o un caso desconocido se rechaza [US-075 AC-2] (asumido)
- **WHEN** una fila tiene `tiempo_evidencia_min` vacío o un `caso` que no está en el manifiesto
- **THEN** el comando termina con código ≠ 0 nombrando la fila y la columna, y no escribe el reporte

#### Scenario: Una tarea que alcanza el tiempo máximo se cuenta aparte [US-075 AC-2] [RN-22] (asumido)
- **WHEN** una fila tiene `completado = no` y su tiempo igual a `VM_SESSION_MAX_MINUTES` de la configuración
- **THEN** la fila se acepta, entra en la mediana con el tiempo máximo y el reporte la lista en "tareas no completadas"

### Requirement: El CSV del baseline solo admite las columnas declaradas
`evaluate-vm baseline` SHALL aceptar en `eval/vm/baseline-S1.csv` solo las columnas declaradas en la plantilla (`participante`, `caso`, `condicion`, `tiempo_reconstruccion_min`, `tiempo_evidencia_min`, `completado`) y MUST NOT registrar la fecha de cada sesión. Ante una columna no declarada MUST terminar con código ≠ 0 nombrando la columna, sin reproducir su contenido ni escribir el reporte.

#### Scenario: Una columna no declarada se rechaza sin leer filas [US-075 AC-2] [RN-14]
- **WHEN** el CSV trae, además de las columnas declaradas, una columna `notas` con texto libre o una columna `fecha_sesion`
- **THEN** el comando termina con código ≠ 0 nombrando la columna no declarada, el mensaje no contiene ningún valor de esa columna y no se escribe `eval/vm/baseline-S1.md`

### Requirement: Cálculo reproducible de las medianas de VM-1 y VM-2
`evaluate-vm baseline` SHALL calcular la mediana de VM-1 (tiempo de reconstrucción) y de VM-2 (tiempo hasta evidencia aplicable) por tipo de cáncer y en total, de forma determinista: con el mismo CSV, el mismo manifiesto y la misma fecha, dos ejecuciones MUST producir un reporte idéntico byte a byte. La fecha del reporte MUST inyectarse (`--fecha`), sin leer el reloj dentro del cálculo.

#### Scenario: Medianas por tipo de cáncer y total [US-075 AC-3] [FR-20] [M-02.5]
- **WHEN** se ejecuta `evaluate-vm baseline` sobre el CSV de prueba con tiempos de reconstrucción de mama 40, 50, 60 y de próstata 30, 45, 55 min para un participante
- **THEN** el reporte trae mediana de VM-1 mama 50, próstata 45 y total 47,5 min, y el mismo cálculo para VM-2

#### Scenario: Dos ejecuciones dan el mismo resultado [US-075 AC-3] [FR-20]
- **WHEN** se ejecuta dos veces `evaluate-vm baseline --fecha 2026-10-20` con las mismas entradas
- **THEN** los dos `eval/vm/baseline-S1.md` son idénticos byte a byte

### Requirement: Reporte del baseline con metas de DEC-02 sin modificar y cohorte sintética
El reporte `eval/vm/baseline-S1.md` SHALL incluir su fecha, el rótulo "cohorte sintética", la leyenda de roles anónimos (`O1 = Oncólogo asesor A`…), la huella SHA-256 de `docs/decisions/DEC-02-protocolo-vm.md` y la declaración "Las metas de DEC-02 no se modificaron" (R-15), y SHALL indicar que la cohorte real se mide después de G-Piloto. El reporte MUST NOT contener nombres de oncólogos ni de pacientes.

#### Scenario: El reporte declara las metas congeladas y la huella de DEC-02 [US-075 AC-4] [AC-T5.2] [R-15]
- **WHEN** se genera el reporte con `--fecha` anterior al cierre del S1
- **THEN** `eval/vm/baseline-S1.md` contiene esa fecha, la frase "Las metas de DEC-02 no se modificaron" y el SHA-256 del archivo de DEC-02 leído en la ejecución

#### Scenario: El reporte se rotula como cohorte sintética [US-075 AC-5] [DEC-02] (asumido)
- **WHEN** se publica el reporte
- **THEN** sus resultados aparecen bajo el encabezado "Cohorte sintética" y una nota indica que la cohorte real se mide después de G-Piloto (US-152)

Regresión [RN-14] activa desde S6 (US-152 AC-4): el CSV de la cohorte real vive fuera del repo (`VM_REAL_DATA_PATH`).
