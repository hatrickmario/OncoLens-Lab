## MODIFIED Requirements

### Requirement: Corrección en línea con histórico desplegable en la ficha
La ficha MUST ofrecer «Corregir dato» en cada biomarcador y nota clínica vigente (variante A de S5-01), con formulario en línea («Guardar mi corrección», «Cancelar»), origen «Corrección manual» tras guardar, histórico desplegable con las filas `reemplazado` y aviso no bloqueante sobre análisis anteriores. Las fechas se muestran relativas («hoy», «hace 12 días», `[S5 resp. 11]` (d)). Textos en `messages/es.json`. El formulario de un biomarcador SHALL precargar el valor, la unidad y la fecha del examen vigentes, indicar que la unidad es opcional y no admitir una fecha posterior a hoy; la corrección de un dato «Por revisar» o «En conflicto» SHALL conservar el anterior como `reemplazado` (RN-08).

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

#### Scenario: El formulario precarga valor, unidad y fecha del examen de un biomarcador con unidad [D5 feedback 1] [US-253 AC-1] [RN-08]
- **GIVEN** la ficha del paciente sintético (f) con Ki-67 `20` `%`, fecha del examen `2026-10-20` y origen «Carga inicial · Por revisar»
- **WHEN** el doctor pulsa «Corregir dato» en Ki-67
- **THEN** el formulario muestra «Valor» `20`, «Unidad (opcional)» `%` y «Fecha del examen» `2026-10-20`, todos editables
- **AND** el campo de fecha lleva como máximo la fecha de hoy del servidor

#### Scenario: Un biomarcador cualitativo sin unidad indica que la unidad es opcional [D5 feedback 1] [NFR-12]
- **GIVEN** RE `Negativo` sin unidad, con origen «Carga inicial · Por revisar · En conflicto»
- **WHEN** el doctor pulsa «Corregir dato» en RE
- **THEN** «Valor» muestra `Negativo` y «Fecha del examen» muestra la fecha del examen
- **AND** «Unidad (opcional)» está vacío, con «Sin unidad» como marcador y la ayuda «Déjala vacía si el resultado no lleva unidad.» asociada al campo con `aria-describedby`

#### Scenario: La unidad de un cuantitativo se conserva y borrarla envía null [D5 feedback 1]
- **GIVEN** PSA `4,2` `ng/mL` en la ficha
- **WHEN** el doctor abre «Corregir dato», cambia solo el valor y guarda
- **THEN** el cuerpo enviado incluye el valor nuevo y `unit = "ng/mL"` precargada
- **AND** si en cambio borra la unidad y guarda, el cuerpo incluye `unit = null`

#### Scenario: La fecha solo se envía si el oncólogo la cambió [D5 feedback 1] [ADR-50]
- **GIVEN** Ki-67 con fecha del examen `2026-10-20` precargada
- **WHEN** el doctor cambia solo el valor y guarda
- **THEN** el cuerpo enviado es `{ value, unit }` sin `performedAt`
- **AND** si cambia la fecha a `2026-10-22`, el cuerpo incluye `performedAt = "2026-10-22"`

#### Scenario: La fecha precargada no se desplaza por zona horaria [D5 feedback 1]
- **GIVEN** un biomarcador con `performedAt = "2026-10-01"` y el navegador en una zona horaria con desfase negativo
- **WHEN** el doctor abre «Corregir dato»
- **THEN** «Fecha del examen» muestra `2026-10-01`, no `2026-09-30`

#### Scenario: Una fecha posterior a hoy se rechaza junto al campo antes de enviar [D5 feedback 1] [US-253 AC-3]
- **GIVEN** el formulario de corrección abierto con «hoy» del servidor `2026-11-05`
- **WHEN** el doctor escribe `2099-01-01` en «Fecha del examen» y pulsa «Guardar mi corrección»
- **THEN** «La fecha no puede ser posterior a hoy.» aparece junto al campo, se anuncia en `aria-live="assertive"`, no se envía ninguna petición y lo escrito se conserva

#### Scenario: Corregir un dato por revisar y en conflicto conserva el anterior como histórico [D5 feedback 1] [RN-08]
- **GIVEN** RE `Negativo` con «Carga inicial · Por revisar · En conflicto» y MSW sirviendo `biomarker-corrected.json` y `correction-history-biomarker.json`
- **WHEN** el doctor corrige el valor y guarda
- **THEN** la fila muestra el valor nuevo con «Corrección manual» y el «Histórico» desplegado lista el dato de «Carga inicial» como «reemplazado»
- **AND** ningún valor anterior se sobrescribe ni desaparece en silencio
