# value-metrics Specification

## Purpose
Métricas de valor del MVP: los casos sintéticos, el checklist de reconstrucción, el registro de sesiones y el cálculo reproducible del baseline manual de VM-1 y VM-2 según el protocolo de DEC-02, sin datos reales (RN-13, RN-14).

## Requirements

### Requirement: Casos sintéticos estandarizados para el baseline de VM-1 y VM-2
El repositorio SHALL contener en `data/evaluation/vm-baseline/` ≥ 6 casos sintéticos (≥ 3 de mama, ≥ 3 de próstata), cada uno con documentos, pregunta de referencia (VM-2) y checklist de "caso reconstruido" (VM-1), descritos en un `manifest.json` con `clase: sintetico`. Los casos MUST NOT contener datos reales ni identificadores (RN-13, RN-14), tampoco tras la validación clínica `[S1 resp. 26]` (A2).

#### Scenario: El manifiesto lista seis casos sintéticos completos [US-075 AC-1] [AC-T5.2] [DEC-02]
- **WHEN** se lee `data/evaluation/vm-baseline/manifest.json`
- **THEN** declara `clase: sintetico`, lista ≥ 6 casos con ≥ 3 `tipo_cancer = mama` y ≥ 3 `tipo_cancer = prostata`, y cada caso referencia ≥ 1 documento existente, una `pregunta_referencia` y un `checklist_reconstruccion` válidos según los requisitos de este change

#### Scenario: El chequeo de clase de datos de la CI acepta los casos [US-075 AC-1] [RN-13]
- **WHEN** el chequeo de datasets de la CI (US-036 AC-5) recorre `data/evaluation/vm-baseline/`
- **THEN** pasa porque el manifiesto más cercano declara `clase: sintetico`

### Requirement: Checklist de reconstrucción con elementos críticos y complementarios
Cada `checklist_reconstruccion` SHALL separar `criticos` de `complementarios` y guardar `version` y `fecha_validacion_clinica` (AAAA-MM-DD) `[S1 resp. 26]` (A3); `criticos` MUST cubrir diagnóstico, TNM o estadio a la fecha, biomarcadores, intención terapéutica, secuencia previa y línea actual (A2). "Reconstruido" exige todos los críticos. `evaluate-vm baseline` MUST validar el manifiesto antes del CSV y, si es inválido, terminar con código ≠ 0 nombrando caso y regla, sin escribir el reporte.

#### Scenario: Un checklist sin la separación o sin fecha de validación clínica se rechaza [US-075 AC-1] [DEC-02] [S1 resp. 26]
- **WHEN** un caso del manifiesto tiene un `checklist_reconstruccion` sin `criticos`, sin `complementarios`, sin `version` o sin `fecha_validacion_clinica` con formato AAAA-MM-DD
- **THEN** el comando termina con código ≠ 0 nombrando el caso y la regla incumplida, y no escribe `eval/vm/baseline-S1.md`

#### Scenario: Un checklist cuyos críticos no cubren los ejes de coherencia longitudinal se rechaza [US-075 AC-1] [S1 resp. 26]
- **WHEN** los `criticos` de un caso no incluyen alguno de diagnóstico, TNM o estadio a la fecha, biomarcadores, intención terapéutica, secuencia previa o línea actual
- **THEN** el comando termina con código ≠ 0 nombrando el caso y el eje faltante, y no escribe el reporte

### Requirement: Pregunta de referencia de VM-2 completa y separada de la demo
Cada `pregunta_referencia` del manifiesto SHALL declarar `poblacion`, `contexto_clinico`, `decision` y `fecha_corte_evidencia` (AAAA-MM-DD), además del `texto` que se lee al participante, que MUST incluir la fecha de corte `[S1 resp. 26]` (A4). La pregunta de referencia es propia del baseline y MUST NOT confundirse con la pregunta de la demo del S1 (`Q-HER2`, que no cambia).

#### Scenario: Una pregunta de referencia incompleta se rechaza [US-075 AC-1] [VM-2] [S1 resp. 26]
- **WHEN** una `pregunta_referencia` no declara alguno de `poblacion`, `contexto_clinico`, `decision` o `fecha_corte_evidencia`, o su `texto` no contiene la fecha de corte
- **THEN** el comando termina con código ≠ 0 nombrando el caso y el campo, y no escribe el reporte

### Requirement: Registro validado de las sesiones del baseline manual
`evaluate-vm baseline` SHALL aceptar en `eval/vm/baseline-S1.csv` solo filas válidas: una por caso y participante, seudónimo `O<n>`, caso del manifiesto, condición `manual` y, por tarea (VM-1 y VM-2 por separado), un tiempo positivo ≤ `VM_SESSION_MAX_MINUTES` (30 min, `[S1 resp. 26]` A1); la tarea que alcanza el máximo queda no completada. Ante una fila inválida MUST terminar con código ≠ 0 nombrando fila y regla, sin repetir el valor ni escribir el reporte.

