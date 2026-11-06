# demo-gate Specification

## Purpose
Verificación del gate G-Demo al cierre del S5 (US-142, PRD §14, E-17): el recorrido E2E de la hipótesis del MVP sobre el paciente del gate con seed sintético, las métricas de evaluación y su registro en `docs/gates/`.

## Requirements

### Requirement: Recorrido E2E de la hipótesis sobre el paciente del gate
El E2E `g-demo.spec.ts` MUST recorrer, contra Compose con seed sintético y sin errores, login → listado → ficha con una corrección de biomarcador → vista de caso con timeline y datos críticos → registro a mano de un faltante → análisis con hasta `maxOptions` opciones citadas → Base del análisis → 2 preguntas de seguimiento con citas. Sus aserciones SHALL ser estructurales, válidas con el LLM fingido y con el real.

#### Scenario: El doctor recorre la hipótesis de punta a punta [US-142 AC-1] [G-1] [PRD §14 G-Demo]
- **GIVEN** Compose con el seed sintético de la demo, `doc1@test.local` con su contraseña generada por `setup-secrets.sh` y el paciente del gate F-M2 (FX-G-DEMO: un biomarcador vigente corregible y ≥ 1 dato crítico `faltante` con acción manual; Decidido, usuario, 2026-11-03, `[S5 resp. 13]`)
- **WHEN** se ejecuta `g-demo.spec.ts`
- **THEN** el doctor inicia sesión, encuentra al paciente en el listado y abre su ficha
- **AND** corrige el biomarcador con «Corregir dato» → «Guardar mi corrección», ve el valor nuevo y el anterior en el histórico desplegable
- **AND** abre «Ver caso clínico» y ve la línea de tiempo con ≥ 1 evento y la columna «Datos críticos» con el faltante
- **AND** registra el faltante con su acción manual y la columna lo muestra presente tras recargar
- **AND** lanza el análisis, continúa con el aviso de faltantes si aparece (no bloquea, RN-26) y ve entre 1 y `maxOptions` opciones bajo «Opciones descritas en la evidencia», cada una con ≥ 1 cita, su resumen de aplicabilidad, sus avisos y el criterio de orden visible, más el aviso de IA y la etiqueta académica (RN-19)
- **AND** abre la Base del análisis
- **AND** la Base del análisis lista los faltantes como desconocido
- **AND** envía 2 preguntas de seguimiento y cada turno muestra ≥ 1 afirmación con ≥ 1 cita y el aviso de IA
- **AND** la consola no registra errores y toda petición del navegador va al origen de `web`

#### Scenario: El orden de las opciones respeta RN-28 sobre sus propios resúmenes [US-142 AC-1] [RN-28]
- **GIVEN** el análisis del recorrido con dos o más opciones
- **WHEN** el E2E lee los conteos de aplicabilidad mostrados
- **THEN** ninguna opción tiene más criterios excluyentes en «No coincide» que la siguiente y, a igualdad, ninguna tiene menos «Coincide» que la siguiente
- **AND** ninguna opción con la etiqueta «Población no comparable» precede a una sin ella (regla vigente de US-125 AC-2 + US-134 AC-4, la misma que verifica `no_comparable_al_final()` de `l1d-246`)

#### Scenario: Un paso que falla nombra el paso y deja traza [US-142 AC-1] (Decidido, usuario, 2026-11-03)
- **GIVEN** un paso del recorrido que no se cumple (por ejemplo, `clinical-api` responde `5xx` en la vista de caso)
- **WHEN** termina el E2E
- **THEN** falla con el nombre del paso (`test.step`) y la traza de Playwright, y `verify-g-demo` registra «G-Demo no superado» con ese paso

### Requirement: Métricas del gate frente a las metas iniciales
`verify-g-demo` MUST leer el reporte de la suite completa de `evaluate` con `eval/configs/s5.yaml` y comparar cada métrica con la meta de `metas-iniciales.yaml` (escenario de DEC-07), sin modificarla: G-2 = 100 % (M-10.1), G-14 = 0 (M-10.2) y cada métrica técnica en meta. Si alguna no lo está, el registro SHALL decir «G-Demo no superado» y nombrarla.

#### Scenario: Todas las métricas en meta [US-142 AC-2] [G-2] [G-14] [DEC-07]
- **GIVEN** un reporte con M-10.1 = 100 %, M-10.2 = 0 y las métricas técnicas en meta
- **WHEN** corre la verificación
- **THEN** el registro lista cada métrica con su valor, su meta, su origen (`metas-iniciales.yaml`) y cuántos casos validados y no validados la componen (AC-T5.3), y no la cuenta como fallo

