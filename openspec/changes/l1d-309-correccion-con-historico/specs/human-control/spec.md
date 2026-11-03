## ADDED Requirements

### Requirement: Una corrección crea una fila nueva y conserva la anterior como histórico
Al corregir un `Biomarker` o una `ClinicalNote` vigente, `clinical-api` MUST crear en una transacción una fila nueva con `entry_method = manual_correction`, `review_status = verificado` y `supersedes_id` hacia la anterior, y pasar la anterior a `reemplazado` (y `is_active = false` en la nota). Ningún `UPDATE` SHALL cambiar `value` ni `content` de una fila existente (RN-08, ADR-50).

#### Scenario: Corregir el valor de un biomarcador deja el anterior como histórico enlazado [US-253 AC-1] [RN-08] [AC-04.1]
- **GIVEN** el paciente semilla (a) activo con su Ki-67 `20 %` registrado y `doc1@test.local` con sesión válida
- **WHEN** envía `POST /platform/patients/{a}/biomarkers/{ki67}/corrections` con `value = "25"` y `unit = "%"`
- **THEN** responde `201` con un `Biomarker` `value = "25"`, `provenance.entryMethod = manual_correction` y `supersedesId = {ki67}`
- **AND** la fila `{ki67}` conserva `value = "20"` con `review_status = reemplazado`, y `GET /platform/patients/{a}` muestra en `recentBiomarkers` solo el Ki-67 `25 %` con origen «Corrección manual»

#### Scenario: El histórico del biomarcador se lee siguiendo supersedes_id [US-253 AC-1] [RN-08]
- **GIVEN** el Ki-67 de (a) corregido dos veces (`20` → `25` → `30`)
- **WHEN** el doctor pide `GET …/biomarkers/{vigente}/history`
- **THEN** recibe dos entradas `reemplazado`, de la más reciente (`25`) a la más antigua (`20`), con su `entryMethod` y fecha, y la lista no supera `CORRECTION_HISTORY_MAX`

#### Scenario: Corregir la fecha de un examen manual reemplaza también el examen [US-253 AC-1] [ADR-50] (Decidido (usuario, 2026-11-03): D3 del design, `[S5 resp. 13]`)
- **GIVEN** un biomarcador registrado a mano en un `Exam` `registro_manual` cuyo único biomarcador vigente es él
- **WHEN** el doctor corrige su `performedAt` a una fecha anterior a hoy
- **THEN** se crea un `Exam` nuevo `manual_correction` con esa fecha y `supersedes_id` al examen anterior, y el biomarcador nuevo cuelga de él
- **AND** si el examen anterior tenía otros biomarcadores vigentes, el examen nuevo lleva `supersedes_id = null` y el anterior sigue vigente con ellos

#### Scenario: Corregir texto o tipo de una nota crea una versión nueva [US-253 AC-2] [RN-08]
- **GIVEN** la nota `comorbilidad` sintética de (a) (FX-253-a)
- **WHEN** el doctor envía `POST …/clinical-notes/{nota}/corrections` con otro `content` y `noteType = antecedente`
- **THEN** responde `201` con la nota nueva (`manual_correction`, `supersedesId = {nota}`), `GET …/clinical-notes` lista solo la nueva y la anterior queda `reemplazado`, `is_active = false`, con su texto intacto en `GET …/clinical-notes/{nueva}/history`

#### Scenario: Una fila ya reemplazada no se puede volver a corregir [US-253 AC-1] [RN-08] (Decidido (usuario, 2026-11-03): concurrencia, D2 del design, `[S5 resp. 13]`)
- **GIVEN** el Ki-67 `{ki67}` ya reemplazado por una corrección anterior
- **WHEN** llega otra corrección sobre `{ki67}` (doble envío o dos pestañas)
- **THEN** responde `409 DATO_NO_VIGENTE`, no se crea ninguna fila y el vigente no cambia

#### Scenario: Una corrección sin cambios no crea filas [US-253 AC-3] (Decidido (usuario, 2026-11-03), `[S5 resp. 13]`)
- **WHEN** el doctor envía una corrección con los mismos valores que la fila vigente
- **THEN** responde `422 CUERPO_INVALIDO` sin `field` y no se crea ninguna fila