#### Scenario: Un registro válido produce una fila por caso y participante [US-075 AC-2] [VM-1] [VM-2]
- **WHEN** se ejecuta `evaluate-vm baseline` sobre un CSV de prueba con 6 casos y los participantes `O1` y `O2`
- **THEN** el comando acepta las 12 filas y el reporte informa 12 sesiones, 6 casos y 2 participantes

#### Scenario: Un participante que no es un seudónimo se rechaza sin repetir el valor [US-075 AC-2] [RN-14] (asumido)
- **WHEN** una fila tiene en `participante` un valor que no cumple `O<n>` (por ejemplo, un nombre)
- **THEN** el comando termina con código ≠ 0, el mensaje nombra la fila y la regla "participante debe ser un seudónimo O<n>", no contiene el valor rechazado y no se escribe `eval/vm/baseline-S1.md`

#### Scenario: Un tiempo ausente o un caso desconocido se rechaza [US-075 AC-2] (asumido)
- **WHEN** una fila tiene `tiempo_evidencia_min` vacío o un `caso` que no está en el manifiesto
- **THEN** el comando termina con código ≠ 0 nombrando la fila y la columna, y no escribe el reporte

#### Scenario: Un tiempo por encima del máximo por tarea se rechaza [US-075 AC-2] [RN-22] [S1 resp. 26]
- **WHEN** una fila tiene `tiempo_reconstruccion_min` o `tiempo_evidencia_min` mayor que `VM_SESSION_MAX_MINUTES` (30)
- **THEN** el comando termina con código ≠ 0 nombrando la fila y la columna, sin repetir el valor, y no escribe el reporte

#### Scenario: Una tarea que alcanza el tiempo máximo cuenta como no completada [US-075 AC-2] [RN-22] [S1 resp. 26]
- **WHEN** una fila tiene `tiempo_reconstruccion_min = 30` y `reconstruido = no`, con `tiempo_evidencia_min` menor que 30
- **THEN** la fila se acepta, VM-1 entra en la mediana con el tiempo máximo y figura en "tareas no completadas", y VM-2 de la misma fila se evalúa por separado

#### Scenario: "Reconstruido" exige el tiempo dentro del máximo [US-075 AC-2] [S1 resp. 26]
- **WHEN** una fila tiene `reconstruido = si` y `tiempo_reconstruccion_min = VM_SESSION_MAX_MINUTES`
- **THEN** el comando termina con código ≠ 0 nombrando la fila y la regla "una tarea que alcanza el máximo queda no completada"

### Requirement: Dos desenlaces de VM-2, autoidentificada y validada a ciegas
Cada intento de VM-2 SHALL registrar dos desenlaces `[S1 resp. 27]` (A5): `autoidentificada` (≥ 1 fuente con justificación breve; solo se guarda `si`/`no` y `fuente_id`, nunca la justificación) y `validada` (`si`/`no`, por un evaluador posterior, ciego al tiempo y al participante). `validada = si` MUST exigir `autoidentificada = si` y `fuente_id`; `fuente_id` MUST cumplir `VM_SOURCE_ID_PATTERN`; un mismo par caso–fuente MUST tener el mismo veredicto; `validada` vacío MUST impedir el reporte.

#### Scenario: Una validación incoherente o pendiente se rechaza [US-075 AC-2] [S1 resp. 27]
- **WHEN** una fila tiene `validada = si` con `autoidentificada = no`, o `validada` vacío, o el mismo par caso–fuente aparece con `validada = si` en una fila y `no` en otra
- **THEN** el comando termina con código ≠ 0 nombrando la fila y la regla, y no escribe el reporte

#### Scenario: Un fuente_id con texto libre se rechaza sin repetirlo [US-075 AC-2] [RN-14] [S1 resp. 27]
- **WHEN** una fila trae en `fuente_id` un valor con espacios o fuera de `VM_SOURCE_ID_PATTERN`
- **THEN** el comando termina con código ≠ 0 nombrando la fila y la columna, el mensaje no contiene el valor y no se escribe el reporte

### Requirement: Lista de pares para la validación ciega de VM-2
`evaluate-vm pares-validacion` SHALL producir para el evaluador la lista de pares (`caso`, `pregunta_referencia.texto`, `fuente_id`) únicos y ordenados por caso y fuente, MUST NOT incluir tiempos, participantes, desenlaces ni el orden de registro `[S1 resp. 27]` (A5).

#### Scenario: La lista de pares para el evaluador no revela tiempo ni participante [US-075 AC-2] [S1 resp. 27]
- **WHEN** se ejecuta `evaluate-vm pares-validacion` sobre un CSV donde `O1` y `O2` citan la misma fuente en `mama-01`
- **THEN** la salida trae ese par una sola vez, ordenada por caso y fuente, y no contiene columnas de tiempo, participante ni desenlace

