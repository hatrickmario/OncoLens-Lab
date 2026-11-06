## ADDED Requirements

### Requirement: Opción «Sin tratamiento previo a la fecha» en el registro de tratamientos previos
`DialogoTratamientoPrevio` MUST ofrecer la casilla «Sin tratamiento previo a la fecha». Marcada, SHALL excluir de la vista, la validación y el cuerpo los campos del tratamiento, pedir solo la fecha de la declaración (no futura, hoy por defecto) y enviar `POST /api/patients/{id}/clinical-attributes` con `sin_tratamiento_previo = si`. Desmarcada, el formulario no cambia; con tratamientos vigentes la casilla no se ofrece.

#### Scenario: Declarar ausencia sin llenar los demás campos [AC-04.1] [FR-08]
- **GIVEN** el diálogo «Agregar tratamiento previo» del paciente (g), sin tratamientos
- **WHEN** el oncólogo marca «Sin tratamiento previo a la fecha» y pulsa «Guardar» sin tocar otro campo
- **THEN** `web` envía una única petición `POST /api/patients/{id}/clinical-attributes` válida contra el contrato
- **AND** no se muestra ningún error de régimen, línea, contexto ni fechas
- **AND** sin recargar, la fila «Tratamientos previos» deja de ser «Faltante»

#### Scenario: Los campos del tratamiento no se envían ni se validan al marcar la opción [AC-04.1]
- **GIVEN** el diálogo con régimen escrito y errores de validación visibles
- **WHEN** se marca la casilla
- **THEN** los campos desaparecen, los errores se limpian y el cuerpo no contiene `regimenName`, `setting` ni fechas de tratamiento

#### Scenario: Desmarcar restaura el formulario completo [AC-T1.1]
- **GIVEN** la casilla marcada
- **WHEN** se desmarca y se pulsa «Guardar» vacío
- **THEN** se exigen de nuevo régimen y contexto, y no se envía nada
- **AND** al alternar entre la declaración y el tratamiento se descartan los valores del otro modo: un régimen escrito antes de marcar no reaparece al desmarcar

#### Scenario: La fecha de la declaración no puede ser futura [AC-04.1]
- **WHEN** se marca la opción y se escribe una fecha posterior a hoy
- **THEN** el error aparece junto al campo y no se envía la petición

#### Scenario: Con tratamientos registrados la opción no aparece [RN-08]
- **GIVEN** un paciente con un tratamiento previo vigente
- **WHEN** se abre el diálogo
- **THEN** no existe la casilla

#### Scenario: Registrar un tratamiento con declaración vigente avisa del reemplazo [RN-08]
- **GIVEN** el paciente (g) con la declaración vigente
- **WHEN** se abre el diálogo
- **THEN** muestra «Sin tratamiento previo declarado el ‹fecha›» y, al registrar un tratamiento, advierte «Esto reemplazará la declaración “Sin tratamiento previo”» antes de guardar

#### Scenario: Teclado, foco y lenguaje [NFR-12] [RN-23]
- **WHEN** se opera el diálogo solo con teclado
- **THEN** la casilla es alcanzable y anuncia su estado, el foco vuelve al disparador al cerrar y los textos nuevos no contienen términos prohibidos
