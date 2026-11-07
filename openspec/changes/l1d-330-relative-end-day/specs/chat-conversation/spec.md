## ADDED Requirements

### Requirement: Los hechos del caso informan el día relativo de fin de los tratamientos con intervalo
Al construir `caseFacts`, `clinical-api` MUST calcular `relativeEndDay` solo para los tratamientos previos, con el mismo
ancla (día 0 del diagnóstico) y la misma función que `relativeDay`: el entero de `endedAt` si existe; `null` explícito si
el tratamiento está en curso (`ongoing` sin `endedAt`); el campo ausente en cualquier otro caso (hecho puntual, fin
desconocido o sin fecha de diagnóstico). La fecha absoluta de fin MUST NOT salir de Backend 1 (RN-10, RN-11).

#### Scenario: Una quimioterapia con fin documentado viaja con su día relativo de fin [US-272 AC-1] [AC-02.1] [RN-11]
- **GIVEN** `P-CHAT` con una quimioterapia con `startedAt` 160 días antes del diagnóstico y `endedAt` 60 días antes, y MSW sobre `/chat/turn`
- **WHEN** el oncólogo pregunta «¿Qué ocurrió en los últimos 100 días?»
- **THEN** el cuerpo enviado a `/chat/turn` trae esa quimioterapia con `relativeDay = -160` y `relativeEndDay = -60`
- **AND** ninguna cadena del cuerpo, del estado del hilo ni de los *logs* contiene una fecha `AAAA-MM-DD` y `endedAt` no sale de `clinical-api`

#### Scenario: Un tratamiento en curso viaja con relativeEndDay null explícito [US-272 AC-2] [AC-02.1] (asumido: null = en curso solo con tratamiento activo)
- **GIVEN** un tratamiento previo con `ongoing = true` y sin `endedAt`, y MSW que captura el cuerpo enviado a `/chat/turn`
- **WHEN** se envía una pregunta cualquiera del chat
- **THEN** el JSON serializado del hecho contiene `"relativeEndDay":null` y no omite la propiedad

#### Scenario: Un tratamiento sin fin ni estado activo no informa relativeEndDay [US-272 AC-2] [AC-02.1]
- **GIVEN** un tratamiento previo con `ongoing = false` y sin `endedAt`, y un diagnóstico, una cirugía y un biomarcador
- **WHEN** se construyen los `caseFacts`
- **THEN** el hecho del tratamiento no tiene la propiedad `relativeEndDay` y los demás hechos tampoco la tienen

#### Scenario: Los campos nuevos del enlace no se persisten ni viajan [US-272 AC-3] [RN-11]
- **GIVEN** un turno con un tratamiento con `endedAt` y la tabla de enlaces `patient_data_links`
- **WHEN** se arma y se persiste el turno
- **THEN** ni `patient_data_links` ni el `ConversationDataLink` hacia el navegador contienen la fecha de fin ni `relativeEndDay`
