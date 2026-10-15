## ADDED Requirements

### Requirement: Aviso de IA en todo resultado del análisis
Todo resultado de `POST /platform/evidence-analyses` MUST llevar en `disclaimer` exactamente el valor de `AI_DISCLAIMER_TEXT` de `clinical-api` (por defecto, el literal validado por los oncólogos asesores, `[S1 resp. 32]`, PRD E-11, sin la etiqueta académica), y el panel de `web` MUST mostrarlo tal como llega, en una región `role="note"`, con cualquier `status`, incluido `sin_evidencia` `[S1 resp. 3]`.

#### Scenario: El análisis con evidencia muestra el aviso literal [US-069 AC-1] [AC-T3.1] [RN-19] [S1 resp. 32]
- **GIVEN** el paciente semilla (a) y `AI_DISCLAIMER_TEXT` con su valor por defecto
- **WHEN** se ejecuta un análisis que devuelve `status = con_evidencia` y el panel lo renderiza
- **THEN** el campo `disclaimer` de la respuesta es exactamente "Generado por IA; requiere validación clínica independiente por el oncólogo tratante." `[S1 resp. 32]`
- **AND** el panel muestra ese texto en una región `role="note"` junto al resultado

#### Scenario: El análisis sin evidencia también muestra el aviso [US-069 AC-4] [RN-19] [RN-02] (asumido, aceptado en S1 resp. 3)
- **GIVEN** una pregunta del *fixture* sin evidencia, sin chunks sobre el umbral
- **WHEN** el análisis devuelve `status = sin_evidencia` con `topRelevanceScore = null` y el panel lo renderiza
- **THEN** el campo `disclaimer` tiene el mismo literal que en `con_evidencia`
- **AND** el panel muestra el aviso en la región `role="note"`, aunque no haya opciones ni texto generado

#### Scenario: Con la dependencia caída no hay resultado que avisar [US-069 AC-1] (asumido)
- **WHEN** `rag-orchestrator` no responde y el BFF recibe un `502`, `503` o `504`
- **THEN** el panel muestra solo el estado de error mínimo del S1 ("No se pudo completar el análisis…" y el código de traza), según `docs/ux/S1/pantallas-s1.md`
- **AND** no hay resultado parcial ni región `role="note"` de aviso, porque no hay salida generada

### Requirement: Literal del aviso con fuente única en configuración
El literal del aviso de IA MUST vivir solo en `AI_DISCLAIMER_TEXT` de `clinical-api` (RN-19, RN-22, PRD E-11, `[S1 resp. 32]`). `web` MUST NOT declarar una constante, mensaje ni valor por defecto propio para el aviso: lo SHALL mostrar desde el campo `disclaimer` de la respuesta. `clinical-api` MUST negarse a arrancar si `AI_DISCLAIMER_TEXT` está vacía o ausente, nombrando la clave (asumido: falla cerrado, como el resto de la configuración obligatoria).

#### Scenario: Cambiar la clave cambia el campo y el panel sin cambiar código de web [US-069 AC-2] [RN-19] [RN-22] (asumido, aceptado en S1 resp. 3)
- **GIVEN** `AI_DISCLAIMER_TEXT` configurada en el test con un valor sintético distinto del literal por defecto
- **WHEN** se ejecuta un análisis y el panel lo renderiza
- **THEN** el campo `disclaimer` de la respuesta y el texto del aviso del panel son ese nuevo valor
- **AND** ningún archivo de `apps/web` contiene el literal "requiere validación clínica independiente por el oncólogo tratante" ni el anterior "requiere validación clínica del oncólogo tratante"

#### Scenario: La clave vacía impide arrancar clinical-api [US-069 AC-2] [RN-22] (asumido)
- **WHEN** `clinical-api` arranca con `AI_DISCLAIMER_TEXT` vacía o sin definir
- **THEN** el proceso termina con código distinto de 0 y un mensaje que nombra `AI_DISCLAIMER_TEXT`, sin servir ninguna petición

### Requirement: Etiqueta permanente "Uso académico/investigación"
Toda página autenticada de `web` MUST mostrar la etiqueta "Uso académico/investigación" en la cabecera común del *layout* del *dashboard* (`AppHeader`), como texto visible, permanente y no solo como color, independiente del campo `disclaimer` (RN-19, OL-04, `[S1 resp. 9]`, `[S1 resp. 32]`). En el S1 la única página autenticada es `/pacientes/[id]/analisis`; las páginas que se agreguen después (listado y ficha en el S2, alta en el S4) la heredan del *layout*.

#### Scenario: Las páginas autenticadas del S1 muestran la etiqueta [US-069 AC-3] [RN-19] [OL-04]
- **GIVEN** una sesión válida del doctor sintético y el paciente semilla (a)
- **WHEN** se renderiza cada página autenticada del S1 (`/pacientes/[id]/analisis`, antes del análisis y con el resultado `con_evidencia`, `sin_evidencia` y error)
- **THEN** cada una muestra el texto "Uso académico/investigación" en la cabecera
- **AND** el texto no está dentro del aviso `role="note"` del campo `disclaimer`

#### Scenario: Sin sesión no se renderiza ninguna página autenticada [US-069 AC-3] [RN-19]
- **WHEN** se pide `/pacientes/[id]/analisis` sin la cookie de sesión
- **THEN** `web` redirige a `/login` (L1D-197) y el HTML servido no contiene datos del paciente ni del análisis

> Regresión [RN-19] activa desde S2: el resumen del caso (US-096, US-097) lleva el mismo aviso más "Verifique contra las fuentes" y las páginas de listado y ficha muestran la etiqueta. Regresión [RN-19] activa desde S5: cada turno de seguimiento (`FollowUpTurn.disclaimer`). Regresión [RN-15] activa desde S6: con opt-out de `analisis_ia` no hay resultado (`403`) y por tanto no hay aviso.