### Requirement: El biomarcador corregido se normaliza con el servicio de Backend 1
El biomarcador corregido MUST conservar el `originalName` de la fila anterior y obtener `name`, `loincCode` y `mappingStatus` de `ReconciliationService` (ADR-33, RN-27); el módulo de correcciones SHALL NOT asignar `mapeado` ni `no_mapeado` por su cuenta.

#### Scenario: La corrección pasa por la normalización final [US-253 AC-1] [RN-27] [ADR-33]
- **GIVEN** FX-01b-b montado y un biomarcador manual `originalName = "ERBB2"`
- **WHEN** el doctor corrige su valor
- **THEN** la fila nueva tiene `name = HER2`, `loincCode = LOINC-T-HER2`, `mappingStatus = mapeado` y `originalName = "ERBB2"`

### Requirement: Validación de la corrección sin cambios parciales
Un cuerpo inválido, un valor fuera del catálogo o una fecha posterior a hoy (reloj inyectado) MUST responder `422` con `ErrorCorreccionInvalida` y el campo afectado en `field`, sin crear ni modificar filas. Los límites de texto SHALL vivir en configuración (`CLINICAL_NOTE_MAX_CHARS`, RN-22).

#### Scenario: Una fecha posterior a hoy se rechaza junto al campo [US-253 AC-3] [PRD §10]
- **GIVEN** el reloj congelado en una fecha fija
- **WHEN** el doctor corrige el Ki-67 de (a) con `performedAt` = mañana
- **THEN** responde `422` con `error = CUERPO_INVALIDO` y `field = "performedAt"`, y el biomarcador vigente y su examen no cambian

#### Scenario: Un valor cuantitativo no numérico se rechaza [US-253 AC-3] [RN-27] (Decidido (usuario, 2026-11-04))
- **GIVEN** un biomarcador `cuantitativo` (Ki-67 de FX-01b-b)
- **WHEN** el doctor lo corrige con un `value` no numérico (p. ej. `"7+x"`)
- **THEN** responde `422` con `error = VALOR_FUERA_DE_CATALOGO` y `field = "value"`, sin filas nuevas

Limitación: los «valores admitidos» de un biomarcador cualitativo (p. ej. HER2) dependen del catálogo, que no los trae (1.3.0); se validan con el oncólogo (D5-21) y no se inventa un enum clínico.

#### Scenario: Una nota vacía o demasiado larga se rechaza [US-253 AC-3] [RN-22] (Decidido (usuario, 2026-11-03), `[S5 resp. 13]`)
- **WHEN** el doctor corrige una nota con `content` vacío o con más de `CLINICAL_NOTE_MAX_CHARS` caracteres
- **THEN** responde `422` con `field = "content"` y la nota vigente no cambia

### Requirement: Paciente egresado y administrador no corrigen
Toda corrección MUST responder `422 PACIENTE_EGRESADO` si el paciente está egresado (RN-17), comprobado antes de escribir, y `403` a una sesión sin `clinical:write` (`admin`, PRD §11); las lecturas de notas e histórico SHALL exigir `clinical:read`.

#### Scenario: Corregir un dato de un paciente egresado responde 422 [US-253 AC-4] [RN-17]
- **GIVEN** un paciente sintético egresado con un biomarcador y una nota
- **WHEN** el doctor intenta corregir cualquiera de los dos
- **THEN** responde `422` con `error = PACIENTE_EGRESADO` y no se crea ni modifica ninguna fila

#### Scenario: El administrador recibe 403 al corregir y al leer notas [US-253 AC-4] [PRD §11] (Decidido (usuario, 2026-11-03): lecturas, `[S5 resp. 13]`)
- **GIVEN** `admin@test.local` con sesión válida
- **WHEN** envía una corrección de biomarcador o de nota, o pide `GET …/clinical-notes` o `…/history`
- **THEN** responde `403` en todos los casos y no se crea ninguna fila

### Requirement: La corrección cambia el contexto del próximo análisis sin bloquear
Tras una corrección, el contexto clínico vigente del paciente MUST reflejar el valor nuevo, de modo que `huellaDelContexto()` del próximo análisis difiera de la del análisis previo; los análisis guardados SHALL quedar intactos y el aviso al usuario no bloquea ninguna acción (RN-26, D-10).

