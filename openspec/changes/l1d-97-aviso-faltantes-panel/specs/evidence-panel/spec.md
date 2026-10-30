## ADDED Requirements

### Requirement: Aviso no bloqueante de datos críticos faltantes antes de analizar
Antes de cada análisis, `web` MUST leer el checklist por `GET /api/patients/{id}/completeness` y, si hay ítems `faltante` y `cancerTypeEnabled` es `true`, mostrar sobre «Analizar evidencia» un bloque `role="status"` informativo con la lista de faltantes por etiqueta del catálogo y un enlace «Registrar ‹etiqueta› en la ficha» por ítem. El bloque MUST NOT enviar ningún análisis ni deshabilitar el botón (RN-26) y MUST NOT usar términos prohibidos (RN-23).

#### Scenario: Se avisan los seis faltantes de F-M2 antes de analizar [US-005 AC-1] [AC-04.2] [FR-23] [docs/ux/S4 S4-03]
- **GIVEN** F-M2 (FX-04-b, `test-1.0.0`) con seis faltantes y `GET …/completeness` simulado desde `contracts/examples/`
- **WHEN** el oncólogo abre `/pacientes/{id}/analisis`
- **THEN** antes del botón aparece «⚠ Faltan 6 datos críticos para este tipo de cáncer» con `role="status"` y una lista `ul` de 6 etiquetas del catálogo, cada una con «Registrar ‹etiqueta› en la ficha»
- **AND** se lee «El análisis puede hacerse igual; los criterios de aplicabilidad que dependan de esos datos saldrán como «Desconocido» y el orden por aplicabilidad puede cambiar al registrarlos.»
- **AND** no se envió ningún `POST /api/evidence-analyses`
- **AND** el texto no contiene términos de la lista prohibida de RN-23

### Requirement: Continuar con aviso envía continueWithWarning verdadero
«Analizar evidencia» MUST estar siempre habilitado con el bloque visible y, al pulsarlo, `web` MUST enviar exactamente un `POST /api/evidence-analyses` con `continueWithWarning = true`.

#### Scenario: Un solo POST con la bandera cuando hay faltantes [US-005 AC-2] [AC-04.2] [RN-26]
- **GIVEN** el bloque del escenario anterior
- **WHEN** el oncólogo pulsa «Analizar evidencia» (habilitado)
- **THEN** el navegador envía exactamente un `POST /api/evidence-analyses` con `continueWithWarning = true`

### Requirement: El enlace del faltante lleva a la sección existente de la ficha
Cada enlace «Registrar ‹etiqueta› en la ficha» MUST navegar a `/pacientes/{id}#diagnostico` si `destination.entity` es `Diagnosis`, a `/pacientes/{id}#biomarcadores` si es `Biomarker`, y a `/pacientes/{id}` (encabezado principal) para cualquier otro destino; MUST NOT enviar petición de análisis ni crear secciones nuevas.

#### Scenario: Ki-67 va a biomarcadores y grado a diagnóstico [US-005 AC-3] [AC-04.2] [FR-23] [S4 resp. 14]
- **GIVEN** el bloque con los faltantes Ki-67 (`Biomarker`) y grado (`Diagnosis`)
- **WHEN** el oncólogo pulsa «Registrar Ki-67 en la ficha» y, en otra prueba, «Registrar grado en la ficha»
- **THEN** navega a `/pacientes/{id}#biomarcadores` y a `/pacientes/{id}#diagnostico`, respectivamente, con el foco en el encabezado de esa sección
- **AND** no se envía ninguna petición de análisis

#### Scenario: Un destino sin sección propia enlaza al encabezado principal [US-005 AC-3] [S4 resp. 14] (asumido)
- **GIVEN** un faltante con `destination.entity` `ClinicalAttribute` o `PriorTreatment`
- **WHEN** se pulsa su enlace
- **THEN** navega a `/pacientes/{id}` sin ancla de sección y el foco queda en el encabezado principal de la ficha

### Requirement: Sin faltantes no hay aviso y el análisis no lleva la bandera
Sin ítems `faltante`, `web` MUST NOT mostrar el bloque y «Analizar evidencia» MUST enviar `POST /api/evidence-analyses` con `continueWithWarning = false`.

#### Scenario: F-M1 analiza sin bloque [US-005 AC-4] [FR-23]
- **GIVEN** F-M1 sin faltantes
- **WHEN** se carga el formulario y se pulsa «Analizar evidencia»
- **THEN** no aparece el bloque y el `POST` lleva `continueWithWarning = false`

### Requirement: Checklist caído no bloquea el análisis
Si `GET …/completeness` responde `5xx` o falla la red, el panel MUST mostrar «No se pudieron verificar los datos críticos», mantener «Analizar evidencia» habilitado y enviar el análisis con `continueWithWarning = true`; el servidor sigue calculando y enviando los faltantes.

#### Scenario: Error 5xx del checklist degrada con aviso [US-005 AC-5] [RN-26] [PP-5]
- **GIVEN** `GET …/completeness` simulado con `500`
- **WHEN** se carga el formulario y se pulsa «Analizar evidencia»
- **THEN** se lee «No se pudieron verificar los datos críticos» y el botón está habilitado
- **AND** el `POST` lleva `continueWithWarning = true`

### Requirement: Tipo de cáncer no habilitado no muestra el aviso de faltantes
Con `cancerTypeEnabled = false`, el panel MUST NOT mostrar el bloque de faltantes y MUST mostrar el estado propio de «tipo no habilitado» del S3.

#### Scenario: Sin bloque con tipo no habilitado [US-005 AC-6] [docs/ux/S4 S4-03] [S4 resp. 6]
- **GIVEN** un paciente con `cancerTypeEnabled = false` en `/completeness`
- **WHEN** se carga el formulario
- **THEN** no aparece el bloque de faltantes y se ve el estado de «tipo no habilitado»

### Requirement: Aviso operable con teclado y asociado al botón
El bloque MUST asociarse al botón «Analizar evidencia» con `aria-describedby` y cada enlace «Registrar … en la ficha» MUST ser operable con teclado.

#### Scenario: Teclado y descripción accesible [US-005 AC-7] [NFR-12]
- **GIVEN** el bloque del primer escenario
- **WHEN** se navega con Tab y se activa un enlace con Enter
- **THEN** el botón «Analizar evidencia» tiene `aria-describedby` apuntando al resumen y cada enlace recibe el foco en orden
- **AND** al llegar a la ficha el encabezado de destino recibe el foco (ver `patients-identity`)

Regresión [RN-26] activa desde S4: ningún estado del aviso deshabilita «Analizar evidencia» (verificada por US-071). Regresión [RN-23]: textos del aviso fuera de la lista prohibida (US-068).