#### Scenario: Una métrica fuera de meta hace fallar el gate y se nombra [US-142 AC-2] [M-10.1]
- **GIVEN** un reporte con M-10.1 = 96 % o con fidelidad por debajo de su meta
- **WHEN** corre la verificación
- **THEN** sale con código ≠ 0 y el registro dice «G-Demo no superado» y nombra la métrica, su valor y su meta

#### Scenario: Una métrica no medida se declara, salvo G-2 y G-14 [US-142 AC-2] [S5 resp. 4] (Decidido, usuario, 2026-11-03)
- **GIVEN** un reporte sin M-02.3 (FEAT-02c no construida) o sin una métrica técnica que solo mide el LLM real
- **WHEN** corre la verificación
- **THEN** el registro la lista como «no medida» con su motivo y no la cuenta como superada ni como fallo
- **AND** si falta M-10.1 o M-10.2, el gate falla con «G-Demo no superado» y la nombra

#### Scenario: Reporte ausente o de otra configuración [US-142 AC-2] (Decidido, usuario, 2026-11-03)
- **GIVEN** que no existe el reporte o su configuración no es `s5.yaml`
- **WHEN** corre la verificación
- **THEN** sale con código ≠ 0 y el registro dice «G-Demo no superado: reporte de evaluate ausente o de otra configuración»

### Requirement: El gate solo se supera con datos sintéticos
`verify-g-demo` MUST comprobar sobre la BD de la demo que el 100 % de `clinical.patient.data_origin` es `sintetico` y que la configuración efectiva de `clinical-api` y del seed tiene `REAL_ANONYMIZED_ENABLED` y `REAL_IDENTIFIED_ENABLED` en `false`; si no, el gate SHALL fallar. Solo lee conteos agregados con un rol sin superusuario y nunca imprime filas, identidad ni credenciales (RN-14).

#### Scenario: BD y configuración solo sintéticas [US-142 AC-3] [RN-13]
- **GIVEN** la BD de la demo con todos los pacientes `sintetico` y las dos variables en `false`
- **WHEN** corre la verificación
- **THEN** el registro trae «solo sintético: sí» con el conteo por `data_origin` y el valor de las dos variables, y la salida no contiene filas, nombres, documentos ni cadenas de conexión

#### Scenario: Un paciente no sintético hace fallar el gate [US-142 AC-3] [RN-13]
- **GIVEN** una BD de test con un paciente `real_anonimizado`
- **WHEN** corre la verificación
- **THEN** sale con código ≠ 0 y el registro dice «G-Demo no superado: datos no sintéticos» con el conteo agregado por `data_origin`, sin identificar al paciente

#### Scenario: Una variable de datos reales activa hace fallar el gate [US-142 AC-3] [RN-13]
- **GIVEN** la configuración de Compose con `REAL_ANONYMIZED_ENABLED=true`
- **WHEN** corre la verificación
- **THEN** sale con código ≠ 0 y el registro nombra la variable, sin otro valor de la configuración

#### Scenario: BD inaccesible [US-142 AC-3] (Decidido, usuario, 2026-11-03)
- **GIVEN** que la BD no responde o el rol de lectura no tiene permiso
- **WHEN** corre la verificación
- **THEN** sale con código ≠ 0 con «no se pudo verificar el origen de los datos» y nunca da por superado el gate

Regresión [RN-13] activa desde S6: el bloqueo de arranque con datos reales sin `preflight` es de US-143 (`real-data-gate`).

Regresión [RN-15] activa desde S6 (DEC-22): el `403` por opt-out de `analisis_ia` en toda generación con IA es de US-148 (G-Piloto); en el S5 solo hay datos sintéticos y ningún escenario del gate lo verifica (`[S5 resp. 8]`).

### Requirement: Excepciones y capacidades diferidas declaradas
El registro MUST listar, desde `docs/gates/g-demo-excepciones.json`, AC-T1.5 y AC-T3.3 como «se verifican en G-Piloto» y las capacidades diferidas por el slicing con su Feature y su sprint de destino, sin contarlas como fallos. Una excepción sin Feature ni destino SHALL hacer fallar la verificación.

#### Scenario: Excepciones listadas sin contar como fallo [US-142 AC-4] [PRD §14 G-Demo] [R-14]
- **GIVEN** el fichero de excepciones con AC-T1.5, AC-T3.3, CAP-05 plantillas, CAP-07, CAP-09, CAP-11, el agente de CAP-08, resumen del caso, búsqueda híbrida y filtros, visor, resolución de conflictos, supuestos y limitaciones, OCR (E-17) y feedback (D-5)
- **WHEN** corre la verificación con el resto en verde
- **THEN** el registro las lista con ID, Feature, sprint de destino y motivo en la sección «Excepciones declaradas» y el resultado es «G-Demo superado»

