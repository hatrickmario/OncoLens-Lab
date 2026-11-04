## ADDED Requirements

### Requirement: Pedir un análisis nunca modifica datos clínicos
Completar un análisis de evidencia MUST dejar intactas, en número de filas y en contenido, todas las tablas de los schemas `clinical` e `identity` salvo `clinical.ai_analysis_record`, que SHALL recibir exactamente una fila nueva (RN-06). Ningún `review_status` SHALL cambiar, tampoco en las filas registradas o corregidas a mano por el doctor (AC-T3.2).

#### Scenario: Un análisis con evidencia no cambia el número de filas clínicas ni ningún review_status [US-070 AC-1] [AC-T3.2]
- **GIVEN** el paciente semilla (a) y la instantánea (conteo y *hash* por tabla) de `patient`, `diagnosis`, `biomarker`, `treatment`, `clinical_event`, `prior_treatment` y `clinical_attribute`
- **WHEN** `doc1@test.local` completa un análisis `con_evidencia` (MSW con `contracts/examples/rag-query-con-evidencia.json`) y recibe `200`
- **THEN** el número de filas de esas siete tablas es el mismo que antes
- **AND** su *hash* de contenido no cambia, de modo que ningún `review_status` ha cambiado

#### Scenario: La única diferencia en clinical e identity es la fila nueva de ai_analysis_record [US-070 AC-2] [AC-T3.2] [RN-06]
- **GIVEN** el mismo paciente y la instantánea de todas las tablas de `clinical` e `identity` (asumido: `identity` se incluye por RN-10)
- **WHEN** se completa el análisis del escenario anterior
- **THEN** la única tabla con diferencia es `clinical.ai_analysis_record`, con una fila más
- **AND** esa fila tiene el `id` y el `traceId` de la respuesta, válida contra el spec de `clinical-api`

#### Scenario: Las filas registradas y corregidas a mano no cambian al analizar [US-070 AC-2] [AC-T3.2] [RN-08] [S5 resp. 3]
- **GIVEN** el paciente (a) con un biomarcador y un diagnóstico registrados a mano (US-110), un tratamiento previo y un atributo clínico manuales (US-094) y un biomarcador corregido (US-253: fila `reemplazado` y su sucesora `manual_correction`), creados por sus endpoints con la sesión del doctor
- **WHEN** se toma la instantánea de `clinical` e `identity` y se completa un análisis `con_evidencia`
- **THEN** la única tabla con diferencia es `clinical.ai_analysis_record`
- **AND** la fila `reemplazado` conserva su `review_status` y su valor, y las filas manuales siguen `verificado` con su `entry_method`

### Requirement: Una pregunta de seguimiento nunca modifica datos clínicos
Completar una pregunta de seguimiento sobre un análisis MUST dejar intactas todas las tablas de `clinical` e `identity` salvo `clinical.analysis_follow_up`, que SHALL recibir exactamente una fila nueva; la fila del análisis de origen en `ai_analysis_record` SHALL NOT cambiar (AC-T3.2, RN-06).

#### Scenario: La única diferencia tras un seguimiento es la fila nueva de analysis_follow_up [US-070 AC-2] [AC-T3.2] [RN-06] (asumido: instrucción de /sprint-start del S5)
- **GIVEN** el análisis `con_evidencia` del paciente (a) con las filas manuales del requisito anterior y la instantánea de `clinical` e `identity`
- **WHEN** `doc1@test.local` envía `POST /platform/evidence-analyses/{analysisId}/follow-ups` (MSW con `contracts/examples/rag-follow-up-response.json`) y recibe `201`
- **THEN** la única tabla con diferencia es `clinical.analysis_follow_up`, con una fila más cuyo `id` es el del turno respondido
- **AND** la fila del análisis de origen en `ai_analysis_record` tiene el mismo *hash* que antes

### Requirement: Una respuesta interna con campos inesperados no persiste nada
Si la respuesta de `rag-orchestrator` trae un campo no declarado en su contrato (p. ej. `actions`), `clinical-api` MUST rechazarla con el Zod generado estricto y responder `502 ERROR_SERVICIO_IA` sin persistir `AIAnalysisRecord` ni devolver el campo; ninguna tabla de `clinical` ni de `identity` SHALL cambiar.

#### Scenario: Un campo actions en la respuesta interna no se persiste ni se devuelve y ninguna tabla cambia [US-070 AC-4] [AC-T3.2]
- **GIVEN** el paciente (a), la instantánea de `clinical` e `identity` y MSW respondiendo `/rag/query` con `rag-query-con-evidencia.json` más `actions: [{"type":"registrar_tratamiento"}]`
- **WHEN** `doc1@test.local` pide el análisis
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA`, válida contra el spec de `clinical-api`, y su cuerpo no contiene `actions` ni `registrar_tratamiento`
- **AND** ninguna tabla de `clinical` ni de `identity` tiene diferencia, incluida `ai_analysis_record` (el supuesto «Zod descarta campos desconocidos» se sustituye por el rechazo del contrato estricto, design D4)

### Requirement: La tarjeta de opción no ofrece acciones clínicas
La tarjeta de cada opción descrita en el panel MUST NOT contener botones ni enlaces que registren un tratamiento, apliquen la opción o modifiquen datos del paciente; sus únicos controles SHALL ser de lectura (desplegar detalle, ver la cita) (AC-T3.2, FR-10).

#### Scenario: Los controles de la tarjeta de opción son solo de lectura [US-070 AC-3] [AC-T3.2] [FR-10]
- **GIVEN** la tarjeta de opción renderizada con cada opción de `contracts/examples/con-evidencia-s4-tres-opciones.json`
- **WHEN** se recorren sus controles (botones, enlaces y `summary`)
- **THEN** ninguno tiene un nombre accesible ni un destino que registre un tratamiento, aplique la opción o modifique datos del paciente
- **AND** los controles presentes son solo de lectura (detalle de la opción y de la cita)
