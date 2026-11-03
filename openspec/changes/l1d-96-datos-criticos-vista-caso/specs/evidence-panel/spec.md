## MODIFIED Requirements

### Requirement: Aviso no bloqueante de datos críticos faltantes antes de analizar
Antes de cada análisis, `web` MUST leer el checklist por `GET /api/patients/{id}/completeness` y, si hay ítems `faltante` y `cancerTypeEnabled` es `true`, mostrar sobre «Analizar evidencia» un bloque `role="status"` informativo con la lista de faltantes por etiqueta del catálogo y un enlace «Ir a ‹etiqueta› en el caso clínico» por ítem. El bloque MUST NOT enviar ningún análisis ni deshabilitar el botón (RN-26) y MUST NOT usar términos prohibidos (RN-23).

#### Scenario: Se avisan los seis faltantes de F-M2 antes de analizar [US-005 AC-1] [AC-04.2] [FR-23] [docs/ux/S4 S4-03]
- **GIVEN** F-M2 (FX-04-b, `test-1.0.0`) con seis faltantes y `GET …/completeness` simulado desde `contracts/examples/`
- **WHEN** el oncólogo abre `/pacientes/{id}/analisis`
- **THEN** antes del botón aparece «⚠ Faltan 6 datos críticos para este tipo de cáncer» con `role="status"` y una lista `ul` de 6 etiquetas del catálogo, cada una con «Ir a ‹etiqueta› en el caso clínico» [US-004] [docs/ux/S5 S5-02]
- **AND** se lee «El análisis puede hacerse igual; los criterios de aplicabilidad que dependan de esos datos saldrán como «Desconocido» y el orden por aplicabilidad puede cambiar al registrarlos.»
- **AND** no se envió ningún `POST /api/evidence-analyses`
- **AND** el texto no contiene términos de la lista prohibida de RN-23

### Requirement: Aviso operable con teclado y asociado al botón
El bloque MUST asociarse al botón «Analizar evidencia» con `aria-describedby` y cada enlace «Ir a … en el caso clínico» MUST ser operable con teclado.

#### Scenario: Teclado y descripción accesible [US-005 AC-7] [NFR-12]
- **GIVEN** el bloque del primer escenario
- **WHEN** se navega con Tab y se activa un enlace con Enter
- **THEN** el botón «Analizar evidencia» tiene `aria-describedby` apuntando al resumen y cada enlace recibe el foco en orden
- **AND** al llegar a la vista de caso el encabezado «Datos críticos» (`h2#datos-criticos`, `tabindex="-1"`) recibe el foco [US-004] [docs/ux/S5 S5-02]

Regresión [RN-26] activa desde S4: ningún estado del aviso deshabilita «Analizar evidencia» (verificada por US-071). Regresión [RN-23]: textos del aviso fuera de la lista prohibida (US-068).

## REMOVED Requirements

### Requirement: El enlace del faltante lleva a la sección existente de la ficha
**Reason**: desde el S5 los faltantes se registran a mano en la columna «Datos críticos» de la vista de caso (US-004, D-1 y D-7 `[S5 resp. 1]` `[S5 resp. 4]`; `docs/ux/S5/pantallas-s5.md` S5-02: «El enlace del aviso de faltantes del panel pasa a apuntar aquí»); la ficha no ofrece la acción de registro.
**Migration**: sustituido por «El enlace del faltante lleva a los datos críticos de la vista de caso». Las anclas `#diagnostico` y `#biomarcadores` de la ficha se conservan (las usa la tabla de aplicabilidad, `patients-identity`). Los tests de US-005 AC-3 se actualizan al destino nuevo en el mismo change; si alguno se elimina, el commit lleva `Test-Removal:`.

## ADDED Requirements

### Requirement: El enlace del faltante lleva a los datos críticos de la vista de caso
Cada enlace «Ir a ‹etiqueta› en el caso clínico» MUST navegar a `/pacientes/{id}/caso#datos-criticos`, con el foco en el encabezado de la columna «Datos críticos», cualquiera que sea su `destination.entity`; MUST NOT enviar petición de análisis ni abrir por sí solo un formulario de registro.

#### Scenario: Ki-67 y grado llevan a la columna de la vista de caso [US-005 AC-3] [US-004] [AC-04.2] [FR-23] [docs/ux/S5 S5-02]
- **GIVEN** el bloque con los faltantes Ki-67 (`Biomarker`) y grado (`Diagnosis`)
- **WHEN** el oncólogo pulsa «Ir a Ki-67 en el caso clínico» y, en otra prueba, «Ir a Grado en el caso clínico»
- **THEN** navega a `/pacientes/{id}/caso#datos-criticos` con el foco en el encabezado «Datos críticos»
- **AND** no se envía ninguna petición de análisis

#### Scenario: Un destino de atributo o tratamiento lleva al mismo lugar [US-005 AC-3] [US-004 AC-2] [S5 resp. 4]
- **GIVEN** un faltante con `destination.entity` `ClinicalAttribute` o `PriorTreatment`
- **WHEN** se pulsa su enlace
- **THEN** navega a `/pacientes/{id}/caso#datos-criticos`, donde su fila ofrece la acción manual de US-094