#### Scenario: Una excepción sin destino hace fallar la verificación [US-142 AC-4] (Decidido, usuario, 2026-11-03)
- **GIVEN** una entrada del fichero sin Feature o sin sprint de destino
- **WHEN** corre la verificación
- **THEN** sale con código ≠ 0 y nombra la entrada incompleta

### Requirement: Validación clínica declarada para el piloto
El registro MUST declarar el reporte de feedback de US-139, el registro de DEC-14 (VM-3) y VM-1, VM-2, VM-4 y VM-5 con el sistema como «se miden en el piloto», con su historia y su Feature, y SHALL adjuntar el enlace al baseline manual de VM-1/VM-2 ya registrado. No los cuenta como fallo.

#### Scenario: Validación clínica declarada [US-142 AC-5] [VM-3] [VM-4] [VM-5] [S5 resp. 4]
- **GIVEN** que FEAT-T5c y DEC-14 están en el S6
- **WHEN** corre la verificación
- **THEN** el registro trae la sección «Validación clínica» con US-139, DEC-14, VM-1, VM-2, VM-4 y VM-5 como «se miden en el piloto (FEAT-T5c / FEAT-T5d, S6)», el enlace al baseline manual de VM-1/VM-2 y el resultado no cambia por ellos

### Requirement: Registro del gate con procedencia
`verify-g-demo` MUST escribir `docs/gates/G-Demo-<fecha>.md` desde la plantilla con resultado, modo (fingido o real), commit, `catalogVersion`, `corpusRelease`, modelos en configuración, fecha y dueño (usuario, PO). Solo un registro en modo real con el resultado «G-Demo superado» y la firma del dueño declara G-Demo; el modo fingido es regresión.

#### Scenario: Registro completo tras una verificación [US-142 AC-6] (Decidido, usuario, 2026-11-03)
- **GIVEN** una verificación terminada
- **WHEN** se escribe el registro
- **THEN** contiene resultado, modo, SHA del commit, `catalogVersion`, `corpusRelease`, modelos de generación, *embeddings*, *reranker* y NLI leídos de la configuración, fecha y la línea de firma del dueño pendiente, sin PII ni secretos

#### Scenario: Una verificación en modo fingido no declara G-Demo [US-142 AC-6] (Decidido, usuario, 2026-11-03)
- **GIVEN** `LLM_PROVIDER=fake`
- **WHEN** corre la verificación con todo en verde
- **THEN** el registro dice «Regresión del recorrido en verde (modo fingido); G-Demo se declara solo en modo real»

#### Scenario: Falta un dato de procedencia [US-142 AC-6] (Decidido, usuario, 2026-11-03)
- **GIVEN** que no se puede leer `catalogVersion` o `corpusRelease`
- **WHEN** se escribe el registro
- **THEN** el campo dice «No disponible», el resultado es «G-Demo no superado: procedencia incompleta» y sale con código ≠ 0

### Requirement: p95 del análisis informado frente a G-5 sin bloquear
El registro MUST traer el p95 de `POST /platform/evidence-analyses` medido con aplicabilidad y `maxOptions` en configuración, contra Compose y los modelos de ADR-39, frente a la meta de G-5 leída de configuración (RN-22). Si la supera, SHALL marcarlo como insumo de ADR-42 sin cambiar el resultado del gate.

#### Scenario: p95 dentro de la meta [US-142 AC-7] [M-06.2] [G-5]
- **GIVEN** el p95 del baseline del S5 (mediana de 3 corridas) por debajo de la meta
- **WHEN** corre la verificación
- **THEN** el registro trae el p95, la meta y su clave de configuración, el número de consultas y la fuente de la medición

#### Scenario: p95 fuera de meta como insumo de ADR-42 [US-142 AC-7] [RN-22] (Decidido, usuario, 2026-11-03)
- **GIVEN** un p95 por encima de la meta
- **WHEN** corre la verificación con el resto en verde
- **THEN** el registro lo marca «fuera de meta: insumo de ADR-42» y el resultado sigue siendo «G-Demo superado»

#### Scenario: p95 no medido [US-142 AC-7] (Decidido, usuario, 2026-11-03)
- **GIVEN** que no hay medición de p95 con modelos reales (modo fingido)
- **WHEN** corre la verificación
- **THEN** el registro lo declara «no medido» con su motivo, sin bloquear
