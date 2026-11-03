## ADDED Requirements

### Requirement: La trayectoria del caso sale desidentificada
La descripción de cada evento, el esquema (`regimenName`, `setting`) de cada tratamiento previo y el valor de cada atributo MUST salir hacia `rag-orchestrator` enmascarados por el mismo `PiiDetector` que la pregunta (RN-11, ADR-40 opción A), conservando los términos clínicos. `events`, `priorTreatments` y `attributes` MUST NOT contener fechas absolutas; si la desidentificación no puede garantizarse, no sale nada (falla cerrada).

#### Scenario: La descripción de la toxicidad sale sin nombre ni documento y conserva el término clínico [US-093 AC-2] [RN-11] [AC-T4.3]
- **GIVEN** P-CASO (FX-02b-a) con su identidad sintética servida por el lector de identidad falso y el evento `toxicidad` cuya descripción contiene "Toxicidad cutánea grado 2" seguida de ese nombre y documento (armados en tiempo de test, no en la spec)
- **WHEN** se ejecuta un análisis y se captura el payload enviado a `rag-orchestrator`
- **THEN** el payload no contiene "Juan", "Pérez" ni "7654321"
- **AND** la descripción del evento conserva "Toxicidad cutánea grado 2" y lleva marcadores de enmascaramiento en lugar del nombre y del documento

#### Scenario: Un tratamiento previo con identidad en su esquema sale enmascarado [US-093 AC-2] [RN-11] (Decidido (usuario, 2026-11-03): la historia extiende el enmascaramiento al esquema de tratamientos, `[S5 resp. 13]`)
- **GIVEN** P-CASO más un `PriorTreatment` sintético cuyo `regimenName` contiene el documento de P-CASO junto a "Docetaxel"
- **WHEN** se captura el payload
- **THEN** el `regimenName` capturado no contiene el documento, lleva su marcador y conserva "Docetaxel"

#### Scenario: La trayectoria no lleva ninguna fecha absoluta [US-093 AC-4] [RN-11] [AC-T4.2]
- **GIVEN** el payload capturado de P-CASO del escenario de la trayectoria
- **WHEN** se busca una cadena `AAAA-MM-DD` en `events`, `priorTreatments` y `attributes`
- **THEN** no hay ninguna
- **AND** cada tiempo viaja como meses relativos (`monthsAgo`, `monthsSinceStart`, `monthsSinceEnd`) o `null`

Regresión [RN-11] activa desde Post-MVP (OCR, FEAT-01b): la misma regla con texto libre extraído de documentos y nombres sin identidad exacta (ADR-40, motor de nombres sin elegir).
