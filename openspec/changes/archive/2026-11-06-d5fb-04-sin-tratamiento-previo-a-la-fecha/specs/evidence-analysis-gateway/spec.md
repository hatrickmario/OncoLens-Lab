## ADDED Requirements

### Requirement: La declaración de ausencia viaja al análisis desidentificada y no se lee como dato ausente
El gateway MUST incluir en el contexto desidentificado la declaración `sin_tratamiento_previo` como atributo con fecha relativa (sin identidad ni texto libre, RN-10, RN-11) y Backend 2 SHALL verbalizarla de forma determinista como «Sin tratamiento previo a la fecha» (ADR-34). Sin declaración y sin tratamientos, el hecho SHALL omitirse. La declaración NO SHALL ser citable ni soporte NLI como fuente del corpus (RN-24) y NO SHALL cambiar el estado de los criterios de aplicabilidad existentes.

#### Scenario: Contexto con declaración y sin tratamientos [RN-11] [ADR-34]
- **GIVEN** el paciente (g) con la declaración y `priorTreatments = []`
- **WHEN** se arma el contexto y se verbaliza el hecho
- **THEN** contiene el atributo con `monthsAgo` y la frase «Sin tratamiento previo a la fecha», sin `patientId` real ni fechas absolutas

#### Scenario: Sin declaración no hay frase [RN-02]
- **GIVEN** el mismo paciente sin declaración
- **WHEN** se verbaliza
- **THEN** no aparece la frase y no se afirma la ausencia de tratamientos

#### Scenario: La aplicabilidad no se infiere [RN-28]
- **GIVEN** la declaración y un estudio con criterio `linea_tratamiento`
- **WHEN** se calcula la aplicabilidad
- **THEN** el criterio queda en el estado que tendría sin la declaración