### Requirement: El CSV del baseline solo admite las columnas declaradas
`evaluate-vm baseline` SHALL aceptar solo las columnas de la plantilla (`participante`, `caso`, `condicion`, `tiempo_reconstruccion_min`, `reconstruido`, `tiempo_evidencia_min`, `autoidentificada`, `fuente_id`, `validada`) y MUST NOT registrar la fecha de cada sesión ni texto libre (la justificación de VM-2 no se versiona, `[S1 resp. 27]`). Ante una columna no declarada MUST terminar con código ≠ 0 nombrando la columna, sin repetir su contenido ni escribir el reporte.

#### Scenario: Una columna no declarada se rechaza sin leer filas [US-075 AC-2] [RN-14]
- **WHEN** el CSV trae, además de las columnas declaradas, una columna `notas` con texto libre, una `justificacion` o una `fecha_sesion`
- **THEN** el comando termina con código ≠ 0 nombrando la columna no declarada, el mensaje no contiene ningún valor de esa columna y no se escribe `eval/vm/baseline-S1.md`

### Requirement: Cálculo reproducible de las medianas de VM-1 y VM-2
`evaluate-vm baseline` SHALL calcular la mediana de VM-1 y de VM-2 por tipo de cáncer y en total; una tarea no completada entra con `VM_SESSION_MAX_MINUTES`. Con las mismas entradas y `--fecha` (sin leer el reloj), dos ejecuciones MUST dar un reporte idéntico byte a byte. VM-2 SHALL tener dos medianas: **autoidentificada** (completado si `autoidentificada = si`) y **validada** (solo si `validada = si`); la meta de DEC-02 (−50 %) se calcula sobre la validada `[S1 resp. 27]`.

#### Scenario: Medianas por tipo de cáncer y total [US-075 AC-3] [FR-20] [M-02.5]
- **WHEN** se ejecuta `evaluate-vm baseline` sobre el CSV de prueba con tiempos de reconstrucción de mama 10, 20, 30 (este último no reconstruido) y de próstata 12, 18, 25 min para un participante
- **THEN** el reporte trae mediana de VM-1 mama 20, próstata 18 y total 19 min, y el mismo cálculo para VM-2

#### Scenario: VM-2 informa la mediana autoidentificada y la validada [US-075 AC-3] [VM-2] [S1 resp. 27]
- **WHEN** en el CSV de prueba los intentos de VM-2 de mama tienen tiempos 10, 15, 20 con `autoidentificada = si` en los tres y `validada = si` solo en el de 10
- **THEN** el reporte trae para mama la mediana autoidentificada 15 y la validada 30 (los dos no validados cuentan como no completados con el tiempo máximo), y rotula la validada como la base de la meta de DEC-02

#### Scenario: Dos ejecuciones dan el mismo resultado [US-075 AC-3] [FR-20]
- **WHEN** se ejecuta dos veces `evaluate-vm baseline --fecha 2026-10-20` con las mismas entradas
- **THEN** los dos `eval/vm/baseline-S1.md` son idénticos byte a byte

### Requirement: Reporte del baseline con metas de DEC-02 sin modificar y cohorte sintética
`eval/vm/baseline-S1.md` SHALL incluir su fecha, el rótulo "cohorte sintética", la leyenda `O1 = Oncólogo asesor A`…, el SHA-256 de `docs/decisions/DEC-02-protocolo-vm.md`, versión y fecha de validación clínica de cada checklist, las dos medianas de VM-2, la declaración "metas no modificadas; criterio de éxito enmendado en DEC-02 [S1 resp. 27]" (R-15) y que la cohorte real se mide tras G-Piloto. MUST NOT contener nombres ni justificaciones de VM-2.

#### Scenario: El reporte declara las metas congeladas, el criterio enmendado y la huella de DEC-02 [US-075 AC-4] [AC-T5.2] [R-15] [S1 resp. 27]
- **WHEN** se genera el reporte con `--fecha` anterior al cierre del S1
- **THEN** `eval/vm/baseline-S1.md` contiene esa fecha, la frase "metas no modificadas; criterio de éxito enmendado en DEC-02 [S1 resp. 27]", el SHA-256 del archivo de DEC-02 leído en la ejecución y la versión y fecha de validación clínica del checklist de cada caso

#### Scenario: El reporte se rotula como cohorte sintética [US-075 AC-5] [DEC-02] (asumido)
- **WHEN** se publica el reporte
- **THEN** sus resultados aparecen bajo el encabezado "Cohorte sintética" y una nota indica que la cohorte real se mide después de G-Piloto (US-152)

Regresión [RN-14] activa desde S6 (US-152 AC-4): el CSV de la cohorte real vive fuera del repo (`VM_REAL_DATA_PATH`).