#### Scenario: La huella del contexto cambia tras corregir un dato que usó un análisis previo [US-253 AC-5] [RN-26] [RN-06]
- **GIVEN** un análisis guardado de (a) cuyo contexto incluyó Ki-67 `20 %`, con `rag-orchestrator` simulado desde `contracts/examples/`
- **WHEN** el doctor corrige Ki-67 a `25 %` y pide un análisis nuevo con la misma pregunta
- **THEN** el `contextFingerprint` del análisis nuevo difiere del previo, el contexto enviado lleva `25` y no `20`, y el `AIAnalysisRecord` previo conserva su snapshot y su huella sin cambios
- **AND** la corrección y el análisis nuevo responden `201` sin ningún bloqueo por el análisis previo

Regresión [RN-26] activa desde S6: la no reutilización de un análisis por huella la verifica US-251.

### Requirement: Corrección en línea con histórico desplegable en la ficha
La ficha MUST ofrecer «Corregir dato» en cada biomarcador y nota clínica vigente (variante A de S5-01), con formulario en línea («Guardar mi corrección», «Cancelar»), origen «Corrección manual» tras guardar, histórico desplegable con las filas `reemplazado` y aviso no bloqueante sobre análisis anteriores. Las fechas se muestran relativas («hoy», «hace 12 días», `[S5 resp. 11]` (d)). Textos en `messages/es.json`.

#### Scenario: El oncólogo corrige un biomarcador en la fila y ve el histórico [US-253 AC-1] [RN-08]
- **GIVEN** la ficha de (a) con MSW sirviendo `biomarker-corrected.json` y `correction-history-biomarker.json`
- **WHEN** el doctor pulsa «Corregir dato» en Ki-67, cambia el valor y pulsa «Guardar mi corrección»
- **THEN** la fila muestra el valor nuevo con «Corrección manual», aparece «Histórico» bajo la fila y al desplegarlo lista el valor anterior rotulado «reemplazado»
- **AND** al corregir un **biomarcador** se muestra «Los análisis anteriores se hicieron con el valor previo. Un análisis nuevo usará el valor corregido.» sin deshabilitar ninguna acción [US-253 AC-5] [RN-26]; al corregir una **nota** no se muestra aviso de análisis, porque las notas no entran al análisis

#### Scenario: Las fechas del histórico se muestran relativas [US-253 AC-1] [S5 resp. 11]
- **GIVEN** el reloj congelado y `correction-history-biomarker.json` con una entrada creada hoy y otra 12 días antes
- **WHEN** el doctor despliega «Histórico» en Ki-67
- **THEN** las entradas muestran «hoy» y «hace 12 días», cada una con la fecha absoluta en un `<time dateTime>`

#### Scenario: El oncólogo corrige una nota y conserva la versión anterior visible [US-253 AC-2]
- **GIVEN** la sección «Notas clínicas» de la ficha de (a)
- **WHEN** cambia el texto y el tipo de una nota y guarda
- **THEN** la sección muestra la versión nueva y el histórico desplegable muestra la anterior

#### Scenario: El error 422 aparece junto al campo y nada cambia [US-253 AC-3]
- **GIVEN** MSW respondiendo `error-correccion-fecha-futura.json`
- **WHEN** el doctor guarda una fecha posterior a hoy
- **THEN** el mensaje aparece junto al campo de fecha, se anuncia con `aria-live="assertive"`, el formulario sigue abierto con lo escrito y la fila no cambia

#### Scenario: Con paciente egresado la acción está deshabilitada y explicada [US-253 AC-4] [RN-17]
- **GIVEN** la ficha de un paciente sintético egresado
- **WHEN** se renderiza
- **THEN** «Corregir dato» está deshabilitado con «El paciente está egresado: no admite registros hasta su reactivación»

#### Scenario: El formulario de nota libre muestra el aviso de nombres [US-253 AC-6] [ADR-40] [RN-11]
- **WHEN** el doctor abre «Corregir dato» en una nota
- **THEN** encima del campo de texto aparece fijo «No escribas nombres de personas (ni del paciente ni de terceros) en las notas. Las notas no se envían a la IA en esta versión; conviene no incluir nombres de personas en ellas.» (S5 resp. 12: el envío de notas, tras el detector de PII, se traslada a ADR-40)
